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

let sql, sync, estudos, operacoes, config, conferenciasApi;
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
    config = (await import('../api/config.js')).default;
    conferenciasApi = (await import('../api/conferencias.js')).default;
    // O teste cobre o caminho SEM chave no ambiente (a do banco).
    delete process.env.ANTHROPIC_API_KEY;

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

  it('conferencia rapida grava pelo sync, sem estudo, e reenvio nao duplica', async () => {
    const clientId = crypto.randomUUID();
    const corpo = {
      conferencias: [{
        clientId, maquina: 'Furadeira 03', peca: 'Lateral Mesa Sleep',
        horaInicial: '07:00', horaFinal: '07:10',
        duracaoMs: 600000, pecas: 150, salvoEm: new Date().toISOString(),
      }],
    };

    const r1 = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), r1);
    const r2 = fingirRes();
    await sync(fingirReq({ metodo: 'POST', corpo }), r2);

    expect(r1.corpo.novos).toBe(1);
    expect(r2.corpo.novos).toBe(0);
    expect(r2.corpo.clientIds).toContain(clientId); // confirmada: o app limpa a fila

    const [linha] = await sql`SELECT * FROM conferencias WHERE client_id = ${clientId}`;
    expect(linha.empresa_id).toBe(EMPRESA);
    expect(linha.maquina).toBe('Furadeira 03');
    expect(Number(linha.duracao_ms)).toBe(600000);
  });

  it('conferencia com horario invalido leva 400 antes de tocar o banco', async () => {
    const res = fingirRes();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId: crypto.randomUUID(), horaInicial: '25:00',
          duracaoMs: 600000, pecas: 150,
        }],
      },
    }), res);
    expect(res.statusCode).toBe(400);
  });

  it('GET /conferencias lista da empresa autenticada, mais recente primeiro', async () => {
    await sql`DELETE FROM conferencias WHERE empresa_id IN (${EMPRESA}, ${OUTRA_EMPRESA})`;
    const antiga = new Date(Date.now() - 3600_000).toISOString();
    const recente = new Date().toISOString();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [
          { clientId: crypto.randomUUID(), maquina: 'Furadeira 03', duracaoMs: 600000, pecas: 150, salvoEm: antiga },
          { clientId: crypto.randomUUID(), maquina: 'Seccionadora', duracaoMs: 300000, pecas: 40, salvoEm: recente },
        ],
      },
    }), fingirRes());
    // Conferencia de outra empresa nao pode vazar para o relatorio.
    await sql`
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas, salvo_em)
      VALUES (${crypto.randomUUID()}, ${OUTRA_EMPRESA}, 'Alheia', 60000, 10, now())`;

    const res = fingirRes();
    await conferenciasApi(fingirReq({}), res);
    expect(res.statusCode).toBe(200);
    expect(res.corpo.conferencias.length).toBe(2);
    expect(res.corpo.conferencias[0].maquina).toBe('Seccionadora');
    expect(res.corpo.conferencias.map((c) => c.maquina)).not.toContain('Alheia');

    const filtrada = fingirRes();
    await conferenciasApi(fingirReq({ query: { maquina: 'Furadeira 03' } }), filtrada);
    expect(filtrada.corpo.conferencias.length).toBe(1);
  });

  it('conferencia arquiva, sai da lista ativa, volta na de arquivadas e exclui', async () => {
    await sql`DELETE FROM conferencias WHERE empresa_id = ${EMPRESA}`;
    const clientId = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina: 'Furadeira 03', duracaoMs: 600000, pecas: 150,
          salvoEm: new Date().toISOString(),
        }],
      },
    }), fingirRes());
    const [criada] = await sql`SELECT id FROM conferencias WHERE client_id = ${clientId}`;

    // Arquivar: sai dos calculos, continua no banco.
    const patch = fingirRes();
    await conferenciasApi(fingirReq({ metodo: 'PATCH', query: { id: criada.id }, corpo: { arquivada: true } }), patch);
    expect(patch.corpo.conferencia.arquivada).toBe(true);

    const ativas = fingirRes();
    await conferenciasApi(fingirReq({}), ativas);
    expect(ativas.corpo.conferencias.some((c) => c.id === criada.id)).toBe(false);
    expect(ativas.corpo.outras).toBe(1); // a tela sabe que ha' arquivada

    const arquivadas = fingirRes();
    await conferenciasApi(fingirReq({ query: { arquivadas: '1' } }), arquivadas);
    expect(arquivadas.corpo.conferencias.map((c) => c.id)).toContain(criada.id);

    // Excluir: ai sim some de vez.
    const del = fingirRes();
    await conferenciasApi(fingirReq({ metodo: 'DELETE', query: { id: criada.id } }), del);
    expect(del.corpo.acao).toBe('excluida');
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM conferencias WHERE id = ${criada.id}`;
    expect(n).toBe(0);
  });

  it('paradas sobem junto com a conferencia e voltam na leitura', async () => {
    const clientId = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina: 'Furadeira 16', duracaoMs: 1_800_000, pecas: 100,
          paradas: [
            { motivo: 'setup', duracaoMs: 600_000, observacao: 'troca de gabarito' },
            { motivo: 'falta_material', duracaoMs: 120_000 },
          ],
          salvoEm: new Date().toISOString(),
        }],
      },
    }), fingirRes());

    const [linha] = await sql`SELECT paradas FROM conferencias WHERE client_id = ${clientId}`;
    expect(linha.paradas.length).toBe(2);
    expect(linha.paradas[0]).toEqual({ motivo: 'setup', duracaoMs: 600_000, observacao: 'troca de gabarito' });
    expect(linha.paradas[1].observacao).toBeNull();
  });

  it('conferencia antiga, sem o campo, entra com lista vazia — nao quebra o relatorio', async () => {
    const clientId = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina: 'Furadeira 03', duracaoMs: 600_000, pecas: 150,
          salvoEm: new Date().toISOString(),
        }],
      },
    }), fingirRes());
    const [linha] = await sql`SELECT paradas FROM conferencias WHERE client_id = ${clientId}`;
    expect(linha.paradas).toEqual([]);
  });

  it('PATCH cadastra paradas no PC, e recusa quando elas comem o periodo inteiro', async () => {
    const clientId = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina: 'Furadeira 16', duracaoMs: 1_800_000, pecas: 100,
          salvoEm: new Date().toISOString(),
        }],
      },
    }), fingirRes());
    const [criada] = await sql`SELECT id FROM conferencias WHERE client_id = ${clientId}`;

    const ok = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', query: { id: criada.id },
      corpo: { paradas: [{ motivo: 'setup', duracaoMs: 600_000 }] },
    }), ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.corpo.conferencia.paradas).toEqual([{ motivo: 'setup', duracaoMs: 600_000, observacao: null }]);
    // Arquivamento nao foi tocado: o PATCH so' mexe no que veio no corpo.
    expect(ok.corpo.conferencia.arquivada).toBe(false);

    // Sem tempo de maquina rodando nao ha ritmo: 400, e o dado anterior fica.
    const demais = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', query: { id: criada.id },
      corpo: { paradas: [{ motivo: 'manutencao', duracaoMs: 1_800_000 }] },
    }), demais);
    expect(demais.statusCode).toBe(400);
    const [depois] = await sql`SELECT paradas FROM conferencias WHERE id = ${criada.id}`;
    expect(depois.paradas[0].motivo).toBe('setup');

    // Lista vazia limpa as paradas — e' assim que se corrige um engano.
    const limpa = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', query: { id: criada.id }, corpo: { paradas: [] },
    }), limpa);
    expect(limpa.corpo.conferencia.paradas).toEqual([]);
  });

  it('nao arquiva nem exclui conferencia de OUTRA empresa', async () => {
    const alheia = crypto.randomUUID();
    await sql`
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas, salvo_em)
      VALUES (${alheia}, ${OUTRA_EMPRESA}, 'Alheia', 60000, 10, now())`;
    const [linha] = await sql`SELECT id FROM conferencias WHERE client_id = ${alheia}`;

    const patch = fingirRes();
    await conferenciasApi(fingirReq({ metodo: 'PATCH', query: { id: linha.id }, corpo: { arquivada: true } }), patch);
    expect(patch.statusCode).toBe(404);

    const del = fingirRes();
    await conferenciasApi(fingirReq({ metodo: 'DELETE', query: { id: linha.id } }), del);
    expect(del.statusCode).toBe(404);

    const [{ n }] = await sql`SELECT count(*)::int AS n FROM conferencias WHERE id = ${linha.id}`;
    expect(n).toBe(1); // continua intacta
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

  it('POST cria estudo com operacoes aninhadas em uma transacao — importacao do ERP', async () => {
    const res = fingirRes();
    await estudos(fingirReq({
      metodo: 'POST',
      corpo: {
        nome: 'MESA CABECEIRA SLEEP BRANCO — FUR16',
        produto: 'MESA CABECEIRA SLEEP BRANCO',
        recurso: 'FUR16',
        operacoes: [
          { nome: 'SLEEP BASE 380X330X15 MDP 1 BCO', ciclosPorPeca: 1, ordem: 0 },
          { nome: 'SLEEP LAT DIR/ESQ 328X215X15 MDP 2 BCO', ciclosPorPeca: 2, ordem: 1 },
        ],
      },
    }), res);

    expect(res.statusCode).toBe(201);
    expect(res.corpo.operacoes).toHaveLength(2);
    expect(res.corpo.operacoes[1].ciclos_por_peca).toBe(2);

    const linhas = await sql`
      SELECT count(*)::int AS n FROM operacoes WHERE estudo_id = ${res.corpo.estudo.id}`;
    expect(linhas[0].n).toBe(2);
  });

  it('operacao aninhada invalida NAO deixa estudo pela metade', async () => {
    const antes = await sql`SELECT count(*)::int AS n FROM estudos WHERE empresa_id = ${EMPRESA}`;
    const res = fingirRes();
    await estudos(fingirReq({
      metodo: 'POST',
      corpo: {
        nome: 'Importacao quebrada',
        operacoes: [
          { nome: 'Peca boa', ciclosPorPeca: 1 },
          { nome: '', ciclosPorPeca: 1 }, // nome obrigatorio -> 400
        ],
      },
    }), res);

    expect(res.statusCode).toBe(400);
    const depois = await sql`SELECT count(*)::int AS n FROM estudos WHERE empresa_id = ${EMPRESA}`;
    expect(depois[0].n).toBe(antes[0].n);
  });

  it('chave de IA: salva, resume sem expor e remove', async () => {
    const chave = 'sk-ant-teste-abcdefghijklmnop1234';

    // formato errado -> 400, nada gravado
    const ruim = fingirRes();
    await config(fingirReq({ metodo: 'POST', corpo: { chaveIa: 'minha-senha' } }), ruim);
    expect(ruim.statusCode).toBe(400);

    const salva = fingirRes();
    await config(fingirReq({ metodo: 'POST', corpo: { chaveIa: chave } }), salva);
    expect(salva.statusCode).toBe(200);
    expect(salva.corpo.chaveIa.configurada).toBe(true);

    // GET nunca devolve a chave inteira — so' os 4 ultimos caracteres.
    const lida = fingirRes();
    await config(fingirReq({}), lida);
    expect(lida.corpo.chaveIa.configurada).toBe(true);
    expect(lida.corpo.chaveIa.origem).toBe('banco');
    expect(lida.corpo.chaveIa.resumo).toBe('•••1234');
    expect(JSON.stringify(lida.corpo)).not.toContain(chave);

    const removida = fingirRes();
    await config(fingirReq({ metodo: 'DELETE' }), removida);
    const depois = fingirRes();
    await config(fingirReq({}), depois);
    expect(depois.corpo.chaveIa.configurada).toBe(false);
  });

  it('nao entrega estudo de outra empresa', async () => {
    const alheia = await criarEstudoComOperacao(OUTRA_EMPRESA);
    const res = fingirRes();
    await estudos(fingirReq({ query: { id: alheia.estudoId } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('DELETE ARQUIVA o estudo que tem ciclos — dado de cronometragem nao se refaz', async () => {
    const { estudoId, operacaoId } = await criarEstudoComOperacao();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID())] },
    }), fingirRes());

    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo.acao).toBe('arquivado');
    expect(res.corpo.ciclos).toBe(1);

    // Continua no banco, recuperavel.
    const linhas = await sql`SELECT status FROM estudos WHERE id = ${estudoId}`;
    expect(linhas[0].status).toBe('arquivado');
    const obs = await sql`
      SELECT count(*)::int AS n FROM observacoes o
        JOIN operacoes op ON op.id = o.operacao_id
       WHERE op.estudo_id = ${estudoId}`;
    expect(obs[0].n).toBe(1);
  });

  it('DELETE APAGA de vez o estudo sem nenhum ciclo — nao ha o que preservar', async () => {
    const { estudoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo.acao).toBe('excluido');

    const linhas = await sql`SELECT id FROM estudos WHERE id = ${estudoId}`;
    expect(linhas).toHaveLength(0);
    // CASCADE levou as operacoes junto.
    const ops = await sql`SELECT count(*)::int AS n FROM operacoes WHERE estudo_id = ${estudoId}`;
    expect(ops[0].n).toBe(0);
  });

  it('estudo arquivado some da listagem', async () => {
    const { estudoId, operacaoId } = await criarEstudoComOperacao();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID())] },
    }), fingirRes());
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), fingirRes());

    const res = fingirRes();
    await estudos(fingirReq(), res);
    expect(res.corpo.estudos.map((e) => e.id)).not.toContain(estudoId);
  });

  it('arquivado volta pela listagem ?arquivados=1 e restaura com PATCH', async () => {
    const { estudoId, operacaoId } = await criarEstudoComOperacao();
    await sync(fingirReq({ metodo: 'POST', corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID())] } }), fingirRes());
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), fingirRes());

    // Sumiu da lista normal, mas aparece na dos arquivados — com os ciclos.
    const normal = fingirRes();
    await estudos(fingirReq({}), normal);
    expect(normal.corpo.estudos.some((e) => e.id === estudoId)).toBe(false);

    const arq = fingirRes();
    await estudos(fingirReq({ query: { arquivados: '1' } }), arq);
    const achado = arq.corpo.estudos.find((e) => e.id === estudoId);
    expect(achado).toBeTruthy();
    expect(Number(achado.total_observacoes)).toBe(1);

    // Restaurar devolve para a lista normal.
    const patch = fingirRes();
    await estudos(fingirReq({ metodo: 'PATCH', query: { id: estudoId }, corpo: { status: 'coletando' } }), patch);
    expect(patch.corpo.estudo.status).toBe('coletando');

    const depois = fingirRes();
    await estudos(fingirReq({}), depois);
    expect(depois.corpo.estudos.some((e) => e.id === estudoId)).toBe(true);
  });

  it('status invalido leva 400, nao 500 vindo do Postgres', async () => {
    const { estudoId } = await criarEstudoComOperacao();
    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'PATCH', query: { id: estudoId }, corpo: { status: 'sumido' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('nao remove estudo de outra empresa', async () => {
    const alheia = await criarEstudoComOperacao(OUTRA_EMPRESA);
    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: alheia.estudoId } }), res);
    expect(res.statusCode).toBe(404);
    const linhas = await sql`SELECT id FROM estudos WHERE id = ${alheia.estudoId}`;
    expect(linhas).toHaveLength(1);
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
