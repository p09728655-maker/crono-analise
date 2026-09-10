/**
 * A tendencia do ritmo NO TEMPO — a serie que o grafico do relatorio de
 * conferencias desenha e a leitura que sai na tela e na folha A4.
 *
 * O caso que este teste existe para travar: peca diferente rende diferente
 * na mesma maquina, e uma reta sobre o ritmo BRUTO acusa "a maquina esta'
 * caindo" quando o que mudou foi o que ela estava furando.
 */
import { describe, expect, it } from 'vitest';
import { r2MinimoParaTendencia } from '../src/domain/estatistica.js';
import {
  MIN_MEDICOES_TENDENCIA, lerTendenciaPeriodo, serieDoPeriodo, tendenciasDoPeriodo,
} from '../src/domain/tendenciaPeriodo.js';

const min = (m) => m * 60000;

/** Uma medicao: data, maquina, peca, duracao, parado, pecas. */
const medicao = (data, maquina, peca, durMin, paradoMin, pecas, i = 0) => ({
  id: `${data}-${i}`,
  maquina,
  peca,
  pecas,
  ciclos_por_peca: 1,
  duracao_ms: min(durMin),
  salvo_em: `${data}-03:00`,
  iniciado_em: `${data}-03:00`,
  paradas: paradoMin ? [{ motivo: 'setup', duracao_ms: min(paradoMin), duracao: min(paradoMin) }] : [],
});

/** Medicao de 60 min sem parada: o ritmo sai igual ao numero de pecas. */
const ritmo = (data, peca, pecasPorHora, i) => medicao(data, 'FURADEIRA 16', peca, 60, 0, pecasPorHora, i);

describe('serieDoPeriodo', () => {
  it('ordena por data, mesmo com a lista vindo do mais recente para o mais antigo', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-10T08:00:00', 'A', 700, 1),
      ritmo('2026-09-01T08:00:00', 'A', 800, 2),
      ritmo('2026-09-05T08:00:00', 'A', 750, 3),
      ritmo('2026-09-08T08:00:00', 'A', 720, 4),
    ], 'FURADEIRA 16');
    expect(s.pontos.map((p) => Math.round(p.ritmo))).toEqual([800, 750, 720, 700]);
  });

  it('ignora medicao de outra maquina e medicao sem data', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-01T08:00:00', 'A', 800, 1),
      { ...ritmo('2026-09-02T08:00:00', 'A', 700, 2), maquina: 'FURADEIRA 12' },
      { ...ritmo('2026-09-03T08:00:00', 'A', 700, 3), salvo_em: null, iniciado_em: null },
    ], 'FURADEIRA 16');
    expect(s.n).toBe(1);
  });

  it('o eixo e o tempo REAL: quatro medicoes numa manha nao viram quatro passos iguais', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-01T08:00:00', 'A', 800, 2),
      ritmo('2026-09-01T09:00:00', 'A', 800, 3),
      ritmo('2026-09-30T09:00:00', 'A', 800, 4),
    ], 'FURADEIRA 16');
    // Os tres primeiros dias sao ~0 e o ultimo ~29: a escala e' de dias.
    expect(s.dias[2]).toBeLessThan(0.1);
    expect(s.dias[3]).toBeCloseTo(29, 0);
  });

  it('marca medicao curta (menos de 5 min rodando)', () => {
    const s = serieDoPeriodo([
      medicao('2026-09-01T07:00:00', 'M', 'A', 4, 0, 50, 1),
      medicao('2026-09-02T07:00:00', 'M', 'A', 30, 0, 375, 2),
      medicao('2026-09-03T07:00:00', 'M', 'A', 30, 0, 375, 3),
      medicao('2026-09-04T07:00:00', 'M', 'A', 30, 0, 375, 4),
    ], 'M');
    expect(s.pontos[0].confiavel).toBe(false);
    expect(s.pontos[1].confiavel).toBe(true);
  });

  it('o parado nao entra no ritmo: 30 min rodando de um periodo de 60', () => {
    const s = serieDoPeriodo([medicao('2026-09-01T07:00:00', 'M', 'A', 60, 30, 400, 1)], 'M');
    expect(Math.round(s.pontos[0].ritmo)).toBe(800);
  });
});

describe('a armadilha da peca', () => {
  /* Mesma maquina, ritmo constante DENTRO de cada peca. O que muda no
     tempo e' qual peca foi medida: as rapidas no comeco, as lentas no fim.
     A reta bruta cai; a maquina nao mudou nada. */
  const trocaDePeca = [
    ritmo('2026-09-01T07:00:00', 'RAPIDA', 800, 1),
    ritmo('2026-09-02T07:00:00', 'RAPIDA', 800, 2),
    ritmo('2026-09-08T07:00:00', 'LENTA', 640, 3),
    ritmo('2026-09-09T07:00:00', 'LENTA', 640, 4),
  ];

  it('a reta bruta cai, mas a direcao nao e afirmada', () => {
    const s = serieDoPeriodo(trocaDePeca, 'FURADEIRA 16');
    expect(s.pctBruto).toBeLessThan(-8);
    expect(s.direcao).toBe('estavel');
    expect(s.misturaPecas).toBe(true);
  });

  it('a leitura nomeia a causa e manda para o quadro certo', () => {
    const l = lerTendenciaPeriodo(serieDoPeriodo(trocaDePeca, 'FURADEIRA 16'));
    expect(l.rotulo).toBe('Efeito da peça');
    expect(l.frase).toMatch(/acompanha a peça medida/);
    expect(l.frase).toMatch(/Ritmo por peça/);
    expect(l.frase).not.toMatch(/broca|abastecimento/);
  });

  it('queda REAL na mesma peca continua sendo acusada', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-04T07:00:00', 'A', 745, 2),
      ritmo('2026-09-08T07:00:00', 'A', 700, 3),
      ritmo('2026-09-12T07:00:00', 'A', 650, 4),
    ], 'FURADEIRA 16');
    expect(s.direcao).toBe('caindo');
    const l = lerTendenciaPeriodo(s);
    expect(l.rotulo).toBe('Ritmo caindo');
    expect(l.tom).toBe('atencao');
    expect(l.frase).toMatch(/broca/);
  });

  it('subida real na mesma peca vira "vale virar padrao"', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 650, 1),
      ritmo('2026-09-04T07:00:00', 'A', 700, 2),
      ritmo('2026-09-08T07:00:00', 'A', 745, 3),
      ritmo('2026-09-12T07:00:00', 'A', 800, 4),
    ], 'FURADEIRA 16');
    expect(s.direcao).toBe('subindo');
    expect(lerTendenciaPeriodo(s).frase).toMatch(/virar padrão/);
  });

  it('queda real ATRAS de troca de peca e detectada quando a amostra sustenta', () => {
    // Cada peca cai 20% no tempo; as pecas tem patamares diferentes.
    // Tres medicoes de cada: n=6, k=2 -> 3 graus de liberdade.
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'RAPIDA', 880, 1),
      ritmo('2026-09-02T07:00:00', 'LENTA', 704, 2),
      ritmo('2026-09-06T07:00:00', 'RAPIDA', 800, 3),
      ritmo('2026-09-07T07:00:00', 'LENTA', 640, 4),
      ritmo('2026-09-11T07:00:00', 'RAPIDA', 720, 5),
      ritmo('2026-09-12T07:00:00', 'LENTA', 576, 6),
    ], 'FURADEIRA 16');
    expect(s.direcao).toBe('caindo');
  });

  it('a mesma queda com metade da amostra NAO e afirmada', () => {
    // n=4, k=2: sobra 1 grau de liberdade. Duas medicoes por peca nao
    // sustentam conclusao a 95%, por mais limpa que a queda pareca.
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'RAPIDA', 880, 1),
      ritmo('2026-09-02T07:00:00', 'LENTA', 704, 2),
      ritmo('2026-09-11T07:00:00', 'RAPIDA', 720, 3),
      ritmo('2026-09-12T07:00:00', 'LENTA', 576, 4),
    ], 'FURADEIRA 16');
    expect(s.direcao).toBe('estavel');
  });
});

describe('os graus de liberdade que a normalizacao consome', () => {
  it('o r2 minimo cobra pelas medias de peca estimadas, nao pelo n cru', () => {
    // 8 medicoes de 2 pecas: n efetivo 7 (df 5), nao 8 (df 6).
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1), ritmo('2026-09-02T07:00:00', 'B', 640, 2),
      ritmo('2026-09-05T07:00:00', 'A', 780, 3), ritmo('2026-09-06T07:00:00', 'B', 620, 4),
      ritmo('2026-09-09T07:00:00', 'A', 760, 5), ritmo('2026-09-10T07:00:00', 'B', 600, 6),
      ritmo('2026-09-13T07:00:00', 'A', 740, 7), ritmo('2026-09-14T07:00:00', 'B', 580, 8),
    ], 'FURADEIRA 16');
    expect(s.nEfetivo).toBe(7);
    expect(s.r2Minimo).toBeCloseTo(r2MinimoParaTendencia(7), 6);
    expect(s.r2Minimo).toBeGreaterThan(r2MinimoParaTendencia(8));
  });

  it('cada peca medida uma vez so nao afirma nada', () => {
    // Normalizada, a serie inteira vira 1: nao sobra nada para o tempo
    // explicar, e os graus de liberdade zeram.
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 900, 1),
      ritmo('2026-09-05T07:00:00', 'B', 800, 2),
      ritmo('2026-09-09T07:00:00', 'C', 700, 3),
      ritmo('2026-09-13T07:00:00', 'D', 600, 4),
    ], 'FURADEIRA 16');
    expect(s.nEfetivo).toBe(1);
    expect(s.r2Minimo).toBe(1);
    expect(s.direcao).toBe('estavel');
    expect(lerTendenciaPeriodo(s).rotulo).toBe('Efeito da peça');
  });
});

describe('lerTendenciaPeriodo', () => {
  it('abaixo do minimo diz quantas medicoes destravam a leitura', () => {
    const s = serieDoPeriodo([ritmo('2026-09-01T07:00:00', 'A', 800, 1)], 'FURADEIRA 16');
    const l = lerTendenciaPeriodo(s);
    expect(l.rotulo).toBe('Poucas medições');
    expect(l.frase).toMatch(/Com 1 medição/);
    expect(l.frase).toMatch(new RegExp(`a partir de ${MIN_MEDICOES_TENDENCIA}`));
  });

  it('uma peca so, sem deriva: estavel serve de referencia de capacidade', () => {
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-04T07:00:00', 'A', 790, 2),
      ritmo('2026-09-08T07:00:00', 'A', 805, 3),
      ritmo('2026-09-12T07:00:00', 'A', 795, 4),
    ], 'FURADEIRA 16');
    const l = lerTendenciaPeriodo(s);
    expect(l.rotulo).toBe('Ritmo estável');
    expect(l.frase).toMatch(/referência de capacidade/);
  });
});

describe('tendenciasDoPeriodo', () => {
  it('devolve uma serie por maquina do resumo, na ordem dele', () => {
    const linhas = [
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      { ...ritmo('2026-09-02T07:00:00', 'A', 700, 2), maquina: 'FURADEIRA 12' },
    ];
    const series = tendenciasDoPeriodo(linhas, [{ maquina: 'FURADEIRA 12' }, { maquina: 'FURADEIRA 16' }]);
    expect(series.map((s) => s.maquina)).toEqual(['FURADEIRA 12', 'FURADEIRA 16']);
    expect(series.map((s) => s.n)).toEqual([1, 1]);
  });
});

describe('o selo do quadro', () => {
  it('nao carrega porcentagem quando a leitura e "estavel"', () => {
    // "Ritmo estável · −7%" se contradiz na mesma linha.
    const s = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-04T07:00:00', 'A', 790, 2),
      ritmo('2026-09-08T07:00:00', 'A', 805, 3),
      ritmo('2026-09-12T07:00:00', 'A', 795, 4),
    ], 'FURADEIRA 16');
    expect(lerTendenciaPeriodo(s).mostrarPct).toBe(false);
  });

  it('carrega porcentagem quando ha o que afirmar sobre a linha', () => {
    const caindo = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-04T07:00:00', 'A', 745, 2),
      ritmo('2026-09-08T07:00:00', 'A', 700, 3),
      ritmo('2026-09-12T07:00:00', 'A', 650, 4),
    ], 'FURADEIRA 16');
    expect(lerTendenciaPeriodo(caindo).mostrarPct).toBe(true);

    const peca = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'RAPIDA', 800, 1),
      ritmo('2026-09-02T07:00:00', 'RAPIDA', 800, 2),
      ritmo('2026-09-08T07:00:00', 'LENTA', 640, 3),
      ritmo('2026-09-09T07:00:00', 'LENTA', 640, 4),
    ], 'FURADEIRA 16');
    expect(lerTendenciaPeriodo(peca).mostrarPct).toBe(true);
  });
});

describe('a forma do retorno', () => {
  it('serie curta devolve os mesmos campos, zerados — nada de undefined', () => {
    const curta = serieDoPeriodo([ritmo('2026-09-01T07:00:00', 'A', 800, 1)], 'FURADEIRA 16');
    const cheia = serieDoPeriodo([
      ritmo('2026-09-01T07:00:00', 'A', 800, 1),
      ritmo('2026-09-04T07:00:00', 'A', 790, 2),
      ritmo('2026-09-08T07:00:00', 'A', 805, 3),
      ritmo('2026-09-12T07:00:00', 'A', 795, 4),
    ], 'FURADEIRA 16');
    expect(Object.keys(curta).sort()).toEqual(Object.keys(cheia).sort());
    for (const campo of ['pct', 'pctBruto', 'r2']) {
      expect(Number.isFinite(curta[campo]), campo).toBe(true);
    }
  });
});
