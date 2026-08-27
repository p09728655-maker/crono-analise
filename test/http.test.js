/**
 * O que a API responde quando algo dá errado.
 *
 * "Erro interno" e' o pior desfecho possivel para quem esta' diante de uma
 * tela quebrada em producao: nao diz o que aconteceu nem o que fazer. Este
 * teste guarda o caso que de fato acontece — deploy que sobe antes de
 * `db/schema.sql` ser aplicado.
 */
import { describe, expect, it } from 'vitest';
import { ErroHttp, handler } from '../api/_lib/http.js';

function fingirRes() {
  return {
    statusCode: 0, corpo: null,
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
  };
}

/** Como o driver `postgres` entrega um undefined_table. */
function erroDeTabelaAusente(tabela) {
  const err = new Error(`relation "${tabela}" does not exist`);
  err.code = '42P01';
  return err;
}

describe('handler', () => {
  it('tabela ausente vira 503 nomeando a tabela e o comando', async () => {
    const res = fingirRes();
    await handler(async () => { throw erroDeTabelaAusente('motivos_parada'); })({}, res);

    // 503, nao 500: o servico esta de pe, falta um passo de instalacao.
    expect(res.statusCode).toBe(503);
    expect(res.corpo.erro).toContain('motivos_parada');
    expect(res.corpo.erro).toContain('db/schema.sql');
  });

  it('erro de verdade continua sendo 500 sem vazar detalhe', async () => {
    const res = fingirRes();
    await handler(async () => { throw new Error('senha=hunter2 no stack'); })({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.corpo.erro).toBe('Erro interno');
    expect(JSON.stringify(res.corpo)).not.toContain('hunter2');
  });

  it('ErroHttp passa com o proprio status e a propria mensagem', async () => {
    const res = fingirRes();
    await handler(async () => { throw new ErroHttp(409, 'Ja existe'); })({}, res);

    expect(res.statusCode).toBe(409);
    expect(res.corpo.erro).toBe('Ja existe');
  });

  /**
   * O caso que quebrou o login em producao: DATABASE_URL nao chegou na
   * funcao, o driver caiu em localhost e toda consulta morreu com
   * ECONNREFUSED — que a tela mostrava como "Erro interno", sem pista.
   */
  it('banco inalcancavel vira 503 dizendo o que configurar', async () => {
    const guardado = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const res = fingirRes();
      const erro = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
      await handler(async () => { throw erro; })({ method: 'GET' }, res);
      expect(res.statusCode).toBe(503);
      expect(res.corpo.erro).toMatch(/DATABASE_URL/);
      expect(res.corpo.erro).toMatch(/deploy novo/);
      expect(res.corpo.codigo).toBe('ECONNREFUSED');
    } finally {
      if (guardado) process.env.DATABASE_URL = guardado;
    }
  });

  it('com DATABASE_URL presente, a recusa aponta o pooler e o /api/status', async () => {
    const guardado = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://alguem@host:6543/postgres';
    try {
      const res = fingirRes();
      const erro = Object.assign(new Error('recusou'), { code: 'ECONNREFUSED' });
      await handler(async () => { throw erro; })({ method: 'GET' }, res);
      expect(res.statusCode).toBe(503);
      expect(res.corpo.erro).toMatch(/6543/);
      expect(res.corpo.erro).toMatch(/api\/status/);
    } finally {
      if (guardado) process.env.DATABASE_URL = guardado; else delete process.env.DATABASE_URL;
    }
  });
});

