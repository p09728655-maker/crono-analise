/**
 * Conferencias salvas no aparelho. O localStorage e' simulado em memoria —
 * o que se testa e' o contrato: ordem, limite, remocao e tolerancia a
 * storage corrompido ou indisponivel.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { faixaHoraria, potencialSemParada, ritmoPorHoraDoDia } from '../src/domain/cronoanalise.js';
import { paraConferencia } from '../src/lib/api.js';

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


/**
 * O contrato do payload de sincronizacao.
 *
 * O mapeador lista campo a campo, e foi exatamente ali que um dado se
 * perdeu (28/08): a tela enfileirava ciclosPorPeca 2, o envio descartava
 * e o servidor gravava o padrao 1. Este teste trava o contrato: o que a
 * fila carrega chega inteiro ao /api/sync.
 */
describe('paraConferencia — item da fila vira payload do sync', () => {
  it('leva TODOS os campos da conferencia, ciclos de furacao incluidos', () => {
    const corpo = paraConferencia({
      tipo: 'conferencia',
      clientId: 'abc',
      maquina: 'Furadeira 16',
      peca: 'Space reforço mesa',
      horaInicial: '08:47',
      horaFinal: '08:52',
      duracaoMs: 300000,
      pecas: 60,
      ciclosPorPeca: 2,
      paradas: [{ motivo: 'setup', duracaoMs: 60000 }],
      salvoEm: '2026-08-28T11:53:53.448Z',
    });
    expect(corpo.ciclosPorPeca).toBe(2);
    expect(corpo.pecas).toBe(60);
    expect(corpo.maquina).toBe('Furadeira 16');
    expect(corpo.horaInicial).toBe('08:47');
    expect(corpo.paradas).toEqual([{ motivo: 'setup', duracaoMs: 60000, observacao: null }]);
    expect(corpo.salvoEm).toBe('2026-08-28T11:53:53.448Z');
  });

  it('conferencia enfileirada por versao antiga, sem o campo, vai como 1 ciclo', () => {
    const corpo = paraConferencia({ clientId: 'x', duracaoMs: 60000, pecas: 10 });
    expect(corpo.ciclosPorPeca).toBe(1);
    expect(corpo.maquina).toBeNull();
    expect(corpo.paradas).toEqual([]);
  });
});

/**
 * O COMPARATIVO — o que saiu x o que teria saido no mesmo tempo.
 *
 * E' a conta que o analista fazia de cabeca (e as vezes errado) para levar
 * a reuniao: minuto parado nao move ninguem, peca que deixou de sair move.
 */
describe('potencialSemParada', () => {
  it('estica o ritmo de maquina rodando para o periodo inteiro', () => {
    // 619 pecas em 1 h, com 13 min parados: rodou 47 min a 790 pc/h.
    // No mesmo periodo, sem parar, teriam saido ~790.
    const c = potencialSemParada({ pecas: 619, duracaoMs: 3600000, produtivoMs: 2820000 });
    expect(c.potencial).toBe(790);
    expect(c.perdidas).toBe(171);
    expect(Math.round(c.ritmoPotencial)).toBe(790);
    expect(Math.round(c.ritmoPeriodo)).toBe(619);
    expect(Math.round(c.ganhoPct)).toBe(28);
  });

  it('o potencial e sempre o ritmo rodando aplicado ao periodo — nao uma meta', () => {
    // 206 pecas em 30 min com 12 parados: 18 min rodando a 687 pc/h.
    const c = potencialSemParada({ pecas: 206, duracaoMs: 1800000, produtivoMs: 1080000 });
    expect(c.potencial).toBe(343);
    expect(c.perdidas).toBe(137);
    // O ritmo do potencial nao inventa nada: e o mesmo da maquina rodando.
    expect(c.ritmoPotencial).toBeCloseTo((206 * 3600000) / 1080000, 6);
  });

  it('sem parada nao ha comparativo: o que saiu JA e o potencial', () => {
    expect(potencialSemParada({ pecas: 100, duracaoMs: 600000, produtivoMs: 600000 })).toBeNull();
  });

  it('periodo, tempo rodando ou pecas ausentes devolvem null, nunca zero', () => {
    expect(potencialSemParada({ pecas: 100, duracaoMs: 0, produtivoMs: 0 })).toBeNull();
    expect(potencialSemParada({ pecas: 0, duracaoMs: 600000, produtivoMs: 300000 })).toBeNull();
    expect(potencialSemParada({ pecas: 100, duracaoMs: 600000, produtivoMs: 0 })).toBeNull();
  });
});

/**
 * A CURVA DO DIA — o ritmo por hora do relogio.
 *
 * A media do periodo esconde a hora fraca: o posto que faz 700 pc/h de
 * manha e 500 depois do almoco aparece como 620 o dia inteiro, e ninguem
 * vai olhar o que muda as 13h.
 */
describe('ritmoPorHoraDoDia', () => {
  const em = (hora, { duracaoMs = 1800000, pecas = 300, paradas = [], dia = 31 } = {}) => ({
    iniciado_em: new Date(2026, 7, dia, hora, 0).toISOString(),
    duracao_ms: duracaoMs, pecas, paradas,
  });

  it('junta as medicoes da MESMA hora, mesmo de dias diferentes', () => {
    // 300 + 340 pecas em 1 h de maquina rodando = 640 pc/h as 7h.
    const curva = ritmoPorHoraDoDia([
      em(7, { pecas: 300, dia: 30 }),
      em(7, { pecas: 340, dia: 31 }),
      em(10, { pecas: 250 }),
    ]);
    expect(curva.map((h) => h.rotulo)).toEqual(['07h', '10h']);
    expect(curva[0].n).toBe(2);
    expect(curva[0].ritmoMedio).toBe(640);
    expect(curva[1].ritmoMedio).toBe(500);
  });

  it('pondera pelo tempo rodando, e a parada sai da conta', () => {
    // 300 pc em 30 min com 10 parados: 20 min rodando = 900 pc/h.
    const [h] = ritmoPorHoraDoDia([em(8, { paradas: [{ motivo: 'setup', duracaoMs: 600000 }] })]);
    expect(Math.round(h.ritmoMedio)).toBe(900);
    expect(h.produtivoMs).toBe(1200000);
    expect(h.totalMs).toBe(1800000);
  });

  it('a medicao entra na hora em que COMECOU, mesmo atravessando a hora', () => {
    // 07:40 + 40 min termina as 08:20 — e uma medicao das 7h.
    const curva = ritmoPorHoraDoDia([{
      iniciado_em: new Date(2026, 7, 31, 7, 40).toISOString(),
      duracao_ms: 2400000, pecas: 400, paradas: [],
    }]);
    expect(curva.map((h) => h.rotulo)).toEqual(['07h']);
  });

  it('hora com menos de 5 min medidos existe, mas vem marcada como fraca', () => {
    const [h] = ritmoPorHoraDoDia([em(14, { duracaoMs: 240000, pecas: 30 })]);
    expect(h.confiavel).toBe(false);
    // 4 min tambem descreve alguma coisa: some do selo, nao do relatorio.
    expect(Math.round(h.ritmoMedio)).toBe(450);
  });

  it('vem em ordem do relogio, nao de volume — e a curva de um dia', () => {
    const curva = ritmoPorHoraDoDia([em(15), em(7), em(7), em(11)]);
    expect(curva.map((h) => h.hora)).toEqual([7, 11, 15]);
  });

  it('sem horario, sem peca ou sem periodo, a medicao fica de fora', () => {
    expect(ritmoPorHoraDoDia([
      { duracao_ms: 600000, pecas: 100 },                       // sem iniciado_em
      em(9, { pecas: 0 }),                                      // sem peca
      em(9, { duracaoMs: 0 }),                                  // sem periodo
      // Parada do tamanho do periodo: nao sobra maquina rodando.
      em(9, { paradas: [{ motivo: 'setup', duracaoMs: 1800000 }] }),
    ])).toEqual([]);
    expect(ritmoPorHoraDoDia([])).toEqual([]);
    expect(ritmoPorHoraDoDia(undefined)).toEqual([]);
  });
});
