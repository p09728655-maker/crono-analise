/**
 * O cadastro de maquinas no aparelho: cache primeiro, servidor depois,
 * texto livre quando nao ha nada — a mesma promessa offline dos motivos.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adotarMaquinas, maquinasAtivas } from '../src/lib/maquinas.js';

afterEach(() => adotarMaquinas([]));

describe('cadastro de maquinas no aparelho', () => {
  it('sem cadastro, a lista e vazia — a tela cai no texto livre', () => {
    expect(maquinasAtivas()).toEqual([]);
  });

  it('cadastro adotado passa a valer, so com as ativas', () => {
    adotarMaquinas([
      { id: '1', nome: 'Furadeira 12', ativa: true },
      { id: '2', nome: 'Furadeira 16', ativa: false },
    ]);
    expect(maquinasAtivas().map((m) => m.nome)).toEqual(['Furadeira 12']);
  });

  it('a lista ativa e ESTAVEL entre leituras — useSyncExternalStore compara identidade', () => {
    adotarMaquinas([{ id: '1', nome: 'F12', ativa: true }]);
    expect(maquinasAtivas()).toBe(maquinasAtivas());
  });

  it('lista que nao e array e ignorada, nunca derruba o cache', () => {
    adotarMaquinas([{ id: '1', nome: 'F12', ativa: true }]);
    adotarMaquinas(null);
    adotarMaquinas(undefined);
    expect(maquinasAtivas().map((m) => m.nome)).toEqual(['F12']);
  });
});
