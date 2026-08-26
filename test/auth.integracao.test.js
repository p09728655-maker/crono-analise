/**
 * Resolucao automatica da empresa.
 *
 * EMPRESA_ID deixou de ser obrigatorio: com uma unica empresa no banco — o
 * caso normal de uma instalacao por fabrica — ela e' descoberta sozinha.
 * Estes testes fixam esse contrato e o comportamento nos casos ambiguos.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

const TOKEN = 'token-de-teste';
let sql;

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
});
