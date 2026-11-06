/**
 * A MEDICAO DA EMBALAGEM NO PAINEL RitmoPatrimar — sem rede e sem banco.
 *
 * O que se guarda aqui:
 *  - os parametros saem com o MESMO texto que a tela e o PDF mostram (o
 *    painel reconhece a medicao repetida pelo conteudo: um decimo a mais
 *    e o PDF importado depois vira uma segunda linha);
 *  - o que nao vai, nao vai — e diz por que, na ordem certa;
 *  - cada resposta do .gs vira o desfecho certo, e nenhuma resposta sem
 *    `app: true` conta como enviada;
 *  - a tela junta o banco com o envio de agora do jeito certo.
 *
 * O Apps Script e' uma funcao `buscar` que responde como ele (o mesmo
 * jeito de planilha-google.test.js).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MENSAGEM_GS_ANTIGO, PRAZO_PAINEL_MS, chamarPainel, grupoDaMedicao, montarParaOPainel, painelLigado,
  respostaDoPainel,
} from '../api/_lib/painel.js';
import { leituraPecaAPeca, periodoPorPeca } from '../src/domain/crono/intervalos.js';
import { unidadeDoPosto } from '../src/domain/crono/formato.js';
import { taktDaMedicao } from '../src/domain/demanda/programa.js';
import { numerosDaLeitura } from '../src/domain/volumeAVolume.js';
import { podeEnviarAoPainel, situacaoNoPainel } from '../src/domain/envioAoPainel.js';

const ID = '0b6f2f4e-9c1a-4d2b-8e3f-5a6b7c8d9e0f';
const URL_PAINEL = 'https://script.google.com/macros/s/AKfycbTESTE123/exec';

/* 13 toques: 12 intervalos, onze de 60 s e uma lacuna de 200 s.
   Rodando: 860 / 12 = 71,67 s. Sem a lacuna: 60 s. O relogio entre o 1o e o
   ultimo toque traz 5 min de parada marcada: 1.160 / 12 = 96,67 s. */
const INTERVALOS_S = [60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60];
const MARCAS = INTERVALOS_S.reduce((m, s) => [...m, m[m.length - 1] + (s * 1000)], [30000]);

const GRUPO = {
  id: 'g-emb', nome: 'EMBALAGEM', horas_semana: '44.00', setups_dia: 2, setup_min: '10.0', dias_semana: 5, maquinas: 1,
};
const PROGRAMA = [{
  ano: 2026, numero: 45, pecas: 2200, inicio: '2026-11-02', dias: 5, diasProducao: null,
  atualizado_em: '2026-11-01T12:00:00Z',
}];

const medicao = (extra = {}) => ({
  id: ID,
  maquina: 'EMBALAGEM 01',
  peca: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2',
  pecas: MARCAS.length,
  duracao_ms: '1200000',
  // 02/11 23:30 em Sao Paulo, ja' 03/11 em UTC: a data e' a da fabrica.
  iniciado_em: new Date('2026-11-03T02:30:00Z'),
  salvo_em: new Date('2026-11-03T02:50:00Z'),
  marcas_ms: MARCAS,
  marcas_relogio_ms: 1160000,
  marcas_setup_ms: 0,
  ...extra,
});

/** O que a TELA mostra nos cartoes, pelo mesmo caminho de VolumeAVolume.jsx. */
function cartoesDaTela(c, grupo, demandas) {
  const takt = taktDaMedicao({
    demandas,
    horas: grupo.horas_semana,
    maquinas: grupo.maquinas,
    setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
    data: new Date(c.iniciado_em).toISOString(),
    pecas: c.pecas,
    duracaoMs: Number(c.duracao_ms),
  });
  const periodoPorPecaMs = periodoPorPeca({
    relogioEntreMarcasMs: c.marcas_relogio_ms,
    volumes: c.marcas_ms.length,
    setupNoTrechoMs: c.marcas_setup_ms,
    setupPlanejado: Boolean(takt.setupPlanejado),
  });
  const leitura = leituraPecaAPeca({ marcasMs: c.marcas_ms, taktMs: takt.taktMs, periodoPorPecaMs });
  return Object.fromEntries(numerosDaLeitura(leitura, takt, unidadeDoPosto(grupo.nome)).map((k) => [k.chave, k.valor]));
}

describe('montarParaOPainel', () => {
  it('monta os parametros com o texto da tela: rodando, sem as lacunas, no periodo, volumes e a data de Sao Paulo', () => {
    const { params, motivo } = montarParaOPainel({ conferencia: medicao(), grupo: GRUPO, demandas: PROGRAMA });
    expect(motivo).toBeUndefined();
    expect(params).toEqual({
      action: 'registrarCrono',
      origem: 'app',
      regId: `app-${ID}`,
      rotulo: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2',
      data: '02/11/2026',
      sRod: '71.7',
      sLac: '60.0',
      sPer: '96.7',
      volumes: '13',
    });
    // O teto do REG_ID no painel.
    expect(params.regId).toHaveLength(40);
  });

  it('os tres tempos sao EXATAMENTE os dos cartoes da tela (e do PDF), com e sem setup no trecho', () => {
    const casos = [
      { c: medicao(), demandas: PROGRAMA },
      { c: medicao({ marcas_setup_ms: 120000 }), demandas: PROGRAMA },
      { c: medicao({ marcas_setup_ms: 120000 }), demandas: [] },
      { c: medicao({ marcas_relogio_ms: 860000 }), demandas: PROGRAMA },
    ];
    for (const { c, demandas } of casos) {
      const { params } = montarParaOPainel({ conferencia: c, grupo: GRUPO, demandas });
      const tela = cartoesDaTela(c, GRUPO, demandas);
      expect(`${params.sRod} s`).toBe(tela.rodando);
      expect(`${params.sLac} s`).toBe(tela.normal);
      expect(`${params.sPer} s`).toBe(tela.periodo);
    }
  });

  it("o setup planejado e' o da tela: sai do periodo com programa cadastrado, fica sem ele", () => {
    const comSetup = medicao({ marcas_setup_ms: 120000 });
    // (1.160 - 120) / 12 = 86,67: o setup marcado entre os toques sai.
    expect(montarParaOPainel({ conferencia: comSetup, grupo: GRUPO, demandas: PROGRAMA }).params.sPer).toBe('86.7');
    // Sem programa a tela nao tem takt, e o setup fica no relogio.
    expect(montarParaOPainel({ conferencia: comSetup, grupo: GRUPO, demandas: [] }).params.sPer).toBe('96.7');
    // Grupo que nao faz setup: nada sai, nem com programa.
    const semSetup = { ...GRUPO, setups_dia: 0 };
    expect(montarParaOPainel({ conferencia: comSetup, grupo: semSetup, demandas: PROGRAMA }).params.sPer).toBe('96.7');
  });

  it('sem relogio entre os toques, o "no periodo" vai vazio (o PDF mostra —)', () => {
    const { params } = montarParaOPainel({ conferencia: medicao({ marcas_relogio_ms: null }), grupo: GRUPO, demandas: PROGRAMA });
    expect(params.sPer).toBe('');
    expect(params.sRod).toBe('71.7');
  });

  it("sem iniciado_em, a data e' a do salvo_em", () => {
    const { params } = montarParaOPainel({
      conferencia: medicao({ iniciado_em: null, salvo_em: '2026-11-04T15:00:00Z' }), grupo: GRUPO, demandas: PROGRAMA,
    });
    expect(params.data).toBe('04/11/2026');
  });

  it('produto fora da lista nao vai, e manda corrigir em Editar produto', () => {
    for (const peca of ['Penteadeira strass - caixa 2/2', '50105 · CURTO', ' 501059 · COM ESPACO', null]) {
      const r = montarParaOPainel({ conferencia: medicao({ peca }), grupo: GRUPO, demandas: PROGRAMA });
      expect(r.params).toBeUndefined();
      expect(r.motivo).toMatch(/não é da lista do cadastro/);
      expect(r.motivo).toMatch(/corrija o produto em Editar produto e envie de novo/);
    }
    // O produto sem volume (o jogo) tambem e' da lista.
    const jogo = montarParaOPainel({ conferencia: medicao({ peca: '501059 · PENTEADEIRA CAMARIM STRASS' }), grupo: GRUPO, demandas: PROGRAMA });
    expect(jogo.params.rotulo).toBe('501059 · PENTEADEIRA CAMARIM STRASS');
  });

  it("leitura curta nao vai — e o motivo e' o dos toques, nao o do produto, que corrigir nao resolveria", () => {
    const curta = medicao({
      peca: 'nome solto', pecas: 5, marcas_ms: MARCAS.slice(0, 5), marcas_relogio_ms: 240000,
    });
    const r = montarParaOPainel({ conferencia: curta, grupo: GRUPO, demandas: PROGRAMA });
    expect(r.params).toBeUndefined();
    expect(r.motivo).toMatch(/Poucos toques para a leitura/);
    expect(r.motivo).not.toMatch(/Editar produto/);
  });

  it('sem toques (por horarios) e fora da embalagem nao vao', () => {
    const semToques = montarParaOPainel({ conferencia: medicao({ marcas_ms: null }), grupo: GRUPO, demandas: PROGRAMA });
    expect(semToques.motivo).toMatch(/não tem toques volume a volume/);
    const umToque = montarParaOPainel({ conferencia: medicao({ marcas_ms: [30000] }), grupo: GRUPO, demandas: PROGRAMA });
    expect(umToque.motivo).toMatch(/não tem toques volume a volume/);
    const furadeira = montarParaOPainel({ conferencia: medicao(), grupo: { ...GRUPO, nome: 'FURADEIRA' }, demandas: [] });
    expect(furadeira.motivo).toMatch(/não está num grupo de embalagem/);
    expect(montarParaOPainel({ conferencia: medicao(), grupo: null }).motivo).toMatch(/grupo de embalagem/);
  });
});

describe('grupoDaMedicao', () => {
  const maquinas = [
    { nome: 'EMBALAGEM 01', ativa: true, grupo_id: 'g-emb', grupo_nome: 'EMBALAGEM', horas_semana: '44.00', setups_dia: 2, setup_min: '10.0', dias_semana: 5 },
    { nome: 'EMBALAGEM 02', ativa: false, grupo_id: 'g-emb', grupo_nome: 'EMBALAGEM', horas_semana: '44.00', setups_dia: 2, setup_min: '10.0', dias_semana: 5 },
    { nome: 'Furadeira 03', ativa: true, grupo_id: 'g-fur', grupo_nome: '0002 FURADEIRA', horas_semana: '44.00' },
  ];

  it("acha pelo nome como a tela (sem caixa, acento e espaco a mais) e conta so' as ativas do grupo", () => {
    const g = grupoDaMedicao('  embalagem   01 ', maquinas);
    expect(g).toMatchObject({ id: 'g-emb', nome: 'EMBALAGEM', setups_dia: 2, maquinas: 1 });
  });

  it("maquina de outro grupo, ou fora do cadastro, nao e' da embalagem", () => {
    expect(grupoDaMedicao('Furadeira 03', maquinas)).toBeNull();
    expect(grupoDaMedicao('EMBALAGEM 09', maquinas)).toBeNull();
    expect(grupoDaMedicao(null, maquinas)).toBeNull();
  });
});

describe('respostaDoPainel', () => {
  it('registrado: enviada, com a linha', () => {
    expect(respostaDoPainel({ ok: true, app: true, registrado: true, linha: 312 }))
      .toEqual({ estado: 'enviada', mensagem: 'Enviada ao painel.', linha: 312 });
  });

  it("duplicado (o mesmo REG_ID, ou o PDF importado antes): ja' estava — conta como no painel", () => {
    expect(respostaDoPainel({ ok: true, app: true, registrado: true, duplicado: true, linha: 40 }))
      .toMatchObject({ estado: 'ja-estava', linha: 40 });
  });

  it('substituido (reenviada com outros numeros): enviada, "atualizada no painel"', () => {
    const r = respostaDoPainel({ ok: true, app: true, registrado: true, substituido: true, linha: 41 });
    expect(r).toMatchObject({ estado: 'enviada', substituida: true, linha: 41 });
    expect(r.mensagem).toMatch(/^Atualizada no painel/);
  });

  it('recusado: recusada, com o motivo do painel', () => {
    expect(respostaDoPainel({
      ok: true, app: true, registrado: false, recusado: true, erro: 'Produto fora do cadastro do painel.',
    })).toEqual({ estado: 'recusada', mensagem: 'O painel recusou: Produto fora do cadastro do painel.' });
  });

  it('falha dentro do .gs no caminho do app (ok:false, app:true): erro, pode reenviar', () => {
    const r = respostaDoPainel({ ok: false, app: true, erro: 'Planilha indisponível (lock).' });
    expect(r).toEqual({ estado: 'erro', mensagem: 'O painel não gravou: Planilha indisponível (lock). Envie de novo.' });
    // Resposta torta do .gs novo tambem nao conta como enviada.
    expect(respostaDoPainel({ ok: true, app: true, registrado: false }).estado).toBe('erro');
  });

  it(".gs anterior a v5.58: SO' o 'Sem o produto da medição.' sem app — colar o .gs novo", () => {
    expect(respostaDoPainel({ ok: false, erro: 'Sem o produto da medição.' }))
      .toEqual({ estado: 'gs-antigo', mensagem: MENSAGEM_GS_ANTIGO });
  });

  it('outra resposta sem app (getDados de um .gs mais antigo, erro fora do caminho do app): erro, nunca enviada', () => {
    for (const corpo of [
      { slots: [], meta: 1800 },
      { ok: true, registrado: true },
      { ok: false, erro: 'Exception: Service Spreadsheets failed' },
      [], null, 'texto',
    ]) {
      const r = respostaDoPainel(corpo);
      expect(r.estado, JSON.stringify(corpo)).toBe('erro');
      expect(r.mensagem).toMatch(/Envie de novo/);
    }
  });
});

describe('chamarPainel', () => {
  const PARAMS = {
    action: 'registrarCrono', origem: 'app', regId: `app-${ID}`, rotulo: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2',
    data: '02/11/2026', sRod: '71.7', sLac: '60.0', sPer: '', volumes: '13',
  };
  /** Um painel de mentira: guarda as chamadas e responde o que o teste mandar. */
  const painel = (resposta) => {
    const chamadas = [];
    const buscar = async (url, opcoes) => {
      chamadas.push({ url, opcoes });
      if (typeof resposta === 'function') return resposta(url, opcoes);
      const { status = 200, texto } = resposta;
      return { ok: status < 400, status, text: async () => texto };
    };
    return { buscar, chamadas };
  };

  it('GET na URL /exec com os parametros, sem callback, seguindo o redirecionamento', async () => {
    const p = painel({ texto: JSON.stringify({ ok: true, app: true, registrado: true, linha: 7 }) });
    const r = await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: p.buscar });
    expect(r).toEqual({ estado: 'enviada', mensagem: 'Enviada ao painel.', linha: 7 });
    expect(p.chamadas).toHaveLength(1);
    const { url, opcoes } = p.chamadas[0];
    expect(url.startsWith(`${URL_PAINEL}?`)).toBe(true);
    // O mesmo texto que URLSearchParams escreve: espaco "+", "·" em UTF-8.
    expect(url).toBe(`${URL_PAINEL}?${new URLSearchParams(PARAMS)}`);
    expect(url).toContain('rotulo=501059+%C2%B7+PENTEADEIRA');
    const lidos = Object.fromEntries(new URL(url).searchParams);
    expect(lidos).toEqual(PARAMS);
    expect(lidos.callback).toBeUndefined();
    expect(opcoes).toMatchObject({ method: 'GET', redirect: 'follow' });
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
  });

  it('sem a variavel: desligado, e nada sai daqui', async () => {
    const p = painel({ texto: '{}' });
    for (const url of [undefined, '', '   ']) {
      expect((await chamarPainel({ params: PARAMS, url, buscar: p.buscar })).estado).toBe('desligado');
    }
    expect(p.chamadas).toHaveLength(0);
    expect(painelLigado({})).toBe(false);
    expect(painelLigado({ PAINEL_APPS_SCRIPT_URL: '  ' })).toBe(false);
    expect(painelLigado({ PAINEL_APPS_SCRIPT_URL: URL_PAINEL })).toBe(true);
  });

  it('a URL do editor, a truncada ou sem https: erro dizendo o que copiar, sem ir ao Google', async () => {
    const p = painel({ texto: '{}' });
    for (const url of [
      'https://script.google.com/home/projects/1abc/edit',
      'https://script.google.com/macros/s/AKfycbTES…',
      'http://script.google.com/macros/s/AKfycbTESTE123/exec',
      'nao e url',
    ]) {
      const r = await chamarPainel({ params: PARAMS, url, buscar: p.buscar });
      expect(r.estado).toBe('erro');
      expect(r.mensagem).toMatch(/URL do App da Web/);
    }
    expect(p.chamadas).toHaveLength(0);
  });

  it('resposta que nao e JSON (a pagina de login do Google) e status de erro: erro', async () => {
    const html = await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: painel({ texto: '<!DOCTYPE html><html>' }).buscar });
    expect(html).toMatchObject({ estado: 'erro' });
    expect(html.mensagem).toMatch(/não respondeu em JSON/);
    const falhou = await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: painel({ status: 500, texto: 'erro' }).buscar });
    expect(falhou).toMatchObject({ estado: 'erro' });
    expect(falhou.mensagem).toMatch(/respondeu 500/);
  });

  it('o .gs antigo responde e a chamada diz o que fazer', async () => {
    const p = painel({ texto: JSON.stringify({ ok: false, erro: 'Sem o produto da medição.' }) });
    expect((await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: p.buscar })).estado).toBe('gs-antigo');
  });

  it('rede fora: erro, pode reenviar (nunca lanca)', async () => {
    const p = painel(async () => { throw new TypeError('fetch failed'); });
    const r = await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: p.buscar });
    expect(r.estado).toBe('erro');
    expect(r.mensagem).toMatch(/Não deu para falar com o painel \(fetch failed\)\. Envie de novo\./);
  });

  it('painel calado: o prazo corta a chamada e vira erro', async () => {
    // Responde so' quando o sinal aborta — como o fetch de verdade.
    const p = painel((url, { signal }) => new Promise((_, rejeitar) => {
      signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const r = await chamarPainel({ params: PARAMS, url: URL_PAINEL, buscar: p.buscar, prazoMs: 30 });
    expect(r.estado).toBe('erro');
    expect(r.mensagem).toMatch(/não respondeu em 0 s/);
    // O prazo padrao cabe no teto da funcao (60 s), com as idas ao banco.
    expect(PRAZO_PAINEL_MS).toBe(25000);
  });
});

describe('situacaoNoPainel (a tela)', () => {
  const EM = '2026-11-05T13:36:00.000Z';

  it('do banco: nunca, no painel, nao foi', () => {
    expect(situacaoNoPainel({})).toEqual({ tipo: 'nunca' });
    expect(situacaoNoPainel({ painel_em: EM })).toMatchObject({ tipo: 'no-painel', em: EM });
    expect(situacaoNoPainel({ painel_erro: 'O painel recusou: x' })).toEqual({ tipo: 'nao-foi', motivo: 'O painel recusou: x', em: null });
  });

  it("o envio desta tela vence o que a lista trouxe", () => {
    expect(situacaoNoPainel({ painel_erro: 'velho' }, { fase: 'enviando' })).toEqual({ tipo: 'enviando' });
    expect(situacaoNoPainel({ painel_erro: 'velho' }, { fase: 'feito', estado: 'enviada', em: EM, erro: null }))
      .toEqual({ tipo: 'no-painel', em: EM, estado: 'enviada', substituida: false });
    expect(situacaoNoPainel({}, { fase: 'feito', estado: 'enviada', em: EM, erro: null, substituida: true }).substituida).toBe(true);
    expect(situacaoNoPainel({}, { fase: 'feito', estado: 'recusada', em: null, erro: 'O painel recusou: y' }))
      .toEqual({ tipo: 'nao-foi', motivo: 'O painel recusou: y', em: null });
  });

  it('o reenvio que falhou NAO se esconde atras do que foi antes: nao foi, com a versao anterior junto', () => {
    // O servidor manteve painel_em e gravou o erro.
    expect(situacaoNoPainel({ painel_em: EM }, { fase: 'feito', estado: 'erro', em: EM, erro: 'O painel não gravou. Envie de novo.' }))
      .toEqual({ tipo: 'nao-foi', motivo: 'O painel não gravou. Envie de novo.', em: EM });
    // O nosso servidor nem respondeu.
    expect(situacaoNoPainel({ painel_em: EM }, { fase: 'feito', falha: 'Falha no servidor (502).' }))
      .toEqual({ tipo: 'nao-foi', motivo: 'Falha no servidor (502).', em: EM });
    // Como a lista volta depois: os dois preenchidos.
    expect(situacaoNoPainel({ painel_em: EM, painel_erro: 'x' }).tipo).toBe('nao-foi');
  });

  it("desligado nao vira erro, e so' o que nao esta' la' nem a caminho pode ser (re)enviado", () => {
    expect(situacaoNoPainel({}, { fase: 'feito', estado: 'desligado', em: null, erro: null })).toEqual({ tipo: 'desligado' });
    expect(situacaoNoPainel({ painel_em: EM }, { fase: 'feito', estado: 'desligado' }).tipo).toBe('no-painel');
    expect(podeEnviarAoPainel({ tipo: 'nunca' })).toBe(true);
    expect(podeEnviarAoPainel({ tipo: 'nao-foi' })).toBe(true);
    expect(podeEnviarAoPainel({ tipo: 'no-painel' })).toBe(false);
    expect(podeEnviarAoPainel({ tipo: 'enviando' })).toBe(false);
  });
});

describe('/api/status', () => {
  it("diz so' SE a variavel existe — nunca o valor", async () => {
    const antes = { DATABASE_URL: process.env.DATABASE_URL, PAINEL: process.env.PAINEL_APPS_SCRIPT_URL };
    delete process.env.DATABASE_URL;
    // A busca do JWKS do status nao sai para a rede no teste.
    vi.stubGlobal('fetch', async () => { throw new TypeError('sem rede no teste'); });
    try {
      const status = (await import('../api/status.js')).default;
      const responder = async () => {
        const r = {
          statusCode: 0, corpo: null,
          status(c) { this.statusCode = c; return this; },
          setHeader() { return this; },
          end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
        };
        await status({ method: 'GET', headers: {} }, r);
        return r.corpo;
      };
      process.env.PAINEL_APPS_SCRIPT_URL = URL_PAINEL;
      const ligado = await responder();
      expect(ligado.variaveis.PAINEL_APPS_SCRIPT_URL).toBe(true);
      expect(JSON.stringify(ligado)).not.toContain('AKfycb');
      // Ausente e' o envio desligado, de proposito: nao e' pendencia.
      delete process.env.PAINEL_APPS_SCRIPT_URL;
      const desligado = await responder();
      expect(desligado.variaveis.PAINEL_APPS_SCRIPT_URL).toBe(false);
      expect(desligado.pendencias.join(' ')).not.toMatch(/PAINEL/);
    } finally {
      vi.unstubAllGlobals();
      if (antes.DATABASE_URL !== undefined) process.env.DATABASE_URL = antes.DATABASE_URL;
      if (antes.PAINEL !== undefined) process.env.PAINEL_APPS_SCRIPT_URL = antes.PAINEL;
      else delete process.env.PAINEL_APPS_SCRIPT_URL;
    }
  });
});
