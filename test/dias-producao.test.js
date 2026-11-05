/**
 * DIAS DE PRODUCAO DA SEMANA DIGITADA (v2.101.0) e o PERIODO sem dia
 * repetido entre semanas.
 *
 * O caso que motivou, com os numeros do banco em 05/11/2026 (contas de mao):
 *  grupo EMBALAGEM: 44 h por semana, 5 dias, 10 setups/dia de 9 min
 *    -> setup da semana = 10 x 5 x 9 / 60 = 7,5 h
 *  038-26: inicio 03/11 (Finados na segunda), 7.222 volumes, 4 dias
 *    semana inteira (antes): 44 - 7,5 = 36,5 h -> 36,5 x 3600 / 7222 = 18,19 s
 *    4 de 5 dias (agora):    35,2 - 6,0 = 29,2 h -> 29,2 x 3600 / 7222 = 14,56 s
 */
import { describe, expect, it } from 'vitest';
import { fracaoDaSemana } from '../src/domain/demanda/capacidade.js';
import { periodosDoPrograma, semanaQueContem } from '../src/domain/demanda/calendario.js';
import { taktDaMedicao } from '../src/domain/demandaSemanal.js';

const GRUPO = { horas: 44, maquinas: 1, setup: { setupsDia: 10, dias: 5, minutos: 9 } };
const S38 = { ano: 2026, numero: 38, pecas: 7222, inicio: '2026-11-03' };
const S39 = { ano: 2026, numero: 39, pecas: 11855, inicio: '2026-11-09' };
const takt = (semana, data = '2026-11-05T15:00:00Z') => taktDaMedicao({
  demandas: [semana, S39], ...GRUPO, data, pecas: 1, duracaoMs: 3600000,
});

describe('fracaoDaSemana com os dias digitados', () => {
  it('a semana digitada com 4 dias vale 4 de 5 da jornada', () => {
    expect(fracaoDaSemana({ diasProducao: 4 }, 5)).toEqual({ fator: 0.8, programados: 4, daJornada: 5 });
  });
  it('sem dias digitados, a semana inteira, como sempre', () => {
    expect(fracaoDaSemana({ diasProducao: null }, 5)).toEqual({ fator: 1, programados: null, daJornada: 5 });
  });
  it('os dias da planilha mandam sobre os digitados', () => {
    expect(fracaoDaSemana({ dias: 3, diasProducao: 4 }, 5).programados).toBe(3);
  });
  it('dia alem da jornada nao vira hora: hora extra nao e capacidade do takt', () => {
    expect(fracaoDaSemana({ diasProducao: 6 }, 5)).toEqual({ fator: 1, programados: 5, daJornada: 5 });
  });
});

describe('takt da semana digitada com feriado', () => {
  it('sem os dias: a jornada inteira, 18,19 s', () => {
    expect(takt(S38).taktMs).toBeCloseTo((36.5 * 3600000) / 7222, 3);
  });
  it('com 4 dias: 29,2 h, 14,56 s — as horas e o setup caem na mesma proporcao', () => {
    const t = takt({ ...S38, diasProducao: 4 });
    expect(t.taktMs).toBeCloseTo((29.2 * 3600000) / 7222, 3);
    expect(t.dias).toEqual({ programados: 4, daJornada: 5 });
  });
});

describe('periodo da semana sem dia repetido', () => {
  it('a 038-26 termina na vespera da 039-26 (08/11), nao no dia 09 que e da seguinte', () => {
    const [p38, p39] = periodosDoPrograma([S39, S38]);
    expect(p38.inicio.toISOString().slice(0, 10)).toBe('2026-11-03');
    expect(p38.fim.toISOString().slice(0, 10)).toBe('2026-11-08');
    expect(p39.fim.toISOString().slice(0, 10)).toBe('2026-11-15');
  });
  it('a segunda 09/11 cai na 039-26; o sabado 07/11, na 038-26', () => {
    expect(semanaQueContem([S38, S39], '2026-11-09T15:00:00Z').numero).toBe(39);
    expect(semanaQueContem([S38, S39], '2026-11-07T15:00:00Z').numero).toBe(38);
  });
  it('encurtar nunca estica: sem a seguinte, sete dias; com a seguinte longe, sete dias', () => {
    const [so] = periodosDoPrograma([S38]);
    expect(so.fim.toISOString().slice(0, 10)).toBe('2026-11-09');
    const [p38] = periodosDoPrograma([S38, { ...S39, inicio: '2026-11-23' }]);
    expect(p38.fim.toISOString().slice(0, 10)).toBe('2026-11-09');
  });
});
