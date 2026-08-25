/**
 * Painel Ritmo/Demanda — compartilhado entre cadastro manual e importacao.
 * As conversoes daqui viram numero gravado no estudo e texto impresso.
 */
import { describe, expect, it } from 'vitest';
import {
  CALC_PADRAO, formatarHorasMin, formatarTakt, taktMsDoCalculo,
} from '../src/components/RitmoDemanda.jsx';

describe('taktMsDoCalculo', () => {
  it('480 pecas em 8,8h dao takt de 66s', () => {
    expect(taktMsDoCalculo({ quantidade: '480', horas: '8.8' })).toBe(66000);
  });
  it('aceita virgula brasileira nas horas', () => {
    expect(taktMsDoCalculo({ quantidade: '480', horas: '8,8' })).toBe(66000);
  });
  it('conta incompleta devolve null, nao zero — takt zero nao existe', () => {
    expect(taktMsDoCalculo({ quantidade: '', horas: '8.8' })).toBeNull();
    expect(taktMsDoCalculo({ quantidade: '480', horas: '' })).toBeNull();
    expect(taktMsDoCalculo(undefined)).toBeNull();
  });
});

describe('formatarTakt', () => {
  it('mostra como relogio mm:ss', () => {
    expect(formatarTakt(66000)).toBe('01:06');
    expect(formatarTakt(42000)).toBe('00:42');
  });
});

describe('formatarHorasMin', () => {
  it('8,8 horas sao 8h48min — nao "8h80"', () => {
    expect(formatarHorasMin(8.8)).toBe('8h48min');
  });
  it('5,6 horas sao 5h36min', () => {
    expect(formatarHorasMin(5.6)).toBe('5h36min');
  });
});

describe('CALC_PADRAO', () => {
  it('ja parte da jornada padrao de 8,8h/dia', () => {
    expect(CALC_PADRAO.horas).toBe('8.8');
    expect(CALC_PADRAO.quantidade).toBe('');
  });
});
