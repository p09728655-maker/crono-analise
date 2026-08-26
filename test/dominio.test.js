import { describe, expect, it } from 'vitest';
import {
  cartaDeControle, classificarEstabilidade, coeficienteVariacao, desvioPadrao,
  foraDeControle, media, mediana, observacoesMinimas, outliersRobustos,
  temposValidos, tendencia, ultimaObservacaoAtipica,
} from '../src/domain/estatistica.js';
import {
  amostraSuficiente, calcularOperacao, conferenciaRapida, duracaoEntreHoras,
  formatarCronometro, formatarDuracao, oee, operadoresNecessarios, taktTime,
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
