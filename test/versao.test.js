/**
 * O historico de versoes precisa ser confiavel para poder existir: numero
 * do app divergindo do historico e' pior que nao ter historico.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HISTORICO, VERSAO } from '../src/versao.js';

const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

describe('historico de versoes', () => {
  it('a versao do app vem do package.json (fonte unica)', () => {
    expect(VERSAO).toBe(pacote.version);
  });

  it('a entrada mais recente do historico e a versao atual', () => {
    expect(HISTORICO[0].versao).toBe(VERSAO);
  });

  it('nao ha versao duplicada', () => {
    const numeros = HISTORICO.map((v) => v.versao);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it('vem em ordem decrescente — o mais novo primeiro', () => {
    const partes = (v) => v.split('.').map(Number);
    for (let i = 1; i < HISTORICO.length; i++) {
      const [a, b] = [partes(HISTORICO[i - 1].versao), partes(HISTORICO[i].versao)];
      const cmp = (a[0] - (b[0] || 0)) || ((a[1] || 0) - (b[1] || 0)) || ((a[2] || 0) - (b[2] || 0));
      expect(cmp, `${HISTORICO[i - 1].versao} deve ser maior que ${HISTORICO[i].versao}`).toBeGreaterThan(0);
    }
  });

  it('toda entrada tem titulo e pelo menos um item para o usuario ler', () => {
    for (const v of HISTORICO) {
      expect(v.titulo, v.versao).toBeTruthy();
      expect(v.itens.length, v.versao).toBeGreaterThan(0);
      v.itens.forEach((item) => expect(typeof item).toBe('string'));
    }
  });
});
