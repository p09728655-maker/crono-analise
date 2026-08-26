/**
 * Sugestoes de melhoria e dimensionamento.
 *
 * O que precisa continuar valendo: toda sugestao tem ACAO, a ordem e' por
 * prioridade e depois por impacto, e NENHUMA delas manda coletar mais
 * ciclos — a meta de amostra e' decisao do analista.
 */
import { describe, expect, it } from 'vitest';
import { contarPorPrioridade, sugerirMelhorias } from '../src/domain/sugestoes.js';
import { comparativoCapacidade, dimensionarOperadores } from '../src/domain/cronoanalise.js';

const op = (nome, resultado) => ({ id: nome, nome, resultado });
const base = { n: 10, cvPct: 5, tpPorPeca: 5000, cap: 720, tendencia: { direcao: 'estavel', pct: 0 } };

describe('sugerirMelhorias', () => {
  it('CV acima de 20% vira sugestao de alta prioridade, com acao concreta', () => {
    const [s] = sugerirMelhorias({ operacoes: [op('Fechar caixa', { ...base, cvPct: 130.1 })] });
    expect(s.prioridade).toBe('alta');
    expect(s.operacao).toBe('Fechar caixa');
    expect(s.diagnostico).toContain('130.1%');
    expect(s.acao).toMatch(/MOP|Ishikawa/);
  });

  it('CV entre 10 e 20 e media; abaixo de 10 nao vira sugestao nenhuma', () => {
    expect(sugerirMelhorias({ operacoes: [op('A', { ...base, cvPct: 15 })] })[0].prioridade).toBe('media');
    expect(sugerirMelhorias({ operacoes: [op('A', { ...base, cvPct: 9 })] })).toEqual([]);
  });

  it('gargalo acima do Takt e a primeira das de alta — e' + "'" + ' o que trava a linha', () => {
    const gargalo = op('Montar', { ...base, cvPct: 25, tpPorPeca: 6600 });
    const lista = sugerirMelhorias({
      operacoes: [gargalo, op('Outra', { ...base, cvPct: 90 })],
      taktMs: 5000,
      gargalo,
    });
    expect(lista[0].id).toBe('gargalo');
    expect(lista[0].prioridade).toBe('alta');
    expect(lista[0].diagnostico).toContain('32%');   // 6600/5000 - 1
    // A de CV 90% vem depois, mas continua sendo alta.
    expect(lista[1].prioridade).toBe('alta');
  });

  it('gargalo dentro do Takt nao gera sugestao — e sem Takt nao ha o que comparar', () => {
    const gargalo = op('Montar', { ...base, tpPorPeca: 4000 });
    expect(sugerirMelhorias({ operacoes: [gargalo], taktMs: 5000, gargalo })).toEqual([]);
    expect(sugerirMelhorias({ operacoes: [gargalo], taktMs: 0, gargalo })).toEqual([]);
  });

  it('o gargalo vem antes da maior parada: comparar CV com minutos nao significa nada', () => {
    const gargalo = op('Montar', { ...base, tpPorPeca: 6600 });
    const lista = sugerirMelhorias({
      operacoes: [gargalo],
      taktMs: 5000,
      gargalo,
      paradas: {
        totalMs: 40 * 60000,
        pctDoObservado: 60,
        porMotivo: [{ motivo: 'falta_material', rotulo: 'Falta de material', ms: 40 * 60000, n: 4 }],
      },
    });
    // As duas sao alta prioridade; o gargalo trava a linha inteira e abre a lista.
    expect(lista[0].id).toBe('gargalo');
    expect(lista[1].id).toBe('parada-falta_material');
  });

  it('parada pesa pela fatia do tempo observado, nao pelo motivo', () => {
    const paradas = {
      totalMs: 20 * 60000,
      pctDoObservado: 40,
      porMotivo: [
        { motivo: 'falta_material', rotulo: 'Falta de material', ms: 18 * 60000, n: 3 },
        { motivo: 'pessoal', rotulo: 'Necessidade pessoal', ms: 2 * 60000, n: 1 },
      ],
    };
    const lista = sugerirMelhorias({ operacoes: [op('A', base)], paradas });
    const material = lista.find((s) => s.id === 'parada-falta_material');
    const pessoal = lista.find((s) => s.id === 'parada-pessoal');
    expect(material.prioridade).toBe('alta');   // 36% do observado
    expect(pessoal.prioridade).toBe('baixa');   // 4% do observado
    expect(material.acao).toMatch(/kanban/i);
  });

  it('tendencia de subida pede fadiga/ferramenta; de queda avisa da curva de aprendizado', () => {
    const sobe = sugerirMelhorias({
      operacoes: [op('A', { ...base, tendencia: { direcao: 'degradacao', pct: 12 } })],
    })[0];
    expect(sobe.prioridade).toBe('media');
    expect(sobe.acao).toMatch(/fadiga/i);

    const cai = sugerirMelhorias({
      operacoes: [op('A', { ...base, tendencia: { direcao: 'aprendizado', pct: -12 } })],
    })[0];
    expect(cai.prioridade).toBe('baixa');
    expect(cai.acao).toMatch(/rodada/i);
  });

  it('NUNCA manda coletar mais ciclos — a meta e do analista, nao do app', () => {
    const lista = sugerirMelhorias({
      operacoes: [
        op('A', { ...base, n: 2, cvPct: 40 }),
        op('B', { ...base, n: 1, cvPct: 15, tendencia: { direcao: 'degradacao', pct: 5 } }),
      ],
      taktMs: 5000,
      paradas: { totalMs: 60000, pctDoObservado: 10, porMotivo: [{ motivo: 'setup', rotulo: 'Setup / Troca', ms: 60000, n: 1 }] },
    });
    expect(lista.length).toBeGreaterThan(0);
    for (const s of lista) {
      const texto = `${s.titulo} ${s.diagnostico} ${s.acao}`;
      expect(texto).not.toMatch(/coletar mais|mais observa|amostra pequena|mínimo de \d+ obs/i);
    }
  });

  it('toda sugestao tem acao, e a contagem por prioridade fecha com a lista', () => {
    const lista = sugerirMelhorias({
      operacoes: [op('A', { ...base, cvPct: 30 }), op('B', { ...base, cvPct: 12 })],
    });
    for (const s of lista) expect(s.acao.length).toBeGreaterThan(20);
    const c = contarPorPrioridade(lista);
    expect(c.alta + c.media + c.baixa).toBe(lista.length);
  });

  it('estudo sem nada a apontar devolve lista vazia, nao sugestao inventada', () => {
    expect(sugerirMelhorias({ operacoes: [op('A', base)] })).toEqual([]);
    expect(sugerirMelhorias({})).toEqual([]);
  });
});

describe('comparativoCapacidade', () => {
  it('compara o que o Takt exige com o que o gargalo entrega', () => {
    // Takt de 5s => 720 pc/h exigidas.
    const r = comparativoCapacidade({ taktMs: 5000, capacidadeLinha: 600 });
    expect(r.esperado).toBe(720);
    expect(r.real).toBe(600);
    expect(r.atingimentoPct).toBeCloseTo(83.33, 2);
    expect(r.diferenca).toBe(-120);
  });

  it('sobra vira diferenca positiva', () => {
    expect(comparativoCapacidade({ taktMs: 5000, capacidadeLinha: 900 }).diferenca).toBe(180);
  });

  it('sem Takt nao ha esperado — nao inventa meta', () => {
    const r = comparativoCapacidade({ taktMs: 0, capacidadeLinha: 600 });
    expect(r.esperado).toBeNull();
    expect(r.atingimentoPct).toBeNull();
    expect(r.real).toBe(600);
  });
});

describe('dimensionarOperadores', () => {
  it('exemplo do chao de fabrica: 2,13 s de TP com Takt de 3,96 s', () => {
    const r = dimensionarOperadores({ somaTpMs: 2130, taktMs: 3960 });
    expect(r.exato).toBeCloseTo(0.538, 3);
    expect(r.necessarios).toBe(1);          // meio operador nao existe
    expect(r.eficienciaPct).toBeCloseTo(53.8, 1);
    expect(r.atuais).toBeNull();
    expect(r.diferenca).toBeNull();
  });

  it('com o time atual informado, diz quanto sobra ou falta e a eficiencia real', () => {
    const sobra = dimensionarOperadores({ somaTpMs: 2130, taktMs: 3960, operadoresAtuais: 23 });
    expect(sobra.diferenca).toBe(22);
    expect(sobra.eficienciaAtualPct).toBeCloseTo(2.3, 1);

    const falta = dimensionarOperadores({ somaTpMs: 20000, taktMs: 3960, operadoresAtuais: 2 });
    expect(falta.necessarios).toBe(6);
    expect(falta.diferenca).toBe(-4);
  });

  it('sem Takt nao ha dimensionamento; entrada invalida nao vira zero enganoso', () => {
    expect(dimensionarOperadores({ somaTpMs: 2130, taktMs: 0 })).toBeNull();
    expect(dimensionarOperadores({})).toBeNull();
    expect(dimensionarOperadores({ somaTpMs: 2130, taktMs: 3960, operadoresAtuais: 0 }).atuais).toBeNull();
    expect(dimensionarOperadores({ somaTpMs: 2130, taktMs: 3960, operadoresAtuais: 'abc' }).atuais).toBeNull();
  });
});
