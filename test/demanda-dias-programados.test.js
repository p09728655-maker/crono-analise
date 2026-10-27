/**
 * Semana programada so' em parte (Finados, programa ainda sendo montado):
 * o takt usa as horas dos DIAS programados, nao a jornada inteira.
 *
 * Numeros conferidos a parte: 7.160 volumes em 4 dias, 44 h por semana de
 * 5 dias, uma linha -> 44 x 4/5 = 35,2 h = 126.720 s / 7.160 = 17,70 s.
 * Contra a jornada inteira seriam 22,12 s — 25% mais frouxo.
 */
import { describe, expect, it } from 'vitest';
import { fracaoDaSemana, taktDaMedicao } from '../src/domain/demandaSemanal.js';

const FINADOS = {
  ano: 2026, numero: 45, inicio: '2026-11-02', pecas: 7160, dias: 4,
};
const takt = (semana, setup = { setupsDia: 0, dias: 5, minutos: 0 }) => taktDaMedicao({
  demandas: [semana], horas: 44, maquinas: 1, setup,
  data: '2026-11-04T13:00:00Z', pecas: 100, duracaoMs: 3600000,
});

describe('fracaoDaSemana', () => {
  it('dias programados sobre os dias da jornada; sem `dias`, a semana inteira', () => {
    expect(fracaoDaSemana({ dias: 4 }, 5)).toEqual({
      fator: 0.8, programados: 4, daJornada: 5, jornadaInformada: true,
    });
    expect(fracaoDaSemana({}, 5).fator).toBe(1);
    expect(fracaoDaSemana(null, 5).fator).toBe(1);
  });
  it("sem dias da jornada no cadastro, vale 5 — e diz que e' premissa", () => {
    expect(fracaoDaSemana({ dias: 4 }, null)).toMatchObject({ fator: 0.8, daJornada: 5, jornadaInformada: false });
  });
  it('sabado de hora extra nao aumenta as horas: no maximo a jornada', () => {
    expect(fracaoDaSemana({ dias: 6 }, 5)).toMatchObject({ fator: 1, programados: 5 });
  });
});

describe('taktDaMedicao com a semana da planilha', () => {
  it('Finados: 7.160 volumes em 4 dias -> 17,70 s, nao 22,12 s', () => {
    const t = takt(FINADOS);
    expect(t.taktMs / 1000).toBeCloseTo(17.698, 2);
    expect(t.dias).toEqual({ programados: 4, daJornada: 5, jornadaInformada: true });
    expect(t.jornadaPorMaquina).toBeCloseTo(35.2, 6);
    expect(t.semana).toBe('de 02/11');
  });

  it("o setup tambem e' so' dos dias programados, e a conta diz 4 dias", () => {
    const t = takt(FINADOS, { setupsDia: 2, dias: 5, minutos: 30 });
    expect(t.taktMs / 1000).toBeCloseTo(15.687, 2);
    expect(t.setupPorMaquina).toBeCloseTo(4, 6);
  });

  it('a semana colada (sem `dias`) nao muda nada: jornada inteira e o codigo do PCP', () => {
    const colada = {
      ano: 2026, numero: 45, inicio: '2026-11-02', pecas: 7160,
    };
    expect(takt(colada).taktMs / 1000).toBeCloseTo(22.123, 2);
    expect(takt(colada, { setupsDia: 2, dias: 5, minutos: 30 }).taktMs / 1000).toBeCloseTo(19.609, 2);
    expect(takt(colada).semana).toBe('045-26');
    expect(takt(colada).dias).toBeNull();
  });

  it('semana inteira programada: igual a de antes', () => {
    expect(takt({ ...FINADOS, dias: 5 }).taktMs).toBeCloseTo(takt({ ...FINADOS, dias: undefined }).taktMs, 6);
  });
});
