/**
 * O PATCH de MAQUINA com o ritmo nominal do fabricante: valida tudo antes
 * de gravar qualquer coisa (a mesma regra do PATCH de grupo), nulo apaga,
 * e a fonte so' existe junto do numero.
 *
 * Banco e auth dublados, como em maquinas-grupo-patch: o que se testa e' a
 * ORDEM e o que vai para o UPDATE, nao o acesso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({ consultas: [], nominalAtual: null }));

vi.mock('../api/_lib/db.js', () => ({ sql: () => Promise.resolve([]) }));
vi.mock('../api/_lib/auth.js', () => {
  const db = (partes, ...valores) => {
    const texto = partes.join('?');
    banco.consultas.push({ texto, valores });
    if (/SELECT id FROM maquinas WHERE id/.test(texto)) return Promise.resolve([{ id: 'm' }]);
    if (/SELECT nominal_ciclos_min FROM maquinas/.test(texto)) {
      return Promise.resolve([{ nominal_ciclos_min: banco.nominalAtual }]);
    }
    if (/SELECT m\.id/.test(texto)) return Promise.resolve([{ id: 'm', nome: 'FURADEIRA 16' }]);
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

const MAQUINA = '33333333-3333-4333-8333-333333333333';

function respostaFalsa() {
  const r = { codigo: null, corpo: null, cabecalhos: {} };
  r.status = (c) => { r.codigo = c; return r; };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; return r; };
  r.end = (txt) => { r.corpo = txt ? JSON.parse(txt) : null; };
  return r;
}

async function patch(corpo) {
  const { default: handler } = await import('../api/maquinas.js');
  const req = { method: 'PATCH', query: { id: MAQUINA }, body: corpo, headers: {} };
  const res = respostaFalsa();
  await handler(req, res);
  return res;
}

const updates = () => banco.consultas.filter((c) => /UPDATE maquinas/.test(c.texto));
const colunas = () => updates().map((c) => /SET (\w+)/.exec(c.texto)[1]);

describe('PATCH de maquina: ritmo nominal do fabricante', () => {
  beforeEach(() => { banco.consultas.length = 0; banco.nominalAtual = null; });

  it('grava o nominal e a fonte, e so eles', async () => {
    const res = await patch({ nominalCiclosMin: 15, nominalFonte: '  Catálogo   2019 ' });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['nominal_ciclos_min', 'nominal_fonte']);
    expect(updates()[0].valores).toContain(15);
    expect(updates()[1].valores).toContain('Catálogo 2019');
  });

  // Pela tela isso nao chega: o formulario barra antes (nominal.js). Aqui
  // e' a API chamada direto — ela tambem nao pode gravar.
  it('texto que nao e numero, chamado direto na API, e recusado sem gravar nada', async () => {
    const res = await patch({ nome: 'FURADEIRA 16', nominalCiclosMin: 'quinze' });
    expect(res.codigo).toBe(400);
    expect(updates()).toEqual([]);
  });

  it('nominal fora da faixa nao grava nem o nome que veio junto', async () => {
    const res = await patch({ nome: 'FURADEIRA 16', nominalCiclosMin: 0 });
    expect(res.codigo).toBe(400);
    expect(updates()).toEqual([]);
  });

  it('nulo APAGA o nominal e leva a fonte junto', async () => {
    const res = await patch({ nominalCiclosMin: null });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['nominal_ciclos_min', 'nominal_fonte']);
    expect(updates()[0].valores).toContain(null);
    expect(updates()[1].valores).toContain(null);
  });

  it('fonte sem nominal (nem no corpo nem no banco) e recusada', async () => {
    const res = await patch({ nominalFonte: 'Catálogo' });
    expect(res.codigo).toBe(400);
    expect(updates()).toEqual([]);
  });

  it('fonte sozinha vale quando o banco ja tem o nominal', async () => {
    banco.nominalAtual = 15;
    const res = await patch({ nominalFonte: 'Manual SCM' });
    expect(res.codigo).toBe(200);
    expect(colunas()).toEqual(['nominal_fonte']);
  });

  it('a resposta traz o nominal junto com a maquina', async () => {
    const res = await patch({ nominalCiclosMin: 12.5 });
    expect(res.codigo).toBe(200);
    const final = banco.consultas.find((c) => /SELECT m\.id/.test(c.texto));
    expect(final.texto).toMatch(/nominal_ciclos_min/);
  });
});
