/**
 * O PAINEL DE GESTAO A VISTA.
 *
 * O que estes testes protegem nao e' o layout: e' o que o painel pode
 * AFIRMAR. Numero velho com cara de agora e maquina que sumiu da tela sao
 * os dois estragos que ele existe para impedir, e os dois passam calados
 * por qualquer teste que so' olhe se a conta fecha.
 */
import { describe, expect, it } from 'vitest';
import {
  DIAS_ATE_ENVELHECER, SEM_GRUPO_PAINEL, painelDeMaquinas, resolverGrupoDoPainel,
} from '../src/domain/painelFabrica.js';

const AGORA = Date.parse('2026-09-15T12:00:00Z');
const atras = (dias) => new Date(AGORA - (dias * 86400000)).toISOString();

/** 1 h de relogio, 700 pecas, sem parada -> 700 pc/h nos dois ritmos. */
const medicao = (maquina, dias, pecas = 700, paradas = []) => ({
  id: `${maquina}-${dias}`, maquina, peca: 'Princesa Fundo',
  iniciado_em: atras(dias), finalizado_em: atras(dias), salvo_em: atras(dias),
  duracao_ms: 3600000, pecas, ciclos_por_peca: 1, arquivada: false, paradas,
});

const grupoDe = (nome) => (/CNC/i.test(nome) ? '0006 · CNC' : '0002 · FURADEIRA');

describe('painelDeMaquinas', () => {
  it('a manchete e o ritmo de RELOGIO, com o rodando ao lado', () => {
    // 700 pecas em 1 h, 15 min parados: relogio 700, rodando 933.
    const paradas = [{ motivo: 'manutencao', duracao_ms: 900000 }];
    const { grupos } = painelDeMaquinas([medicao('FURADEIRA 16', 0, 700, paradas)], {
      grupoDe, agora: AGORA,
    });
    const m = grupos[0].maquinas[0];
    expect(Math.round(m.ritmoRelogio)).toBe(700);
    expect(Math.round(m.ritmoRodando)).toBe(933);
    expect(Math.round(m.disponibilidadePct)).toBe(75);
    expect(m.maiorParada.rotulo).toMatch(/manuten/i);
  });

  /**
   * A medicao e' por AMOSTRAGEM e o painel de parede sugere "agora": sem
   * a idade, 750 pc/h de quarta aparece numa terca como se fosse o ritmo
   * do momento.
   */
  it('marca como VELHA a medicao que passou do limite, sem apagar o numero', () => {
    const { grupos } = painelDeMaquinas([
      medicao('FURADEIRA 16', 0),
      medicao('FURADEIRA 12', DIAS_ATE_ENVELHECER + 3),
    ], { grupoDe, agora: AGORA });
    const porNome = new Map(grupos[0].maquinas.map((m) => [m.maquina, m]));
    expect(porNome.get('FURADEIRA 16').velha).toBe(false);
    expect(porNome.get('FURADEIRA 12').velha).toBe(true);
    // Velha nao e' invalida: o numero continua certo sobre o periodo dele.
    expect(Math.round(porNome.get('FURADEIRA 12').ritmoRelogio)).toBe(700);
  });

  it('a idade vem em ms, para a tela escrever "medida ha ..."', () => {
    const { grupos } = painelDeMaquinas([medicao('FURADEIRA 16', 1)], { grupoDe, agora: AGORA });
    expect(grupos[0].maquinas[0].idadeMs).toBe(86400000);
  });

  /**
   * Posto sem medicao nao aparecia em resumo nenhum. Num painel de gestao
   * a vista, a maquina que ninguem mediu ha' duas semanas e' justamente a
   * que precisa aparecer.
   */
  it('mostra a maquina do CADASTRO que ninguem mediu', () => {
    const cadastro = [
      { nome: 'FURADEIRA 16', ativa: true },
      { nome: 'FURADEIRA 04', ativa: true },
    ];
    const { grupos, semNumero } = painelDeMaquinas([medicao('FURADEIRA 16', 0)], {
      maquinas: cadastro, grupoDe, agora: AGORA,
    });
    const esquecida = grupos[0].maquinas.find((m) => m.maquina === 'FURADEIRA 04');
    expect(esquecida).toBeTruthy();
    expect(esquecida.medida).toBe(false);
    expect(esquecida.ritmoRelogio).toBeNull();
    expect(semNumero).toBe(1);
  });

  it('maquina DESATIVADA no cadastro nao entra — nao e pendencia', () => {
    const cadastro = [{ nome: 'FURADEIRA 04', ativa: false }];
    const { grupos } = painelDeMaquinas([medicao('FURADEIRA 16', 0)], {
      maquinas: cadastro, grupoDe, agora: AGORA,
    });
    expect(grupos[0].maquinas.map((m) => m.maquina)).toEqual(['FURADEIRA 16']);
  });

  /**
   * Uma CNC a 181 pc/h nao e' "pior" que uma furadeira a 750: sao
   * servicos diferentes. Ranquear os dois na mesma lista e' a comparacao
   * que o relatorio inteiro recusa.
   */
  it('agrupa por grupo e nunca ordena maquinas entre grupos', () => {
    const { grupos } = painelDeMaquinas([
      medicao('CNC SCM', 0, 181),
      medicao('FURADEIRA 16', 0, 750),
    ], { grupoDe, agora: AGORA });
    expect(grupos.map((g) => g.grupo)).toEqual(['0002 · FURADEIRA', '0006 · CNC']);
  });

  it('dentro do grupo, o menor ritmo vem primeiro — e onde a capacidade se perde', () => {
    const { grupos } = painelDeMaquinas([
      medicao('FURADEIRA 16', 0, 900),
      medicao('FURADEIRA 12', 0, 400),
      medicao('FURADEIRA 04', 0, 650),
    ], { grupoDe, agora: AGORA });
    expect(grupos[0].maquinas.map((m) => m.maquina))
      .toEqual(['FURADEIRA 12', 'FURADEIRA 04', 'FURADEIRA 16']);
  });

  /**
   * "Ninguem mediu esta maquina" e' pendencia mais urgente que um ritmo
   * baixo — no ritmo baixo ao menos se sabe que e' baixo.
   */
  it('quem nao tem numero vem antes de quem tem, e o velho antes do atual', () => {
    const { grupos } = painelDeMaquinas([
      medicao('FURADEIRA 16', 0, 400),
      medicao('FURADEIRA 12', DIAS_ATE_ENVELHECER + 1, 900),
    ], { maquinas: [{ nome: 'FURADEIRA 04', ativa: true }], grupoDe, agora: AGORA });
    expect(grupos[0].maquinas.map((m) => m.maquina))
      .toEqual(['FURADEIRA 04', 'FURADEIRA 12', 'FURADEIRA 16']);
  });

  it('maquina fora do cadastro cai num balde proprio, por ultimo', () => {
    const { grupos } = painelDeMaquinas([
      medicao('EMBALADORA', 0),
      medicao('FURADEIRA 16', 0),
    ], { grupoDe: (n) => (/FURADEIRA/.test(n) ? '0002 · FURADEIRA' : null), agora: AGORA });
    expect(grupos[grupos.length - 1].grupo).toBe(SEM_GRUPO_PAINEL);
  });

  it('sem medicao e sem cadastro, o painel devolve vazio em vez de quebrar', () => {
    expect(painelDeMaquinas([], { agora: AGORA })).toEqual({ grupos: [], total: 0, semNumero: 0 });
  });
});

/**
 * QUAL GRUPO A TV MOSTRA.
 *
 * O monitor perto das furadeiras nao tem por que mostrar a CNC, mas a TV
 * nao tem mouse: a unica escolha possivel e' a que ja' esta' no endereco,
 * fixado quando se monta o monitor.
 */
describe('resolverGrupoDoPainel', () => {
  const cadastro = {
    grupos: [
      { id: 'g2', codigo: '0002', nome: 'FURADEIRA' },
      { id: 'g6', codigo: '0006', nome: 'CNC' },
    ],
    maquinas: [
      { nome: 'FURADEIRA 16', ativa: true, grupo_id: 'g2' },
      { nome: 'FURADEIRA 12', ativa: true, grupo_id: 'g2' },
      { nome: 'CNC SCM', ativa: true, grupo_id: 'g6' },
    ],
  };

  it('sem codigo na URL, o painel nao filtra — a TV mostra a fabrica', () => {
    const r = resolverGrupoDoPainel(cadastro, '');
    expect(r.filtrado).toBe(false);
    expect(r.nomes).toBeNull();
  });

  it('pelo CODIGO, devolve o rotulo e as maquinas do grupo', () => {
    const r = resolverGrupoDoPainel(cadastro, '0002');
    expect(r.filtrado).toBe(true);
    expect(r.encontrado).toBe(true);
    expect(r.rotulo).toBe('0002 · FURADEIRA');
    expect([...r.nomes].sort()).toEqual(['furadeira 12', 'furadeira 16']);
  });

  /**
   * Monitor em branco por um digito errado na URL e' o pior jeito de
   * falhar: ninguem chega perto para investigar, e a fabrica conclui que o
   * painel morreu.
   */
  it('codigo inexistente NAO some com a tela: diz o que pediu e o que existe', () => {
    const r = resolverGrupoDoPainel(cadastro, '0009');
    expect(r.encontrado).toBe(false);
    expect(r.codigo).toBe('0009');
    expect(r.disponiveis).toEqual(['0002', '0006']);
  });

  it('espaco sobrando na URL nao quebra o casamento', () => {
    expect(resolverGrupoDoPainel(cadastro, ' 0002 ').rotulo).toBe('0002 · FURADEIRA');
  });

  it('sem cadastro carregado, devolve sem quebrar', () => {
    expect(resolverGrupoDoPainel(null, '0002').encontrado).toBe(false);
    expect(resolverGrupoDoPainel(null, '').filtrado).toBe(false);
  });
});
