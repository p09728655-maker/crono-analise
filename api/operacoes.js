import { autenticar, exigirPapel } from './_lib/auth.js';
import { handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { decimal, inteiro, texto, uuid } from './_lib/validar.js';

export default handler(async (req, res) => {
  permitir(req, ['POST', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  // Operacao e' estrutura do estudo: quem coleta tambem monta (o roteiro
  // nasce no tablet, diante da maquina). Leitor so' le.
  exigirPapel(auth, ['admin', 'analista', 'coletor']);

  if (req.method === 'POST') {
    const c = await lerCorpo(req);
    const estudoId = uuid(c.estudoId, 'estudoId');
    return auth.rls(async (db) => {
      await garantirEstudoDaEmpresa(db, estudoId, empresaId);
      const [operacao] = await db`
        INSERT INTO operacoes (estudo_id, nome, descricao, fr_pct, ciclos_por_peca, ordem)
        VALUES (${estudoId},
                ${texto(c.nome, 'nome', { obrigatorio: true, max: 200 })},
                ${texto(c.descricao, 'descricao', { max: 1000 })},
                ${decimal(c.frPct, 'frPct', { min: 1, max: 200, padrao: 100 })},
                ${inteiro(c.ciclosPorPeca, 'ciclosPorPeca', { min: 1, max: 999, padrao: 1 })},
                ${inteiro(c.ordem, 'ordem', { min: 0, max: 9999, padrao: 0 })})
        RETURNING *`;
      return json(res, 201, { operacao });
    });
  }

  const operacaoId = uuid(req.query?.id, 'id');

  if (req.method === 'PATCH') {
    const c = await lerCorpo(req);
    return auth.rls(async (db) => {
      await garantirOperacaoDaEmpresa(db, operacaoId, empresaId);
      const [operacao] = await db`
        UPDATE operacoes SET
          nome      = COALESCE(${texto(c.nome, 'nome', { max: 200 })}, nome),
          descricao = COALESCE(${texto(c.descricao, 'descricao', { max: 1000 })}, descricao),
          fr_pct    = COALESCE(${decimal(c.frPct, 'frPct', { min: 1, max: 200 })}, fr_pct),
          ciclos_por_peca = COALESCE(${inteiro(c.ciclosPorPeca, 'ciclosPorPeca', { min: 1, max: 999 })}, ciclos_por_peca),
          ordem     = COALESCE(${inteiro(c.ordem, 'ordem', { min: 0, max: 9999 })}, ordem)
        WHERE id = ${operacaoId}
        RETURNING *`;
      return json(res, 200, { operacao });
    });
  }

  return auth.rls(async (db) => {
    await garantirOperacaoDaEmpresa(db, operacaoId, empresaId);
    await db`DELETE FROM operacoes WHERE id = ${operacaoId}`;
    return json(res, 200, { removido: true });
  });
});

async function garantirEstudoDaEmpresa(db, estudoId, empresaId) {
  const [e] = await db`SELECT id FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!e) throw naoEncontrado('Estudo nao encontrado');
}

async function garantirOperacaoDaEmpresa(db, operacaoId, empresaId) {
  const [o] = await db`
    SELECT o.id FROM operacoes o
      JOIN estudos e ON e.id = o.estudo_id
     WHERE o.id = ${operacaoId} AND e.empresa_id = ${empresaId}`;
  if (!o) throw naoEncontrado('Operacao nao encontrada');
}
