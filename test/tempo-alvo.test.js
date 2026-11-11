/**
 * O TEMPO-ALVO DO PRODUTO (v2.106.0) — a regua do veredito da Embalagem
 * Takt Time. PPCP, 11/11/2026: "isso que quis dizer: tempo-alvo de cada
 * produto"; a cor segue o alvo, o takt vira carga sem cor, e produto sem
 * UEP fica sem alvo (nunca o takt no lugar).
 */
import {
  afterEach, describe, expect, it,
} from 'vitest';
import {
  alvoDaJuncao, alvoDoProduto, alvoEmSegundos, avisoDoAlvo, contaDoAlvo, descontaSetup, explicacaoDaRegua,
  explicacaoDoAlvo, idadeDoAlvo, medidoXAlvo, semAlvo, semAlvoCurto,
} from '../src/domain/tempoAlvo.js';
import {
  _esquecer, lerTemposAlvo, MENSAGEM_ALVO_GS_ANTIGO, respostaDosAlvos, temposAlvo,
} from '../api/_lib/temposAlvo.js';
import { frasesVolumeAVolume } from '../src/domain/volumeAVolume.js';
import { leituraPecaAPeca, periodoPorPeca } from '../src/domain/crono/intervalos.js';
import { unidadeDoPosto } from '../src/domain/crono/formato.js';

const URL_OK = 'https://script.google.com/macros/s/abc/exec';
/** A resposta do .gs v5.62 (getTemposAlvo), com a planilha de 11/11/2026: 4 × 8,2 de setup, META UEP 2.761. */
const DO_PAINEL = {
  ok: true,
  ref: {
    metaUep: 2761, metaOrigem: 'planilha', minDia: 527, setupsDia: 4, setupMin: 8.2, setupOrigem: 'planilha',
    setupDia: 32.8, minProd: 494.2, sUep: 10.739,
  },
  produtos: [
    { rot: '501059 · PENTEADEIRA CAMARIM STRASS', uep: 1.63, alvo: 17.5 },
    { rot: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', uep: 1.8, alvo: 19.33 },
    { rot: '501149 · MESA CABECEIRA MADERO', uep: 1, alvo: 10.74 },
    { rot: '501160 · BERCO ALGODAO DOCE · VOL 1/2', uep: null, alvo: null },
  ],
};
const LIDO = respostaDosAlvos(DO_PAINEL);

describe('a resposta do painel, conferida', () => {
  it('ok: a régua e a lista, o alvo em ms; sem UEP, alvoMs null (nunca 0)', () => {
    expect(LIDO.estado).toBe('ok');
    expect(LIDO.ref).toMatchObject({ metaUep: 2761, sUep: 10.739, setupDia: 32.8, setupOrigem: 'planilha' });
    expect(LIDO.produtos[1]).toEqual({ rot: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', uep: 1.8, alvoMs: 19330 });
    expect(LIDO.produtos[3]).toEqual({ rot: '501160 · BERCO ALGODAO DOCE · VOL 1/2', uep: null, alvoMs: null });
  });
  it('o .gs antigo não conhece a ação e cai no getDados (sem produtos): gs-antigo, com o que falta', () => {
    expect(respostaDosAlvos({ ok: true, slots: [], metaDia: 1500 })).toEqual({ estado: 'gs-antigo', mensagem: MENSAGEM_ALVO_GS_ANTIGO });
    expect(MENSAGEM_ALVO_GS_ANTIGO).toMatch(/v5\.62/);
  });
  it('erro do painel: o motivo dele; régua sem meta: erro, nunca alvo inventado', () => {
    expect(respostaDosAlvos({ ok: false, erro: 'O setup do dia (600 min) não cabe na jornada.' }).estado).toBe('erro');
    expect(respostaDosAlvos({ ...DO_PAINEL, ref: { ...DO_PAINEL.ref, sUep: 0 } }).estado).toBe('erro');
    expect(respostaDosAlvos(null).estado).toBe('gs-antigo');
  });
});

describe('o alvo do produto', () => {
  it('casa pelo nome da lista, sem caixa, acento nem espaço repetido', () => {
    const a = alvoDoProduto(LIDO, '501059 · Penteadeira  Camarim Strass · VOL 2/2');
    expect(a).toMatchObject({ estado: 'ok', alvoMs: 19330, uep: 1.8, sUep: 10.739 });
    expect(contaDoAlvo(a)).toBe('1.80 UEP × 10.74 s');
    expect(alvoEmSegundos(a)).toBe('19.3 s');
  });
  it('cada motivo de não ter alvo, em palavras', () => {
    expect(alvoDoProduto(LIDO, '').estado).toBe('sem-produto');
    expect(alvoDoProduto(LIDO, 'Rack Sirius 1.6').estado).toBe('fora-da-lista');
    expect(alvoDoProduto(LIDO, '501160 · BERCO ALGODAO DOCE · VOL 1/2').estado).toBe('sem-uep');
    expect(alvoDoProduto(null, 'x').estado).toBe('carregando');
    expect(alvoDoProduto(null, 'x', { semRede: true }).estado).toBe('sem-rede');
    expect(alvoDoProduto({ estado: 'gs-antigo' }, 'x').estado).toBe('gs-antigo');
    expect(alvoDoProduto({ estado: 'desligado' }, 'x').estado).toBe('desligado');
    for (const e of ['sem-produto', 'fora-da-lista', 'sem-uep', 'carregando', 'sem-rede', 'gs-antigo', 'desligado', 'erro', 'alvos-diferentes']) {
      expect(semAlvo(e)).toMatch(/\.$/);
      expect(semAlvoCurto(e).length).toBeGreaterThan(5);
    }
    expect(semAlvo('sem-uep')).toBe('o produto não tem UEP no cadastro do painel, e sem UEP não há tempo-alvo.');
  });
  it('a junção: um alvo só quando todas têm o mesmo; alvos diferentes ou sem alvo, sem veredito', () => {
    const a = alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO');
    const b = alvoDoProduto(LIDO, '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2');
    expect(alvoDaJuncao([a, a]).alvoMs).toBe(10740);
    expect(alvoDaJuncao([a, b])).toEqual({ alvoMs: null, estado: 'alvos-diferentes' });
    expect(alvoDaJuncao([a, alvoDoProduto(LIDO, 'Rack Sirius 1.6')]).estado).toBe('fora-da-lista');
  });
});

describe('como chegamos no tempo-alvo — por extenso (PPCP: "deixar claro como chegamos no tempo-alvo de cada produto")', () => {
  it('a frase: UEP × s por UEP = alvo, e de onde saem os s por UEP (jornada − setup, × 60 ÷ a média da linha)', () => {
    const a = alvoDoProduto(LIDO, '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2');
    // Com ponto, como os segundos do app, e a meta sem milhar: "10.74" e
    // "2.761" na mesma frase fariam o ponto valer duas coisas.
    expect(explicacaoDoAlvo(a)).toBe('Tempo-alvo = 1.80 UEP × 10.74 s por UEP = 19.3 s por volume. '
      + 'Os 10.74 s por UEP: (527 min de jornada − 32.8 min de setup) × 60 ÷ 2761 UEP por dia, a média da linha sem hora extra.');
    // A conta fecha: (527 − 32,8) × 60 ÷ 2.761 = 10,739; × 1,80 = 19,33.
    expect(Math.round(((527 - 32.8) * 60 / 2761) * 1.8 * 100) / 100).toBe(19.33);
    expect(explicacaoDaRegua({ ...LIDO.ref, setupDia: 0 })).toBe('Os 10.74 s por UEP: (527 min de jornada) × 60 ÷ 2761 UEP por dia, a média da linha sem hora extra.');
    expect(explicacaoDoAlvo(alvoDoProduto(LIDO, '501160 · BERCO ALGODAO DOCE · VOL 1/2'))).toBe('');
  });
  it('a medicao antiga e a leitura velha sao ditas; a de hoje, com leitura nova, nao', () => {
    const agora = new Date('2026-11-11T18:00:00Z'); // 15:00 em Sao Paulo
    const a = { ...alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO'), lidoEm: '2026-11-11T17:30:00Z' };
    expect(avisoDoAlvo(a, { data: '2026-11-11T12:00:00Z', agora })).toBe('');
    expect(avisoDoAlvo(a, { data: '2026-10-20T12:00:00Z', agora }))
      .toBe('Medição de 20/10 lida com o tempo-alvo de hoje (a UEP e a média de agora).');
    const velho = { ...a, lidoEm: '2026-11-11T12:10:00Z' };
    expect(avisoDoAlvo(velho, { data: '2026-11-11T12:00:00Z', agora }))
      .toBe('Tempo-alvo lido do painel em 11/11 às 09:10: sem leitura nova desde então.');
    // 23h em Sao Paulo ainda e' o mesmo dia (02:00 UTC do dia seguinte).
    expect(avisoDoAlvo({ ...a, lidoEm: '2026-11-12T02:10:00Z' }, { data: '2026-11-12T02:00:00Z', agora: new Date('2026-11-12T02:30:00Z') })).toBe('');
    expect(avisoDoAlvo({ alvoMs: null }, { data: '2026-10-20T12:00:00Z', agora })).toBe('');
    expect(idadeDoAlvo('2026-11-11T16:30:00Z', agora)).toBe('');
  });
});

describe('o setup marcado sai do periodo pela regua do ALVO (revisao de 11/11)', () => {
  it('com alvo: sai quando o painel tira o setup da jornada, qualquer que seja o takt', () => {
    const a = alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO');
    expect(a.setupDia).toBe(32.8);
    expect(descontaSetup(a, null)).toBe(true); // sem programa: antes ficava no periodo
    expect(descontaSetup(a, { setupPlanejado: false })).toBe(true);
    expect(descontaSetup({ ...a, setupDia: 0 }, { setupPlanejado: true })).toBe(false);
  });
  it('sem alvo: o criterio de antes, o do takt', () => {
    expect(descontaSetup({ alvoMs: null, estado: 'sem-uep' }, { setupPlanejado: true })).toBe(true);
    expect(descontaSetup({ alvoMs: null }, { setupPlanejado: false })).toBe(false);
    expect(descontaSetup(null, null)).toBe(false);
  });
  it('o caso da revisao: 21 volumes a 20 s com 8 min de setup marcados — 20 s, dentro do alvo, sem programa', () => {
    const a = { alvoMs: 26600, setupDia: 32.8 };
    const p = periodoPorPeca({
      relogioEntreMarcasMs: 20 * 20000 + 480000, volumes: 21, setupNoTrechoMs: 480000,
      setupPlanejado: descontaSetup(a, null),
    });
    expect(p).toBe(20000);
  });
});

describe('semAlvo diz o erro do servidor', () => {
  it('com a mensagem, ela; sem, a frase generica', () => {
    expect(semAlvo('erro', 'O painel não montou os tempos-alvo: o setup não cabe na jornada.'))
      .toBe('o painel não montou os tempos-alvo: o setup não cabe na jornada.');
    expect(semAlvo('erro', 'URL do painel inválida')).toBe('URL do painel inválida');
    expect(semAlvo('erro')).toBe('não deu para buscar os tempos-alvo no painel agora.');
    expect(semAlvo('sem-uep', 'x')).toMatch(/sem UEP não há tempo-alvo/);
  });
});

describe('medido × alvo, produto a produto (PPCP: "e os produtos que já fizemos?")', () => {
  const medicoes = [
    { id: 'a', peca: '501149 · MESA CABECEIRA MADERO', iniciado_em: '2026-11-10T10:00:00Z', p: 12000 },
    { id: 'b', peca: '501149 · Mesa Cabeceira Madero', iniciado_em: '2026-11-11T10:00:00Z', p: 11500 },
    { id: 'c', peca: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', iniciado_em: '2026-11-09T10:00:00Z', p: 18000 },
    { id: 'd', peca: 'Rack Sirius 1.6', iniciado_em: '2026-11-09T10:00:00Z', p: 20000 },
    { id: 'e', peca: '501059 · PENTEADEIRA CAMARIM STRASS', iniciado_em: '2026-11-09T10:00:00Z', p: null },
  ];
  const m = medidoXAlvo(LIDO, medicoes, (c) => c.p);
  it('a ÚLTIMA medição de cada produto (pelo nome, sem caixa), a diferença; os medidos primeiro, do mais acima para o mais abaixo', () => {
    expect(m.medidos.map((l) => [l.rot, l.medicao.id, l.medicao.n, Math.round(l.difPct)])).toEqual([
      ['501149 · MESA CABECEIRA MADERO', 'b', 2, 7],
      ['501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', 'c', 1, -7],
    ]);
  });
  it('produto fora da lista é contado; medição sem toques não entra; o resto do cadastro vem sem medição', () => {
    expect(m.foraDaLista).toBe(1);
    expect(m.todos.find((l) => l.rot === '501059 · PENTEADEIRA CAMARIM STRASS').medicao).toBeNull();
    expect(m.todos).toHaveLength(4);
    expect(medidoXAlvo({ estado: 'gs-antigo' }, medicoes, (c) => c.p)).toBeNull();
  });
});

describe('o veredito julga pelo alvo do produto, não pelo takt', () => {
  const VOLUME = unidadeDoPosto('EMBALAGEM');
  const marcas = (s, n) => Array.from({ length: n + 1 }, (_, i) => i * s * 1000);
  it('produto pesado (alvo 26,6 s) a 24,1 s: dentro, mesmo com o takt de 16,4 s', () => {
    const leitura = leituraPecaAPeca({
      marcasMs: marcas(24.1, 20), taktMs: 16400, alvoMs: 26600, periodoPorPecaMs: 24100,
    });
    const f = frasesVolumeAVolume({ leitura, alvo: { alvoMs: 26600 }, unidade: VOLUME });
    expect(f.tom).toBe('atende');
    expect(f.manchete).toBe('No período, saiu um volume a cada 24.1 s, paradas dentro — dentro do tempo-alvo do produto, 26.6 s, com 9% de folga.');
    expect(f.carga).toBe('Takt da semana: 16.4 s por volume — a carga da semana, igual para todo volume; não julga o produto.');
  });
  it('produto leve (alvo 8,9 s) a 11,0 s: acima, mesmo dentro do takt de 16,4 s', () => {
    const leitura = leituraPecaAPeca({
      marcasMs: marcas(11, 20), taktMs: 16400, alvoMs: 8900, periodoPorPecaMs: 11000,
    });
    const f = frasesVolumeAVolume({ leitura, alvo: { alvoMs: 8900 }, unidade: VOLUME });
    expect(f.tom).toBe('falha');
    expect(f.manchete).toBe('No período, saiu um volume a cada 11.0 s, paradas dentro — 24% acima do tempo-alvo do produto, 8.9 s.');
  });
});

describe('a leitura no painel, pelo servidor', () => {
  afterEach(() => _esquecer());
  const respostas = (corpo, status = 200) => async () => ({ ok: status < 400, status, text: async () => JSON.stringify(corpo) });

  it('pede getTemposAlvo e devolve a lista conferida', async () => {
    let pedida = '';
    const r = await lerTemposAlvo({
      url: URL_OK,
      buscar: async (u) => { pedida = u; return respostas(DO_PAINEL)(); },
    });
    expect(new URL(pedida).searchParams.get('action')).toBe('getTemposAlvo');
    expect(r.estado).toBe('ok');
    expect(r.produtos).toHaveLength(4);
  });
  it('sem URL: desligado; URL que não é /exec, status, prazo: erro, com a frase de leitura (nunca "envie de novo")', async () => {
    expect((await lerTemposAlvo({ url: '' })).estado).toBe('desligado');
    const url = await lerTemposAlvo({ url: 'https://script.google.com/macros/s/abc/edit' });
    expect(url.estado).toBe('erro');
    expect(url.mensagem).toMatch(/URL do App da Web/);
    const st = await lerTemposAlvo({ url: URL_OK, buscar: respostas({}, 500) });
    expect(st).toEqual({ estado: 'erro', mensagem: 'O painel respondeu 500. O app tenta de novo em 1 min.' });
    const prazo = await lerTemposAlvo({
      url: URL_OK, prazoMs: 5, buscar: (_, { signal }) => new Promise((_r, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))),
    });
    expect(prazo.mensagem).toMatch(/não respondeu em 0 s\. O app tenta de novo/);
    expect([url.mensagem, st.mensagem, prazo.mensagem].join(' ')).not.toMatch(/Envie de novo/);
  });
  it('guarda 10 min com sucesso e 1 min depois de falha; dois pedidos juntos fazem UMA ida', async () => {
    let idas = 0;
    const ler = async () => { idas += 1; return respostaDosAlvos(DO_PAINEL); };
    const t0 = 1_000_000;
    const [a, b] = await Promise.all([temposAlvo({ agora: t0, ler }), temposAlvo({ agora: t0, ler })]);
    expect(idas).toBe(1);
    expect(a).toBe(b);
    await temposAlvo({ agora: t0 + 9 * 60000, ler });
    expect(idas).toBe(1);
    await temposAlvo({ agora: t0 + 10 * 60000, ler });
    expect(idas).toBe(2);
    _esquecer();
    let falhas = 0;
    const falha = async () => { falhas += 1; return { estado: 'erro', mensagem: 'x' }; };
    await temposAlvo({ agora: t0, ler: falha });
    await temposAlvo({ agora: t0 + 59000, ler: falha });
    expect(falhas).toBe(1);
    await temposAlvo({ agora: t0 + 60000, ler: falha });
    expect(falhas).toBe(2);
  });
  it('a falha nao apaga a ultima leitura ok: serve a ok (com a idade) e tenta o painel a cada minuto', async () => {
    let idas = 0;
    let painelFora = false;
    const ler = async () => {
      idas += 1;
      return painelFora ? { estado: 'erro', mensagem: 'O painel não respondeu.' } : respostaDosAlvos(DO_PAINEL);
    };
    const t0 = 5_000_000;
    const ok = await temposAlvo({ agora: t0, ler });
    expect(ok.estado).toBe('ok');
    painelFora = true;
    const depois = await temposAlvo({ agora: t0 + 10 * 60000, ler });
    expect(idas).toBe(2);
    expect(depois.estado).toBe('ok');
    expect(depois.lidoEm).toBe(ok.lidoEm); // a idade e' a da leitura ok
    await temposAlvo({ agora: t0 + 10 * 60000 + 30000, ler });
    expect(idas).toBe(2); // 1 min de espera depois da falha
    await temposAlvo({ agora: t0 + 11 * 60000, ler });
    expect(idas).toBe(3);
    painelFora = false;
    await temposAlvo({ agora: t0 + 12 * 60000, ler });
    expect(idas).toBe(4);
    await temposAlvo({ agora: t0 + 13 * 60000, ler });
    expect(idas).toBe(4); // voltou ok: 10 min de novo
  });
});
