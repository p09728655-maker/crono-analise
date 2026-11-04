/**
 * O RESULTADO DE UMA MEDICAO SALVA NO TABLET (v2.100.0) — a mesma leitura
 * do volume a volume do PC, sobre a copia guardada no aparelho.
 *
 * Os numeros esperados sao contas de mao, nao o que a funcao devolve:
 *
 *  12 toques no relogio da linha rodando: 10 s, 20 s ... 110 s e 150 s.
 *  -> 11 intervalos: dez de 10 s e um de 40 s.
 *  Media de todos = 140 / 11 = 12,7 s; 40 s passa do dobro (25,5 s): lacuna.
 *  Sem ela o normal e' 10,0 s, e 40 s continua acima de 20 s. Excesso = 30 s.
 *  Relogio do 1o ao ultimo toque = 140 s de marcas + 60 s de parada marcada
 *  no cronometro = 200 s -> por volume no periodo = 200 / 11 = 18,2 s.
 *  Medicao inteira = 240 s: 10 s antes do 1o toque (o volume da largada) e
 *  30 s depois do ultimo.
 *  Deixaram de ser embalados, no passo de 10 s: paradas 60/10 = 6, lacunas
 *  30/10 = 3, fora dos toques (240 - 200 - 10)/10 = 3 -> 12; potencial
 *  240/10 = 24 = 12 que sairam + 12.
 */
import { describe, expect, it } from 'vitest';
import { unidadeDoPosto } from '../src/domain/cronoanalise.js';
import { frasesVolumeAVolume, numerosDaLeitura, semTakt } from '../src/domain/volumeAVolume.js';
import { comoConferencia, inicioDaSalva, leituraDaSalva } from '../src/features/coleta/embalagem/leituraSalva.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');
const MARCAS = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 150000];
const SALVA = {
  id: 'local-1',
  salvoEm: '2026-11-04T18:24:00.000Z',
  maquina: 'EMBALAGEM 01',
  peca: 'Rack Sirius 1.6',
  duracaoMs: 240000,
  pecas: 12,
  // A forma que o tablet grava (paradasEmMilissegundos).
  paradas: [{ motivo: 'falta-material', duracaoMs: 60000 }],
  marcasMs: MARCAS,
  marcasRelogioMs: 200000,
  marcasSetupMs: 0,
};

describe('inicioDaSalva', () => {
  it('e o salvo menos a duracao, como o servidor grava o iniciado_em', () => {
    expect(inicioDaSalva({ salvoEm: '2026-11-04T18:24:00.000Z', duracaoMs: 23 * 60000 }))
      .toBe('2026-11-04T18:01:00.000Z');
  });
  it('sem data salva nao inventa uma', () => {
    expect(inicioDaSalva({ duracaoMs: 1000 })).toBeNull();
  });
});

describe('leituraDaSalva', () => {
  it('poe o registro do aparelho na forma do banco', () => {
    expect(comoConferencia(SALVA)).toEqual({
      id: 'local-1', duracao_ms: 240000, pecas: 12, paradas: SALVA.paradas,
    });
  });

  it('as tres camadas e a lacuna batem com a conta de mao', () => {
    const { leitura } = leituraDaSalva(SALVA, { taktMs: 15000 });
    expect(leitura.suficiente).toBe(true);
    expect(leitura.periodoMs).toBeCloseTo(200000 / 11, 6);
    expect(leitura.mediaMs).toBeCloseTo(140000 / 11, 6);
    expect(leitura.normalMs).toBe(10000);
    expect(leitura.lacunas).toEqual([{ indice: 10, ms: 40000 }]);
    expect(leitura.excessoMs).toBe(30000);
  });

  it('o que deixou de ser embalado fecha com o total: 6 + 3 + 3 = 12 de 24', () => {
    const { deixou } = leituraDaSalva(SALVA, { taktMs: 15000 });
    expect(deixou.partes.paradas).toBe(6);
    expect(deixou.partes.lacunas).toBe(3);
    expect(deixou.partes.fora).toBe(3);
    expect(deixou.total).toBe(12);
    expect(deixou.saiu).toBe(12);
    expect(deixou.potencial).toBe(24);
  });

  it('o veredito e o do PC: periodo contra o takt, paradas dentro', () => {
    const { leitura } = leituraDaSalva(SALVA, { taktMs: 15000 });
    const frases = frasesVolumeAVolume({ leitura, takt: { taktMs: 15000 }, unidade: VOLUME });
    // 18,18 / 15 = 1,212 -> 21% acima; rodando 12,7 s fica dentro.
    expect(frases.tom).toBe('falha');
    expect(frases.manchete).toBe('No período, saiu um volume a cada 18.2 s, paradas dentro — 21% acima do takt de 15.0 s.');
    expect(frases.linhas[0]).toMatch(/^Com a linha rodando seriam 12\.7 s por volume, dentro do takt/);
  });

  it('com setup planejado, so o setup marcado entre os toques sai do periodo', () => {
    const comSetup = { ...SALVA, marcasSetupMs: 60000 };
    const { leitura } = leituraDaSalva(comSetup, { taktMs: 15000, setupPlanejado: true });
    expect(leitura.periodoMs).toBeCloseTo(140000 / 11, 6);
    // Sem setup planejado o mesmo setup fica no relogio.
    expect(leituraDaSalva(comSetup, { taktMs: 15000 }).leitura.periodoMs).toBeCloseTo(200000 / 11, 6);
  });

  it('contagem corrigida a mao (marcas que nao explicam a contagem): sem leitura, so a medicao inteira', () => {
    const r = leituraDaSalva({ ...SALVA, pecas: 20 }, { taktMs: 15000 });
    expect(r.comMarcas).toBe(false);
    expect(r.leitura).toBeNull();
    expect(r.deixou).toBeNull();
    // As paradas marcadas continuam valendo: 20 x 240/180 = 26,7 -> 27 - 20 = 7.
    expect(r.roubo.roubados).toBe(7);
  });

  it('medicao sem marca nenhuma nao quebra', () => {
    const r = leituraDaSalva({ ...SALVA, marcasMs: null, marcasRelogioMs: null, paradas: [] }, {});
    expect(r.leitura).toBeNull();
    expect(r.deixou).toBeNull();
    expect(r.roubo).toBeNull();
  });
});

describe('semTakt no tablet', () => {
  it('sem rede diz que falta rede, nao que a medicao nao tem data', () => {
    expect(semTakt('sem-rede')).toMatch(/sem rede/);
    expect(semTakt('carregando')).toMatch(/sendo buscado/);
    expect(semTakt('sem-rede')).not.toMatch(/não tem data/);
  });
  it('o cartao do takt sem rede nao diz "sem programa"', () => {
    const { leitura } = leituraDaSalva(SALVA, {});
    const takt = (estado) => numerosDaLeitura(leitura, { estado }, VOLUME).find((k) => k.chave === 'takt');
    expect(takt('sem-rede').sub).toMatch(/sem rede/);
    expect(takt('carregando').sub).toMatch(/buscando/);
    // O PC segue como sempre.
    expect(takt('sem-demanda').sub).toBe('sem programa para comparar');
  });
});
