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

    // As paradas vem da TABELA, montadas no mesmo formato que o app sempre
    // recebeu ({motivo, duracaoMs, observacao}). A tela nao precisa saber
    // que elas deixaram de morar dentro da conferencia.
    const linhas = await sql`
      SELECT c.id, c.maquina, c.peca, c.hora_inicial, c.hora_final,
             c.iniciado_em, c.finalizado_em, c.duracao_ms, c.pecas, c.salvo_em, c.arquivada,
             coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'motivo', p.motivo,
                        'duracaoMs', p.duracao_ms,
                        'observacao', p.observacao
                      ) ORDER BY p.iniciado_em, p.criado_em)
                 FROM paradas p WHERE p.conferencia_id = c.id
             ), '[]'::jsonb) AS paradas
        FROM conferencias c
       WHERE c.empresa_id = ${empresaId}
         AND c.arquivada = ${soArquivadas}
         ${maquina ? sql`AND c.maquina = ${maquina}` : sql``}
       ORDER BY c.salvo_em DESC
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
    SELECT id, duracao_ms, iniciado_em, salvo_em
      FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
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
      /**
       * A lista vai INTEIRA: apaga e regrava, numa transacao so'. E' o
       * estado final das paradas daquela conferencia, nao um acrescimo —
       * assim corrigir e apagar usam o mesmo caminho, como sempre usaram
       * quando isso era um jsonb.
       *
       * A coluna jsonb nao e' mais escrita: a tabela e a fonte oficial, e
       * manter as duas em dia so' recriaria a duplicidade que esta mudanca
       * veio resolver. A coluna sai no passo 3 da migracao.
       */
      await sql.begin(async (tx) => {
        await tx`DELETE FROM paradas WHERE conferencia_id = ${conferenciaId}`;
        for (const p of paradas) {
          await tx`
            INSERT INTO paradas (client_id, conferencia_id, motivo, observacao, duracao_ms, iniciado_em)
            VALUES (${crypto.randomUUID()}, ${conferenciaId}, ${p.motivo},
                    ${p.observacao}, ${p.duracaoMs}, ${existe.iniciado_em || existe.salvo_em})`;
        }
      });
    }

    if (tem('arquivada')) {
      await sql`
        UPDATE conferencias SET arquivada = ${Boolean(corpo.arquivada)}
         WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    }

    const [linha] = await sql`
      SELECT c.id, c.arquivada,
             coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'motivo', p.motivo,
                        'duracaoMs', p.duracao_ms,
                        'observacao', p.observacao
                      ) ORDER BY p.iniciado_em, p.criado_em)
                 FROM paradas p WHERE p.conferencia_id = c.id
             ), '[]'::jsonb) AS paradas
        FROM conferencias c
       WHERE c.id = ${conferenciaId} AND c.empresa_id = ${empresaId}`;
    return json(res, 200, { conferencia: linha });
  }

  await sql`DELETE FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluida' });
});
