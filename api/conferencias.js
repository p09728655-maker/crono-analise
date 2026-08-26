/**
 * Leitura das conferencias rapidas para relatorio.
 *
 * A escrita NAO acontece aqui: conferencia nasce no aparelho e sobe pela
 * fila offline em /api/sync, com client_id idempotente — o mesmo caminho
 * dos ciclos. Este endpoint so' serve o relatorio do PC: a lista bruta,
 * mais recente primeiro, com filtro opcional por maquina.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { handler, json, permitir } from './_lib/http.js';
import { texto } from './_lib/validar.js';

const MAX_LINHAS = 1000;

export default handler(async (req, res) => {
  permitir(req, ['GET']);
  const { empresaId } = await autenticar(req);

  const maquina = texto(req.query?.maquina, 'maquina', { max: 120 });

  const linhas = await sql`
    SELECT id, maquina, peca, hora_inicial, hora_final, duracao_ms, pecas, salvo_em
      FROM conferencias
     WHERE empresa_id = ${empresaId}
       ${maquina ? sql`AND maquina = ${maquina}` : sql``}
     ORDER BY salvo_em DESC
     LIMIT ${MAX_LINHAS}`;

  return json(res, 200, { conferencias: linhas });
});
