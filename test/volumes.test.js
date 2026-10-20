/**
 * Volumes por produto: o numero que converte a medicao da embalagem (em
 * volumes) para a unidade do estudo (o produto). A regra que mais importa
 * e' a do vazio: nao informado NUNCA vira 1.
 */
import { describe, expect, it } from 'vitest';
import {
  VOLUMES_MAX, contadasPorProduto, lerVolumes, volumesDoProduto,
} from '../src/domain/volumes.js';
import { unidadeDoPosto } from '../src/domain/cronoanalise.js';

describe('lerVolumes', () => {
  it('aceita inteiro de 1 ao teto do cadastro, numero ou texto de numero', () => {
    expect(lerVolumes(1)).toBe(1);
    expect(lerVolumes(2)).toBe(2);
    expect(lerVolumes('3')).toBe(3);
    expect(lerVolumes(VOLUMES_MAX)).toBe(50);
  });

  it('vazio, ausente e invalido sao "nao informado" (null), nunca 1', () => {
    for (const v of [undefined, null, '', '  ', 0, -1, 1.5, '2,5', 'dois', NaN, true, {}, [], 51]) {
      expect(lerVolumes(v)).toBeNull();
    }
  });
});

describe('volumesDoProduto', () => {
  const produtos = [
    { id: 'p1', nome: 'Rack Sirius 1.6', volumes: 2, grupo_id: 'g5' },
    { id: 'p2', nome: 'Mesa Cabeceira Sleep', volumes: 1, grupo_id: 'g5' },
    { id: 'p3', nome: 'Painel Nobre', volumes: null, grupo_id: 'g5' },
    // Cache do tablet de antes da coluna: o campo nem existe.
    { id: 'p4', nome: 'Armário Encanto', grupo_id: 'g5' },
  ];

  it('acha pelo NOME com nomeChave: caixa, acento e espaco nao separam', () => {
    expect(volumesDoProduto(produtos, 'RACK SIRIUS 1.6')).toBe(2);
    expect(volumesDoProduto(produtos, '  rack   sirius 1.6 ')).toBe(2);
    expect(volumesDoProduto(produtos, 'Mesa Cabeceira Sleep')).toBe(1);
  });

  it('produto sem volumes, campo ausente, nome desconhecido ou vazio: null', () => {
    expect(volumesDoProduto(produtos, 'Painel Nobre')).toBeNull();
    expect(volumesDoProduto(produtos, 'Armario Encanto')).toBeNull();
    expect(volumesDoProduto(produtos, 'Outro produto')).toBeNull();
    expect(volumesDoProduto(produtos, '')).toBeNull();
    expect(volumesDoProduto(undefined, 'Rack Sirius 1.6')).toBeNull();
    expect(volumesDoProduto([null, { nome: 'Rack Sirius 1.6', volumes: 2 }], 'rack sirius 1.6')).toBe(2);
  });

  it('dois produtos com a mesma chave so dao numero se concordarem', () => {
    const iguais = [{ nome: 'Armário', volumes: 2 }, { nome: 'Armario', volumes: 2 }];
    const diferentes = [{ nome: 'Armário', volumes: 2 }, { nome: 'Armario', volumes: 3 }];
    const umSemNumero = [{ nome: 'Armário', volumes: 2 }, { nome: 'Armario', volumes: null }];
    expect(volumesDoProduto(iguais, 'armario')).toBe(2);
    expect(volumesDoProduto(diferentes, 'armario')).toBeNull();
    expect(volumesDoProduto(umSemNumero, 'armario')).toBeNull();
  });

  it('produto DESATIVADO ainda da os volumes: o estudo de antes continua sendo daquele rack', () => {
    const desativado = [{ nome: 'Rack Sirius 1.6', volumes: 2, ativo: false }];
    expect(volumesDoProduto(desativado, 'RACK SIRIUS 1.6')).toBe(2);
  });

  it('com ativo e desativado de mesmo nome, manda o ativo (o cadastro de hoje)', () => {
    const recadastrado = [
      { nome: 'Rack Sirius 1.6', volumes: 1, ativo: false },
      { nome: 'RACK SIRIUS 1.6', volumes: 2, ativo: true },
    ];
    expect(volumesDoProduto(recadastrado, 'rack sirius 1.6')).toBe(2);
    // O ativo sem numero nao herda o do desativado: "nao informado" hoje.
    const ativoSemNumero = [
      { nome: 'Rack Sirius 1.6', volumes: 2, ativo: false },
      { nome: 'Rack Sirius 1.6', volumes: null, ativo: true },
    ];
    expect(volumesDoProduto(ativoSemNumero, 'rack sirius 1.6')).toBeNull();
  });
});

describe('contadasPorProduto', () => {
  it('na peca o fator e 1: a furadeira conta a propria peca do estudo', () => {
    expect(contadasPorProduto(unidadeDoPosto('FURADEIRAS'), null)).toBe(1);
    expect(contadasPorProduto('peça', 7)).toBe(1);
  });

  it('no volume o fator sao os volumes do produto, e sem eles nao ha fator', () => {
    expect(contadasPorProduto(unidadeDoPosto('EMBALAGEM'), 2)).toBe(2);
    expect(contadasPorProduto('volume', '3')).toBe(3);
    expect(contadasPorProduto(unidadeDoPosto('EMBALAGEM'), null)).toBeNull();
    expect(contadasPorProduto('volume', undefined)).toBeNull();
  });
});
