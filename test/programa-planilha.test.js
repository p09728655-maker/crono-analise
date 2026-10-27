/**
 * O programa da embalagem lido da planilha do PCP: linhas -> semanas.
 *
 * Os numeros sao da planilha de verdade (MODELO_HORA_A_HORA, lida em
 * 27/10/2026): a semana de 26/10 tem 8.750 volumes em aberto na
 * PROGRAMACAO e 200 ja' concluidos na PROGRAMACAO_CONCLUIDA — 8.950. A
 * conta foi feita a parte, fora deste codigo.
 */
import { describe, expect, it } from 'vitest';
import { lerDia, semanasDaPlanilha } from '../api/_lib/programaPlanilha.js';

const CAB_ABERTA = ['Lote', 'Data', 'Ordem', 'Codigo', 'Descricao', 'Qtd_cx', 'PRODUZIDO', 'SALDO',
  'PERCENTUAL', 'STATUS', 'ATUALIZADO_EM', 'COR GPS', 'LOTE INTERNO', 'ENCERRAR', 'ADIANTADO_CX'];
const CAB_CONCLUIDA = ['LOTE', 'DATA', 'ORDEM', 'CODIGO', 'DESCRICAO', 'QTD_CX', 'PRODUZIDO', 'SALDO',
  'PERCENTUAL', 'STATUS', 'ATUALIZADO_EM', 'COR GPS', 'LOTE INTERNO', 'ARQUIVADO_EM', 'ENCERRAR', 'ADIANTADO_CX'];

// 26/10 linha a linha, como esta' na planilha; os outros dias, as caixas
// de cada linha (lote e codigo inventados — so' a soma importa ali).
const DIA_26 = [
  ['25340', '26/10', '1', '501.118.001', 'VOL 1/1 ESCRIVANINHA TAURUS OFF WHITE', '320', '0', '320', '0', 'EM ATRASO'],
  ['25340', '26/10', '1', '501.118.002', 'VOL 1/1 ESCRIVANINHA TAURUS BRANCO AC', '20', '0', '20', '0', 'EM ATRASO'],
  ['25340', '26/10', '1', '501.118.005', 'VOL 1/1 ESCRIVANINHA TAURUS CINAMOMO', '360', '0', '360', '0', 'EM ATRASO'],
  ['25341', '26/10', '2', '501.151.003', 'VOL 1/1 RACK MOVE 1.8 CINAMOMO/OFF WHITE', '110', '83', '27', '75', 'EM ATRASO'],
  ['25342', '26/10', '3', '501.114.006', 'VOL 1/1 PAINEL SIRIUS 1.4 CINAMOMO', '200', '198', '2', '99', 'EM ATRASO'],
  ['25343', '26/10', '4', '501.138.002', 'VOL 1/1 LIVREIRO TAURUS BRANCO ACETINADO', '50', '47', '3', '94', 'EM ATRASO'],
  ['25343', '26/10', '4', '501.138.003', 'VOL 1/1 LIVREIRO TAURUS CINAMOMO', '240', '237', '3', '99', 'EM ATRASO'],
];
const CAIXAS = {
  '27/10': [160, 290, 400, 100, 400, 400, 210, 120, 70, 100, 100, 30, 30, 220, 220],
  '28/10': [160, 340, 65, 185, 55, 95, 65, 85, 60, 140],
  '29/10': [160, 160, 130, 130, 60, 60, 115, 270, 15, 85, 115, 100, 250, 90, 150, 160],
  '30/10': [40, 40, 190, 190, 70, 70, 40, 60, 50, 50, 50, 150, 150, 150],
};
const outrosDias = Object.entries(CAIXAS).flatMap(([data, qtds]) => qtds
  .map((q, i) => [`9${data.slice(0, 2)}`, data, '1', `501.900.${String(i).padStart(3, '0')}`, 'VOL 1/1 X', String(q)]));
// Lote de 23/10 ainda em aberto: e' da semana de 23/10, nao desta.
const ATRASADO = ['25338', '23/10', '4', '501.106.009', 'VOL 1/1 RACK SIRIUS 1.6 OFF WHITE/CINAMOMO', '210', '205', '5', '98', 'EM ATRASO'];
const CONCLUIDAS = [
  ['25343', '26/10/2026', '4', '501138001', 'VOL 1/1 LIVREIRO TAURUS OFF WHITE', '110', '110', '0', '100', 'CONCLUIDO'],
  ['25341', '26/10/2026', '2', '501151004', 'VOL 1/1 RACK MOVE 1.8 CINAMOMO', '90', '90', '0', '100', 'CONCLUIDO'],
  ['25338', '23/10/2026', '4', '501106013', 'VOL 1/1 RACK SIRIUS 1.6 CINAMOMO', '65', '65', '0', '100', 'CONCLUIDO'],
];
const HOJE = new Date('2026-10-27T11:00:00Z');

const planilha = (aberta, concluida) => ({
  PROGRAMACAO: [CAB_ABERTA, ...aberta],
  PROGRAMACAO_CONCLUIDA: [CAB_CONCLUIDA, ...concluida],
});

describe('semanasDaPlanilha — o programa da embalagem por semana', () => {
  it('a semana soma as DUAS abas pela data programada: 8.750 em aberto + 200 concluidos = 8.950', () => {
    const r = semanasDaPlanilha(planilha([ATRASADO, ...DIA_26, ...outrosDias], CONCLUIDAS), { hoje: HOJE });
    const semana26 = r.semanas.find((s) => s.inicio === '2026-10-26');
    expect(semana26).toMatchObject({ ano: 2026, numero: 44, pecas: 8950 });
    // So' a PROGRAMACAO daria 8.750: e encolheria a cada lote terminado.
    expect(semana26.pecas - 200).toBe(8750);
  });

  it('o lote atrasado conta na semana em que foi programado, nao na de hoje', () => {
    const r = semanasDaPlanilha(planilha([ATRASADO, ...DIA_26], CONCLUIDAS), { hoje: HOJE });
    expect(r.semanas.find((s) => s.inicio === '2026-10-19')).toMatchObject({ numero: 43, pecas: 210 + 65 });
  });

  it("a linha que esta' nas duas abas (instante da mudanca) conta uma vez, com o codigo em qualquer formato", () => {
    const repetida = ['25343', '26/10/2026', '4', '501138003', 'VOL 1/1 LIVREIRO TAURUS CINAMOMO', '240'];
    const r = semanasDaPlanilha(planilha(DIA_26, [repetida]), { hoje: HOJE });
    expect(r.semanas[0].pecas).toBe(1300);
    expect(r.ignoradas.duplicadas).toBe(1);
  });

  it('dentro da mesma aba, duas linhas iguais sao duas linhas do programa', () => {
    const r = semanasDaPlanilha(planilha([DIA_26[0], DIA_26[0]], []), { hoje: HOJE });
    expect(r.semanas[0].pecas).toBe(640);
    expect(r.ignoradas.duplicadas).toBe(0);
  });

  it('data em numero de serie (o que a API devolve) vale o mesmo que o texto', () => {
    const r = semanasDaPlanilha(planilha([['1', 46321, '1', '1', 'X', 320]], []), { hoje: HOJE });
    expect(r.semanas).toEqual([{ ano: 2026, numero: 44, inicio: '2026-10-26', pecas: 320, linhas: 1 }]);
  });

  it('linha sem data ou sem quantidade fica de fora CONTADA; linha vazia nao conta', () => {
    const r = semanasDaPlanilha(planilha([
      ['1', '', '1', '1', 'X', '50'],
      ['2', '26/10', '1', '2', 'X', ''],
      ['3', '26/10', '1', '3', 'X', '12,5'],
      ['4', '26/10', '1', '4', 'X', '1.250'],
      ['', '', '', '', '', ''],
      [],
    ], []), { hoje: HOJE });
    expect(r.ignoradas).toEqual({ semData: 1, semQuantidade: 2, duplicadas: 0 });
    expect(r.semanas[0].pecas).toBe(1250);
    expect(r.linhas).toBe(1);
  });

  it('aba sem a coluna de data ou de quantidade PARA a leitura, com o nome da aba', () => {
    const torta = { PROGRAMACAO: [['Lote', 'Dia', 'Qtd_cx']], PROGRAMACAO_CONCLUIDA: [CAB_CONCLUIDA] };
    expect(() => semanasDaPlanilha(torta, { hoje: HOJE })).toThrow(/aba PROGRAMACAO não tem a coluna Data/);
    expect(() => semanasDaPlanilha({ PROGRAMACAO: [CAB_ABERTA] }, { hoje: HOJE }))
      .toThrow(/PROGRAMACAO_CONCLUIDA veio vazia/);
  });

  it('a virada do ano: 31/12/2026 e 01/01/2027 sao a semana 53 de 2026, que comeca em 28/12', () => {
    const r = semanasDaPlanilha(planilha([], [
      ['1', '31/12/2026', '1', '1', 'X', '10'],
      ['2', '01/01/2027', '1', '2', 'X', '20'],
    ]), { hoje: HOJE });
    expect(r.semanas).toEqual([{ ano: 2026, numero: 53, inicio: '2026-12-28', pecas: 30, linhas: 2 }]);
  });
});

describe('lerDia — "23/10" sem ano', () => {
  it('fica no ano mais perto de hoje, nos dois sentidos da virada', () => {
    expect(lerDia('28/12', new Date('2027-01-05T12:00:00Z'))).toBe('2026-12-28');
    expect(lerDia('05/01', new Date('2026-12-20T12:00:00Z'))).toBe('2027-01-05');
    expect(lerDia('23/10', HOJE)).toBe('2026-10-23');
  });
  it("recusa data que nao existe e texto que nao e' data", () => {
    expect(lerDia('31/02/2026', HOJE)).toBeNull();
    expect(lerDia('29/02', new Date('2026-06-01T12:00:00Z'))).toBeNull();
    expect(lerDia('EM ATRASO', HOJE)).toBeNull();
    expect(lerDia(0, HOJE)).toBeNull();
  });
});
