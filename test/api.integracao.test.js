/**
 * Teste de integracao da API contra um Postgres real.
 *
 * Vale mais que mock: o que precisa ser provado aqui e' exatamente o
 * comportamento do banco — idempotencia do reenvio, atomicidade do lote e
 * isolamento entre empresas. Mock nao prova nada disso.
 *
 * Pula automaticamente se TEST_DATABASE_URL nao estiver definida.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

let sql, sync, estudos, operacoes;
const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '99999999-9999-9999-9999-999999999999';
const TOKEN = 'token-de-teste';

/** Simula req/res da Vercel. */
function fingirReq({ metodo = 'GET', corpo, query = {}, token = TOKEN } = {}) {
  return { method: metodo, body: corpo, query, headers: { authorization: `Bearer ${token}` } };
}

function fingirRes() {
  const res = {
    statusCode: 0, corpo: null, cabecalhos: {},
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.cabecalhos[k] = v; return this; },
    end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
  };
  return res;
}

rodar('API — integracao com Postgres', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.API_TOKEN = TOKEN;
    process.env.EMPRESA_ID = EMPRESA;

    ({ sql } = await import('../api/_lib/db.js'));
    sync = (await import('../api/sync.js')).default;
    estudos = (await import('../api/estudos.js')).default;
    operacoes = (await import('../api/operacoes.js')).default;

    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA_EMPRESA})`;
    await sql`INSERT INTO empresas (id, nome) VALUES (${EMPRESA}, 'Patrimar Teste')`;
    await sql`INSERT INTO empresas (id, nome) VALUES (${OUTRA_EMPRESA}, 'Concorrente')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA_EMPRESA})`;
    await sql.end();
  });

  async function criarEstudoComOperacao(empresaId = EMPRESA) {
    const [e] = await sql`
      INSERT INTO estudos (empresa_id, nome, recurso, tolerancia_pct, meta_obs)
      VALUES (${empresaId}, 'Furacao lateral', 'Furadeira 03', 15, 12) RETURNING id`;
    const [o] = await sql`
      INSERT INTO operacoes (estudo_id, nome, fr_pct)
      VALUES (${e.id}, 'Furar lateral', 100) RETURNING id`;
    return { estudoId: e.id, operacaoId: o.id };
  }

  const ciclo = (operacaoId, clientId, duracaoMs = 9800) => ({
    clientId, operacaoId, duracaoMs, rodada: 1, coletadoEm: new Date().toISOString(),
  });

  it('rejeita requisicao sem token valido', async () => {
    const res = fingirRes();
    await estudos(fingirReq({ token: 'errado' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('grava um lote de ciclos', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID()), ciclo(operacaoId, crypto.randomUUID())] },
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo.novos).toBe(2);
  });

  it('REENVIO do mesmo lote nao duplica ciclo', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    const corpo = { observacoes: [ciclo(operacaoId, id1), ciclo(operacaoId, id2)] };

    const r1 = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), r1);
    const r2 = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), r2);
    const r3 = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), r3);

    expect(r1.corpo.novos).toBe(2);
    expect(r2.corpo.novos).toBe(0);
    expect(r2.corpo.duplicadosIgnorados).toBe(2);

    const linhas = await sql`SELECT count(*)::int AS n FROM observacoes WHERE operacao_id = ${operacaoId}`;
    expect(linhas[0].n).toBe(2);
  });

  it('devolve TODOS os clientIds recebidos, para o app limpar a fila', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const id = crypto.randomUUID();
    const corpo = { observacoes: [ciclo(operacaoId, id)] };

    await sync(fingirReq({ metodo: 'POST', corpo }), fingirRes());
    const res = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), res);

    // Mesmo sem inserir nada, o id volta confirmado — senao a fila local
    // ficaria presa reenviando o mesmo ciclo para sempre.
    expect(res.corpo.novos).toBe(0);
    expect(res.corpo.clientIds).toContain(id);
  });

  it('bloqueia escrita em operacao de OUTRA empresa', async () => {
    const alheia = await criarEstudoComOperacao(OUTRA_EMPRESA);
    const res = fingirRes();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(alheia.operacaoId, crypto.randomUUID())] },
    }), res);

    expect(res.statusCode).toBe(404);
    const linhas = await sql`SELECT count(*)::int AS n FROM observacoes WHERE operacao_id = ${alheia.operacaoId}`;
    expect(linhas[0].n).toBe(0);
  });

  it('o lote e ATOMICO: um item invalido nao grava os demais', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const bom = crypto.randomUUID();
    const res = fingirRes();

    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        observacoes: [
          ciclo(operacaoId, bom),
          ciclo(operacaoId, crypto.randomUUID(), 0), // duracao invalida
        ],
      },
    }), res);

    expect(res.statusCode).toBe(400);
    const linhas = await sql`SELECT count(*)::int AS n FROM observacoes WHERE client_id = ${bom}`;
    expect(linhas[0].n).toBe(0);
  });

  it('valida duracao negativa antes de tocar o banco', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID(), -500)] },
    }), res);
    expect(res.statusCode).toBe(400);
  });

  it('lote vazio nao e erro', async () => {
    const res = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo: { observacoes: [], paradas: [] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.corpo.novos).toBeUndefined();
  });

  it('grava paradas junto com ciclos', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        observacoes: [ciclo(operacaoId, crypto.randomUUID())],
        paradas: [{
          clientId: crypto.randomUUID(), operacaoId, motivo: 'Troca de broca / ferramenta',
          duracaoMs: 45000, iniciadoEm: new Date().toISOString(),
        }],
      },
    }), res);
    expect(res.corpo.novos).toBe(2);
  });

  it('estudo carregado devolve tempos no formato do dominio', async () => {
    const { estudoId, operacaoId } = await criarEstudoComOperacao();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        observacoes: [
          ciclo(operacaoId, crypto.randomUUID(), 10000),
          ciclo(operacaoId, crypto.randomUUID(), 10400),
        ],
      },
    }), fingirRes());

    const res = fingirRes();
    await estudos(fingirReq({ query: { id: estudoId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo.operacoes[0].tempos).toEqual([10000, 10400]);
  });

  it('nao entrega estudo de outra empresa', async () => {
    const alheia = await criarEstudoComOperacao(OUTRA_EMPRESA);
    const res = fingirRes();
    await estudos(fingirReq({ query: { id: alheia.estudoId } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('DELETE arquiva em vez de apagar o dado', async () => {
    const { estudoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), res);

    expect(res.statusCode).toBe(200);
    const linhas = await sql`SELECT status FROM estudos WHERE id = ${estudoId}`;
    expect(linhas[0].status).toBe('arquivado');
  });

  it('rejeita FR fora da faixa com 400, nao 500', async () => {
    const { estudoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await operacoes(fingirReq({ metodo: 'POST', corpo: { estudoId, nome: 'X', frPct: 500 } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('recusa lote acima do limite de itens', async () => {
    const { operacaoId } = await criarEstudoComOperacao();
    const muitos = Array.from({ length: 501 }, () => ciclo(operacaoId, crypto.randomUUID()));
    const res = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo: { observacoes: muitos } }), res);
    expect(res.statusCode).toBe(400);
  });
});
