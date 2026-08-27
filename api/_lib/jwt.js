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
 * A chave publica do projeto, EMBUTIDA.
 *
 * E' material publico por definicao (qualquer um a le no
 * /auth/v1/.well-known/jwks.json) e muda rarissimamente — so' em rotacao
 * manual no painel. Embutir a chave tira a REDE do caminho critico: sem
 * isso, a primeira requisicao de cada instancia da funcao dependia de um
 * fetch ao Supabase, e qualquer soluco nessa busca derrubava TODA a
 * autenticacao com um "Erro interno" que nao dizia nada.
 *
 * A rotacao continua entrando sozinha: um `kid` desconhecido dispara a
 * rebusca pela rede (no maximo uma vez por minuto, para kid forjado nao
 * virar martelo contra o endpoint).
 */
const JWKS_EMBUTIDO = [{
  kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig',
  kid: '39ba9eb6-872d-4073-b7d9-445a432833bf',
  x: 'tpzGhgckUgfjodS69ytwr1BbonHTWo5YQg849O0YoWM',
  y: 'ZFltVAbWUvss3DflAnSAcsNstA_NAua-cOTgUBnRQIk',
}];

let chaves = new Map(JWKS_EMBUTIDO.map((jwk) => [jwk.kid, jwk]));
let buscadoEm = 0;

export async function buscarJwks() {
  const resposta = await fetch(`${URL_SUPABASE}/auth/v1/.well-known/jwks.json`, {
    // Node sem AbortSignal.timeout segue sem prazo — melhor lento que morto.
    signal: AbortSignal.timeout?.(5000),
  });
  if (!resposta.ok) throw new Error(`JWKS respondeu ${resposta.status}`);
  const { keys } = await resposta.json();
  // As embutidas ficam: rotacao com JANELA (chave nova assinando antes de a
  // antiga sumir do endpoint) nao pode invalidar token recem-emitido.
  for (const jwk of keys || []) chaves.set(jwk.kid, jwk);
  buscadoEm = Date.now();
  return (keys || []).length;
}

async function chavePublica(kid) {
  if (!chaves.has(kid) && Date.now() - buscadoEm > 60_000) {
    try {
      await buscarJwks();
    } catch {
      // Sem rede ate' o Supabase, um kid desconhecido e' indistinguivel de
      // token forjado: recusa como 401, nunca como erro interno.
    }
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
