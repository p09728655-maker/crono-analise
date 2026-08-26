/**
 * A decisao de mostrar (ou nao) o aviso de atualizacao e' pura de proposito:
 * o localStorage fica isolado em duas funcoes finas, e o que se testa aqui
 * e' a politica — quem ve faixa, quem nao ve.
 */
import { describe, expect, it } from 'vitest';
import { estadoDaVersao } from '../src/lib/versaoVista.js';

describe('estadoDaVersao', () => {
  it('primeira visita nao ganha faixa: grava em silencio', () => {
    expect(estadoDaVersao(null, '2.12.0')).toBe('primeira');
    expect(estadoDaVersao(undefined, '2.12.0')).toBe('primeira');
    expect(estadoDaVersao('', '2.12.0')).toBe('primeira');
  });

  it('mesma versao de sempre: nada a dizer', () => {
    expect(estadoDaVersao('2.12.0', '2.12.0')).toBe('igual');
  });

  it('versao mudou desde a ultima visita: mostra a faixa', () => {
    expect(estadoDaVersao('2.11.0', '2.12.0')).toBe('nova');
  });

  it('sem versao atual (build quebrado) nao ha o que anunciar', () => {
    expect(estadoDaVersao('2.11.0', null)).toBe('igual');
    expect(estadoDaVersao(null, undefined)).toBe('igual');
  });
});
