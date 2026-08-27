import { autenticar, exigirPapel } from './_lib/auth.js';
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

/**
 * A coluna do analista DIGITADO, descoberta uma vez por instancia.
 *
 * A migracao a renomeia de `analista` para `analista_legado` — e o codigo
 * precisa funcionar dos dois lados desse instante, porque deploy e migracao
 * nao acontecem no mesmo segundo. Some quando a coluna sair de vez (so'
 * depois de os estudos antigos estarem ligados ao cadastro).
 */
let colunaTexto = null;
async function colunaAnalistaTexto(db) {
  if (!colunaTexto) {
    const [c] = await db`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'estudos'
         AND column_name IN ('analista_legado', 'analista')
       ORDER BY column_name DESC LIMIT 1`;
    colunaTexto = c?.column_name || 'analista_legado';
  }
  return colunaTexto;
}

/**
 * O nome do analista que a tela e o relatorio mostram: o do cadastro quando
 * o estudo esta' ligado, o texto digitado quando e' estudo antigo.
 */
function comAnalista(linha, cadastrado) {
  const { analista_cadastrado, ...estudo } = linha;
  const digitado = estudo.analista_legado ?? estudo.analista ?? null;
  return {
    ...estudo,
    analista: digitado,
    analista_nome: (cadastrado ?? analista_cadastrado) || digitado || null,
  };
}

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  const id = req.query?.id;

  if (req.method === 'GET') {
    return auth.rls(async (db) => {
      if (id) return json(res, 200, await carregarEstudo(db, uuid(id, 'id'), empresaId));
      // ?arquivados=1 inverte o filtro. Sem isso, arquivar era via de mao
      // unica: o estudo sumia da lista e nao havia como reve-lo pelo app.
      const soArquivados = String(req.query?.arquivados ?? '') === '1';
      const linhas = await db`
        SELECT e.*, u.nome AS analista_cadastrado,
               (SELECT count(*) FROM operacoes o WHERE o.estudo_id = e.id) AS total_operacoes,
               (SELECT count(*) FROM observacoes ob
                  JOIN operacoes o2 ON o2.id = ob.operacao_id
                 WHERE o2.estudo_id = e.id AND NOT ob.descartada) AS total_observacoes
          FROM estudos e
          LEFT JOIN usuarios u ON u.id = e.analista_id
         WHERE e.empresa_id = ${empresaId}
           ${soArquivados ? db`AND e.status = 'arquivado'` : db`AND e.status <> 'arquivado'`}
         ORDER BY e.atualizado_em DESC
         LIMIT 200`;
      return json(res, 200, { estudos: linhas.map((l) => comAnalista(l)) });
    });
  }

  if (req.method === 'POST') {
    exigirPapel(auth, ['admin', 'analista', 'coletor']);
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
      // O texto continua sendo aceito e gravado (na coluna de legado): e' o
      // que a importacao de roteiro traz e o que sobra de rastro se o
      // cadastro mudar um dia. O vinculo de verdade e' analistaId.
      analista: texto(c.analista, 'analista', { max: 200 }),
      analistaId: c.analistaId ? uuid(c.analistaId, 'analistaId') : null,
      setor: texto(c.setor, 'setor', { max: 120 }),
      recurso: texto(c.recurso, 'recurso', { max: 120 }),
      dataEstudo: dataIso(c.dataEstudo, 'dataEstudo', { padrao: new Date().toISOString() }),
      toleranciaPct: decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100, padrao: 15 }),
      metaObs: inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000, padrao: 10 }),
      taktTimeMs: inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000, padrao: null }),
    };

    // Autoria e' de PESSOA: estudo criado no tablet pareado fica sem
    // criado_por — o aparelho nao e' quem decidiu criar o estudo.
    const autorId = auth.papel === 'coletor' ? null : auth.usuario?.id ?? null;

    // Estudo e operacoes gravam na MESMA transacao: importar um roteiro pela
    // metade deixaria um estudo capenga que o usuario teria de apagar a mao.
    const resultado = await auth.rls(async (db) => {
      const coluna = await colunaAnalistaTexto(db);
      const [estudo] = await db`
        INSERT INTO estudos (empresa_id, nome, produto, ${db(coluna)}, analista_id, criado_por,
                             setor, recurso, data_estudo, tolerancia_pct, meta_obs, takt_time_ms)
        VALUES (${empresaId}, ${valores.nome}, ${valores.produto}, ${valores.analista},
                ${valores.analistaId}, ${autorId},
                ${valores.setor}, ${valores.recurso}, ${valores.dataEstudo},
                ${valores.toleranciaPct}, ${valores.metaObs}, ${valores.taktTimeMs})
        RETURNING *`;

      const criadas = [];
      for (const op of operacoes) {
        const [criada] = await db`
          INSERT INTO operacoes (estudo_id, nome, descricao, fr_pct, ciclos_por_peca, ordem)
          VALUES (${estudo.id}, ${op.nome}, ${op.descricao}, ${op.frPct},
                  ${op.ciclosPorPeca}, ${op.ordem})
          RETURNING *`;
        criadas.push(criada);
      }
      return { estudo: comAnalista(estudo), operacoes: criadas };
    });

    return json(res, 201, resultado);
  }

  if (req.method === 'PATCH') {
    exigirPapel(auth, ['admin', 'analista', 'coletor']);
    const estudoId = uuid(id, 'id');
    const c = await lerCorpo(req);
    return auth.rls(async (db) => {
      await garantirEstudo(db, estudoId, empresaId);
      const coluna = await colunaAnalistaTexto(db);
      const [estudo] = await db`
        UPDATE estudos SET
          nome           = COALESCE(${texto(c.nome, 'nome', { max: 200 })}, nome),
          produto        = COALESCE(${texto(c.produto, 'produto', { max: 200 })}, produto),
          ${db(coluna)}  = COALESCE(${texto(c.analista, 'analista', { max: 200 })}, ${db(coluna)}),
          analista_id    = COALESCE(${c.analistaId ? uuid(c.analistaId, 'analistaId') : null}, analista_id),
          setor          = COALESCE(${texto(c.setor, 'setor', { max: 120 })}, setor),
          recurso        = COALESCE(${texto(c.recurso, 'recurso', { max: 120 })}, recurso),
          tolerancia_pct = COALESCE(${decimal(c.toleranciaPct, 'toleranciaPct', { min: 0, max: 100 })}, tolerancia_pct),
          meta_obs       = COALESCE(${inteiro(c.metaObs, 'metaObs', { min: 0, max: 10000 })}, meta_obs),
          takt_time_ms   = COALESCE(${inteiro(c.taktTimeMs, 'taktTimeMs', { min: 1, max: 86400000 })}, takt_time_ms),
          status         = COALESCE(${statusEstudo(c.status)}, status)
        WHERE id = ${estudoId} AND empresa_id = ${empresaId}
        RETURNING *`;
      return json(res, 200, { estudo: comAnalista(estudo) });
    });
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
  // (A politica de RLS repete esta regra: apagar estudo com ciclo, so' o
  // administrador.)
  //
  // ?definitivo=1 e' a exceccao DELIBERADA: apaga de vez mesmo com ciclos.
  // Existe para o estudo de TESTE, que arquivado vira lixo eterno. So' o
  // administrador, e so' a partir da lista de arquivados no PC — o tablet
  // nem conhece o parametro.
  const definitivo = String(req.query?.definitivo ?? '') === '1';
  exigirPapel(auth, definitivo ? ['admin'] : ['admin', 'analista', 'coletor'],
    definitivo ? 'Excluir de vez e decisao do administrador' : undefined);

  // O TABLET NUNCA APAGA — nem estudo sem ciclo nenhum.
  //
  // A regra de baixo (sem ciclo, apaga) foi escrita pensando no rascunho
  // que o proprio analista cria e desfaz no PC. No tablet ela dava outra
  // coisa: o analista monta o estudo (operacoes, fator de ritmo, meta,
  // roteiro do ERP) e manda para o posto ANTES da primeira cronometragem —
  // e ali, com zero ciclos, um toque no botao de remover apagava o preparo
  // inteiro, sem volta. Sem ciclo nao quer dizer sem trabalho.
  //
  // Para o coletor, remover ARQUIVA sempre: o estudo sai da lista do posto
  // e continua no banco. Quem decide o fim dele e' o analista, no PC. A
  // politica estudos_apaga (db/schema.sql) repete esta regra no banco.
  const soArquiva = auth.papel === 'coletor';
  const estudoId = uuid(id, 'id');
  return auth.rls(async (db) => {
    await garantirEstudo(db, estudoId, empresaId);

    const [{ n: ciclos }] = await db`
      SELECT count(*)::int AS n
        FROM observacoes o
        JOIN operacoes op ON op.id = o.operacao_id
       WHERE op.estudo_id = ${estudoId}`;

    if ((ciclos > 0 || soArquiva) && !definitivo) {
      await db`
        UPDATE estudos SET status = 'arquivado'
         WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
      return json(res, 200, { acao: 'arquivado', ciclos });
    }

    // ON DELETE CASCADE cuida de operacoes, ciclos e paradas.
    await db`DELETE FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { acao: 'excluido', ciclos });
  });
});

async function garantirEstudo(db, estudoId, empresaId) {
  const [e] = await db`SELECT id FROM estudos WHERE id = ${estudoId} AND empresa_id = ${empresaId}`;
  if (!e) throw naoEncontrado('Estudo nao encontrado');
  return e;
}

/** Estudo completo com operacoes, ciclos e paradas — payload da tela de analise. */
async function carregarEstudo(db, estudoId, empresaId) {
  const [linha] = await db`
    SELECT e.*, u.nome AS analista_cadastrado
      FROM estudos e
      LEFT JOIN usuarios u ON u.id = e.analista_id
     WHERE e.id = ${estudoId} AND e.empresa_id = ${empresaId}`;
  if (!linha) throw naoEncontrado('Estudo nao encontrado');

  const operacoes = await db`
    SELECT * FROM operacoes WHERE estudo_id = ${estudoId} ORDER BY ordem, criado_em`;

  const ids = operacoes.map((o) => o.id);
  const observacoes = ids.length
    ? await db`SELECT * FROM observacoes WHERE operacao_id = ANY(${ids}) ORDER BY coletado_em`
    : [];
  const paradas = ids.length
    ? await db`SELECT * FROM paradas WHERE operacao_id = ANY(${ids}) ORDER BY iniciado_em`
    : [];

  return {
    estudo: comAnalista(linha),
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
