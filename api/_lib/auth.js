/**
 * Autenticacao por token de servico.
 *
 * Deliberadamente simples: o app roda na rede da fabrica, com um numero
 * pequeno e conhecido de analistas. Nao ha cadastro publico nem senha para
 * vazar. Se no futuro houver acesso externo, trocar por OIDC/JWT aqui — o
 * resto da API so' depende do objeto devolvido por autenticar().
 */
import { naoAutorizado } from './http.js';
import { sql } from './db.js';

function tokenDaRequisicao(req) {
  const header = req.headers?.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Comparacao em tempo constante para nao permitir descobrir o token
 * caractere a caractere medindo o tempo de resposta.
 */
function comparaSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function autenticar(req) {
  const esperado = process.env.API_TOKEN;
  if (!esperado) {
    console.error('[ritmoprod] API_TOKEN nao configurado — recusando tudo.');
    throw naoAutorizado('Servidor sem API_TOKEN configurado');
  }

  const token = tokenDaRequisicao(req);
  if (!token || !comparaSeguro(token, esperado)) throw naoAutorizado('Token invalido');

  const empresaId = process.env.EMPRESA_ID;
  if (!empresaId) throw naoAutorizado('Servidor sem EMPRESA_ID configurado');

  const [empresa] = await sql`SELECT id, nome FROM empresas WHERE id = ${empresaId}`;
  if (!empresa) throw naoAutorizado('Empresa nao encontrada');

  return { empresaId: empresa.id, empresaNome: empresa.nome };
}
