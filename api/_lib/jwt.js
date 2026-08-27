/**
 * Verificacao local do token do Supabase Auth.
 *
 * O projeto assina os tokens de acesso com ES256 (chave assimetrica). A
 * parte PUBLICA da chave vive em /auth/v1/.well-known/jwks.json — entao a
 * verificacao acontece AQUI, com o crypto do proprio Node, sem chamada de
 * rede por requisicao e sem segredo compartilhado nenhum no servidor.
 *
 * So' algoritmo assimetrico e' aceito. HS256 e' recusado de proposito:
 * aceitar os dois abriria o classico rebaixamento de algoritmo, em que um
 * token forjado escolhe o algoritmo mais fraco na propria cabeca.
 */
import { createPublicKey, verify } from 'node:crypto';
import { naoAutorizado } from './http.js';
import { URL_SUPABASE } from './supabase.js';

const ALGORITMOS = {
  ES256: { hash: 'sha256', opcoes: { dsaEncoding: 'ieee-p1363' } },
  RS256: { hash: 'sha256', opcoes: {} },
};

/**
 * Cache do JWKS por instancia da funcao.
 *
 * A chave publica muda rarissimamente (rotacao manual no painel). Um `kid`
 * desconhecido forca uma rebusca — e' assim que a rotacao entra sem deploy —
 * mas no maximo uma vez por minuto, para um token forjado com kid aleatorio
 * nao virar um martelo de requisicoes contra o endpoint do JWKS.
 */
let chaves = new Map();
let buscadoEm = 0;

async function buscarJwks() {
  const resposta = await fetch(`${URL_SUPABASE}/auth/v1/.well-known/jwks.json`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!resposta.ok) throw new Error(`JWKS respondeu ${resposta.status}`);
  const { keys } = await resposta.json();
  chaves = new Map((keys || []).map((jwk) => [jwk.kid, jwk]));
  buscadoEm = Date.now();
}

async function chavePublica(kid) {
  if (!chaves.has(kid) && Date.now() - buscadoEm > 60_000) {
    await buscarJwks();
  }
  const jwk = chaves.get(kid);
  if (!jwk) throw naoAutorizado('Sessao invalida');
  return createPublicKey({ key: jwk, format: 'jwk' });
}

const decodificar = (parte) => {
  try {
    return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
  } catch {
    throw naoAutorizado('Sessao invalida');
  }
};

/**
 * Verifica o token e devolve as claims.
 *
 * As claims verificadas sao o que o resto da API conhece do usuario:
 * `sub` e' o id no auth.users — e, apos a migracao, o proprio id na tabela
 * usuarios. Elas tambem sao repassadas ao Postgres (request.jwt.claims)
 * para as politicas de RLS avaliarem a MESMA identidade que a API viu.
 */
export async function verificarToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw naoAutorizado('Sessao invalida');

  const cabecalho = decodificar(partes[0]);
  const algoritmo = ALGORITMOS[cabecalho.alg];
  if (!algoritmo || !cabecalho.kid) throw naoAutorizado('Sessao invalida');

  const chave = await chavePublica(cabecalho.kid);
  const valida = verify(
    algoritmo.hash,
    Buffer.from(`${partes[0]}.${partes[1]}`),
    { key: chave, ...algoritmo.opcoes },
    Buffer.from(partes[2], 'base64url'),
  );
  if (!valida) throw naoAutorizado('Sessao invalida');

  const claims = decodificar(partes[1]);
  const agora = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= agora) {
    throw naoAutorizado('Sessao expirada');
  }
  if (claims.iss !== `${URL_SUPABASE}/auth/v1`) throw naoAutorizado('Sessao invalida');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.role !== 'authenticated' || !aud.includes('authenticated')) {
    throw naoAutorizado('Sessao invalida');
  }

  return claims;
}

/** Para os testes: injeta um JWKS conhecido sem passar pela rede. */
export function _definirJwks(lista) {
  chaves = new Map((lista || []).map((jwk) => [jwk.kid, jwk]));
  buscadoEm = Date.now();
}
