import { describe, expect, it } from 'vitest';
import {
  cartaDeControle, classificarEstabilidade, coeficienteVariacao, desvioPadrao,
  foraDeControle, media, mediana, observacoesMinimas, outliersRobustos,
  temposValidos, tendencia, ultimaObservacaoAtipica,
} from '../src/domain/estatistica.js';
import {
  amostraSuficiente, calcularOperacao, conferenciaRapida, duracaoEntreHoras,
  formatarCronometro, formatarDuracao, oee, operadoresNecessarios,
  resumirConferencias, resumirParadasDoEstudo, rotuloMotivo, somarParadas, taktTime,
} from '../src/domain/cronoanalise.js';

describe('temposValidos', () => {
  it('descarta toque acidental de ate 200ms', () => {
    expect(temposValidos([150, 200, 201, 5000])).toEqual([201, 5000]);
  });
  it('ignora valores nao numericos e entrada invalida', () => {
    expect(temposValidos([NaN, null, '900', 900])).toEqual([900]);
    expect(temposValidos(undefined)).toEqual([]);
  });
});

describe('estatistica basica', () => {
  it('media', () => expect(media([1000, 2000, 3000])).toBe(2000));
  it('desvio padrao e AMOSTRAL (n-1), nao populacional', () => {
    // Populacional daria 2; amostral da 2.5 -> sqrt = 1.5811
    expect(desvioPadrao([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.1381, 4);
  });
  it('desvio padrao de amostra unica e zero', () => expect(desvioPadrao([500])).toBe(0));
  it('CV% = sd/media*100', () => expect(coeficienteVariacao([100, 200])).toBeCloseTo(47.1405, 4));
});

describe('formula de Nievel', () => {
  // Valores citados na documentacao do app original.
  it('CV 15% exige ~35 observacoes', () => expect(observacoesMinimas(15)).toBe(35));
  it('CV 5% exige ~4 observacoes', () => expect(observacoesMinimas(5)).toBe(4));
  it('CV zero nao exige amostra', () => expect(observacoesMinimas(0)).toBe(0));
});

describe('carta de controle', () => {
  it('limite inferior nunca fica negativo', () => {
    expect(cartaDeControle([100, 5000, 100]).lic).toBe(0);
  });
  it('detecta ponto fora de 3 sigma com amostra grande o suficiente', () => {
    const serie = [...Array(19).fill(1000), 9000];
    expect(foraDeControle(serie).map((o) => o.valor)).toContain(9000);
  });

  it('DOCUMENTA o limite matematico: com n <= 10 a carta 3 sigma nunca acusa', () => {
    // max |x - media| / sd_amostral <= (n-1)/sqrt(n). Para n=10 isso da 2,85,
    // ou seja, menor que 3 por construcao — nenhum ponto pode ser sinalizado,
    // por mais absurdo que seja. Como a meta usual de coleta e' ~10 obs, a
    // carta so' comeca a funcionar a partir de n=11.
    const serie = [...Array(9).fill(1000), 999999];
    expect(serie).toHaveLength(10);
    expect(foraDeControle(serie)).toHaveLength(0);
    // A deteccao robusta continua funcionando nessa faixa.
    expect(outliersRobustos(serie).map((o) => o.valor)).toContain(999999);
  });

  it('DOCUMENTA a limitacao: um outlier grosseiro isolado mascara a si mesmo', () => {
    // O 5000 sozinho infla o sigma e eleva o LSC de ~1018ms para ~5444ms,
    // passando a caber dentro dos proprios limites. Por isso a coleta usa
    // deteccao robusta (MAD), nao a carta +-3 sigma.
    const serie = [1000, 1010, 990, 1005, 995, 1000, 1002, 998, 5000];
    expect(foraDeControle(serie)).toHaveLength(0);
  });
});

describe('deteccao robusta (MAD) — usada durante a coleta', () => {
  it('mediana ignora extremo', () => {
    expect(mediana([1000, 1010, 990, 5000])).toBe(1005);
  });

  it('pega o outlier que a carta 3 sigma deixa passar', () => {
    const serie = [1000, 1010, 990, 1005, 995, 1000, 1002, 998, 5000];
    expect(foraDeControle(serie)).toHaveLength(0);
    expect(outliersRobustos(serie).map((o) => o.valor)).toContain(5000);
  });

  it('nao acusa serie homogenea', () => {
    expect(outliersRobustos([1000, 1010, 990, 1005, 995, 1000])).toHaveLength(0);
  });

  it('serie curta nao gera acusacao', () => {
    expect(outliersRobustos([1000, 5000])).toHaveLength(0);
  });

  it('sinaliza o ciclo recem-coletado quando ele destoa', () => {
    const r = ultimaObservacaoAtipica([1000, 1010, 990, 1005, 995, 4000]);
    expect(r).not.toBeNull();
    expect(r.valor).toBe(4000);
    expect(r.acima).toBe(true);
  });

  it('nao sinaliza ciclo normal', () => {
    expect(ultimaObservacaoAtipica([1000, 1010, 990, 1005, 995, 1002])).toBeNull();
  });

  it('nao sinaliza antes de ter historico suficiente', () => {
    expect(ultimaObservacaoAtipica([1000, 1010, 4000])).toBeNull();
  });
});

describe('classificarEstabilidade', () => {
  it('ate 10% e estavel', () => expect(classificarEstabilidade(9).nivel).toBe('estavel'));
  it('ate 20% e atencao', () => expect(classificarEstabilidade(15).nivel).toBe('atencao'));
  it('acima de 20% e critico', () => expect(classificarEstabilidade(25).nivel).toBe('critico'));
});

describe('calcularOperacao', () => {
  const op = { nome: 'Furar lateral', fr: 100, tempos: [10000, 10000, 10000], paradas: [] };

  it('sem observacao valida retorna null em vez de zeros enganosos', () => {
    expect(calcularOperacao({ tempos: [50, 100] }, 10)).toBeNull();
  });

  it('TN = TO x FR/100', () => {
    const r = calcularOperacao({ ...op, fr: 90 }, 0);
    expect(r.toMed).toBe(10000);
    expect(r.tnMed).toBe(9000);
  });

  it('TP = TN x (1 + tolerancia/100)', () => {
    const r = calcularOperacao(op, 15);
    expect(r.tpVal).toBeCloseTo(11500, 6);
  });

  it('capacidade/hora = 3.600.000 / TP da PECA, arredondado para baixo', () => {
    // TP = 11500ms -> 3600000/11500 = 313.04 -> 313
    expect(calcularOperacao(op, 15).cap).toBe(313);
  });

  it('sem ciclosPorPeca informado, assume 1 ciclo por peca', () => {
    const r = calcularOperacao(op, 0);
    expect(r.ciclosPorPeca).toBe(1);
    expect(r.tpPorPeca).toBe(r.tpVal);
  });

  it('MULTIPLICA o tempo da peca pelos ciclos que ela exige', () => {
    // O cronometro mede um ciclo da maquina; a peca pode exigir varios.
    const r = calcularOperacao({ ...op, ciclosPorPeca: 3 }, 0);
    expect(r.tpVal).toBe(10000);
    expect(r.tpPorPeca).toBe(30000);
  });

  it('capacidade CAI na proporcao dos ciclos por peca', () => {
    // Este era o bug: 1 ciclo = 1 peca superestimava a capacidade em 3x.
    const um = calcularOperacao({ ...op, ciclosPorPeca: 1 }, 0);
    const tres = calcularOperacao({ ...op, ciclosPorPeca: 3 }, 0);
    expect(um.cap).toBe(360);
    expect(tres.cap).toBe(120);
  });

  it('valor invalido de ciclosPorPeca cai para 1, nunca para zero', () => {
    // Zero ou negativo zeraria o tempo da peca e daria capacidade infinita.
    for (const v of [0, -2, null, undefined, NaN, 'abc']) {
      expect(calcularOperacao({ ...op, ciclosPorPeca: v }, 0).ciclosPorPeca).toBe(1);
    }
  });

  it('soma a duracao das paradas', () => {
    const r = calcularOperacao({ ...op, paradas: [{ duracao: 3000 }, { duracao: 2000 }] }, 0);
    expect(r.totalParada).toBe(5000);
    expect(r.nParadas).toBe(2);
  });

  it('FR ausente assume 100%', () => {
    expect(calcularOperacao({ tempos: [4000, 4000] }, 0).tnMed).toBe(4000);
  });
});

describe('amostraSuficiente', () => {
  const estavel = calcularOperacao({ fr: 100, tempos: Array(12).fill(5000) }, 10);

  it('reprova quando abaixo da meta do analista', () => {
    expect(amostraSuficiente(estavel, 20).ok).toBe(false);
  });
  it('aprova quando atinge a meta do analista', () => {
    expect(amostraSuficiente(estavel, 10).ok).toBe(true);
  });
  it('reprova amostra inexistente', () => {
    expect(amostraSuficiente(null, 10).ok).toBe(false);
  });
  it('meta batida aprova MESMO com CV alto — Nievel e referencia, nao trava', () => {
    // Decisao de processo (ago/2026): a exigencia de Nievel virava pedido
    // sem fim de mais ciclos. Ele segue calculado (obsMinimas) e impresso,
    // mas quem fecha a amostra e' a meta do analista.
    const instavel = calcularOperacao({ fr: 100, tempos: [1000, 9000, 2000, 8000] }, 0);
    const r = amostraSuficiente(instavel, 4);
    expect(r.ok).toBe(true);
    expect(instavel.obsMinimas).toBeGreaterThan(4); // referencia continua disponivel
  });
});

describe('conferenciaRapida', () => {
  it('exemplo real: 150 pecas em 10 minutos -> 900 pc/h, ciclo medio 4s', () => {
    const r = conferenciaRapida({ duracaoMs: 10 * 60 * 1000, pecas: 150 });
    expect(r.pecasPorHora).toBe(900);
    expect(r.pecasPorMinuto).toBe(15);
    expect(r.cicloMedioMs).toBe(4000);
  });
  it('sem peca nao ha ciclo: ritmo zero e ciclo null, nunca zero enganoso', () => {
    const r = conferenciaRapida({ duracaoMs: 60000, pecas: 0 });
    expect(r.pecasPorHora).toBe(0);
    expect(r.cicloMedioMs).toBeNull();
  });
  it('duracao zero ou invalida nao produz resultado', () => {
    expect(conferenciaRapida({ duracaoMs: 0, pecas: 10 })).toBeNull();
    expect(conferenciaRapida({ duracaoMs: NaN, pecas: 10 })).toBeNull();
  });
  it('quantidade vem de input de texto: trunca fracao e ignora lixo', () => {
    expect(conferenciaRapida({ duracaoMs: 60000, pecas: '30.9' }).pecas).toBe(30);
    expect(conferenciaRapida({ duracaoMs: 60000, pecas: '' }).pecas).toBe(0);
    expect(conferenciaRapida({ duracaoMs: 60000, pecas: -5 }).pecas).toBe(0);
  });
  it('sem ciclosPorPeca assume 1: ciclo do motor E o ciclo medio', () => {
    const r = conferenciaRapida({ duracaoMs: 10 * 60 * 1000, pecas: 150 });
    expect(r.ciclosPorPeca).toBe(1);
    expect(r.cicloMotorMs).toBe(r.cicloMedioMs);
  });
  it('peca de 2 ciclos: o motor e acionado 2x por peca, ciclo do motor cai pela metade', () => {
    // 125 pc em 15 min rodando: ciclo medio 7,2 s/pc; com 2 acionamentos
    // por peca o motor fecha um ciclo a cada 3,6 s.
    const r = conferenciaRapida({ duracaoMs: 15 * 60 * 1000, pecas: 125, ciclosPorPeca: 2 });
    expect(r.cicloMedioMs).toBe(7200);
    expect(r.cicloMotorMs).toBe(3600);
    // O ritmo em PECAS nao muda: ciclos explicam o ritmo, nao o alteram.
    expect(r.pecasPorHora).toBe(500);
  });
  it('ciclosPorPeca invalido cai para 1, nunca para zero', () => {
    expect(conferenciaRapida({ duracaoMs: 60000, pecas: 10, ciclosPorPeca: 0 }).ciclosPorPeca).toBe(1);
    expect(conferenciaRapida({ duracaoMs: 60000, pecas: 10, ciclosPorPeca: 'x' }).ciclosPorPeca).toBe(1);
  });
});

describe('somarParadas', () => {
  const MIN = 60000;
  it('separa setup do resto — sao decisoes diferentes (SMED x causa da perda)', () => {
    const r = somarParadas([
      { motivo: 'setup', duracaoMs: 6 * MIN },
      { motivo: 'falta_material', duracaoMs: 4 * MIN },
    ]);
    expect(r.totalMs).toBe(10 * MIN);
    expect(r.setupMs).toBe(6 * MIN);
    expect(r.outrasMs).toBe(4 * MIN);
  });

  it('soma o mesmo motivo e devolve em ordem de Pareto', () => {
    const r = somarParadas([
      { motivo: 'setup', duracaoMs: 2 * MIN },
      { motivo: 'manutencao', duracaoMs: 9 * MIN },
      { motivo: 'setup', duracaoMs: 3 * MIN },
    ]);
    expect(r.porMotivo.map((m) => m.motivo)).toEqual(['manutencao', 'setup']);
    expect(r.porMotivo[1].ms).toBe(5 * MIN);
    expect(r.porMotivo[0].rotulo).toBe(rotuloMotivo('manutencao'));
  });

  it('linha zerada ou invalida nao vira parada; sem lista, zero', () => {
    expect(somarParadas([{ motivo: 'setup', duracaoMs: 0 }, { motivo: 'setup' }]).totalMs).toBe(0);
    expect(somarParadas(undefined).totalMs).toBe(0);
    expect(somarParadas([]).porMotivo).toEqual([]);
  });

  it('aceita o formato do banco (snake_case) e motivo ausente vira "outro"', () => {
    const r = somarParadas([{ duracao_ms: 5 * MIN }]);
    expect(r.totalMs).toBe(5 * MIN);
    expect(r.porMotivo[0].motivo).toBe('outro');
  });
});

describe('resumirParadasDoEstudo', () => {
  const MIN = 60000;
  const estudo = [
    {
      id: 'o1', nome: 'Fechar caixa', tempos: [10000, 10000, 10000],
      paradas: [
        { motivo: 'falta_material', duracao_ms: 12 * MIN, duracao: 12 * MIN },
        { motivo: 'setup', duracao_ms: 4 * MIN, duracao: 4 * MIN },
      ],
    },
    { id: 'o2', nome: 'Etiquetar', tempos: [5000, 5000], paradas: [{ motivo: 'setup', duracao_ms: 4 * MIN }] },
    { id: 'o3', nome: 'Sem parada', tempos: [8000], paradas: [] },
  ];

  it('soma o estudo inteiro e ordena os motivos por Pareto, com a acao de cada um', () => {
    const r = resumirParadasDoEstudo(estudo);
    expect(r.totalMs).toBe(20 * MIN);
    expect(r.n).toBe(3);
    expect(r.setupMs).toBe(8 * MIN);
    expect(r.porMotivo.map((m) => m.motivo)).toEqual(['falta_material', 'setup']);
    expect(r.porMotivo[0].pct).toBe(60);
    expect(r.porMotivo[1].n).toBe(2);
    expect(r.porMotivo[0].acao).toMatch(/kanban/i);
  });

  it('o percentual e sobre o tempo com o cronometro na mao, nunca sobre o turno', () => {
    const r = resumirParadasDoEstudo(estudo);
    // 48s de ciclos + 20 min de parada.
    expect(r.cronometradoMs).toBe(48000);
    expect(r.pctDoObservado).toBeCloseTo((20 * MIN) / (20 * MIN + 48000) * 100, 5);
  });

  it('lista por operacao so quem parou, do maior para o menor', () => {
    const r = resumirParadasDoEstudo(estudo);
    expect(r.porOperacao.map((o) => o.nome)).toEqual(['Fechar caixa', 'Etiquetar']);
    expect(r.porOperacao[0].ms).toBe(16 * MIN);
  });

  it('parada gravada com o ROTULO (dado antigo) agrupa junto com o codigo', () => {
    const r = resumirParadasDoEstudo([
      { id: 'x', nome: 'Op', tempos: [], paradas: [
        { motivo: 'Setup / Troca', duracao_ms: 5 * MIN },
        { motivo: 'setup', duracao_ms: 5 * MIN },
      ] },
    ]);
    expect(r.porMotivo.length).toBe(1);
    expect(r.setupMs).toBe(10 * MIN);
    expect(rotuloMotivo('Setup / Troca')).toBe('Setup / Troca');
  });

  it('estudo sem parada devolve zeros, nao quebra a tela', () => {
    const r = resumirParadasDoEstudo([{ id: 'a', nome: 'A', tempos: [1000], paradas: [] }]);
    expect(r.n).toBe(0);
    expect(r.totalMs).toBe(0);
    expect(r.pctDoObservado).toBe(0);
    expect(r.porMotivo).toEqual([]);
    expect(resumirParadasDoEstudo(undefined).n).toBe(0);
  });
});

describe('conferenciaRapida com paradas', () => {
  const MIN = 60000;

  it('setup sai do ritmo: 100 pc em 30 min com 10 min de setup sao 20 min rodando', () => {
    const r = conferenciaRapida({
      duracaoMs: 30 * MIN, pecas: 100, paradas: [{ motivo: 'setup', duracaoMs: 10 * MIN }],
    });
    expect(r.produtivoMs).toBe(20 * MIN);
    expect(r.paradaMs).toBe(10 * MIN);
    expect(r.setupMs).toBe(10 * MIN);
    expect(r.pecasPorHora).toBe(300);          // ritmo da maquina rodando
    expect(r.pecasPorHoraBruto).toBe(200);     // o que saiu do posto na meia hora
    expect(r.cicloMedioMs).toBe(12000);
    expect(r.disponibilidadePct).toBeCloseTo(66.67, 2);
  });

  it('sem parada marcada nada muda: os dois ritmos sao o mesmo numero', () => {
    const r = conferenciaRapida({ duracaoMs: 10 * MIN, pecas: 150 });
    expect(r.pecasPorHora).toBe(900);
    expect(r.pecasPorHoraBruto).toBe(900);
    expect(r.paradaMs).toBe(0);
    expect(r.disponibilidadePct).toBe(100);
  });

  it('parada maior que o periodo nao produz resultado — nao ha ritmo a medir', () => {
    expect(conferenciaRapida({
      duracaoMs: 10 * MIN, pecas: 50, paradas: [{ motivo: 'manutencao', duracaoMs: 10 * MIN }],
    })).toBeNull();
    expect(conferenciaRapida({
      duracaoMs: 10 * MIN, pecas: 50, paradas: [{ motivo: 'manutencao', duracaoMs: 99 * MIN }],
    })).toBeNull();
  });
});

describe('resumirConferencias', () => {
  const MIN = 60000;
  it('agrupa por maquina e pondera o ritmo pelo tempo, nao pela media das taxas', () => {
    const [g] = resumirConferencias([
      // 10 min a 900 pc/h (150 pc) + 110 min a 60 pc/h (110 pc):
      // media simples daria 480; ponderado da (260 pc / 2h) = 130.
      { maquina: 'Furadeira 03', peca: 'A', duracaoMs: 10 * MIN, pecas: 150 },
      { maquina: 'Furadeira 03', peca: 'B', duracaoMs: 110 * MIN, pecas: 110 },
    ]);
    expect(g.maquina).toBe('Furadeira 03');
    expect(g.n).toBe(2);
    expect(g.ritmoMedio).toBe(130);
    expect(g.melhor.ritmo).toBe(900);
    expect(g.melhor.peca).toBe('A');
    expect(g.pior.ritmo).toBe(60);
  });

  it('aceita linhas do servidor (snake_case) e maquina vazia vira "Sem máquina"', () => {
    const grupos = resumirConferencias([
      { maquina: '', peca: null, duracao_ms: 10 * MIN, pecas: 100 },
      { maquina: 'Seccionadora', duracao_ms: 10 * MIN, pecas: 50 },
    ]);
    expect(grupos.map((g) => g.maquina).sort()).toEqual(['Seccionadora', 'Sem máquina']);
  });

  it('o caso do print horrivel: 1 conferencia de 1 min NAO passa nos criterios', () => {
    const [g] = resumirConferencias([{ maquina: 'Furadeira', duracaoMs: MIN, pecas: 200 }]);
    expect(g.ritmoMedio).toBe(12000); // o numero continua la...
    expect(g.confiavel).toBe(false);  // ...mas carimbado de nao-referencia
    expect(g.motivos.length).toBe(3); // poucas medicoes, pouco tempo, periodo curto
  });

  it('ciclos de furacao viram acionamentos e o ciclo do motor pondera pelo tempo', () => {
    const [g] = resumirConferencias([
      // Peca simples (1 ciclo) e peca que sobe-e-desce (2 ciclos) na mesma
      // maquina: 100 + 50 pc, mas 100 + 100 acionamentos em 20 min.
      { maquina: 'F12', peca: 'Base', duracaoMs: 10 * MIN, pecas: 100, ciclosPorPeca: 1 },
      { maquina: 'F12', peca: 'Lateral dupla', duracao_ms: 10 * MIN, pecas: 50, ciclos_por_peca: 2 },
    ]);
    expect(g.totalPecas).toBe(150);
    expect(g.totalAcionamentos).toBe(200);
    expect(g.cicloMedioMs).toBe((20 * MIN) / 150);
    expect(g.cicloMotorMs).toBe((20 * MIN) / 200);
  });

  it('conferencia antiga sem o dado conta como 1 ciclo por peca', () => {
    const [g] = resumirConferencias([{ maquina: 'F', duracaoMs: 10 * MIN, pecas: 100 }]);
    expect(g.totalAcionamentos).toBe(100);
    expect(g.cicloMotorMs).toBe(g.cicloMedioMs);
  });

  it('3 conferencias, 30min+ observados e nenhuma curta: referencia OK', () => {
    const [g] = resumirConferencias([
      { maquina: 'F', duracaoMs: 10 * MIN, pecas: 100 },
      { maquina: 'F', duracaoMs: 10 * MIN, pecas: 110 },
      { maquina: 'F', duracaoMs: 10 * MIN, pecas: 90 },
    ]);
    expect(g.confiavel).toBe(true);
    expect(g.motivos).toEqual([]);
    expect(g.cvPct).toBeGreaterThan(0); // estabilidade vira referencia visivel
  });

  it('o ritmo por maquina sai do tempo RODANDO, e o do periodo fica ao lado', () => {
    const [g] = resumirConferencias([
      // 60 min de relogio, 20 de setup: 100 pc em 40 min rodando = 150 pc/h.
      { maquina: 'Furadeira 16', duracaoMs: 30 * MIN, pecas: 50, paradas: [{ motivo: 'setup', duracaoMs: 10 * MIN }] },
      { maquina: 'Furadeira 16', duracaoMs: 30 * MIN, pecas: 50, paradas: [{ motivo: 'setup', duracaoMs: 10 * MIN }] },
    ]);
    expect(g.totalMs).toBe(60 * MIN);
    expect(g.totalProdutivoMs).toBe(40 * MIN);
    expect(g.totalParadaMs).toBe(20 * MIN);
    expect(g.totalSetupMs).toBe(20 * MIN);
    expect(g.ritmoMedio).toBe(150);
    expect(g.ritmoBruto).toBe(100);
    expect(g.disponibilidadePct).toBeCloseTo(66.67, 2);
    expect(g.paradasPorMotivo).toEqual([{ motivo: 'setup', rotulo: 'Setup / Troca', ms: 20 * MIN }]);
  });

  it('meia hora quase toda em setup nao vira referencia — sobra pouco ritmo medido', () => {
    const [g] = resumirConferencias([
      { maquina: 'F', duracaoMs: 30 * MIN, pecas: 20, paradas: [{ motivo: 'setup', duracaoMs: 27 * MIN }] },
      { maquina: 'F', duracaoMs: 30 * MIN, pecas: 20, paradas: [{ motivo: 'setup', duracaoMs: 27 * MIN }] },
      { maquina: 'F', duracaoMs: 30 * MIN, pecas: 20, paradas: [{ motivo: 'setup', duracaoMs: 27 * MIN }] },
    ]);
    expect(g.confiavel).toBe(false);
    // Nao e' o numero de conferencias: sao 3. E' o tempo de maquina rodando.
    expect(g.motivos.join(' ')).toContain('tempo produtivo');
    expect(g.motivos.join(' ')).toContain('parados');
    expect(g.motivos.join(' ')).toContain('máquina rodando');
  });

  it('sem parada, o motivo continua falando de tempo observado (nada mudou para quem nao marca)', () => {
    const [g] = resumirConferencias([{ maquina: 'F', duracaoMs: 6 * MIN, pecas: 39 }]);
    expect(g.motivos.some((m) => m.startsWith('tempo total observado'))).toBe(true);
  });

  it('conferencia parada o periodo inteiro sai do resumo em vez de virar divisao por zero', () => {
    const grupos = resumirConferencias([
      { maquina: 'F', duracaoMs: 10 * MIN, pecas: 10, paradas: [{ motivo: 'manutencao', duracaoMs: 10 * MIN }] },
    ]);
    expect(grupos).toEqual([]);
  });

  it('mais medicoes primeiro; linha invalida (sem peca ou tempo) e ignorada', () => {
    const grupos = resumirConferencias([
      { maquina: 'B', duracaoMs: MIN, pecas: 10 },
      { maquina: 'A', duracaoMs: MIN, pecas: 10 },
      { maquina: 'A', duracaoMs: MIN, pecas: 20 },
      { maquina: 'C', duracaoMs: 0, pecas: 10 },
      { maquina: 'C', duracaoMs: MIN, pecas: 0 },
    ]);
    expect(grupos.map((g) => g.maquina)).toEqual(['A', 'B']);
  });
});

describe('duracaoEntreHoras', () => {
  it('exemplo real: 7:00 as 7:10 sao 10 minutos', () => {
    expect(duracaoEntreHoras('07:00', '07:10')).toBe(600000);
  });
  it('virada de meia-noite conta como dia seguinte (turno da noite)', () => {
    expect(duracaoEntreHoras('23:50', '00:10')).toBe(1200000);
  });
  it('horarios iguais significam "nao preenchido", nao 24 horas', () => {
    expect(duracaoEntreHoras('07:00', '07:00')).toBe(0);
  });
  it('entrada invalida ou vazia devolve zero', () => {
    expect(duracaoEntreHoras('', '07:10')).toBe(0);
    expect(duracaoEntreHoras('7h00', '07:10')).toBe(0);
    expect(duracaoEntreHoras('25:00', '07:10')).toBe(0);
    expect(duracaoEntreHoras('07:00', '07:61')).toBe(0);
    expect(duracaoEntreHoras(null, undefined)).toBe(0);
  });
  it('aceita hora sem zero a esquerda, como quem digita de cabeca', () => {
    expect(duracaoEntreHoras('7:00', '7:10')).toBe(600000);
  });
});

describe('formatarDuracao', () => {
  it('minutos puros', () => expect(formatarDuracao(600000)).toBe('10 min'));
  it('hora cheia', () => expect(formatarDuracao(3600000)).toBe('1 h'));
  it('horas e minutos', () => expect(formatarDuracao(9000000)).toBe('2 h 30 min'));
  it('abaixo de um minuto', () => expect(formatarDuracao(30000)).toBe('< 1 min'));
  it('zero ou invalido vira traco', () => {
    expect(formatarDuracao(0)).toBe('—');
    expect(formatarDuracao(NaN)).toBe('—');
  });
});

describe('takt e dimensionamento', () => {
  it('takt = tempo disponivel / quantidade', () => {
    expect(taktTime(28800, 480)).toBe(60000); // 8h para 480 pecas -> 60s
  });
  it('quantidade zero nao divide por zero', () => expect(taktTime(28800, 0)).toBe(0));
  it('operadores = soma TP / takt', () => {
    expect(operadoresNecessarios(180000, 60000)).toBe(3);
  });
  it('takt zero nao divide por zero', () => expect(operadoresNecessarios(180000, 0)).toBe(0));
});

describe('oee', () => {
  it('multiplica os tres fatores', () => {
    expect(oee({ disponibilidade: 0.9, desempenho: 0.95, qualidade: 0.99 }).oee).toBeCloseTo(0.84645, 5);
  });
});

describe('tendencia', () => {
  it('serie curta nao gera conclusao', () => {
    expect(tendencia([1000, 900]).direcao).toBe('estavel');
  });
  it('tempos caindo indicam curva de aprendizado', () => {
    expect(tendencia([10000, 9500, 9000, 8500, 8000, 7500]).direcao).toBe('aprendizado');
  });
  it('tempos subindo indicam degradacao', () => {
    expect(tendencia([7500, 8000, 8500, 9000, 9500, 10000]).direcao).toBe('degradacao');
  });
});

describe('formatarCronometro', () => {
  it('formata mm:ss.d', () => expect(formatarCronometro(65400)).toBe('01:05.4'));
  it('trata negativo como zero', () => expect(formatarCronometro(-5)).toBe('00:00.0'));
});
