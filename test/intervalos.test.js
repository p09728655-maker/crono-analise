/**
 * VOLUME A VOLUME — o intervalo entre um toque e o seguinte.
 *
 * As contas abaixo sao feitas a mao, com numeros redondos, para o teste
 * nao ficar certo junto com o codigo errado.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITERIOS_INTERVALOS, intervalosEntreMarcas, leituraPecaAPeca, periodoPorPeca, unidadeDoPosto,
} from '../src/domain/cronoanalise.js';
import { taktDaMedicao } from '../src/domain/demandaSemanal.js';

/** Marcas a partir dos intervalos: [60, 60, 200] -> [0, 60, 120, 320] (em s). */
const marcasDe = (intervalosS, inicioS = 0) => {
  const marcas = [inicioS * 1000];
  for (const s of intervalosS) marcas.push(marcas[marcas.length - 1] + s * 1000);
  return marcas;
};
/** a, b, a, b... com n intervalos. */
const alternados = (a, b, n) => Array.from({ length: n }, (_, i) => (i % 2 ? b : a));

describe('os intervalos', () => {
  it('N marcas dao N-1 intervalos — o tempo antes do primeiro toque nao entra', () => {
    // O cronometro comecou aos 0 e o primeiro volume saiu aos 45 s: esses
    // 45 s nao sao ciclo de nada.
    expect(intervalosEntreMarcas([45000, 105000, 160000])).toEqual([60000, 55000]);
  });

  it('um toque so nao tem intervalo, e a leitura nao existe', () => {
    expect(leituraPecaAPeca({ marcasMs: [5000] })).toBeNull();
    expect(leituraPecaAPeca({ marcasMs: [] })).toBeNull();
  });
});

describe('a leitura volume a volume', () => {
  it('abaixo do minimo de intervalos, so o dado bruto e o motivo', () => {
    const l = leituraPecaAPeca({ marcasMs: marcasDe([60, 60, 60]) });
    expect(l.suficiente).toBe(false);
    expect(l.intervalos).toEqual([60000, 60000, 60000]);
    expect(l.motivo).toBe('3 intervalos — a leitura começa com 10');
    expect(l.mediaMs).toBeUndefined();
  });

  /**
   * Doze volumes a cada 60 s e uma lacuna de 200 s no meio (13 intervalos).
   *   media         = (12 x 60 + 200) / 13 = 920 / 13 = 70,77 s  <- contra o takt
   *   1a volta      = limite 2 x 70,77 = 141,5 s -> os 200 s saem
   *   2a volta      = normal 60 s, limite 120 s  -> nada muda: para
   *   excesso       = 200 - 60 = 140 s -> 140 / 60 = 2,33 volumes
   *   takt 65 s     -> media 8,88% ACIMA; sem a lacuna, 7,69% abaixo
   */
  const intervalosS = [60, 60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60];
  const l = leituraPecaAPeca({ marcasMs: marcasDe(intervalosS, 30), taktMs: 65000 });

  it('media, normal e lacuna batem com a conta a mao', () => {
    expect(l.suficiente).toBe(true);
    expect(l.n).toBe(13);
    expect(l.mediaMs).toBeCloseTo(920000 / 13, 6);
    expect(l.normalMs).toBe(60000);
    expect(l.limiteLacunaMs).toBe(120000);
    expect(l.lacunas).toEqual([{ indice: 6, ms: 200000 }]);
    expect(l.excessoMs).toBe(140000);
    expect(l.pecasNoExcesso).toBeCloseTo(2.333, 3);
    expect(l.maiorMs).toBe(200000);
    expect(l.menorMs).toBe(60000);
  });

  it('contra o takt vai a MEDIA, com a lacuna dentro; sem ela, o "se nao parasse"', () => {
    expect(l.mediaVsTaktPct).toBeCloseTo(((920 / 13) / 65 - 1) * 100, 6);
    expect(l.mediaVsTaktPct).toBeGreaterThan(0);
    expect(l.normalVsTaktPct).toBeCloseTo(-7.6923, 3);
  });

  it('sem takt, a leitura existe e a comparacao fica vazia — nunca zero', () => {
    const semTakt = leituraPecaAPeca({ marcasMs: marcasDe(intervalosS) });
    expect(semTakt.taktMs).toBeNull();
    expect(semTakt.mediaVsTaktPct).toBeNull();
    expect(semTakt.normalVsTaktPct).toBeNull();
  });

  it('o criterio e declarado junto com a leitura', () => {
    expect(l.criterios).toBe(CRITERIOS_INTERVALOS);
    expect(CRITERIOS_INTERVALOS.fatorLacuna).toBe(2);
  });
});

/**
 * Os tres casos da revisao de 19/10, em que a MEDIANA mentia. Ficam como
 * trava: qualquer volta para medida de posicao quebra aqui.
 */
describe('volume em par e ritmo misto — o que a mediana errava', () => {
  it('rack de 2 volumes saindo colados (25 s / 100 s): nenhuma lacuna, e atende o takt de 72 s', () => {
    // 7 x 25 + 6 x 100 = 775 s em 13 intervalos = 59,6 s por volume.
    const l = leituraPecaAPeca({ marcasMs: marcasDe(alternados(25, 100, 13)), taktMs: 72000 });
    expect(l.lacunas).toEqual([]);
    expect(l.mediaMs).toBeCloseTo(775000 / 13, 6);
    expect(l.mediaMs).toBeLessThan(72000);
  });

  it('60 s e 115 s misturados: a linha e 31% MAIS LENTA que o takt de 65 s', () => {
    // 7 x 60 + 6 x 115 = 1.110 s / 13 = 85,4 s por volume.
    const l = leituraPecaAPeca({ marcasMs: marcasDe(alternados(60, 115, 13)), taktMs: 65000 });
    expect(l.mediaMs).toBeCloseTo(1110000 / 13, 6);
    expect(l.mediaVsTaktPct).toBeCloseTo(31.36, 1);
    expect(l.lacunas).toEqual([]);
  });

  it('70 s e 40 s misturados: a linha ACOMPANHA o takt de 65 s', () => {
    // 7 x 70 + 6 x 40 = 730 s / 13 = 56,2 s por volume.
    const l = leituraPecaAPeca({ marcasMs: marcasDe(alternados(70, 40, 13)), taktMs: 65000 });
    expect(l.mediaMs).toBeLessThan(65000);
    expect(l.mediaVsTaktPct).toBeCloseTo(-13.6, 1);
  });

  it('uma parada enorme nao esconde a menor ao lado dela', () => {
    // 12 x 60, 1.200 s e 200 s. Na 1a volta a media (151 s) so' pega os
    // 1.200; sem eles o normal cai para 70,8 s e os 200 s aparecem.
    const l = leituraPecaAPeca({
      marcasMs: marcasDe([60, 60, 60, 60, 60, 60, 1200, 60, 60, 60, 60, 60, 60, 200]),
    });
    expect(l.lacunas.map((x) => x.ms)).toEqual([1200000, 200000]);
    expect(l.normalMs).toBe(60000);
  });
});

/**
 * O VEREDITO E' DO PERIODO, paradas dentro — a mesma regua do veredito da
 * semana. Caso da revisao de 19/10: comparar com a linha RODANDO fazia
 * apertar "Parou" melhorar o veredito.
 */
describe('contra o takt vai o periodo, paradas dentro', () => {
  // 13 volumes a cada 60 s e uma parada de 21 min: ~33 min de periodo.
  const duracaoMs = (13 * 60 + 1260) * 1000;

  it('periodo por volume = duracao / volumes', () => {
    expect(periodoPorPeca({ duracaoMs, pecas: 13 })).toBeCloseTo(duracaoMs / 13, 6);
    expect(periodoPorPeca({ duracaoMs: 0, pecas: 13 })).toBeNull();
    expect(periodoPorPeca({ duracaoMs, pecas: 0 })).toBeNull();
  });

  it('marcar a parada NAO melhora o veredito: o periodo e o mesmo', () => {
    const periodo = periodoPorPeca({ duracaoMs, pecas: 13 });
    // Sem marcar: a parada fica num intervalo. Marcada: sai do relogio rodando.
    const semMarcar = leituraPecaAPeca({
      marcasMs: marcasDe([...Array(12).fill(60), 1260]), taktMs: 72000, periodoPorPecaMs: periodo,
    });
    const marcada = leituraPecaAPeca({
      marcasMs: marcasDe(Array(13).fill(60)), taktMs: 72000, periodoPorPecaMs: periodo,
    });
    expect(semMarcar.periodoVsTaktPct).toBeCloseTo(marcada.periodoVsTaktPct, 9);
    expect(marcada.periodoVsTaktPct).toBeGreaterThan(100); // ~2.040 s / 13 = 157 s contra 72 s
    // As camadas dizem de onde vem: marcada, rodando ja' fica dentro do takt.
    expect(marcada.mediaMs).toBe(60000);
  });

  it('com setup PLANEJADO, o setup medido sai do periodo (nao conta duas vezes)', () => {
    const base = { duracaoMs: 3600000, pecas: 50, setupMedidoMs: 600000 };
    expect(periodoPorPeca(base)).toBe(72000);
    expect(periodoPorPeca({ ...base, setupPlanejado: true })).toBe(60000);
  });

  it('o takt da medicao diz se ha setup planejado', () => {
    const demandas = [{ ano: 2026, numero: 43, pecas: 2200, inicio: '2026-10-19' }];
    const sem = taktDaMedicao({ demandas, horas: 44, maquinas: 1, data: '2026-10-21T13:00:00Z', pecas: 1, duracaoMs: 1 });
    const com = taktDaMedicao({
      demandas, horas: 44, maquinas: 1, data: '2026-10-21T13:00:00Z', pecas: 1, duracaoMs: 1,
      setup: { setupsDia: 2, dias: 5, minutos: 15 },
    });
    expect(sem.setupPlanejado).toBe(false);
    expect(com.setupPlanejado).toBe(true);
    // (44 - 2 x 5 x 15 / 60) h x 3.600.000 / 2.200 = 41,5 h -> 67.909 ms
    expect(com.taktMs).toBeCloseTo((41.5 * 3600000) / 2200, 6);
  });
});

describe('o que o toque conta', () => {
  it('embalagem conta volume; o resto, peca', () => {
    expect(unidadeDoPosto('EMBALAGEM').plural).toBe('volumes');
    expect(unidadeDoPosto('EMBALAGEM').comArtigo).toBe('um volume');
    expect(unidadeDoPosto('Embalagem Linha 2').abrev).toBe('vol');
    expect(unidadeDoPosto('FURADEIRA').plural).toBe('peças');
    expect(unidadeDoPosto(null).singular).toBe('peça');
  });
});

describe('o takt da semana de uma medicao', () => {
  /**
   * Programa da embalagem colado em VOLUMES: 2.200 volumes na semana que
   * comeca em 19/10, 44 h, uma linha, sem setup planejado.
   *   takt = 44 h x 3.600.000 / 2.200 = 72.000 ms (72 s por volume)
   */
  const demandas = [
    { ano: 2026, numero: 43, pecas: 2200, inicio: '2026-10-19' },
    { ano: 2026, numero: 44, pecas: 4400, inicio: '2026-10-26' },
  ];

  it('vem da semana em que a medicao aconteceu', () => {
    const t = taktDaMedicao({
      demandas, horas: 44, maquinas: 1,
      data: '2026-10-21T13:00:00Z', pecas: 50, duracaoMs: 3600000,
    });
    expect(t.taktMs).toBe(72000);
    expect(t.estado).toBe('pronto');
  });

  it('semana seguinte, programa seguinte — nao a ultima cadastrada', () => {
    const t = taktDaMedicao({
      demandas, horas: 44, maquinas: 1,
      data: '2026-10-27T13:00:00Z', pecas: 50, duracaoMs: 3600000,
    });
    expect(t.taktMs).toBe(36000);
  });

  it('sem jornada nao ha takt, e o estado diz o que falta', () => {
    const t = taktDaMedicao({
      demandas, horas: null, maquinas: 1,
      data: '2026-10-21T13:00:00Z', pecas: 50, duracaoMs: 3600000,
    });
    expect(t.taktMs).toBeNull();
    expect(t.estado).toBe('sem-horas');
  });

  it('sem programa nao ha takt', () => {
    const t = taktDaMedicao({
      demandas: [], horas: 44, maquinas: 1,
      data: '2026-10-21T13:00:00Z', pecas: 50, duracaoMs: 3600000,
    });
    expect(t.taktMs).toBeNull();
    expect(t.estado).toBe('sem-demanda');
  });
});
