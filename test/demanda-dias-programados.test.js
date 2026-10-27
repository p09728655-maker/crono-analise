/**
 * Semana programada so' em parte (Finados, programa ainda sendo montado):
 * o takt usa as horas dos DIAS programados, nao a jornada inteira.
 *
 * Numeros conferidos a parte: 7.160 volumes em 4 dias, 44 h por semana de
 * 5 dias, uma linha -> 44 x 4/5 = 35,2 h = 126.720 s / 7.160 = 17,70 s.
 * Contra a jornada inteira seriam 22,12 s — 25% mais frouxo.
 */
import { describe, expect, it } from 'vitest';
import {
  diasProgramados, faixaDeSemanas, fracaoDaSemana, leituraDaDemanda, taktDaMedicao,
} from '../src/domain/demandaSemanal.js';

const FINADOS = {
  ano: 2026, numero: 45, inicio: '2026-11-02', pecas: 7160, dias: 4,
};
const takt = (semana, setup = { setupsDia: 0, dias: 5, minutos: 0 }) => taktDaMedicao({
  demandas: [semana], horas: 44, maquinas: 1, setup,
  data: '2026-11-04T13:00:00Z', pecas: 100, duracaoMs: 3600000,
});

describe('fracaoDaSemana', () => {
  it('dias programados sobre os dias da jornada; sem `dias`, a semana inteira', () => {
    expect(fracaoDaSemana({ dias: 4 }, 5)).toEqual({ fator: 0.8, programados: 4, daJornada: 5 });
    expect(fracaoDaSemana({}, 5).fator).toBe(1);
    expect(fracaoDaSemana(null, 5).fator).toBe(1);
  });
  it('sem os dias da jornada no cadastro nao ha fracao (nao presume 5); a colada nao precisa deles', () => {
    expect(fracaoDaSemana({ dias: 4 }, null)).toEqual({ fator: null, programados: 4, daJornada: null });
    expect(fracaoDaSemana({ dias: 5 }, '')).toMatchObject({ fator: null });
    expect(fracaoDaSemana({}, null).fator).toBe(1);
  });
  it('sabado de hora extra nao aumenta as horas: no maximo a jornada', () => {
    expect(fracaoDaSemana({ dias: 6 }, 5)).toMatchObject({ fator: 1, programados: 5 });
  });
});

describe('taktDaMedicao com a semana da planilha', () => {
  it('Finados: 7.160 volumes em 4 dias -> 17,70 s, nao 22,12 s', () => {
    const t = takt(FINADOS);
    expect(t.taktMs / 1000).toBeCloseTo(17.698, 2);
    expect(t.dias).toEqual({ programados: 4, daJornada: 5 });
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

describe('semana da planilha sem os dias de producao no cadastro', () => {
  const leitura = (dias) => leituraDaDemanda({
    demandas: [FINADOS], horas: 44, maquinas: 1, datas: ['2026-11-04T13:00:00Z'],
    ritmoRelogio: 200, setup: { setupsDia: 0, dias, minutos: 0 },
  });
  it("estado 'sem-dias', sem takt — nem o de 5 dias, nem o da semana inteira", () => {
    const l = leitura(null);
    expect(l.estado).toBe('sem-dias');
    expect(l.veredito).toBeNull();
    expect(l.demanda).toBe(7160);
    expect(takt(FINADOS, { setupsDia: 0, dias: null, minutos: 0 })).toMatchObject({ taktMs: null, estado: 'sem-dias' });
  });
  it('sem horas tambem: falta a jornada primeiro', () => {
    expect(leituraDaDemanda({
      demandas: [FINADOS], horas: null, maquinas: 1, datas: ['2026-11-04T13:00:00Z'], setup: { dias: null },
    }).estado).toBe('sem-horas');
  });
  it('a colada nao depende dos dias: segue com o takt da semana inteira', () => {
    const colada = { ...FINADOS, dias: undefined };
    expect(takt(colada, { setupsDia: 0, dias: null, minutos: 0 }).taktMs / 1000).toBeCloseTo(22.123, 2);
  });
});

describe('como a tela escreve as semanas', () => {
  it("'4 de 5 dias programados' so' na semana em parte", () => {
    expect(diasProgramados({ programados: 4, daJornada: 5 })).toBe('4 de 5 dias programados');
    expect(diasProgramados({ programados: 5, daJornada: 5 })).toBeNull();
    expect(diasProgramados({ programados: 4, daJornada: null })).toBeNull();
    expect(diasProgramados(null)).toBeNull();
  });
  it('a faixa escreve cada ponta pelo proprio tipo', () => {
    const lida = (inicio) => ({ ano: 2026, numero: 44, inicio, dias: 5 });
    const colada = { ano: 2026, numero: 43, inicio: '2026-10-19' };
    expect(faixaDeSemanas(lida('2026-10-26'), lida('2026-11-02'))).toBe('da semana de 26/10 à semana de 02/11');
    expect(faixaDeSemanas(colada, { ...colada, numero: 45 })).toBe('de 043-26 a 045-26');
    expect(faixaDeSemanas(colada, lida('2026-11-02'))).toBe('de 043-26 à semana de 02/11');
  });
});
