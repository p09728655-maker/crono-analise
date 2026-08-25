import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { decimal, inteiro, texto, uuid } from './_lib/validar.js';

export default handler(async (req, res) => {
  permitir(req, ['POST', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);

  if (req.method === 'POST') {
    const c = await lerCorpo(req);
    const estudoId = uuid(c.estudoId, 'estudoId');
    await garantirEstudoDaEmpresa(estudoId, empresaId);
    const [operacao] = await sql`
      INSERT INTO operacoes (estudo_id, nome, descricao, fr_pct, ciclos_por_peca, ordem)
      VALUES (${estudoId},
              ${texto(c.nome, 'nome', { obrigatorio: true, max: 200 })},
              ${texto(c.descricao, 'descricao', { max: 1000 })},
              ${decimal(c.frPct, 'frPct', { min: 1, max: 200, padrao: 100 })},
              ${inteiro(c.ciclosPorPeca, 'ciclosPorPeca', { min: 1, max: 999, padrao: 1 })},
              ${inteiro(c.ordem, 'ordem', { min: 0, max: 9999, padrao: 0 })})
      RETURNING *`;
    return json(res, 201, { operacao });
  }

  const operacaoId = uuid(req.query?.id, 'id');
  await garantirOperacaoDaEmpresa(operacaoId, empresaId);

  if (req.method === 'PATCH') {
    const c = await lerCorpo(req);
    const [operacao] = await sql`
      UPDATE operacoes SET
        nome      = COALESCE(${texto(c.nome, 'nome', { max: 200 })}, nome),
        descricao = COALESCE(${texto(c.descricao, 'descricao', { max: 1000 })}, descricao),
        fr_pct    = COALESCE(${decimal(c.frPct, 'frPct', { min: 1, max: 200 })}, fr_pct),
        ciclos_por_peca = COALESCE(${inteiro(c.ciclosPorPeca, 'ciclosPorPeca', { min: 1, max: 999 })}, ciclos_por_peca),
        ordem     = COALESCE(${inteiro(c.ordem, 'ordem', { min: 0, max: 9999 })}, ordem)
      WHERE id = ${operacaoId}
      RETURNING *`;
    return json(res, 200, { operacao });
  }

  await sql`DELETE FROM operacoes WHERE id = ${operacaoId}`;
  return json(res, 200, { removido: true });
});

async function garantirEstudoDaEmpresa(estudoId, empresaId) {
  const [e] = await sql`SELECT id FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!e) throw naoEncontrado('Estudo nao encontrado');
}

async function garantirOperacaoDaEmpresa(operacaoId, empresaId) {
  const [o] = await sql`
    SELECT o.id FROM operacoes o
      JOIN estudos e ON e.id = o.estudo_id
     WHERE o.id = ${operacaoId} AND e.empresa_id = ${empresaId}`;
  if (!o) throw naoEncontrado('Operacao nao encontrada');
}
