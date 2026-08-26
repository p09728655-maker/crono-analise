/**
 * Conferencias rapidas — leitura para relatorio, arquivamento e exclusao.
 *
 * A ESCRITA nao acontece aqui: conferencia nasce no aparelho e sobe pela
 * fila offline em /api/sync, com client_id idempotente — o mesmo caminho
 * dos ciclos.
 *
 * Arquivar x excluir segue a mesma logica do estudo, e pelo mesmo motivo:
 *  - ARQUIVAR tira a conferencia dos calculos sem apagar nada. E' o caso
 *    da medicao atipica (setup no meio do periodo, turno interrompido) —
 *    o numero e' real, mas nao descreve o ritmo do posto.
 *  - EXCLUIR e' para o registro ERRADO: hora digitada errada, teste do
 *    proprio analista. Ai nao ha o que preservar, e manter lixo no
 *    relatorio custa mais que apagar.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { texto, uuid } from './_lib/validar.js';

const MAX_LINHAS = 1000;

export default handler(async (req, res) => {
  permitir(req, ['GET', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);
  const id = req.query?.id;

  if (req.method === 'GET') {
    const maquina = texto(req.query?.maquina, 'maquina', { max: 120 });
    // ?arquivadas=1 inverte o filtro, como na lista de estudos.
    const soArquivadas = String(req.query?.arquivadas ?? '') === '1';

    const linhas = await sql`
      SELECT id, maquina, peca, hora_inicial, hora_final, duracao_ms, pecas, salvo_em, arquivada
        FROM conferencias
       WHERE empresa_id = ${empresaId}
         AND arquivada = ${soArquivadas}
         ${maquina ? sql`AND maquina = ${maquina}` : sql``}
       ORDER BY salvo_em DESC
       LIMIT ${MAX_LINHAS}`;

    // A contagem do outro lado vem junto: a tela precisa saber se existe
    // arquivada para oferecer o botao, sem uma segunda requisicao.
    const [outro] = await sql`
      SELECT count(*)::int AS n FROM conferencias
       WHERE empresa_id = ${empresaId} AND arquivada = ${!soArquivadas}`;

    return json(res, 200, { conferencias: linhas, outras: outro.n });
  }

  const conferenciaId = uuid(id, 'id');
  const [existe] = await sql`
    SELECT id FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
  if (!existe) throw naoEncontrado('Conferencia nao encontrada');

  if (req.method === 'PATCH') {
    const corpo = await lerCorpo(req);
    const arquivada = Boolean(corpo.arquivada);
    const [linha] = await sql`
      UPDATE conferencias SET arquivada = ${arquivada}
       WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
       RETURNING id, arquivada`;
    return json(res, 200, { conferencia: linha });
  }

  await sql`DELETE FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluida' });
});
