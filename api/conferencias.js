/**
 * Conferencias rapidas — leitura para relatorio, arquivamento e exclusao.
 *
 * A ESCRITA nao acontece aqui: conferencia nasce no aparelho e sobe pela
 * fila offline em /api/sync, com client_id idempotente — o mesmo caminho
 * dos ciclos.
 *
 * Arquivar x excluir segue a mesma logica do estudo, e pelo mesmo motivo:
 *  - ARQUIVAR tira a conferencia dos calculos sem apagar nada. E' o caso
 *    da medicao atipica (turno interrompido, lote de teste) — o numero e'
 *    real, mas nao descreve o ritmo do posto. Setup no meio do periodo
 *    deixou de ser motivo para arquivar: agora ele se MARCA como parada
 *    (PATCH com `paradas`) e sai da conta sem descartar a medicao.
 *  - EXCLUIR e' para o registro ERRADO: hora digitada errada, teste do
 *    proprio analista. Ai nao ha o que preservar, e manter lixo no
 *    relatorio custa mais que apagar.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { paradasDaConferencia, texto, uuid } from './_lib/validar.js';

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
      SELECT id, maquina, peca, hora_inicial, hora_final, duracao_ms, pecas, paradas, salvo_em, arquivada
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
    SELECT id, duracao_ms FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
  if (!existe) throw naoEncontrado('Conferencia nao encontrada');

  if (req.method === 'PATCH') {
    const corpo = await lerCorpo(req);
    const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (!tem('arquivada') && !tem('paradas')) {
      throw erroValidacao('Nada a atualizar: informe "arquivada" ou "paradas"');
    }

    // Paradas cadastradas no PC: o analista marcou o setup depois, olhando
    // o apontamento. Mesmo formato do que sobe do aparelho.
    if (tem('paradas')) {
      const paradas = paradasDaConferencia(corpo.paradas, 'conferencia');
      const somaMs = paradas.reduce((acc, p) => acc + p.duracaoMs, 0);
      // Parada nao pode comer o periodo inteiro: sem tempo produtivo nao ha
      // ritmo, e a conferencia sumiria dos calculos sem dizer por que.
      if (somaMs >= Number(existe.duracao_ms)) {
        throw erroValidacao('As paradas somam o periodo inteiro da conferencia — sobraria zero de maquina rodando');
      }
      await sql`
        UPDATE conferencias SET paradas = ${JSON.stringify(paradas)}::jsonb
         WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    }

    if (tem('arquivada')) {
      await sql`
        UPDATE conferencias SET arquivada = ${Boolean(corpo.arquivada)}
         WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    }

    const [linha] = await sql`
      SELECT id, arquivada, paradas FROM conferencias
       WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { conferencia: linha });
  }

  await sql`DELETE FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluida' });
});
