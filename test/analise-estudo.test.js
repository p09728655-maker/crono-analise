/**
 * A analise do estudo (o que o painel do PC le): gargalo, soma dos TP por
 * peca, capacidade da linha, operadores, pendencias e paradas. Numeros
 * conferidos na mao contra calcularOperacao.
 */
import { describe, expect, it } from 'vitest';
import { analisarEstudo, lerEstudo } from '../src/domain/analiseEstudo.js';

// Tolerancia 10%, meta de 3 ciclos, Takt de 20 s.
const estudo = { tolerancia_pct: '10', meta_obs: 3, takt_time_ms: 20000 };
const operacoes = [
  // TO 10 s, FR 100 → TN 10 s → TP 11 s, 1 ciclo por peca → 11 s/peca, cap 327/h
  { id: 'a', nome: 'Furar', fr_pct: '100', ciclos_por_peca: 1, tempos: [10000, 10000, 10000],
    paradas: [{ motivo: 'setup', duracao: 60000 }] },
  // TO 6 s → TP 6,6 s, 2 ciclos por peca → 13,2 s/peca: e' o GARGALO. cap 272/h
  { id: 'b', nome: 'Colar', fr_pct: '100', ciclos_por_peca: 2, tempos: [6000, 6000], paradas: [] },
  // Sem ciclo: fica fora das contas e entra nas pendencias.
  { id: 'c', nome: 'Embalar', fr_pct: '100', ciclos_por_peca: 1, tempos: [], paradas: [] },
];

describe('analisarEstudo', () => {
  const a = analisarEstudo({ estudo, operacoes });

  it('o gargalo e a operacao de maior TP POR PECA, nao por ciclo', () => {
    // Por ciclo, Furar (11 s) e' mais lenta que Colar (6,6 s); por peca,
    // Colar leva 13,2 s porque a peca pede dois ciclos.
    expect(a.gargalo.id).toBe('b');
    expect(a.gargalo.resultado.tpPorPeca).toBeCloseTo(13200, 6);
  });

  it('a capacidade da linha e a do gargalo: 3.600.000 / 13.200 = 272 pecas/h', () => {
    expect(a.capacidadeLinha).toBe(272);
  });

  it('a soma dos TP por peca so conta operacoes com ciclo, e os operadores saem do Takt', () => {
    expect(a.somaTp).toBeCloseTo(24200, 6);
    // 24,2 s de trabalho por peca a cada 20 s de Takt = 1,21 operador
    expect(a.operadores).toBeCloseTo(1.21, 6);
    expect(a.comDados.map((o) => o.id)).toEqual(['a', 'b']);
    expect(a.totalCiclos).toBe(5);
    expect(a.tolerancia).toBe(10);
  });

  it('as pendencias sao as operacoes abaixo da meta, com o motivo em palavras', () => {
    expect(a.pendencias.map((p) => p.op.id)).toEqual(['b', 'c']);
    expect(a.pendencias[0].s.motivo).toBe('Faltam 1 observações para a meta');
    expect(a.pendencias[1].s.motivo).toBe('Sem observações');
  });

  it('as paradas da coleta entram no resumo, com a base no tempo cronometrado', () => {
    expect(a.paradas.totalMs).toBe(60000);
    expect(a.paradas.setupMs).toBe(60000);
    expect(a.paradas.cronometradoMs).toBe(42000);
    // 60 s parados em 102 s observados
    expect(a.paradas.pctDoObservado).toBeCloseTo(58.82, 1);
  });

  it('sem Takt nao ha operadores — null, nao zero', () => {
    const semTakt = analisarEstudo({ estudo: { ...estudo, takt_time_ms: null }, operacoes });
    expect(semTakt.taktMs).toBe(0);
    expect(semTakt.operadores).toBeNull();
  });

  it('sem dados nao ha analise', () => {
    expect(analisarEstudo(null)).toBeNull();
    const vazio = analisarEstudo({ estudo, operacoes: [] });
    expect(vazio.gargalo).toBeNull();
    expect(vazio.capacidadeLinha).toBe(0);
  });
});

describe('lerEstudo', () => {
  it('compara o que o Takt exige com o que o gargalo entrega', () => {
    const l = lerEstudo(analisarEstudo({ estudo, operacoes }));
    // 3.600.000 / 20.000 = 180 esperadas; o gargalo entrega 272
    expect(l.capacidade.esperado).toBe(180);
    expect(l.capacidade.real).toBe(272);
    expect(l.capacidade.diferenca).toBe(92);
    expect(Array.isArray(l.sugestoes)).toBe(true);
  });

  it('sem analise nao ha leitura', () => {
    expect(lerEstudo(null)).toBeNull();
  });
});
