/**
 * VOLUME A VOLUME — o intervalo entre um toque e o seguinte.
 *
 * As contas abaixo sao feitas a mao, com numeros redondos, para o teste
 * nao ficar certo junto com o codigo errado.
 */
import { describe, expect, it } from 'vitest';
import {
  CRITERIOS_INTERVALOS, MAX_MARCAS, intervalosEntreMarcas, leituraPecaAPeca, marcasValidas,
  unidadeDoPosto,
} from '../src/domain/cronoanalise.js';
import { taktDaMedicao } from '../src/domain/demandaSemanal.js';

/** Marcas a partir dos intervalos: [60, 60, 200] -> [0, 60, 120, 320] (em s). */
const marcasDe = (intervalosS, inicioS = 0) => {
  const marcas = [inicioS * 1000];
  for (const s of intervalosS) marcas.push(marcas[marcas.length - 1] + s * 1000);
  return marcas;
};

describe('as marcas que servem', () => {
  it('lista em ordem, uma por volume, dentro do periodo, volta limpa', () => {
    expect(marcasValidas([1000, 2000, 2000, 5000], { pecas: 4, duracaoMs: 6000 }))
      .toEqual([1000, 2000, 2000, 5000]);
  });

  it('contagem corrigida a mao (marcas != volumes) nao vira intervalo falso', () => {
    expect(marcasValidas([1000, 2000, 3000], { pecas: 4, duracaoMs: 6000 })).toBeNull();
  });

  it('fora de ordem, negativa, quebrada ou depois do fim do periodo: nenhuma', () => {
    expect(marcasValidas([2000, 1000], { pecas: 2 })).toBeNull();
    expect(marcasValidas([-1, 1000], { pecas: 2 })).toBeNull();
    expect(marcasValidas([1000.5, 2000], { pecas: 2 })).toBeNull();
    expect(marcasValidas(['x', 2000], { pecas: 2 })).toBeNull();
    expect(marcasValidas([1000, 7000], { pecas: 2, duracaoMs: 6000 })).toBeNull();
  });

  it('vazia, ausente ou maior que o teto: nenhuma', () => {
    expect(marcasValidas([], { pecas: 0 })).toBeNull();
    expect(marcasValidas(null)).toBeNull();
    expect(marcasValidas(new Array(MAX_MARCAS + 1).fill(0))).toBeNull();
  });
});

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
    expect(l.motivo).toMatch(/mínimo de 10/);
    expect(l.medianaMs).toBeUndefined();
  });

  /**
   * Doze volumes a cada 60 s e uma lacuna de 200 s no meio (13 intervalos).
   *   mediana     = 60 s
   *   limite      = 2 x 60 = 120 s  -> so' os 200 s passam
   *   excesso     = 200 - 60 = 140 s
   *   no excesso  = 140 / 60 = 2,33 volumes
   *   takt 65 s   -> so' a lacuna fica acima (1 de 13)
   *   mediana x takt = 60/65 - 1 = -7,69% (mais rapido que o takt)
   */
  const intervalosS = [60, 60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60];
  const l = leituraPecaAPeca({ marcasMs: marcasDe(intervalosS, 30), taktMs: 65000 });

  it('mediana e lacuna batem com a conta a mao', () => {
    expect(l.suficiente).toBe(true);
    expect(l.n).toBe(13);
    expect(l.medianaMs).toBe(60000);
    expect(l.limiteLacunaMs).toBe(120000);
    expect(l.lacunas).toEqual([{ indice: 6, ms: 200000 }]);
    expect(l.excessoMs).toBe(140000);
    expect(l.pecasNoExcesso).toBeCloseTo(2.333, 3);
    expect(l.maiorMs).toBe(200000);
    expect(l.menorMs).toBe(60000);
  });

  it('a regularidade e medida SEM a lacuna — ela ja e contada a parte', () => {
    // Todos os outros intervalos sao 60 s: a linha anda no mesmo passo.
    expect(l.cvPct).toBe(0);
    expect(l.estabilidade.nivel).toBe('estavel');
  });

  it('contra o takt, pela mediana — a lacuna nao faz a linha parecer lenta', () => {
    expect(l.acimaDoTakt).toBe(1);
    expect(l.acimaDoTaktPct).toBeCloseTo(100 / 13, 6);
    expect(l.medianaVsTaktPct).toBeCloseTo(-7.6923, 3);
  });

  it('sem takt, a leitura existe e a comparacao fica vazia — nunca zero', () => {
    const semTakt = leituraPecaAPeca({ marcasMs: marcasDe(intervalosS) });
    expect(semTakt.taktMs).toBeNull();
    expect(semTakt.acimaDoTakt).toBeNull();
    expect(semTakt.medianaVsTaktPct).toBeNull();
  });

  it('linha regular, sem lacuna nenhuma', () => {
    const regular = leituraPecaAPeca({ marcasMs: marcasDe(new Array(12).fill(50)) });
    expect(regular.lacunas).toEqual([]);
    expect(regular.excessoMs).toBe(0);
    expect(regular.cvPct).toBe(0);
    expect(regular.estabilidade.nivel).toBe('estavel');
  });

  it('o criterio e declarado junto com a leitura', () => {
    expect(l.criterios).toBe(CRITERIOS_INTERVALOS);
    expect(CRITERIOS_INTERVALOS.fatorLacuna).toBe(2);
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
