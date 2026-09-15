/**
 * O PATCH de grupo valida TUDO antes de gravar QUALQUER coisa.
 *
 * No modo de servico nao ha' transacao (auth.rls e' `fn(sql)` direto). Se a
 * validacao viesse intercalada com os UPDATEs, um corpo como
 * { nome: "FURADEIRA B", setupMin: 9999 } gravaria o nome, estouraria no
 * setup e deixaria metade da decisao no banco. Aconteceu na revisao da
 * v2.78.0 — duas vezes, em blocos diferentes do mesmo handler.
 *
 * O banco e' dublado: registra as consultas e responde o minimo para o
 * handler andar. A auth tambem: o que se testa aqui e' a ORDEM, nao o
 * acesso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const banco = vi.hoisted(() => ({ consultas: [] }));

vi.mock('../api/_lib/db.js', () => ({ sql: () => Promise.resolve([]) }));
vi.mock('../api/_lib/auth.js', () => {
  const db = (partes, ...valores) => {
    const texto = partes.join('?');
    banco.consultas.push({ texto, valores });
    // O grupo existe nesta empresa; nenhum outro grupo tem o mesmo codigo/nome.
    if (/SELECT id FROM grupos_maquina WHERE id/.test(texto)) return Promise.resolve([{ id: 'g' }]);
    if (/FROM grupos_maquina WHERE id = \?/.test(texto)) return Promise.resolve([{ id: 'g', nome: 'X' }]);
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

const GRUPO = '22222222-2222-4222-8222-222222222222';

function respostaFalsa() {
  const r = { codigo: null, corpo: null, cabecalhos: {} };
  r.status = (c) => { r.codigo = c; return r; };
  r.setHeader = (k, v) => { r.cabecalhos[k] = v; return r; };
  r.end = (txt) => { r.corpo = txt ? JSON.parse(txt) : null; };
  return r;
}

async function patch(corpo) {
  const { default: handler } = await import('../api/maquinas.js');
  const req = { method: 'PATCH', query: { grupo: GRUPO }, body: corpo, headers: {} };
  const res = respostaFalsa();
  await handler(req, res);
  return res;
}

const updates = () => banco.consultas.filter((c) => /UPDATE grupos_maquina/.test(c.texto));

describe('PATCH de grupo: valida antes de gravar', () => {
  beforeEach(() => { banco.consultas.length = 0; });

  it('setup fora da faixa no ultimo campo nao grava os tres primeiros', async () => {
    const res = await patch({ horasSemana: 44, diasSemana: 5, setupsDia: 5, setupMin: 9999 });
    expect(res.codigo).toBe(400);
    expect(updates()).toEqual([]);
  });

  it('nome valido + setup invalido: nem o nome grava', async () => {
    const res = await patch({ nome: 'FURADEIRA B', setupMin: 9999 });
    expect(res.codigo).toBe(400);
    expect(updates()).toEqual([]);
  });

  it('com tudo valido, grava os campos informados — e so eles', async () => {
    const res = await patch({ horasSemana: 44, diasSemana: 5, setupsDia: 5, setupMin: 20 });
    expect(res.codigo).toBe(200);
    const colunas = updates().map((c) => /SET (\w+)/.exec(c.texto)[1]).sort();
    expect(colunas).toEqual(['dias_semana', 'horas_semana', 'setup_min', 'setups_dia']);
  });

  it('campo presente com null APAGA; campo ausente nao mexe', async () => {
    await patch({ setupMin: null });
    const u = updates();
    expect(u.map((c) => /SET (\w+)/.exec(c.texto)[1])).toEqual(['setup_min']);
    expect(u[0].valores).toContain(null);
  });

  it('zero e valido e diferente de nulo', async () => {
    const res = await patch({ setupsDia: 0 });
    expect(res.codigo).toBe(200);
    expect(updates()[0].valores).toContain(0);
  });
});
