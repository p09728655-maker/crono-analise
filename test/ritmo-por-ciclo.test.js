/**
 * O CICLO DO MOTOR COMO REGUA.
 *
 * A coleta pergunta ha' tempo quantos acionamentos do motor cada peca pede
 * (1, 2 ou 3), grava, calcula — e o relatorio do PC nao mostrava. Sem esse
 * dado, "as pecas sao diferentes" era o fim da conversa. Com ele, peca
 * diferente de MESMO ciclo ja' compara, e peca fora da faixa da sua classe
 * vira pergunta com endereco: o motor fez o mesmo trabalho, entao o tempo
 * foi para outro lugar.
 *
 * O que estes testes protegem, alem das contas: a RESSALVA. O ciclo iguala
 * a furacao, nao o manuseio — e um numero que se apresenta como comparacao
 * limpa quando nao e' faz estrago maior do que numero nenhum.
 */
import { describe, expect, it } from 'vitest';
import { resumirConferencias } from '../src/domain/cronoanalise.js';
import { classesDeCiclo, duelosDeCiclo, lerClasse } from '../src/domain/ritmoPorCiclo.js';

const MIN = 60000;

const porPeca = (linhas) => resumirConferencias(linhas, { porPeca: true });

/** Tres medicoes de 15 min da mesma peca na mesma maquina. */
const medicoes = (maquina, peca, pecas, extra = {}) => [0, 1, 2].map(() => ({
  maquina, peca, duracaoMs: 15 * MIN, pecas, ...extra,
}));

describe('resumirConferencias — o ciclo da peça', () => {
  it('a peça medida sempre com o mesmo ciclo declara o ciclo dela', () => {
    const [p] = porPeca(medicoes('F16', 'Lateral', 225, { ciclosPorPeca: 2 }));
    expect(p.ciclosPorPeca).toBe(2);
    expect(p.ciclosMistos).toBe(false);
    expect(p.ciclosVistos).toEqual([2]);
  });

  it('medição sem o dado vale 1 ciclo — é o padrão da coleta', () => {
    const [p] = porPeca(medicoes('F16', 'Lateral', 225));
    expect(p.ciclosPorPeca).toBe(1);
  });

  it('peça gravada ora com 1, ora com 2 NÃO vira peça de 1,5 ciclo', () => {
    const [p] = porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Lateral', 120, { ciclosPorPeca: 2 }),
    ]);
    // A media de acionamentos daria 1,5 — que nao e' nada. Null obriga
    // quem le a tratar como dado a corrigir, nao como peca exotica.
    expect(p.ciclosPorPeca).toBeNull();
    expect(p.ciclosMistos).toBe(true);
    expect(p.ciclosVistos).toEqual([1, 2]);
  });
});

describe('classesDeCiclo', () => {
  it('sem medição, sem classe', () => {
    expect(classesDeCiclo([])).toEqual({ classes: [], mistas: [] });
  });

  it('agrupa as peças da máquina pelo número de acionamentos', () => {
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Fundo', 210),
      ...medicoes('F16', 'Porta', 120, { ciclosPorPeca: 2 }),
    ]));
    expect(classes).toHaveLength(2);
    const um = classes.find((c) => c.ciclos === 1);
    const dois = classes.find((c) => c.ciclos === 2);
    expect(um.itens.map((i) => i.peca).sort()).toEqual(['Fundo', 'Lateral']);
    expect(dois.itens.map((i) => i.peca)).toEqual(['Porta']);
    // Uma peca so' nao faz faixa: uma leitura nao vira referencia.
    expect(dois.temFaixa).toBe(false);
    expect(um.temFaixa).toBe(true);
  });

  it('a faixa da classe sai em peças por minuto — a escala do posto', () => {
    // 225 pc/15min = 900 pc/h = 15 pc/min; 210 = 840 pc/h = 14 pc/min
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Fundo', 210),
    ]));
    const c = classes[0];
    expect(c.faixaPorMinuto.min).toBeCloseTo(14, 1);
    expect(c.faixaPorMinuto.max).toBeCloseTo(15, 1);
    // ~7% de amplitude: e' a faixa normal, nao desvio.
    expect(Math.round(c.amplitudePct)).toBe(7);
    expect(c.foraDaFaixa).toHaveLength(0);
  });

  it('a peça que sai da faixa da própria classe é apontada, com o desvio', () => {
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),   // 15 pc/min
      ...medicoes('F16', 'Fundo', 210),     // 14 pc/min
      ...medicoes('F16', 'Princesa', 120),  // 8 pc/min — bem abaixo
    ]));
    const c = classes.find((x) => x.ciclos === 1);
    expect(c.foraDaFaixa.map((i) => i.peca)).toEqual(['Princesa']);
    expect(c.foraDaFaixa[0].desvioPct).toBeLessThan(-15);
  });

  /**
   * A referencia da classe nao pode ser movida pela peca que ela deveria
   * denunciar. Com media ponderada, pecas a 15, 14 e 8 pc/min davam
   * referencia 12,3 — e a de 15, que e' normal, aparecia "21% acima do
   * esperado". O indicador apontava a peca certa como desvio.
   */
  it('a peça lenta NÃO arrasta a referência e faz as normais parecerem desvio', () => {
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),   // 15 pc/min — normal
      ...medicoes('F16', 'Fundo', 210),     // 14 pc/min — normal
      ...medicoes('F16', 'Princesa', 120),  // 8 pc/min — a atipica
    ]));
    const c = classes.find((x) => x.ciclos === 1);
    // A referencia fica no ritmo normal, nao na media puxada para baixo.
    expect(c.esperadoPorMinuto).toBeCloseTo(14, 1);
    // E o ritmo agregado real continua disponivel — util para somar, nunca
    // para julgar desvio.
    expect(c.agregado / 60).toBeLessThan(c.esperadoPorMinuto);
    expect(c.foraDaFaixa.map((i) => i.peca)).toEqual(['Princesa']);
  });

  it('o desvio é medido contra o esperado da classe, não contra a mais rápida', () => {
    // Se a ancora fosse a peca mais rapida, TODAS as outras cairiam "fora".
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Rapida', 300),  // 20 pc/min — a atipica
      ...medicoes('F16', 'A', 225),       // 15
      ...medicoes('F16', 'B', 225),       // 15
      ...medicoes('F16', 'C', 225),       // 15
    ]));
    const c = classes[0];
    // O esperado e' puxado pelo peso das tres iguais, entao quem sai da
    // faixa e' a rapida — e so' ela.
    expect(c.foraDaFaixa.map((i) => i.peca)).toEqual(['Rapida']);
    expect(c.foraDaFaixa[0].desvioPct).toBeGreaterThan(15);
  });

  it('o tempo de um acionamento é a régua neutra ao número de ciclos', () => {
    // Peca de 2 ciclos a 7,5 pc/min: cada acionamento leva o mesmo tempo
    // que o da peca de 1 ciclo a 15 pc/min — a maquina nao esta mais lenta.
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),                          // 15 pc/min, 1 ciclo
      ...medicoes('F16', 'Porta', 112.5, { ciclosPorPeca: 2 }),    // 7,5 pc/min, 2 ciclos
    ]));
    const um = classes.find((c) => c.ciclos === 1);
    const dois = classes.find((c) => c.ciclos === 2);
    expect(um.cicloMotorMs).toBeCloseTo(dois.cicloMotorMs, 0);
  });

  /**
   * A regua nao pode carregar dentro dela o que ela serve para isolar.
   * Com a media, uma classe de pecas a 4,0s e 4,3s por acionamento mais uma
   * de manuseio pesado a 7,5s dizia "o acionamento leva 4,8s" — numero que
   * nenhuma peca normal faz.
   */
  it('o tempo por acionamento sai do típico, não da média puxada pela atípica', () => {
    const { classes } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),   // 900 pc/h -> 4,0s por acionamento
      ...medicoes('F16', 'Fundo', 210),     // 840 pc/h -> 4,3s
      ...medicoes('F16', 'Princesa', 120),  // 480 pc/h -> 7,5s
    ]));
    const c = classes[0];
    expect(c.cicloMotorMs / 1000).toBeCloseTo(4.3, 1);
  });

  it('peça com ciclo divergente fica fora das classes e sai nomeada', () => {
    const { classes, mistas } = classesDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Confusa', 225),
      ...medicoes('F16', 'Confusa', 120, { ciclosPorPeca: 2 }),
    ]));
    expect(mistas.map((m) => m.peca)).toEqual(['Confusa']);
    expect(classes.flatMap((c) => c.itens.map((i) => i.peca))).not.toContain('Confusa');
  });
});

describe('duelosDeCiclo', () => {
  const grupoDe = (n) => (n.startsWith('F') ? '0002 · FURADEIRA' : '0001 · SECCIONADORA');

  it('peças DIFERENTES de mesmo ciclo comparam duas máquinas', () => {
    const duelos = duelosDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),  // 15 pc/min
      ...medicoes('F12', 'Fundo', 150),    // 10 pc/min
    ]), grupoDe);
    expect(duelos).toHaveLength(1);
    expect(duelos[0].ciclos).toBe(1);
    expect(duelos[0].lider.maquina).toBe('F16');
    expect(Math.round(duelos[0].difPct)).toBe(50);
  });

  it('ciclos diferentes NÃO duelam — a furação não é a mesma', () => {
    const duelos = duelosDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F12', 'Porta', 150, { ciclosPorPeca: 2 }),
    ]), grupoDe);
    expect(duelos).toHaveLength(0);
  });

  it('o duelo de ciclo não atravessa grupo, como todo o resto', () => {
    const duelos = duelosDeCiclo(porPeca([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('SEC 1', 'Chapa', 40),
    ]), grupoDe);
    expect(duelos).toHaveLength(0);
  });
});

describe('lerClasse', () => {
  const classeDe = (linhas, ciclos = 1) => classesDeCiclo(porPeca(linhas))
    .classes.find((c) => c.ciclos === ciclos);

  it('classe sem faixa não gera leitura — uma peça não é referência', () => {
    expect(lerClasse(classeDe(medicoes('F16', 'Lateral', 225)))).toEqual([]);
    expect(lerClasse(null)).toEqual([]);
  });

  it('ritmo batendo: diz que a furação manda, como deveria', () => {
    const frases = lerClasse(classeDe([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Fundo', 210),
    ]));
    expect(frases[0]).toContain('peças de um acionamento');
    expect(frases[0]).toContain('14.0');
    expect(frases[0]).toContain('15.0');
    expect(frases[0]).toContain('O ritmo bate');
    // O tempo do acionamento sai junto: e' a regua.
    expect(frases.join(' ')).toContain('Um acionamento do motor');
  });

  it('peça lenta na própria classe manda procurar no MANUSEIO, não na máquina', () => {
    const frases = lerClasse(classeDe([
      ...medicoes('F16', 'Lateral', 225),
      ...medicoes('F16', 'Fundo', 210),
      ...medicoes('F16', 'Princesa', 120),
    ]));
    const tudo = frases.join(' ');
    expect(tudo).toContain('Princesa sai a 8.0 pç/min');
    expect(tudo).toContain('abaixo das outras peças de um acionamento');
    expect(tudo).toContain('O motor faz o mesmo trabalho');
    expect(tudo).toContain('manuseio');
    // Nunca acusa a maquina de lenta: a furacao e' a mesma.
    expect(tudo).not.toContain('máquina está lenta');
  });

  it('duas ou três voltas do motor saem em plural correto', () => {
    const frases = lerClasse(classeDe([
      ...medicoes('F16', 'Porta', 112, { ciclosPorPeca: 2 }),
      ...medicoes('F16', 'Tampo', 105, { ciclosPorPeca: 2 }),
    ], 2));
    expect(frases[0]).toContain('peças de 2 acionamentos');
  });
});
