import { describe, expect, it } from 'vitest';
import { proximasAcoes, situacao } from '../src/domain/proximasAcoes.js';

const estudo = (id, extra = {}) => ({
  id, nome: id, recurso: 'EMBALAGEM 01', analista_nome: 'ODERLI',
  total_operacoes: 8, total_observacoes: 0, status: 'coletando',
  atualizado_em: '2026-08-20T12:00:00Z', ...extra,
});

describe('situacao', () => {
  it('sem ciclo, esta pendente', () => {
    expect(situacao(estudo('a'))).toBe('pendente');
  });

  it('com ciclo esta em andamento', () => {
    expect(situacao(estudo('a', { total_observacoes: 7 }))).toBe('andamento');
  });

  it('concluido com ciclos esta concluido', () => {
    expect(situacao(estudo('a', { status: 'concluido', total_observacoes: 40 }))).toBe('concluido');
  });

  /**
   * O caso que a tela errou em producao: um RACK SIRIUS 1.6 com 8 operacoes
   * e ZERO ciclos aparecia como "Último estudo concluído", oferecendo
   * Analisar quando ninguem tinha cronometrado nada ainda.
   *
   * 'concluido' no banco quer dizer "saiu da lista do tablet" — o botao
   * Só no PC / Ao tablet grava esse status. Nao quer dizer medicao feita.
   */
  it('marcado concluido, mas sem nenhum ciclo, continua sendo pendencia', () => {
    expect(situacao(estudo('a', { status: 'concluido', total_observacoes: 0 }))).toBe('pendente');
  });

  it('estudo sem status, sem ciclo, conta como pendente', () => {
    expect(situacao({ id: 'a' })).toBe('pendente');
  });

  /**
   * O caso medido em producao: RACK XXXXXX, 8 operacoes, meta 10, e
   * exatamente 10 ciclos em CADA uma — a medicao acabou. O cartao continuava
   * dizendo "Continuar medicao", mandando o analista refazer trabalho
   * pronto, porque 'concluido' no banco so' quer dizer "saiu do tablet".
   */
  it('toda operacao na meta: a medicao esta completa', () => {
    expect(situacao(estudo('a', {
      total_observacoes: 80, meta_obs: 10, operacoes_abaixo_da_meta: 0,
    }))).toBe('pronto');
  });

  it('uma operacao abaixo da meta ainda e andamento — o total nao decide', () => {
    // 80 ciclos podem ser 80 numa operacao e zero em sete.
    expect(situacao(estudo('a', {
      total_observacoes: 80, meta_obs: 10, operacoes_abaixo_da_meta: 7,
    }))).toBe('andamento');
  });

  it('sem meta cadastrada nao ha criterio de suficiencia', () => {
    expect(situacao(estudo('a', {
      total_observacoes: 80, meta_obs: 0, operacoes_abaixo_da_meta: 0,
    }))).toBe('andamento');
  });

  it('sem o campo do servidor, nao inventa conclusao', () => {
    // Bundle novo contra API antiga: o estudo segue sendo o que era.
    expect(situacao(estudo('a', { total_observacoes: 80, meta_obs: 10 }))).toBe('andamento');
  });

  it('tirado do tablet continua concluido, nao pronto', () => {
    expect(situacao(estudo('a', {
      status: 'concluido', total_observacoes: 80, meta_obs: 10, operacoes_abaixo_da_meta: 0,
    }))).toBe('concluido');
  });
});

describe('medicao completa na fila do dia', () => {
  const completo = (id, extra = {}) => estudo(id, {
    total_observacoes: 80, meta_obs: 10, operacoes_abaixo_da_meta: 0, ...extra,
  });

  it('o cartao manda ANALISAR, nao continuar medindo', () => {
    const { itens } = proximasAcoes([completo('a')]);
    expect(itens[0].tipo).toBe('pronto');
    expect(itens[0].acao).toBe('analisar');
    expect(itens[0].acaoRotulo).toBe('Analisar');
    expect(itens[0].rotulo).toBe('Medição completa');
  });

  it('vem antes do que ainda esta sendo medido: parado antes de andando', () => {
    const { itens } = proximasAcoes([
      estudo('concluido', { status: 'concluido', total_observacoes: 40 }),
      completo('pronto'),
      estudo('andamento', { total_observacoes: 5, meta_obs: 10, operacoes_abaixo_da_meta: 3 }),
      estudo('pendente'),
    ]);
    expect(itens.map((i) => i.id)).toEqual(['pendente', 'pronto', 'andamento', 'concluido']);
  });

  it('conta separado de quem ainda esta medindo', () => {
    const r = proximasAcoes([completo('a'), estudo('b', { total_observacoes: 3 })]);
    expect(r.prontos).toBe(1);
    expect(r.emAndamento).toBe(1);
  });
});

describe('proximasAcoes', () => {
  it('poe pendencia antes de medicao em andamento, e concluido por ultimo', () => {
    const { itens } = proximasAcoes([
      estudo('concluido', { status: 'concluido', total_observacoes: 40 }),
      estudo('andando', { total_observacoes: 7 }),
      estudo('parado'),
    ]);
    expect(itens.map((i) => i.id)).toEqual(['parado', 'andando', 'concluido']);
    expect(itens.map((i) => i.tipo)).toEqual(['pendente', 'andamento', 'concluido']);
  });

  it('cada situacao traz o rotulo e a acao correspondentes', () => {
    const { itens } = proximasAcoes([
      estudo('parado'),
      estudo('andando', { total_observacoes: 7 }),
      estudo('pronto', { status: 'concluido', total_observacoes: 40 }),
    ]);
    expect(itens[0]).toMatchObject({ rotulo: 'Aguardando medição', acaoRotulo: 'Iniciar medição', acao: 'medir' });
    expect(itens[1]).toMatchObject({ rotulo: 'Medição em andamento', acaoRotulo: 'Continuar medição', acao: 'medir' });
    expect(itens[2]).toMatchObject({ rotulo: 'Último estudo concluído', acaoRotulo: 'Analisar', acao: 'analisar' });
  });

  it('mostra um unico concluido, o mais recente', () => {
    const { itens } = proximasAcoes([
      estudo('velho', { status: 'concluido', total_observacoes: 30, atualizado_em: '2026-01-01T12:00:00Z' }),
      estudo('novo', { status: 'concluido', total_observacoes: 40, atualizado_em: '2026-08-27T12:00:00Z' }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].id).toBe('novo');
  });

  it('dentro da mesma situacao, o mais recente vem primeiro', () => {
    const { itens } = proximasAcoes([
      estudo('antigo', { atualizado_em: '2026-08-01T12:00:00Z' }),
      estudo('recente', { atualizado_em: '2026-08-26T12:00:00Z' }),
    ]);
    expect(itens.map((i) => i.id)).toEqual(['recente', 'antigo']);
  });

  it('limita a lista e conta o que ficou de fora', () => {
    const muitos = Array.from({ length: 9 }, (_, i) => estudo(`p${i}`));
    const { itens, restantes } = proximasAcoes(muitos, { limite: 4 });
    expect(itens).toHaveLength(4);
    expect(restantes).toBe(5);
  });

  it('concluido cortado pelo limite nao entra em "e mais"', () => {
    const { restantes } = proximasAcoes([
      ...Array.from({ length: 4 }, (_, i) => estudo(`p${i}`)),
      estudo('pronto', { status: 'concluido', total_observacoes: 40 }),
    ], { limite: 4 });
    expect(restantes).toBe(0);
  });

  it('ignora arquivados', () => {
    const { itens } = proximasAcoes([estudo('fora', { status: 'arquivado' })]);
    expect(itens).toHaveLength(0);
  });

  it('lista vazia nao quebra e nao inventa item', () => {
    expect(proximasAcoes([])).toEqual({
      itens: [], restantes: 0, pendentes: 0, emAndamento: 0, prontos: 0,
    });
    expect(proximasAcoes(null).itens).toEqual([]);
  });

  it('contexto junta recurso e analista, e omite o que falta', () => {
    const { itens } = proximasAcoes([
      estudo('a'),
      estudo('b', { recurso: '', analista_nome: '', analista: '', atualizado_em: '2026-01-01T00:00:00Z' }),
    ]);
    expect(itens[0].contexto).toBe('EMBALAGEM 01 · ODERLI');
    expect(itens[1].contexto).toBe('');
  });

  it('usa o analista digitado quando nao ha cadastro ligado', () => {
    const { itens } = proximasAcoes([estudo('a', { analista_nome: null, analista: 'MAURÍCIO' })]);
    expect(itens[0].contexto).toBe('EMBALAGEM 01 · MAURÍCIO');
  });

  it('so aponta quanto falta quando a meta existe e ainda nao foi batida', () => {
    const pega = (extra) => proximasAcoes([estudo('a', extra)]).itens[0].faltam;
    expect(pega({ total_observacoes: 7, meta_obs: 12 })).toBe(5);
    expect(pega({ total_observacoes: 20, meta_obs: 12 })).toBe(0);
    expect(pega({ total_observacoes: 7, meta_obs: 0 })).toBe(0);
    expect(pega({ total_observacoes: 7 })).toBe(0);
    // Sem ciclo nenhum a meta nao acrescenta nada: "0 ciclos" ja' diz.
    expect(pega({ total_observacoes: 0, meta_obs: 12 })).toBe(0);
  });

  it('conta pendencias e medicoes em andamento por inteiro', () => {
    const r = proximasAcoes([
      estudo('p1'), estudo('p2'),
      estudo('a1', { total_observacoes: 3 }),
      estudo('c1', { status: 'concluido', total_observacoes: 30 }),
    ]);
    expect(r.pendentes).toBe(2);
    expect(r.emAndamento).toBe(1);
  });
});
