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
  explicacaoDoAlvo, fraseDaSemana, idadeDoAlvo, medidoXAlvo, semAlvo, semAlvoCurto, semanaDaData, semanaDoProduto,
  vereditoDaSemana,
} from '../src/domain/tempoAlvo.js';
import {
  _esquecer, lerTemposAlvo, MENSAGEM_ALVO_GS_ANTIGO, respostaDosAlvos, semanasDoPainel, temposAlvo,
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
    expect(f.linhas.join(' ')).toMatch(/ou a UEP dele está baixa/);
  });
  it('pela esteira, acima mesmo sem parada: aponta o passo contra a esteira e o cadastro da caixa — não a UEP', () => {
    const leitura = leituraPecaAPeca({
      marcasMs: marcas(11, 20), taktMs: 16400, alvoMs: 8900, periodoPorPecaMs: 11000,
    });
    const f = frasesVolumeAVolume({ leitura, alvo: { alvoMs: 8900, metodo: 'esteira' }, unidade: VOLUME });
    const txt = f.linhas.join(' ');
    expect(txt).toMatch(/não acompanha a esteira/);
    expect(txt).toMatch(/medida da caixa, a velocidade ou o entre-peças/);
    expect(txt).not.toMatch(/UEP/);
  });
});

/*
 * A SEMANA PEDE (v2.107.0, PPCP 11/11/2026, com a MESA CABECEIRA SLEEP na
 * tela: takt 8,5 s, tempo-alvo 8,9 s — "quem vê a tela acha que está tudo
 * bem"). O painel (.gs v5.63) manda o takt de cada semana em s por UEP; a
 * linha da carga passa a ser o que a semana pede NO PRODUTO.
 */
describe('a semana pede — o takt da semana no produto (v2.107.0)', () => {
  // A semana de 09/11/2026 do painel: 14.504 UEP em 5 dias úteis, 494,2 min → 10,222 s por UEP, 105,1% da média
  const SEMANAS = [
    { de: '02/11/2026', ate: '08/11/2026', atual: false, sUep: 9.411, pede: 114.1, uep: 12600, nUteis: 4 },
    { de: '09/11/2026', ate: '15/11/2026', atual: true, sUep: 10.222, pede: 105.1, uep: 14504, nUteis: 5 },
    { de: '26/10/2026', ate: '01/11/2026', atual: false, sUep: null, pede: null, uep: 0, nUteis: 5 },
  ];
  const L = respostaDosAlvos({ ...DO_PAINEL, produtos: [...DO_PAINEL.produtos, { rot: '501094 · MESA CABECEIRA SLEEP', uep: 0.83, alvo: 8.91 }], semanas: SEMANAS });
  const QUARTA = '2026-11-11T15:00:00Z';

  it('o servidor confere as semanas: data dd/mm/aaaa, sUep > 0 ou null; o painel antigo não manda: lista vazia', () => {
    expect(L.semanas).toHaveLength(3);
    expect(L.semanas[1]).toEqual({ de: '09/11/2026', ate: '15/11/2026', atual: true, sUep: 10.222, pede: 105.1, uep: 14504, nUteis: 5, cxSemUep: null });
    expect(L.semanas[2]).toMatchObject({ sUep: null, pede: null });
    expect(semanasDoPainel([{ de: '9/11', ate: '15/11/2026', sUep: 10 }, null, { de: '09/11/2026', ate: '15/11/2026', sUep: 0 }]))
      .toEqual([{ de: '09/11/2026', ate: '15/11/2026', atual: false, sUep: null, pede: null, uep: null, nUteis: null, cxSemUep: null }]);
    expect(LIDO.semanas).toEqual([]);
  });

  it('a semana de uma data é a do dia em São Paulo (domingo 23:30 ainda é a semana anterior); fora da lista, null', () => {
    expect(semanaDaData(L, new Date(QUARTA)).de).toBe('09/11/2026');
    expect(semanaDaData(L, '2026-11-09T02:30:00Z').de).toBe('02/11/2026');   // 08/11 23:30 em São Paulo
    expect(semanaDaData(L, '2026-10-01T12:00:00Z')).toBeNull();
    expect(semanaDaData(LIDO, new Date(QUARTA))).toBeNull();
    expect(semanaDaData(L, 'não é data')).toBeNull();
  });

  it('a SLEEP: o alvo 8,9 s, a semana pede 8,5 s (10,222 × 0,83) — a coluna PELO TAKT do painel', () => {
    const a = alvoDoProduto(L, '501094 · MESA CABECEIRA SLEEP', { data: QUARTA });
    expect(a.alvoMs).toBe(8910);
    expect(a.semana).toEqual({ de: '09/11/2026', ate: '15/11/2026', sUep: 10.222, pede: 105.1, cxSemUep: null, taktMs: 8480 });
    expect(fraseDaSemana(a)).toBe('A semana pede 8.5 s neste produto: a programação da semana de 09/11 pede 105.1% da média da linha — no tempo-alvo, ela não fecha.');
    expect(fraseDaSemana(a, { curta: true })).toBe('a semana pede 8.5 s (105.1% da média)');
  });

  it('semana programada abaixo da média: no tempo-alvo, ela cabe; sem UEP programada ou sem a semana, nada (a linha de antes)', () => {
    const leve = { ...L, semanas: [{ ...L.semanas[1], sUep: 11.5, pede: 93.4 }] };
    expect(fraseDaSemana(alvoDoProduto(leve, '501149 · MESA CABECEIRA MADERO', { data: QUARTA })))
      .toBe('A semana pede 11.5 s neste produto: a programação da semana de 09/11 pede 93.4% da média da linha — no tempo-alvo, ela cabe.');
    expect(alvoDoProduto(L, '501149 · MESA CABECEIRA MADERO', { data: '2026-10-28T12:00:00Z' }).semana).toBeNull();   // semana sem UEP
    expect(alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO', { data: QUARTA }).semana).toBeNull();   // painel antigo
    expect(fraseDaSemana(alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO'))).toBe('');
    expect(semanaDoProduto(L.semanas[1], null)).toBeNull();
  });

  it('caixa sem UEP na semana: "cabe" não é dito (a semana parece mais leve do que é); "não fecha" continua; sem o %, sem veredito', () => {
    const comSemUep = { ...L, semanas: [{ ...L.semanas[1], sUep: 11.5, pede: 93.4, cxSemUep: 1200 }] };
    expect(semanasDoPainel([{ de: '09/11/2026', ate: '15/11/2026', sUep: 11.5, pede: 93.4, cxSemUep: 1200 }])[0].cxSemUep).toBe(1200);
    expect(fraseDaSemana(alvoDoProduto(comSemUep, '501149 · MESA CABECEIRA MADERO', { data: QUARTA })))
      .toBe('A semana pede 11.5 s neste produto: a programação da semana de 09/11 pede 93.4% da média da linha — sem contar 1.200 caixas sem UEP, que ficam fora da conta.');
    expect(vereditoDaSemana({ pede: 105.1, cxSemUep: 1200 })).toBe('no tempo-alvo, ela não fecha');
    expect(vereditoDaSemana({ pede: 93.4, cxSemUep: 1 })).toBe('sem contar 1 caixa sem UEP, que ficam fora da conta');
    expect(vereditoDaSemana({ pede: 93.4, cxSemUep: 0 })).toBe('no tempo-alvo, ela cabe');
    expect(vereditoDaSemana({ pede: null })).toBe('');
  });

  it('a medição é lida com a semana DELA: a da semana passada, pelo takt da semana passada', () => {
    const a = alvoDoProduto(L, '501149 · MESA CABECEIRA MADERO', { data: '2026-11-04T12:00:00Z' });
    expect(a.semana).toMatchObject({ de: '02/11/2026', taktMs: 9410 });
  });

  it('o veredito continua pelo alvo; a linha da carga vira a do produto (sem ela, a do takt por volume)', () => {
    const VOLUME = unidadeDoPosto('EMBALAGEM');
    const marcas = Array.from({ length: 31 }, (_, i) => i * 8700);
    const a = alvoDoProduto(L, '501094 · MESA CABECEIRA SLEEP', { data: QUARTA });
    const leitura = leituraPecaAPeca({ marcasMs: marcas, taktMs: 16400, alvoMs: a.alvoMs, periodoPorPecaMs: 8700 });
    const f = frasesVolumeAVolume({ leitura, alvo: a, unidade: VOLUME });
    expect(f.tom).toBe('atende');   // 8,7 s: dentro do alvo de 8,9 s — a cor não é do takt
    expect(f.carga).toBe(fraseDaSemana(a));
    expect(f.carga).not.toMatch(/16\.4/);
  });

  it('a junção leva a semana das medições; medido × alvo traz o que ESTA semana pede em cada produto', () => {
    const a = alvoDoProduto(L, '501094 · MESA CABECEIRA SLEEP', { data: QUARTA });
    expect(alvoDaJuncao([a, a]).semana).toEqual(a.semana);
    const m = medidoXAlvo(L, [], () => null, new Date(QUARTA));
    expect(m.semana).toMatchObject({ de: '09/11/2026', sUep: 10.222 });
    expect(m.todos.find((l) => l.rot === '501094 · MESA CABECEIRA SLEEP').semanaMs).toBe(8480);
    expect(m.todos.find((l) => l.rot === '501160 · BERCO ALGODAO DOCE · VOL 1/2').semanaMs).toBeNull();
    expect(medidoXAlvo(LIDO, [], () => null, new Date(QUARTA)).semana).toBeNull();
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

/**
 * PELA ESTEIRA (v2.111.0, .gs v5.65). PPCP, 12/11/2026, com o RACK MOVE 1.6
 * na tela (alvo 32,3 s pela UEP; medido 25,2 s com as paradas, 18,2 s sem as
 * lacunas): "tempo alvo está equivocado" → "hoje temos tamanho da caixa,
 * velocidade da esteira" → "85 ok".
 *   esteira = (medida + entre-peças) ÷ velocidade · alvo = esteira ÷ 85%
 */
describe('o tempo-alvo pela esteira (.gs v5.65)', () => {
  const PAINEL_ESTEIRA = {
    ok: true,
    ref: {
      metodo: 'esteira', eficiencia: 85, eficienciaOrigem: 'planilha',
      metaUep: 2761, metaOrigem: 'planilha', minDia: 527, setupsDia: 4, setupMin: 8.2, setupOrigem: 'planilha',
      setupDia: 32.8, minProd: 494.2, sUep: 10.739,
    },
    produtos: [
      { rot: '501151 · RACK MOVE 1.6', uep: 3.01, esteira: 16.51, alvo: 19.42, medida: 2076, vel: 9, entre: 400 },
      { rot: '501059 · PENTEADEIRA CAMARIM STRASS', uep: 1.63, esteira: 12.83, alvo: 15.09, medida: null, vel: null, entre: null },
      { rot: '501160 · BERCO ALGODAO DOCE · VOL 1/2', uep: 1.5, esteira: null, alvo: null, medida: null, vel: null, entre: null },
    ],
    semanas: [{ de: '09/11/2026', ate: '15/11/2026', atual: true, sUep: 10.15, pede: 105.8, uep: 14504, nUteis: 5 }],
  };
  const L = respostaDosAlvos(PAINEL_ESTEIRA);
  const QUINTA = new Date('2026-11-12T17:42:00Z');

  it('o servidor lê o método, a eficiência e, por produto, a esteira e a caixa (só com os três)', () => {
    expect(L.ref).toMatchObject({ metodo: 'esteira', eficiencia: 85, eficienciaOrigem: 'planilha' });
    expect(L.produtos[0]).toEqual({
      rot: '501151 · RACK MOVE 1.6', uep: 3.01, alvoMs: 19420, esteiraMs: 16510, medida: 2076, vel: 9, entre: 400,
    });
    expect(L.produtos[1]).toMatchObject({ esteiraMs: 12830, medida: null, vel: null, entre: null });
    expect(L.produtos[2]).toMatchObject({ alvoMs: null, esteiraMs: null });
    // o painel antigo (sem metodo) continua pela UEP, sem os campos novos
    expect(LIDO.ref.metodo).toBe('uep');
    expect(LIDO.produtos[0]).not.toHaveProperty('esteiraMs');
    // pela esteira sem a eficiência: erro com o motivo, nunca um alvo sem régua
    const semEf = respostaDosAlvos({ ...PAINEL_ESTEIRA, ref: { ...PAINEL_ESTEIRA.ref, eficiencia: null } });
    expect(semEf).toEqual({ estado: 'erro', mensagem: 'O painel mandou os tempos-alvo pela esteira sem a eficiência da embalagem.' });
  });

  it('o RACK MOVE 1.6: 19.4 s, e a conta por extenso — a mesma frase no tablet, no PC e na folha', () => {
    const a = alvoDoProduto(L, '501151 · RACK MOVE 1.6', { data: QUINTA });
    expect(a).toMatchObject({ estado: 'ok', alvoMs: 19420, metodo: 'esteira', eficiencia: 85, esteiraMs: 16510, medida: 2076 });
    expect(alvoEmSegundos(a)).toBe('19.4 s');
    // com o resultado (PPCP: "16,51 é o alvo ou 19,4?")
    expect(contaDoAlvo(a)).toBe('esteira 16.5 s ÷ 85% de eficiência = 19.4 s');
    expect(explicacaoDoAlvo(a)).toBe('Tempo-alvo = (2076 + 400) mm ÷ 9 m/min = 16.5 s de esteira, ÷ 85% = 19.4 s por volume. '
      + 'Os 85% são a eficiência da embalagem do painel: a linha com o produto rodando, paradas e lacunas dentro.');
    // o produto inteiro com volumes de caixas diferentes: a esteira média, sem a medida
    expect(explicacaoDoAlvo(alvoDoProduto(L, '501059 · PENTEADEIRA CAMARIM STRASS', { data: QUINTA })))
      .toMatch(/^Tempo-alvo = 12\.8 s de esteira \(a média por caixa dos volumes\), ÷ 85% = 15\.1 s por volume\./);
    // eficiência com casa
    const L825 = respostaDosAlvos({ ...PAINEL_ESTEIRA, ref: { ...PAINEL_ESTEIRA.ref, eficiencia: 82.5 } });
    expect(contaDoAlvo(alvoDoProduto(L825, '501151 · RACK MOVE 1.6'))).toBe('esteira 16.5 s ÷ 82.5% de eficiência = 19.4 s');
    // a medição antiga é lida com a caixa e a eficiência de agora (não "a UEP e a média")
    expect(avisoDoAlvo(a, { data: '2026-11-01T12:00:00Z', agora: QUINTA }))
      .toBe('Medição de 01/11 lida com o tempo-alvo de hoje (a caixa, a velocidade e a eficiência de agora).');
  });

  it('sem medida da caixa (mesmo com UEP): sem alvo, com o motivo da esteira — nunca a UEP no lugar', () => {
    const a = alvoDoProduto(L, '501160 · BERCO ALGODAO DOCE · VOL 1/2');
    expect(a).toEqual({ alvoMs: null, estado: 'sem-esteira', rot: '501160 · BERCO ALGODAO DOCE · VOL 1/2' });
    expect(semAlvo('sem-esteira')).toMatch(/medida da caixa ou a velocidade da esteira/);
    expect(semAlvoCurto('sem-esteira')).toBe('produto sem medida da caixa no painel');
  });

  it('a semana: só a carga em % da média, sem segundos no produto (a média do dia não se compara com o alvo rodando)', () => {
    const a = alvoDoProduto(L, '501151 · RACK MOVE 1.6', { data: QUINTA });
    expect(a.semana).toMatchObject({ de: '09/11/2026', pede: 105.8, taktMs: null, esteira: true });
    expect(fraseDaSemana(a)).toBe('A programação da semana de 09/11 pede 105.8% da média da linha — '
      + 'acima do que a linha entrega em média. É a carga da semana: não julga o produto.');
    expect(fraseDaSemana(a, { curta: true })).toBe('a semana pede 105.8% da média');
    expect(vereditoDaSemana({ pede: 95, cxSemUep: 0 }, { esteira: true })).toBe('dentro do que a linha entrega em média');
    expect(vereditoDaSemana({ pede: 95, cxSemUep: 3 }, { esteira: true })).toMatch(/^sem contar 3 caixas sem UEP/);
    // nunca "no tempo-alvo, ela não fecha": o alvo rodando não diz quanto o dia entrega
    expect(fraseDaSemana(a)).not.toMatch(/no tempo-alvo/);
    expect(semanaDoProduto({ de: '09/11/2026', ate: '15/11/2026', sUep: null, pede: null }, 3.01, { esteira: true })).toBeNull();
  });

  it('medido × alvo: a esteira de cada produto e nenhuma coluna de segundos da semana', () => {
    const m = medidoXAlvo(L, [], () => 0, QUINTA);
    expect(m.esteira).toBe(true);
    expect(m.semana).toMatchObject({ pede: 105.8, esteira: true });
    expect(m.todos.find((l) => l.rot === '501151 · RACK MOVE 1.6')).toMatchObject({ alvoMs: 19420, esteiraMs: 16510, semanaMs: null });
  });

  it('o setup marcado entre os toques sai do período sempre (o alvo é com o produto rodando), mesmo com o ⚙ sem setup', () => {
    const a = alvoDoProduto(L, '501151 · RACK MOVE 1.6');
    expect(descontaSetup(a, { setupPlanejado: false })).toBe(true);
    expect(descontaSetup({ ...a, setupDia: 0 }, null)).toBe(true);
    // pela UEP, como antes: segue o setup do painel
    expect(descontaSetup({ ...alvoDoProduto(LIDO, '501149 · MESA CABECEIRA MADERO'), setupDia: 0 }, { setupPlanejado: true })).toBe(false);
  });

  it('a régua de todos os alvos, por extenso, para o quadro do PC', () => {
    expect(explicacaoDaRegua(L.ref)).toBe('Tempo-alvo de cada produto = a esteira dele — (medida da caixa + entre-peças) ÷ velocidade, '
      + 'do cadastro do painel — ÷ 85%. Os 85% são a eficiência da embalagem do painel: a linha com o produto rodando, paradas e lacunas dentro.');
  });
});
