/**
 * A BUSCA NA LISTA DE PRODUTOS (v2.99.4) — com 168 produtos na embalagem,
 * achar rolando deixou de funcionar. O nome comeca pelo modelo
 * ("501141 · BUFFET 4 PT PRISM"), entao a lista ordena pelo numero e o
 * buffet nao fica na letra B: a busca tem de achar pelo nome e pelo codigo.
 */
import { describe, expect, it } from 'vitest';
import { buscarProdutos } from '../src/lib/maquinas.js';

const p = (nome, codigo) => ({ id: nome, nome, codigo, ativo: true });
const LISTA = [
  p('501041 · BERCO ARCO-IRIS', '501041'),
  p('501041 · BERCO ARCO-IRIS · VOL 1/2', '501041'),
  p('501041 · BERCO ARCO-IRIS · VOL 2/2', '501041'),
  p('501106 · RACK SIRIUS 0.9', '501106'),
  p('501106 · RACK SIRIUS 1.6', '501106'),
  p('501114 · PAINEL SIRIUS 1.6', '501114'),
  p('501141 · BUFFET 2 PT PRISM', '501141'),
  p('501141 · BUFFET 4 PT PRISM', '501141'),
  p('501160 · BERCO ALGODAO DOCE', '501160'),
  p('Penteadeira Princesa', null),
];
const nomes = (termo) => buscarProdutos(LISTA, termo).map((x) => x.nome);

describe('buscarProdutos', () => {
  it('sem termo, a lista inteira', () => {
    expect(buscarProdutos(LISTA, '')).toHaveLength(LISTA.length);
    expect(buscarProdutos(LISTA, '   ')).toHaveLength(LISTA.length);
    expect(buscarProdutos(null, 'x')).toEqual([]);
  });

  it('acha o buffet pelo nome, sem caixa, em qualquer ordem', () => {
    expect(nomes('buffet 4')).toEqual(['501141 · BUFFET 4 PT PRISM']);
    expect(nomes('prism 4 buffet')).toEqual(['501141 · BUFFET 4 PT PRISM']);
    expect(nomes('buffet')).toHaveLength(2);
  });

  it('cada palavra tem de estar: "sirius 1.6" acha o rack e o painel, nao o 0.9', () => {
    expect(nomes('sirius 1.6')).toEqual(['501106 · RACK SIRIUS 1.6', '501114 · PAINEL SIRIUS 1.6']);
  });

  it('pelo modelo acha a familia inteira', () => {
    expect(nomes('501041')).toHaveLength(3);
    expect(nomes('arco vol')).toEqual(['501041 · BERCO ARCO-IRIS · VOL 1/2', '501041 · BERCO ARCO-IRIS · VOL 2/2']);
  });

  it('o codigo da etiqueta (modelo + cor/volume, com pontos) acha o modelo', () => {
    expect(nomes('501.041.003')).toHaveLength(3);
    expect(nomes('501.141')).toHaveLength(2);
  });

  it('"1.6" nao vira "16" e nao acha o modelo 501160', () => {
    expect(nomes('1.6')).toEqual(['501106 · RACK SIRIUS 1.6', '501114 · PAINEL SIRIUS 1.6']);
  });

  it('sem acento acha com acento, e produto sem codigo tambem entra', () => {
    expect(nomes('algodão')).toEqual(['501160 · BERCO ALGODAO DOCE']);
    expect(nomes('princesa')).toEqual(['Penteadeira Princesa']);
  });

  it('o que nao existe devolve vazio', () => {
    expect(nomes('guarda-roupa')).toEqual([]);
  });
});
