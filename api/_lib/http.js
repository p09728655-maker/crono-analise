/** Helpers de resposta HTTP e tratamento de erro para as funcoes serverless. */

export class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export const erroValidacao = (msg, detalhes) => new ErroHttp(400, msg, detalhes);
export const naoAutorizado = (msg = 'Nao autorizado') => new ErroHttp(401, msg);
// 403 e' "sei quem voce e', e nao pode" — diferente do 401, que e' "entre".
export const proibido = (msg = 'Sem permissao') => new ErroHttp(403, msg);
export const naoEncontrado = (msg = 'Nao encontrado') => new ErroHttp(404, msg);

export function json(res, status, corpo) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(corpo));
}

/**
 * Tabela que o codigo usa e o banco nao tem.
 *
 * E' o que acontece quando um deploy sobe antes de `db/schema.sql` ser
 * aplicado — e o usuario recebia "Erro interno", que nao diz nem que o
 * problema e' de instalacao nem o que fazer. Quem le esta' diante de uma
 * tela quebrada em producao, nao lendo codigo: a mensagem precisa nomear a
 * tabela e o comando.
 *
 * 42P01 e' o SQLSTATE `undefined_table`. O nome da tabela sai da mensagem
 * do Postgres ('relation "motivos_parada" does not exist') porque o driver
 * nao o entrega em campo proprio nesse erro.
 */
function tabelaQueFalta(err) {
  if (err?.code !== '42P01') return null;
  return /relation "([^"]+)" does not exist/.exec(err.message || '')?.[1] || 'desconhecida';
}

/**
 * Envolve um handler: normaliza erro, evita vazar stack para o cliente e
 * garante que toda falha inesperada vire 500 com log no servidor.
 */
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ErroHttp) {
        json(res, err.status, { erro: err.message, detalhes: err.detalhes });
        return;
      }

      const tabela = tabelaQueFalta(err);
      if (tabela) {
        console.error(`[ritmopatrimar] tabela ausente no banco: ${tabela}`);
        // 503, nao 500: o servico esta' de pe', falta um passo de instalacao.
        json(res, 503, {
          erro: `O banco ainda nao tem a tabela "${tabela}". Rode `
            + '`psql "$DATABASE_URL" -f db/schema.sql` no banco desta instalacao — '
            + 'o arquivo e idempotente, entao roda-lo de novo e a migracao. '
            + 'O resto do app continua funcionando.',
        });
        return;
      }

      console.error('[ritmopatrimar] erro nao tratado:', err);
      // "Erro interno" seco ja' custou uma manha de diagnostico as cegas.
      // O TIPO do erro e o SQLSTATE nao carregam segredo nenhum (mensagem e
      // stack continuam so' no log) e apontam a classe do problema na hora.
      json(res, 500, {
        erro: 'Erro interno',
        codigo: [err?.constructor?.name, err?.code].filter(Boolean).join(':') || null,
      });
    }
  };
}

/** Restringe o handler aos metodos suportados. */
export function permitir(req, metodos) {
  if (!metodos.includes(req.method)) {
    throw new ErroHttp(405, `Metodo ${req.method} nao permitido`);
  }
}

/** Body ja vem parseado na Vercel; este fallback cobre execucao local. */
export async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { throw erroValidacao('JSON invalido'); }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw erroValidacao('JSON invalido'); }
}
