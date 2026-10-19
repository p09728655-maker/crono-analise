/**
 * O nome do PDF — o "Salvar como PDF" usa o titulo da pagina.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataDoArquivo, imprimirComo, nomeDoArquivo } from '../src/lib/impressao.js';

describe('o nome do arquivo', () => {
  it('junta as partes com hifen e pula as vazias', () => {
    expect(nomeDoArquivo('Takt Time', 'Rack Sirius 1.6', '', null, 'EMBALAGEM 01'))
      .toBe('Takt Time - Rack Sirius 1.6 - EMBALAGEM 01');
  });

  it('o que o Windows recusa em nome de arquivo vira hifen', () => {
    // "1/2" e "16:9" sao nomes reais de produto; com / ou : o Windows recusa salvar.
    expect(nomeDoArquivo('Takt Time', 'Painel 1/2 porta', 'TV 16:9 "slim"'))
      .toBe('Takt Time - Painel 1-2 porta - TV 16-9 -slim-');
  });

  it('data e hora como cabem num nome de arquivo', () => {
    const iso = new Date(2026, 9, 19, 13, 36).toISOString();
    expect(dataDoArquivo(iso)).toBe('19-10-2026 13h36');
    expect(dataDoArquivo('nao e data')).toBe('');
  });
});

describe('imprimir com o nome', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('o titulo vale so durante a impressao e volta depois', () => {
    const ouvintes = {};
    let tituloNaHora = null;
    vi.stubGlobal('document', { title: 'RitmoPatrimar — Estudo de Tempos' });
    vi.stubGlobal('window', {
      addEventListener: (e, fn) => { ouvintes[e] = fn; },
      removeEventListener: (e) => { delete ouvintes[e]; },
      print: () => { tituloNaHora = document.title; ouvintes.afterprint?.(); },
    });

    imprimirComo('Takt Time - Rack Sirius 1.6');

    expect(tituloNaHora).toBe('Takt Time - Rack Sirius 1.6');
    expect(document.title).toBe('RitmoPatrimar — Estudo de Tempos');
    expect(ouvintes.afterprint).toBeUndefined();
  });
});
