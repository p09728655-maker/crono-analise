/**
 * A conversao das paradas digitadas (minutos, com virgula) para o calculo.
 * "1,25" virava 125 uma vez — cem vezes o valor — quando o campo era
 * numerico; a conversao e' o lugar de garantir que isso nao volta.
 */
import { describe, expect, it } from 'vitest';
import { paradasEmMilissegundos } from '../src/features/coleta/rapida/useParadasDoPeriodo.js';

describe('paradasEmMilissegundos', () => {
  it('converte minutos com virgula ou ponto, arredondando ao milissegundo', () => {
    expect(paradasEmMilissegundos([{ motivo: 'setup', minutos: '2,5' }]))
      .toEqual([{ motivo: 'setup', duracaoMs: 150000 }]);
    expect(paradasEmMilissegundos([{ motivo: 'setup', minutos: '0.75' }])[0].duracaoMs).toBe(45000);
  });

  it('linha vazia, zero ou texto invalido nao vira parada', () => {
    expect(paradasEmMilissegundos([
      { motivo: 'setup', minutos: '' },
      { motivo: 'setup', minutos: '0' },
      { motivo: 'setup', minutos: 'abc' },
      { motivo: 'falta_material', minutos: '10' },
    ])).toEqual([{ motivo: 'falta_material', duracaoMs: 600000 }]);
  });
});
