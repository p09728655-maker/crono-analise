/**
 * O TABLET CADASTRA O PRODUTO ANTES DE MEDIR (v2.97.0) — a regra do lado
 * do aparelho, com o servidor simulado.
 *
 * O que se prova: o nome que ja' esta' no cadastro e' ESCOLHIDO, nao vai
 * ao servidor (nem o desativado, que e' decisao do PCP); o recem-cadastrado
 * entra na lista deste aparelho na hora; o 409 de outro tablet vira
 * escolha; e sem rede a tela recebe o que dizer, nunca uma excecao.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const servidor = vi.hoisted(() => ({ criar: null, cadastro: null }));
vi.mock('../src/lib/api.js', async (original) => {
  const real = await original();
  return {
    ...real,
    criarProduto: (dados) => servidor.criar(dados),
    listarCadastroMaquinas: async () => servidor.cadastro,
  };
});

// O cache do aparelho: e' dele que a lista sai sem rede, entao e' nele que
// o produto recem-cadastrado tem de estar.
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => guardado.get(k) ?? null,
  setItem: (k, v) => { guardado.set(k, String(v)); },
  removeItem: (k) => { guardado.delete(k); },
};
const catalogo = () => JSON.parse(guardado.get('ritmopatrimar.maquinas'));

const { adotarMaquinas, cadastrarProduto, produtoDoCadastro, produtosDoGrupo } = await import('../src/lib/maquinas.js');
const { ErroApi } = await import('../src/lib/api.js');

const EMB = 'g-embalagem';
const FUR = 'g-furadeira';
const base = () => ({
  maquinas: [{ id: 'm1', nome: 'EMBALAGEM 01', grupo_id: EMB, ativa: true }],
  grupos: [{ id: EMB, nome: 'EMBALAGEM' }, { id: FUR, nome: 'FURADEIRA' }],
  produtos: [
    { id: 'p1', nome: 'Rack Sirius 1.6', grupo_id: EMB, ativo: true },
    { id: 'p2', nome: 'Rack Antigo', grupo_id: EMB, ativo: false },
    { id: 'p3', nome: 'Armário Encanto', grupo_id: FUR, ativo: true },
  ],
});
beforeEach(() => {
  adotarMaquinas(base());
  servidor.criar = vi.fn(async ({ nome, grupoId }) => ({ id: 'novo', nome, codigo: null, ativo: true, grupo_id: grupoId }));
  servidor.cadastro = base();
});

describe('produto do cadastro pelo nome', () => {
  it('sem caixa, sem acento e sem espaco a mais; so dentro do grupo', () => {
    expect(produtoDoCadastro(base(), EMB, '  rack   SIRIUS 1.6 ')?.id).toBe('p1');
    expect(produtoDoCadastro(base(), EMB, 'rack antigo')?.id).toBe('p2');
    expect(produtoDoCadastro(base(), FUR, 'armario encanto')?.id).toBe('p3');
    expect(produtoDoCadastro(base(), FUR, 'Rack Sirius 1.6')).toBeNull();
    expect(produtoDoCadastro(base(), null, 'Rack Sirius 1.6')).toBeNull();
    expect(produtoDoCadastro(base(), EMB, '   ')).toBeNull();
  });
});

describe('cadastrar pelo tablet', () => {
  it('nome novo vai ao servidor aparado e entra na lista guardada no aparelho na hora', async () => {
    const r = await cadastrarProduto({ nome: '  Penteadeira   Princesa ', grupoId: EMB });
    expect(r).toMatchObject({ estado: 'ok', novo: true, produto: { nome: 'Penteadeira Princesa' } });
    expect(servidor.criar).toHaveBeenCalledWith({ nome: 'Penteadeira Princesa', grupoId: EMB });
    expect(produtosDoGrupo(catalogo(), EMB).map((p) => p.nome)).toEqual(['Rack Sirius 1.6', 'Penteadeira Princesa']);
    // A furadeira nao ganha o produto da embalagem.
    expect(produtosDoGrupo(catalogo(), FUR).map((p) => p.nome)).toEqual(['Armário Encanto']);
  });

  it('nome que ja esta na lista e ESCOLHIDO, com a grafia do cadastro, sem ir ao servidor', async () => {
    const r = await cadastrarProduto({ nome: 'rack sirius 1.6', grupoId: EMB });
    expect(r).toEqual({ estado: 'ok', novo: false, produto: expect.objectContaining({ id: 'p1', nome: 'Rack Sirius 1.6' }) });
    expect(servidor.criar).not.toHaveBeenCalled();
    expect(produtosDoGrupo(catalogo(), EMB)).toHaveLength(1);
  });

  it('desativado pelo PCP nao volta pelo tablet: a tela diz, e o servidor nem e chamado', async () => {
    const r = await cadastrarProduto({ nome: 'RACK ANTIGO', grupoId: EMB });
    expect(r).toMatchObject({ estado: 'desativado', produto: { id: 'p2', nome: 'Rack Antigo' } });
    expect(servidor.criar).not.toHaveBeenCalled();
  });

  it('409 de outro tablet: busca o cadastro e escolhe o que ele cadastrou', async () => {
    servidor.criar = vi.fn(async () => { throw new ErroApi(409, 'Ja existe este produto no grupo: "Rack Lua"'); });
    servidor.cadastro = { ...base(), produtos: [...base().produtos, { id: 'p9', nome: 'Rack Lua', grupo_id: EMB, ativo: true }] };
    const r = await cadastrarProduto({ nome: 'rack lua', grupoId: EMB });
    expect(r).toMatchObject({ estado: 'ok', novo: false, produto: { id: 'p9', nome: 'Rack Lua' } });
    expect(produtosDoGrupo(catalogo(), EMB).map((p) => p.nome)).toContain('Rack Lua');
  });

  it('sem rede: devolve o que dizer, a lista fica como estava', async () => {
    servidor.criar = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const r = await cadastrarProduto({ nome: 'Rack Lua', grupoId: EMB });
    expect(r.estado).toBe('erro');
    expect(r.mensagem).toMatch(/Sem rede/);
    expect(r.mensagem).toMatch(/segue nesta medição/);
    expect(produtosDoGrupo(catalogo(), EMB)).toHaveLength(1);
  });

  it('recusa do servidor chega com a mensagem dele', async () => {
    servidor.criar = vi.fn(async () => { throw new ErroApi(403, 'Seu acesso não cadastra produto'); });
    expect(await cadastrarProduto({ nome: 'Rack Lua', grupoId: EMB }))
      .toEqual({ estado: 'erro', mensagem: 'Seu acesso não cadastra produto' });
  });

  it('sem grupo ou sem nome nao chama ninguem', async () => {
    expect((await cadastrarProduto({ nome: 'Rack Lua', grupoId: null })).estado).toBe('erro');
    expect((await cadastrarProduto({ nome: '   ', grupoId: EMB })).estado).toBe('erro');
    expect(servidor.criar).not.toHaveBeenCalled();
  });
});
