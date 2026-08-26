/**
 * A decisao de avisar "saiu versao nova" e' pura de proposito: a leitura da
 * rede fica isolada numa funcao fina, e o que se testa aqui e' a politica.
 */
import { describe, expect, it } from 'vitest';
import { precisaAtualizar } from '../src/lib/versaoServidor.js';

describe('precisaAtualizar', () => {
  it('versao publicada diferente da que roda: avisa', () => {
    expect(precisaAtualizar('2.19.0', '2.20.0')).toBe(true);
  });

  it('mesma versao: nada a dizer', () => {
    expect(precisaAtualizar('2.19.0', '2.19.0')).toBe(false);
  });

  it('rollback tambem avisa — continuar na versao retirada e igualmente errado', () => {
    expect(precisaAtualizar('2.20.0', '2.19.0')).toBe(true);
  });

  it('sem resposta do servidor, cala a boca', () => {
    expect(precisaAtualizar('2.19.0', null)).toBe(false);
    expect(precisaAtualizar('2.19.0', undefined)).toBe(false);
    expect(precisaAtualizar(null, '2.20.0')).toBe(false);
  });
});
