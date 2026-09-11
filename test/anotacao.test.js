/**
 * Observacao do cronoanalista — o contrato do payload.
 *
 * O mapeador da fila lista campo a campo, e foi assim que os ciclos de
 * furacao se perderam uma vez. Este teste trava que a nota chega inteira ao
 * /sync — e que texto vazio vai como null, que e' como a nota se apaga.
 */
import { describe, expect, it } from 'vitest';
import { paraAnotacao } from '../src/lib/api.js';

describe('paraAnotacao — item da fila vira payload do sync', () => {
  it('leva operacao, texto e o instante da escrita', () => {
    expect(paraAnotacao({
      tipo: 'anotacao', clientId: 'c1', operacaoId: 'op1',
      texto: 'operador novo no posto', anotadoEm: '2026-09-11T10:00:00.000Z',
    })).toEqual({
      clientId: 'c1', operacaoId: 'op1',
      texto: 'operador novo no posto', anotadoEm: '2026-09-11T10:00:00.000Z',
    });
  });

  it('texto vazio vai como null — e o que apaga a nota no servidor', () => {
    expect(paraAnotacao({ clientId: 'c1', operacaoId: 'op1', anotadoEm: 'x' }).texto).toBeNull();
  });
});
