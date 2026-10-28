/**
 * A JUNCAO DE MEDICOES — com os numeros REAIS das tres medicoes de
 * Penteadeira Princesa de 28/10/2026 (EMBALAGEM 01): marcas, relogio,
 * duracao e paradas como estao no banco. As contas esperadas foram feitas
 * a mao, para o teste nao ficar certo junto com o codigo errado.
 */
import { describe, expect, it } from 'vitest';
import { unidadeDoPosto } from '../src/domain/cronoanalise.js';
import {
  frasesDaJuncao, juntarMedicoes, motivoParaNaoJuntar,
} from '../src/domain/juncaoMedicoes.js';
import { porHoraDaMedicao, roubadosPelasParadas } from '../src/domain/volumeAVolume.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');
const parada = (ms) => ({ motivo: 'outro', duracaoMs: ms });

const M1 = {
  conferencia: {
    id: 'm1', rotulo: '07:11', peca: 'Penteadeira Princesa', maquina: 'EMBALAGEM 01', pecas: 60, duracao_ms: 916596,
    iniciado_em: '2026-10-28T10:11:55.381Z', finalizado_em: '2026-10-28T10:27:11.977Z',
    paradas: [parada(23400), parada(48000)],
  },
  relogio: 900990,
  setup: 0,
  marcas: [12703, 25446, 38829, 57158, 72486, 94820, 105668, 117316, 146809, 167797, 174689, 185372, 200058, 212038, 225186, 237052, 251175, 262289, 272657, 285294, 297016, 312398, 323355, 333735, 344705, 355099, 368965, 383689, 397383, 410192, 421353, 434340, 446580, 458087, 472109, 489476, 512447, 525551, 537808, 551137, 563017, 578087, 590492, 605175, 616366, 627889, 642574, 670275, 680624, 695760, 709481, 729172, 738346, 752253, 768446, 789348, 801947, 817443, 828030, 842609],
};
const M2 = {
  conferencia: {
    id: 'm2', rotulo: '07:27', peca: 'Penteadeira Princesa', maquina: 'EMBALAGEM 01', pecas: 60, duracao_ms: 1193938,
    iniciado_em: '2026-10-28T10:27:21.937Z', finalizado_em: '2026-10-28T10:47:15.875Z',
    paradas: [parada(95400), parada(3600), parada(18000), parada(200400)],
  },
  relogio: 1179980,
  setup: 0,
  marcas: [12370, 28879, 43552, 55364, 69285, 88503, 100440, 120232, 130374, 144985, 155893, 171586, 188657, 205570, 220108, 236132, 254750, 271091, 297549, 301826, 315714, 329967, 340824, 352743, 366601, 380670, 401328, 422263, 432539, 446566, 457367, 469667, 480072, 495123, 506348, 520287, 531308, 544983, 557210, 571022, 604036, 624265, 634413, 646918, 665386, 679063, 693611, 711966, 724730, 741276, 754786, 770942, 784053, 795920, 805629, 819341, 832192, 843020, 858048, 875416],
};
const M3 = {
  conferencia: {
    id: 'm3', rotulo: '07:52', peca: 'Penteadeira Princesa', maquina: 'EMBALAGEM 01', pecas: 18, duracao_ms: 406489,
    iniciado_em: '2026-10-28T10:52:07.486Z', finalizado_em: '2026-10-28T10:58:53.975Z',
    paradas: [parada(31800), parada(52200), parada(50400)],
  },
  relogio: 337943,
  setup: 0,
  marcas: [13894, 25189, 36937, 56217, 69459, 84243, 100932, 112073, 125488, 139837, 153979, 171819, 188241, 205226, 218486, 235440, 247331, 267325],
};
const hora = (c) => c.rotulo;

describe('os volumes que as paradas roubaram', () => {
  it('o passo da linha rodando, aplicado ao tempo parado — medicao a medicao', () => {
    // 07:27: 60 volumes em 1.193,9 s com 317,4 s parado -> rodando 876,5 s.
    // No mesmo 1.193,9 s, rodando: 60 x 1.193,9 / 876,5 = 81,7 -> 82; roubados 22.
    expect(roubadosPelasParadas(M2.conferencia)).toMatchObject({ saiu: 60, potencial: 82, roubados: 22 });
    // 07:11: 60 x 916,6 / 845,2 = 65,07 -> 65 (5). 07:52: 18 x 406,5 / 272,1 = 26,9 -> 27 (9).
    expect(roubadosPelasParadas(M1.conferencia).roubados).toBe(5);
    expect(roubadosPelasParadas(M3.conferencia).roubados).toBe(9);
  });

  it('sem parada marcada nao ha o que mostrar: null, nunca "0 roubados"', () => {
    expect(roubadosPelasParadas({ ...M1.conferencia, paradas: [] })).toBeNull();
    expect(roubadosPelasParadas({ ...M1.conferencia, duracao_ms: 0 })).toBeNull();
  });
});

describe('a junção das tres medicoes', () => {
  const j = juntarMedicoes([M3, M1, M2]); // fora de ordem de proposito

  it('volumes e intervalos somados, na ordem em que aconteceram', () => {
    expect(j.medicoes.map((m) => m.conferencia.id)).toEqual(['m1', 'm2', 'm3']);
    expect(j.total.pecas).toBe(138);
    // 59 + 59 + 17: o tempo entre uma medicao e a seguinte nao vira intervalo.
    expect(j.leitura.n).toBe(135);
    expect(j.medicoes.map((m) => [m.inicio, m.n])).toEqual([[0, 59], [59, 59], [118, 17]]);
  });

  it('volumes/hora ponderado pelo tempo: 138 / 42 min = 197, nao a media das taxas (192)', () => {
    // 138 x 3.600.000 / 2.517.023 ms = 197,4
    expect(porHoraDaMedicao(j.total, VOLUME).valor).toBe('197');
    const mediaDasTaxas = Math.round((236 + 181 + 159) / 3);
    expect(mediaDasTaxas).toBe(192);
  });

  it('periodo por volume: soma dos relogios entre toques / soma dos intervalos', () => {
    // (900.990 + 1.179.980 + 337.943) / 135 = 2.418.913 / 135 = 17.918 ms
    expect(j.leitura.periodoMs).toBeCloseTo(2418913 / 135, 6);
    // Rodando: soma dos 135 intervalos / 135. As marcas somam, por medicao,
    // ultimo - primeiro: 829.906 + 863.046 + 253.431 = 1.946.383 ms.
    expect(j.leitura.mediaMs).toBeCloseTo(1946383 / 135, 6);
  });

  it('lacuna contra o normal da junção, e dita pela medicao e volume dela', () => {
    expect(j.lacunas.map((l) => [l.conferencia.id, l.volume, l.ms])).toEqual([
      ['m1', 9, 29493], // 146.809 - 117.316
      ['m2', 41, 33014], // 604.036 - 571.022
    ]);
    // O 27,7 s da 07:11 era lacuna sozinha (normal 13,6 s, limite 27,2 s);
    // na junção o normal e' 14,2 s, o limite 28,3 s, e ele nao passa.
    expect(j.leitura.limiteLacunaMs).toBeGreaterThan(27701);
  });

  it('roubados somam os de cada medicao: 5 + 22 + 9 = 36, teriam saido 174', () => {
    expect(j.medicoes.map((m) => m.roubo.roubados)).toEqual([5, 22, 9]);
    expect(j.roubo).toEqual({ saiu: 138, roubados: 36, potencial: 174 });
  });

  it('a manchete e o que as paradas roubaram, quando nao ha takt para veredito', () => {
    const f = frasesDaJuncao({
      juncao: j, takt: { estado: 'sem-demanda' }, unidade: VOLUME, nomeGrupo: 'EMBALAGEM', hora,
    });
    expect(f.manchete).toBe('Nas 3 medições, as paradas roubaram 36 volumes: saíram 138, e no passo da linha rodando teriam saído 174.');
    // Passo SEM as lacunas da junção: 07:11 = (829.906 - 29.493) / 58 = 13,8 s;
    // 07:27 = (863.046 - 33.014) / 58 = 14,3 s; 07:52 = 253.431 / 17 = 14,9 s.
    expect(f.linhas[0]).toBe('O passo é o mesmo nas 3 (de 13.8 a 14.9 s sem as lacunas): o que muda de uma para outra são as paradas. A das 07:27 sozinha perdeu 22.');
    expect(f.linhas[1]).toBe('No período, saiu um volume a cada 17.9 s, paradas dentro; com a linha rodando, 14.4 s.');
    expect(f.linhas[2]).toMatch(/^Sem takt para comparar/);
    expect(f.linhas[3]).toMatch(/^2 lacunas/);
  });

  it('com takt, a manchete e o veredito; os roubados vem logo abaixo', () => {
    const comTakt = juntarMedicoes([M1, M2, M3], { taktMs: 20000 });
    const f = frasesDaJuncao({
      juncao: comTakt, takt: { semana: 'de 26/10' }, unidade: VOLUME, nomeGrupo: 'EMBALAGEM', hora,
    });
    expect(f.manchete).toMatch(/^No período, saiu um volume a cada 17.9 s, paradas dentro — dentro do takt de 20.0 s/);
    expect(f.linhas[0]).toMatch(/^Nas 3 medições, as paradas roubaram 36 volumes/);
  });
});

describe('o passo entre as medicoes', () => {
  const de = (id, intervalosS, inicio) => {
    const marcas = [0];
    for (const s of intervalosS) marcas.push(marcas[marcas.length - 1] + s * 1000);
    return {
      conferencia: {
        id, rotulo: id, peca: 'X', maquina: 'E1', pecas: marcas.length, duracao_ms: marcas[marcas.length - 1] + 1000,
        iniciado_em: inicio, paradas: [],
      },
      marcas,
      relogio: marcas[marcas.length - 1],
      setup: 0,
    };
  };

  it('o tempo entre medicoes nao vira intervalo nem lacuna', () => {
    // Duas medicoes de 10 s por volume, com uma hora entre elas.
    const j = juntarMedicoes([de('a', [10, 10, 10, 10, 10, 10], '2026-10-28T10:00:00Z'), de('b', [10, 10, 10, 10, 10, 10], '2026-10-28T11:00:00Z')]);
    expect(j.leitura.intervalos).toEqual(Array(12).fill(10000));
    expect(j.lacunas).toEqual([]);
    expect(j.roubo).toBeNull();
  });

  it('passo mais de 10% diferente, alem do ruido: a junção diz qual foi a mais lenta', () => {
    const j = juntarMedicoes([de('07:00', Array(12).fill(10), '2026-10-28T10:00:00Z'), de('08:00', Array(12).fill(12), '2026-10-28T11:00:00Z')]);
    const f = frasesDaJuncao({ juncao: j, unidade: VOLUME, hora });
    expect(f.linhas[0]).toMatch(/^O passo muda entre as medições \(de 10.0 a 12.0 s sem as lacunas\); a das 08:00 foi a mais lenta/);
  });

  it('parada que ninguem marcou e lacuna, nao passo: nao faz a medicao parecer de outro passo', () => {
    // Revisao da v2.96.0: com a media COM lacunas, o intervalo de 180 s da
    // segunda virava "o passo muda (14.0 a 22.3 s)".
    const j = juntarMedicoes([
      de('07:00', Array(20).fill(14), '2026-10-28T10:00:00Z'),
      de('08:00', [...Array(10).fill(14), 180, ...Array(9).fill(14)], '2026-10-28T11:00:00Z'),
    ]);
    const f = frasesDaJuncao({ juncao: j, unidade: VOLUME, hora });
    expect(j.lacunas.map((l) => [l.conferencia.id, l.volume])).toEqual([['08:00', 12]]);
    expect(f.linhas.find((l) => l.startsWith('O passo'))).toBe('O passo é o mesmo nas 2 (de 14.0 a 14.0 s sem as lacunas).');
  });

  it('10% de diferenca dentro do ruido das medias nao e "passo muda"', () => {
    // Medias 14,0 e 15,5 s (10,7%), mas o desvio dos intervalos e' de 4 s:
    // o erro de cada media (~1,2 s) deixa 1,5 s de diferenca dentro do ruido.
    const a = Array.from({ length: 12 }, (_, i) => (i % 2 ? 18 : 10));
    const b = Array.from({ length: 12 }, (_, i) => (i % 2 ? 19.5 : 11.5));
    const j = juntarMedicoes([de('07:00', a, '2026-10-28T10:00:00Z'), de('08:00', b, '2026-10-28T11:00:00Z')]);
    const f = frasesDaJuncao({ juncao: j, unidade: VOLUME, hora });
    expect(f.linhas.find((l) => l.startsWith('O passo'))).toMatch(/^O passo é o mesmo nas 2/);
  });

  it('medicao sem leitura (menos de 10 intervalos) nao entra na comparacao do passo', () => {
    const j = juntarMedicoes([de('07:00', Array(40).fill(14), '2026-10-28T10:00:00Z'), de('08:00', [20, 22], '2026-10-28T11:00:00Z')]);
    const f = frasesDaJuncao({ juncao: j, unidade: VOLUME, hora });
    expect(f.linhas.some((l) => l.startsWith('O passo'))).toBe(false);
    // E a junção com poucos intervalos no total nao diz "o passo e' o mesmo"
    // ao lado de "poucos volumes para ler o intervalo".
    const poucos = juntarMedicoes([de('07:00', [14, 14, 14], '2026-10-28T10:00:00Z'), de('08:00', [14, 14, 14], '2026-10-28T11:00:00Z')]);
    const fp = frasesDaJuncao({ juncao: poucos, unidade: VOLUME, hora });
    expect(fp.manchete).toBe('Poucos volumes para ler o intervalo');
    expect(fp.linhas.some((l) => l.startsWith('O passo'))).toBe(false);
  });

  it('veredito acima do takt: a causa vem colada a ele, no plural', () => {
    // 2 medicoes de 12 x 14 s, com 48 s de parada marcada ao vivo em cada:
    // periodo = (168 + 48) / 12 = 18 s > takt 16 s; rodando 14 s <= 16 s.
    const comParada = (id, inicio) => {
      const m = de(id, Array(12).fill(14), inicio);
      return {
        ...m,
        relogio: m.relogio + 48000,
        conferencia: { ...m.conferencia, duracao_ms: m.relogio + 58000, paradas: [{ motivo: 'outro', duracaoMs: 48000 }] },
      };
    };
    const j = juntarMedicoes([comParada('07:00', '2026-10-28T10:00:00Z'), comParada('08:00', '2026-10-28T11:00:00Z')], { taktMs: 16000 });
    const f = frasesDaJuncao({ juncao: j, takt: { semana: 'de 26/10' }, unidade: VOLUME, hora });
    expect(f.tom).toBe('falha');
    expect(f.manchete).toMatch(/^No período, saiu um volume a cada 18.0 s, paradas dentro — 13% acima do takt de 16.0 s\.$/);
    expect(f.linhas[0]).toMatch(/são as paradas marcadas nestas medições\.$/);
    expect(f.linhas[1]).toMatch(/^Nas 2 medições, as paradas roubaram/);
  });
});

describe('o que se junta', () => {
  const c = (extra = {}) => ({
    peca: 'Penteadeira Princesa', maquina: 'EMBALAGEM 01', iniciado_em: '2026-10-28T10:11:55Z', ...extra,
  });

  it('mesmo produto, mesma maquina, mesma semana — grafia normalizada', () => {
    expect(motivoParaNaoJuntar([c(), c({ peca: ' penteadeira  princesa ' }), c({ iniciado_em: '2026-10-26T11:00:00Z' })])).toBeNull();
  });

  it('cada recusa diz o porque', () => {
    expect(motivoParaNaoJuntar([c()])).toBe('Marque duas medições ou mais para juntar.');
    expect(motivoParaNaoJuntar([c(), c({ peca: 'Buffet Flip' })])).toMatch(/produtos diferentes\.$/);
    expect(motivoParaNaoJuntar([c(), c({ maquina: 'EMBALAGEM 02' })])).toMatch(/máquinas diferentes\.$/);
    // Sexta 23/10 e segunda 26/10: semanas diferentes, takts diferentes.
    expect(motivoParaNaoJuntar([c(), c({ iniciado_em: '2026-10-23T12:00:00Z' })])).toMatch(/semanas diferentes\.$/);
    expect(motivoParaNaoJuntar([c(), c({ peca: '' })])).toMatch(/sem produto informado\.$/);
  });
});

describe('a junção como medicao, no historico e na nota', () => {
  const lista = [M3.conferencia, M1.conferencia, M2.conferencia];

  it('o id e o mesmo em qualquer ordem, e volta a dar os ids', async () => {
    const { idDaJuncao, idsDaJuncao } = await import('../src/domain/juncaoMedicoes.js');
    expect(idDaJuncao(lista)).toBe('juncao:m1,m2,m3');
    expect(idsDaJuncao('juncao:m1,m2,m3')).toEqual(['m1', 'm2', 'm3']);
    expect(idsDaJuncao('1fba8a5d')).toBeNull();
  });

  it('volumes, tempo e paradas somados; analisada so quando todas estao', async () => {
    const { medicaoDaJuncao } = await import('../src/domain/juncaoMedicoes.js');
    const j = medicaoDaJuncao(lista);
    expect(j).toMatchObject({ juncao: true, pecas: 138, duracao_ms: 2517023, analisada_em: null });
    expect(j.paradas).toHaveLength(9);
    expect(j.medicoes.map((c) => c.id)).toEqual(['m1', 'm2', 'm3']);
    const lidas = lista.map((c) => ({ ...c, analisada_em: '2026-10-28T15:00:00Z', analise_nota: 'Junção: ok' }));
    expect(medicaoDaJuncao(lidas)).toMatchObject({ analisada_em: '2026-10-28T15:00:00Z', analise_nota: 'Junção: ok' });
  });

  it('a nota leva a junção no comeco — com ou sem texto do PCP', async () => {
    const { notaDaJuncao } = await import('../src/domain/juncaoMedicoes.js');
    expect(notaDaJuncao(lista, '  Classificar as paradas ')).toMatch(/^Junção de 3 medições \(\d{2}:\d{2}–\d{2}:\d{2}\): Classificar as paradas$/);
    expect(notaDaJuncao(lista, '')).toMatch(/^Junção de 3 medições \(\d{2}:\d{2}–\d{2}:\d{2}\)\.$/);
  });
});
