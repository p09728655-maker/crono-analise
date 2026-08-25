import { describe, expect, it } from 'vitest';
import { agruparPorProduto, chaveProduto, produtosConhecidos } from '../src/domain/agrupamento.js';

const estudo = (nome, produto, ciclos = 0) => ({ id: nome, nome, produto, total_observacoes: ciclos });

describe('chaveProduto', () => {
  it('ignora caixa, acento e espaco', () => {
    const k = chaveProduto('Sleep Base');
    expect(chaveProduto('SLEEP BASE')).toBe(k);
    expect(chaveProduto('  sleep   base ')).toBe(k);
    expect(chaveProduto('Sleep Basé')).toBe(k);
  });

  it('vazio, nulo e so espaco caem no mesmo grupo', () => {
    expect(chaveProduto('')).toBe(chaveProduto(null));
    expect(chaveProduto('   ')).toBe(chaveProduto(undefined));
  });

  it('produtos diferentes nao colidem', () => {
    expect(chaveProduto('Sleep Base')).not.toBe(chaveProduto('Sleep Box'));
  });
});

describe('agruparPorProduto', () => {
  it('junta grafias diferentes do mesmo produto', () => {
    const g = agruparPorProduto([
      estudo('a', 'SLEEP BASE'), estudo('b', 'Sleep Base'), estudo('c', ' sleep base '),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].estudos).toHaveLength(3);
  });

  it('usa a grafia mais frequente como rotulo', () => {
    const g = agruparPorProduto([
      estudo('a', 'Sleep Base'), estudo('b', 'Sleep Base'), estudo('c', 'SLEEP BASE'),
    ]);
    expect(g[0].rotulo).toBe('Sleep Base');
  });

  it('rotulo nao muda sozinho quando ha empate', () => {
    const entrada = [estudo('a', 'Sleep Base'), estudo('b', 'SLEEP BASE')];
    const um = agruparPorProduto(entrada)[0].rotulo;
    const outro = agruparPorProduto([...entrada].reverse())[0].rotulo;
    expect(um).toBe(outro);
  });

  it('no empate, prefere a grafia bem escrita a CAIXA ALTA ou minuscula', () => {
    const g = agruparPorProduto([
      estudo('a', 'SLEEP BASE'), estudo('b', 'sleep base'), estudo('c', 'Sleep Base'),
    ]);
    expect(g[0].rotulo).toBe('Sleep Base');
  });

  it('mas a grafia MAIS USADA ainda ganha da bem escrita', () => {
    // Se a equipe inteira escreve em caixa alta, essa e' a convencao real.
    const g = agruparPorProduto([
      estudo('a', 'SLEEP BASE'), estudo('b', 'SLEEP BASE'),
      estudo('c', 'SLEEP BASE'), estudo('d', 'Sleep Base'),
    ]);
    expect(g[0].rotulo).toBe('SLEEP BASE');
  });

  it('grupo maior vem primeiro', () => {
    const g = agruparPorProduto([
      estudo('a', 'Painel'), estudo('b', 'Sleep'), estudo('c', 'Sleep'), estudo('d', 'Sleep'),
    ]);
    expect(g[0].rotulo).toBe('Sleep');
    expect(g[0].estudos).toHaveLength(3);
  });

  it('sem produto vai por ULTIMO, mesmo sendo o maior grupo', () => {
    // E' pendencia de cadastro, nao categoria — nao pode liderar a tela.
    const g = agruparPorProduto([
      estudo('a', ''), estudo('b', null), estudo('c', '  '), estudo('d', 'Painel'),
    ]);
    expect(g[g.length - 1].semProduto).toBe(true);
    expect(g[g.length - 1].estudos).toHaveLength(3);
    expect(g[0].rotulo).toBe('Painel');
  });

  it('soma os ciclos do grupo', () => {
    const g = agruparPorProduto([estudo('a', 'X', 12), estudo('b', 'x', 30)]);
    expect(g[0].totalCiclos).toBe(42);
  });

  it('lista vazia nao quebra', () => {
    expect(agruparPorProduto([])).toEqual([]);
  });
});

describe('produtosConhecidos', () => {
  it('devolve cada produto uma vez, sem o grupo vazio', () => {
    const p = produtosConhecidos([
      estudo('a', 'Sleep Base'), estudo('b', 'SLEEP BASE'), estudo('c', 'Painel'), estudo('d', ''),
    ]);
    expect(p).toEqual(['Sleep Base', 'Painel']);
  });
});
