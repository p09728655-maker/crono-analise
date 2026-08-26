import { sql } from './_lib/db.js';
import { autenticar, usuarioDaSessao } from './_lib/auth.js';
import { erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { dataIso, decimal, inteiro, lista, texto, uuid } from './_lib/validar.js';

/**
 * Status do estudo, espelhando o CHECK do schema.
 *
 * Sem esta checagem um status invalido so' explodia no Postgres, e o
 * usuario recebia 500 sem saber o que fazer.
 */
const STATUS = ['coletando', 'concluido', 'arquivado'];

function statusEstudo(valor) {
  const s = texto(valor, 'status', { max: 20 });
  if (s == null) return null;
  if (!STATUS.includes(s)) {
    throw erroValidacao(`Campo "status" deve ser um de: ${STATUS.join(', ')}`);
  }
  return s;
}

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);
  const id = req.query?.id;
  // Quem esta no PC, quando da' para saber. Nunca barra ninguem — ver
  // api/_lib/senha.js.
  const eu = await usuarioDaSessao(req, empresaId);

  if (req.method === 'GET') {
    if (id) return json(res, 200, await carregarEstudo(uuid(id, 'id'), empresaId));
    // ?arquivados=1 inverte o filtro. Sem isso, arquivar era via de mao
    // unica: o estudo sumia da lista e nao havia como reve-lo pelo app.
    const soArquivados = String(req.query?.arquivados ?? '') === '1';
    const estudos = await sql`
      SELECT e.id, e.nome, e.produto, e.analista, e.analista_id,
             coalesce(u.nome, e.analista) AS analista_nome,
             e.setor, e.recurso, e.data_estudo,
             e.tolerancia_pct, e.meta_obs, e.takt_time_ms, e.status, e.atualizado_em,
             (SELECT count(*) FROM operacoes o WHERE o.estudo_id = e.id) AS total_operacoes,
             (SELECT count(*) FROM observacoes ob
                JOIN operacoes o2 ON o2.id = ob.operacao_id
               WHERE o2.estudo_id = e.id AND NOT ob.descartada) AS total_observacoes
        FROM estudos e
        LEFT JOIN usuarios u ON u.id = e.analista_id
       WHERE e.empresa_id = ${empresaId}
         ${soArquivados ? sql`AND e.status = 'arquivado'` : sql`AND e.status <> 'arquivado'`}
       ORDER BY e.atualizado_em DESC
       LIMIT 200`;
    return json(res, 200, { estudos });
  }

  if (req.method === 'POST') {
    const c = await lerCorpo(req);

    // Operacoes aninhadas (importacao de roteiro do ERP): validadas ANTES
    // da transacao, para nao abrir transacao que vai dar rollback.
    const operacoes = lista(c.operacoes || [], 'operacoes', { max: 100 }).map((op, i) => ({
      nome: texto(op.nome, `operacoes[${i}].nome`, { obrigatorio: true, max: 200 }),
      descricao: texto(op.descricao, `operacoes[${i}].descricao`, { max: 1000 }),
      frPct: decimal(op.frPct, `operacoes[${i}].frPct`, { min: 1, max: 200, padrao: 100 }),
      ciclosPorPeca: inteiro(op.ciclosPorPeca, `operacoes[${i}].ciclosPorPeca`, { min: 1, max: 999, padrao: 1 }),
      ordem: inteiro(op.ordem, `operacoes[${i}].ordem`, { min: 0, max: 9999, padrao: i }),
    }));

    const valores = {
      nome: texto(c.nome, 'nome', { obrigatorio: true, max: 200 }),
      produto: texto(c.produto, 'produto', { max: 200 }),
      analista: texto(c.analista, 'analista', { max: 200 }),
      // O vinculo com o cadastro. O texto continua indo junto: e' o que
      // aparece no relatorio impresso de estudo antigo e o que sobra se o
      // analista for excluido do cadastro um dia.
      analistaId: c.analistaId ? uuid(c.analistaId, 'analistaId') : null,
      setor: texto(c.setor, 'setor', { max: 120 }),
      recurso: texto(c.recurso, 'recurso', { max: 120 }),
      dataEstudo: dataIso(c.dataEstudo, 'dataEstudo', { padrao: new Date().toISOString() }),
      toleranciaPct: decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100, padrao: 15 }),
      metaObs: inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000, padrao: 10 }),
      taktTimeMs: inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000, padrao: null }),
    };

    // Estudo e operacoes gravam na MESMA transacao: importar um roteiro pela
    // metade deixaria um estudo capenga que o usuario teria de apagar a mao.
    const resultado = await sql.begin(async (tx) => {
      const [estudo] = await tx`
        INSERT INTO estudos (empresa_id, nome, produto, analista, analista_id, criado_por,
                             setor, recurso, data_estudo, tolerancia_pct, meta_obs, takt_time_ms)
        VALUES (${empresaId}, ${valores.nome}, ${valores.produto}, ${valores.analista},
                ${valores.analistaId}, ${eu?.id ?? null},
                ${valores.setor}, ${valores.recurso}, ${valores.dataEstudo},
                ${valores.toleranciaPct}, ${valores.metaObs}, ${valores.taktTimeMs})
        RETURNING *`;

      const criadas = [];
      for (const op of operacoes) {
        const [criada] = await tx`
          INSERT INTO operacoes (estudo_id, nome, descricao, fr_pct, ciclos_por_peca, ordem)
          VALUES (${estudo.id}, ${op.nome}, ${op.descricao}, ${op.frPct},
                  ${op.ciclosPorPeca}, ${op.ordem})
          RETURNING *`;
        criadas.push(criada);
      }
      return { estudo, operacoes: criadas };
    });

    return json(res, 201, resultado);
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
        analista_id    = COALESCE(${c.analistaId ? uuid(c.analistaId, 'analistaId') : null}, analista_id),
        setor          = COALESCE(${texto(c.setor, 'setor', { max: 120 })}, setor),
        recurso        = COALESCE(${texto(c.recurso, 'recurso', { max: 120 })}, recurso),
        tolerancia_pct = COALESCE(${decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100 })}, tolerancia_pct),
        meta_obs       = COALESCE(${inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000 })}, meta_obs),
        takt_time_ms   = COALESCE(${inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000 })}, takt_time_ms),
        status         = COALESCE(${statusEstudo(c.status)}, status)
      WHERE id = ${estudoId} AND empresa_id = ${empresaId}
      RETURNING *`;
    return json(res, 200, { estudo });
  }

  // DELETE se comporta de dois jeitos, conforme o que ha' a perder.
  //
  // Estudo COM ciclos coletados e' arquivado, nunca apagado: aquele dado
  // sustenta decisao de dimensionamento de mao de obra e ninguem vai
  // cronometrar as pecas de novo. Um toque errado no tablet nao pode
  // destruir isso.
  //
  // Estudo SEM nenhum ciclo e' apagado de verdade. Nao ha' nada a preservar,
  // e deixar rascunho e teste acumulando na lista atrapalha quem trabalha.
  const estudoId = uuid(id, 'id');
  await garantirEstudo(estudoId, empresaId);

  const [{ n: ciclos }] = await sql`
    SELECT count(*)::int AS n
      FROM observacoes o
      JOIN operacoes op ON op.id = o.operacao_id
     WHERE op.estudo_id = ${estudoId}`;

  if (ciclos > 0) {
    await sql`
      UPDATE estudos SET status = 'arquivado'
       WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { acao: 'arquivado', ciclos });
  }

  // ON DELETE CASCADE cuida de operacoes e paradas.
  await sql`DELETE FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluido', ciclos: 0 });
});

async function garantirEstudo(estudoId, empresaId) {
  const [e] = await sql`SELECT id FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!e) throw naoEncontrado('Estudo nao encontrado');
  return e;
}

/** Estudo completo com operacoes, ciclos e paradas — payload da tela de analise. */
async function carregarEstudo(estudoId, empresaId) {
  // analista_nome resolve o vinculo quando ha' um, e cai no texto digitado
  // quando o estudo e' antigo — a tela e o relatorio impresso leem so' ele.
  const [estudo] = await sql`
    SELECT e.*, coalesce(u.nome, e.analista) AS analista_nome
      FROM estudos e
      LEFT JOIN usuarios u ON u.id = e.analista_id
     WHERE e.id = ${estudoId} AND e.empresa_id = ${empresaId}`;
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
