/**
 * O interpretador da colagem da planilha de demanda.
 *
 * A colagem real do PCP e' a fixture principal: cabecalho, 36 semanas com
 * cinco lotes, linha em branco e quatro linhas de rodape. Se ele so'
 * funcionasse com a planilha limpa que um teste inventa, quebraria na
 * primeira vez que alguem colasse a de verdade.
 */
import { describe, expect, it } from 'vitest';
import {
  chaveSemana, interpretarColagem, lerCodigoSemana, maquinasNecessarias, numeroPtBr,
  ordenarSemanas, resumoDaDemanda, ritmoExigido,
} from '../src/domain/demandaSemanal.js';

const COLAGEM_REAL = `SEMANA	LOTE 1	LOTE 2	LOTE 3	LOTE 4	LOTE 5	TOTAL SEMANA	MÉDIA / LOTE
001-26	25.000	27.750	34.900	28.650	11.950	128.250	25.650
002-26	27.250	19.850	13.473	12.000	33.000	105.573	21.115
003-26	39.500	8.777	23.700	26.050	30.550	128.577	25.715
011-26	11.450	14.550	18.600	13.600	6.550	64.750	12.950
018-26	20.050	23.300	27.626	37.150	26.460	134.586	26.917
036-26	15.514	26.200	11.500	16.450	14.200	83.864	16.773

TOTAL ACUMULADO	3.855.110
MÉDIA SEMANAL	107.086
MAIOR SEMANA	134.586	018-26
MENOR SEMANA	64.750	011-26`;

describe('numeros da planilha', () => {
  it('ponto e separador de milhar, nao decimal', () => {
    expect(numeroPtBr('128.250')).toBe(128250);
    expect(numeroPtBr('3.855.110')).toBe(3855110);
    expect(numeroPtBr('64750')).toBe(64750);
  });

  it('virgula e decimal, e peca e inteira', () => {
    expect(numeroPtBr('1.234,6')).toBe(1235);
    expect(numeroPtBr('21.115,0')).toBe(21115);
  });

  it('o que nao e numero devolve null, sem inventar zero', () => {
    expect(numeroPtBr('')).toBe(null);
    expect(numeroPtBr('018-26')).toBe(null);
    expect(numeroPtBr('TOTAL')).toBe(null);
    expect(numeroPtBr(null)).toBe(null);
  });
});

describe('codigo da semana', () => {
  it('le o formato do PCP', () => {
    expect(lerCodigoSemana('001-26')).toEqual({ ano: 2026, numero: 1 });
    expect(lerCodigoSemana('36-26')).toEqual({ ano: 2026, numero: 36 });
    expect(lerCodigoSemana('01/2027')).toEqual({ ano: 2027, numero: 1 });
  });

  it('recusa semana que nao existe', () => {
    expect(lerCodigoSemana('000-26')).toBe(null);
    expect(lerCodigoSemana('054-26')).toBe(null);
    expect(lerCodigoSemana('abc')).toBe(null);
    expect(lerCodigoSemana('')).toBe(null);
  });

  it('volta a escrever como o PCP escreve', () => {
    expect(chaveSemana({ ano: 2026, numero: 1 })).toBe('001-26');
    expect(chaveSemana({ ano: 2026, numero: 36 })).toBe('036-26');
  });

  it('ordena no tempo, virando o ano', () => {
    const fora = [{ ano: 2027, numero: 1 }, { ano: 2026, numero: 36 }, { ano: 2026, numero: 1 }];
    expect(ordenarSemanas(fora).map(chaveSemana)).toEqual(['001-26', '036-26', '001-27']);
  });
});

describe('colagem da planilha do PCP', () => {
  const { semanas, avisos } = interpretarColagem(COLAGEM_REAL);

  it('le uma linha por semana, ignorando cabecalho e rodape', () => {
    expect(semanas.map((s) => s.chave)).toEqual(
      ['001-26', '002-26', '003-26', '011-26', '018-26', '036-26'],
    );
  });

  it('pega a coluna TOTAL SEMANA, nao a MEDIA POR LOTE', () => {
    expect(semanas[0].pecas).toBe(128250);
    expect(semanas[5].pecas).toBe(83864);
  });

  it('TOTAL ACUMULADO e MEDIA SEMANAL nao viram semana nem aviso', () => {
    expect(semanas.some((s) => s.pecas === 3855110)).toBe(false);
    expect(avisos).toEqual([]);
  });

  it('a soma dos lotes confere com o total de cada semana', () => {
    // 20.050 + 23.300 + 27.626 + 37.150 + 26.460 = 134.586
    expect(semanas.find((s) => s.chave === '018-26').pecas).toBe(134586);
  });
});

describe('colagem torta', () => {
  it('avisa quando o total nao bate com a soma dos lotes', () => {
    const { semanas, avisos } = interpretarColagem(
      'SEMANA\tLOTE 1\tLOTE 2\tTOTAL SEMANA\n004-26\t10.000\t10.000\t25.000',
    );
    expect(semanas[0].pecas).toBe(25000);
    expect(avisos[0]).toMatch(/não bate com a soma dos lotes/);
  });

  it('sem cabecalho, duas colunas bastam', () => {
    const { semanas, avisos } = interpretarColagem('005-26\t122.500\n006-26\t114.228');
    expect(semanas.map((s) => s.pecas)).toEqual([122500, 114228]);
    expect(avisos).toEqual([]);
  });

  it('sem cabecalho e com varios numeros, nao adivinha qual e o total', () => {
    const { semanas, avisos } = interpretarColagem('005-26\t25.000\t27.750\t52.750');
    expect(semanas).toEqual([]);
    expect(avisos[0]).toMatch(/sem quantidade legível/);
  });

  it('linha que parece semana e nao e vira aviso, e o resto e importado', () => {
    const { semanas, avisos } = interpretarColagem('005-26\t122.500\n5/2026x\t99\n006-26\t114.228');
    expect(semanas.map((s) => s.chave)).toEqual(['005-26', '006-26']);
    expect(avisos[0]).toMatch(/não parece uma semana/);
  });

  it('semana repetida com quantidade diferente fica a ultima, com aviso', () => {
    const { semanas, avisos } = interpretarColagem('005-26\t122.500\n005-26\t130.000');
    expect(semanas).toHaveLength(1);
    expect(semanas[0].pecas).toBe(130000);
    expect(avisos[0]).toMatch(/duas vezes/);
  });

  it('colagem vazia nao e erro: nao ha o que importar', () => {
    expect(interpretarColagem('')).toEqual({ semanas: [], avisos: [] });
    expect(interpretarColagem(null)).toEqual({ semanas: [], avisos: [] });
  });
});

describe('leitura do programa', () => {
  const { semanas } = interpretarColagem(COLAGEM_REAL);
  const r = resumoDaDemanda(semanas);

  it('conta as semanas e acha os extremos', () => {
    expect(r.n).toBe(6);
    expect(r.maior.chave).toBe('018-26');
    expect(r.menor.chave).toBe('011-26');
  });

  it('a media e a das semanas lidas', () => {
    const soma = 128250 + 105573 + 128577 + 64750 + 134586 + 83864;
    expect(r.media).toBeCloseTo(soma / 6, 6);
  });

  it('o CV mede a variacao — e e ele que justifica guardar por semana', () => {
    expect(r.cvPct).toBeGreaterThan(20);
  });

  it('sem semana nenhuma nao ha leitura', () => {
    expect(resumoDaDemanda([])).toBe(null);
    expect(resumoDaDemanda(null)).toBe(null);
  });
});

describe('o que a demanda exige', () => {
  it('tres furadeiras a 44 h somam 132 horas-maquina na semana', () => {
    const r = ritmoExigido({ pecas: 107086, horas: 44, maquinas: 3 });
    expect(r.horasDisponiveis).toBe(132);
    // 107.086 / 132 = 811,3 pecas por hora-maquina
    expect(r.pecasPorHoraMaquina).toBeCloseTo(811.26, 1);
    // O grupo inteiro, por hora de relogio: 107.086 / 44 = 2.434 pc/h
    expect(r.pecasPorHoraGrupo).toBeCloseTo(2433.77, 1);
    // Takt por maquina: 3.600.000 / 811,26 = 4.437 ms
    expect(r.taktMs).toBeCloseTo(4437.6, 0);
  });

  it('uma maquina so: o ritmo do grupo e o da maquina', () => {
    const r = ritmoExigido({ pecas: 44000, horas: 44, maquinas: 1 });
    expect(r.pecasPorHoraMaquina).toBe(1000);
    expect(r.pecasPorHoraGrupo).toBe(1000);
    expect(r.taktMs).toBe(3600);
  });

  it('sem horas nao ha takt — e nao ha jornada presumida', () => {
    expect(ritmoExigido({ pecas: 107086, horas: 0, maquinas: 3 })).toBe(null);
    expect(ritmoExigido({ pecas: 107086, maquinas: 3 })).toBe(null);
    expect(ritmoExigido({ pecas: 0, horas: 44, maquinas: 3 })).toBe(null);
    expect(ritmoExigido({ pecas: 107086, horas: 44, maquinas: 0 })).toBe(null);
    expect(ritmoExigido()).toBe(null);
  });

  it('quantas maquinas o ritmo medido exige', () => {
    // 107.086 pecas / (44 h x 800 pc/h) = 3,04 furadeiras
    expect(maquinasNecessarias({ pecas: 107086, horas: 44, ritmoMedido: 800 })).toBeCloseTo(3.04, 2);
    // Na semana de pico o mesmo posto precisa de quase quatro
    expect(maquinasNecessarias({ pecas: 134586, horas: 44, ritmoMedido: 800 })).toBeCloseTo(3.82, 2);
  });

  it('sem ritmo medido nao da para dizer quantas maquinas', () => {
    expect(maquinasNecessarias({ pecas: 107086, horas: 44, ritmoMedido: 0 })).toBe(null);
    expect(maquinasNecessarias()).toBe(null);
  });
});
