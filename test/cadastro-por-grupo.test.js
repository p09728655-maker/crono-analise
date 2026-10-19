/**
 * MOTIVOS E PRODUTOS POR GRUPO — o que o tablet oferece em cada posto.
 *
 * A lista de motivos nasceu na furadeira ("troca de broca"), e a embalagem
 * tem as paradas dela. O que se prova aqui e' a regra de oferta: o que vale
 * para todos aparece em todo posto, o restrito so' no grupo dele, e o
 * operador diante da maquina parada nunca fica sem onde tocar.
 */
import { describe, expect, it } from 'vitest';
import { MOTIVOS_PARADA } from '../src/domain/cronoanalise.js';
import { codigoPreferido, motivosDoGrupo } from '../src/lib/motivosParada.js';
import { grupoIdDaMaquina, produtosDoGrupo } from '../src/lib/maquinas.js';

const EMB = 'g-embalagem';
const FUR = 'g-furadeira';
const motivos = [
  { codigo: 'setup', rotulo: 'Setup / Troca', grupos: [] },
  { codigo: 'troca_de_broca', rotulo: 'Troca de broca', grupos: [FUR] },
  { codigo: 'falta_de_caixa', rotulo: 'Falta de caixa', grupos: [EMB] },
  { codigo: 'antigo', rotulo: 'Cadastro antigo, sem a coluna' },
];
const codigos = (lista) => lista.map((m) => m.codigo);

describe('motivos por grupo', () => {
  it('cada posto ve os de todos e os do grupo dele', () => {
    expect(codigos(motivosDoGrupo(motivos, EMB))).toEqual(['setup', 'falta_de_caixa', 'antigo']);
    expect(codigos(motivosDoGrupo(motivos, FUR))).toEqual(['setup', 'troca_de_broca', 'antigo']);
  });

  it('grupo desconhecido (fora do cadastro, recurso do ERP) recebe a lista inteira, como antes', () => {
    // Cortar para "so' os de todos" escondia "troca de broca" do estudo
    // importado com recurso "FUR16", e a parada entrava como "Outro".
    expect(codigos(motivosDoGrupo(motivos, null))).toEqual(codigos(motivos));
  });

  it('atalho de outra parada nunca cai no setup quando o preferido sumiu do posto', () => {
    const daEmbalagem = motivosDoGrupo(motivos, EMB); // setup, falta_de_caixa, antigo
    expect(codigoPreferido(daEmbalagem, 'falta_material')).toBe('falta_de_caixa');
    expect(codigoPreferido([motivos[0]], 'falta_material')).toBe('setup'); // so' sobrou ele
    expect(codigoPreferido(daEmbalagem, 'setup')).toBe('setup');
  });

  it('sem nenhum motivo que sirva, volta aos de fabrica — nunca lista vazia', () => {
    const soDaFuradeira = [{ codigo: 'troca_de_broca', rotulo: 'Troca de broca', grupos: [FUR] }];
    expect(motivosDoGrupo(soDaFuradeira, EMB)).toBe(MOTIVOS_PARADA);
    expect(motivosDoGrupo([], EMB)).toBe(MOTIVOS_PARADA);
  });
});

describe('produtos por grupo', () => {
  const cadastro = {
    maquinas: [{ id: 'm1', nome: 'EMBALAGEM 01', grupo_id: EMB }, { id: 'm2', nome: 'Furadeira 03', grupo_id: null }],
    produtos: [
      { id: 'p1', nome: 'Rack Sirius 1.6', grupo_id: EMB, ativo: true },
      { id: 'p2', nome: 'Rack antigo', grupo_id: EMB, ativo: false },
      { id: 'p3', nome: 'Lateral Mesa', grupo_id: FUR, ativo: true },
    ],
  };

  it('o grupo da maquina sai pelo nome, sem caixa nem espaco', () => {
    expect(grupoIdDaMaquina(cadastro, '  embalagem 01 ')).toBe(EMB);
    expect(grupoIdDaMaquina(cadastro, 'Furadeira 03')).toBeNull();
    expect(grupoIdDaMaquina(cadastro, 'nao cadastrada')).toBeNull();
    expect(grupoIdDaMaquina(cadastro, '')).toBeNull();
  });

  it('so os ativos do grupo; sem grupo, nenhum; cache antigo sem produtos, nenhum', () => {
    expect(produtosDoGrupo(cadastro, EMB).map((p) => p.nome)).toEqual(['Rack Sirius 1.6']);
    expect(produtosDoGrupo(cadastro, null)).toEqual([]);
    expect(produtosDoGrupo({ maquinas: [] }, EMB)).toEqual([]);
  });
});
