/**
 * Resolucao automatica da empresa.
 *
 * EMPRESA_ID deixou de ser obrigatorio: com uma unica empresa no banco — o
 * caso normal de uma instalacao por fabrica — ela e' descoberta sozinha.
 * Estes testes fixam esse contrato e o comportamento nos casos ambiguos.
 */
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

process.env.SUPABASE_URL = 'https://supabase.teste.local';

const TOKEN = 'token-de-teste';
let sql;

/** Mesmo mecanismo dos demais testes: ES256 de verdade, chave nossa. */
const par = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenDe(usuarioId) {
  const cab = b64u({ alg: 'ES256', kid: 'kid-auth-teste', typ: 'JWT' });
  const corpo = b64u({
    iss: 'https://supabase.teste.local/auth/v1', aud: 'authenticated',
    role: 'authenticated', sub: usuarioId, exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const ass = sign('sha256', Buffer.from(`${cab}.${corpo}`),
    { key: par.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${cab}.${corpo}.${ass.toString('base64url')}`;
}

const req = (token = TOKEN) => ({ headers: { authorization: `Bearer ${token}` } });

/**
 * Reimporta auth.js do zero: o cache de empresa vive no escopo do modulo e
 * precisa ser descartado entre cenarios.
 */
async function autenticarLimpo() {
  vi.resetModules();
  const mod = await import('../api/_lib/auth.js');
  return mod.autenticar;
}

rodar('autenticacao e resolucao de empresa', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.API_TOKEN = TOKEN;
    ({ sql } = await import('../api/_lib/db.js'));
  });

  beforeEach(async () => {
    delete process.env.EMPRESA_ID;
    await sql`DELETE FROM empresas`;
  });

  afterAll(async () => {
    await sql`DELETE FROM empresas`;
    await sql.end();
  });

  it('rejeita token errado antes de tocar o banco', async () => {
    const autenticar = await autenticarLimpo();
    // Token que nao e' o de servico e' tratado como JWT do Supabase — e um
    // que nem tem cara de JWT cai na mesma recusa, sem consulta nenhuma.
    await expect(autenticar(req('errado'))).rejects.toThrow(/Sessao invalida/);
  });

  it('descobre a empresa sozinho quando existe apenas uma', async () => {
    await sql`INSERT INTO empresas (nome) VALUES ('Patrimar Moveis')`;
    const autenticar = await autenticarLimpo();
    const r = await autenticar(req());
    expect(r.empresaNome).toBe('Patrimar Moveis');
    expect(r.empresaId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('orienta o que fazer quando nao ha empresa nenhuma', async () => {
    const autenticar = await autenticarLimpo();
    await expect(autenticar(req())).rejects.toThrow(/Nenhuma empresa cadastrada/);
  });

  it('exige EMPRESA_ID quando ha mais de uma empresa', async () => {
    await sql`INSERT INTO empresas (nome) VALUES ('Patrimar'), ('Outra')`;
    const autenticar = await autenticarLimpo();
    await expect(autenticar(req())).rejects.toThrow(/mais de uma empresa/);
  });

  it('respeita EMPRESA_ID quando configurado, mesmo havendo varias', async () => {
    const [a] = await sql`INSERT INTO empresas (nome) VALUES ('Primeira') RETURNING id`;
    await sql`INSERT INTO empresas (nome) VALUES ('Segunda')`;
    process.env.EMPRESA_ID = a.id;
    const autenticar = await autenticarLimpo();
    expect((await autenticar(req())).empresaNome).toBe('Primeira');
  });

  it('avisa quando o EMPRESA_ID configurado nao existe', async () => {
    await sql`INSERT INTO empresas (nome) VALUES ('Patrimar')`;
    process.env.EMPRESA_ID = '00000000-0000-0000-0000-000000000000';
    const autenticar = await autenticarLimpo();
    await expect(autenticar(req())).rejects.toThrow(/nao existe no banco/);
  });

  /**
   * O estado de PRODUCAO depois da transicao: sem API_TOKEN nenhum.
   *
   * Ate' aqui todo teste rodava COM a variavel, entao o caminho que a
   * fabrica usa de verdade — so' JWT, sem token de servico — nao tinha
   * cobertura. Se algo dependesse do modo servico em silencio, so' se
   * descobriria em producao.
   */
  it('sem API_TOKEN o app segue inteiro: JWT entra, token de servico nao', async () => {
    const [empresa] = await sql`
      INSERT INTO empresas (nome) VALUES ('Patrimar Moveis') RETURNING id`;
    const id = randomUUID();
    await sql`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (${id}, 'authenticated', 'authenticated', 'sem-token@patrimar.com', '', now(), now(), '', '', '', '')`;
    await sql`
      INSERT INTO usuarios (id, empresa_id, nome, email, papel)
      VALUES (${id}, ${empresa.id}, 'Sem Token', 'sem-token@patrimar.com', 'admin')`;

    const guardado = process.env.API_TOKEN;
    delete process.env.API_TOKEN;
    try {
      vi.resetModules();
      const { autenticar } = await import('../api/_lib/auth.js');
      const { _definirJwks } = await import('../api/_lib/jwt.js');
      _definirJwks([{ ...par.publicKey.export({ format: 'jwk' }), kid: 'kid-auth-teste', alg: 'ES256' }]);

      // O JWT abre normalmente, com empresa e papel vindos do PERFIL.
      const r = await autenticar(req(tokenDe(id)));
      expect(r.modo).toBe('usuario');
      expect(r.papel).toBe('admin');
      expect(r.empresaId).toBe(empresa.id);

      // E o token de servico de ontem vira um JWT malformado: 401, nao passe.
      await expect(autenticar(req(TOKEN))).rejects.toThrow(/Sessao invalida/);
    } finally {
      process.env.API_TOKEN = guardado;
    }
  });
});

