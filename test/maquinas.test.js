/**
 * O cadastro de maquinas no aparelho: cache primeiro, servidor depois,
 * texto livre quando nao ha nada — a mesma promessa offline dos motivos.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { adotarMaquinas, maquinasAtivas } from '../src/lib/maquinas.js';

afterEach(() => adotarMaquinas({ maquinas: [], grupos: [] }));

describe('cadastro de maquinas no aparelho', () => {
  it('sem cadastro, a lista e vazia — a tela cai no texto livre', () => {
    expect(maquinasAtivas()).toEqual([]);
  });

  it('cadastro adotado passa a valer, so com as ativas', () => {
    adotarMaquinas({
      maquinas: [
        { id: '1', nome: 'Furadeira 12', ativa: true, grupo_codigo: '0002', grupo_nome: 'Furadeira' },
        { id: '2', nome: 'Furadeira 16', ativa: false, grupo_codigo: '0002', grupo_nome: 'Furadeira' },
      ],
      grupos: [{ id: 'g1', codigo: '0002', nome: 'Furadeira' }],
    });
    expect(maquinasAtivas().map((m) => m.nome)).toEqual(['Furadeira 12']);
  });

  it('a lista ativa e ESTAVEL entre leituras — useSyncExternalStore compara identidade', () => {
    adotarMaquinas({ maquinas: [{ id: '1', nome: 'F12', ativa: true }], grupos: [] });
    expect(maquinasAtivas()).toBe(maquinasAtivas());
  });

  it('cadastro em formato invalido e ignorado, nunca derruba o cache', () => {
    adotarMaquinas({ maquinas: [{ id: '1', nome: 'F12', ativa: true }], grupos: [] });
    adotarMaquinas(null);
    adotarMaquinas([{ id: '2', nome: 'lista antiga' }]);
    expect(maquinasAtivas().map((m) => m.nome)).toEqual(['F12']);
  });
});
