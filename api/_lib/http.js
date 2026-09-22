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
 * Coluna que o codigo usa e o banco nao tem.
 *
 * O MESMO problema de instalacao da tabela ausente, um passo adiante: a
 * tabela existe, a coluna que a versao nova acrescentou nao. A tela de
 * Maquinas quebrou inteira assim na v2.88.0 — o deploy subiu com
 * `nominal_ciclos_min` na consulta e `db/schema.sql` nunca foi aplicado. O
 * que o analista via era "Erro interno (PostgresError:42703)": nao diz que
 * o problema e' de instalacao, nem qual coluna, nem o que fazer.
 *
 * 42703 e' o SQLSTATE `undefined_column`. O Postgres nao entrega o nome em
 * campo proprio: ele sai da mensagem, que vem em DUAS formas —
 *   SELECT: `column m.nominal_ciclos_min does not exist` (com o apelido da
 *           tabela, sem aspas)
 *   INSERT/UPDATE: `column "nome" of relation "maquinas" does not exist`
 */
function colunaQueFalta(err) {
  if (err?.code !== '42703') return null;
  const achado = /column "?([\w.]+)"? (?:of relation "([^"]+)" )?does not exist/.exec(err.message || '');
  if (!achado) return 'desconhecida';
  const [, coluna, tabela] = achado;
  return tabela ? `${tabela}.${coluna}` : coluna;
}

/**
 * O que falta no banco, ja' com o artigo certo para a frase da tela.
 * Tabela e coluna sao a MESMA falha para quem le: deploy sem migracao.
 */
function faltaNoBanco(err) {
  const tabela = tabelaQueFalta(err);
  if (tabela) return { o: 'a tabela', nome: tabela };
  const coluna = colunaQueFalta(err);
  if (coluna) return { o: 'a coluna', nome: coluna };
  return null;
}

/**
 * Banco fora de alcance — e o que fazer a respeito.
 *
 * ECONNREFUSED aqui quase sempre significa UMA coisa: DATABASE_URL nao
 * chegou nesta funcao, e o driver caiu no padrao (localhost), onde nao ha
 * Postgres nenhum. Isso ja' apareceu como "Erro interno" sem pista, e o
 * proprio registro de erro no banco nao pode ajudar — ele tambem depende do
 * banco. Entao a mensagem precisa ser a pista.
 */
function bancoInalcancavel(err) {
  if (!['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(err?.code)) {
    return null;
  }
  if (!process.env.DATABASE_URL) {
    return 'O servidor esta sem DATABASE_URL: a variavel nao existe neste ambiente '
      + '(confira se ela cobre Production E Preview na Vercel) ou o deploy e anterior a ela. '
      + 'Configure e publique um deploy novo — variavel nao entra em deploy que ja existe.';
  }
  return 'O banco nao respondeu (conexao recusada). Confira se DATABASE_URL aponta para a '
    + 'Transaction Pooler do Supabase (porta 6543) e se o projeto esta ativo. Abra /api/status.';
}

/**
 * Caixa-preta: grava a falha no banco.
 *
 * O console da funcao serverless nao e' alcancavel de fora da Vercel, e
 * "Erro interno" na tela nao diz nada — o diagnostico virava adivinhacao.
 * Com isto, a falha fica onde quem mantem o sistema consegue ler.
 *
 * NUNCA pode derrubar a resposta: se o proprio log falhar (banco fora,
 * tabela ausente), o usuario ainda recebe o 500 dele.
 */
async function registrarErro(req, err) {
  try {
    const { sql } = await import('./db.js');
    await sql`
      INSERT INTO erros_api (rota, metodo, tipo, sqlstate, mensagem, versao)
      VALUES (${String(req?.url || '').split('?')[0].slice(0, 200)},
              ${req?.method ?? null},
              ${err?.constructor?.name ?? null},
              ${err?.code ?? null},
              ${String(err?.message ?? '').slice(0, 500)},
              ${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null})`;
  } catch { /* diagnostico nao pode custar a resposta */ }
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

      const semBanco = bancoInalcancavel(err);
      if (semBanco) {
        console.error('[ritmopatrimar] banco inalcancavel:', err.code);
        // 503, nao 500: o servico esta de pe', falta configuracao.
        json(res, 503, { erro: semBanco, codigo: err.code });
        return;
      }

      const falta = faltaNoBanco(err);
      if (falta) {
        console.error(`[ritmopatrimar] ${falta.o} ausente no banco: ${falta.nome}`);
        /**
         * Vai para a caixa-preta TAMBEM, nao so' para a tela.
         *
         * Foi `erros_api` que mostrou que a v2.88.0 estava quebrada em
         * producao ha' dias, e nao o print de quem esbarrou nela. Resposta
         * boa para o usuario nao substitui registro: sem a linha gravada,
         * uma migracao esquecida so' aparece quando alguem reclama.
         */
        await registrarErro(req, err);
        // 503, nao 500: o servico esta' de pe', falta um passo de instalacao.
        json(res, 503, {
          erro: `O banco ainda nao tem ${falta.o} "${falta.nome}". Rode `
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
      const codigo = [err?.constructor?.name, err?.code].filter(Boolean).join(':') || null;
      await registrarErro(req, err);
      json(res, 500, { erro: 'Erro interno', codigo });
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
