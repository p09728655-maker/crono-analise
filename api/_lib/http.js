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
export const naoEncontrado = (msg = 'Nao encontrado') => new ErroHttp(404, msg);

export function json(res, status, corpo) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(corpo));
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
      console.error('[ritmopatrimar] erro nao tratado:', err);
      json(res, 500, { erro: 'Erro interno' });
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
