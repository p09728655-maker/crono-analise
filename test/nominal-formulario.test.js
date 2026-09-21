/**
 * O formulario do nominal barra o que o servidor nao teria como ver:
 * Number("15 ciclos") e' NaN, o JSON manda null, e null apaga. O caminho
 * que perdia o nominal e a fonte com "sucesso" na tela.
 */
import { describe, expect, it } from 'vitest';
import { lerNominalDoFormulario } from '../src/features/analise/maquinas/nominal.js';

describe('lerNominalDoFormulario', () => {
  it('vazio apaga os dois', () => {
    expect(lerNominalDoFormulario({ nominal: '', fonte: '' })).toEqual({ nominalCiclosMin: null, nominalFonte: null });
    expect(lerNominalDoFormulario({ nominal: '  ', fonte: '' })).toEqual({ nominalCiclosMin: null, nominalFonte: null });
  });

  it('numero com virgula ou ponto vale; a fonte vai aparada', () => {
    expect(lerNominalDoFormulario({ nominal: '12,5', fonte: ' Catálogo 2019 ' }))
      .toEqual({ nominalCiclosMin: 12.5, nominalFonte: 'Catálogo 2019' });
    expect(lerNominalDoFormulario({ nominal: '15', fonte: '' }))
      .toEqual({ nominalCiclosMin: 15, nominalFonte: null });
  });

  it('texto que nao e numero e ERRO — nunca vira null (que apagaria)', () => {
    expect(() => lerNominalDoFormulario({ nominal: '15 ciclos', fonte: '' })).toThrow(/não é um número/);
    expect(() => lerNominalDoFormulario({ nominal: 'quinze', fonte: 'x' })).toThrow(/não é um número/);
  });

  it('zero, negativo e absurdo sao recusados', () => {
    expect(() => lerNominalDoFormulario({ nominal: '0' })).toThrow(/entre/);
    expect(() => lerNominalDoFormulario({ nominal: '-3' })).toThrow(/entre/);
    expect(() => lerNominalDoFormulario({ nominal: '99999' })).toThrow(/entre/);
  });

  it('fonte sem numero e erro, nao descarte silencioso', () => {
    expect(() => lerNominalDoFormulario({ nominal: '', fonte: 'Manual SCM' })).toThrow(/junto com a fonte/);
  });
});
