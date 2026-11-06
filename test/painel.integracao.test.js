/**
 * MANDAR A MEDICAO AO PAINEL (PATCH /api/conferencias?id=...&painel=1) —
 * contra um Postgres real.
 *
 * O painel RitmoPatrimar (o Apps Script) e' um `fetch` de mentira; o resto e'
 * o caminho de producao: a autenticacao com a RLS (analista grava, tablet
 * nao), a leitura da medicao, das marcas e do grupo, a montagem e o que fica
 * gravado na medicao — sem marcar editada_em, que trava o reenvio do video.
 *
 * Pula automaticamente se TEST_DATABASE_URL nao estiver definida.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

process.env.SUPABASE_URL = 'https://supabase.teste.local';

// Empresas proprias: os outros arquivos de integracao apagam as deles.
const EMPRESA = '33333333-3333-3333-3333-333333333333';
const OUTRA = '77777777-7777-7777-7777-777777777777';
const TOKEN = 'token-de-servico-painel';
const URL_PAINEL = 'https://script.google.com/macros/s/AKfycbPAINELTESTE/exec';
const PRODUTO = '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2';

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
function tokenDe(usuarioId) {
  const cab = b64u({ alg: 'ES256', kid: 'kid-painel', typ: 'JWT' });
  const corpo = b64u({
    iss: 'https://supabase.teste.local/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: usuarioId, exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const ass = sign('sha256', Buffer.from(`${cab}.${corpo}`), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${cab}.${corpo}.${ass.toString('base64url')}`;
}

const req = ({
  metodo = 'GET', corpo, query = {}, token = TOKEN,
} = {}) => ({ method: metodo, body: corpo, query, headers: { authorization: `Bearer ${token}` } });
function res() {
  return {
    statusCode: 0, corpo: null,
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
  };
}

/* 13 toques, 12 intervalos: onze de 60 s e uma lacuna de 200 s; 5 min de
   parada marcada entre o 1o e o ultimo. Rodando 71.7, sem as lacunas 60.0,
   no periodo 96.7 (os mesmos numeros de test/painel.test.js). */
const INTERVALOS_S = [60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60];
const MARCAS = INTERVALOS_S.reduce((m, s) => [...m, m[m.length - 1] + (s * 1000)], [30000]);

let sql;
let conferenciasApi;
let sync;
let analistaId;
let coletorId;
let chamadas;
let respostaPainel;

rodar('Mandar a medicao ao painel — integracao', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.API_TOKEN = TOKEN;
    process.env.EMPRESA_ID = EMPRESA;
    process.env.PAINEL_APPS_SCRIPT_URL = URL_PAINEL;

    ({ sql } = await import('../api/_lib/db.js'));
    const { _definirJwks } = await import('../api/_lib/jwt.js');
    _definirJwks([{ ...ec.publicKey.export({ format: 'jwk' }), kid: 'kid-painel', alg: 'ES256' }]);
    conferenciasApi = (await import('../api/conferencias.js')).default;
    sync = (await import('../api/sync.js')).default;

    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA})`;
    await sql`INSERT INTO empresas (id, nome) VALUES (${EMPRESA}, 'Patrimar Painel'), (${OUTRA}, 'Outra Fabrica')`;
    // EMBALAGEM sem setup planejado (o caso de hoje) e uma furadeira.
    const [{ id: emb }] = await sql`
      INSERT INTO grupos_maquina (empresa_id, codigo, nome, horas_semana, setups_dia, setup_min, dias_semana)
      VALUES (${EMPRESA}, '0005', 'EMBALAGEM', 44, 0, 0, 5) RETURNING id`;
    const [{ id: fur }] = await sql`
      INSERT INTO grupos_maquina (empresa_id, codigo, nome) VALUES (${EMPRESA}, '0002', 'FURADEIRA') RETURNING id`;
    await sql`
      INSERT INTO maquinas (empresa_id, nome, grupo_id)
      VALUES (${EMPRESA}, 'EMBALAGEM 01', ${emb}), (${EMPRESA}, 'Furadeira 03', ${fur})`;

    const pessoa = async (papel, email) => {
      const id = crypto.randomUUID();
      await sql`
        INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                                confirmation_token, recovery_token, email_change_token_new, email_change)
        VALUES (${id}, 'authenticated', 'authenticated', ${email}, '', now(), now(), '', '', '', '')`;
      await sql`
        INSERT INTO usuarios (id, empresa_id, nome, email, papel)
        VALUES (${id}, ${EMPRESA}, ${`Painel ${papel}`}, ${email}, ${papel})`;
      return id;
    };
    analistaId = await pessoa('analista', 'pcp@painel.com');
    coletorId = await pessoa('coletor', 'tablet@painel.com');

    vi.stubGlobal('fetch', async (url) => {
      chamadas.push(String(url));
      const r = respostaPainel || { ok: true, app: true, registrado: true, linha: 101 };
      if (r instanceof Error) throw r;
      return { ok: true, status: 200, text: async () => JSON.stringify(r) };
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.PAINEL_APPS_SCRIPT_URL;
    await sql`DELETE FROM auth.users WHERE id IN (${analistaId}, ${coletorId})`;
    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA})`;
    await sql.end();
  });

  beforeEach(() => {
    chamadas = [];
    respostaPainel = null;
    process.env.PAINEL_APPS_SCRIPT_URL = URL_PAINEL;
  });

  /** Uma medicao que sobe do tablet, como o sync grava. */
  async function medicao({ maquina = 'EMBALAGEM 01', peca = PRODUTO, marcas = MARCAS } = {}) {
    const clientId = crypto.randomUUID();
    const r = res();
    await sync(req({
      metodo: 'POST',
      corpo: {
        conferencias: [{
          clientId, maquina, peca, duracaoMs: 1200000, pecas: marcas.length, marcasMs: marcas,
          marcasRelogioMs: marcas.at(-1) - marcas[0] + 300000, marcasSetupMs: 0,
          salvoEm: '2026-11-05T14:00:00.000Z',
        }],
      },
    }), r);
    expect(r.statusCode).toBe(200);
    const [linha] = await sql`SELECT id FROM conferencias WHERE client_id = ${clientId}`;
    return linha.id;
  }
  const comoAnalista = tokenDe;
  const analisar = async (id) => {
    const r = res();
    await conferenciasApi(req({ metodo: 'PATCH', token: comoAnalista(analistaId), query: { id }, corpo: { analisada: true } }), r);
    expect(r.statusCode).toBe(200);
  };
  const aoPainel = async (id, token = comoAnalista(analistaId)) => {
    const r = res();
    await conferenciasApi(req({ metodo: 'PATCH', token, query: { id, painel: '1' } }), r);
    return r;
  };
  const gravado = async (id) => (await sql`
    SELECT painel_em, painel_erro, editada_em FROM conferencias WHERE id = ${id}`)[0];

  it('a analisada vai: os parametros do contrato, o desfecho gravado, e editada_em intocada', async () => {
    const id = await medicao();
    await analisar(id);
    const antes = await gravado(id);

    const r = await aoPainel(id);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.painel).toMatchObject({ estado: 'enviada', mensagem: 'Enviada ao painel.', linha: 101 });
    expect(r.corpo.painel.em).toBeTruthy();

    expect(chamadas).toHaveLength(1);
    const enviado = new URL(chamadas[0]);
    expect(`${enviado.origin}${enviado.pathname}`).toBe(URL_PAINEL);
    expect(Object.fromEntries(enviado.searchParams)).toEqual({
      action: 'registrarCrono', origem: 'app', regId: `app-${id}`, rotulo: PRODUTO,
      // salvoEm 14:00 UTC, 20 min de medicao: 05/11 em Sao Paulo.
      data: '05/11/2026', sRod: '71.7', sLac: '60.0', sPer: '96.7', volumes: '13',
    });

    const depois = await gravado(id);
    expect(depois.painel_em).toBeTruthy();
    expect(depois.painel_erro).toBeNull();
    // Mandar ao painel nao e' editar: o reenvio do video continua possivel.
    expect(depois.editada_em?.getTime()).toBe(antes.editada_em?.getTime());

    // A lista traz o desfecho e diz que o envio esta' ligado.
    const lista = res();
    await conferenciasApi(req({ token: comoAnalista(analistaId) }), lista);
    expect(lista.corpo.painel).toEqual({ ligado: true });
    expect(lista.corpo.conferencias.find((c) => c.id === id)).toMatchObject({ painel_erro: null });
    expect(lista.corpo.conferencias.find((c) => c.id === id).painel_em).toBeTruthy();
  });

  it("reenvio: ja' estava guarda a 1a aceitacao; substituida troca a hora; a falha depois guarda as duas coisas", async () => {
    const id = await medicao();
    await analisar(id);
    await aoPainel(id);
    const primeira = (await gravado(id)).painel_em;

    respostaPainel = { ok: true, app: true, registrado: true, duplicado: true, linha: 101 };
    const dup = await aoPainel(id);
    expect(dup.corpo.painel.estado).toBe('ja-estava');
    expect((await gravado(id)).painel_em.getTime()).toBe(primeira.getTime());

    respostaPainel = { ok: true, app: true, registrado: true, substituido: true, linha: 102 };
    const sub = await aoPainel(id);
    expect(sub.corpo.painel).toMatchObject({ estado: 'enviada', substituida: true, linha: 102 });
    const substituida = (await gravado(id)).painel_em;
    expect(substituida.getTime()).toBeGreaterThanOrEqual(primeira.getTime());

    // O painel caiu no reenvio: o erro fica, e a aceitacao de antes tambem.
    respostaPainel = { ok: false, app: true, erro: 'Planilha indisponível.' };
    const falhou = await aoPainel(id);
    expect(falhou.corpo.painel).toMatchObject({ estado: 'erro', mensagem: 'O painel não gravou: Planilha indisponível. Envie de novo.' });
    expect(new Date(falhou.corpo.painel.em).getTime()).toBe(substituida.getTime());
    expect(await gravado(id)).toMatchObject({ painel_erro: 'O painel não gravou: Planilha indisponível. Envie de novo.' });

    // Aceita de novo: o erro sai.
    respostaPainel = null;
    await aoPainel(id);
    expect((await gravado(id)).painel_erro).toBeNull();
  });

  it('recusada pelo painel, .gs antigo e rede fora: o motivo fica em painel_erro, nada em painel_em', async () => {
    const casos = [
      [{ ok: true, app: true, registrado: false, recusado: true, erro: 'Produto fora do cadastro.' }, 'recusada', /^O painel recusou: Produto fora do cadastro\.$/],
      [{ ok: false, erro: 'Sem o produto da medição.' }, 'gs-antigo', /falta colar o \.gs v5\.58/],
      [new TypeError('fetch failed'), 'erro', /Não deu para falar com o painel/],
    ];
    for (const [resposta, estado, motivo] of casos) {
      const id = await medicao();
      await analisar(id);
      respostaPainel = resposta;
      const r = await aoPainel(id);
      expect(r.statusCode).toBe(200);
      expect(r.corpo.painel.estado).toBe(estado);
      expect(r.corpo.painel.em).toBeNull();
      const g = await gravado(id);
      expect(g.painel_em).toBeNull();
      expect(g.painel_erro).toMatch(motivo);
    }
  });

  it('produto fora da lista nao chega ao painel: recusada aqui, com o que fazer', async () => {
    const id = await medicao({ peca: 'Penteadeira strass - caixa 2/2' });
    await analisar(id);
    const r = await aoPainel(id);
    expect(r.corpo.painel.estado).toBe('recusada');
    expect(r.corpo.painel.mensagem).toMatch(/corrija o produto em Editar produto e envie de novo/);
    expect(chamadas).toHaveLength(0);
    expect((await gravado(id)).painel_erro).toMatch(/não é da lista do cadastro/);
  });

  it("medicao fora da embalagem (furadeira) nao vai", async () => {
    const id = await medicao({ maquina: 'Furadeira 03' });
    await analisar(id);
    const r = await aoPainel(id);
    expect(r.corpo.painel).toMatchObject({ estado: 'recusada' });
    expect(r.corpo.painel.mensagem).toMatch(/não está num grupo de embalagem/);
    expect(chamadas).toHaveLength(0);
  });

  it("so' a analisada vai; so' quem analisa manda; de outra empresa, 404", async () => {
    const id = await medicao();
    const naoAnalisada = await aoPainel(id);
    expect(naoAnalisada.statusCode).toBe(409);
    expect(naoAnalisada.corpo.erro).toMatch(/ainda não foi analisada/);

    await analisar(id);
    const doTablet = await aoPainel(id, tokenDe(coletorId));
    expect(doTablet.statusCode).toBe(403);
    expect(chamadas).toHaveLength(0);
    expect(await gravado(id)).toMatchObject({ painel_em: null, painel_erro: null });

    const [alheia] = await sql`
      INSERT INTO conferencias (client_id, empresa_id, maquina, peca, iniciado_em, finalizado_em,
                                duracao_ms, pecas, salvo_em, analisada_em)
      VALUES (${crypto.randomUUID()}, ${OUTRA}, 'EMBALAGEM 01', ${PRODUTO}, now() - interval '10 minutes', now(),
              600000, 3, now(), now())
      RETURNING id`;
    expect((await aoPainel(alheia.id)).statusCode).toBe(404);
  });

  it('desligado (sem PAINEL_APPS_SCRIPT_URL): nada sai, nada se grava, e a lista diz', async () => {
    const id = await medicao();
    await analisar(id);
    delete process.env.PAINEL_APPS_SCRIPT_URL;
    const r = await aoPainel(id);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.painel).toMatchObject({ estado: 'desligado', em: null });
    expect(chamadas).toHaveLength(0);
    expect(await gravado(id)).toMatchObject({ painel_em: null, painel_erro: null });

    const lista = res();
    await conferenciasApi(req({ token: comoAnalista(analistaId) }), lista);
    expect(lista.corpo.painel).toEqual({ ligado: false });
  });

  /*
   * A MARCA DE ANTES DO ENVIO (pedeEnvio): o envio sai da fila da TELA,
   * depois da analise salva. Fechada ou recarregada no meio, a medicao
   * ficava analisada e sem marca nenhuma — o PCP achava que ela tinha ido.
   */
  const patch = async (corpo, { id, token = comoAnalista(analistaId) } = {}) => {
    const r = res();
    await conferenciasApi(req({ metodo: 'PATCH', token, query: id ? { id } : {}, corpo }), r);
    return r;
  };
  const NAO_CONFIRMADO = /^O envio ao painel não foi confirmado/;
  const PRODUTO_MUDOU = /^O produto foi corrigido depois do envio/;

  it("a analise salva com o pedido de envio ja' deixa 'nao confirmado'; o envio troca pelo desfecho", async () => {
    const id = await medicao();
    const r = await patch({ analisada: true, painel: true }, { id });
    expect(r.statusCode).toBe(200);
    // A resposta ja' traz a marca: a lista da tela fica igual ao banco.
    expect(r.corpo.conferencia.painel_erro).toMatch(NAO_CONFIRMADO);
    expect(r.corpo.conferencia.painel_em).toBeNull();
    // F5 antes do envio: a lista diz que nao foi.
    const lista = res();
    await conferenciasApi(req({ token: comoAnalista(analistaId) }), lista);
    expect(lista.corpo.conferencias.find((c) => c.id === id).painel_erro).toMatch(NAO_CONFIRMADO);

    await aoPainel(id);
    expect(await gravado(id)).toMatchObject({ painel_erro: null });
    const primeira = (await gravado(id)).painel_em;
    expect(primeira).toBeTruthy();

    // Reaberta e salva de novo: a marca volta, e o que o painel aceitou
    // antes continua em painel_em (a tela diz "uma versao anterior esta' la'").
    expect((await patch({ analisada: false }, { id })).statusCode).toBe(200);
    expect((await patch({ analisada: true, painel: true }, { id })).statusCode).toBe(200);
    const g = await gravado(id);
    expect(g.painel_erro).toMatch(NAO_CONFIRMADO);
    expect(g.painel_em.getTime()).toBe(primeira.getTime());
    // O painel diz "ja' estava": a marca sai.
    respostaPainel = { ok: true, app: true, registrado: true, duplicado: true, linha: 101 };
    await aoPainel(id);
    expect(await gravado(id)).toMatchObject({ painel_erro: null });
  });

  it("juncao: o lote com o pedido marca todas, e devolve a marca a' tela", async () => {
    const a = await medicao();
    const b = await medicao();
    const r = await patch({ ids: [a, b], analisada: true, painel: true });
    expect(r.statusCode).toBe(200);
    expect(r.corpo.conferencias).toHaveLength(2);
    for (const c of r.corpo.conferencias) expect(c.painel_erro).toMatch(NAO_CONFIRMADO);
    expect((await gravado(a)).painel_erro).toMatch(NAO_CONFIRMADO);
    expect((await gravado(b)).painel_erro).toMatch(NAO_CONFIRMADO);
  });

  it('sem o pedido, ou com o envio desligado, a analise nao marca nada', async () => {
    const semPedido = await medicao();
    expect((await patch({ analisada: true }, { id: semPedido })).statusCode).toBe(200);
    expect(await gravado(semPedido)).toMatchObject({ painel_erro: null, painel_em: null });

    // Desligado o envio nao grava desfecho: a marca ficaria para sempre.
    delete process.env.PAINEL_APPS_SCRIPT_URL;
    const desligado = await medicao();
    expect((await patch({ analisada: true, painel: true }, { id: desligado })).statusCode).toBe(200);
    const a = await medicao();
    const b = await medicao();
    expect((await patch({ ids: [a, b], analisada: true, painel: true })).statusCode).toBe(200);
    for (const id of [desligado, a, b]) expect(await gravado(id)).toMatchObject({ painel_erro: null });
  });

  it("produto corrigido com o pedido: marca so' a analisada que ja' foi ao painel ou tentou", async () => {
    const NOVO = '501059 · PENTEADEIRA CAMARIM STRASS · VOL 1/2';
    const foi = await medicao();
    await analisar(foi);
    await aoPainel(foi);
    const recusada = await medicao();
    await analisar(recusada);
    respostaPainel = { ok: true, app: true, registrado: false, recusado: true, erro: 'Produto fora do cadastro.' };
    await aoPainel(recusada);
    respostaPainel = null;
    const nunca = await medicao();
    await analisar(nunca);
    const reaberta = await medicao();
    await analisar(reaberta);
    await aoPainel(reaberta);
    expect((await patch({ analisada: false }, { id: reaberta })).statusCode).toBe(200);
    const aAnalisar = await medicao();

    // Uma por vez.
    expect((await patch({ peca: NOVO, painel: true }, { id: foi })).statusCode).toBe(200);
    const g = await gravado(foi);
    expect(g.painel_erro).toMatch(PRODUTO_MUDOU);
    expect(g.painel_em).toBeTruthy();
    // O lote (o "as outras" do Editar produto).
    expect((await patch({ ids: [recusada, nunca, reaberta, aAnalisar], peca: NOVO, painel: true })).statusCode).toBe(200);
    expect((await gravado(recusada)).painel_erro).toMatch(PRODUTO_MUDOU);
    for (const id of [nunca, reaberta, aAnalisar]) {
      const x = await gravado(id);
      expect(x.painel_erro).toBeNull();
    }
    // A reaberta sozinha tambem nao: so' vai de novo quando for salva.
    expect((await patch({ peca: PRODUTO, painel: true }, { id: reaberta })).statusCode).toBe(200);
    expect((await gravado(reaberta)).painel_erro).toBeNull();

    // O reenvio leva o nome novo e tira a marca.
    chamadas = [];
    await aoPainel(foi);
    expect(new URL(chamadas[0]).searchParams.get('rotulo')).toBe(NOVO);
    expect(await gravado(foi)).toMatchObject({ painel_erro: null });

    // Sem o pedido (envio desligado na tela), renomear nao marca.
    const outra = await medicao();
    await analisar(outra);
    await aoPainel(outra);
    expect((await patch({ peca: NOVO }, { id: outra })).statusCode).toBe(200);
    expect(await gravado(outra)).toMatchObject({ painel_erro: null });
  });

  it('o pedido sozinho, com reabrir, com arquivar ou fora do formato e recusado sem gravar nada', async () => {
    const id = await medicao();
    const antes = await gravado(id);
    for (const corpo of [
      { painel: true },
      { analisada: false, painel: true },
      { analisada: true, painel: 'sim' },
      { arquivada: true, painel: true },
    ]) {
      const r = await patch(corpo, { id });
      expect(r.statusCode).toBe(400);
    }
    expect((await patch({ ids: [id], arquivada: true, painel: true })).statusCode).toBe(400);
    expect((await patch({ ids: [id], analisada: true, painel: 1 })).statusCode).toBe(400);
    const depois = await gravado(id);
    expect(depois).toMatchObject({ painel_erro: null, painel_em: null });
    // Recusado antes de qualquer escrita: nem a marca de edicao.
    expect(depois.editada_em?.getTime()).toBe(antes.editada_em?.getTime());
  });
});
