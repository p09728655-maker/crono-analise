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
 *    relatorio custa mais que apagar. Apagar medicao e' decisao de
 *    administrador — e' a operacao sem volta deste relatorio.
 *
 * RENOMEAR A PECA e' a terceira escrita daqui, e existe por um motivo de
 * chao de fabrica: o nome da peca e' DIGITADO no aparelho, medicao a
 * medicao. Duas grafias da mesma peca ("Sleep base 380x330x15" e "Sleep
 * base 380x330") viram duas linhas no Ritmo por peca, cada uma com metade
 * das medicoes — e a referencia da peca fica errada nas duas. Corrigir o
 * texto e' o unico jeito de juntar de novo, e vale tanto para UMA medicao
 * quanto para todas as que herdaram a grafia errada (o lote).
 *
 * ARQUIVAR EM LOTE (PATCH sem `id`, com `ids` no corpo) e' o mesmo
 * arquivamento, so' que de varias medicoes numa ida — e' o que sustenta o
 * "arquivar por maquina" do relatorio. Quem decide QUAIS medicoes entram e'
 * a tela, que ja' agrupa por maquina com a chave normalizada; mandar a
 * lista de ids evita que o servidor precise repetir essa normalizacao e
 * garante que o que foi arquivado e' exatamente o que estava na tela.
 */
import { autenticar, exigirPapel } from './_lib/auth.js';
import { erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir, proibido } from './_lib/http.js';
import { lista, paradasDaConferencia, texto, uuid } from './_lib/validar.js';

const MAX_LINHAS = 1000;
// Teto do lote: uma maquina com mais medicoes que isto arquiva em duas
// idas. O limite existe para uma requisicao nao virar uma transacao longa.
const MAX_LOTE = 500;

/**
 * O banco recusou em silencio.
 *
 * UPDATE que nao acha linha nenhuma volta 200 com zero alteracoes — e' o
 * "arquivar nao funciona" mais dificil de diagnosticar, porque nada
 * aparece na tela nem no log. Aqui ele vira uma mensagem que diz o que
 * conferir.
 */
const nadaMudou = () => proibido(
  'O banco nao alterou nenhuma medicao. Confira se o seu usuario esta com papel '
  + 'administrador ou analista nesta empresa — a politica de acesso do banco recusa '
  + 'a alteracao dos demais papeis sem devolver erro.',
);

export default handler(async (req, res) => {
  permitir(req, ['GET', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  const id = req.query?.id;

  if (req.method === 'GET') {
    const maquina = texto(req.query?.maquina, 'maquina', { max: 120 });
    // ?arquivadas=1 inverte o filtro, como na lista de estudos.
    const soArquivadas = String(req.query?.arquivadas ?? '') === '1';

    return auth.rls(async (db) => {
      // As paradas vem da TABELA, montadas no mesmo formato que o app sempre
      // recebeu ({motivo, duracaoMs, observacao}). A tela nao precisa saber
      // que elas deixaram de morar dentro da conferencia.
      const linhas = await db`
        SELECT c.id, c.maquina, c.peca, c.iniciado_em, c.finalizado_em, c.duracao_ms, c.pecas, c.ciclos_por_peca, c.salvo_em, c.arquivada,
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
           ${maquina ? db`AND c.maquina = ${maquina}` : db``}
         ORDER BY c.salvo_em DESC
         LIMIT ${MAX_LINHAS}`;

      // A contagem do outro lado vem junto: a tela precisa saber se existe
      // arquivada para oferecer o botao, sem uma segunda requisicao.
      const [outro] = await db`
        SELECT count(*)::int AS n FROM conferencias
         WHERE empresa_id = ${empresaId} AND arquivada = ${!soArquivadas}`;

      return json(res, 200, { conferencias: linhas, outras: outro.n });
    });
  }

  exigirPapel(auth, req.method === 'DELETE' ? ['admin'] : ['admin', 'analista']);

  // PATCH sem `id` e' o LOTE: arquiva (ou restaura) a lista inteira de uma
  // vez. E' assim que o relatorio arquiva uma maquina — a tela manda os ids
  // das medicoes que estao debaixo daquele nome.
  if (req.method === 'PATCH' && !id) {
    const corpo = await lerCorpo(req);
    const temNoLote = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (!temNoLote('arquivada') && !temNoLote('peca')) {
      throw erroValidacao('Nada a atualizar no lote: informe "arquivada" ou "peca"');
    }
    const ids = lista(corpo.ids, 'ids', { max: MAX_LOTE }).map((x, i) => uuid(x, `ids[${i}]`));
    if (!ids.length) throw erroValidacao('Informe ao menos uma medicao em "ids"');
    // Mesmo teto do que sobe do aparelho: o nome corrigido no PC nao pode
    // ser maior do que o que a coleta aceita.
    const peca = temNoLote('peca') ? texto(corpo.peca, 'peca', { max: 120 }) : null;

    return auth.rls(async (db) => {
      let alteradas = null;
      if (temNoLote('arquivada')) {
        alteradas = await db`
          UPDATE conferencias SET arquivada = ${Boolean(corpo.arquivada)}
           WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}
          RETURNING id`;
      }
      if (temNoLote('peca')) {
        alteradas = await db`
          UPDATE conferencias SET peca = ${peca}
           WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}
          RETURNING id`;
      }
      if (!alteradas.length) throw nadaMudou();
      return json(res, 200, {
        atualizadas: alteradas.length,
        ...(temNoLote('arquivada') ? { arquivada: Boolean(corpo.arquivada) } : {}),
        ...(temNoLote('peca') ? { peca } : {}),
      });
    });
  }

  const conferenciaId = uuid(id, 'id');

  return auth.rls(async (db) => {
    const [existe] = await db`
      SELECT id, duracao_ms, iniciado_em, salvo_em
        FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    if (!existe) throw naoEncontrado('Conferencia nao encontrada');

    if (req.method === 'PATCH') {
      const corpo = await lerCorpo(req);
      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      if (!tem('arquivada') && !tem('paradas') && !tem('peca')) {
        throw erroValidacao('Nada a atualizar: informe "arquivada", "paradas" ou "peca"');
      }
      // Toda validacao ANTES de qualquer escrita: no modo de servico a
      // requisicao nao e' uma transacao, entao recusar no meio deixaria
      // metade gravada. Aqui, o que for recusado e' recusado sem ter
      // escrito nada.
      const pecaNova = tem('peca') ? texto(corpo.peca, 'peca', { max: 120 }) : null;

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
         * A lista vai INTEIRA: apaga e regrava. E' o estado final das
         * paradas daquela conferencia, nao um acrescimo — assim corrigir e
         * apagar usam o mesmo caminho, como sempre usaram quando isso era
         * um jsonb. A requisicao inteira ja' e' uma transacao (auth.rls).
         */
        await db`DELETE FROM paradas WHERE conferencia_id = ${conferenciaId}`;
        for (const p of paradas) {
          await db`
            INSERT INTO paradas (client_id, conferencia_id, motivo, observacao, duracao_ms, iniciado_em)
            VALUES (${crypto.randomUUID()}, ${conferenciaId}, ${p.motivo},
                    ${p.observacao}, ${p.duracaoMs}, ${existe.iniciado_em || existe.salvo_em})`;
        }
      }

      // Correcao do nome digitado no aparelho — ver o cabecalho.
      if (tem('peca')) {
        const alteradas = await db`
          UPDATE conferencias SET peca = ${pecaNova}
           WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
          RETURNING id`;
        if (!alteradas.length) throw nadaMudou();
      }

      if (tem('arquivada')) {
        // RETURNING nao e' enfeite: sem ele, um UPDATE barrado pela politica
        // do banco volta 200 sem ter mudado nada, e o botao "Arquivar" fica
        // com cara de quebrado.
        const alteradas = await db`
          UPDATE conferencias SET arquivada = ${Boolean(corpo.arquivada)}
           WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
          RETURNING id`;
        if (!alteradas.length) throw nadaMudou();
      }

      const [linha] = await db`
        SELECT c.id, c.arquivada, c.peca,
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

    await db`DELETE FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    return json(res, 200, { acao: 'excluida' });
  });
});
