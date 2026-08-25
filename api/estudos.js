import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { dataIso, decimal, inteiro, texto, uuid } from './_lib/validar.js';

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);
  const id = req.query?.id;

  if (req.method === 'GET') {
    if (id) return json(res, 200, await carregarEstudo(uuid(id, 'id'), empresaId));
    const estudos = await sql`
      SELECT e.id, e.nome, e.produto, e.analista, e.setor, e.recurso, e.data_estudo,
             e.tolerancia_pct, e.meta_obs, e.takt_time_ms, e.status, e.atualizado_em,
             (SELECT count(*) FROM operacoes o WHERE o.estudo_id = e.id) AS total_operacoes,
             (SELECT count(*) FROM observacoes ob
                JOIN operacoes o2 ON o2.id = ob.operacao_id
               WHERE o2.estudo_id = e.id AND NOT ob.descartada) AS total_observacoes
        FROM estudos e
       WHERE e.empresa_id = ${empresaId} AND e.status <> 'arquivado'
       ORDER BY e.atualizado_em DESC
       LIMIT 200`;
    return json(res, 200, { estudos });
  }

  if (req.method === 'POST') {
    const c = await lerCorpo(req);
    const [estudo] = await sql`
      INSERT INTO estudos (empresa_id, nome, produto, analista, setor, recurso,
                           data_estudo, tolerancia_pct, meta_obs, takt_time_ms)
      VALUES (${empresaId},
              ${texto(c.nome, 'nome', { obrigatorio: true, max: 200 })},
              ${texto(c.produto, 'produto', { max: 200 })},
              ${texto(c.analista, 'analista', { max: 200 })},
              ${texto(c.setor, 'setor', { max: 120 })},
              ${texto(c.recurso, 'recurso', { max: 120 })},
              ${dataIso(c.dataEstudo, 'dataEstudo', { padrao: new Date().toISOString() })},
              ${decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100, padrao: 15 })},
              ${inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000, padrao: 10 })},
              ${inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000, padrao: null })})
      RETURNING *`;
    return json(res, 201, { estudo });
  }

  if (req.method === 'PATCH') {
    const estudoId = uuid(id, 'id');
    const c = await lerCorpo(req);
    await garantirEstudo(estudoId, empresaId);
    const [estudo] = await sql`
      UPDATE estudos SET
        nome           = COALESCE(${texto(c.nome, 'nome', { max: 200 })}, nome),
        produto        = COALESCE(${texto(c.produto, 'produto', { max: 200 })}, produto),
        analista       = COALESCE(${texto(c.analista, 'analista', { max: 200 })}, analista),
        setor          = COALESCE(${texto(c.setor, 'setor', { max: 120 })}, setor),
        recurso        = COALESCE(${texto(c.recurso, 'recurso', { max: 120 })}, recurso),
        tolerancia_pct = COALESCE(${decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100 })}, tolerancia_pct),
        meta_obs       = COALESCE(${inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000 })}, meta_obs),
        takt_time_ms   = COALESCE(${inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000 })}, takt_time_ms),
        status         = COALESCE(${texto(c.status, 'status', { max: 20 })}, status)
      WHERE id = ${estudoId} AND empresa_id = ${empresaId}
      RETURNING *`;
    return json(res, 200, { estudo });
  }

  // DELETE arquiva em vez de apagar: dado de cronoanalise sustenta decisao de
  // dimensionamento e nao deve sumir por um toque errado no tablet.
  const estudoId = uuid(id, 'id');
  await garantirEstudo(estudoId, empresaId);
  await sql`UPDATE estudos SET status = 'arquivado' WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { arquivado: true });
});

async function garantirEstudo(estudoId, empresaId) {
  const [e] = await sql`SELECT id FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!e) throw naoEncontrado('Estudo nao encontrado');
  return e;
}

/** Estudo completo com operacoes, ciclos e paradas — payload da tela de analise. */
async function carregarEstudo(estudoId, empresaId) {
  const [estudo] = await sql`
    SELECT * FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!estudo) throw naoEncontrado('Estudo nao encontrado');

  const operacoes = await sql`
    SELECT * FROM operacoes WHERE estudo_id = ${estudoId} ORDER BY ordem, criado_em`;

  const ids = operacoes.map((o) => o.id);
  const observacoes = ids.length
    ? await sql`SELECT * FROM observacoes WHERE operacao_id = ANY(${ids}) ORDER BY coletado_em`
    : [];
  const paradas = ids.length
    ? await sql`SELECT * FROM paradas WHERE operacao_id = ANY(${ids}) ORDER BY iniciado_em`
    : [];

  return {
    estudo,
    operacoes: operacoes.map((op) => ({
      ...op,
      // O front espera o formato de dominio: array de duracoes em ms.
      tempos: observacoes.filter((o) => o.operacao_id === op.id && !o.descartada)
                         .map((o) => Number(o.duracao_ms)),
      observacoes: observacoes.filter((o) => o.operacao_id === op.id),
      paradas: paradas.filter((p) => p.operacao_id === op.id)
                      .map((p) => ({ ...p, duracao: Number(p.duracao_ms) })),
    })),
  };
}
