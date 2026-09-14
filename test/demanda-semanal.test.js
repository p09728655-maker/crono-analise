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
  chaveSemana, interpretarColagem, intervaloIso, lerCodigoSemana, maquinasNecessarias, numeroPtBr,
  leituraDaDemanda, ordenarSemanas, resumoDaDemanda, ritmoExigido, semanaIso, vereditoDaSemana,
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

/**
 * A planilha COMPLETA do PCP, com as duas colunas que ja' se confundiram:
 * SEMANA (S02, S04... o calendario, que pula semana sem programa) e
 * Nº PLANILHA (001-26... um contador sequencial). Ler a segunda punha o
 * programa da S39 como semana 36 — tres semanas de deslocamento.
 */
const COLAGEM_COMPLETA = `SEMANA	Nº PLANILHA	LOTE 1	LOTE 2	LOTE 3	LOTE 4	LOTE 5	TOTAL SEMANA
S02	001-26	25.000	27.750	34.900	28.650	11.950	128.250
S04	002-26	27.250	19.850	13.473	12.000	33.000	105.573
S22	020-26	20.000	27.500	19.700	18.300	34.000	119.500
S24	021-26	16.100	27.450	28.600	14.500	22.400	109.050
S39	036-26	15.514	26.200	11.500	16.450	14.200	83.864`;

describe('as duas colunas de semana da planilha do PCP', () => {
  const { semanas, avisos } = interpretarColagem(COLAGEM_COMPLETA);

  it('le a coluna SEMANA, nao a Nº PLANILHA', () => {
    expect(semanas.map((s) => s.chave)).toEqual(
      ['002-26', '004-26', '022-26', '024-26', '039-26'],
    );
  });

  it('e avisa que ignorou a coluna de planilha — nunca em silencio', () => {
    expect(avisos.some((a) => /Nº PLANILHA foi ignorada/.test(a))).toBe(true);
  });

  it('o ano vem do "-26" da propria linha, porque "S02" nao traz ano', () => {
    expect(semanas.every((s) => s.ano === 2026)).toBe(true);
  });

  it('as quantidades continuam saindo da coluna TOTAL SEMANA', () => {
    expect(semanas[0].pecas).toBe(128250);
    expect(semanas[4].pecas).toBe(83864);
  });

  it('a semana pulada fica pulada: S23 nao existe no programa', () => {
    expect(semanas.some((s) => s.numero === 23)).toBe(false);
    expect(semanas.some((s) => s.numero === 22)).toBe(true);
    expect(semanas.some((s) => s.numero === 24)).toBe(true);
  });

  it('a soma dos lotes confere com o total, com a coluna de planilha no meio', () => {
    // 20.000 + 27.500 + 19.700 + 18.300 + 34.000 = 119.500 (S22)
    expect(avisos.some((a) => /não bate com a soma dos lotes/.test(a))).toBe(false);
  });
});

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

  it('le "S02" quando alguem informa o ano — e recusa sem ele', () => {
    expect(lerCodigoSemana('S02', { ano: 2026 })).toEqual({ ano: 2026, numero: 2 });
    expect(lerCodigoSemana('SEM 39', { ano: 2026 })).toEqual({ ano: 2026, numero: 39 });
    expect(lerCodigoSemana('semana 4', { ano: 2026 })).toEqual({ ano: 2026, numero: 4 });
    // Sem ano nao ha' semana: inventar o ano vira comparacao com o programa
    // de outro ano, calada.
    expect(lerCodigoSemana('S02')).toBe(null);
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

  it('sem cabecalho, o total e a coluna que FECHA A SOMA das anteriores', () => {
    // 25.000 + 27.750 = 52.750 — so' a terceira coluna fecha.
    const { semanas, avisos } = interpretarColagem('005-26\t25.000\t27.750\t52.750');
    expect(semanas[0].pecas).toBe(52750);
    expect(avisos).toEqual([]);
  });

  it('a planilha inteira colada SEM cabecalho e lida, com a media por lote no fim', () => {
    /**
     * O caso real: quem copia as linhas no Excel raramente leva o cabecalho
     * junto. Aqui ha' cinco lotes, o TOTAL e a MEDIA/LOTE — so' o total
     * fecha a soma dos cinco; a media nao fecha nada.
     */
    const { semanas, avisos } = interpretarColagem([
      'S02\t25.000\t27.750\t34.900\t28.650\t11.950\t128.250\t25.650',
      'S39\t15.514\t26.200\t11.500\t16.450\t14.200\t83.864\t16.773',
    ].join('\n'), { ano: 2026 });
    expect(semanas.map((x) => `${x.chave}=${x.pecas}`)).toEqual(['002-26=128250', '039-26=83864']);
    expect(avisos).toEqual([]);
  });

  it('quando nenhuma coluna fecha a soma, pede o cabecalho — uma vez, nao por linha', () => {
    const { semanas, avisos } = interpretarColagem([
      'S02\t25.000\t27.750\t34.900',
      'S04\t27.250\t19.850\t13.473',
    ].join('\n'), { ano: 2026 });
    expect(semanas).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/2 linha\(s\).*Cole junto o cabeçalho/s);
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

describe('a semana de uma medicao', () => {
  it('semana ISO comeca na segunda', () => {
    // 14/09/2026 e uma segunda-feira: abre a semana 38.
    expect(semanaIso(new Date('2026-09-14T10:00:00-03:00'))).toEqual({ ano: 2026, numero: 38 });
    // Domingo 13/09 ainda fecha a semana 37.
    expect(semanaIso(new Date('2026-09-13T10:00:00-03:00'))).toEqual({ ano: 2026, numero: 37 });
  });

  it('usa o dia da FABRICA, nao o do navegador', () => {
    /**
     * Domingo 13/09 as 23h em Sao Paulo e' segunda 02h em UTC. Pelo relogio
     * do navegador a medicao pularia para a semana seguinte e seria
     * comparada com o programa errado.
     */
    expect(semanaIso(new Date('2026-09-13T23:00:00-03:00'))).toEqual({ ano: 2026, numero: 37 });
  });

  it('a virada do ano cai na semana da quinta-feira', () => {
    // 01/01/2026 e quinta: semana 1 de 2026, e 31/12/2025 (quarta) tambem.
    expect(semanaIso(new Date('2026-01-01T09:00:00-03:00'))).toEqual({ ano: 2026, numero: 1 });
    expect(semanaIso(new Date('2025-12-31T09:00:00-03:00'))).toEqual({ ano: 2026, numero: 1 });
  });

  it('data invalida nao vira semana', () => {
    expect(semanaIso(new Date('nada'))).toBe(null);
    expect(semanaIso('2026-13-45')).toBe(null);
  });

  it('o intervalo da semana vai de segunda a domingo', () => {
    const { inicio, fim } = intervaloIso({ ano: 2026, numero: 38 });
    expect(inicio.toISOString().slice(0, 10)).toBe('2026-09-14');
    expect(fim.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('a semana 1 de 2026 comeca em 29/12/2025', () => {
    expect(intervaloIso({ ano: 2026, numero: 1 }).inicio.toISOString().slice(0, 10))
      .toBe('2025-12-29');
  });

  it('semana que nao existe nao tem intervalo', () => {
    expect(intervaloIso({ ano: 2026, numero: 54 })).toBe(null);
    expect(intervaloIso()).toBe(null);
  });
});

describe('veredito da semana', () => {
  /* Programa de 107.086 pecas, 3 furadeiras a 44 h = 811 pc/h por maquina. */
  const base = { pecas: 107086, horas: 44, maquinas: 3 };

  it('o que decide e o ritmo de RELOGIO, com as paradas dentro', () => {
    // 700 pc/h no relogio (850 rodando) nao alcanca os 811 exigidos.
    const v = vereditoDaSemana({ ...base, ritmoRelogio: 700, ritmoRodando: 850 });
    expect(v.atende).toBe(false);
    expect(v.folgaPct).toBeCloseTo(-13.7, 1);
    // 107.086 / (44 x 700) = 3,48 furadeiras
    expect(v.maquinasNecessarias).toBeCloseTo(3.48, 2);
    // Sem as paradas seriam 2,86: a diferenca e o que ha a ganhar no setup
    expect(v.maquinasSeNaoParasse).toBeCloseTo(2.86, 2);
  });

  it('atende quando o ritmo de relogio passa do exigido', () => {
    const v = vereditoDaSemana({ ...base, ritmoRelogio: 900, ritmoRodando: 900 });
    expect(v.atende).toBe(true);
    expect(v.folgaPct).toBeGreaterThan(10);
    expect(v.maquinasNecessarias).toBeLessThan(3);
  });

  it('sem ritmo medido ou sem horas nao ha veredito', () => {
    expect(vereditoDaSemana({ ...base, ritmoRelogio: 0 })).toBe(null);
    expect(vereditoDaSemana({ pecas: 107086, maquinas: 3, ritmoRelogio: 800 })).toBe(null);
    expect(vereditoDaSemana()).toBe(null);
  });

  it('sem o ritmo rodando o veredito sai mesmo assim, sem o "se nao parasse"', () => {
    const v = vereditoDaSemana({ ...base, ritmoRelogio: 700 });
    expect(v.atende).toBe(false);
    expect(v.ritmoRodando).toBe(null);
    expect(v.maquinasSeNaoParasse).toBe(null);
  });
});

describe('leitura da demanda para o relatorio', () => {
  const demandas = [
    { ano: 2026, numero: 36, pecas: 83864 },
    { ano: 2026, numero: 37, pecas: 100637 },
  ];
  const medicao = new Date('2026-09-09T08:00:00-03:00');   // quarta da semana 37

  it('sem programa cadastrado nao ha o que comparar', () => {
    expect(leituraDaDemanda({ demandas: [] }).estado).toBe('sem-demanda');
  });

  it('escolhe a semana da medicao mais recente, nao a ultima cadastrada', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-08-31T08:00:00-03:00'), medicao],
    });
    expect(l.semana.chave).toBe('037-26');
    expect(l.demanda).toBe(100637);
    expect(l.escolhaAutomatica).toBe(true);
    // As duas medicoes caem em semanas diferentes (36 e 37)
    expect(l.semanasMedidas).toBe(2);
  });

  it('a escolha do usuario manda sobre a data da medicao', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700, datas: [medicao],
      semanaEscolhida: { ano: 2026, numero: 36 },
    });
    expect(l.semana.chave).toBe('036-26');
    expect(l.demanda).toBe(83864);
    expect(l.escolhaAutomatica).toBe(false);
  });

  it('medicao de semana sem programa nao vira veredito com o programa de outra', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-16T08:00:00-03:00')],   // semana 38, nao cadastrada
    });
    expect(l.estado).toBe('sem-semana');
    expect(l.semana.chave).toBe('038-26');
    expect(l.veredito).toBe(null);
  });

  it('sem horas do grupo mostra a demanda e nao da veredito', () => {
    const l = leituraDaDemanda({ demandas, maquinas: 3, ritmoRelogio: 700, datas: [medicao] });
    expect(l.estado).toBe('sem-horas');
    expect(l.demanda).toBe(100637);
    expect(l.veredito).toBe(null);
  });

  it('com tudo no lugar, o veredito sai sobre o ritmo de relogio', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700, ritmoRodando: 850, datas: [medicao],
    });
    expect(l.estado).toBe('pronto');
    // 100.637 / (3 x 44) = 762 pc/h por maquina; 700 medidos nao alcancam
    expect(l.veredito.pecasPorHoraMaquina).toBeCloseTo(762.4, 1);
    expect(l.veredito.atende).toBe(false);
    expect(l.veredito.maquinasNecessarias).toBeCloseTo(3.27, 2);
  });

  it('o intervalo da semana acompanha, para a tela mostrar de quando e', () => {
    const l = leituraDaDemanda({ demandas, horas: 44, maquinas: 3, ritmoRelogio: 700, datas: [medicao] });
    expect(l.intervalo.inicio.toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});
