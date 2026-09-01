/**
 * COMPARATIVO ENTRE MAQUINAS — o que o modulo pode e o que ele se RECUSA a
 * afirmar.
 *
 * A maior parte destes testes protege recusas, nao calculos: nao comparar
 * maquinas de grupos diferentes, nao eleger vencedor quando o mix de pecas
 * e' incomparavel, nao apontar lider dentro do ruido. Sao exatamente as
 * afirmacoes erradas que um ranking corrido de pecas/hora produziria — e
 * que iriam para uma reuniao como se fossem verdade.
 *
 * O resumo vem da propria funcao de dominio (resumirConferencias): se ele
 * mudar de forma, quebra aqui e nao na tela.
 */
import { describe, expect, it } from 'vitest';
import { resumirConferencias } from '../src/domain/cronoanalise.js';
import { compararMaquinas, constanciaTexto, lerGrupo } from '../src/domain/comparativoMaquinas.js';

const MIN = 60000;

/** Grupos de cadastro: F* sao furadeiras, SEC* seccionadoras. */
const grupoDe = (nome) => (nome.startsWith('F') ? '0002 · FURADEIRA' : '0001 · SECCIONADORA');

/** `grupo: null` reproduz a fabrica sem cadastro de grupos preenchido. */
const comparar = (linhas, grupo = grupoDe) => compararMaquinas({
  maquinas: resumirConferencias(linhas),
  pecas: resumirConferencias(linhas, { porPeca: true }),
  grupoDe: grupo,
});

/** Tres medicoes de 15 min — o bastante para fechar o criterio de amostra. */
function medicoes(maquina, peca, pecasPorMedicao, extra = {}) {
  return [0, 1, 2].map(() => ({
    maquina, peca, duracaoMs: 15 * MIN, pecas: pecasPorMedicao, ...extra,
  }));
}

describe('compararMaquinas', () => {
  it('sem medicao, sem comparativo — nunca inventa grupo', () => {
    expect(compararMaquinas()).toEqual({ grupos: [], duelos: [], comparaveis: 0, semPar: [] });
  });

  it('maquina sozinha no grupo nao vira comparativo — sai nomeada em semPar', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225),
      ...medicoes('SEC 1', 'Chapa', 40),
    ]);
    expect(r.grupos).toHaveLength(0);
    expect(r.semPar.map((s) => s.maquina).sort()).toEqual(['F16', 'SEC 1']);
  });

  it('NUNCA compara maquinas de grupos diferentes — seccionadora nao disputa com furadeira', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225),   // 900 pc/h
      ...medicoes('F12', 'A', 150),   // 600 pc/h
      ...medicoes('SEC 1', 'Chapa', 40),  // 160 pc/h — a mais "lenta" de todas
      ...medicoes('SEC 2', 'Chapa', 50),
    ]);
    expect(r.grupos.map((g) => g.grupo)).toEqual(['0001 · SECCIONADORA', '0002 · FURADEIRA']);
    // Cada grupo com seu proprio lider: a seccionadora nunca aparece medida
    // contra a furadeira, nem como lanterna geral.
    const furadeiras = r.grupos.find((g) => g.grupo.includes('FURADEIRA'));
    const seccionadoras = r.grupos.find((g) => g.grupo.includes('SECCIONADORA'));
    expect(furadeiras.linhas.map((l) => l.maquina)).toEqual(['F16', 'F12']);
    expect(seccionadoras.linhas.map((l) => l.maquina)).toEqual(['SEC 2', 'SEC 1']);
    expect(seccionadoras.lider.maquina).toBe('SEC 2');
  });

  it('mesma peca nas duas: comparacao limpa, com o lider e a diferenca', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225),  // 900 pc/h
      ...medicoes('F12', 'A', 150),  // 600 pc/h
    ]);
    const g = r.grupos[0];
    expect(g.lider.maquina).toBe('F16');
    expect(g.lanterna.maquina).toBe('F12');
    expect(g.mixIgual).toBe(true);
    expect(g.comparavel).toBe(true);
    expect(g.empate).toBe(false);
    // 900 contra 600: o lider roda 50% mais rapido — a MESMA conta da
    // analise automatica, para os dois quadros nao se contradizerem.
    expect(Math.round(g.difPct)).toBe(50);
    // E o indice da tabela: 100% no lider, 67% na outra.
    expect(Math.round(g.lider.indicePct)).toBe(100);
    expect(Math.round(g.lanterna.indicePct)).toBe(67);
  });

  it('diferenca dentro do ruido (< 5%) e EMPATE — nao se aponta vencedor', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 204),  // 816 pc/h
      ...medicoes('F12', 'A', 200),  // 800 pc/h
    ]);
    expect(r.grupos[0].empate).toBe(true);
    expect(r.grupos[0].difPct).toBeLessThan(5);
  });

  it('mix de pecas diferente e SEM peca em comum: recusa a comparacao de ritmo', () => {
    const r = comparar([
      ...medicoes('F16', 'Peca de 4 furos', 225),
      ...medicoes('F12', 'Peca de 12 furos', 150),
    ]);
    const g = r.grupos[0];
    // O numero continua na tabela — o que nao existe e' o veredito.
    expect(g.mixIgual).toBe(false);
    expect(g.comparavel).toBe(false);
    expect(g.pecasEmComum).toBe(0);
    expect(g.duelos).toHaveLength(0);
  });

  it('mix diferente COM peca em comum: a peca em comum sustenta a comparacao', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225),
      ...medicoes('F16', 'So da F16', 300),
      ...medicoes('F12', 'A', 150),
    ]);
    const g = r.grupos[0];
    expect(g.mixIgual).toBe(false);
    expect(g.pecasEmComum).toBe(1);
    expect(g.comparavel).toBe(true);
    expect(g.duelos).toHaveLength(1);
    expect(g.duelos[0].peca).toBe('A');
    expect(g.duelos[0].lider.maquina).toBe('F16');
    expect(Math.round(g.duelos[0].difPct)).toBe(50);
  });

  it('o duelo por peca desmente a tabela quando a diferenca era do MIX', () => {
    // Na peca A as duas rodam praticamente igual (900 x 880). A F16 parece
    // muito na frente so' porque tambem mediu uma peca facil, de 1800 pc/h.
    const r = comparar([
      ...medicoes('F16', 'A', 225),         // 900 pc/h
      ...medicoes('F16', 'Peca facil', 450), // 1800 pc/h
      ...medicoes('F12', 'A', 220),         // 880 pc/h
    ]);
    const g = r.grupos[0];
    expect(g.lider.maquina).toBe('F16');
    // A tabela mostra a F16 bem na frente...
    expect(g.difPct).toBeGreaterThan(30);
    // ...e o duelo da peca em comum mostra que a maquina nao e' o motivo.
    expect(g.duelos[0].peca).toBe('A');
    expect(g.duelos[0].empate).toBe(true);
  });

  it('duelos saem ordenados pela MAIOR diferenca — onde ha ganho para buscar', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 220),   // ~2%
      ...medicoes('F16', 'B', 300), ...medicoes('F12', 'B', 150),   // 100%
    ]);
    expect(r.duelos.map((d) => d.peca)).toEqual(['B', 'A']);
  });

  it('a mesma peca em GRUPOS diferentes nao duela — e roteiro, nao disputa', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 150),
      ...medicoes('SEC 1', 'A', 40), ...medicoes('SEC 2', 'A', 50),
    ]);
    expect(r.duelos).toHaveLength(2);
    for (const d of r.duelos) {
      expect(d.linhas.every((l) => grupoDe(l.maquina) === d.grupo)).toBe(true);
    }
  });

  it('lider de RITMO e lider de DISPONIBILIDADE podem ser maquinas diferentes', () => {
    const r = comparar([
      // F16 corre mais com ela rodando (900 pc/h contra 600), mas passa
      // METADE do periodo parada em setup: quem entrega mais peca por hora
      // de posto e' a F12. Sao perguntas diferentes, e as duas importam.
      ...[0, 1, 2].map(() => ({
        maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 225,
        paradas: [{ motivo: 'setup', duracaoMs: 15 * MIN }],
      })),
      ...medicoes('F12', 'A', 150),
    ]);
    const g = r.grupos[0];
    expect(g.liderRitmo.maquina).toBe('F16');
    expect(g.liderDisponibilidade.maquina).toBe('F12');
    expect(Math.round(g.liderDisponibilidade.disponibilidadePct)).toBe(100);
  });

  it('ciclos por hora so aparecem quando alguma peca fura em mais de um ciclo', () => {
    const semCiclos = comparar([...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 150)]);
    expect(semCiclos.grupos[0].temCiclos).toBe(false);
    expect(semCiclos.grupos[0].linhas.every((l) => l.ciclosPorHora == null)).toBe(true);

    // Peca de 2 ciclos na F12: 150 pc/h de peca sao 300 acionamentos/h.
    const comCiclos = comparar([
      ...medicoes('F16', 'A', 225),
      ...medicoes('F12', 'B', 150, { ciclosPorPeca: 2 }),
    ]);
    const g = comCiclos.grupos[0];
    expect(g.temCiclos).toBe(true);
    const f12 = g.linhas.find((l) => l.maquina === 'F12');
    expect(Math.round(f12.ciclosPorHora)).toBe(1200); // 600 pc/h x 2 ciclos
    const f16 = g.linhas.find((l) => l.maquina === 'F16');
    expect(Math.round(f16.ciclosPorHora)).toBe(900);
    // Em pecas/hora a F16 ganha; em acionamentos do motor, a F12.
    expect(g.lider.maquina).toBe('F16');
    expect(f12.ciclosPorHora).toBeGreaterThan(f16.ciclosPorHora);
  });

  it('"do proprio melhor" so existe com 3+ medicoes — com menos seria sorte', () => {
    const duas = comparar([
      { maquina: 'F16', peca: 'A', duracaoMs: 20 * MIN, pecas: 300 },
      { maquina: 'F16', peca: 'A', duracaoMs: 20 * MIN, pecas: 200 },
      ...medicoes('F12', 'A', 150),
    ]);
    const g = duas.grupos[0];
    expect(g.linhas.find((l) => l.maquina === 'F16').aproveitamentoPct).toBeNull();
    expect(g.linhas.find((l) => l.maquina === 'F12').aproveitamentoPct).not.toBeNull();
  });

  it('a maquina ainda em medicao entra na tabela, mas sai nomeada em emMedicao', () => {
    const r = comparar([
      ...medicoes('F16', 'A', 225),
      { maquina: 'F12', peca: 'A', duracaoMs: 10 * MIN, pecas: 100 },
    ]);
    const g = r.grupos[0];
    expect(g.linhas).toHaveLength(2);
    expect(g.emMedicao).toEqual(['F12']);
  });

  it('sem cadastro de grupo, tudo cai em "Sem grupo" e compara ali', () => {
    const r = comparar([...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 150)], null);
    expect(r.grupos).toHaveLength(1);
    expect(r.grupos[0].grupo).toBe('Sem grupo');
    expect(r.grupos[0].lider.maquina).toBe('F16');
  });

  it('"Sem grupo" vai para o fim da lista, como na lateral do relatorio', () => {
    const r = comparar(
      [
        ...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 150),
        ...medicoes('X1', 'A', 100), ...medicoes('X2', 'A', 90),
      ],
      (nome) => (nome.startsWith('F') ? '0002 · FURADEIRA' : null),
    );
    expect(r.grupos.map((g) => g.grupo)).toEqual(['0002 · FURADEIRA', 'Sem grupo']);
  });

  it('medicao sem nome de peca nao afirma mix igual — nao da para saber', () => {
    const r = comparar([
      ...medicoes('F16', '', 225),
      ...medicoes('F12', '', 150),
    ]);
    const g = r.grupos[0];
    expect(g.mixIgual).toBe(false);
    expect(g.comparavel).toBe(false);
  });
});

/**
 * A LEITURA — as frases que a tela e o papel exibem.
 *
 * Elas nascem no dominio, e nao na tela, porque os dois leem as mesmas: uma
 * frase escrita duas vezes diverge um dia, e ai' o papel da reuniao discorda
 * do monitor sobre os mesmos numeros.
 */
describe('lerGrupo', () => {
  const ler = (linhas, grupo = grupoDe) => comparar(linhas, grupo).grupos.map(lerGrupo);

  it('sem grupo nenhum, nao ha leitura', () => {
    expect(lerGrupo(null)).toEqual([]);
    expect(lerGrupo({})).toEqual([]);
  });

  it('mesma peca nas duas: elege a lider e diz que a comparacao e direta', () => {
    const [frases] = ler([...medicoes('F16', 'A', 225), ...medicoes('F12', 'A', 150)]);
    expect(frases[0]).toContain('F16 é a que mais rende neste grupo');
    expect(frases[0]).toContain('50% mais rápido');
    expect(frases[1]).toContain('mediram as mesmas peças');
  });

  it('mix incomparavel: RECUSA o veredito e diz o que medir', () => {
    const [frases] = ler([
      ...medicoes('F16', 'Peca de 4 furos', 225),
      ...medicoes('F12', 'Peca de 12 furos', 150),
    ]);
    expect(frases[0]).toContain('Não dá para dizer qual rende mais');
    expect(frases.join(' ')).toContain('meça a MESMA peça nas duas');
    // E nunca aponta vencedor por baixo da recusa.
    expect(frases.join(' ')).not.toContain('é a que mais rende');
  });

  it('o duelo da peca em comum qualifica o veredito, com o numero', () => {
    const [frases] = ler([
      ...medicoes('F16', 'A', 225),           // 900 pc/h
      ...medicoes('F16', 'Peca facil', 450),  // 1800 pc/h — infla a media
      ...medicoes('F12', 'A', 150),           // 600 pc/h
    ]);
    const tudo = frases.join(' ');
    expect(tudo).toContain('na A, medida nas duas');
    expect(tudo).toContain('50%');       // a diferenca real, da mesma peca
    expect(tudo).toContain('menor que'); // menor que a da tabela, inflada pelo mix
    expect(tudo).toContain('carrega o mix junto');
  });

  it('quando os acionamentos do motor desmentem as pecas/hora, a leitura diz', () => {
    // F16 na peca de 1 ciclo a 900 pc/h; F12 na de 2 ciclos a 600 pc/h.
    // Em pecas/hora a F16 ganha 50%; em acionamentos, 900 x 1200 — a F12 e'
    // que aciona mais. O que a frase impede e' concluir "F16 rende 50% mais".
    const [frases] = ler([
      ...medicoes('F16', 'A', 225),
      ...medicoes('F12', 'B', 150, { ciclosPorPeca: 2 }),
    ]);
    // Aqui os ciclos NAO empatam (900 x 1200), entao nao ha desmentido.
    expect(frases.join(' ')).not.toContain('acionamentos do motor');

    // Agora empatando: F16 900 pc/h x 1 ciclo, F12 450 pc/h x 2 ciclos.
    const [comEmpate] = ler([
      ...medicoes('F16', 'A', 225),
            ...medicoes('F12', 'B', 113, { ciclosPorPeca: 2 }),
    ]);
    const tudo = comEmpate.join(' ');
    expect(tudo).toContain('Em acionamentos do motor as duas rodam praticamente igual');
    expect(tudo).toContain('vem da furação da peça, não da velocidade da máquina');
  });

  it('quando quem menos para nao e quem mais corre, a leitura separa as duas coisas', () => {
    const [frases] = ler([
      ...[0, 1, 2].map(() => ({
        maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 225,
        paradas: [{ motivo: 'setup', duracaoMs: 15 * MIN }],
      })),
      ...medicoes('F12', 'A', 150),
    ]);
    const tudo = frases.join(' ');
    expect(tudo).toContain('quem menos para é a F12');
    expect(tudo).toContain('Ritmo baixo se trata na máquina; tempo parado se trata na parada');
  });

  it('folga contra o proprio melhor vira acao — sem pedir maquina nova', () => {
    const [frases] = ler([
      // F12 alterna 600 e 1000 pc/h: a media fica bem abaixo do melhor dela.
      { maquina: 'F12', peca: 'A', duracaoMs: 20 * MIN, pecas: 200 },
      { maquina: 'F12', peca: 'A', duracaoMs: 20 * MIN, pecas: 200 },
      { maquina: 'F12', peca: 'A', duracaoMs: 20 * MIN, pecas: 334 },
      ...medicoes('F16', 'A', 225),
    ]);
    const tudo = frases.join(' ');
    expect(tudo).toContain('do melhor período dela própria');
    expect(tudo).toContain('não em máquina nova');
  });
});

describe('constanciaTexto', () => {
  it('traduz a variacao em palavras de fabrica — nunca em CV%', () => {
    expect(constanciaTexto(null)).toBeNull();
    expect(constanciaTexto(5)).toBe('Repete bem');
    expect(constanciaTexto(15)).toBe('Varia um pouco');
    expect(constanciaTexto(30)).toBe('Varia muito');
  });
});
