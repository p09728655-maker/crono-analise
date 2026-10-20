/**
 * VOLUMES POR PRODUTO — quantas caixas o produto leva na embalagem.
 *
 * O que precisa ser provado:
 *  - Vazio e' "nao informado" e NUNCA vira 1 (o 1 assumido num rack de dois
 *    volumes corta o takt do estudo pela metade sem ninguem ver).
 *  - Texto que nao e' numero e' ERRO, no formulario e na API — nunca null
 *    calado, que apagaria o numero com a tela dizendo que salvou.
 *  - O cadastro continua de pe' num banco SEM a coluna: o preview nao migra
 *    e usa o mesmo banco da producao, e o GET /api/maquinas leva o cadastro
 *    inteiro (maquinas, grupos, produtos) para o PC e para o tablet.
 *
 * Banco e auth dublados, como em maquinas-nominal-patch: o que se testa e'
 * o que vai para o SQL e a ordem, nao o acesso. A integracao com Postgres
 * real esta' em api.integracao.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  faltamVolumes, lerVolumesDoFormulario, rotuloVolumes,
} from '../src/features/analise/Produtos.jsx';

/* ------------------------------------------------------------ formulario */
describe('lerVolumesDoFormulario', () => {
  it('vazio e "nao informado" (null), nunca 1', () => {
    expect(lerVolumesDoFormulario('')).toBeNull();
    expect(lerVolumesDoFormulario('   ')).toBeNull();
    expect(lerVolumesDoFormulario(undefined)).toBeNull();
  });

  it('numero inteiro vale, aparado', () => {
    expect(lerVolumesDoFormulario('1')).toBe(1);
    expect(lerVolumesDoFormulario(' 2 ')).toBe(2);
    expect(lerVolumesDoFormulario('50')).toBe(50);
  });

  it('texto que nao e numero inteiro e ERRO — nunca vira null nem 1', () => {
    expect(() => lerVolumesDoFormulario('2 caixas')).toThrow(/não é um número inteiro/);
    expect(() => lerVolumesDoFormulario('dois')).toThrow(/não é um número inteiro/);
    expect(() => lerVolumesDoFormulario('2,5')).toThrow(/não é um número inteiro/);
    expect(() => lerVolumesDoFormulario('-1')).toThrow(/não é um número inteiro/);
  });

  it('zero e acima de 50 sao recusados', () => {
    expect(() => lerVolumesDoFormulario('0')).toThrow(/entre 1 e 50/);
    expect(() => lerVolumesDoFormulario('51')).toThrow(/entre 1 e 50/);
  });
});

describe('rotuloVolumes e faltamVolumes', () => {
  const EMB = { nome: 'EMBALAGEM' };
  const FUR = { nome: 'FURADEIRA' };

  it('selo no singular e no plural', () => {
    expect(rotuloVolumes(1)).toBe('1 volume');
    expect(rotuloVolumes(2)).toBe('2 volumes');
  });

  it('so o produto ATIVO da embalagem sem volumes ganha o destaque', () => {
    expect(faltamVolumes({ ativo: true, volumes: null }, EMB)).toBe(true);
    // Cache velho do tablet, ou servidor sem a coluna: ausente = nao informado.
    expect(faltamVolumes({ ativo: true }, EMB)).toBe(true);
    expect(faltamVolumes({ ativo: true, volumes: 2 }, EMB)).toBe(false);
    expect(faltamVolumes({ ativo: false, volumes: null }, EMB)).toBe(false);
    // Fora da embalagem a unidade ja' e' peca: nada a converter.
    expect(faltamVolumes({ ativo: true, volumes: null }, FUR)).toBe(false);
    // Pelo nome do grupo, com acento e caixa quaisquer (unidadeDoPosto).
    expect(faltamVolumes({ ativo: true, volumes: null }, { nome: 'Embalagem Montagem' })).toBe(true);
  });
});

/* ------------------------------------------------------------------- API */
const GRUPO = vi.hoisted(() => '22222222-2222-4222-8222-222222222222');
const banco = vi.hoisted(() => ({ consultas: [], volumesAtual: null, semColuna: false }));

vi.mock('../api/_lib/db.js', () => ({ sql: () => Promise.resolve([]) }));
vi.mock('../api/_lib/auth.js', () => {
  // A coluna `volumes` usada de verdade no SQL (fora do jsonb e do apelido).
  const usaColuna = (texto) => /\bvolumes\b/.test(texto.replace(/'volumes'/g, '').replace(/AS volumes/g, ''));
  const db = (partes, ...valores) => {
    const texto = partes.join('?');
    banco.consultas.push({ texto, valores });
    // O banco do PREVIEW: a producao ainda nao migrou. O Postgres recusa a
    // coluna com 42703, na forma que api/_lib/http.js traduz.
    if (banco.semColuna && usaColuna(texto)) {
      const erro = new Error('column "volumes" of relation "produtos" does not exist');
      erro.code = '42703';
      return Promise.reject(erro);
    }
    const linha = {
      id: 'p1', nome: 'Rack Sirius 1.6', codigo: null, ativo: true, grupo_id: GRUPO,
      volumes: banco.semColuna ? null : banco.volumesAtual,
    };
    if (/SELECT id FROM grupos_maquina WHERE id/.test(texto)) return Promise.resolve([{ id: GRUPO }]);
    if (/INSERT INTO produtos/.test(texto)) return Promise.resolve([{ id: 'p1' }]);
    if (/FROM produtos p/.test(texto)) return Promise.resolve([linha]);
    return Promise.resolve([]);
  };
  return {
    autenticar: async () => ({
      modo: 'servico', empresaId: '11111111-1111-4111-8111-111111111111', papel: 'admin',
      rls: (fn) => fn(db),
    }),
    exigirPapel: () => {},
  };
});

const PRODUTO = '33333333-3333-4333-8333-333333333333';

function respostaFalsa() {
  const r = { codigo: null, corpo: null, cabecalhos: {} };
  r.status = (c) => { r.codigo = c; return r; };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; return r; };
  r.end = (txt) => { r.corpo = txt ? JSON.parse(txt) : null; };
  return r;
}

async function pedir({ metodo = 'GET', corpo, id } = {}) {
  const { default: handler } = await import('../api/maquinas.js');
  const req = { method: metodo, query: { produtos: '1', ...(id ? { id } : {}) }, body: corpo, headers: {} };
  const res = respostaFalsa();
  await handler(req, res);
  return res;
}

const inserts = () => banco.consultas.filter((c) => /INSERT INTO produtos/.test(c.texto));
const updates = () => banco.consultas.filter((c) => /UPDATE produtos/.test(c.texto));
const colunas = () => updates().map((c) => /SET (\w+)/.exec(c.texto)[1]);

describe('API de produtos: volumes', () => {
  beforeEach(() => {
    banco.consultas.length = 0;
    banco.volumesAtual = null;
    banco.semColuna = false;
  });

  it('POST com volumes grava o numero e devolve o produto com ele', async () => {
    banco.volumesAtual = 2;
    const res = await pedir({ metodo: 'POST', corpo: { nome: 'Rack Sirius 1.6', grupoId: GRUPO, volumes: 2 } });
    expect(res.codigo).toBe(201);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].texto).toMatch(/codigo, volumes\)/);
    expect(inserts()[0].valores).toContain(2);
    expect(res.corpo.produto.volumes).toBe(2);
  });

  it('POST sem volumes, null ou vazio: a coluna fica FORA do INSERT (nasce nula, nunca 1)', async () => {
    for (const corpo of [{}, { volumes: null }, { volumes: '' }]) {
      banco.consultas.length = 0;
      const res = await pedir({ metodo: 'POST', corpo: { nome: 'Rack', grupoId: GRUPO, ...corpo } });
      expect(res.codigo, JSON.stringify(res.corpo)).toBe(201);
      expect(inserts()[0].texto).not.toMatch(/\bvolumes\b/);
      expect(inserts()[0].valores).not.toContain(1);
      expect(res.corpo.produto.volumes).toBeNull();
    }
  });

  it('POST com volumes fora da regra e 400 e nao cria nada', async () => {
    for (const volumes of [0, 51, 'x', 2.5, true, [2], { n: 2 }]) {
      banco.consultas.length = 0;
      const res = await pedir({ metodo: 'POST', corpo: { nome: 'Rack', grupoId: GRUPO, volumes } });
      expect(res.codigo, JSON.stringify(volumes)).toBe(400);
      expect(res.corpo.erro).toMatch(/volumes/);
      expect(inserts()).toEqual([]);
    }
  });

  it('PATCH so com volumes e valido (nao e "Nada a atualizar")', async () => {
    const res = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { volumes: 3 } });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['volumes']);
    expect(updates()[0].valores).toContain(3);
  });

  it('PATCH com volumes vazio ou null APAGA (grava null)', async () => {
    for (const volumes of ['', null]) {
      banco.consultas.length = 0;
      banco.volumesAtual = 2;
      const res = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { volumes } });
      expect(res.codigo).toBe(200);
      expect(colunas()).toEqual(['volumes']);
      expect(updates()[0].valores).toContain(null);
    }
  });

  it('PATCH com volumes errado nao grava nem o nome que veio junto', async () => {
    for (const volumes of [0, 51, 'x']) {
      banco.consultas.length = 0;
      const res = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { nome: 'Rack Novo', volumes } });
      expect(res.codigo).toBe(400);
      expect(updates()).toEqual([]);
    }
  });

  it('PATCH com o mesmo numero que ja esta gravado nao faz UPDATE', async () => {
    banco.volumesAtual = 2;
    const res = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { nome: 'Rack Novo', volumes: 2 } });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['nome']);
  });

  it('a leitura nao cita a coluna direto: le pelo jsonb da linha', async () => {
    const res = await pedir({});
    expect(res.codigo).toBe(200);
    const lista = banco.consultas.find((c) => /JOIN grupos_maquina/.test(c.texto));
    expect(lista.texto).toMatch(/to_jsonb\(p\)->>'volumes'/);
    expect(lista.texto).not.toMatch(/p\.volumes/);
  });
});

/* --------------------------------- o banco do PREVIEW (sem a coluna ainda) */
describe('API de produtos num banco sem a coluna volumes', () => {
  beforeEach(() => {
    banco.consultas.length = 0;
    banco.volumesAtual = null;
    banco.semColuna = true;
  });

  it('o GET do cadastro continua de pe e devolve volumes null', async () => {
    const res = await pedir({});
    expect(res.codigo).toBe(200);
    expect(res.corpo.produtos[0].volumes).toBeNull();
  });

  it('cadastrar sem volumes e editar o nome (volumes ainda vazio) funcionam', async () => {
    const criar = await pedir({ metodo: 'POST', corpo: { nome: 'Rack', grupoId: GRUPO, volumes: null } });
    expect(criar.codigo).toBe(201);
    // O formulario de edicao manda volumes sempre: o nulo que ja' era nulo
    // nao pode derrubar o renomear.
    const editar = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { nome: 'Rack Novo', volumes: null } });
    expect(editar.codigo).toBe(200);
    expect(colunas()).toEqual(['nome']);
  });

  it('so gravar um numero falha — com a mensagem de coluna que falta, nao "Erro interno"', async () => {
    const res = await pedir({ metodo: 'POST', corpo: { nome: 'Rack', grupoId: GRUPO, volumes: 2 } });
    expect(res.codigo).toBe(503);
    expect(res.corpo.erro).toMatch(/produtos\.volumes/);
  });

  /* O modo token de servico nao abre transacao (auth.rls chama direto): o
     que foi gravado antes do UPDATE que caiu FICA gravado. Por isso o de
     volumes vem primeiro — o 503 tem de sair com nada mudado no banco. */
  it('PATCH com nome, codigo e volumes: o 503 sai ANTES de gravar nome e codigo', async () => {
    const res = await pedir({ metodo: 'PATCH', id: PRODUTO, corpo: { nome: 'Rack C', codigo: 'X1', volumes: 2 } });
    expect(res.codigo).toBe(503);
    expect(res.corpo.erro).toMatch(/produtos\.volumes/);
    // A unica escrita tentada foi a de volumes — a que o banco recusou.
    expect(colunas()).toEqual(['volumes']);
  });
});

describe('API de produtos: ordem das escritas do PATCH', () => {
  beforeEach(() => {
    banco.consultas.length = 0;
    banco.volumesAtual = null;
    banco.semColuna = false;
  });

  it('com a coluna, volumes e gravado primeiro e o resto vem depois', async () => {
    const res = await pedir({
      metodo: 'PATCH', id: PRODUTO, corpo: { nome: 'Rack C', codigo: 'X1', ativo: true, volumes: 2 },
    });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['volumes', 'nome', 'codigo', 'ativo']);
  });
});
