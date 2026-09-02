/**
 * As leituras do relatorio Ritmo por maquina que vivem por cima dos
 * resumos: os numeros do topo, as barras por medicao, a lateral por grupo
 * e o lote de uma maquina. Numeros conferidos na mao — o teste nao pode
 * estar errado junto com o codigo.
 */
import { describe, expect, it } from 'vitest';
import {
  TODAS, barrasPorMedicao, filtrarPorMaquina, filtrarResumo, formatarDataHora, itensDaLateral,
  loteDaMaquina, resumoDoPeriodo,
} from '../src/domain/relatorioConferencias.js';

const MIN = 60000;

describe('resumoDoPeriodo — os numeros do topo', () => {
  // 30 min com 10 de setup (420 pc), 20 min sem parada (300 pc) e 10 min
  // inteiros parados por falta de material — a parada marcada (15 min) e'
  // MAIOR que o periodo, e so' pode contar ate' o periodo.
  const conferencias = [
    { duracao_ms: 30 * MIN, pecas: 420, paradas: [{ motivo: 'setup', duracao_ms: 10 * MIN }] },
    { duracao_ms: 20 * MIN, pecas: 300, paradas: [] },
    { duracao_ms: 10 * MIN, pecas: 0, paradas: [{ motivo: 'falta_material', duracaoMs: 15 * MIN }] },
  ];

  it('soma periodo, parado (ate o periodo) e rodando, e o ritmo sai do tempo RODANDO', () => {
    const r = resumoDoPeriodo(conferencias, [{ maquina: 'A' }, { maquina: 'B' }]);
    expect(r.n).toBe(3);
    expect(r.maquinas).toBe(2);
    expect(r.pecasTot).toBe(720);
    expect(r.totalMs).toBe(60 * MIN);
    // 10 (setup) + 0 + 10 (a parada de 15 conta so' os 10 do periodo)
    expect(r.paradaMs).toBe(20 * MIN);
    expect(r.produtivoMs).toBe(40 * MIN);
    // 720 pecas em 40 min rodando = 1080 pc/h — nao 720 (periodo inteiro)
    expect(r.ritmoMedio).toBe(1080);
  });

  it('o pareto lista os motivos do maior para o menor, com o setup a parte', () => {
    const { pareto } = resumoDoPeriodo(conferencias);
    // Soma bruta por motivo (15 + 10 = 25 min), sem o teto do periodo que
    // `paradaMs` aplica (20 min): e' de proposito — ver resumoDoPeriodo.
    expect(pareto.totalMs).toBe(25 * MIN);
    expect(pareto.setupMs).toBe(10 * MIN);
    expect(pareto.porMotivo[0].motivo).toBe('falta_material');
    expect(pareto.porMotivo[0].ms).toBe(15 * MIN);
    expect(pareto.porMotivo[1].motivo).toBe('setup');
  });

  it('e ponderado pelo tempo: a medicao de 5 min nao vale o mesmo que a de 2 h', () => {
    const r = resumoDoPeriodo([
      { duracao_ms: 5 * MIN, pecas: 100 }, // 1200 pc/h
      { duracao_ms: 120 * MIN, pecas: 1200 }, // 600 pc/h
    ]);
    // 1300 pecas em 125 min = 624 pc/h. A media das taxas daria 900.
    expect(r.ritmoMedio).toBe(624);
  });

  it('sem tempo rodando o ritmo e null — nunca Infinity', () => {
    const r = resumoDoPeriodo([
      { duracao_ms: 10 * MIN, pecas: 50, paradas: [{ motivo: 'manutencao', duracao_ms: 10 * MIN }] },
    ]);
    expect(r.produtivoMs).toBe(0);
    expect(r.ritmoMedio).toBeNull();
  });

  it('sem medicao nao ha painel', () => {
    expect(resumoDoPeriodo([])).toBeNull();
  });
});

describe('barrasPorMedicao — o grafico com a maquina filtrada', () => {
  const lista = [
    // A lista chega da mais RECENTE para a mais antiga.
    { id: 'c3', peca: 'Lateral mesa cabeceira sleep', hora_inicial: '08:00', hora_final: '08:03',
      duracao_ms: 3 * MIN, pecas: 45 },
    { id: 'c2', peca: '', duracao_ms: 0, pecas: 10, salvo_em: '2026-09-01T10:00:00Z' },
    { id: 'c1', peca: 'Base', hora_inicial: '07:00', hora_final: '07:30',
      duracao_ms: 30 * MIN, pecas: 420, paradas: [{ motivo: 'setup', duracao_ms: 10 * MIN }] },
  ];

  it('sem maquina escolhida nao ha barras por medicao', () => {
    expect(barrasPorMedicao(lista, null)).toBeNull();
  });

  it('inverte para a ordem de medicao e deixa de fora a medicao sem ritmo', () => {
    const barras = barrasPorMedicao(lista, 'Furadeira 03');
    expect(barras.map((b) => b.chave)).toEqual(['c1', 'c3']);
    expect(barras.every((b) => b.maquina === 'Furadeira 03')).toBe(true);
  });

  it('o ritmo da barra e o de maquina RODANDO, e a marca de curta e por tempo rodando', () => {
    const [c1, c3] = barrasPorMedicao(lista, 'Furadeira 03');
    // 420 pecas em 20 min rodando (30 - 10 de setup) = 1260 pc/h
    expect(c1.ritmoMedio).toBe(1260);
    expect(c1.rotulo).toBe('07:00–07:30');
    expect(c1.nota).toBe('Base');
    expect(c1.confiavel).toBe(true);
    // 45 pecas em 3 min = 900 pc/h, mas 3 min e' menos que os 5 do criterio
    expect(c3.ritmoMedio).toBe(900);
    expect(c3.confiavel).toBe(false);
  });

  it('a peca comprida e cortada para caber embaixo da barra', () => {
    const [, c3] = barrasPorMedicao(lista, 'Furadeira 03');
    expect(c3.nota).toBe('Lateral mesa cabece…');
    expect(c3.nota.length).toBe(20);
  });

  it('sem horario a barra leva a data em que foi salva', () => {
    const [b] = barrasPorMedicao([{ id: 'x', duracao_ms: 10 * MIN, pecas: 5, salvo_em: '2026-09-01T10:00:00Z' }], 'M');
    expect(b.rotulo).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});

describe('formatarDataHora', () => {
  it('data invalida vira travessao, nunca "Invalid Date"', () => {
    expect(formatarDataHora(undefined)).toBe('—');
    expect(formatarDataHora('ontem')).toBe('—');
  });
});

describe('filtrarPorMaquina — o corte da lateral', () => {
  const linhas = [
    { id: 1, maquina: 'Furadeira 03' },
    { id: 2, maquina: 'FURADEIRA  03 ' },
    { id: 3, maquina: 'Fresadora 01' },
    { id: 4, maquina: '' },
  ];

  it('sem filtro devolve tudo, o mesmo array', () => {
    expect(filtrarPorMaquina(linhas, null)).toBe(linhas);
  });

  it('casa pela chave normalizada: caixa e espaco repetido nao separam a maquina', () => {
    expect(filtrarPorMaquina(linhas, 'furadeira 03').map((c) => c.id)).toEqual([1, 2]);
  });

  it('medicao sem maquina e filtravel como "Sem máquina"', () => {
    expect(filtrarPorMaquina(linhas, 'Sem máquina').map((c) => c.id)).toEqual([4]);
  });

  it('o resumo segue o mesmo corte', () => {
    const resumo = [{ maquina: 'Furadeira 03' }, { maquina: 'Fresadora 01' }];
    expect(filtrarResumo(resumo, 'FURADEIRA 03')).toEqual([{ maquina: 'Furadeira 03' }]);
    expect(filtrarResumo(resumo, null)).toBe(resumo);
  });
});

describe('itensDaLateral — as maquinas debaixo do grupo do cadastro', () => {
  const grupos = { 'Furadeira 03': '0002 · FURADEIRA', 'Fresadora 01': '0004 · FRESADORA' };
  const grupoDe = (m) => grupos[m] || null;
  const resumo = [
    { maquina: 'Fresadora 01', n: 1 },
    { maquina: 'Embaladora', n: 1 },
    { maquina: 'Furadeira 03', n: 2 },
  ];

  it('comeca por Todas, ordena os grupos pelo codigo e deixa Sem grupo por ultimo', () => {
    const itens = itensDaLateral({ resumo, total: 4, grupoDe });
    expect(itens.map((i) => i.id)).toEqual([
      TODAS,
      'grupo:0002 · FURADEIRA', 'Furadeira 03',
      'grupo:0004 · FRESADORA', 'Fresadora 01',
      'grupo:Sem grupo', 'Embaladora',
    ]);
    expect(itens[0]).toEqual({ id: TODAS, rotulo: 'Todas', contador: 4 });
    expect(itens[1].cabecalho).toBe(true);
    expect(itens[2]).toEqual({ id: 'Furadeira 03', rotulo: 'Furadeira 03', contador: 2, recuado: true });
  });

  it('com um grupo so nao ha cabecalho nem recuo — repetiria o obvio', () => {
    const itens = itensDaLateral({ resumo: [resumo[2]], total: 2, grupoDe });
    expect(itens.map((i) => i.id)).toEqual([TODAS, 'Furadeira 03']);
    expect(itens[1].recuado).toBe(false);
  });

  it('sem cadastro as maquinas aparecem mesmo assim, sem grupo', () => {
    const itens = itensDaLateral({ resumo, total: 4 });
    expect(itens.map((i) => i.id)).toEqual([TODAS, 'Fresadora 01', 'Embaladora', 'Furadeira 03']);
  });

  it('sem medicao a lateral fica sem itens', () => {
    expect(itensDaLateral({ resumo: [], total: 0, grupoDe })).toEqual([]);
  });
});

describe('loteDaMaquina — arquivar o que esta na tela', () => {
  const visiveis = [{ id: 'a' }, { id: 'b' }];

  it('so existe com maquina escolhida e linhas na tela', () => {
    expect(loteDaMaquina({ filtro: null, visiveis })).toBeNull();
    expect(loteDaMaquina({ filtro: 'Furadeira 03', visiveis: [] })).toBeNull();
  });

  it('leva os ids visiveis e o estado que vao receber: arquivar nas ativas, restaurar nas arquivadas', () => {
    expect(loteDaMaquina({ filtro: 'Furadeira 03', visiveis, verArquivadas: false }))
      .toEqual({ maquina: 'Furadeira 03', ids: ['a', 'b'], arquivada: true });
    expect(loteDaMaquina({ filtro: 'Furadeira 03', visiveis, verArquivadas: true }).arquivada).toBe(false);
  });
});
