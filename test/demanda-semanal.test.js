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
  chaveSemana, comoDia, comoPeriodo, interpretarColagem, intervaloIso, lerCodigoSemana,
  lerDataPtBr, maquinasNecessarias, numeroPtBr, leituraDaDemanda, ordenarSemanas,
  periodoDaSemana, periodosDoPrograma, resumoDaDemanda, ritmoExigido, semanaIso,
  semanaQueContem, vereditoDaSemana,
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

/**
 * Os avisos MENOS o da coluna INICIO. Ele sai em toda colagem que nao
 * traz data, que e' quase toda colagem antiga destes testes — e o que
 * cada um deles afirma e' outra coisa. O aviso tem teste proprio abaixo.
 */
const semOAvisoDaData = (avisos) => avisos.filter((a) => !/INÍCIO/.test(a));

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

describe('colagem SEM cabecalho com as duas colunas', () => {
  /**
   * O caso que quebrou duas vezes: as linhas coladas direto do Excel, com
   * Nº PLANILHA na FRENTE e sem a linha de titulos. Sem cabecalho a regra
   * da coluna nao alcanca, e a primeira coluna venceria — a do contador.
   */
  const { semanas, avisos } = interpretarColagem([
    '001-26\tS02\t25.000\t27.750\t34.900\t28.650\t11.950\t128.250\t25.650',
    '020-26\tS22\t20.000\t27.500\t19.700\t18.300\t34.000\t119.500\t23.900',
    '036-26\tS39\t15.514\t26.200\t11.500\t16.450\t14.200\t83.864\t16.773',
  ].join('\n'));

  it('vale a coluna no formato S02, nao a primeira', () => {
    expect(semanas.map((x) => x.chave)).toEqual(['002-26', '022-26', '039-26']);
  });

  it('e o aviso diz qual coluna venceu e por que', () => {
    expect(avisos.some((a) => /formato S02/.test(a))).toBe(true);
  });

  it('o total continua saindo da coluna que fecha a soma dos lotes', () => {
    expect(semanas.map((x) => x.pecas)).toEqual([128250, 119500, 83864]);
  });

  it('sem coluna S nenhuma, "001-26" continua valendo como semana', () => {
    // Compatibilidade: quem exporta so' a coluna de semana no formato do
    // app nao pode deixar de funcionar.
    const r = interpretarColagem('001-26\t128.250\n002-26\t105.573');
    expect(r.semanas.map((x) => x.chave)).toEqual(['001-26', '002-26']);
    expect(semOAvisoDaData(r.avisos)).toEqual([]);
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
    expect(semOAvisoDaData(avisos)).toEqual([]);
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
    expect(semOAvisoDaData(avisos)).toEqual([]);
  });

  it('sem cabecalho, o total e a coluna que FECHA A SOMA das anteriores', () => {
    // 25.000 + 27.750 = 52.750 — so' a terceira coluna fecha.
    const { semanas, avisos } = interpretarColagem('005-26\t25.000\t27.750\t52.750');
    expect(semanas[0].pecas).toBe(52750);
    expect(semOAvisoDaData(avisos)).toEqual([]);
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
    expect(semOAvisoDaData(avisos)).toEqual([]);
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

/**
 * A SEMANA DA FABRICA NAO E' A DO CALENDARIO — e esta e' a fixture que
 * prova por que o casamento passou a ser por data.
 *
 * Linhas reais da aba FURAÇÃO (planilha do PCP, 2026), com a coluna
 * INICIO. Repare no que o numero da semana faz aqui:
 *
 *   Nº PLANILHA  SEMANA  INICIO   periodo real (DASHBOARD)  semana ISO
 *   033-26       S36     24/08    24/08 a 28/08             35
 *   034-26       S37     31/08    31/08 a 04/09             36
 *   035-26       S38     08/09    08/09 a 14/09             37
 *   036-26       S39     15/09    15/09 a 21/09             38
 *
 * O rotulo S corre UMA SEMANA a frente do ISO, e a 035-26 comeca na TERCA
 * porque 07/09 foi feriado. Casar medicao com programa por numero erra nos
 * dois eixos ao mesmo tempo; casar por data acerta nos dois.
 */
const FURACAO = [
  'Nº PLANILHA\tSEMANA\tINÍCIO\tLOTE 1\tLOTE 2\tTOTAL SEMANA\tMÉDIA / LOTE',
  '033-26\tS36\t24/08/2026\t60.000\t68.900\t128.900\t25.780',
  '034-26\tS37\t31/08/2026\t40.000\t53.200\t93.200\t18.640',
  '035-26\tS38\t08/09/2026\t60.000\t61.900\t121.900\t24.380',
  '036-26\tS39\t15/09/2026\t40.000\t43.864\t83.864\t16.773',
].join('\n');

describe('a coluna INICIO', () => {
  const { semanas, avisos } = interpretarColagem(FURACAO, { ano: 2026 });

  it('cada semana vem com a data em que comeca', () => {
    expect(semanas.map((s) => `${s.chave}=${s.inicio}`)).toEqual([
      '036-26=2026-08-24', '037-26=2026-08-31', '038-26=2026-09-08', '039-26=2026-09-15',
    ]);
  });

  it('com a data no lugar, nao ha aviso de coluna faltando', () => {
    expect(avisos.filter((a) => /coluna INÍCIO/.test(a))).toEqual([]);
  });

  it('colagem SEM a coluna avisa — o casamento vai cair no numero da semana', () => {
    const r = interpretarColagem('SEMANA\tTOTAL SEMANA\nS37\t93.200', { ano: 2026 });
    expect(r.semanas[0].inicio).toBe(null);
    expect(r.avisos.some((a) => /coluna precisa se chamar INÍCIO/.test(a))).toBe(true);
  });

  it('o rodape continua mudo quando a coluna Nº PLANILHA vem na frente', () => {
    /**
     * Com a planilha na primeira coluna, "TOTAL ACUMULADO" fica fora da
     * coluna SEMANA — que recebe o proprio 3.855.110. A linha nao vira
     * semana (certo) e tambem nao pode virar aviso: planilha certa que
     * reclama na previa ensina a ignorar a previa.
     */
    const r = interpretarColagem([
      FURACAO,
      'TOTAL ACUMULADO\t3.855.110',
      'MÉDIA SEMANAL\t107.086',
    ].join('\n'), { ano: 2026 });
    expect(r.semanas.length).toBe(4);
    expect(r.avisos.filter((a) => /Linha ignorada/.test(a))).toEqual([]);
  });

  it('data invertida ou impossivel nao vira semana com data torta', () => {
    expect(lerDataPtBr('31/02/2026')).toBe(null);
    expect(lerDataPtBr('8/1/26').toISOString().slice(0, 10)).toBe('2026-01-08');
  });
});

describe('ate onde vai cada semana do programa', () => {
  const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });
  const periodos = periodosDoPrograma(semanas);
  const como = (p) => `${p.inicio.toISOString().slice(0, 10)}..${p.fim.toISOString().slice(0, 10)}`;

  it('cada semana vale SETE dias a partir do inicio, e nem um a mais', () => {
    expect(como(periodos[1])).toBe('2026-08-31..2026-09-06');
    expect(como(periodos[2])).toBe('2026-09-08..2026-09-14');
    expect(como(periodos[3])).toBe('2026-09-15..2026-09-21');
  });

  it('SEMANA QUE FALTOU NA COLAGEM nao e engolida pela anterior', () => {
    /**
     * O teste que tranca o pior erro possivel aqui. Colando a S36 e a S38
     * sem a S37 no meio, esticar a janela ate' a vespera da seguinte poria
     * a medicao de 02/09 com a demanda de 24/08 — 128.900 no lugar de
     * 93.200. Sairia "faltam 28% de ritmo, precisa de 4,2 maquinas" onde a
     * verdade e' "praticamente atende": decisao de comprar maquina nascida
     * de uma linha que nao foi colada, e sem aviso nenhum na tela.
     */
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S36\t24/08/2026\t128.900',
      'S38\t08/09/2026\t121.900',
    ].join('\n'), { ano: 2026 });
    expect(semanaQueContem(r.semanas, new Date('2026-09-02T10:00:00-03:00'))).toBe(null);
  });

  it('o dia util perdido num feriado longo fica DESCOBERTO, e isso e o certo', () => {
    // 07/09 (feriado) esta' fora da janela da semana que comecou em 31/08.
    // Faltar em voz alta — o quadro diz "sem programa para o periodo desta
    // medicao" e o seletor resolve na mao — e melhor que errar calado.
    expect(semanaQueContem(semanas, new Date('2026-09-07T10:00:00-03:00'))).toBe(null);
  });

  it('buraco grande no programa nao vira uma semana de meses', () => {
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S02\t08/01/2026\t128.250',
      'S39\t15/09/2026\t83.864',
    ].join('\n'), { ano: 2026 });
    const [primeira] = periodosDoPrograma(r.semanas);
    expect(como(primeira)).toBe('2026-01-08..2026-01-14');
    expect(semanaQueContem(r.semanas, new Date('2026-03-10T12:00:00-03:00'))).toBe(null);
  });

  it('as janelas saem em ordem de DATA, nao de rotulo', () => {
    // A ultima planilha do ano pode chamar-se "S01": ordenar pelo numero a
    // poria no comeco do ano, e a premissa desta tela e' que o rotulo nao
    // e' confiavel.
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S39\t15/09/2026\t83.864',
      'S02\t08/01/2026\t128.250',
    ].join('\n'), { ano: 2026 });
    expect(periodosDoPrograma(r.semanas).map((x) => x.semana.chave))
      .toEqual(['002-26', '039-26']);
  });
});

describe('qual semana cobre a medicao', () => {
  const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });
  const em = (iso) => semanaQueContem(semanas, new Date(`${iso}T10:00:00-03:00`))?.chave ?? null;

  it('sexta 04/09 pertence ao programa que comecou em 31/08', () => {
    expect(em('2026-09-04')).toBe('037-26');
  });


  it('terca 08/09 pertence a semana seguinte', () => {
    expect(em('2026-09-08')).toBe('038-26');
  });

  it('a medicao de segunda a noite nao escorrega para a semana seguinte', () => {
    // 14/09 as 21h em Sao Paulo e' 15/09 as 00h UTC: comparado cru, o
    // ultimo dia da 038-26 cairia na 039-26.
    expect(em('2026-09-14')).toBe('038-26');
    expect(semanaQueContem(semanas, new Date('2026-09-14T21:30:00-03:00')).chave).toBe('038-26');
  });

  it('antes do programa comecar, nao ha semana nenhuma', () => {
    expect(em('2026-08-23')).toBe(null);
  });
});

describe('leitura da demanda casada por data', () => {
  const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });
  const demandas = semanas.map((s) => ({ ...s, atualizado_em: '2026-09-14T12:00:00Z' }));

  it('a medicao de 10/09 pega o programa de 08/09, nao o da semana ISO 37', () => {
    /**
     * O erro que este casamento acabou: 10/09 e' semana ISO 37, e a linha
     * rotulada "S37" e' a de 31/08 — o programa da semana ANTERIOR. Por
     * numero, o relatorio comparava 93.200 com o ritmo de outra semana.
     */
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-10T08:00:00-03:00')],
    });
    expect(l.estado).toBe('pronto');
    expect(l.demanda).toBe(121900);
    expect(l.semana.chave).toBe('038-26');
    expect(l.periodo.inicio.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(l.casadoPorData).toBe(true);
  });

  it('a semana escolhida a mao continua mandando', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-10T08:00:00-03:00')],
      semanaEscolhida: { ano: 2026, numero: 36 },
    });
    expect(l.demanda).toBe(128900);
    expect(l.semana.chave).toBe('036-26');
    // A semana escolhida TEM data: cobrar a coluna INÍCIO dela, com o
    // periodo dela na linha de cima, ensina a ignorar a ressalva que importa.
    expect(l.casadoPorData).toBe(true);
    expect(l.periodo.inicio.toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('medicao fora de todo periodo do programa nao inventa semana', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-10-20T08:00:00-03:00')],
    });
    expect(l.estado).toBe('sem-semana');
    expect(l.veredito).toBe(null);
    expect(l.medicao.toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('programa SEM data cai no casamento por numero, e diz que caiu', () => {
    const antigas = demandas.map(({ inicio, ...resto }) => resto);
    const l = leituraDaDemanda({
      demandas: antigas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-10T08:00:00-03:00')],   // semana ISO 37
    });
    expect(l.casadoPorData).toBe(false);
    expect(l.programa.temData).toBe(false);
    expect(l.semana.chave).toBe('037-26');
    expect(l.demanda).toBe(93200);
  });
});

describe('programa MISTURADO: linhas com data e linhas sem', () => {
  /**
   * O caminho normal de atualizacao. A gravacao MESCLA, entao quem ja'
   * tinha o programa cadastrado e cola setembro com a coluna INICIO fica
   * com as duas coisas no mesmo grupo. Se a decisao fosse do programa
   * inteiro, as semanas antigas — visiveis na tela de Demanda — parariam
   * de casar, e o quadro diria "sem programa" com a semana na tela.
   */
  const demandas = [
    { ano: 2026, numero: 11, pecas: 100000 },                          // antiga, sem data
    { ano: 2026, numero: 38, pecas: 121900, inicio: '2026-09-08' },    // nova, com data
  ];

  it('a semana antiga continua casando pelo numero', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-03-11T08:00:00-03:00')],   // semana ISO 11
    });
    expect(l.estado).toBe('pronto');
    expect(l.demanda).toBe(100000);
    expect(l.casadoPorData).toBe(false);
  });

  it('a semana nova casa pela data, no mesmo programa', () => {
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-10T08:00:00-03:00')],
    });
    expect(l.demanda).toBe(121900);
    expect(l.casadoPorData).toBe(true);
  });

  it('linha COM data nao casa pelo numero como consolo', () => {
    // 15/09 e' semana ISO 38, e a linha 38 tem data que diz 08/09..14/09.
    // Deixar o numero valer aqui devolveria a resposta que a data negou.
    const l = leituraDaDemanda({
      demandas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [new Date('2026-09-15T08:00:00-03:00')],
    });
    expect(l.estado).toBe('sem-semana');
  });

  it('a tela sabe quantas linhas ainda estao sem data', () => {
    const l = leituraDaDemanda({ demandas, horas: 44, maquinas: 3, datas: [] });
    expect(l.programa.semData).toBe(1);
    expect(l.programa.temData).toBe(true);
  });
});

describe('a data nao pode virar o ANO do programa', () => {
  it('INICIO em dd/mm nao grava o programa em 2008', () => {
    /**
     * "24/08" tem a cara exata de "semana 24 de 2008" para quem le' codigo
     * de semana. Lido como ano, o programa inteiro ia para 2008 — e
     * nenhuma medicao de 2026 acharia nada, para sempre, sem erro nenhum
     * na tela.
     */
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tLOTE 1\tLOTE 2\tTOTAL SEMANA',
      'S36\t24/08\t60.000\t68.900\t128.900',
      'S37\t31/08\t40.000\t53.200\t93.200',
    ].join('\n'), { ano: 2026 });
    expect(r.semanas.map((x) => x.chave)).toEqual(['036-26', '037-26']);
  });

  it('e avisa que a data veio e nao deu para ler, com o formato certo', () => {
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S36\t24/08\t128.900',
    ].join('\n'), { ano: 2026 });
    expect(r.semanas[0].inicio).toBe(null);
    expect(r.avisos.some((a) => /dd\/mm\/aaaa/.test(a))).toBe(true);
    // E NAO o aviso de coluna ausente: a coluna veio. Mandar buscar o que
    // ja' foi trazido e' pior que nao avisar.
    expect(r.avisos.some((a) => /veio sem a coluna INÍCIO/.test(a))).toBe(false);
  });

  it('o Nº PLANILHA continua dando o ano quando a semana vem sem ele', () => {
    const r = interpretarColagem([
      'Nº PLANILHA\tSEMANA\tINÍCIO\tTOTAL SEMANA',
      '033-26\tS36\t24/08/2026\t128.900',
    ].join('\n'), { ano: 2030 });
    expect(r.semanas[0].chave).toBe('036-26');
  });
});

describe('outra coluna de data NAO e o inicio da semana', () => {
  /**
   * A planilha do PCP tem varias colunas de data — CORTE MDF, CORTE MDP,
   * PREV EMB — e a de embalagem cai UMA SEMANA a frente da producao.
   * Pescar "a primeira data da linha" com o cabecalho na mao poria a
   * medicao de 31/08 (que e' a 037-26, 93.200) contra a demanda da
   * 036-26 (128.900): 977 pc/h exigidos no lugar de 706, "precisa de 4,2
   * maquinas" onde a verdade e' "praticamente atende".
   */
  const COM_ENTREGA = [
    'SEMANA\tENTREGA\tTOTAL SEMANA',
    'S36\t28/08/2026\t128.900',
    'S37\t04/09/2026\t93.200',
  ].join('\n');

  it('com cabecalho, data fora de uma coluna INÍCIO nao vira inicio de semana', () => {
    const r = interpretarColagem(COM_ENTREGA, { ano: 2026 });
    expect(r.semanas.map((x) => x.inicio)).toEqual([null, null]);
  });

  it('e a previa diz que a coluna precisa se chamar INÍCIO', () => {
    const r = interpretarColagem(COM_ENTREGA, { ano: 2026 });
    expect(r.avisos.some((a) => /coluna precisa se chamar INÍCIO/.test(a))).toBe(true);
  });

  it('sem cabecalho, a data da linha continua valendo — nao ha outra de onde escolher', () => {
    const r = interpretarColagem('S36\t24/08/2026\t128.900', { ano: 2026 });
    expect(r.semanas[0].inicio).toBe('2026-08-24');
  });
});

describe('a data completa diz de que ANO e o programa', () => {
  it('planilha de 2027 colada em 2026 nao grava por cima de 2026', () => {
    /**
     * A chave no banco e' empresa+grupo+ano+numero. Lida como 2026, a
     * semana 1 de 2027 sobrescrevia a semana 1 de 2026 no ON CONFLICT — a
     * demanda real sumia na gravacao, sem aviso nenhum.
     */
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S01\t04/01/2027\t128.250',
    ].join('\n'), { ano: 2026 });
    expect(r.semanas[0].chave).toBe('001-27');
    expect(r.semanas[0].inicio).toBe('2027-01-04');
  });
});

describe('quantas semanas as medicoes cobrem', () => {
  const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });

  it('conta a semana da FABRICA, nao a do calendario', () => {
    /**
     * 31/08 e 04/09 sao a MESMA semana de fabrica (037-26) e semanas ISO
     * diferentes. Contando ISO, a tela escrevia "o periodo e 31/08 a
     * 06/09" e logo abaixo "as medicoes cobrem 2 semanas" — contradicao
     * na mesma frase, desqualificando um numero que esta certo.
     */
    const l = leituraDaDemanda({
      demandas: semanas, horas: 44, maquinas: 3, ritmoRelogio: 700,
      datas: [
        new Date('2026-08-31T08:00:00-03:00'),
        new Date('2026-09-04T08:00:00-03:00'),
      ],
    });
    expect(l.semanasMedidas).toBe(1);
  });
});

describe('quando ainda nao da para dar veredito', () => {
  const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });

  it('sem medicao nenhuma, mostra a ultima semana do programa e nao inventa veredito', () => {
    const l = leituraDaDemanda({ demandas: semanas, horas: 44, maquinas: 3, datas: [] });
    expect(l.semana.chave).toBe('039-26');
    expect(l.estado).toBe('sem-ritmo');
    expect(l.veredito).toBe(null);
  });

  it('sem medicao, NEM COM ritmo na mao sai veredito', () => {
    // Ritmo sem data nao se sabe de que semana e'. Comparar a ultima semana
    // cadastrada com ele e' o "medicao de marco contra o programa de
    // setembro" que este arquivo inteiro recusa.
    const l = leituraDaDemanda({
      demandas: semanas, horas: 44, maquinas: 3, ritmoRelogio: 700, datas: [],
    });
    expect(l.estado).toBe('sem-ritmo');
    expect(l.veredito).toBe(null);
    expect(l.medicao).toBe(null);
  });

  it('a ultima do programa e a de DATA mais recente, nao a de rotulo maior', () => {
    // A ultima planilha do ano pode chamar-se "S01".
    const r = interpretarColagem([
      'SEMANA\tINÍCIO\tTOTAL SEMANA',
      'S39\t15/09/2026\t83.864',
      'S52\t21/12/2026\t60.000',
    ].join('\n'), { ano: 2026 });
    const l = leituraDaDemanda({ demandas: r.semanas, horas: 44, maquinas: 3, datas: [] });
    expect(l.semana.chave).toBe('052-26');
  });

  it('com medicao sem ritmo aproveitavel, tambem nao ha veredito', () => {
    // 'pronto' com veredito nulo era um estado que a tela nao sabia
    // desenhar — e quebrava no primeiro acesso a v.atende.
    const l = leituraDaDemanda({
      demandas: semanas, horas: 44, maquinas: 3, ritmoRelogio: 0,
      datas: [new Date('2026-09-10T08:00:00-03:00')],
    });
    expect(l.estado).toBe('sem-ritmo');
    expect(l.demanda).toBe(121900);
    expect(l.veredito).toBe(null);
  });
});

describe('a data na tela', () => {
  it('o dia nao volta 24 h ao ser formatado no fuso da fabrica', () => {
    // As datas do programa sao 00h UTC. Formatadas no relogio local de Sao
    // Paulo (UTC-3), 08/09 viraria 07/09 — e o periodo na tela deixaria de
    // bater com a planilha que o PCP tem aberta ao lado.
    expect(comoDia(new Date('2026-09-08T00:00:00Z'))).toBe('08/09');
    expect(comoDia(new Date('2026-09-08T00:00:00Z'), { ano: true })).toBe('08/09/2026');
  });

  it('o periodo sai como o PCP le', () => {
    const { semanas } = interpretarColagem(FURACAO, { ano: 2026 });
    expect(comoPeriodo(periodoDaSemana(semanas, semanas[2]))).toBe('08/09 a 14/09');
  });
});
