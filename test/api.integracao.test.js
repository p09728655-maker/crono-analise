/**
 * Teste de integracao da API contra um Postgres real.
 *
 * Vale mais que mock: o que precisa ser provado aqui e' exatamente o
 * comportamento do banco — idempotencia do reenvio, atomicidade do lote e
 * isolamento entre empresas. Mock nao prova nada disso.
 *
 * Pula automaticamente se TEST_DATABASE_URL nao estiver definida.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

// Antes de qualquer import da API: jwt.js congela a URL do projeto ao carregar.
process.env.SUPABASE_URL = 'https://supabase.teste.local';

let sql, sync, estudos, operacoes, config, conferenciasApi, motivosApi, maquinasApi, usuariosApi,
  sessaoApi, dispositivosApi;
const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '99999999-9999-9999-9999-999999999999';
const TOKEN = 'token-de-teste';

/**
 * Tokens do "Supabase" destes testes: a MESMA verificacao de producao
 * (ES256 + JWKS), so' que com uma chave gerada aqui e entregue por
 * _definirJwks. Nada e' mockado no caminho — assinatura, exp, iss e aud
 * passam pela checagem real.
 */
const par = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenDe(usuarioId, extras = {}) {
  const cabecalho = b64u({ alg: 'ES256', kid: 'kid-de-teste', typ: 'JWT' });
  const corpo = b64u({
    iss: 'https://supabase.teste.local/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
    sub: usuarioId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extras,
  });
  const assinatura = sign('sha256', Buffer.from(`${cabecalho}.${corpo}`),
    { key: par.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${cabecalho}.${corpo}.${assinatura.toString('base64url')}`;
}

/** Simula req/res da Vercel. */
function fingirReq({ metodo = 'GET', corpo, query = {}, token = TOKEN, sessao } = {}) {
  return {
    method: metodo, body: corpo, query,
    headers: { authorization: `Bearer ${token}`, ...(sessao ? { 'x-sessao': sessao } : {}) },
  };
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
    const { _definirJwks } = await import('../api/_lib/jwt.js');
    _definirJwks([{ ...par.publicKey.export({ format: 'jwk' }), kid: 'kid-de-teste', alg: 'ES256' }]);
    sync = (await import('../api/sync.js')).default;
    estudos = (await import('../api/estudos.js')).default;
    operacoes = (await import('../api/operacoes.js')).default;
    config = (await import('../api/config.js')).default;
    conferenciasApi = (await import('../api/conferencias.js')).default;
    motivosApi = (await import('../api/motivos-parada.js')).default;
    maquinasApi = (await import('../api/maquinas.js')).default;
    usuariosApi = (await import('../api/usuarios.js')).default;
    sessaoApi = (await import('../api/sessao.js')).default;
    dispositivosApi = (await import('../api/dispositivos.js')).default;
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
        duracaoMs: 600000, pecas: 150, ciclosPorPeca: 2, salvoEm: new Date().toISOString(),
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
    // Ciclos de furacao da peca (2 = motor sobe e desce) chegam ao banco.
    expect(Number(linha.ciclos_por_peca)).toBe(2);
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
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas,
                                iniciado_em, finalizado_em, salvo_em)
      VALUES (${crypto.randomUUID()}, ${OUTRA_EMPRESA}, 'Alheia', 60000, 10,
              now() - interval '1 minute', now(), now())`;

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

  /**
   * ARQUIVAR POR MAQUINA — o lote.
   *
   * A medicao entra uma a uma, mas sai por posto: "a FURADEIRA 16 ja' foi
   * analisada, tira ela do relatorio". Quem escolhe as medicoes e' a tela
   * (ela agrupa por maquina com a chave normalizada); o servidor recebe os
   * ids e nao inventa criterio proprio — o que se arquiva e' o que estava
   * na tela.
   */
  it('PATCH em lote arquiva as medicoes de uma maquina e nao toca nas outras', async () => {
    await sql`DELETE FROM conferencias WHERE empresa_id IN (${EMPRESA}, ${OUTRA_EMPRESA})`;
    const agora = new Date().toISOString();
    const clientIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [
          { clientId: clientIds[0], maquina: 'FURADEIRA 16', duracaoMs: 600000, pecas: 150, salvoEm: agora },
          { clientId: clientIds[1], maquina: 'FURADEIRA 16', duracaoMs: 300000, pecas: 80, salvoEm: agora },
          { clientId: clientIds[2], maquina: 'FURADEIRA 03', duracaoMs: 600000, pecas: 200, salvoEm: agora },
        ],
      },
    }), fingirRes());
    const linhas = await sql`
      SELECT id, maquina FROM conferencias WHERE client_id = ANY(${clientIds})`;
    const daDezesseis = linhas.filter((l) => l.maquina === 'FURADEIRA 16').map((l) => l.id);

    const lote = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', corpo: { ids: daDezesseis, arquivada: true },
    }), lote);
    expect(lote.statusCode).toBe(200);
    expect(lote.corpo.atualizadas).toBe(2);

    // A outra maquina fica: o lote e' da maquina escolhida, nao do relatorio.
    const ativas = fingirRes();
    await conferenciasApi(fingirReq({}), ativas);
    expect(ativas.corpo.conferencias.map((c) => c.maquina)).toEqual(['FURADEIRA 03']);
    expect(ativas.corpo.outras).toBe(2);

    // E volta inteira: restaurar e' o mesmo caminho com arquivada: false.
    // E volta pelo caminho de PRODUCAO: token do analista, RLS ligada. E'
    // a politica do banco que precisa deixar o lote passar — no modo de
    // servico ela nem e' avaliada, e o teste passaria sem provar nada.
    const analista = await criarAnalista({
      nome: 'Lote Analista', email: 'lote@patrimar.com', senha: 'senhaboa123',
    });
    const volta = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', token: tokenDe(analista.corpo.usuario.id),
      corpo: { ids: daDezesseis, arquivada: false },
    }), volta);
    expect(volta.corpo.atualizadas).toBe(2);
    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM conferencias
       WHERE empresa_id = ${EMPRESA} AND NOT arquivada`;
    expect(n).toBe(3);
  });

  /**
   * A razao de o UPDATE devolver RETURNING.
   *
   * A politica do banco recusa a escrita de quem nao e' admin/analista SEM
   * erro nenhum: o UPDATE simplesmente nao acha linha e volta 200. Foi
   * assim que "Arquivar" ficou com cara de botao quebrado. O teste fixa os
   * dois lados: o banco recusa, e a API transforma a recusa em 403.
   */
  it('UPDATE de quem nao pode escrever nao muda nada — e a API nao chama isso de sucesso', async () => {
    const clientId = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina: 'FURADEIRA 16', duracaoMs: 600000, pecas: 150,
          salvoEm: new Date().toISOString(),
        }],
      },
    }), fingirRes());
    const [medicao] = await sql`SELECT id FROM conferencias WHERE client_id = ${clientId}`;

    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    const pareado = await parear({ codigo: gerado.corpo.codigo, nome: 'Tablet lote' });
    const coletorId = pareado.corpo.dispositivo.id;

    // No banco, direto: a RLS deixa o UPDATE passar sem alterar nada.
    let alteradas = null;
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('role', 'authenticated', true),
                      set_config('request.jwt.claims', ${JSON.stringify({ sub: coletorId })}, true)`;
      alteradas = await tx`
        UPDATE conferencias SET arquivada = true WHERE id = ${medicao.id} RETURNING id`;
    });
    expect(alteradas.length, 'a politica do banco recusa em silencio').toBe(0);
    const [depois] = await sql`SELECT arquivada FROM conferencias WHERE id = ${medicao.id}`;
    expect(depois.arquivada).toBe(false);

    // Pela API, o mesmo coletor leva 403 — com mensagem, nao com silencio.
    const res = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', token: tokenDe(coletorId), corpo: { ids: [medicao.id], arquivada: true },
    }), res);
    expect(res.statusCode).toBe(403);

    await sql`DELETE FROM conferencias WHERE id = ${medicao.id}`;
  });

  /**
   * RENOMEAR A PECA.
   *
   * O nome nao vem de cadastro: e' digitado no aparelho, medicao a medicao.
   * Duas grafias do mesmo produto viram duas linhas no Ritmo por peca, cada
   * uma com metade das medicoes — e nenhuma descreve a peca. Corrigir o
   * texto (de uma medicao ou de todas as que herdaram a grafia) e' o unico
   * jeito de juntar de novo.
   */
  it('renomeia a peca de uma medicao e do lote inteiro', async () => {
    await sql`DELETE FROM conferencias WHERE empresa_id = ${EMPRESA}`;
    const agora = new Date().toISOString();
    const clientIds = [crypto.randomUUID(), crypto.randomUUID()];
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [
          { clientId: clientIds[0], maquina: 'FURADEIRA 16', peca: 'Sleep tampo', duracaoMs: 600000, pecas: 150, salvoEm: agora },
          { clientId: clientIds[1], maquina: 'FURADEIRA 16', peca: 'Sleep tampo', duracaoMs: 300000, pecas: 80, salvoEm: agora },
        ],
      },
    }), fingirRes());
    const medicoes = await sql`
      SELECT id FROM conferencias WHERE client_id = ANY(${clientIds}) ORDER BY salvo_em`;

    // Uma so': o PATCH individual devolve o nome corrigido.
    const uma = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', query: { id: medicoes[0].id }, corpo: { peca: '  Sleep tampo 380x330x15 ' },
    }), uma);
    expect(uma.statusCode).toBe(200);
    // O texto vai limpo para o banco: espaco nas pontas e' grafia nova.
    expect(uma.corpo.conferencia.peca).toBe('Sleep tampo 380x330x15');

    // E o lote: as duas passam a ter a mesma grafia.
    const lote = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', corpo: { ids: medicoes.map((m) => m.id), peca: 'Sleep tampo 380x330x15' },
    }), lote);
    expect(lote.corpo.atualizadas).toBe(2);
    const nomes = await sql`
      SELECT DISTINCT peca FROM conferencias WHERE id = ANY(${medicoes.map((m) => m.id)})`;
    expect(nomes.map((n) => n.peca)).toEqual(['Sleep tampo 380x330x15']);

    // Nome maior que o que a coleta aceita e recusado — o relatorio nao
    // pode gravar o que o aparelho nao consegue mandar.
    const grande = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', query: { id: medicoes[0].id }, corpo: { peca: 'x'.repeat(121) },
    }), grande);
    expect(grande.statusCode).toBe(400);
  });

  it('o lote nao atravessa a empresa nem aceita id que nao e uuid', async () => {
    const [alheia] = await sql`
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas,
                                iniciado_em, finalizado_em, salvo_em)
      VALUES (${crypto.randomUUID()}, ${OUTRA_EMPRESA}, 'Alheia', 60000, 10,
              now() - interval '1 minute', now(), now())
      RETURNING id`;

    // Id de outra empresa: nenhuma linha muda, e isso vira erro — nao um
    // 200 silencioso que faria a tela dizer que arquivou.
    const res = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', corpo: { ids: [alheia.id], arquivada: true },
    }), res);
    expect(res.statusCode).toBe(403);
    const [linha] = await sql`SELECT arquivada FROM conferencias WHERE id = ${alheia.id}`;
    expect(linha.arquivada).toBe(false);

    const invalido = fingirRes();
    await conferenciasApi(fingirReq({
      metodo: 'PATCH', corpo: { ids: ['nao-e-uuid'], arquivada: true },
    }), invalido);
    expect(invalido.statusCode).toBe(400);

    const vazio = fingirRes();
    await conferenciasApi(fingirReq({ metodo: 'PATCH', corpo: { ids: [], arquivada: true } }), vazio);
    expect(vazio.statusCode).toBe(400);

    await sql`DELETE FROM conferencias WHERE id = ${alheia.id}`;
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

    // A parada e LINHA na tabela `paradas`, ligada a conferencia — nao mais
    // um jsonb dentro dela. E ela chega junto: mae e filhas na mesma
    // transacao, porque o dado nasceu junto e nao pode entrar pela metade.
    const linhas = await sql`
      SELECT p.motivo, p.duracao_ms, p.observacao, p.operacao_id
        FROM paradas p
        JOIN conferencias c ON c.id = p.conferencia_id
       WHERE c.client_id = ${clientId}
       ORDER BY p.duracao_ms DESC`;
    expect(linhas.length).toBe(2);
    expect(linhas[0].motivo).toBe('setup');
    expect(Number(linhas[0].duracao_ms)).toBe(600_000);
    expect(linhas[0].observacao).toBe('troca de gabarito');
    expect(linhas[1].observacao).toBeNull();
    // Parada de conferencia nao tem operacao: e a outra natureza de medicao.
    expect(linhas[0].operacao_id).toBeNull();

    // E a leitura devolve o mesmo formato de sempre — a tela nao precisou
    // saber que as paradas mudaram de lugar.
    const leitura = fingirRes();
    await conferenciasApi(fingirReq(), leitura);
    const daApi = leitura.corpo.conferencias.find((c) => c.maquina === 'Furadeira 16');
    expect(daApi.paradas).toHaveLength(2);
    expect(daApi.paradas.map((x) => x.motivo).sort()).toEqual(['falta_material', 'setup']);
  });

  it('REENVIO da mesma conferencia nao duplica as paradas dela', async () => {
    const clientId = crypto.randomUUID();
    const lote = {
      conferencias: [{
        clientId, maquina: 'Furadeira 22', duracaoMs: 1_800_000, pecas: 90,
        paradas: [{ motivo: 'setup', duracaoMs: 300_000 }],
        salvoEm: new Date().toISOString(),
      }],
    };
    // O tablet reenvia enquanto o servidor nao confirmar. Duplicar a parada
    // dobraria o tempo parado do posto no relatorio.
    await sync(fingirReq({ metodo: 'POST', corpo: lote }), fingirRes());
    await sync(fingirReq({ metodo: 'POST', corpo: lote }), fingirRes());

    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM paradas p
        JOIN conferencias c ON c.id = p.conferencia_id
       WHERE c.client_id = ${clientId}`;
    expect(n).toBe(1);
  });

  it('conferencia ganha periodo em instante, com e sem horario digitado', async () => {
    const salvoEm = '2026-08-20T13:30:00.000Z';

    // Caminho principal: o analista passou no posto e digitou os horarios.
    const comHora = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId: comHora, maquina: 'Furadeira 03', horaInicial: '07:00', horaFinal: '07:30',
          duracaoMs: 1_800_000, pecas: 150, salvoEm,
        }],
      },
    }), fingirRes());

    const [a] = await sql`
      SELECT to_char(iniciado_em   AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ini,
             to_char(finalizado_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')            AS fim
        FROM conferencias WHERE client_id = ${comHora}`;
    // A data sai de salvo_em lido no fuso da fabrica; a hora, do que foi digitado.
    expect(a.ini).toBe('2026-08-20 07:00');
    expect(a.fim).toBe('07:30');

    // Caminho do cronometro ao vivo: sem horario. O fim e o proprio salvo_em
    // e o inicio sai dele menos a duracao — antes ficava sem periodo nenhum.
    const semHora = crypto.randomUUID();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId: semHora, maquina: 'Furadeira 09', duracaoMs: 600_000, pecas: 40, salvoEm,
        }],
      },
    }), fingirRes());

    const [b] = await sql`
      SELECT extract(epoch FROM (finalizado_em - iniciado_em)) * 1000 AS ms,
             finalizado_em = ${salvoEm}::timestamptz AS fim_e_o_salvo_em
        FROM conferencias WHERE client_id = ${semHora}`;
    expect(Number(b.ms)).toBe(600_000);
    expect(b.fim_e_o_salvo_em).toBe(true);
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
    // Sem parada nenhuma, a conferencia entra e o relatorio a le com lista
    // vazia — e' o caso do aparelho que so' mede vazao, sem marcar setup.
    const [{ n }] = await sql`
      SELECT count(*)::int AS n FROM paradas p
        JOIN conferencias c ON c.id = p.conferencia_id
       WHERE c.client_id = ${clientId}`;
    expect(n).toBe(0);

    const leitura = fingirRes();
    await conferenciasApi(fingirReq(), leitura);
    const daApi = leitura.corpo.conferencias.find((c) => c.maquina === 'Furadeira 03');
    expect(daApi.paradas).toEqual([]);
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
    // A recusa nao pode ter levado junto o que ja estava gravado: o PATCH
    // apaga e regrava numa transacao, e ela nao chegou a abrir.
    const depois = await sql`
      SELECT motivo FROM paradas WHERE conferencia_id = ${criada.id}`;
    expect(depois).toHaveLength(1);
    expect(depois[0].motivo).toBe('setup');

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
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas,
                                iniciado_em, finalizado_em, salvo_em)
      VALUES (${alheia}, ${OUTRA_EMPRESA}, 'Alheia', 60000, 10,
              now() - interval '1 minute', now(), now())`;
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
  /* --------------------------------------------------- cadastro de maquinas */
  /**
   * O que protege aqui e' a PADRONIZACAO sem perda: nome unico sem
   * diferenciar caixa, carga a partir do que as conferencias ja usaram, e
   * maquina com historico que nao se exclui — se desativa.
   */
  async function criarMaquina(nome) {
    const res = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { nome } }), res);
    return res;
  }

  it('cria maquina aparando espacos e recusa a mesma com outra caixa', async () => {
    const res = await criarMaquina('  Furadeira   21  ');
    expect(res.statusCode).toBe(201);
    expect(res.corpo.maquina.nome).toBe('Furadeira 21');
    expect(res.corpo.maquina.ativa).toBe(true);

    const repetida = await criarMaquina('furadeira 21');
    expect(repetida.statusCode).toBe(409);
  });

  it('traz das conferencias uma grafia por maquina, e repetir nao duplica', async () => {
    await sql`DELETE FROM maquinas WHERE empresa_id = ${EMPRESA}`;
    await sql`DELETE FROM conferencias WHERE empresa_id = ${EMPRESA}`;
    await sql`
      INSERT INTO conferencias (client_id, empresa_id, maquina, duracao_ms, pecas, salvo_em) VALUES
      (${crypto.randomUUID()}, ${EMPRESA}, 'Furadeira 16',  300000, 10, now() - interval '2 hours'),
      (${crypto.randomUUID()}, ${EMPRESA}, 'furadeira  16', 300000, 10, now() - interval '1 hour'),
      (${crypto.randomUUID()}, ${EMPRESA}, 'Furadeira 12',  300000, 10, now())`;

    const primeira = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { dasConferencias: true } }), primeira);
    expect(primeira.statusCode).toBe(201);
    expect(primeira.corpo.maquinas.map((m) => m.nome)).toEqual(['Furadeira 12', 'furadeira 16']);

    const segunda = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { dasConferencias: true } }), segunda);
    expect(segunda.corpo.maquinas).toHaveLength(2);
  });

  it('maquina com conferencia registrada nao se exclui — se desativa', async () => {
    const [linha] = await sql`
      SELECT id, nome FROM maquinas
       WHERE empresa_id = ${EMPRESA} AND lower(nome) = 'furadeira 16'`;

    const excluir = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'DELETE', query: { id: linha.id } }), excluir);
    expect(excluir.statusCode).toBe(400);

    const desativar = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'PATCH', query: { id: linha.id }, corpo: { ativa: false } }), desativar);
    expect(desativar.statusCode).toBe(200);
    expect(desativar.corpo.maquina.ativa).toBe(false);
  });

  it('grupo tem CODIGO (padrao ERP): cria, vincula maquina e a lista vem agrupada', async () => {
    const g1 = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { grupo: { codigo: '0001', nome: 'SECCIONADORA' } } }), g1);
    expect(g1.statusCode).toBe(201);
    expect(g1.corpo.grupo.codigo).toBe('0001');

    // Codigo repetido e codigo nao numerico sao recusados.
    const repetido = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { grupo: { codigo: '0001', nome: 'OUTRO' } } }), repetido);
    expect(repetido.statusCode).toBe(409);
    const invalido = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { grupo: { codigo: 'A1', nome: 'COLADEIRA' } } }), invalido);
    expect(invalido.statusCode).toBe(400);

    const m = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'POST', corpo: { nome: 'Seccionadora 01', grupoId: g1.corpo.grupo.id } }), m);
    expect(m.statusCode).toBe(201);
    expect(m.corpo.maquina.grupo_id).toBe(g1.corpo.grupo.id);

    // Agrupadas (por codigo do grupo) vem primeiro; sem grupo, no fim.
    const lista = fingirRes();
    await maquinasApi(fingirReq({}), lista);
    expect(lista.corpo.maquinas[0].grupo_codigo).toBe('0001');
    expect(lista.corpo.maquinas[lista.corpo.maquinas.length - 1].grupo_codigo).toBeNull();
    expect(lista.corpo.grupos.map((x) => x.codigo)).toContain('0001');

    // grupoId vazio LIMPA; excluir o grupo NAO apaga a maquina.
    const limpar = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'PATCH', query: { id: m.corpo.maquina.id }, corpo: { grupoId: '' } }), limpar);
    expect(limpar.corpo.maquina.grupo_id).toBeNull();
    const religar = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'PATCH', query: { id: m.corpo.maquina.id }, corpo: { grupoId: g1.corpo.grupo.id } }), religar);
    expect(religar.corpo.maquina.grupo_codigo).toBe('0001');

    const excluirGrupo = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'DELETE', query: { grupo: g1.corpo.grupo.id } }), excluirGrupo);
    expect(excluirGrupo.statusCode).toBe(200);
    const depois = fingirRes();
    await maquinasApi(fingirReq({}), depois);
    const sobrou = depois.corpo.maquinas.find((x) => x.nome === 'Seccionadora 01');
    expect(sobrou).toBeTruthy();
    expect(sobrou.grupo_id).toBeNull();
  });

  it('renomeia sem colidir e exclui a que nunca foi usada', async () => {
    const criada = await criarMaquina('Seccionadora Nova');
    const id = criada.corpo.maquina.id;

    const renomear = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'PATCH', query: { id }, corpo: { nome: 'Seccionadora 02' } }), renomear);
    expect(renomear.statusCode).toBe(200);
    expect(renomear.corpo.maquina.nome).toBe('Seccionadora 02');

    const excluir = fingirRes();
    await maquinasApi(fingirReq({ metodo: 'DELETE', query: { id } }), excluir);
    expect(excluir.statusCode).toBe(200);

    const lista = fingirRes();
    await maquinasApi(fingirReq({}), lista);
    expect(lista.corpo.maquinas.map((m) => m.nome)).not.toContain('Seccionadora 02');
  });

  /* ------------------------------------------- cadastro de motivos de parada */
  /**
   * O que precisa ser provado aqui e' o que protege o HISTORICO. A lista em
   * si e' um CRUD banal; o que nao pode falhar e' a regra de que parada ja'
   * registrada nunca perde o nome — nem por troca de codigo, nem por
   * exclusao de um motivo em uso.
   */
  async function criarMotivo(corpo) {
    const res = fingirRes();
    await motivosApi(fingirReq({ metodo: 'POST', corpo }), res);
    return res;
  }

  it('cria motivo gerando o codigo a partir do nome digitado', async () => {
    const res = await criarMotivo({ rotulo: 'Falta de energia', acao: 'Acionar a manutencao eletrica.' });
    expect(res.statusCode).toBe(201);
    // O analista digita o NOME; o codigo sai dele, sem acento e sem espaco.
    expect(res.corpo.motivo.codigo).toBe('falta_de_energia');
    expect(res.corpo.motivo.ativo).toBe(true);
  });

  it('recusa dois motivos com o mesmo codigo', async () => {
    await criarMotivo({ rotulo: 'Troca de turno' });
    const res = await criarMotivo({ rotulo: 'TROCA DE TURNO' });
    expect(res.statusCode).toBe(409);
  });

  it('carga inicial grava a lista e repetir nao duplica', async () => {
    const motivos = [
      { codigo: 'setup', rotulo: 'Setup / Troca', acao: 'Aplicar SMED.' },
      { codigo: 'manutencao', rotulo: 'Manutencao corretiva', acao: 'Implantar TPM.' },
    ];
    const primeira = fingirRes();
    await motivosApi(fingirReq({ metodo: 'POST', corpo: { motivos } }), primeira);
    expect(primeira.statusCode).toBe(201);

    const segunda = fingirRes();
    await motivosApi(fingirReq({ metodo: 'POST', corpo: { motivos } }), segunda);
    const codigos = segunda.corpo.motivos.map((m) => m.codigo);
    expect(codigos.filter((c) => c === 'setup')).toHaveLength(1);
  });

  it('renomear e seguro; trocar o codigo e recusado', async () => {
    const criado = await criarMotivo({ rotulo: 'Ajuste fino' });
    const id = criado.corpo.motivo.id;

    const renomear = fingirRes();
    await motivosApi(fingirReq({ metodo: 'PATCH', query: { id }, corpo: { rotulo: 'Ajuste de maquina' } }), renomear);
    expect(renomear.statusCode).toBe(200);
    expect(renomear.corpo.motivo.rotulo).toBe('Ajuste de maquina');
    // O codigo segue o mesmo: e' por ele que as paradas antigas se acham.
    expect(renomear.corpo.motivo.codigo).toBe('ajuste_fino');

    const trocar = fingirRes();
    await motivosApi(fingirReq({ metodo: 'PATCH', query: { id }, corpo: { codigo: 'outro_codigo' } }), trocar);
    expect(trocar.statusCode).toBe(400);
  });

  it('reordena a lista inteira numa chamada so', async () => {
    const a = (await criarMotivo({ rotulo: 'Primeiro' })).corpo.motivo;
    const b = (await criarMotivo({ rotulo: 'Segundo' })).corpo.motivo;
    const res = fingirRes();
    await motivosApi(fingirReq({ metodo: 'PATCH', corpo: { ordem: [b.id, a.id] } }), res);
    expect(res.statusCode).toBe(200);
    const ordenados = res.corpo.motivos.map((m) => m.codigo);
    expect(ordenados.indexOf('segundo')).toBeLessThan(ordenados.indexOf('primeiro'));
  });

  it('motivo NAO usado se exclui; motivo em uso so se desativa', async () => {
    const livre = (await criarMotivo({ rotulo: 'Nunca usado' })).corpo.motivo;
    const excluir = fingirRes();
    await motivosApi(fingirReq({ metodo: 'DELETE', query: { id: livre.id } }), excluir);
    expect(excluir.statusCode).toBe(200);

    const usado = (await criarMotivo({ rotulo: 'Falta de peca' })).corpo.motivo;
    const { operacaoId } = await criarEstudoComOperacao();
    await sql`
      INSERT INTO paradas (client_id, operacao_id, motivo, duracao_ms, iniciado_em)
      VALUES (${crypto.randomUUID()}, ${operacaoId}, ${usado.codigo}, 60000, now())`;

    const recusa = fingirRes();
    await motivosApi(fingirReq({ metodo: 'DELETE', query: { id: usado.id } }), recusa);
    expect(recusa.statusCode).toBe(400);
    expect(recusa.corpo.erro).toMatch(/Desative/);

    // A saida oferecida pela mensagem precisa funcionar.
    const desativar = fingirRes();
    await motivosApi(fingirReq({ metodo: 'PATCH', query: { id: usado.id }, corpo: { ativo: false } }), desativar);
    expect(desativar.corpo.motivo.ativo).toBe(false);
  });

  it('nao enxerga nem altera motivo de outra empresa', async () => {
    // Direto no banco: a API so' fala pela empresa autenticada, e e'
    // exatamente esse limite que o teste quer atravessar.
    const [alheio] = await sql`
      INSERT INTO motivos_parada (empresa_id, codigo, rotulo)
      VALUES (${OUTRA_EMPRESA}, 'so_da_concorrente', 'So da concorrente') RETURNING id`;

    const listagem = fingirRes();
    await motivosApi(fingirReq(), listagem);
    expect(listagem.corpo.motivos.map((m) => m.id)).not.toContain(alheio.id);

    const patch = fingirRes();
    await motivosApi(fingirReq({ metodo: 'PATCH', query: { id: alheio.id }, corpo: { rotulo: 'X' } }), patch);
    expect(patch.statusCode).toBe(404);
  });

  it('recusa lista de motivos acima do limite', async () => {
    const muitos = Array.from({ length: 101 }, (_, i) => ({ rotulo: `Motivo ${i}` }));
    const res = fingirRes();
    await motivosApi(fingirReq({ metodo: 'POST', corpo: { motivos: muitos } }), res);
    expect(res.statusCode).toBe(400);
  });
  /* ------------------------------------- cadastro de analistas e sessao */
  /**
   * O que precisa ser provado aqui e' o que protege PESSOA e HISTORICO: a
   * senha nunca aparece em resposta nenhuma (ela nem mora mais no schema
   * public — vive em auth.users, como bcrypt), o token do Supabase e' quem
   * abre a API, e analista que ja assinou estudo nao some do relatorio.
   *
   * O login em si (e-mail + senha -> token) e' do GoTrue e nao se testa
   * aqui; o que se testa e' o contrato da API com o TOKEN ja emitido —
   * assinado nestes testes com uma chave ES256 propria, entregue a
   * verificacao via _definirJwks.
   */
  async function criarAnalista(corpo) {
    const res = fingirRes();
    await usuariosApi(fingirReq({ metodo: 'POST', corpo }), res);
    return res;
  }

  it('cria analista e NUNCA devolve a senha, nem hash nenhum', async () => {
    const res = await criarAnalista({ nome: 'Oderli Sergio Garcia', email: 'oderli@patrimar.com', senha: 'furadeira2026' });
    expect(res.statusCode).toBe(201);
    expect(JSON.stringify(res.corpo)).not.toMatch(/furadeira2026|senha_hash|encrypted/);

    // A conta nasceu no auth.users, com o MESMO id e bcrypt de verdade.
    const [conta] = await sql`SELECT encrypted_password FROM auth.users WHERE id = ${res.corpo.usuario.id}`;
    expect(conta.encrypted_password).toMatch(/^\$2/);

    const lista = fingirRes();
    await usuariosApi(fingirReq(), lista);
    const oderli = lista.corpo.usuarios.find((u) => u.email === 'oderli@patrimar.com');
    expect(oderli.tem_senha).toBe(true);
    expect(JSON.stringify(lista.corpo)).not.toMatch(/furadeira2026|senha_hash/);
  });

  it('analista sem senha existe para ser escolhido, mas nao tem login', async () => {
    const res = await criarAnalista({ nome: 'Sem Acesso', email: 'semacesso@patrimar.com' });
    // Senha vazia no auth nao confere com senha nenhuma: "sem senha" nunca
    // vira "qualquer senha serve".
    const [conta] = await sql`SELECT encrypted_password FROM auth.users WHERE id = ${res.corpo.usuario.id}`;
    expect(conta.encrypted_password).toBe('');

    const lista = fingirRes();
    await usuariosApi(fingirReq(), lista);
    expect(lista.corpo.usuarios.find((u) => u.email === 'semacesso@patrimar.com').tem_senha).toBe(false);
  });

  it('o token do Supabase abre a API e diz quem e', async () => {
    const criado = await criarAnalista({ nome: 'Mauricio', email: 'mauricio@patrimar.com', senha: 'senhaboa123' });
    const eu = fingirRes();
    await sessaoApi(fingirReq({ token: tokenDe(criado.corpo.usuario.id) }), eu);
    expect(eu.statusCode).toBe(200);
    expect(eu.corpo.usuario.nome).toBe('Mauricio');
  });

  it('token forjado, vencido ou de conta desconhecida NAO abre', async () => {
    const semConta = fingirRes();
    await sessaoApi(fingirReq({ token: tokenDe(crypto.randomUUID()) }), semConta);
    expect(semConta.statusCode).toBe(401);

    const vencido = fingirRes();
    await sessaoApi(fingirReq({ token: tokenDe(crypto.randomUUID(), { exp: Math.floor(Date.now() / 1000) - 10 }) }), vencido);
    expect(vencido.statusCode).toBe(401);

    const rabiscado = fingirRes();
    await sessaoApi(fingirReq({ token: 'nem.parece.jwt' }), rabiscado);
    expect(rabiscado.statusCode).toBe(401);
  });

  it('login proprio saiu do ar: POST /sessao manda recarregar', async () => {
    const res = fingirRes();
    await sessaoApi(fingirReq({ metodo: 'POST', corpo: { email: 'x@x.br', senha: 'x' } }), res);
    expect(res.statusCode).toBe(410);
    expect(res.corpo.erro).toMatch(/Recarregue/);
  });

  it('no modo de servico sem X-Sessao o app segue, so nao sabe quem e', async () => {
    const res = fingirRes();
    await sessaoApi(fingirReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.corpo.usuario).toBeNull();
  });

  it('desativar derruba a sessao do Supabase e o acesso junto', async () => {
    const criado = await criarAnalista({ nome: 'Vai Sair', email: 'vaisair@patrimar.com', senha: 'senhaboa123' });
    const id = criado.corpo.usuario.id;
    await sql`INSERT INTO auth.sessions (user_id) VALUES (${id})`;

    await usuariosApi(fingirReq({ metodo: 'PATCH', query: { id }, corpo: { ativo: false } }), fingirRes());

    const [{ n }] = await sql`SELECT count(*)::int AS n FROM auth.sessions WHERE user_id = ${id}`;
    expect(n).toBe(0);
    // E o token que ainda nao venceu para de abrir: a conta esta inativa.
    const res = fingirRes();
    await sessaoApi(fingirReq({ token: tokenDe(id) }), res);
    expect(res.statusCode).toBe(401);
  });

  it('o estudo passa a saber quem e o analista, e quem o criou', async () => {
    const criado = await criarAnalista({ nome: 'Oderli', email: 'oderli2@patrimar.com', senha: 'senhaboa123' });
    const analistaId = criado.corpo.usuario.id;

    // Criado COM o token do proprio analista: alem da autoria, isto prova o
    // caminho inteiro sob RLS — set_config + politicas de INSERT.
    const res = fingirRes();
    await estudos(fingirReq({
      metodo: 'POST', token: tokenDe(analistaId),
      corpo: { nome: 'Rack Sirius', analistaId, operacoes: [] },
    }), res);
    expect(res.statusCode).toBe(201);
    expect(res.corpo.estudo.analista_id).toBe(analistaId);
    // criado_por sai do token, nao do corpo: ninguem assina em nome de outro.
    expect(res.corpo.estudo.criado_por).toBe(analistaId);

    const lido = fingirRes();
    await estudos(fingirReq({ query: { id: res.corpo.estudo.id } }), lido);
    expect(lido.corpo.estudo.analista_nome).toBe('Oderli');
  });

  it('estudo antigo, so com o nome digitado, continua legivel', async () => {
    const res = fingirRes();
    await estudos(fingirReq({
      metodo: 'POST',
      corpo: { nome: 'Estudo de antes', analista: 'ODERLI SERGIO GARCIA', operacoes: [] },
    }), res);

    const lido = fingirRes();
    await estudos(fingirReq({ query: { id: res.corpo.estudo.id } }), lido);
    // Sem vinculo, o nome vem do texto — e nada quebra por isso.
    expect(lido.corpo.estudo.analista_id).toBeNull();
    expect(lido.corpo.estudo.analista_nome).toBe('ODERLI SERGIO GARCIA');
  });

  it('analista que ja assinou estudo nao se exclui; desativar e o caminho', async () => {
    const criado = await criarAnalista({ nome: 'Assinou', email: 'assinou@patrimar.com' });
    const analistaId = criado.corpo.usuario.id;
    await estudos(fingirReq({
      metodo: 'POST', corpo: { nome: 'Com autor', analistaId, operacoes: [] },
    }), fingirRes());

    const recusa = fingirRes();
    await usuariosApi(fingirReq({ metodo: 'DELETE', query: { id: analistaId } }), recusa);
    expect(recusa.statusCode).toBe(400);
    expect(recusa.corpo.erro).toMatch(/Desative/);

    const desativa = fingirRes();
    await usuariosApi(fingirReq({ metodo: 'PATCH', query: { id: analistaId }, corpo: { ativo: false } }), desativa);
    expect(desativa.corpo.usuario.ativo).toBe(false);
  });

  it('recusa e-mail repetido, senha curta e senha sem e-mail', async () => {
    await criarAnalista({ nome: 'Primeiro', email: 'repetido@patrimar.com' });
    const repetido = await criarAnalista({ nome: 'Segundo', email: 'REPETIDO@patrimar.com' });
    expect(repetido.statusCode).toBe(409);

    const curta = await criarAnalista({ nome: 'Curta', email: 'curta@patrimar.com', senha: '123' });
    expect(curta.statusCode).toBe(400);

    // Sem e-mail nao ha por onde entrar: senha sozinha seria promessa vazia.
    const semMail = await criarAnalista({ nome: 'So Senha', senha: 'senhaboa123' });
    expect(semMail.statusCode).toBe(400);
  });

  it('nao enxerga analista de outra empresa', async () => {
    const alheioId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (${alheioId}, 'authenticated', 'authenticated', 'concorrente@outra.com', '', now(), now(), '', '', '', '')`;
    await sql`
      INSERT INTO usuarios (id, empresa_id, nome, email)
      VALUES (${alheioId}, ${OUTRA_EMPRESA}, 'Da Concorrente', 'concorrente@outra.com')`;

    const lista = fingirRes();
    await usuariosApi(fingirReq(), lista);
    expect(lista.corpo.usuarios.map((u) => u.id)).not.toContain(alheioId);

    const patch = fingirRes();
    await usuariosApi(fingirReq({ metodo: 'PATCH', query: { id: alheioId }, corpo: { nome: 'X' } }), patch);
    expect(patch.statusCode).toBe(404);
  });

  it('cada token so enxerga a empresa do proprio perfil — nas duas camadas', async () => {
    const alheioId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (${alheioId}, 'authenticated', 'authenticated', 'isolado@outra.com', '', now(), now(), '', '', '', '')`;
    await sql`
      INSERT INTO usuarios (id, empresa_id, nome, email)
      VALUES (${alheioId}, ${OUTRA_EMPRESA}, 'Isolado', 'isolado@outra.com')`;
    const { estudoId } = await criarEstudoComOperacao(EMPRESA);

    const lista = fingirRes();
    await estudos(fingirReq({ token: tokenDe(alheioId) }), lista);
    expect(lista.statusCode).toBe(200);
    expect(lista.corpo.estudos.map((e) => e.id)).not.toContain(estudoId);

    const direto = fingirRes();
    await estudos(fingirReq({ token: tokenDe(alheioId), query: { id: estudoId } }), direto);
    expect(direto.statusCode).toBe(404);
  });

  /* --------------------------------------------- pareamento do tablet */
  /**
   * O tablet nao tem login por turno: ele troca UM codigo — gerado pelo
   * admin, com validade curta — por uma conta propria de coletor. O que
   * precisa ser provado: o codigo e' de uso unico, codigo errado nao abre
   * nada, e a conta que nasce coleta mas nao administra.
   */
  async function parear(corpo) {
    const res = fingirRes();
    // SEM token: e' o aparelho que ainda nao tem credencial nenhuma.
    await dispositivosApi({ method: 'POST', body: corpo, query: {}, headers: {} }, res);
    return res;
  }

  it('pareia o tablet: codigo vira conta de coletor, uma unica vez', async () => {
    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    expect(gerado.statusCode).toBe(200);
    expect(gerado.corpo.codigo).toMatch(/^[A-Z2-9]{6}$/);

    const res = await parear({ codigo: gerado.corpo.codigo, nome: 'Tablet furadeiras' });
    expect(res.statusCode).toBe(201);
    expect(res.corpo.email).toMatch(/@dispositivo/);
    expect(res.corpo.senha.length).toBeGreaterThan(20);

    // A conta nasceu de verdade: auth + perfil coletor, mesma linha de id.
    const [perfil] = await sql`SELECT papel, nome FROM usuarios WHERE id = ${res.corpo.dispositivo.id}`;
    expect(perfil.papel).toBe('coletor');
    expect(perfil.nome).toBe('Tablet furadeiras');
    const [conta] = await sql`SELECT encrypted_password FROM auth.users WHERE id = ${res.corpo.dispositivo.id}`;
    expect(conta.encrypted_password).toMatch(/^\$2/);

    // USO UNICO: o mesmo codigo nao pareia um segundo aparelho.
    const denovo = await parear({ codigo: gerado.corpo.codigo, nome: 'Clon' });
    expect(denovo.statusCode).toBe(401);
  });

  it('codigo errado nao abre nada — e a mensagem diz onde pedir um', async () => {
    const res = await parear({ codigo: 'XXXXXX', nome: 'Invasor' });
    expect(res.statusCode).toBe(401);
    expect(res.corpo.erro).toMatch(/Analistas/);
  });

  it('o coletor coleta, mas nao administra', async () => {
    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    const pareado = await parear({ codigo: gerado.corpo.codigo, nome: 'Tablet' });
    const jwt = tokenDe(pareado.corpo.dispositivo.id);

    // Coleta: cria estudo e sobe ciclo pelo sync, sob RLS.
    const estudoRes = fingirRes();
    await estudos(fingirReq({ metodo: 'POST', token: jwt, corpo: { nome: 'Do tablet', operacoes: [] } }), estudoRes);
    expect(estudoRes.statusCode).toBe(201);
    // Aparelho nao e' autor: criado_por fica vazio.
    expect(estudoRes.corpo.estudo.criado_por).toBeNull();

    // Administracao: cadastro de motivos e' 403 — sei quem e, e nao pode.
    const motivo = fingirRes();
    await motivosApi(fingirReq({ metodo: 'POST', token: jwt, corpo: { rotulo: 'Golpe' } }), motivo);
    expect(motivo.statusCode).toBe(403);

    // Segredo: a configuracao da IA nem responde para o coletor.
    const chave = fingirRes();
    await config(fingirReq({ token: jwt }), chave);
    expect(chave.statusCode).toBe(403);
  });

  /**
   * O TABLET NUNCA APAGA — nem o estudo que ainda nao tem ciclo.
   *
   * "Sem ciclo" nao quer dizer "sem trabalho": o analista monta o estudo no
   * PC (operacoes, fator de ritmo, meta, roteiro importado do ERP) e manda
   * para o tablet ANTES da primeira cronometragem. Um toque no botao de
   * remover, no chao de fabrica, apagava esse preparo inteiro sem volta.
   *
   * No tablet remover ARQUIVA, sempre. O estudo sai da lista do posto,
   * continua no banco, e quem decide o fim dele e' o analista no PC.
   */
  it('o tablet ARQUIVA em vez de apagar — mesmo estudo sem nenhum ciclo', async () => {
    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    const pareado = await parear({ codigo: gerado.corpo.codigo, nome: 'Tablet furadeira' });
    const jwt = tokenDe(pareado.corpo.dispositivo.id);

    const { estudoId } = await criarEstudoComOperacao();

    const res = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId }, token: jwt }), res);

    expect(res.statusCode).toBe(200);
    expect(res.corpo.acao).toBe('arquivado');

    // O preparo continua inteiro: estudo no banco, operacao junto.
    const [linha] = await sql`SELECT status FROM estudos WHERE id = ${estudoId}`;
    expect(linha?.status).toBe('arquivado');
    const [{ n: ops }] = await sql`
      SELECT count(*)::int AS n FROM operacoes WHERE estudo_id = ${estudoId}`;
    expect(ops).toBe(1);
  });

  /**
   * A mesma regra no BANCO, sem passar pela API: e' a RLS que garante.
   * Se um dia alguem chamar o Postgres por fora — outro cliente, um script,
   * um bundle antigo — o DELETE do coletor nao pode passar assim mesmo.
   */
  it('a RLS recusa o DELETE do coletor, mesmo sem ciclo nenhum', async () => {
    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    const pareado = await parear({ codigo: gerado.corpo.codigo, nome: 'Tablet RLS' });
    const coletorId = pareado.corpo.dispositivo.id;

    const { estudoId } = await criarEstudoComOperacao();

    await sql.begin(async (tx) => {
      await tx`SELECT set_config('role', 'authenticated', true),
                      set_config('request.jwt.claims', ${JSON.stringify({ sub: coletorId })}, true)`;
      await tx`DELETE FROM estudos WHERE id = ${estudoId}`;
    });

    const [linha] = await sql`SELECT status FROM estudos WHERE id = ${estudoId}`;
    expect(linha, 'o coletor nao pode apagar estudo pelo banco').toBeTruthy();
  });

  /* ------------------------------------ excluir de vez (estudo de teste) */
  it('excluir de vez apaga estudo COM ciclos — e so o administrador pode', async () => {
    const { estudoId, operacaoId } = await criarEstudoComOperacao();
    await sync(fingirReq({
      metodo: 'POST',
      corpo: { observacoes: [ciclo(operacaoId, crypto.randomUUID())] },
    }), fingirRes());

    // Sem ?definitivo, estudo com ciclo ARQUIVA — a protecao continua.
    const protegido = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId } }), protegido);
    expect(protegido.corpo.acao).toBe('arquivado');

    // O coletor (tablet) nem conhece esse caminho: 403.
    const gerado = fingirRes();
    await dispositivosApi(fingirReq({ metodo: 'POST', corpo: { acao: 'codigo' } }), gerado);
    const pareado = fingirRes();
    await dispositivosApi(
      { method: 'POST', body: { codigo: gerado.corpo.codigo, nome: 'T' }, query: {}, headers: {} },
      pareado,
    );
    const recusa = fingirRes();
    await estudos(fingirReq({
      metodo: 'DELETE', query: { id: estudoId, definitivo: '1' },
      token: tokenDe(pareado.corpo.dispositivo.id),
    }), recusa);
    expect(recusa.statusCode).toBe(403);

    // O servico (e o admin) apagam de verdade, ciclos junto.
    const apagado = fingirRes();
    await estudos(fingirReq({ metodo: 'DELETE', query: { id: estudoId, definitivo: '1' } }), apagado);
    expect(apagado.corpo.acao).toBe('excluido');
    expect(apagado.corpo.ciclos).toBe(1);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM estudos WHERE id = ${estudoId}`;
    expect(n).toBe(0);
    const [{ n: orfaos }] = await sql`
      SELECT count(*)::int AS n FROM observacoes WHERE operacao_id = ${operacaoId}`;
    expect(orfaos).toBe(0);
  });
});

