/**
 * Autenticacao: Supabase Auth como fonte oficial de identidade.
 *
 * O caminho normal e' um JWT do Supabase no Authorization — do analista que
 * entrou no PC com e-mail e senha, ou do tablet pareado como aparelho
 * coletor. O token e' verificado localmente (api/_lib/jwt.js) e as MESMAS
 * claims vao para o Postgres via rls(), onde as politicas de RLS avaliam a
 * identidade de novo. A API filtra por empresa E o banco filtra por
 * empresa: duas camadas, de proposito.
 *
 * TRANSICAO — o token de servico antigo (API_TOKEN) continua aceito
 * ENQUANTO a variavel existir na Vercel, porque tablet com bundle antigo em
 * cache ainda fala por ele. Nesse modo nada muda: papel `postgres`, RLS
 * ignorada, filtro so' na aplicacao — como sempre foi. Apagar API_TOKEN e
 * VITE_API_TOKEN do ambiente e' o interruptor que encerra a transicao;
 * nenhum deploy novo embute mais esse token.
 */
import { naoAutorizado, proibido } from './http.js';
import { comRls, sql } from './db.js';
import { verificarToken } from './jwt.js';
import { hashDoToken } from './senha.js';

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

/**
 * Cache da empresa resolvida (so' o modo de servico usa).
 *
 * Instancia serverless quente reaproveita o modulo entre requisicoes, entao
 * a consulta acontece uma vez por instancia, nao a cada chamada.
 */
let empresaCache = null;

/**
 * Resolve a empresa do ambiente — caminho do token de servico, onde nao ha'
 * usuario para dizer a qual empresa pertence.
 *
 * EMPRESA_ID e' OPCIONAL: com uma unica empresa no banco — o caso normal de
 * uma instalacao por fabrica — ela e' descoberta sozinha. Com mais de uma, a
 * variavel vira obrigatoria: adivinhar seria pior que falhar.
 */
async function resolverEmpresa() {
  if (empresaCache) return empresaCache;

  const configurada = process.env.EMPRESA_ID;

  if (configurada) {
    const [empresa] = await sql`SELECT id, nome FROM empresas WHERE id = ${configurada}`;
    if (!empresa) throw naoAutorizado('EMPRESA_ID configurado nao existe no banco');
    empresaCache = { empresaId: empresa.id, empresaNome: empresa.nome };
    return empresaCache;
  }

  const empresas = await sql`SELECT id, nome FROM empresas ORDER BY criado_em LIMIT 2`;

  if (empresas.length === 0) {
    throw naoAutorizado(
      'Nenhuma empresa cadastrada. Rode: INSERT INTO empresas (nome) VALUES (\'Sua Empresa\');',
    );
  }
  if (empresas.length > 1) {
    throw naoAutorizado('Ha mais de uma empresa no banco: configure EMPRESA_ID');
  }

  empresaCache = { empresaId: empresas[0].id, empresaNome: empresas[0].nome };
  return empresaCache;
}

/**
 * Identidade do bundle antigo: sessao propria via X-Sessao.
 *
 * So' o modo de servico ainda passa por aqui, e so' ate a tabela `sessoes`
 * cair na fase final da migracao — o try/catch ja' cobre esse dia.
 */
async function usuarioDaSessaoAntiga(req, empresaId) {
  const bruto = req.headers?.['x-sessao'];
  const token = Array.isArray(bruto) ? bruto[0] : bruto;
  if (!token || typeof token !== 'string' || token.length > 200) return null;

  try {
    const [linha] = await sql`
      SELECT u.id, u.nome, u.email, u.papel
        FROM sessoes s
        JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ${hashDoToken(token)}
         AND s.expira_em > now()
         AND u.ativo
         AND u.empresa_id = ${empresaId}`;
    return linha || null;
  } catch {
    return null;
  }
}

/**
 * Autentica a requisicao e devolve com quem a API esta falando.
 *
 *   modo      'usuario' (JWT do Supabase) ou 'servico' (token de transicao)
 *   empresaId a empresa de quem chama — TODO filtro de consulta usa isto
 *   usuario   {id, nome, email, papel} — no modo servico, o da sessao
 *             antiga quando ha' uma; pode ser null
 *   papel     o papel do usuario, ou 'servico'
 *   rls(fn)   executa fn(tx) dentro da RLS como este usuario; no modo de
 *             servico executa direto, sem RLS — o comportamento antigo
 */
export async function autenticar(req) {
  const token = tokenDaRequisicao(req);
  if (!token) throw naoAutorizado('Entre no sistema para continuar');

  const servico = process.env.API_TOKEN;
  if (servico && comparaSeguro(token, servico)) {
    const { empresaId, empresaNome } = await resolverEmpresa();
    const usuario = await usuarioDaSessaoAntiga(req, empresaId);
    return {
      modo: 'servico',
      empresaId,
      empresaNome,
      usuario,
      papel: 'servico',
      rls: (fn) => fn(sql),
    };
  }

  const claims = await verificarToken(token);

  // O perfil e' quem diz a empresa e o papel. Sem perfil, sem entrada:
  // um token anonimo do Supabase, por exemplo, nao abre nada aqui.
  const [usuario] = await sql`
    SELECT id, nome, email, papel, ativo, empresa_id
      FROM usuarios WHERE id = ${claims.sub}`;
  if (!usuario || !usuario.ativo) {
    throw naoAutorizado('Acesso revogado ou conta ainda nao cadastrada neste sistema');
  }

  return {
    modo: 'usuario',
    empresaId: usuario.empresa_id,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    papel: usuario.papel,
    rls: (fn) => comRls(claims, fn),
  };
}

/**
 * Barreira de papel na APLICACAO — espelho das politicas de RLS.
 *
 * O banco ja' barra; isto existe para a recusa virar uma mensagem que diz o
 * porque, em vez de um "0 linhas afetadas" silencioso. O modo de servico
 * passa direto: e' o comportamento do token antigo durante a transicao.
 */
export function exigirPapel(auth, papeis, mensagem) {
  if (auth.modo === 'servico') return;
  if (!papeis.includes(auth.papel)) {
    throw proibido(mensagem || 'Seu papel nao permite esta operacao');
  }
}
