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
import { frasesVolumeAVolume, numerosDaLeitura } from '../src/domain/volumeAVolume.js';

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
 * O VEREDITO E' DO RELOGIO, paradas dentro, entre o primeiro e o ultimo
 * toque — a mesma regua do veredito da semana. Os testes conferem a FRASE
 * que a tela e a folha escrevem (frasesVolumeAVolume), nao um numero
 * intermediario: foi assim que a regua errada passou da primeira vez.
 */
const VOLUME = unidadeDoPosto('EMBALAGEM');
/** Uma sessao inteira: as marcas (relogio rodando) e o relogio entre toques. */
function frase({ rodandoS, relogioS, takt = 72000, setupNoTrechoS = 0, setupPlanejado = false }) {
  const marcasMs = marcasDe(rodandoS);
  const periodoPorPecaMs = periodoPorPeca({
    relogioEntreMarcasMs: relogioS * 1000, volumes: marcasMs.length,
    setupNoTrechoMs: setupNoTrechoS * 1000, setupPlanejado,
  });
  const leitura = leituraPecaAPeca({ marcasMs, taktMs: takt, periodoPorPecaMs });
  return frasesVolumeAVolume({ leitura, takt: { semana: '043-26' }, unidade: VOLUME });
}

describe('contra o takt vai o relogio entre o primeiro e o ultimo toque', () => {
  it('relogio / (N - 1): entre o primeiro e o ultimo toque ha N - 1 volumes', () => {
    expect(periodoPorPeca({ relogioEntreMarcasMs: 975000, volumes: 14 })).toBe(75000);
    expect(periodoPorPeca({ relogioEntreMarcasMs: 975000, volumes: 1 })).toBeNull();
    expect(periodoPorPeca({ relogioEntreMarcasMs: null, volumes: 14 })).toBeNull();
  });

  it('sem estaca de cerca: linha de 75 s em todos os volumes NAO passa no takt de 72 s', () => {
    // Revisao de 19/10: "duracao / N" dava 69,8 s e aprovava esta linha.
    const f = frase({ rodandoS: Array(13).fill(75), relogioS: 13 * 75 });
    expect(f.manchete).toBe('No período, saiu um volume a cada 75.0 s, paradas dentro — 4% acima do takt de 72.0 s.');
    expect(f.tom).toBe('falha');
    expect(f.linhas[0]).toMatch(/é o passo dela que está mais lento que o takt/);
  });

  it('marcar "Parou" NAO melhora o veredito — cada sessao com o seu proprio relogio', () => {
    // Linha de 60 s que parou 21 min. Sem marcar: a parada fica num
    // intervalo. Marcada: sai do relogio rodando, mas o relogio entre os
    // toques e' o mesmo — 13 x 60 + 1.260 = 2.040 s.
    const semMarcar = frase({ rodandoS: [...Array(12).fill(60), 1260], relogioS: 2040 });
    const marcada = frase({ rodandoS: Array(13).fill(60), relogioS: 13 * 60 + 1260 });
    expect(semMarcar.manchete).toBe(marcada.manchete);
    expect(marcada.manchete).toBe('No período, saiu um volume a cada 156.9 s, paradas dentro — 118% acima do takt de 72.0 s.');
    // E o diagnostico diz de onde veio, em cada caso.
    expect(marcada.linhas[0]).toMatch(/paradas marcadas nesta medição/);
    expect(semMarcar.linhas[0]).toMatch(/paradas que ninguém marcou/);
  });

  it('com setup PLANEJADO o setup DENTRO do trecho sai do relogio; sem planejado, fica', () => {
    // 51 volumes, 3.600 s entre o primeiro e o ultimo, 600 s de setup no meio.
    const base = { rodandoS: Array(50).fill(60), relogioS: 3600, setupNoTrechoS: 600 };
    expect(frase(base).manchete).toMatch(/a cada 72.0 s/);
    expect(frase({ ...base, setupPlanejado: true }).manchete).toMatch(/a cada 60.0 s/);
  });

  it('setup FORA do trecho (a troca antes do 1o volume) nao sai de um relogio que nunca o conteve', () => {
    // Revisao de 19/10: 10 min de troca antes do primeiro toque, descontados
    // do trecho, faziam esta linha de 75 s sair com 28,8 s e 60% de folga.
    // Fora do trecho, o setup no trecho e' zero — o veredito nao muda.
    const f = frase({ rodandoS: Array(13).fill(75), relogioS: 975, setupNoTrechoS: 0, setupPlanejado: true });
    expect(f.manchete).toBe('No período, saiu um volume a cada 75.0 s, paradas dentro — 4% acima do takt de 72.0 s.');
  });

  it('sem o relogio entre toques NAO ha veredito — nunca cai para a linha rodando', () => {
    const marcasMs = marcasDe(Array(13).fill(60));
    const leitura = leituraPecaAPeca({ marcasMs, taktMs: 72000, periodoPorPecaMs: null });
    const f = frasesVolumeAVolume({ leitura, unidade: VOLUME });
    expect(f.manchete).toBe('Com a linha rodando, saiu um volume a cada 60.0 s.');
    expect(f.linhas[0]).toMatch(/não há veredito contra o takt/);
    expect(numerosDaLeitura(leitura, {}, VOLUME)[0].valor).toBe('—');
  });

  it('os numeros tem chave fixa, e os dois tempos por volume dizem a regua no nome', () => {
    const marcasMs = marcasDe(Array(13).fill(60));
    const leitura = leituraPecaAPeca({ marcasMs, taktMs: 72000, periodoPorPecaMs: 60000 });
    const k = numerosDaLeitura(leitura, { semana: '043-26' }, VOLUME);
    // A tela escolhe destaque e apoio pela chave — a ordem e' a da folha.
    expect(k.map((x) => x.chave)).toEqual(['periodo', 'takt', 'rodando', 'normal', 'lacunas']);
    expect(k[0].rotulo).toBe('Por volume no período');
    expect(k[2].rotulo).toBe('Por volume com a linha rodando');
    // Sem lacuna, diz o que o criterio viu — nao que nao houve perda.
    expect(k[4].valor).toBe('0');
    expect(k[4].sub).toBe('nenhum intervalo passou de 2× o normal');
  });

  it('o takt da medicao diz se ha setup planejado — zero nao conta como planejado', () => {
    const demandas = [{ ano: 2026, numero: 43, pecas: 2200, inicio: '2026-10-19' }];
    const args = { demandas, horas: 44, maquinas: 1, data: '2026-10-21T13:00:00Z', pecas: 1, duracaoMs: 1 };
    expect(taktDaMedicao(args).setupPlanejado).toBe(false);
    expect(taktDaMedicao({ ...args, setup: { setupsDia: 0, dias: null, minutos: null } }).setupPlanejado).toBe(false);
    const com = taktDaMedicao({ ...args, setup: { setupsDia: 2, dias: 5, minutos: 15 } });
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
