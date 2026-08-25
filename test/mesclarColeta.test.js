/**
 * Mescla da fila local no estudo do servidor — e' o que faz o selo ficar
 * verde NA HORA em que a meta e' batida, sem sair e entrar de novo.
 */
import { describe, expect, it } from 'vitest';
import { mesclarColetaLocal } from '../src/domain/mesclarColeta.js';

const estudo = (ops) => ({ estudo: { id: 'e1' }, operacoes: ops });
const obs = (clientId, operacaoId, duracaoMs) => ({ tipo: 'observacao', clientId, operacaoId, duracaoMs });

describe('mesclarColetaLocal', () => {
  it('soma ciclos da fila que o servidor ainda nao tem', () => {
    const dados = estudo([{ id: 'op1', tempos: [5000, 5200], observacoes: [] }]);
    const r = mesclarColetaLocal(dados, [obs('c1', 'op1', 4800), obs('c2', 'op1', 5100)]);
    expect(r.operacoes[0].tempos).toEqual([5000, 5200, 4800, 5100]);
    expect(r.operacoes[0].pendentesLocais).toBe(2);
  });

  it('NAO conta duas vezes o ciclo que a sincronizacao ja entregou', () => {
    const dados = estudo([{
      id: 'op1', tempos: [5000],
      observacoes: [{ client_id: 'c1', duracao_ms: 5000 }],
    }]);
    const r = mesclarColetaLocal(dados, [obs('c1', 'op1', 5000), obs('c2', 'op1', 5100)]);
    expect(r.operacoes[0].tempos).toEqual([5000, 5100]);
    expect(r.operacoes[0].pendentesLocais).toBe(1);
  });

  it('ignora paradas e itens de outras operacoes', () => {
    const dados = estudo([{ id: 'op1', tempos: [], observacoes: [] }]);
    const r = mesclarColetaLocal(dados, [
      { tipo: 'parada', clientId: 'p1', operacaoId: 'op1', duracaoMs: 60000 },
      obs('c9', 'outra-op', 4000),
    ]);
    expect(r.operacoes[0].tempos).toEqual([]);
    expect(r.operacoes[0].pendentesLocais).toBeUndefined();
  });

  it('fila vazia devolve os dados intactos (mesma referencia)', () => {
    const dados = estudo([{ id: 'op1', tempos: [1], observacoes: [] }]);
    expect(mesclarColetaLocal(dados, [])).toBe(dados);
    expect(mesclarColetaLocal(dados, undefined)).toBe(dados);
  });
});
