/**
 * Verificacao do token do Supabase — sem rede e sem banco.
 *
 * A chave e' gerada aqui e entregue por _definirJwks: o que se prova e' a
 * checagem real de assinatura, validade, emissor e algoritmo. E' a porta
 * da API inteira; cada recusa daqui e' um caminho de invasao fechado.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.SUPABASE_URL = 'https://supabase.teste.local';

const par = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const intruso = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function token({ cabecalho = {}, claims = {}, chave = par.privateKey } = {}) {
  const cab = b64u({ alg: 'ES256', kid: 'kid-1', typ: 'JWT', ...cabecalho });
  const corpo = b64u({
    iss: 'https://supabase.teste.local/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
    sub: '11111111-1111-1111-1111-111111111111',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  });
  const ass = sign('sha256', Buffer.from(`${cab}.${corpo}`), { key: chave, dsaEncoding: 'ieee-p1363' });
  return `${cab}.${corpo}.${ass.toString('base64url')}`;
}

let verificarToken;

describe('verificarToken', () => {
  beforeAll(async () => {
    const mod = await import('../api/_lib/jwt.js');
    verificarToken = mod.verificarToken;
    mod._definirJwks([{ ...par.publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'ES256' }]);
  });

  it('aceita token valido e devolve as claims', async () => {
    const claims = await verificarToken(token());
    expect(claims.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(claims.role).toBe('authenticated');
  });

  it('recusa assinatura de outra chave', async () => {
    await expect(verificarToken(token({ chave: intruso.privateKey })))
      .rejects.toThrow(/Sessao invalida/);
  });

  it('recusa token vencido, com a mensagem que manda renovar', async () => {
    const vencido = token({ claims: { exp: Math.floor(Date.now() / 1000) - 5 } });
    await expect(verificarToken(vencido)).rejects.toThrow(/Sessao expirada/);
  });

  it('recusa rebaixamento de algoritmo: HS256 nem e considerado', async () => {
    // Um HS256 "assinado" com o conteudo do proprio JWKS e' o ataque
    // classico de confusao de algoritmo. Aqui morre no cabecalho.
    await expect(verificarToken(token({ cabecalho: { alg: 'HS256' } })))
      .rejects.toThrow(/Sessao invalida/);
  });

  it('recusa emissor de outro projeto', async () => {
    await expect(verificarToken(token({ claims: { iss: 'https://outro.supabase.co/auth/v1' } })))
      .rejects.toThrow(/Sessao invalida/);
  });

  it('recusa papel que nao e authenticated (anon, service_role)', async () => {
    await expect(verificarToken(token({ claims: { role: 'anon' } })))
      .rejects.toThrow(/Sessao invalida/);
  });

  it('recusa o que nem parece um JWT', async () => {
    await expect(verificarToken('token-de-servico-antigo')).rejects.toThrow(/Sessao invalida/);
    await expect(verificarToken('')).rejects.toThrow(/Sessao invalida/);
  });

  it('recusa kid desconhecido sem estourar', async () => {
    await expect(verificarToken(token({ cabecalho: { kid: 'kid-fantasma' } })))
      .rejects.toThrow(/Sessao invalida/);
  });
});
