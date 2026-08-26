/**
 * Conferencias salvas no aparelho. O localStorage e' simulado em memoria —
 * o que se testa e' o contrato: ordem, limite, remocao e tolerancia a
 * storage corrompido ou indisponivel.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { faixaHoraria } from '../src/domain/cronoanalise.js';

const memoria = new Map();
let negarEscrita = false;
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => {
    if (negarEscrita) throw new Error('QuotaExceededError');
    memoria.set(k, String(v));
  },
};

const { listarConferencias, marcarEnviadas, removerConferencia, salvarConferencia } =
  await import('../src/lib/conferencias.js');

const CHAVE = 'ritmopatrimar.conferencias';
const base = { peca: 'Lateral Mesa Sleep', duracaoMs: 600000, pecas: 150, pecasPorHora: 900, cicloMedioMs: 4000 };

beforeEach(() => { memoria.clear(); negarEscrita = false; });

describe('conferencias salvas no aparelho', () => {
  it('salva com id e data e devolve o registro', () => {
    const r = salvarConferencia(base);
    expect(r.id).toBeTruthy();
    expect(r.salvoEm).toBeTruthy();
    expect(r.pecasPorHora).toBe(900);
  });

  it('a mais recente entra no topo da lista', () => {
    salvarConferencia({ ...base, peca: 'primeira' });
    salvarConferencia({ ...base, peca: 'segunda' });
    const lista = listarConferencias();
    expect(lista.map((c) => c.peca)).toEqual(['segunda', 'primeira']);
  });

  it('apara em 50: conferencia velha demais ja nao descreve o posto', () => {
    for (let i = 0; i < 55; i++) salvarConferencia({ ...base, peca: `p${i}` });
    const lista = listarConferencias();
    expect(lista.length).toBe(50);
    expect(lista[0].peca).toBe('p54'); // as mais novas sobrevivem
  });

  it('remover tira pelo id e devolve o restante', () => {
    const a = salvarConferencia({ ...base, peca: 'fica' });
    const b = salvarConferencia({ ...base, peca: 'sai' });
    const resto = removerConferencia(b.id);
    expect(resto.map((c) => c.id)).toEqual([a.id]);
    expect(listarConferencias().length).toBe(1);
  });

  it('marcarEnviadas poe a marca so nos ids pedidos — e o backfill acha quem nao tem', () => {
    const a = salvarConferencia({ ...base, peca: 'ja subiu' });
    const b = salvarConferencia({ ...base, peca: 'antiga, de antes da sincronizacao' });
    const lista = marcarEnviadas([a.id]);
    expect(lista.find((c) => c.id === a.id).enviada).toBe(true);
    expect(lista.find((c) => c.id === b.id).enviada).toBeUndefined();
    expect(listarConferencias().filter((c) => !c.enviada).map((c) => c.id)).toEqual([b.id]);
  });

  it('storage corrompido vira lista vazia, nunca excecao', () => {
    memoria.set(CHAVE, '{nao e json');
    expect(listarConferencias()).toEqual([]);
    memoria.set(CHAVE, '"uma string"');
    expect(listarConferencias()).toEqual([]);
  });

  it('aparelho que nega escrita devolve null — a UI avisa em vez de fingir', () => {
    negarEscrita = true;
    expect(salvarConferencia(base)).toBeNull();
  });
});

describe('faixa horaria da conferencia', () => {
  /**
   * A tela le o periodo dos INSTANTES. O texto antigo continua sendo aceito
   * como ultimo recurso: um servidor revertido para antes da migracao
   * voltaria a devolver so' ele, e um travessao no lugar do periodo seria
   * pior do que a hora sem o dia.
   */
  it('prefere os instantes', () => {
    const faixa = faixaHoraria({
      iniciado_em: '2026-08-20T10:00:00.000Z',
      finalizado_em: '2026-08-20T10:30:00.000Z',
      hora_inicial: '99:99', hora_final: '99:99',
    });
    expect(faixa).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/);
    expect(faixa).not.toContain('99');
  });

  it('cai no texto antigo enquanto o instante nao existir', () => {
    expect(faixaHoraria({ hora_inicial: '07:00', hora_final: '07:30' })).toBe('07:00–07:30');
  });

  it('sem periodo nenhum devolve nulo, para a tela mostrar o travessao', () => {
    expect(faixaHoraria({})).toBeNull();
    expect(faixaHoraria(null)).toBeNull();
    // Metade do par nao e periodo.
    expect(faixaHoraria({ hora_inicial: '07:00' })).toBeNull();
    expect(faixaHoraria({ iniciado_em: '2026-08-20T10:00:00.000Z' })).toBeNull();
  });
});
