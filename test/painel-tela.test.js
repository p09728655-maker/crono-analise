/**
 * O ENVIO AO PAINEL PELA TELA (useAnalisesDoPcp, em VolumeAVolume.jsx): o
 * "Salvar analise e fechar" manda a medicao ao painel RitmoPatrimar, a fila
 * anda uma de cada vez, o "Editar produto" reenvia a que ja' foi, e o aviso
 * mostra a medicao como ela esta' agora.
 *
 * Sem DOM e sem biblioteca de teste: o hook so' usa useState e useRef, e um
 * React de mentira (abaixo) guarda os estados na ordem em que o hook os
 * pede, como o React de verdade. Cada `render()` chama o hook de novo e le
 * o que ele devolve. A API do servidor e' de mentira; o envio fica pendente
 * ate' o teste mandar responder, para ver a fila no meio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const react = vi.hoisted(() => ({ slots: [], i: 0 }));
vi.mock('react', async (original) => {
  const real = await original();
  const useState = (inicial) => {
    const k = react.i++;
    if (!(k in react.slots)) react.slots[k] = typeof inicial === 'function' ? inicial() : inicial;
    return [react.slots[k], (v) => { react.slots[k] = typeof v === 'function' ? v(react.slots[k]) : v; }];
  };
  const useRef = (inicial) => {
    const k = react.i++;
    if (!(k in react.slots)) react.slots[k] = { current: inicial };
    return react.slots[k];
  };
  return { ...real, default: real, useState, useRef };
});

const api = vi.hoisted(() => ({ gravacoes: [], renomeios: [], recusarNome: null, envios: [], respostas: [] }));
vi.mock('../src/lib/api.js', async (original) => {
  const real = await original();
  return {
    ...real,
    salvarAnaliseConferencia: async (id, opcoes) => {
      api.gravacoes.push({ ids: [id], ...opcoes });
      return { id, analisada_em: opcoes.analisada ? '2026-11-06T10:00:00Z' : null };
    },
    salvarAnaliseConferencias: async (ids, nota, opcoes) => {
      api.gravacoes.push({ ids, analisada: true, ...opcoes });
      return ids.map((id) => ({ id, analisada_em: '2026-11-06T10:00:00Z' }));
    },
    renomearPecaConferencia: async (id, peca, opcoes) => {
      if (api.recusarNome) throw new Error(api.recusarNome);
      api.renomeios.push({ ids: [id], peca, ...opcoes });
    },
    renomearPecaConferencias: async (ids, peca, opcoes) => {
      if (api.recusarNome) throw new Error(api.recusarNome);
      api.renomeios.push({ ids, peca, ...opcoes });
    },
    // Fica pendente ate' o teste responder (responder(), abaixo).
    enviarAoPainel: (id) => new Promise((resolve) => {
      api.envios.push(id);
      api.respostas.push(resolve);
    }),
  };
});

const { useAnalisesDoPcp } = await import('../src/features/analise/conferencias/VolumeAVolume.jsx');

const ENVIADA = { estado: 'enviada', mensagem: 'Enviada ao painel.', em: '2026-11-06T10:00:05Z' };
const espera = () => new Promise((r) => { setTimeout(r, 0); });
/** Responde o envio mais antigo ainda pendente e deixa a fila andar. */
async function responder(resposta = ENVIADA) {
  const r = api.respostas.shift();
  r(resposta);
  await espera();
}

let opcoes;
const render = () => {
  react.i = 0;
  return useAnalisesDoPcp(() => {}, opcoes);
};
const medicao = (id, extra = {}) => ({
  id, peca: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', analisada_em: null, analise_nota: '',
  painel_em: null, painel_erro: null, iniciado_em: '2026-11-06T10:00:00Z', ...extra,
});

beforeEach(() => {
  react.slots = [];
  api.gravacoes = [];
  api.renomeios = [];
  api.recusarNome = null;
  api.envios = [];
  api.respostas = [];
  opcoes = { painelLigado: true, conferencias: [] };
});

describe('salvar a analise manda ao painel', () => {
  it('com o envio ligado: a gravacao pede a marca, e a medicao vai ao painel', async () => {
    const m = medicao('m1');
    await render().da(m).salvar(true);
    expect(api.gravacoes).toEqual([{ ids: ['m1'], analisada: true, nota: '', painel: true }]);
    await espera();
    expect(api.envios).toEqual(['m1']);
    let h = render();
    expect(h.situacaoNoPainel(m).tipo).toBe('enviando');
    expect(h.enviosPendentes).toBe(1);

    await responder();
    h = render();
    expect(h.situacaoNoPainel(m)).toMatchObject({ tipo: 'no-painel', estado: 'enviada' });
    expect(h.enviosPendentes).toBe(0);
  });

  it('a juncao: o lote pede a marca, e vai uma por medicao, uma de cada vez', async () => {
    const meds = ['b1', 'b2', 'b3'].map((id) => medicao(id));
    const juncao = { id: 'J:b1,b2,b3', juncao: true, medicoes: meds };
    await render().da(juncao).salvar(true);
    expect(api.gravacoes).toHaveLength(1);
    expect(api.gravacoes[0]).toMatchObject({ ids: ['b1', 'b2', 'b3'], painel: true });
    await espera();
    // A fila: uma indo, duas esperando — e a tela conta as tres (F5 as perde).
    expect(api.envios).toEqual(['b1']);
    let h = render();
    expect(meds.map((x) => h.situacaoNoPainel(x).tipo)).toEqual(['enviando', 'na-fila', 'na-fila']);
    expect(h.enviosPendentes).toBe(3);

    await responder();
    expect(api.envios).toEqual(['b1', 'b2']);
    await responder({ estado: 'recusada', mensagem: 'O painel recusou: Produto fora do cadastro.', em: null });
    await responder();
    expect(api.envios).toEqual(['b1', 'b2', 'b3']);
    h = render();
    expect(meds.map((x) => h.situacaoNoPainel(x).tipo)).toEqual(['no-painel', 'nao-foi', 'no-painel']);
    expect(h.enviosPendentes).toBe(0);
  });

  it('reabrir nao manda nem pede a marca', async () => {
    const m = medicao('m1', { analisada_em: '2026-11-05T10:00:00Z' });
    await render().da(m).salvar(false);
    await espera();
    expect(api.gravacoes).toEqual([{ ids: ['m1'], analisada: false, nota: '', painel: false }]);
    expect(api.envios).toEqual([]);
  });

  it.each([[false], [null]])('envio desligado (ligado=%s): salva sem pedir a marca e nao manda', async (ligado) => {
    opcoes = { painelLigado: ligado, conferencias: [] };
    await render().da(medicao('m1')).salvar(true);
    const meds = ['b1', 'b2'].map((id) => medicao(id));
    await render().da({ id: 'J:b1,b2', juncao: true, medicoes: meds }).salvar(true);
    await espera();
    expect(api.gravacoes.map((g) => g.painel)).toEqual([false, false]);
    expect(api.envios).toEqual([]);
  });
});

describe('produto corrigido depois do envio (Editar produto)', () => {
  const NOVO = '501059 · PENTEADEIRA CAMARIM STRASS · VOL 1/2';

  it("grava com o pedido de marca e reenvia so' a analisada que ja' foi ao painel ou tentou", async () => {
    const foi = medicao('foi', { analisada_em: 'x', painel_em: '2026-11-06T09:00:00Z' });
    const recusada = medicao('recusada', { analisada_em: 'x', painel_erro: 'O painel recusou: …' });
    const nunca = medicao('nunca', { analisada_em: 'x' });
    const reaberta = medicao('reaberta', { painel_em: '2026-11-06T09:00:00Z' });
    opcoes = { painelLigado: true, conferencias: [foi, recusada, nunca, reaberta] };
    await render().renomearProduto(['foi', 'recusada', 'nunca', 'reaberta'], NOVO);
    expect(api.renomeios).toEqual([{ ids: ['foi', 'recusada', 'nunca', 'reaberta'], peca: NOVO, painel: true }]);
    await espera();
    expect(api.envios).toEqual(['foi']);
    await responder();
    expect(api.envios).toEqual(['foi', 'recusada']);
    await responder();
    expect(api.envios).toEqual(['foi', 'recusada']);
    // A tela troca o nome na lista logo depois de gravar: o aviso fala dele.
    opcoes = { painelLigado: true, conferencias: [foi, recusada, nunca, reaberta].map((c) => ({ ...c, peca: NOVO })) };
    expect(render().avisoDoPainel.medicoes.map((x) => x.medicao.peca)).toEqual([NOVO, NOVO]);
  });

  it("uma so': o caminho de uma medicao, com o mesmo pedido", async () => {
    const foi = medicao('foi', { analisada_em: 'x', painel_em: 'y' });
    opcoes = { painelLigado: true, conferencias: [foi] };
    await render().renomearProduto(['foi'], NOVO);
    expect(api.renomeios).toEqual([{ ids: ['foi'], peca: NOVO, painel: true }]);
    await espera();
    expect(api.envios).toEqual(['foi']);
  });

  it("a que esta' indo vai de novo, atras dela (pode ter lido o nome de antes)", async () => {
    const m = medicao('m1');
    opcoes = { painelLigado: true, conferencias: [m] };
    await render().da(m).salvar(true);
    await espera();
    expect(api.envios).toEqual(['m1']);
    opcoes = { painelLigado: true, conferencias: [{ ...m, analisada_em: 'x' }] };
    await render().renomearProduto(['m1'], NOVO);
    await responder();
    expect(api.envios).toEqual(['m1', 'm1']);
    await responder();
    expect(render().enviosPendentes).toBe(0);
  });

  it('recusado pelo servidor: o erro sobe para a janela e nada vai ao painel', async () => {
    const foi = medicao('foi', { analisada_em: 'x', painel_em: 'y' });
    opcoes = { painelLigado: true, conferencias: [foi] };
    api.recusarNome = 'Sem permissão para renomear';
    await expect(render().renomearProduto(['foi'], NOVO)).rejects.toThrow('Sem permissão para renomear');
    await espera();
    expect(api.envios).toEqual([]);
  });

  it('com o envio desligado: grava sem o pedido e nao manda nada', async () => {
    const foi = medicao('foi', { analisada_em: 'x', painel_em: 'y' });
    opcoes = { painelLigado: false, conferencias: [foi] };
    await render().renomearProduto(['foi'], NOVO);
    await espera();
    expect(api.renomeios).toEqual([{ ids: ['foi'], peca: NOVO, painel: false }]);
    expect(api.envios).toEqual([]);
  });
});

describe('o aviso do ultimo envio', () => {
  it("mostra e reenvia a medicao como ela esta' agora, nao o retrato de quando saiu", async () => {
    const solta = medicao('m1', { peca: 'Penteadeira strass' });
    opcoes = { painelLigado: true, conferencias: [solta] };
    await render().da(solta).salvar(true);
    await espera();
    await responder({ estado: 'recusada', mensagem: 'O produto "Penteadeira strass" não é da lista…', em: null });

    // O PCP corrige o produto (sem reenvio automatico, para ver o aviso).
    const corrigida = { ...solta, peca: '501059 · PENTEADEIRA CAMARIM STRASS · VOL 2/2', analisada_em: 'x' };
    opcoes = { painelLigado: true, conferencias: [corrigida] };
    let aviso = render().avisoDoPainel;
    expect(aviso.medicoes[0].medicao.peca).toBe(corrigida.peca);
    expect(aviso.medicoes[0].tipo).toBe('nao-foi');

    aviso.reenviar();
    await espera();
    expect(api.envios).toEqual(['m1', 'm1']);
    await responder();
    aviso = render().avisoDoPainel;
    expect(aviso.medicoes[0].medicao.peca).toBe(corrigida.peca);
    expect(aviso.medicoes[0]).toMatchObject({ tipo: 'no-painel', estado: 'enviada' });
  });
});
