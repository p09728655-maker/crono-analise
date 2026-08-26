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
 * Cache da empresa resolvida.
 *
 * Instancia serverless quente reaproveita o modulo entre requisicoes, entao
 * a consulta acontece uma vez por instancia, nao a cada chamada.
 */
let empresaCache = null;

/**
 * Resolve a empresa do ambiente.
 *
 * EMPRESA_ID e' OPCIONAL: quando o banco tem uma unica empresa — o caso
 * normal de uma instalacao por fabrica — ela e' descoberta sozinha. Isso
 * elimina uma variavel de ambiente que so' existia para ser digitada errada.
 *
 * Com mais de uma empresa a variavel passa a ser obrigatoria, porque ai' a
 * escolha e' ambigua e adivinhar seria pior que falhar.
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
 * Quem esta' pedindo — quando da' para saber.
 *
 * Devolve o usuario da sessao ou null. NUNCA recusa a requisicao: o token de
 * servico e' que autoriza, e o tablet nao tem sessao nenhuma. Isto existe
 * para carimbar autoria, nao para barrar ninguem — ver api/_lib/senha.js.
 */
export async function usuarioDaSessao(req, empresaId) {
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
    // Instalacao sem a tabela `sessoes` ainda: o app inteiro continua
    // funcionando sem identificacao, que e' exatamente como era antes.
    return null;
  }
}

export async function autenticar(req) {
  const esperado = process.env.API_TOKEN;
  if (!esperado) {
    console.error('[ritmopatrimar] API_TOKEN nao configurado — recusando tudo.');
    // A mensagem diz o que fazer, nao apenas o que falta: quem le esta
    // travado no painel da Vercel, nao lendo codigo.
    throw naoAutorizado(
      'Servidor sem API_TOKEN. Configure a variavel na Vercel e publique um '
      + 'deploy novo — variavel nao entra em deploy que ja existe. '
      + 'Abra /api/status para ver o que falta.',
    );
  }

  const token = tokenDaRequisicao(req);
  if (!token || !comparaSeguro(token, esperado)) throw naoAutorizado('Token invalido');

  return resolverEmpresa();
}
