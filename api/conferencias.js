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
 *
 * SALVAR A ANALISE DO PCP (PATCH com `analisada`) e' a quarta escrita: o
 * PCP leu a medicao no PC e registra que leu — quando, quem e, se quiser,
 * a conclusao (`analiseNota`). `analisada: false` reabre: a medicao volta
 * a "a analisar" e a nota fica, para ser corrigida e salva de novo. Nao
 * mexe em numero nenhum; e' o controle do que ainda falta ler.
 *
 * MANDAR AO PAINEL (PATCH ?id=...&painel=1) e' a quinta: a medicao da
 * embalagem, ja' analisada, vai para o painel RitmoPatrimar (o Apps Script
 * da planilha de producao). Grava so' o desfecho (painel_em, painel_erro) —
 * ver mandarAoPainel, abaixo, e api/_lib/painel.js.
 */
import { autenticar, exigirPapel } from './_lib/auth.js';
import {
  ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir, proibido,
} from './_lib/http.js';
import { lista, paradasDaConferencia, texto, uuid } from './_lib/validar.js';
import { listar as listarDemandas } from './_lib/demanda.js';
import {
  MENSAGEM_DESLIGADO, NO_PAINEL, chamarPainel, grupoDaMedicao, montarParaOPainel, motivoParaGravar, painelLigado,
} from './_lib/painel.js';

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
  'Nenhuma medição foi alterada — o seu acesso não permite esta mudança. Peça a um '
  + 'administrador da empresa para colocar o seu usuário como analista ou administrador '
  + 'e tente de novo.',
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

    /**
     * ?resumo=1 — SO' OS CONTADORES.
     *
     * O Inicio precisa dizer quantas medicoes de ritmo existem, e nada
     * mais. Carregar a lista inteira (ate MAX_LINHAS, com as paradas de
     * cada uma em subconsulta) para contar linhas seria trazer megabytes
     * para exibir um numero — e, passado o teto, o numero ainda sairia
     * errado, porque a lista vem cortada e a contagem nao.
     *
     * Dois counts, sem trafego de dado nenhum.
     */
    if (String(req.query?.resumo ?? '') === '1') {
      return auth.rls(async (db) => {
        const [r] = await db`
          SELECT count(*)::int AS medicoes,
                 count(DISTINCT c.maquina)::int AS maquinas
            FROM conferencias c
           WHERE c.empresa_id = ${empresaId} AND c.arquivada = false`;
        return json(res, 200, { medicoes: r.medicoes, maquinas: r.maquinas });
      });
    }

    /**
     * ?id=... — AS MARCAS de UMA medicao, para o quadro volume a volume.
     *
     * Ficam fora da lista de proposito: uma hora de embalagem sao sessenta
     * marcas, mas um posto contado peca a peca passa de mil, e a lista traz
     * ate' MAX_LINHAS medicoes de uma vez para montar o relatorio inteiro.
     * A lista diz so' se ha' marcas (`com_marcas`); o detalhe vem quando
     * alguem abre aquela medicao.
     */
    if (id) {
      uuid(id, 'id');
      return auth.rls(async (db) => {
        const [linha] = await db`
          SELECT c.id, c.marcas_ms, c.marcas_relogio_ms, c.marcas_setup_ms FROM conferencias c
           WHERE c.id = ${id} AND c.empresa_id = ${empresaId}`;
        if (!linha) throw naoEncontrado('Medição não encontrada');
        return json(res, 200, { conferencia: linha });
      });
    }

    return auth.rls(async (db) => {
      // As paradas vem da TABELA, montadas no mesmo formato que o app sempre
      // recebeu ({motivo, duracaoMs, observacao}). A tela nao precisa saber
      // que elas deixaram de morar dentro da conferencia.
      const linhas = await db`
        SELECT c.id, c.maquina, c.peca, c.iniciado_em, c.finalizado_em, c.duracao_ms, c.pecas, c.ciclos_por_peca, c.furacao_passante, c.observacao, c.salvo_em, c.arquivada,
               c.analisada_em, c.analisada_por, c.analise_nota, c.origem,
               c.painel_em, c.painel_erro,
               (c.marcas_ms IS NOT NULL) AS com_marcas,
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

      // `painel.ligado`: a tela so' manda ao painel (e so' diz que o envio
      // esta' desligado) sabendo disto — sem perguntar a cada medicao.
      return json(res, 200, { conferencias: linhas, outras: outro.n, painel: { ligado: painelLigado() } });
    });
  }

  exigirPapel(auth, req.method === 'DELETE' ? ['admin'] : ['admin', 'analista']);

  // PATCH sem `id` e' o LOTE: arquiva (ou restaura) a lista inteira de uma
  // vez. E' assim que o relatorio arquiva uma maquina — a tela manda os ids
  // das medicoes que estao debaixo daquele nome.
  if (req.method === 'PATCH' && !id) {
    const corpo = await lerCorpo(req);
    const temNoLote = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (!temNoLote('arquivada') && !temNoLote('peca') && !temNoLote('analisada')) {
      throw erroValidacao('Nada a atualizar no lote: informe "arquivada", "peca" ou "analisada"');
    }
    const ids = lista(corpo.ids, 'ids', { max: MAX_LOTE }).map((x, i) => uuid(x, `ids[${i}]`));
    if (!ids.length) throw erroValidacao('Informe ao menos uma medicao em "ids"');
    if (temNoLote('analisada')) return analisarLote({ auth, res, corpo, ids });
    /**
     * Mesmo teto do que sobe do aparelho: o nome corrigido no PC nao pode
     * ser maior do que o que a coleta aceita.
     *
     * E' OBRIGATORIO ter nome. `texto()` devolve null para vazio, e sem esta
     * barreira um `peca: ""` — campo limpo na tela, retry que serializa
     * vazio, bundle antigo no tablet — apagava o nome de ate 500 medicoes
     * de uma vez, em silencio, sem volta: a grafia original nao fica
     * guardada em lugar nenhum. Renomear existe para JUNTAR grafias, nunca
     * para apagar o nome da peca.
     */
    const peca = temNoLote('peca')
      ? texto(corpo.peca, 'peca', { obrigatorio: true, max: 120 })
      : null;

    return auth.rls(async (db) => {
      let alteradas = null;
      if (temNoLote('arquivada')) {
        alteradas = await db`
          UPDATE conferencias SET arquivada = ${Boolean(corpo.arquivada)}, editada_em = now()
           WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}
          RETURNING id`;
      }
      if (temNoLote('peca')) {
        alteradas = await db`
          UPDATE conferencias SET peca = ${peca}, editada_em = now()
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

  // Mandar ao painel nao e' editar a medicao: caminho proprio, que nao
  // passa pela marca de editada_em logo abaixo.
  if (req.method === 'PATCH' && String(req.query?.painel ?? '') === '1') {
    return mandarAoPainel({ auth, res, conferenciaId });
  }

  return auth.rls(async (db) => {
    const [existe] = await db`
      SELECT id, duracao_ms, iniciado_em, salvo_em
        FROM conferencias WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}`;
    if (!existe) throw naoEncontrado('Conferencia nao encontrada');

    if (req.method === 'PATCH') {
      const corpo = await lerCorpo(req);
      const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
      if (!tem('arquivada') && !tem('paradas') && !tem('peca') && !tem('analisada')) {
        throw erroValidacao('Nada a atualizar: informe "arquivada", "paradas", "peca" ou "analisada"');
      }
      // Toda validacao ANTES de qualquer escrita: no modo de servico a
      // requisicao nao e' uma transacao, entao recusar no meio deixaria
      // metade gravada. Aqui, o que for recusado e' recusado sem ter
      // escrito nada.
      const pecaNova = tem('peca')
        ? texto(corpo.peca, 'peca', { obrigatorio: true, max: 120 })
        : null;

      // A analise do PCP. Booleano de verdade: com Boolean(), um "false"
      // em texto marcaria a medicao como analisada. A nota so' vai junto
      // de `analisada: true` — sozinha, ou ao reabrir, ela nao teria onde
      // cair sem mudar o estado que a tela mostra.
      if (tem('analisada') && typeof corpo.analisada !== 'boolean') {
        throw erroValidacao('Campo "analisada" deve ser true ou false');
      }
      if (tem('analiseNota') && corpo.analisada !== true) {
        throw erroValidacao('"analiseNota" só vai junto de "analisada": true');
      }
      const analiseNota = corpo.analisada === true
        ? texto(corpo.analiseNota, 'analiseNota', { max: 2000 })
        : null;

      /**
       * Mexida no PC: a medicao por video nao pode mais ser substituida pelo
       * reenvio (ver editada_em no schema). E' a PRIMEIRA escrita, depois de
       * toda validacao: ela trava a linha, e um reenvio do video ao mesmo
       * tempo espera e volta 409 — marcada no fim, o reenvio passava no
       * meio e as paradas do PC e as do video ficavam somadas.
       */
      const marcada = await db`
        UPDATE conferencias SET editada_em = now()
         WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
        RETURNING id`;
      if (!marcada.length) throw nadaMudou();

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

      // Correcao do nome digitado no aparelho — ver o cabecalho. Nome vazio
      // e' recusado pelo mesmo motivo do lote: apagar nao e' renomear.
      if (tem('peca')) {
        const alteradas = await db`
          UPDATE conferencias SET peca = ${pecaNova}
           WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
          RETURNING id`;
        if (!alteradas.length) throw nadaMudou();
      }

      /**
       * Quem salvou fica pelo NOME da sessao (ver analisada_por no schema).
       * No modo de servico pode nao haver usuario: a analise vale, so' sem
       * nome — a tela mostra quando, e nao inventa quem.
       *
       * Salvar de novo uma medicao ja' analisada troca quando, quem e a
       * nota: o registro e' da ultima leitura, nao da primeira.
       */
      if (tem('analisada')) {
        const alteradas = corpo.analisada
          ? await db`
            UPDATE conferencias
               SET analisada_em = now(), analisada_por = ${auth.usuario?.nome || null},
                   analise_nota = ${analiseNota}
             WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
            RETURNING id`
          : await db`
            UPDATE conferencias SET analisada_em = NULL, analisada_por = NULL
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
        SELECT c.id, c.arquivada, c.peca, c.analisada_em, c.analisada_por, c.analise_nota,
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

/**
 * A ANALISE DE UMA JUNCAO — a mesma nota, de uma vez, em todas as medicoes
 * que o PCP leu juntas na Embalagem Takt Time.
 *
 * TUDO OU NADA. Um PATCH por medicao, da tela, deixaria a junção meio
 * analisada quando o segundo falhasse: duas fora da fila, uma dentro, e a
 * nota so' em parte delas. Aqui:
 *  - so' SALVA (`analisada: true`): reabrir e' de uma medicao por vez, no
 *    volume a volume dela — reabrir a junção inteira nao tem pedido;
 *  - a lista e' conferida ANTES de escrever (no modo de servico a
 *    requisicao nao e' transacao): medicao que nao existe nesta empresa, ou
 *    id repetido, recusa sem gravar nada;
 *  - um UPDATE so', com RETURNING: se a politica do banco barrar alguma, o
 *    erro desfaz a transacao (auth.rls) em vez de responder 200.
 *
 * Devolve as medicoes com os campos novos, para a lista mudar sem buscar
 * tudo de novo — como o PATCH de uma.
 */
async function analisarLote({ auth, res, corpo, ids }) {
  const { empresaId } = auth;
  if (corpo.analisada !== true) {
    throw erroValidacao('No lote, "analisada" só pode ser true: reabrir vai uma medição por vez');
  }
  if (Object.keys(corpo).some((k) => !['ids', 'analisada', 'analiseNota'].includes(k))) {
    throw erroValidacao('A análise vai sozinha no lote: só "ids", "analisada" e "analiseNota"');
  }
  if (new Set(ids).size !== ids.length) throw erroValidacao('Medição repetida em "ids"');
  const analiseNota = texto(corpo.analiseNota, 'analiseNota', { max: 2000 });

  return auth.rls(async (db) => {
    const existentes = await db`
      SELECT id FROM conferencias WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}`;
    if (existentes.length !== ids.length) {
      throw naoEncontrado('Alguma das medições não existe mais (excluída?) — recarregue a tela e junte de novo');
    }
    // A contagem vai DENTRO do UPDATE: no modo de servico nao ha' transacao
    // entre o SELECT acima e esta escrita, e uma medicao excluida nesse
    // meio faria gravar as outras. Assim, ou estao todas, ou nenhuma muda.
    const alteradas = await db`
      UPDATE conferencias
         SET analisada_em = now(), analisada_por = ${auth.usuario?.nome || null},
             analise_nota = ${analiseNota}, editada_em = now()
       WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}
         AND (SELECT count(*) FROM conferencias
               WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}) = ${ids.length}
      RETURNING id, analisada_em, analisada_por, analise_nota`;
    if (!alteradas.length) {
      const [{ n }] = await db`
        SELECT count(*)::int AS n FROM conferencias WHERE id = ANY(${ids}) AND empresa_id = ${empresaId}`;
      if (n !== ids.length) {
        throw naoEncontrado('Alguma das medições não existe mais (excluída?) — recarregue a tela e junte de novo');
      }
      throw nadaMudou();
    }
    // Parte gravada: com a RLS barrando alguma, o erro desfaz a transacao.
    // No modo de servico (sem transacao) so' sobra a janela de um DELETE
    // entre a contagem e a trava da linha — microssegundos, aceita.
    if (alteradas.length !== ids.length) throw nadaMudou();
    return json(res, 200, { atualizadas: alteradas.length, conferencias: alteradas });
  });
}

/**
 * MANDAR A MEDICAO AO PAINEL RitmoPatrimar (PATCH ?id=...&painel=1) — ver
 * api/_lib/painel.js. Responde { painel: { estado, mensagem, em, linha?,
 * substituida? } }, com `em` = painel_em depois da tentativa (null se nunca
 * foi).
 *
 * SEM TRAVA DE "JA' FOI": medicao com painel_em vai de novo quando pedida —
 * reaberta, com uma parada marcada e salva outra vez, ela chega ao painel
 * com numeros novos e o painel troca a linha (substituida). Quem decide se
 * ja' estava e' o painel, pelo REG_ID.
 *
 * NAO E' EDICAO: nao marca editada_em. Aquela marca diz que o PCP mexeu na
 * medicao (produto, paradas, analise, arquivo) e trava o reenvio do video
 * (api/sync.js); mandar ao painel nao muda numero nenhum dela.
 *
 * SO' A ANALISADA: e' o "Salvar analise e fechar" que manda, e o PCP manda
 * o que ja' leu. A tela so' oferece o botao para ela; aqui e' a trava.
 *
 * TRES PASSOS, e a chamada ao painel FORA da transacao. A conexao e' uma
 * por instancia (db.js, max 1) e o Apps Script pode levar ate' 25 s: dentro
 * da RLS, ele seguraria a conexao — e quem mais esperasse por ela — o tempo
 * todo. 1) le, na RLS; 2) monta e chama; 3) grava o desfecho, na RLS. Se o
 * passo 3 falhar com o painel ja' tendo aceitado, o proximo envio volta
 * "ja' estava" e acerta a marca: o painel nao duplica pelo mesmo REG_ID.
 *
 * O DESFECHO fica na medicao: painel_em quando o painel aceitou (ou disse
 * que ja' tinha), limpando painel_erro; painel_erro com o motivo quando nao
 * foi — sem apagar painel_em, porque o que o painel aceitou antes continua
 * la' (com os numeros de antes: a tela pede o reenvio). DESLIGADO nao
 * grava nada: nao houve tentativa, e ligar o envio depois nao pode deixar
 * um "nao foi" em toda medicao analisada enquanto isso.
 */
async function mandarAoPainel({ auth, res, conferenciaId }) {
  const { empresaId } = auth;
  if (!painelLigado()) {
    return json(res, 200, { painel: { estado: 'desligado', mensagem: MENSAGEM_DESLIGADO, em: null } });
  }

  const lido = await auth.rls(async (db) => {
    const [conferencia] = await db`
      SELECT c.id, c.maquina, c.peca, c.pecas, c.duracao_ms, c.iniciado_em, c.salvo_em, c.analisada_em,
             c.marcas_ms, c.marcas_relogio_ms, c.marcas_setup_ms
        FROM conferencias c
       WHERE c.id = ${conferenciaId} AND c.empresa_id = ${empresaId}`;
    if (!conferencia) throw naoEncontrado('Medição não encontrada');
    if (!conferencia.analisada_em) {
      throw new ErroHttp(409, 'Esta medição ainda não foi analisada: salve a análise antes de mandá-la ao painel.');
    }
    // As maquinas COM grupo, com o cadastro do grupo junto: o grupo da
    // medicao sai pelo nome da maquina, como na tela (grupoDaMedicao).
    const maquinas = await db`
      SELECT m.nome, m.ativa, m.grupo_id, g.nome AS grupo_nome,
             g.horas_semana, g.setups_dia, g.setup_min, g.dias_semana
        FROM maquinas m
        JOIN grupos_maquina g ON g.id = m.grupo_id
       WHERE m.empresa_id = ${empresaId}`;
    const grupo = grupoDaMedicao(conferencia.maquina, maquinas);
    const demandas = grupo ? await listarDemandas(db, empresaId, grupo.id) : [];
    return { conferencia, grupo, demandas };
  });

  const montagem = montarParaOPainel(lido);
  // O motivo de nao montar e' recusa NOSSA, antes do painel: reenviar sem
  // corrigir (o produto, quase sempre) da' o mesmo motivo.
  const desfecho = montagem.motivo
    ? { estado: 'recusada', mensagem: montagem.motivo }
    : await chamarPainel({ params: montagem.params });
  if (desfecho.estado === 'desligado') {
    return json(res, 200, { painel: { estado: 'desligado', mensagem: desfecho.mensagem, em: null } });
  }

  const foi = NO_PAINEL.includes(desfecho.estado);
  const [gravada] = await auth.rls((db) => (foi
    // Aceita agora: a hora de agora. "Ja' estava": a primeira aceitacao
    // vale, se esta medicao ja' a tinha.
    ? db`
      UPDATE conferencias
         SET painel_em = CASE WHEN ${desfecho.estado === 'enviada'} THEN now() ELSE coalesce(painel_em, now()) END,
             painel_erro = NULL
       WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
      RETURNING painel_em`
    : db`
      UPDATE conferencias SET painel_erro = ${motivoParaGravar(desfecho.mensagem)}
       WHERE id = ${conferenciaId} AND empresa_id = ${empresaId}
      RETURNING painel_em`));
  if (!gravada) throw nadaMudou();

  return json(res, 200, {
    painel: {
      estado: desfecho.estado,
      mensagem: desfecho.mensagem,
      em: gravada.painel_em,
      ...(desfecho.linha ? { linha: desfecho.linha } : {}),
      // A mesma medicao reenviada com outros numeros: o painel trocou a linha.
      ...(desfecho.substituida ? { substituida: true } : {}),
    },
  });
}
