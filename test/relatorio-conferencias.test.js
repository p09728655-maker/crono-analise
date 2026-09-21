/**
 * As leituras do relatorio Ritmo por maquina que vivem por cima dos
 * resumos: os numeros do topo, as barras por medicao, a lateral por grupo
 * e o lote de uma maquina. Numeros conferidos na mao — o teste nao pode
 * estar errado junto com o codigo.
 */
import { describe, expect, it } from 'vitest';
import {
  TODAS, aproveitamentoDoNominal, barrasPorMedicao, escopoDaLateral, filtrarPorGrupo, filtrarPorMaquina,
  filtrarPorPeriodo, filtrarResumo, formatarDataHora, formatarNominal, itensDaLateral, loteDaMaquina,
  mapaNominalDoCadastro, resumoDoPeriodo,
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

  it('o ritmo de RELOGIO conta o periodo inteiro — e e ele que se compara com a demanda', () => {
    const r = resumoDoPeriodo(conferencias, [{ maquina: 'A' }]);
    // 720 pecas em 60 min de presenca = 720 pc/h. Comparar a demanda com os
    // 1080 de maquina rodando daria veredito otimista pelo tamanho da parada.
    expect(r.ritmoRelogio).toBe(720);
    expect(r.ritmoRelogio).toBeLessThan(r.ritmoMedio);
  });

  it('sem parada marcada, relogio e maquina rodando sao o mesmo numero', () => {
    const r = resumoDoPeriodo([{ duracao_ms: 60 * MIN, pecas: 600, paradas: [] }]);
    expect(r.ritmoRelogio).toBe(600);
    expect(r.ritmoMedio).toBe(600);
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

describe('escopoDaLateral — maquina, grupo ou todas', () => {
  it('sem item escolhido (ou em Todas) nao ha escopo: e a mesma ausencia do filtro', () => {
    expect(escopoDaLateral(null)).toBe(null);
    expect(escopoDaLateral('')).toBe(null);
    expect(escopoDaLateral(TODAS)).toBe(null);
  });

  it('o id de um GRUPO vem prefixado e devolve o nome do grupo', () => {
    expect(escopoDaLateral('grupo:0002 · FURADEIRA'))
      .toEqual({ tipo: 'grupo', chave: '0002 · FURADEIRA', rotulo: '0002 · FURADEIRA', semGrupo: false });
  });

  it('"Sem grupo" filtra pelo balde, mas no papel nao se chama grupo', () => {
    // No titulo de uma folha A4, "— Sem grupo" se le' como se houvesse um
    // grupo com esse nome, ao lado do campo "Grupos de máquina: —".
    expect(escopoDaLateral('grupo:Sem grupo'))
      .toEqual({ tipo: 'grupo', chave: 'Sem grupo', rotulo: 'Sem grupo no cadastro', semGrupo: true });
  });

  it('o id de uma MAQUINA vem prefixado e devolve o nome dela', () => {
    expect(escopoDaLateral('maquina:Furadeira 03'))
      .toEqual({ tipo: 'maquina', chave: 'Furadeira 03', rotulo: 'Furadeira 03' });
  });

  it('maquina com cara de grupo no nome nao vira filtro de grupo — o prefixo decide', () => {
    // O cadastro nao proibe ':' no nome. Sem o prefixo da maquina, esta
    // aqui abriria a tela vazia filtrando um grupo que nao existe.
    expect(escopoDaLateral('maquina:grupo:0002 · FURADEIRA'))
      .toEqual({ tipo: 'maquina', chave: 'grupo:0002 · FURADEIRA', rotulo: 'grupo:0002 · FURADEIRA' });
  });

  it('id sem prefixo vale como nome de maquina — a rede para um id de outro caminho', () => {
    expect(escopoDaLateral('Furadeira 03'))
      .toEqual({ tipo: 'maquina', chave: 'Furadeira 03', rotulo: 'Furadeira 03' });
  });

  it('prefixo sem nome de grupo nao filtra nada — seria a tela vazia sem motivo', () => {
    expect(escopoDaLateral('grupo:')).toBe(null);
    expect(escopoDaLateral('grupo:   ')).toBe(null);
  });
});

describe('filtrarPorGrupo — o corte do grupo inteiro', () => {
  const grupos = {
    'FURADEIRA 16': '0002 · FURADEIRA',
    'FURADEIRA 12': '0002 · FURADEIRA',
    'CNC SCM': '0006 · CNC',
  };
  const grupoDe = (m) => grupos[m] || null;
  const linhas = [
    { id: 1, maquina: 'FURADEIRA 16' },
    { id: 2, maquina: 'FURADEIRA 12' },
    { id: 3, maquina: 'CNC SCM' },
    { id: 4, maquina: 'Embaladora' },
    { id: 5, maquina: '' },
  ];

  it('sem grupo escolhido devolve tudo, o mesmo array', () => {
    expect(filtrarPorGrupo(linhas, null, grupoDe)).toBe(linhas);
  });

  it('leva TODAS as maquinas do grupo, e so elas', () => {
    expect(filtrarPorGrupo(linhas, '0002 · FURADEIRA', grupoDe).map((c) => c.id)).toEqual([1, 2]);
    expect(filtrarPorGrupo(linhas, '0006 · CNC', grupoDe).map((c) => c.id)).toEqual([3]);
  });

  it('o que o cadastro nao agrupou cai em "Sem grupo" — o mesmo balde da lateral', () => {
    expect(filtrarPorGrupo(linhas, 'Sem grupo', grupoDe).map((c) => c.id)).toEqual([4, 5]);
  });

  it('o resumo segue o mesmo corte — a folha e a tela saem do mesmo recorte', () => {
    const resumo = [{ maquina: 'FURADEIRA 16', n: 11 }, { maquina: 'CNC SCM', n: 1 }];
    expect(filtrarPorGrupo(resumo, '0002 · FURADEIRA', grupoDe))
      .toEqual([{ maquina: 'FURADEIRA 16', n: 11 }]);
  });

  it('sem cadastro nenhum, tudo e "Sem grupo" — nenhuma medicao some', () => {
    expect(filtrarPorGrupo(linhas, 'Sem grupo').map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
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
      'grupo:0002 · FURADEIRA', 'maquina:Furadeira 03',
      'grupo:0004 · FRESADORA', 'maquina:Fresadora 01',
      'grupo:Sem grupo', 'maquina:Embaladora',
    ]);
    expect(itens[0]).toEqual({ id: TODAS, rotulo: 'Todas', contador: 4 });
    expect(itens[1].cabecalho).toBe(true);
    // O grupo e' clicavel e conta as medicoes dele: e por esse item que se
    // imprime "as furadeiras" de uma vez.
    expect(itens[1]).toEqual({
      id: 'grupo:0002 · FURADEIRA',
      rotulo: '0002 · FURADEIRA',
      cabecalho: true,
      dica: 'Ver só as máquinas de 0002 · FURADEIRA',
      contador: 2,
    });
    // "Ver só as máquinas de Sem grupo" e' portugues quebrado: a dica do
    // balde e' escrita a parte.
    expect(itens.find((i) => i.id === 'grupo:Sem grupo').dica)
      .toBe('Ver só as máquinas sem grupo no cadastro');
    expect(itens[2]).toEqual({
      id: 'maquina:Furadeira 03', rotulo: 'Furadeira 03', contador: 2, recuado: true,
    });
  });

  it('com um grupo so nao ha cabecalho nem recuo — repetiria o obvio', () => {
    const itens = itensDaLateral({ resumo: [resumo[2]], total: 2, grupoDe });
    expect(itens.map((i) => i.id)).toEqual([TODAS, 'maquina:Furadeira 03']);
    expect(itens[1].recuado).toBe(false);
  });

  it('sem cadastro as maquinas aparecem mesmo assim, sem grupo', () => {
    const itens = itensDaLateral({ resumo, total: 4 });
    expect(itens.map((i) => i.id))
      .toEqual([TODAS, 'maquina:Fresadora 01', 'maquina:Embaladora', 'maquina:Furadeira 03']);
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

/**
 * A JANELA DE TEMPO do relatorio.
 *
 * Sem ela o relatorio somava todas as medicoes nao arquivadas para
 * sempre, e o "ritmo medio" do topo virava a media de meses — numero que
 * nao e' o ritmo de nada, sustentando decisao de capacidade.
 */
describe('filtrarPorPeriodo', () => {
  const AGORA = Date.parse('2026-09-15T12:00:00Z');
  const em = (iso) => ({ iniciado_em: iso, maquina: 'FURADEIRA 16' });

  it('mantem o que caiu dentro da janela e corta o resto', () => {
    const linhas = [
      em('2026-09-15T07:00:00Z'),   // hoje
      em('2026-09-10T07:00:00Z'),   // 5 dias
      em('2026-08-20T07:00:00Z'),   // 26 dias
      em('2026-06-01T07:00:00Z'),   // 106 dias
    ];
    expect(filtrarPorPeriodo(linhas, 7, AGORA)).toHaveLength(2);
    expect(filtrarPorPeriodo(linhas, 30, AGORA)).toHaveLength(3);
    expect(filtrarPorPeriodo(linhas, 90, AGORA)).toHaveLength(3);
  });

  it('dias nulo ou zero devolve tudo — e a opcao "Tudo" do seletor', () => {
    const linhas = [em('2026-06-01T07:00:00Z'), em('2020-01-01T07:00:00Z')];
    expect(filtrarPorPeriodo(linhas, 0, AGORA)).toHaveLength(2);
    expect(filtrarPorPeriodo(linhas, null, AGORA)).toHaveLength(2);
  });

  /**
   * A janela conta de AGORA, nao da ultima medicao: "ultimos 7 dias" que
   * se estica ate' achar medicao mente sobre o proprio rotulo.
   */
  it('janela sem medicao nenhuma devolve vazio, em vez de esticar', () => {
    expect(filtrarPorPeriodo([em('2026-08-01T07:00:00Z')], 7, AGORA)).toHaveLength(0);
  });

  /**
   * SALVO nao e' quando aconteceu: medicao feita offline sobe dias
   * depois, e cortar por ela poria a medicao de terca fora da janela que
   * a contem.
   */
  it('corta por quando MEDIU, nao por quando salvou', () => {
    const offline = { iniciado_em: '2026-09-14T07:00:00Z', salvo_em: '2026-09-15T07:00:00Z' };
    const antiga = { iniciado_em: '2026-07-01T07:00:00Z', salvo_em: '2026-09-15T07:00:00Z' };
    expect(filtrarPorPeriodo([offline, antiga], 7, AGORA)).toEqual([offline]);
  });

  it('sem instante legivel, a medicao fica DENTRO — nao some por falta de carimbo', () => {
    const semData = { maquina: 'FURADEIRA 16', pecas: 10 };
    expect(filtrarPorPeriodo([semData], 7, AGORA)).toEqual([semData]);
  });

  it('aceita camelCase do aparelho, como o resto do dominio', () => {
    const doAparelho = { iniciadoEm: '2026-09-14T07:00:00Z' };
    expect(filtrarPorPeriodo([doAparelho], 7, AGORA)).toEqual([doAparelho]);
    expect(filtrarPorPeriodo([{ iniciadoEm: '2026-01-01T07:00:00Z' }], 7, AGORA)).toHaveLength(0);
  });
});

describe('nominal do fabricante — em que patamar o ritmo estavel esta', () => {
  it('le o cadastro pela chave do nome; sem nominal a maquina fica fora', () => {
    const mapa = mapaNominalDoCadastro([
      { nome: 'FURADEIRA 16', nominal_ciclos_min: '15.00', nominal_fonte: 'Catálogo 2019' },
      { nome: 'FURADEIRA 12', nominal_ciclos_min: null, nominal_fonte: null },
      { nome: 'CNC SCM', nominal_ciclos_min: 0 },
    ]);
    expect(mapa.get('furadeira 16')).toEqual({ ciclosMin: 15, fonte: 'Catálogo 2019' });
    expect(mapa.has('furadeira 12')).toBe(false);
    expect(mapa.has('cnc scm')).toBe(false);
  });

  it('escreve o nominal com virgula, sem casa quando inteiro', () => {
    expect(formatarNominal('15.00')).toBe('15');
    expect(formatarNominal(12.5)).toBe('12,5');
  });

  it('compara ACIONAMENTOS por minuto rodando com o nominal', () => {
    // 600 pecas de 2 ciclos em 1 h rodando = 1200 acionamentos/h = 20/min.
    // Nominal 25/min -> 80%. Em pecas seria 10/min -> 40%, e a maquina
    // pareceria a metade do que fez.
    const g = { totalPecas: 600, totalAcionamentos: 1200, totalProdutivoMs: 3600000 };
    expect(aproveitamentoDoNominal(g, 25)).toBeCloseTo(80, 5);
  });

  it('resumo montado a mao, sem totalAcionamentos, cai nas pecas (1 ciclo)', () => {
    const g = { totalPecas: 733, totalProdutivoMs: 3600000 };
    // 733 pc/h = 12.2 pc/min contra 15 nominal -> 81%.
    expect(aproveitamentoDoNominal(g, 15)).toBeCloseTo((733 / 60 / 15) * 100, 5);
  });

  it('e nulo — nunca 0% — sem nominal, sem tempo rodando ou sem pecas', () => {
    const g = { totalPecas: 100, totalAcionamentos: 100, totalProdutivoMs: 600000 };
    expect(aproveitamentoDoNominal(g, null)).toBeNull();
    expect(aproveitamentoDoNominal(g, 0)).toBeNull();
    expect(aproveitamentoDoNominal({ ...g, totalProdutivoMs: 0 }, 15)).toBeNull();
    expect(aproveitamentoDoNominal({ ...g, totalPecas: 0, totalAcionamentos: 0 }, 15)).toBeNull();
    expect(aproveitamentoDoNominal(null, 15)).toBeNull();
  });
});
