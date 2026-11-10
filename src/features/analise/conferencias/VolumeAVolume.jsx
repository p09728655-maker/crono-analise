import {
  Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  faixaHoraria, formatarDuracao, leituraPecaAPeca, paradasPorMotivo, periodoPorPeca, somarParadas, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../../domain/demandaSemanal.js';
import {
  deixaramDe, deixouDeEmbalar, frasesDasParadas, frasesVolumeAVolume, naoSaiu, numerosDaLeitura, pctDoParado,
  porHoraDaMedicao, qtdParadas, roubadosPelasLacunas, roubadosPelasParadas, tempoSomado,
} from '../../../domain/volumeAVolume.js';
import {
  CRITERIOS_JUNCAO, PREFIXO_JUNCAO, faixaDaJuncao, frasesDaJuncao, horaDaMedicao, idsDaJuncao, juntarMedicoes,
  notaDaJuncao, taktDaJuncao,
} from '../../../domain/juncaoMedicoes.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import {
  enviarAoPainel, listarDemanda, marcasDaConferencia, renomearPecaConferencia, renomearPecaConferencias,
  salvarAnaliseConferencia, salvarAnaliseConferencias,
} from '../../../lib/api.js';
import { NO_PAINEL, podeEnviarAoPainel, situacaoNoPainel } from '../../../domain/envioAoPainel.js';
import { dataDoArquivo, imprimirComo, nomeDoArquivo } from '../../../lib/impressao.js';
import { claro } from '../../../theme/tokensAnalise.js';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { GraficoIntervalos } from '../graficos/Intervalos.jsx';
import { contaDaMaquina, demandaPorMaquina, formatarHorasMin } from '../../../components/RitmoDemanda.jsx';
import { colunasDosKpis, est, imp } from './estilos.js';
import { emSegundos } from './formato.js';

/** Lacunas listadas na folha A4: as maiores. A tela mostra todas. */
const MAX_LACUNAS_PAPEL = 15;

/**
 * VOLUME A VOLUME — o intervalo de cada volume de UMA medicao, contra o
 * takt da semana em que ela foi feita.
 *
 * Abre pela linha da medicao (so' as que tem marcas: cronometro ao vivo,
 * contagem por toque), NA PROPRIA PAGINA, ao lado da lista — nao numa
 * janela por cima, nem no lugar dela: a lista e' a fila do que falta ler,
 * e fica a vista. Em tela estreita a pagina empilha, e ai' o painel vem
 * abaixo da lista (quem monta a grade e' a tela). O ritmo da medicao ja'
 * estava no relatorio; o que este painel acrescenta e' COMO ele saiu —
 * regular, lento ou aos trancos.
 *
 * O TAKT vem de taktDaMedicao: o mesmo programa, a mesma jornada e o mesmo
 * setup planejado do quadro "Programa da semana", na semana DESTA medicao.
 * Na embalagem o programa e' em VOLUMES, e e' por volume que o takt
 * sai — a mesma unidade do toque.
 *
 * O VEREDITO usa a mesma regua do quadro do programa — relogio, paradas
 * dentro —, no trecho entre o primeiro e o ultimo toque (periodoPorPeca).
 * As barras do grafico sao da linha RODANDO: mostram o passo e onde ela
 * parou sem ninguem marcar. Frases e numeros moram em
 * domain/volumeAVolume.js, os mesmos na tela e na folha.
 *
 * A ANALISE DO PCP: lida a medicao, o PCP salva (com a conclusao, se
 * quiser) e o painel fecha. E' o que tira a medicao da lista (ela passa a
 * Analisadas). O botao mora no TOPO, ao lado de Imprimir e Fechar: o topo gruda
 * e esta' sempre a' vista. O fundo do painel nao — com a pagina no alto,
 * ele fica abaixo da dobra, e um botao ali seria um botao escondido.
 *
 * OS VOLUMES QUE AS PARADAS ROUBARAM abrem o corpo do painel: e' o numero
 * que move a acao do PCP ("as paradas roubam caixas").
 *
 * A JUNCAO (conferencia.juncao, ver medicaoDaJuncao): varias medicoes do
 * mesmo produto, maquina e semana no MESMO painel — os mesmos cartoes,
 * grafico e leitura, com a tabela das medicoes, a divisa entre elas no
 * grafico e a analise salva em todas de uma vez. As contas moram em
 * domain/juncaoMedicoes.js.
 */
export function useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo }) {
  const [carga, setCarga] = useState({ estado: 'carregando' });

  useEffect(() => {
    let vivo = true;
    setCarga({ estado: 'carregando' });
    const medicoes = conferencia.juncao ? conferencia.medicoes : [conferencia];
    Promise.all([
      // As marcas e o relogio entre o primeiro e o ultimo toque — de cada
      // medicao da junção, em paralelo.
      Promise.all(medicoes.map((c) => marcasDaConferencia(c.id))),
      // Sem grupo nao ha' programa — e falha do programa nao derruba o
      // grafico: os intervalos continuam valendo sem a linha do takt.
      grupo ? listarDemanda(grupo.id).catch(() => null) : Promise.resolve([]),
    ])
      // `de`: de qual medicao e' a leitura — no primeiro quadro depois da
      // troca, a carga ainda e' a da anterior.
      .then(([toques, demandas]) => {
        if (vivo) {
          setCarga({
            estado: 'pronto', ...toques[0], toques, demandas, de: conferencia.id,
          });
        }
      })
      .catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message, de: conferencia.id }); });
    return () => { vivo = false; };
  }, [conferencia.id, grupo?.id]);

  return useMemo(() => {
    // A carga ainda e' da medicao anterior (o primeiro quadro depois da
    // troca): ela nao se mostra sob o titulo da nova, nem se mede para
    // rolar a pagina — para quem olha, a nova esta' carregando.
    if (carga.de !== undefined && carga.de !== conferencia.id) return { estado: 'carregando' };
    if (carga.estado !== 'pronto') return carga;
    const taktDe = (c) => (!grupo
      ? { taktMs: null, estado: 'sem-grupo', semana: null }
      : carga.demandas === null
        ? { taktMs: null, estado: 'erro-programa', semana: null }
        : taktDaMedicao({
          demandas: carga.demandas,
          horas: grupo.horas_semana,
          maquinas: maquinasDoGrupo,
          setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
          data: c.iniciado_em || c.salvo_em,
          pecas: c.pecas,
          duracaoMs: Number(c.duracao_ms),
        }));
    if (conferencia.juncao) {
      // O takt de CADA medicao: semanas do programa diferentes deixam a
      // junção sem veredito, com o setup planejado (ver taktDaJuncao).
      const takt = taktDaJuncao(conferencia.medicoes.map(taktDe));
      const juncao = juntarMedicoes(
        conferencia.medicoes.map((c, k) => ({ conferencia: c, ...carga.toques[k] })),
        { taktMs: takt.taktMs, setupPlanejado: Boolean(takt.setupPlanejado) },
      );
      return {
        estado: juncao?.leitura ? 'pronto' : 'sem-marcas',
        leitura: juncao?.leitura || null,
        takt,
        juncao,
        roubo: juncao?.roubo || null,
        deixou: juncao?.deixou || null,
        de: carga.de,
      };
    }
    const takt = taktDe(conferencia);
    // O veredito e' do PERIODO, paradas dentro, entre o primeiro e o ultimo
    // toque (ver periodoPorPeca).
    const periodoPorPecaMs = periodoPorPeca({
      relogioEntreMarcasMs: carga.relogio,
      volumes: (carga.marcas || []).length,
      setupNoTrechoMs: carga.setup,
      setupPlanejado: Boolean(takt.setupPlanejado),
    });
    const leitura = leituraPecaAPeca({ marcasMs: carga.marcas, taktMs: takt.taktMs, periodoPorPecaMs });
    const roubo = roubadosPelasParadas(conferencia);
    return {
      estado: leitura ? 'pronto' : 'sem-marcas',
      leitura,
      takt,
      juncao: null,
      // O total num passo so' (v2.99.6); null sem leitura ou sem relogio.
      deixou: deixouDeEmbalar([{ conferencia, marcas: carga.marcas, relogio: carga.relogio }], leitura),
      // So' com parada marcada (ver roubadosPelasParadas).
      roubo: roubo ? { saiu: roubo.saiu, roubados: roubo.roubados, potencial: roubo.potencial } : null,
      de: carga.de,
    };
  }, [carga, grupo, maquinasDoGrupo, conferencia]);
}

/**
 * ANALISE DO PCP — a nota digitada, o "Salvando…" e a recusa de CADA
 * medicao, guardados pela TELA, nao pelo painel.
 *
 * Por medicao, porque o PCP compara: escreve em uma, abre outra, escreve,
 * volta — e cada nota tem de estar onde foi deixada. Na tela, porque o
 * painel some ao fechar: guardado nele, fechar apagava a nota digitada.
 * Aqui a nota nao salva sobrevive a fechar e reabrir, e a recusa
 * fica com a medicao (a linha da lista avisa) ate' a proxima tentativa. O rascunho
 * vive enquanto a TELA esta' aberta: saiu dela, ele se vai — por isso a
 * linha avisa quando ha' nota digitada e nao salva.
 *
 * `aplicar(atualizadas, { fechar })` e' quem muda a lista e fecha o painel
 * — uma medicao, ou a lista delas quando quem salvou foi uma junção.
 * Sem rascunho, o campo comeca na nota salva — a que ficou ao reabrir.
 *
 * A JUNCAO tem rascunho proprio (pelo id dela) e salva numa ida so', em
 * todas as medicoes, com "Junção de N medições (…)" no comeco da nota
 * (ver notaDaJuncao): tudo ou nada, como o servidor garante.
 *
 * O PAINEL RitmoPatrimar (v2.103.0): salva a analise, cada medicao vai ao
 * painel — a da juncao, uma depois da outra, uma linha por medicao (o painel
 * soma as do mesmo volume). So' com `painelLigado` true, que vem da lista
 * (o servidor diz se PAINEL_APPS_SCRIPT_URL existe): desligado, nada sai, e
 * sem saber (null) tambem nao. SEM TRAVA DE "JA' FOI": reaberta e salva de
 * novo, ela vai de novo — o painel responde "ja' estava" (os toques nao
 * mudam depois da analise; parada marcada no PC nao mexe neles) ou troca a
 * linha se o periodo mudou (setup ou programa do grupo). O envio nao segura
 * o painel aberto nem a tela: a analise ja' esta' salva, e o desfecho fica
 * gravado na medicao (painel_em, painel_erro) mesmo que ninguem esteja
 * olhando quando ele voltar. Os envios de toda a tela vao numa FILA, um por
 * vez: duas analises salvas em seguida nao disputam o Apps Script.
 *
 * A FILA MORA NA PAGINA. Fechada ou recarregada no meio, o que nao saiu nao
 * sai mais. Por isso: (1) a gravacao da analise ja' pede a marca de "nao
 * confirmado" ao servidor (`painel: true`, ver pedeEnvio em
 * api/conferencias.js), que o envio troca ao voltar — a que nao voltou fica
 * com "⚠ nao foi ao painel" na lista depois do F5; (2) `enviosPendentes`
 * conta a fila, e a tela pergunta antes de sair (beforeunload).
 *
 * PRODUTO CORRIGIDO (Editar produto) depois do envio: `renomearProduto`
 * grava o nome (com o pedido de marca) e manda de novo as que ja' foram ao
 * painel ou tentaram (o painel troca a linha pelo REG_ID); a nunca enviada
 * nao vai por causa de um nome. Mora aqui, e nao na tela, para o teste
 * alcancar a ligacao inteira (test/painel-tela.test.js).
 *
 * `conferencias` e' a lista de agora da tela: o aviso mostra e reenvia a
 * medicao como ela esta' (o nome corrigido), nao o retrato de quando o
 * envio saiu.
 */
export function useAnalisesDoPcp(aplicar, { painelLigado = null, conferencias = null } = {}) {
  const [rascunhos, setRascunhos] = useState({}); // id -> texto
  const [salvando, setSalvando] = useState({}); // id -> true
  const [falhas, setFalhas] = useState({}); // id -> { mensagem, reabrir }
  // O painel: o desfecho do envio de cada medicao NESTA tela (ver
  // situacaoNoPainel) e o aviso do ultimo envio, para a lista.
  const [envios, setEnvios] = useState({}); // id -> { fase, ... }
  const [aviso, setAviso] = useState(null); // { lote, medicoes }
  const fila = useRef(Promise.resolve());
  const lotes = useRef(0);
  const sem = (mapa, id) => {
    if (!(id in mapa)) return mapa;
    const resto = { ...mapa };
    delete resto[id];
    return resto;
  };
  const notaDe = (c) => (c.id in rascunhos ? rascunhos[c.id] : (c.analise_nota || ''));
  const juncoesComNota = () => Object.entries(rascunhos)
    .filter(([id, texto]) => id.startsWith(PREFIXO_JUNCAO) && !salvando[id] && texto.trim())
    .map(([id]) => id);
  // Digitada e diferente da salva, numa medicao ainda nao analisada: e' o
  // que se perde ao sair da tela. A que esta' indo para o servidor nao
  // conta — ela ja' saiu; se for recusada, volta a contar.
  const notaNaoSalva = (c) => {
    const digitada = c.id in rascunhos ? rascunhos[c.id].trim() : null;
    return !c.analisada_em && !salvando[c.id] && digitada !== null && digitada !== (c.analise_nota || '').trim();
  };

  /**
   * Manda as medicoes ao painel, uma por vez, atras do que ja' esta' na fila.
   * A falha de uma nao para as outras: cada uma tem o proprio desfecho. O
   * aviso da lista passa a ser deste lote.
   */
  function mandarAoPainel(medicoes) {
    const lista = (medicoes || []).filter(Boolean);
    if (!lista.length) return;
    lotes.current += 1;
    setAviso({ lote: lotes.current, medicoes: lista });
    setEnvios((m) => ({ ...m, ...Object.fromEntries(lista.map((c) => [c.id, { fase: 'na-fila' }])) }));
    fila.current = fila.current.then(async () => {
      for (const c of lista) {
        setEnvios((m) => ({ ...m, [c.id]: { fase: 'enviando' } }));
        let desfecho;
        try {
          const p = await enviarAoPainel(c.id);
          desfecho = {
            fase: 'feito',
            estado: p.estado,
            em: p.em ?? null,
            erro: NO_PAINEL.includes(p.estado) || p.estado === 'desligado' ? null : p.mensagem,
            substituida: Boolean(p.substituida),
          };
        } catch (e) {
          // O NOSSO servidor nao respondeu (ou recusou o pedido): o banco
          // pode ter mudado ou nao — a situacao diz "nao foi" e oferece o
          // reenvio, que e' inofensivo.
          desfecho = { fase: 'feito', falha: e.message };
        }
        setEnvios((m) => ({ ...m, [c.id]: desfecho }));
      }
    });
  }
  const situacaoDe = (c) => situacaoNoPainel(c, envios[c.id]);
  // A medicao como ela esta' AGORA na tela (nome corrigido, desfecho gravado).
  const porId = new Map((conferencias || []).map((c) => [c.id, c]));
  const atual = (c) => (porId.has(c.id) ? { ...c, ...porId.get(c.id) } : c);
  const enviosPendentes = Object.values(envios)
    .filter((x) => x.fase === 'na-fila' || x.fase === 'enviando').length;

  async function salvar(conferencia, analisar) {
    const { id } = conferencia;
    setSalvando((m) => ({ ...m, [id]: true }));
    setFalhas((m) => sem(m, id));
    // Salvar a analise com o envio ligado manda ao painel em seguida: a
    // gravacao ja' pede a marca de "nao confirmado" (ver o cabecalho).
    const vaiAoPainel = analisar && painelLigado === true;
    try {
      const atualizada = conferencia.juncao
        ? await salvarAnaliseConferencias(
          conferencia.medicoes.map((c) => c.id),
          notaDaJuncao(conferencia.medicoes, notaDe(conferencia)),
          { painel: vaiAoPainel },
        )
        : await salvarAnaliseConferencia(id, {
          analisada: analisar, nota: notaDe(conferencia).trim(), painel: vaiAoPainel,
        });
      // Salvo, o rascunho cumpriu o papel: o campo volta a ler o banco.
      setRascunhos((m) => sem(m, id));
      // Fecha so' ao salvar; reabrir deixa o painel aberto, com a nota.
      aplicar(atualizada, { fechar: analisar });
      // Salva a analise, a medicao (ou as da juncao) vai ao painel — sempre,
      // mesmo a que ja' tinha ido (o painel diz "ja' estava" ou troca a
      // linha). Reabrir nao manda nada.
      if (vaiAoPainel) {
        mandarAoPainel(conferencia.juncao ? conferencia.medicoes : [conferencia]);
      }
    } catch (e) {
      setFalhas((m) => ({ ...m, [id]: { mensagem: e.message, reabrir: !analisar } }));
    } finally {
      setSalvando((m) => sem(m, id));
    }
  }

  /**
   * PRODUTO CORRIGIDO: das medicoes renomeadas (ja' com o nome novo), manda
   * de novo ao painel as analisadas que ja' foram ou tentaram ir — o painel
   * ainda esta' com o nome de antes. A nunca enviada fica: so' o "Salvar
   * analise" ou o botao a mandam. Desligado, nada.
   */
  function aposRenomear(medicoes) {
    if (painelLigado !== true) return;
    // A que esta' INDO pode ja' ter lido o nome de antes: vai de novo,
    // atras dela. A que esta' na fila ainda vai ler o nome novo.
    const ja = (c) => ['no-painel', 'nao-foi', 'enviando'].includes(situacaoDe(c).tipo);
    mandarAoPainel((medicoes || []).filter((c) => c && c.analisada_em && ja(c)));
  }

  /**
   * GRAVA O PRODUTO CORRIGIDO de `ids` (o "as outras" do Editar produto
   * renomeia varias) e reenvia ao painel o que precisa (aposRenomear). A
   * recusa do servidor sobe para a janela, que a mostra; recusado, nada
   * vai ao painel.
   */
  async function renomearProduto(ids, nome) {
    const painel = painelLigado === true;
    if (ids.length > 1) await renomearPecaConferencias(ids, nome, { painel });
    else await renomearPecaConferencia(ids[0], nome, { painel });
    aposRenomear(ids.map((id) => porId.get(id)).filter(Boolean).map((c) => ({ ...c, peca: nome })));
  }

  return {
    /** Ha' alguma analise indo para o servidor (a tela nao deve sair). */
    ocupado: Object.keys(salvando).length > 0,
    /**
     * Medicoes na fila do painel ou indo agora: fechar ou recarregar a
     * pagina as deixa sem enviar (a lista as marca depois, mas o PCP tem de
     * mandar de novo) — a tela pergunta antes.
     */
    enviosPendentes,
    /** O "Editar produto" grava por aqui (ver renomearProduto). */
    renomearProduto,
    /** A analise DESTA medicao esta' indo para o servidor (o painel dela nao fecha). */
    salvandoA: (id) => Boolean(salvando[id]),
    notaNaoSalva,
    /**
     * Notas de junção digitadas e nao salvas — so' as de junção que ainda
     * tem medicao por analisar (analisadas uma a uma depois, a nota da
     * junção ja' nao tem onde cair). A junção nao e' linha da lista: sem
     * esta conta, sair da tela descartaria a nota sem perguntar.
     */
    juncoesNaoSalvas: (medicoes) => juncoesComNota()
      .filter((id) => idsDaJuncao(id).some((x) => medicoes.some((m) => m.id === x && !m.analisada_em))).length,
    /**
     * O que a LINHA precisa avisar de uma medicao fechada: a recusa (de
     * salvar ou de reabrir — reabrir recusado deixa a analise salva, e o
     * aviso nao pode dizer o contrario) ou a nota digitada e nao salva.
     */
    pendencia: (c) => {
      if (falhas[c.id]) return falhas[c.id].reabrir ? 'reabrir-recusado' : 'salvar-recusado';
      if (notaNaoSalva(c)) return 'nota-nao-salva';
      // A nota da junção fechada sem salvar: a linha de cada medicao dela
      // avisa, senao ninguem saberia onde ela esta'.
      if (!c.analisada_em && juncoesComNota().some((id) => idsDaJuncao(id).includes(c.id))) return 'nota-juncao-nao-salva';
      return null;
    },
    /** O que o painel da medicao `c` precisa. */
    da: (c) => {
      const medicoes = c.juncao ? c.medicoes : [c];
      const situacoes = medicoes.map((m) => ({ medicao: m, ...situacaoDe(m) }));
      return {
        nota: notaDe(c),
        mudarNota: (texto) => setRascunhos((m) => ({ ...m, [c.id]: texto })),
        salvando: Boolean(salvando[c.id]),
        erro: falhas[c.id]?.mensagem || null,
        salvar: (analisar) => salvar(c, analisar),
        // O painel RitmoPatrimar desta medicao (ou das da juncao). Enviar
        // manda as que nao estao la'; com todas la', manda de novo todas —
        // e' inofensivo (o painel responde "ja' estava", ou troca a linha
        // se o produto ou o periodo mudaram). Nunca a que ja' esta' a caminho.
        painel: {
          ligado: painelLigado,
          situacoes,
          enviar: () => {
            const fora = situacoes.filter((x) => podeEnviarAoPainel(x));
            const alvo = fora.length ? fora : situacoes.filter((x) => x.tipo === 'no-painel');
            mandarAoPainel(alvo.map((x) => x.medicao));
          },
        },
      };
    },
    /** Onde a medicao `c` esta' em relacao ao painel (a marca da linha). */
    situacaoNoPainel: situacaoDe,
    /**
     * O AVISO DO ULTIMO ENVIO, para a lista: o painel do volume a volume
     * fecha ao salvar, e e' na lista que o desfecho aparece. Null sem envio
     * nesta tela (ou dispensado). `reenviar` manda de novo as que nao foram.
     */
    avisoDoPainel: aviso && {
      medicoes: aviso.medicoes.map(atual).map((m) => ({ medicao: m, ...situacaoDe(m) })),
      reenviar: () => mandarAoPainel(aviso.medicoes.map(atual).filter((m) => situacaoDe(m).tipo === 'nao-foi')),
      dispensar: () => setAviso((a) => (a?.lote === aviso.lote ? null : a)),
    },
  };
}

/**
 * A LINHA DO PAINEL no topo do volume a volume de uma medicao analisada
 * (ou de uma juncao toda analisada): se ela esta' no painel RitmoPatrimar,
 * e, se nao, por que — com o botao de enviar. Discreta: e' estado, nao a
 * leitura da medicao. Desligado, uma linha cinza, sem botao e sem erro.
 * Sem saber se o envio esta' ligado (`ligado` null), nada.
 *
 * O botao fica tambem com a medicao ja' la': reenviar e' inofensivo, e e'
 * o caminho para levar ao painel o que mudou depois do envio.
 */
function LinhaDoPainel({ painel, ehJuncao }) {
  if (!painel || painel.ligado == null) return null;
  const { situacoes } = painel;
  const todasLa = situacoes.every((x) => x.tipo === 'no-painel');
  const indo = situacoes.some((x) => x.tipo === 'na-fila' || x.tipo === 'enviando');
  if (indo) return <p style={est.vavPainelLinha} role="status">Painel: enviando…</p>;
  if (painel.ligado === false && !todasLa) {
    return <p style={est.vavPainelLinha}>Painel: envio desligado (falta PAINEL_APPS_SCRIPT_URL no servidor)</p>;
  }
  const textoDe = (x) => {
    if (x.tipo === 'no-painel') return `${x.substituida ? 'atualizada' : 'enviada'} em ${formatarDataHora(x.em)}`;
    const anterior = x.em ? ` (uma versão anterior está lá, de ${formatarDataHora(x.em)})` : '';
    if (x.tipo === 'nao-foi') return `não foi — ${x.motivo}${anterior}`;
    return 'ainda não enviada';
  };
  let linhas;
  if (!ehJuncao) {
    linhas = (
      <span style={situacoes[0].tipo === 'nao-foi' ? est.vavPainelFalha : est.vavPainelLinha}>
        Painel: {textoDe(situacoes[0])}
      </span>
    );
  } else if (todasLa) {
    const ultima = situacoes.map((x) => x.em).sort().at(-1);
    linhas = (
      <span style={est.vavPainelLinha}>
        Painel: as {situacoes.length} enviadas · a última em {formatarDataHora(ultima)}
      </span>
    );
  } else {
    linhas = situacoes.filter((x) => x.tipo !== 'no-painel').map((x) => (
      <span key={x.medicao.id} style={x.tipo === 'nao-foi' ? est.vavPainelFalha : est.vavPainelLinha}>
        Painel · {horaDaMedicao(x.medicao)}: {textoDe(x)}
      </span>
    ));
  }
  return (
    <div style={est.vavPainelBloco}>
      <div style={est.vavPainelTextos}>{linhas}</div>
      {painel.ligado === true && (
        <button type="button" style={est.botaoLinha} onClick={cliqueSimples(painel.enviar)}>
          Enviar ao painel
        </button>
      )}
    </div>
  );
}

/**
 * O clique que e' o SEGUNDO de um duplo clique nao vale. Com o painel no
 * lugar da lista (v2.94.1), quem abria a linha com duplo clique acertava o
 * Salvar com o segundo, e a medicao ficava analisada sem ninguem ler; ao
 * lado da lista, o segundo clique na linha a fecharia de novo, e o salvo
 * que tira a linha da lista poria outra debaixo do cursor. Teclado
 * (detail 0) e clique simples passam.
 */
export const cliqueSimples = (fazer) => (ev) => {
  if (ev.detail > 1) return;
  fazer(ev);
};

const TOM = {
  atende: est.vereditoAtende,
  falha: est.vereditoFalha,
  atencao: { background: claro.atencaoFundo, borderLeftColor: claro.atencao },
  neutro: { background: claro.fundo, borderLeftColor: claro.neutro },
};

/** A cor do veredito, levada ao cartao do numero que ele julga. */
const COR_DO_TOM = { atende: claro.ok, falha: claro.critico, atencao: claro.atencao };

export default function VolumeAVolume({
  conferencia, grupo, maquinasDoGrupo, aoFechar, analise, rolar = true,
}) {
  const unidade = unidadeDoPosto(grupo?.nome);
  const r = useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo });
  const titulo = `${capital(unidade.singular)} a ${unidade.singular}`;
  const ehJuncao = Boolean(conferencia.juncao);
  const medicoes = ehJuncao ? conferencia.medicoes : [conferencia];
  const n = medicoes.length;
  const pronto = r.estado === 'pronto';
  const frases = !pronto ? null : r.juncao
    ? frasesDaJuncao({
      juncao: r.juncao, takt: r.takt, unidade, nomeGrupo: grupo?.nome, hora: horaDaMedicao,
    })
    : frasesVolumeAVolume({ ...r, unidade, nomeGrupo: grupo?.nome });
  // So' com a leitura na tela: nao se analisa o que nao carregou. O estado
  // da analise (nota digitada, "Salvando…", recusa) vem da tela — ver
  // useAnalisesDoPcp.
  const podeAnalisar = pronto && Boolean(analise);
  // Na junção, "analisada" e' TODAS analisadas (ver medicaoDaJuncao).
  const analisada = Boolean(conferencia.analisada_em);
  const salvando = Boolean(analise?.salvando);
  // Junção com medicao ja' analisada: salvar SUBSTITUI a analise dela. O
  // aviso fica colado ao botao, e a nota antiga aparece em Analise do PCP
  // (revisao da v2.96.0: ela sumia sem nunca aparecer).
  const jaAnalisadas = ehJuncao && !analisada ? medicoes.filter((c) => c.analisada_em) : [];
  const quando = conferencia.iniciado_em || conferencia.salvo_em;
  const meta = ehJuncao
    ? [
      // A data so' quando todas sao do mesmo dia; senao a faixa ja' diz os dias.
      new Set(medicoes.map((c) => formatarDataHora(c.iniciado_em || c.salvo_em).split(' ')[0])).size === 1
        && formatarDataHora(quando).split(' ')[0],
      faixaDaJuncao(medicoes),
      `${formatarDuracao(Number(conferencia.duracao_ms))} medidos`,
      porVideo(medicoes),
    ].filter(Boolean)
    : [
      formatarDataHora(quando),
      faixaHoraria(conferencia),
      `${formatarDuracao(Number(conferencia.duracao_ms))} de medição`,
      porVideo(medicoes),
    ].filter(Boolean);

  /* Selecionou outra medicao: a pagina rola ate' ela SO' se ela nasceu fora
     da vista — empilhada abaixo da lista, em tela estreita. Ao lado da
     lista o painel ja' esta' a vista, e rolar tiraria a lista de vista.
     `rolar` falso (a medicao que a tela reabre sozinha, no F5) nunca rola.

     A medicao que pediu rolagem rola de novo quando a leitura chega:
     com "Carregando os toques…" o painel e' baixo, a pagina nao tem altura
     para traze-lo ao alto, e ele parava no meio da tela, so' com o
     cabecalho a' vista. A segunda vez nao usa o limite de 60% (o painel ja'
     parou acima dele): o painel tem de chegar ao alto. */
  const refPainel = useRef(null);
  const pediuRolagem = useRef(null);
  useEffect(() => {
    const el = refPainel.current;
    pediuRolagem.current = null;
    if (!rolar || !el?.scrollIntoView) return;
    const { top } = el.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight * 0.6) {
      pediuRolagem.current = conferencia.id;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [conferencia.id]);
  // A leitura carregada (ou sem marcas) e' DESTA medicao, nao da anterior.
  const carregouEsta = r.estado !== 'carregando' && r.de === conferencia.id;
  useEffect(() => {
    const el = refPainel.current;
    if (!carregouEsta || pediuRolagem.current !== conferencia.id || !el?.scrollIntoView) return;
    pediuRolagem.current = null;
    const { top } = el.getBoundingClientRect();
    if (top < 0 || top > 64) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [carregouEsta, conferencia.id]);

  return (
    <>
      <section
        ref={refPainel}
        style={est.vavPainel}
        aria-label={ehJuncao ? `${titulo} — junção de ${n} medições` : `${titulo} da medição`}
      >
        {/* 1. IDENTIFICACAO — o produto e' o titulo: e' por ele que o PCP
            procura a medicao (e o que da' nome ao PDF). */}
        <header style={est.vavTopo}>
          <div style={est.vavIdentidade}>
            <span style={est.vavSobretitulo}>{ehJuncao ? `Junção de ${n} medições` : titulo}</span>
            <h2 style={est.vavTitulo}>{conferencia.peca || 'Produto não informado'}</h2>
            <p style={est.vavMeta}>
              <span style={est.vavMetaForte}>{conferencia.maquina || 'Máquina não informada'}</span>
              {meta.map((m) => (
                <Fragment key={m}>
                  <span style={est.vavMetaSeparador} aria-hidden="true">·</span>
                  <span>{m}</span>
                </Fragment>
              ))}
            </p>
            {ehJuncao && <p style={est.vavMetaNota}>{textoDoIntervaloEntreMedicoes(medicoes)}</p>}
            {analisada && (
              <p style={est.vavAnaliseSelo}>
                {[ehJuncao ? `✓ As ${n} analisadas` : '✓ Analisada', conferencia.analisada_por,
                  `em ${formatarDataHora(conferencia.analisada_em)}`]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
            {/* O painel RitmoPatrimar: so' a analisada vai, e so' quem
                analisa ve o botao (o mesmo podeAnalisar do Salvar). */}
            {analisada && podeAnalisar && <LinhaDoPainel painel={analise.painel} ehJuncao={ehJuncao} />}
          </div>
          <div style={est.vavAcoes}>
            {/* Salvar fecha o painel e tira a medicao da lista; reabrir o deixa aberto, com a nota no
                campo para corrigir (e desfaz o clique errado). */}
            {/* A junção nao reabre: reabrir e' de uma medicao por vez, no
                volume a volume dela (ver analisarLote na API). */}
            {podeAnalisar && !(ehJuncao && analisada) && (analisada ? (
              <button
                type="button" style={est.botaoSecundario}
                onClick={cliqueSimples(() => analise.salvar(false))} disabled={salvando}
              >
                {salvando ? 'Reabrindo…' : 'Reabrir análise'}
              </button>
            ) : (
              <button
                type="button" style={est.botaoSalvarAnalise}
                onClick={cliqueSimples(() => analise.salvar(true))} disabled={salvando}
              >
                {salvando ? 'Salvando…' : (ehJuncao ? `Salvar análise das ${n} e fechar` : 'Salvar análise e fechar')}
              </button>
            ))}
            {pronto && (
              /* O PDF sai com o nome da folha — "Takt Time - Rack Sirius 1.6 -
                 EMBALAGEM 01 - 19-10-2026 13h36" —, nao com o do sistema. */
              <button
                type="button"
                style={est.botaoSecundario}
                onClick={cliqueSimples(() => imprimirComo(nomeDoArquivo(
                  'Takt Time',
                  conferencia.peca || 'sem produto',
                  conferencia.maquina,
                  dataDoArquivo(quando),
                  ehJuncao ? `${n} medições` : null,
                )))}
              >
                Imprimir
              </button>
            )}
            {/* Travado enquanto salva: fechado no meio, o painel nao estaria
                aqui para dizer se o servidor recusou. */}
            <button type="button" style={est.botaoSecundario} onClick={cliqueSimples(aoFechar)} disabled={salvando}>
              Fechar
            </button>
          </div>
          {podeAnalisar && jaAnalisadas.length > 0 && (
            <p style={est.vavAvisoSubstitui} role="note">
              {jaAnalisadas.length === 1
                ? `A das ${horaDaMedicao(jaAnalisadas[0])} já foi analisada: salvar a junção substitui a análise dela`
                : `${jaAnalisadas.length} já foram analisadas (${jaAnalisadas.map(horaDaMedicao).join(', ')}): salvar a junção substitui as análises delas`}
              {' '}— veja em Análise do PCP, abaixo.
            </p>
          )}
          {/* A recusa aparece colada ao botao, e o painel NAO fecha: fechar
              seria dizer que salvou. */}
          {analise?.erro && (
            <div style={est.vavAnaliseErro} role="alert">
              {analisada ? 'Não deu para reabrir' : 'Não deu para salvar'}: {analise.erro}
            </div>
          )}
        </header>

        <div style={est.vavCorpo}>
          {/* A nota do analista ("faltou caixa 9h10") e' muitas vezes a
              explicacao da lacuna: precisa estar onde a lacuna aparece. */}
          {medicoes.filter((c) => c.observacao).map((c) => (
            <p key={c.id} style={est.vavObs}>
              <span style={est.vavObsRotulo}>Obs. do analista{ehJuncao ? ` · ${horaDaMedicao(c)}` : ''}</span>
              {c.observacao}
            </p>
          ))}

          {r.estado === 'carregando' && (
            <p style={est.textoModal}>{ehJuncao ? `Carregando os toques das ${n} medições…` : 'Carregando os toques desta medição…'}</p>
          )}
          {r.estado === 'erro' && (
            <div style={est.faixaErro} role="alert">
              {ehJuncao ? 'Não deu para carregar as medições' : 'Não deu para carregar esta medição'}: {r.erro}
            </div>
          )}
          {r.estado === 'sem-marcas' && (
            <>
              <p style={est.textoModal}>
                Esta medição não tem toques suficientes para mostrar intervalo — é preciso pelo
                menos dois.
              </p>
              {/* O motivo nao depende de toque: a parada marcada vale igual. */}
              <ParadasPorMotivo conferencia={conferencia} medicoes={medicoes} unidade={unidade} comLeitura={false} />
            </>
          )}

          {pronto && (
            <>
              {/* 2. O QUE AS PARADAS ROUBARAM — primeiro, porque e' o que
                  move a acao. So' com parada marcada. */}
              {(r.deixou?.total > 0 || r.roubo?.roubados > 0 || roubadosPelasLacunas(r.leitura)?.roubados > 0)
                && <BlocoRoubados r={r} conferencia={conferencia} unidade={unidade} />}

              {/* 3. INDICADORES */}
              <Indicadores
                conferencia={conferencia} leitura={r.leitura} takt={r.takt} unidade={unidade} tom={frases.tom}
                nMedicoes={ehJuncao ? n : 0}
              />

              {/* POR QUE A LINHA PAROU — logo abaixo do cartao Paradas
                  marcadas, que diz quanto; aqui, por qual motivo. */}
              <ParadasPorMotivo
                conferencia={conferencia} medicoes={medicoes} unidade={unidade}
                entreToquesMs={r.deixou?.partes.paradas > 0 ? r.deixou.partes.paradasMs : null}
              />

              {/* Na junção, cada medicao com os proprios numeros e a junção
                  na ultima linha: e' aqui que se ve se juntar faz sentido. */}
              {r.juncao && <TabelaMedicoes r={r} unidade={unidade} />}

              {/* 4. GRAFICO */}
              <GraficoIntervalos
                leitura={r.leitura} unidade={unidade} altura={300} segmentos={segmentosDaJuncao(r.juncao)}
              />

              {/* 4. EXPLICACAO — o veredito em palavras e onde a linha parou. */}
              <div style={est.vavLeituraGrade}>
                <section aria-label={ehJuncao ? 'Leitura da junção' : 'Leitura da medição'}>
                  <h3 style={est.vavSecaoTitulo}>{ehJuncao ? 'Leitura da junção' : 'Leitura da medição'}</h3>
                  <div style={{ ...est.veredito, ...TOM[frases.tom] }}>
                    <p style={est.vereditoManchete}>{frases.manchete}</p>
                    <ul style={est.vavLista}>
                      {frases.linhas.map((l) => <li key={l} style={est.vereditoTexto}>{l}</li>)}
                    </ul>
                  </div>
                </section>
                {r.leitura.suficiente && r.leitura.lacunas.length > 0 && (
                  <TabelaLacunas leitura={r.leitura} unidade={unidade} juncao={r.juncao} />
                )}
              </div>

              {/* 5. A CONCLUSAO DO PCP — logo depois da leitura, que e' a que
                  ela responde. Salva pelo botao do topo. */}
              {podeAnalisar && (
                <section aria-label="Análise do PCP">
                  <h3 style={est.vavSecaoTitulo}>Análise do PCP</h3>
                  {analisada ? (
                    <NotasSalvas conferencia={conferencia} medicoes={medicoes} />
                  ) : (
                    <>
                      {jaAnalisadas.length > 0 && (
                        <>
                          <p style={est.vavSecaoDica}>
                            {jaAnalisadas.length === 1 ? 'Já analisada' : 'Já analisadas'} — salvar a junção substitui:
                          </p>
                          {jaAnalisadas.map((c) => (
                            <p key={c.id} style={est.vavAnaliseNota}>
                              {[horaDaMedicao(c), c.analisada_por, formatarDataHora(c.analisada_em)].filter(Boolean).join(' · ')}
                              {': '}{c.analise_nota || 'salva sem comentário'}
                            </p>
                          ))}
                        </>
                      )}
                      <p style={est.vavSecaoDica}>
                        {ehJuncao
                          ? `Opcional. Vai para as ${n} medições quando você clica em Salvar análise das ${n} e fechar, no alto do painel, com "Junção de ${n} medições (${faixaDaJuncao(medicoes)})" no começo — quem abrir uma delas depois sabe que foi lida junto com as outras. As ${n} saem da lista e vão para Analisadas.`
                          : 'Opcional. Vai junto quando você clica em Salvar análise e fechar, no alto do painel.'}
                      </p>
                      <textarea
                        aria-label="Análise do PCP"
                        rows={3}
                        // Na junção o comeco da nota e' do sistema: o campo
                        // deixa o resto dos 2.000 caracteres do servidor.
                        maxLength={ehJuncao ? 2000 - notaDaJuncao(medicoes, '').length - 1 : 2000}
                        value={analise.nota}
                        onChange={(ev) => analise.mudarNota(ev.target.value)}
                        // O que se digitasse durante o envio nao iria junto.
                        disabled={salvando}
                        placeholder="Ex.: lacunas por falta de caixa às 9h; abastecer antes da troca de turno"
                        style={est.vavAnaliseEntrada}
                      />
                    </>
                  )}
                </section>
              )}

              {/* Os termos definidos so' aparecem com a leitura completa. */}
              {r.leitura.suficiente && (
                <ComoLer
                  leitura={r.leitura} unidade={unidade} juncao={ehJuncao} roubo={r.roubo?.roubados > 0}
                  lacunas={roubadosPelasLacunas(r.leitura)?.roubados > 0} deixou={r.deixou?.total > 0}
                  motivos={somarParadas(conferencia.paradas).totalMs > 0}
                />
              )}
            </>
          )}
        </div>
      </section>

      {pronto && (
        <FolhaVolumeAVolume
          conferencia={conferencia} leitura={r.leitura} takt={r.takt} frases={frases}
          unidade={unidade} r={r} maquinasDoGrupo={maquinasDoGrupo}
        />
      )}
    </>
  );
}

/**
 * OS NUMEROS DA MEDICAO — oito cartoes, duas linhas de quatro (v2.99.5).
 * Em cima, o TEMPO POR VOLUME nas tres camadas, ao lado do takt: no
 * periodo (o veredito, contra o takt), com a linha rodando (a diferenca sao
 * as paradas marcadas) e sem as lacunas (a diferenca sao as paradas que
 * ninguem marcou; o que sobra e' o passo da linha). Embaixo, o que saiu e
 * o que se perdeu: volumes, paradas marcadas, lacunas (com os volumes que
 * roubaram) e volumes/hora da lista.
 *
 * Antes, "sem as lacunas" e o takt iam numa faixa de apoio cinza, e o PCP
 * nao achava o passo da linha na tela (03/11). Todos saem de
 * numerosDaLeitura, porHoraDaMedicao e somarParadas — os mesmos da folha
 * A4; nenhum numero novo nasce aqui.
 */
function Indicadores({
  conferencia, leitura, takt, unidade, tom, nMedicoes = 0,
}) {
  const ehJuncao = nMedicoes > 1;
  const numeros = numerosDaLeitura(leitura, takt, unidade, { juncao: ehJuncao });
  const doDominio = Object.fromEntries(numeros.map((k) => [k.chave, k]));
  const par = somarParadas(conferencia.paradas);
  const volumes = {
    chave: 'volumes',
    rotulo: capital(unidade.plural),
    valor: String(conferencia.pecas),
    // Com a leitura insuficiente, o cartao "Intervalos tocados" ja' diz isso.
    sub: leitura.suficiente
      ? `${leitura.n} ${leitura.n === 1 ? 'intervalo medido' : 'intervalos medidos'}${ehJuncao ? `, nas ${nMedicoes} medições` : ''}`
      : null,
  };
  // A soma das paradas marcadas na medicao INTEIRA — o mesmo numero da
  // coluna "Parado" da lista e do "Parado (marcado)" da folha. Inclui a
  // troca antes do 1o toque, que os dois tempos por volume nao contem: o
  // subtitulo diz isso, para a diferenca entre eles nao ser lida como ela.
  const paradas = {
    chave: 'paradas',
    rotulo: 'Paradas marcadas',
    valor: par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—',
    sub: par.n > 0
      ? `${par.n} ${par.n === 1 ? 'parada' : 'paradas'} ${ehJuncao ? `nas ${nMedicoes} medições inteiras` : 'na medição inteira'}, também fora dos toques`
      : 'nenhuma parada marcada',
  };
  // Volumes/hora depois de Lacunas: vale com qualquer leitura, porque sai
  // da medicao inteira, nao dos intervalos.
  // Na junção: volumes somados / tempos somados — a lista nao tem esse
  // numero, entao o subtitulo nao fala dela.
  const doPapel = porHoraDaMedicao(conferencia, unidade);
  const porHora = {
    ...doPapel,
    sub: ehJuncao ? `nas ${nMedicoes} medições inteiras, com as paradas` : `${doPapel.sub} — o mesmo da lista`,
  };
  const principais = leitura.suficiente
    ? [doDominio.periodo, doDominio.takt, doDominio.rodando, doDominio.normal,
      volumes, paradas, doDominio.lacunas, porHora]
    : [volumes, ...numeros, paradas, porHora];
  const corVeredito = COR_DO_TOM[tom];

  return (
    <>
      <div style={{ ...est.vavKpis, gridTemplateColumns: colunasDosKpis(principais.length) }}>
        {principais.map((k) => (
          <div
            key={k.chave}
            style={k.chave === 'periodo' && corVeredito
              ? { ...est.vavKpi, boxShadow: `inset 0 3px 0 ${corVeredito}` }
              : est.vavKpi}
          >
            <div style={est.vavKpiRotulo}>{k.rotulo}</div>
            <ValorComUnidade valor={k.valor} />
            {k.sub && <div style={est.vavKpiSub}>{k.sub}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * POR QUE A LINHA PAROU (v2.104.0) — as paradas marcadas por motivo, o
 * maior primeiro. O volume a volume dizia QUANTO a linha parou e nunca POR
 * QUE: o motivo estava gravado em cada parada, mas so' o Pareto do Ritmo
 * por maquina o mostrava (pedido do PCP, 10/11). Mesmas paradas e mesmo
 * total do cartao Paradas marcadas — a medicao inteira, as do cronometro e
 * as anotadas depois —, por isso nao fecha com o "Paradas marcadas" do De
 * onde veio, que e' so' o que o cronometro tirou entre o 1o e o ultimo
 * toque: a dica diz isso quando os dois diferem.
 *
 * Tempo, nao volumes, por motivo: a parada anotada depois fica dentro dos
 * intervalos (e vira lacuna so' se o intervalo passou do dobro do normal),
 * e a de antes do 1o toque fica fora deles — converter cada motivo em
 * volumes daria partes que nao fecham com o total do De onde veio. O total
 * sai exato (8min43s), nao arredondado como no cartao (9 min): senao as
 * linhas nao fechavam com ele. Sem parada marcada, nada (o cartao ja' diz
 * "nenhuma").
 *
 * `entreToquesMs`: o "Paradas marcadas" do De onde veio, so' quando a linha
 * dele aparece (ver deixouDeEmbalar).
 */
function ParadasPorMotivo({
  conferencia, medicoes, unidade, entreToquesMs = null, comLeitura = true,
}) {
  const pm = paradasPorMotivo(paradasDaAnalise(conferencia, medicoes));
  if (!pm) return null;
  return (
    <section aria-label="Paradas marcadas, por motivo">
      <h3 style={est.vavSecaoTitulo}>Por que a linha parou — paradas marcadas, por motivo</h3>
      <p style={est.vavSecaoDica}>
        {/* Com poucos toques nao ha' cartoes na tela, nem "fora dos toques". */}
        {frasesDasParadas(pm, {
          unidade, nMedicoes: medicoes.length, entreToquesMs, comToques: comLeitura, comCartao: comLeitura,
        })}
      </p>
      <div style={est.vavMotivosGrade}>
        {pm.motivos.map((m) => (
          <Fragment key={m.motivo}>
            <span style={est.paretoRotulo} title={m.rotulo}>{m.rotulo}</span>
            <span style={est.paretoTrilha}>
              <i style={{ ...est.paretoBarra, width: `${Math.max(4, m.pct)}%` }} />
            </span>
            <span style={est.vavMotivoValor}>
              <span style={est.vavMotivoValorForte}>{tempoSomado(m.ms)}</span>
              {' · '}{qtdParadas(m.n)} · {pctDoParado(m.pct)}
            </span>
            {m.observacoes.length > 0 && (
              <span style={est.vavMotivoObs}>Obs.: {m.observacoes.join(' · ')}</span>
            )}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

/**
 * As paradas que o quadro le. Na junção, a observacao leva a hora da
 * medicao dela: "faltou caixa" sozinho nao diz se foi na das 07:11 ou na
 * das 07:52. As mesmas paradas de medicaoDaJuncao, na mesma ordem.
 */
function paradasDaAnalise(conferencia, medicoes) {
  if (!conferencia.juncao) return conferencia.paradas;
  return medicoes.flatMap((c) => (c.paradas || []).map((p) => {
    const obs = String(p?.observacao ?? '').trim();
    return obs ? { ...p, observacao: `${horaDaMedicao(c)}: ${obs}` } : p;
  }));
}

/** "77.0 s" -> 77.0 grande e o "s" menor ao lado; o resto sai inteiro. */
function ValorComUnidade({ valor }) {
  const m = /^(\d[\d.,]*) (s|min|h)$/.exec(valor);
  if (!m) return <div style={est.vavKpiValor}>{valor}</div>;
  return (
    <div style={est.vavKpiValor}>
      {m[1]}{' '}<span style={est.vavKpiUnidade}>{m[2]}</span>
    </div>
  );
}

/**
 * O criterio, por extenso — o mesmo da nota da folha A4, item por item.
 * Contra o takt vai o relogio entre o primeiro e o ultimo toque dividido
 * pelos INTERVALOS (volumes - 1), menos o setup marcado no trecho quando ha'
 * setup planejado — exatamente periodoPorPeca.
 */
function definicoes(leitura, unidade, {
  juncao = false, roubo: roubo0 = false, lacunas: lacunas0 = false, deixou = false, motivos = false,
} = {}) {
  // Com o total num passo so', ele substitui as duas contas separadas.
  const roubo = roubo0 && !deixou;
  const lacunas = lacunas0 && !deixou;
  const toque = unidade.singular === 'volume' ? 'volume' : 'toque';
  const { fatorLacuna, minIntervalos } = leitura.criterios;
  return [
    ...(juncao ? [['Junção', `medições do mesmo produto, na mesma máquina e na mesma semana, lidas como uma só. Tudo somado pelo tempo, nunca a média das taxas. O tempo entre uma medição e a seguinte não foi medido: não vira intervalo, lacuna nem parada. A lacuna é contra o normal da junção, e por isso a contagem pode diferir da de cada medição sozinha. O passo de cada medição (a coluna "Sem as lacunas" da tabela) é a média sem as lacunas, comparada só entre as que têm ${minIntervalos} intervalos ou mais fora das lacunas — abaixo disso, "—"; "o passo muda" só quando a diferença passa de ${CRITERIOS_JUNCAO.passoIgualPct}% e do dobro do erro das médias.`]] : []),
    ...(deixou ? [[`${capital(unidade.plural)} que ${deixaramDe(unidade)}`, `a medição inteira no passo da linha sem parada nem lacuna, menos o que saiu. Abre em três partes, no mesmo passo, que fecham com o total: as paradas marcadas no cronômetro entre o 1º e o último ${unidade.singular}; as lacunas (o tempo além do normal); e o tempo antes do 1º e depois do último ${unidade.singular}, menos o ${unidade.singular} da largada. A parada anotada depois (no resultado do tablet ou aqui no PC) fica dentro dos intervalos: entra na lacuna, se virou uma, e não conta duas vezes.${juncao ? ' Na junção, o passo é o da junção.' : ''} Não projeta meta nem capacidade: é o passo que a própria linha fez.`]] : []),
    ...(roubo ? [[`${capital(unidade.plural)} roubados pelas paradas`, `o que teria saído no mesmo tempo, no passo que a linha fez rodando${juncao ? ' em cada medição' : ''}, menos o que saiu. As paradas são as marcadas, setup incluído. Não projeta meta nem capacidade: é o que a própria linha já fez.${juncao ? ' Na junção, soma os de cada medição.' : ''}`]] : []),
    ...(motivos ? [['Por que a linha parou', `as paradas marcadas ${juncao ? 'nas medições inteiras' : 'na medição inteira'}, por motivo: as do cronômetro e as anotadas depois (no resultado do tablet ou aqui no PC), também as de antes do 1º e depois do último ${unidade.singular}. O total é o do cartão Paradas marcadas. O "Paradas marcadas" do De onde veio conta só o que o cronômetro tirou entre o 1º e o último ${unidade.singular}, e por isso pode dar outro número. A parada anotada depois fica dentro dos intervalos: quando o intervalo passou de ${leitura.criterios.fatorLacuna}× o normal, ela aparece também como lacuna — é a mesma parada, agora com motivo. Em tempo, e não em ${unidade.plural}: convertidas, essas partes não fechariam com o total do De onde veio.`]] : []),
    ...(lacunas ? [[`${capital(unidade.plural)} roubados pelas lacunas`, `o tempo das lacunas além do normal, dividido pelo passo sem as lacunas: o que daria para ter saído nesse tempo, no passo da própria linha.${juncao ? ' Na junção, contra o normal da junção.' : ''} Não soma com os roubados pelas paradas: a parada anotada depois (no tablet ou aqui no PC) continua dentro dos intervalos e pode virar lacuna — somando, contaria duas vezes.`]] : []),
    ['Intervalo', `tempo de um ${toque} até o seguinte, com a linha rodando. As paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) continuam dentro. O primeiro toque não tem intervalo: o intervalo vai de um toque ao seguinte, e o tempo antes do primeiro toque não entra.`],
    [`Por ${unidade.singular} no período`, 'relógio do primeiro ao último toque, com as paradas dentro, dividido pelo número de intervalos. Só o setup marcado entre os toques sai do relógio, e só quando o grupo tem setup planejado (ele já saiu das horas do takt). É o que vai contra o takt — a mesma régua do programa da semana.'],
    [`Por ${unidade.singular} com a linha rodando`, 'soma dos intervalos dividida pela quantidade de intervalos.'],
    [`Por ${unidade.singular} sem as lacunas`, `a média dos intervalos que não são lacuna: o passo da linha, sem parada marcada nem lacuna. A diferença para o "com a linha rodando" são as paradas que ninguém marcou.`],
    ['Lacuna', `intervalo maior que ${fatorLacuna}× o normal — o "por ${unidade.singular} sem as lacunas". Parada marcada e passo lento não viram lacuna.`],
    [`${capital(unidade.plural)}/hora`, `${unidade.plural} da medição ÷ o tempo da medição inteira, com as paradas dentro — o mesmo número da lista e do tablet. Por isso 3.600 ÷ o por ${unidade.singular} no período não dá este número: a medição inteira inclui o tempo antes do primeiro toque e depois do último e, quando o grupo tem setup planejado, o setup marcado entre os toques, que o por ${unidade.singular} no período tira.`],
    ['Leitura', `a partir de ${minIntervalos} intervalos.${unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é em volumes, e o takt usa as horas dos dias programados.' : ''}`],
  ];
}

function ComoLer({
  leitura, unidade, juncao, roubo, lacunas, deixou, motivos,
}) {
  return (
    <section aria-label="Como ler estes números">
      <h3 style={est.vavSecaoTitulo}>Como ler estes números</h3>
      <dl style={est.vavComoLer}>
        {definicoes(leitura, unidade, {
          juncao, roubo, lacunas, deixou, motivos,
        }).map(([termo, texto]) => (
          <div key={termo} style={est.vavComoLerItem}>
            <dt style={{ display: 'inline', ...est.vavComoLerTermo }}>{termo}: </dt>
            <dd style={{ display: 'inline', margin: 0 }}>{texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function notaDoCriterio(leitura, unidade, {
  juncao = false, roubo: roubo0 = false, lacunas: lacunas0 = false, deixou = false,
} = {}) {
  const roubo = roubo0 && !deixou;
  const lacunas = lacunas0 && !deixou;
  return (juncao
    ? 'Junção = medições do mesmo produto, na mesma máquina e na mesma semana, somadas pelo tempo (nunca a média das taxas); '
      + 'o tempo entre uma medição e a seguinte não foi medido e não entra. '
      + `Sem as lacunas, na tabela das medições = o passo de cada uma, comparado só entre as que têm ${leitura.criterios.minIntervalos} intervalos ou mais fora das lacunas ("—" abaixo disso); `
      + `"o passo muda" só com mais de ${CRITERIOS_JUNCAO.passoIgualPct}% de diferença e mais que o dobro do erro das médias. `
    : '')
    + (roubo
      ? `${capital(unidade.plural)} roubados pelas paradas = o que teria saído no mesmo tempo, no passo da linha rodando${juncao ? ' de cada medição' : ''}, menos o que saiu (paradas marcadas, setup incluído). `
      : '')
    + (deixou
      ? `${capital(unidade.plural)} que ${deixaramDe(unidade)} = a medição inteira no passo sem parada nem lacuna, menos o que saiu; `
        + `abre em paradas marcadas no cronômetro entre os toques, lacunas e o tempo antes do 1º e depois do último ${unidade.singular} (menos o da largada), no mesmo passo. `
      : '')
    + (lacunas
      ? `${capital(unidade.plural)} roubados pelas lacunas = o tempo das lacunas além do normal ÷ o passo sem as lacunas; não soma com os das paradas (a parada anotada depois pode virar lacuna). `
      : '')
    + `Intervalo = tempo de um ${unidade.singular === 'volume' ? 'volume' : 'toque'} até o seguinte, com a linha rodando: `
    + 'as paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) '
    + 'continuam dentro dos intervalos. O primeiro toque não tem intervalo: o intervalo vai de um toque ao '
    + 'seguinte, e o tempo antes do primeiro toque não entra. Contra o takt vai o relógio do primeiro ao último toque ÷ intervalos, com as paradas dentro '
    + '(sem o setup marcado entre os toques, quando o grupo tem setup planejado) — a mesma régua do programa da semana. '
    + 'Com a linha rodando = soma dos intervalos ÷ quantidade. '
    + `Sem as lacunas = a média dos intervalos que não são lacuna: o passo da linha. `
    + `Lacuna = intervalo maior que ${leitura.criterios.fatorLacuna}× o normal (o sem as lacunas). `
    // Sem "o mesmo da lista": no papel nao ha' lista.
    + `${capital(unidade.plural)}/hora = ${unidade.plural} ÷ tempo da medição inteira, com as paradas dentro: `
    + 'inclui o tempo antes do primeiro toque e depois do último e, com setup planejado, o setup entre os toques, '
    + `que o por ${unidade.singular} no período tira. `
    + `Leitura a partir de ${leitura.criterios.minIntervalos} intervalos.`
    + (unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é em volumes, e o takt usa as horas dos dias programados.' : '');
}

/**
 * As lacunas, na ordem em que aconteceram. Na junção, cada uma diz de qual
 * medicao e' e o volume DENTRO dela — o numero do eixo do grafico.
 */
function TabelaLacunas({ leitura, unidade, juncao = null }) {
  const lacunas = juncao ? juncao.lacunas : leitura.lacunas;
  return (
    <section aria-label="Lacunas">
      <h3 style={est.vavSecaoTitulo}>Onde a linha parou sem parada marcada</h3>
      <p style={est.vavSecaoDica}>
        Intervalos acima de {leitura.criterios.fatorLacuna}× o normal{juncao ? ' da junção' : ''} ({emSegundos(leitura.normalMs)}),
        na ordem em que aconteceram.
      </p>
      <div style={est.vavTabelaMoldura}>
        <table style={est.tabela}>
          <thead>
            <tr>
              {juncao && <th style={est.vavThTexto}>Medição</th>}
              <th style={est.vavTh}>{capital(unidade.singular)} nº</th>
              <th style={est.vavTh}>Intervalo</th>
              <th style={est.vavTh}>Além do normal</th>
            </tr>
          </thead>
          <tbody>
            {lacunas.map((l) => (
              <tr key={l.indice}>
                {juncao && <td style={est.vavTdTexto}>{faixaHoraria(l.conferencia) || horaDaMedicao(l.conferencia)}</td>}
                <td style={est.vavTd}>{juncao ? l.volume : l.indice + 2}</td>
                <td style={est.vavTdForte}>{emSegundos(l.ms)}</td>
                <td style={est.vavTd}>{emSegundos(l.ms - leitura.normalMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** As medicoes da junção no grafico: onde cada uma comeca, e a hora dela. */
const segmentosDaJuncao = (juncao) => (juncao
  ? juncao.medicoes.map((m) => ({ inicio: m.inicio, rotulo: horaDaMedicao(m.conferencia) }))
  : null);

/**
 * O tempo entre as medicoes da junção, escrito: ele nao foi medido e nao
 * entra em conta nenhuma. No mesmo dia, quanto foi; em dias diferentes,
 * so' a regra (somar a noite nao diria nada).
 */
function textoDoIntervaloEntreMedicoes(medicoes) {
  let fora = 0;
  let mesmoDia = true;
  for (let k = 1; k < medicoes.length; k++) {
    const fim = medicoes[k - 1].finalizado_em;
    const ini = medicoes[k].iniciado_em;
    if (!fim || !ini) continue;
    if (new Date(fim).toDateString() !== new Date(ini).toDateString()) mesmoDia = false;
    fora += Math.max(0, new Date(ini) - new Date(fim));
  }
  return mesmoDia && fora >= 60000
    ? `Entre uma medição e a seguinte, ${formatarDuracao(fora)} sem medição: ficam fora da conta.`
    : 'O tempo entre uma medição e a seguinte não foi medido e fica fora da conta.';
}

/**
 * As linhas da tabela das medicoes da junção — as mesmas na tela e no
 * papel. Cada medicao com os proprios numeros; a ultima linha e' a junção.
 */
function linhasDasMedicoes(r, unidade) {
  const { juncao, leitura } = r;
  const parado = (paradas) => {
    const ms = somarParadas(paradas).totalMs;
    return ms > 0 ? formatarDuracao(ms) : '—';
  };
  const linhas = juncao.medicoes.map((m) => ({
    chave: m.conferencia.id,
    rotulo: faixaHoraria(m.conferencia) || horaDaMedicao(m.conferencia),
    volumes: String(m.conferencia.pecas),
    medida: formatarDuracao(Number(m.conferencia.duracao_ms)),
    parado: parado(m.conferencia.paradas),
    roubados: m.roubo ? String(m.roubo.roubados) : '—',
    lacunas: m.lacunasRoubados != null ? String(m.lacunasRoubados) : '—',
    deixou: m.deixou != null ? String(m.deixou) : '—',
    periodo: m.periodoMs ? emSegundos(m.periodoMs) : '—',
    rodando: m.rodandoMs ? emSegundos(m.rodandoMs) : '—',
    // O passo que a leitura compara: so' com a leitura minima da medicao.
    normal: m.nSemLacunas >= leitura.criterios.minIntervalos && m.normalMs ? emSegundos(m.normalMs) : '—',
    porHora: porHoraDaMedicao(m.conferencia, unidade).valor,
  }));
  return [...linhas, {
    chave: 'juncao',
    total: true,
    rotulo: 'Junção',
    volumes: String(juncao.total.pecas),
    medida: formatarDuracao(juncao.total.duracao_ms),
    parado: parado(juncao.total.paradas),
    roubados: juncao.roubo ? String(juncao.roubo.roubados) : '—',
    lacunas: roubadosPelasLacunas(leitura) ? String(roubadosPelasLacunas(leitura).roubados) : '—',
    deixou: juncao.deixou ? String(juncao.deixou.total) : '—',
    periodo: leitura.periodoMs ? emSegundos(leitura.periodoMs) : '—',
    rodando: leitura.suficiente ? emSegundos(leitura.mediaMs) : '—',
    normal: leitura.suficiente ? emSegundos(leitura.normalMs) : '—',
    porHora: porHoraDaMedicao(juncao.total, unidade).valor,
  }];
}

/* Com o total num passo so' (deixouDeEmbalar), uma coluna: ele ja' traz
   paradas e lacunas. Sem ele (medicao sem relogio entre toques), as duas. */
const COLUNAS_MEDICOES = (unidade, comDeixou) => [
  ['volumes', capital(unidade.plural)],
  ['medida', 'Medida'],
  ['parado', 'Parado'],
  ...(comDeixou
    ? [['deixou', `${capital(deixaramDe(unidade))}`]]
    : [['roubados', 'Roubados pelas paradas'], ['lacunas', 'Roubados pelas lacunas']]),
  ['periodo', `Por ${unidade.singular} no período`],
  ['rodando', 'Com a linha rodando'],
  ['normal', 'Sem as lacunas'],
  ['porHora', `${capital(unidade.plural)}/hora`],
];

function TabelaMedicoes({ r, unidade }) {
  const n = r.juncao.medicoes.length;
  return (
    <section aria-label={`As ${n} medições`}>
      <h3 style={est.vavSecaoTitulo}>As {n} medições</h3>
      <p style={est.vavSecaoDica}>
        Cada uma com os próprios números, e a junção na última linha. O passo é o "sem as lacunas":
        se uma destoar muito nele, ela tem outra história.
      </p>
      <div style={{ ...est.vavTabelaMoldura, ...est.vavTabelaRolagem }}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.vavThTexto}>Medição</th>
              {COLUNAS_MEDICOES(unidade, Boolean(r.juncao.deixou)).map(([chave, rotulo]) => <th key={chave} style={est.vavTh}>{rotulo}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhasDasMedicoes(r, unidade).map((l) => (
              <tr key={l.chave} style={l.total ? est.vavTrTotal : undefined}>
                <td style={est.vavTdTexto}>{l.rotulo}</td>
                {COLUNAS_MEDICOES(unidade, Boolean(r.juncao.deixou)).map(([chave]) => (
                  <td
                    key={chave}
                    style={(chave === 'roubados' || chave === 'lacunas' || chave === 'deixou') && l[chave] !== '—' ? est.vavTdRoubado : (l.total ? est.vavTdForte : est.vavTd)}
                  >
                    {l[chave]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * OS VOLUMES ROUBADOS — pelas paradas marcadas e, a parte, pelas lacunas
 * (v2.99.5). Das paradas: o numero grande e, por medicao, uma barra — o que
 * saiu e, hachurado, o que as paradas levaram, todas na mesma escala (a
 * medicao que mais teria produzido enche a barra), para a maior perda
 * saltar a' vista. Das lacunas: o numero e de onde ele sai.
 *
 * NAO SOMA os dois (ver roubadosPelasLacunas): a parada anotada depois pode
 * estar nos dois, e as reguas sao outras. E cada um pede uma acao: parada
 * marcada, a causa; lacuna, descobrir o que houve e cobrar o apontamento.
 */
function BlocoRoubados({ r, conferencia, unidade }) {
  if (r.deixou?.total > 0) return <BlocoDeixou r={r} conferencia={conferencia} unidade={unidade} />;
  const ehJuncao = Boolean(r.juncao);
  const lac = roubadosPelasLacunas(r.leitura);
  const temParadas = r.roubo?.roubados > 0;
  const temLacunas = lac?.roubados > 0;
  const plural = (q) => (q === 1 ? unidade.singular : unidade.plural);
  const onde = ehJuncao ? ` nos ${formatarDuracao(Number(conferencia.duracao_ms))} medidos` : ' nesta medição';
  const rotulo = [temParadas && 'pelas paradas', temLacunas && 'pelas lacunas'].filter(Boolean).join(' e ');

  return (
    <section style={est.vavRoubo} aria-label={`${capital(unidade.plural)} roubados ${rotulo}`}>
      {temParadas && <RoubadosPelasParadas r={r} conferencia={conferencia} unidade={unidade} onde={onde} plural={plural} />}
      {temLacunas && (
        <div style={{ ...est.vavRouboCab, ...(temParadas ? est.vavRouboSeparado : {}) }}>
          <div style={est.vavRouboNumero}>
            ≈{lac.roubados}
            <span style={est.vavRouboUnidade}>{plural(lac.roubados)}</span>
          </div>
          <div style={est.vavRouboTexto}>
            <span style={est.vavRouboTitulo}>
              {deixaramDe(unidade, lac.roubados)} por causa das lacunas{onde} — paradas que ninguém marcou
            </span>
            <span style={est.vavRouboSub}>
              {lac.n} {lac.n === 1 ? 'lacuna somou' : 'lacunas somaram'} {tempoSomado(lac.excessoMs)} além do normal;
              {' '}no passo da linha sem as lacunas ({emSegundos(lac.passoMs)} por {unidade.singular}), dariam {lac.roubados} {plural(lac.roubados)}.
            </span>
          </div>
        </div>
      )}
      <p style={est.vavRouboPe}>
        {temParadas && (
          <>
            A conta não projeta nada: é o passo que a linha fez rodando{ehJuncao ? ' em cada medição' : ''}, aplicado
            ao tempo em que ela ficou parada (paradas marcadas, setup incluído).
          </>
        )}
        {temParadas && temLacunas && ' '}
        {temLacunas && (temParadas
          ? 'Os das lacunas ficam à parte, sem somar: a parada anotada depois (no tablet ou aqui no PC) continua dentro dos intervalos e pode virar lacuna, e contaria duas vezes.'
          : 'As lacunas são intervalos maiores que o dobro do normal sem parada marcada: a perda que não aparece no Pareto de paradas.')}
      </p>
    </section>
  );
}

/**
 * O QUE DEIXOU DE SER EMBALADO (v2.99.6) — o total num passo so', as barras
 * por medicao (o que saiu e, hachurado, o que deixou de sair) e DE ONDE
 * VEIO: paradas marcadas, lacunas e antes/depois, que fecham com o total
 * (ver deixouDeEmbalar). Pedido do PCP: "roubados" virou "deixaram de ser
 * embalados" — e' a pergunta da fabrica, e um numero so' para responder.
 */
function BlocoDeixou({ r, conferencia, unidade }) {
  const ehJuncao = Boolean(r.juncao);
  const d = r.deixou;
  const qtd = (q) => (q === 1 ? unidade.singular : unidade.plural);
  const pct = d.saiu > 0 ? Math.round((d.total / d.saiu) * 100) : null;
  const itens = ehJuncao
    ? r.juncao.medicoes.map((m) => ({
      chave: m.conferencia.id,
      rotulo: faixaHoraria(m.conferencia) || horaDaMedicao(m.conferencia),
      paradas: m.conferencia.paradas,
      saiu: Number(m.conferencia.pecas) || 0,
      perdeu: m.deixou || 0,
    }))
    : [{
      chave: conferencia.id,
      rotulo: faixaHoraria(conferencia) || 'Esta medição',
      paradas: conferencia.paradas,
      saiu: d.saiu,
      perdeu: d.total,
    }];
  const escala = Math.max(...itens.map((x) => x.saiu + x.perdeu), 1);
  const causas = [
    ['Paradas marcadas', `${formatarDuracao(d.partes.paradasMs)} no cronômetro, entre o 1º e o último ${unidade.singular}`, d.partes.paradas],
    ['Lacunas', `paradas que ninguém marcou: ${tempoSomado(d.partes.lacunasMs)} além do normal`, d.partes.lacunas],
    [`Antes do 1º e depois do último ${unidade.singular}`, `${tempoSomado(d.partes.foraMs)} fora dos toques, além do ${unidade.singular} da largada`, d.partes.fora],
  ].filter(([, , n]) => n > 0);

  return (
    <section style={est.vavRoubo} aria-label={`${capital(unidade.plural)} que ${deixaramDe(unidade)}`}>
      <div style={est.vavRouboCab}>
        <div style={est.vavRouboNumero}>
          {d.total}
          <span style={est.vavRouboUnidade}>{qtd(d.total)}</span>
        </div>
        <div style={est.vavRouboTexto}>
          <span style={est.vavRouboTitulo}>
            {deixaramDe(unidade, d.total)}
            {ehJuncao ? ` nos ${formatarDuracao(d.duracaoMs)} medidos` : ' nesta medição'}
          </span>
          <span style={est.vavRouboSub}>
            Saíram {d.saiu}. No passo da linha sem parada nem lacuna ({emSegundos(d.passoMs)} por {unidade.singular}),
            {' '}teriam saído {d.potencial} no mesmo tempo{pct > 0 ? `: ${pct}% a mais.` : '.'}
          </span>
        </div>
      </div>
      <div
        style={est.vavRouboBarras}
        role="img"
        aria-label={itens.map((x) => `${x.rotulo}: ${x.saiu} saíram, ${x.perdeu} ${naoSaiu(unidade, x.perdeu)}`).join('; ')}
      >
        {itens.map((x) => {
          const parado = somarParadas(x.paradas).totalMs;
          return (
            <Fragment key={x.chave}>
              <div style={est.vavRouboRotulo}>
                {x.rotulo}
                <span style={est.vavRouboRotuloSub}>{parado > 0 ? `parado ${formatarDuracao(parado)}` : 'sem parada marcada'}</span>
              </div>
              <div style={est.vavRouboTrilho}>
                <div style={{ ...est.vavRouboSaiu, width: `${(x.saiu / escala) * 100}%` }}>
                  {x.saiu / escala > 0.18 ? `${x.saiu} saíram` : x.saiu}
                </div>
                {x.perdeu > 0 && <div style={{ ...est.vavRouboRoubou, width: `${(x.perdeu / escala) * 100}%` }} />}
              </div>
              <div style={est.vavRouboValor}>
                <span style={est.vavRouboValorForte}>{x.perdeu}</span> {naoSaiu(unidade, x.perdeu)}
              </div>
            </Fragment>
          );
        })}
      </div>
      {/* De onde veio: no mesmo passo, e a soma e' o total. */}
      <div style={est.vavCausas} aria-label="De onde veio">
        <span style={est.vavCausasTitulo}>De onde veio</span>
        {causas.map(([rotulo, sub, n]) => (
          <div key={rotulo} style={est.vavCausa}>
            <span style={est.vavCausaTexto}>
              <span style={est.vavCausaRotulo}>{rotulo}</span>
              <span style={est.vavCausaSub}>{sub}</span>
            </span>
            <span style={est.vavCausaValor}>≈{n}</span>
          </div>
        ))}
      </div>
      <p style={est.vavRouboPe}>
        A conta não projeta nada: é o passo da própria linha, sem parada nem lacuna, aplicado ao tempo inteiro
        {ehJuncao ? ' de cada medição' : ' da medição'}. As partes fecham com o total. A parada anotada depois (no
        resultado do tablet ou aqui no PC) fica dentro dos intervalos: entra na lacuna, se virou uma, e não conta duas vezes.
      </p>
    </section>
  );
}

/** O numero das paradas e as barras por medicao (o bloco de antes da v2.99.5). */
function RoubadosPelasParadas({
  r, conferencia, unidade, onde, plural,
}) {
  const ehJuncao = Boolean(r.juncao);
  const { saiu, roubados, potencial } = r.roubo;
  const itens = ehJuncao
    ? r.juncao.medicoes.map((m) => ({
      chave: m.conferencia.id,
      rotulo: faixaHoraria(m.conferencia) || horaDaMedicao(m.conferencia),
      paradas: m.conferencia.paradas,
      saiu: Number(m.conferencia.pecas) || 0,
      roubados: m.roubo?.roubados ?? 0,
    }))
    : [{
      chave: conferencia.id,
      rotulo: faixaHoraria(conferencia) || 'Esta medição',
      paradas: conferencia.paradas,
      saiu,
      roubados,
    }];
  const escala = Math.max(...itens.map((x) => x.saiu + x.roubados), 1);
  const pct = saiu > 0 ? Math.round((roubados / saiu) * 100) : null;

  return (
    <>
      <div style={est.vavRouboCab}>
        <div style={est.vavRouboNumero}>
          {roubados}
          <span style={est.vavRouboUnidade}>{plural(roubados)}</span>
        </div>
        <div style={est.vavRouboTexto}>
          <span style={est.vavRouboTitulo}>
            {deixaramDe(unidade, roubados)} por causa das paradas{onde}
          </span>
          <span style={est.vavRouboSub}>
            Saíram {saiu}. No passo da linha rodando, teriam saído {potencial} no mesmo tempo
            {pct > 0 ? `: ${pct}% a mais.` : '.'}
          </span>
        </div>
      </div>
      <div
        style={est.vavRouboBarras}
        role="img"
        aria-label={itens.map((x) => `${x.rotulo}: ${x.saiu} saíram, ${x.roubados} roubados`).join('; ')}
      >
        {itens.map((x) => {
          const parado = somarParadas(x.paradas).totalMs;
          return (
            <Fragment key={x.chave}>
              <div style={est.vavRouboRotulo}>
                {x.rotulo}
                <span style={est.vavRouboRotuloSub}>{parado > 0 ? `parado ${formatarDuracao(parado)}` : 'sem parada marcada'}</span>
              </div>
              <div style={est.vavRouboTrilho}>
                <div style={{ ...est.vavRouboSaiu, width: `${(x.saiu / escala) * 100}%` }}>
                  {x.saiu / escala > 0.18 ? `${x.saiu} saíram` : x.saiu}
                </div>
                {x.roubados > 0 && <div style={{ ...est.vavRouboRoubou, width: `${(x.roubados / escala) * 100}%` }} />}
              </div>
              <div style={est.vavRouboValor}>
                <span style={est.vavRouboValorForte}>{x.roubados}</span> {naoSaiu(unidade, x.roubados)}
              </div>
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

/** A analise ja' salva: a nota, ou as de cada medicao quando a junção difere. */
function NotasSalvas({ conferencia, medicoes }) {
  if (medicoes.length === 1 || conferencia.analise_nota) {
    return (
      <p style={conferencia.analise_nota ? est.vavAnaliseNota : est.vavSecaoDica}>
        {conferencia.analise_nota || 'Salva sem comentário.'}
      </p>
    );
  }
  return medicoes.map((c) => (
    <p key={c.id} style={c.analise_nota ? est.vavAnaliseNota : est.vavSecaoDica}>
      {horaDaMedicao(c)} · {c.analise_nota || 'salva sem comentário'}
    </p>
  ));
}

// O grafico na folha deitada: 297 - 2 x 12 mm = 273 mm uteis, ~1030 px de
// largura; 210 - 24 = 186 mm, ~700 px de altura. Na junção a manchete tem
// mais linhas e o grafico, uma legenda a mais: ele desce para caber na 1a
// pagina (o e2e confere as duas).
const LARGURA_GRAFICO_PAPEL = 1000;
/* A ALTURA DO GRAFICO NA FOLHA E' MEDIDA, nao fixa (v2.101.0). A 1a pagina
   do A4 deitado tem 186 x 273 mm uteis (703 x 1032 px a 96 dpi), e o que
   vem antes do grafico muda de folha para folha: nome do produto em uma ou
   duas linhas, leitura de 3 ou 5 linhas, cartoes com o tempo da semana. Com
   altura fixa, cada ajuste servia aos casos medidos e o seguinte mandava o
   grafico inteiro para a 2a pagina (duas revisoes de 05/11: 739 e 731 px).
   Agora a folha e' desenhada fora da tela na largura do papel, mede onde o
   grafico comeca e quanto ocupam titulo e legenda, e da' as barras o que
   sobra ate' o fim da pagina — entre o minimo, abaixo do qual o grafico
   deixa de mostrar o ritmo, e o maximo de sempre. */
const PAGINA_PAPEL = { altura: 703, largura: 1032, folga: 14 };
// `preferida`: a altura que o grafico tinha fixa antes — com pelo menos
// ela, a conta do tempo da semana (logo depois do grafico) fica na 1a
// pagina tambem (v2.101.2).
const ALTURA_GRAFICO_PAPEL = { min: 150, preferida: 230, max: 260 };
/* LETRA MAIOR NA FOLHA (v2.101.0, pedido do PCP: "aumentar as letras da
   impressao"): 15% em tudo o que a folha escreve, grafico incluido. So'
   nesta folha — `imp` e' dividido com a do Ritmo por maquina, em pe', cuja
   paginacao nao mudou. O grafico continua na 1a pagina (o e2e mede). */
const ESCALA_PAPEL = 1.15;
const maior = (estilo) => ({ ...estilo, fontSize: Math.round(estilo.fontSize * ESCALA_PAPEL * 10) / 10 });
const impF = {
  folha: maior(imp.folha),
  titulo: maior(imp.titulo),
  emissao: maior(imp.emissao),
  campoRotulo: maior(imp.campoRotulo),
  campoValor: maior(imp.campoValor),
  campoSub: { fontSize: Math.round(8 * ESCALA_PAPEL * 10) / 10, color: '#555' },
  tituloSecao: maior(imp.tituloSecao),
  tabela: maior(imp.tabela),
  nota: maior(imp.nota),
  // Os blocos mais juntos que no Ritmo por maquina: a letra maior precisa
  // do espaco, e o grafico tem de ficar na 1a pagina.
  cabecalho: { ...imp.cabecalho, marginBottom: 10 },
  identificacao: { ...imp.identificacao, marginBottom: 10 },
  // A conta do takt, numa linha: borda fina, sem cor (a impressora e' P&B).
  // DEPOIS do grafico: na 1a pagina, o cartao do takt ja' traz as horas.
  tempoSemana: {
    border: '1px solid #999', padding: '4px 8px', margin: '0 0 10px',
    fontSize: Math.round(9.5 * ESCALA_PAPEL * 10) / 10, lineHeight: 1.35, breakInside: 'avoid',
  },
};
// A junção tem a hora de cada medicao acima das barras e mais linhas na
// leitura: o mesmo calculo, com teto menor.
const ALTURA_GRAFICO_PAPEL_JUNCAO = { min: 130, preferida: 185, max: 220 };

/**
 * A FOLHA A4 — num portal, como a do cadastro de maquinas: enquanto a
 * janela esta' aberta, o resto do app some do papel; fechou, o relatorio
 * volta a ser o que imprime.
 *
 * DEITADA (v2.98.0, pedido do PCP): o grafico do intervalo de cada volume
 * e' a peca principal da folha, e em pe' ele cabia em 700 px — com 100
 * volumes, barra de 5 px. Deitada ele ganha 43% de largura. O @page vai
 * na <style> do portal, entao vale SO' para esta folha: as outras (Ritmo,
 * estudo) seguem em pe', pelo @page do index.html.
 */
function FolhaVolumeAVolume({
  conferencia, leitura, takt, frases, unidade, r, maquinasDoGrupo = 1,
}) {
  const tempo = contaDoTempo(takt, maquinasDoGrupo, unidade);
  const refFolha = useRef(null);
  const limites = r.juncao ? ALTURA_GRAFICO_PAPEL_JUNCAO : ALTURA_GRAFICO_PAPEL;
  const [alturaGrafico, setAlturaGrafico] = useState(limites.max);
  /* Mede a cada desenho (o conteudo acima do grafico muda com a leitura,
     o produto, a analise). A medida nao depende da altura das barras — so'
     do que vem antes e da moldura —, entao o segundo desenho repete a conta
     e para. `folha-medindo` mostra a folha fora da tela, na largura do
     papel, so' durante a medida. */
  useLayoutEffect(() => {
    const folha = refFolha.current;
    if (!folha) return;
    folha.classList.add('folha-medindo');
    try {
      const svg = folha.querySelector('svg[aria-label^="Intervalo entre"]');
      const figura = svg?.closest('figure');
      if (!svg || !figura) return;
      const caixa = figura.getBoundingClientRect();
      const moldura = caixa.height - svg.getBoundingClientRect().height;
      const antes = caixa.top - folha.getBoundingClientRect().top;
      const cabe = Math.floor(PAGINA_PAPEL.altura - PAGINA_PAPEL.folga - antes - moldura);
      /* A CONTA DO TEMPO DA SEMANA TAMBEM NA 1a PAGINA (v2.101.2, terceira
         revisao de 05/11): dar as barras TUDO o que sobrava empurrava a
         conta para a 2a pagina justo no caso comum, de nome curto. Agora o
         espaco dela e' reservado sempre que o grafico ainda fica com a
         altura preferida; so' quando a pagina aperta ele leva tudo e a
         conta vai para a seguinte. A distancia da conta ate' o grafico nao
         depende da altura das barras: a medida continua estavel. */
      const conta = folha.querySelector('[data-conta-semana]');
      const reserva = conta ? conta.getBoundingClientRect().bottom - caixa.bottom : 0;
      const comConta = cabe - reserva;
      const alvo = conta && comConta >= limites.preferida
        ? Math.min(limites.max, comConta)
        : Math.max(limites.min, Math.min(limites.max, cabe));
      if (alvo !== alturaGrafico) setAlturaGrafico(alvo);
    } finally {
      folha.classList.remove('folha-medindo');
    }
  });
  const hoje = new Date().toLocaleDateString('pt-BR');
  const par = somarParadas(conferencia.paradas);

  const { juncao, roubo } = r;
  const lacunasRoubo = roubadosPelasLacunas(r.leitura);
  const { deixou } = r;
  const medicoes = juncao ? juncao.medicoes.map((m) => m.conferencia) : [conferencia];
  const n = medicoes.length;
  const motivos = paradasPorMotivo(paradasDaAnalise(conferencia, medicoes));
  const comObsDeParada = Boolean(motivos?.motivos.some((m) => m.observacoes.length));
  // Na junção, as lacunas dizem a medicao e o volume dentro dela.
  const todasLacunas = juncao ? juncao.lacunas : (leitura.lacunas || []);
  const lacunas = [...todasLacunas]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_LACUNAS_PAPEL)
    .sort((a, b) => a.indice - b.indice);
  const restantes = todasLacunas.length - lacunas.length;
  const quando = conferencia.iniciado_em || conferencia.salvo_em;
  const identificacao = juncao
    ? [
      ['Medições', [`${n} · ${formatarDataHora(quando).split(' ')[0]}`, porVideo(medicoes)].filter(Boolean).join(' · ')],
      ['Período', `${faixaDaJuncao(medicoes)} · ${formatarDuracao(Number(conferencia.duracao_ms))} medidos`],
    ]
    : [
      ['Medição', [formatarDataHora(quando), porVideo(medicoes)].filter(Boolean).join(' · ')],
      ['Período', faixaHoraria(conferencia) || formatarDuracao(Number(conferencia.duracao_ms))],
    ];

  return createPortal(
    <div className="somente-impressao" style={impF.folha} ref={refFolha}>
      <style>
        {'@media print { #raiz { display: none !important } @page { size: A4 landscape; margin: 12mm; } }'
          + ` @media screen { .somente-impressao.folha-medindo { display: block !important; position: absolute !important;
              left: -20000px; top: 0; width: ${PAGINA_PAPEL.largura}px; visibility: hidden; } }`}
      </style>

      <header style={impF.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          {/* Mesmo nome do arquivo: o que esta' escrito na folha bate com o
              nome do PDF na pasta. */}
          <h1 style={impF.titulo}>
            Takt Time — {[conferencia.peca || 'sem produto', conferencia.maquina, juncao && `junção de ${n} medições`]
              .filter(Boolean).join(' · ')}
          </h1>
        </div>
        <div style={impF.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      {/* Os roubados vao na identificacao, ao lado do parado que os causou.
          Seis colunas: os das lacunas cabem na mesma linha, e o grafico
          nao desce para a 2a pagina. */}
      <section style={{ ...impF.identificacao, gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {[
          ...identificacao,
          [capital(unidade.plural), String(conferencia.pecas)],
          ['Parado (marcado)', par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'],
          // Com parada que nao chegou a custar um volume, "0" — como na
          // tabela da mesma folha; sem parada marcada, "—".
          // O total num passo so' e de onde veio (ver deixouDeEmbalar); sem
          // ele, as duas contas separadas, como antes.
          ...(deixou ? [
            [capital(deixaramDe(unidade)), `${deixou.total} · teriam saído ${deixou.potencial}`],
            ['De onde veio', [
              `paradas ${deixou.partes.paradas}`, `lacunas ${deixou.partes.lacunas}`,
              deixou.partes.fora > 0 && `antes/depois ${deixou.partes.fora}`,
            ].filter(Boolean).join(' · ')],
          ] : [
            ['Roubados pelas paradas', !roubo ? '—' : (roubo.roubados > 0 ? `${roubo.roubados} · teriam saído ${roubo.potencial}` : '0')],
            ['Roubados pelas lacunas', lacunasRoubo ? `≈${lacunasRoubo.roubados}` : '—'],
          ]),
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={impF.campoRotulo}>{k}</span>
            <span style={impF.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {/* O destaque no papel e' a borda grossa, nao a cor: a impressora da
          fabrica e' P&B. */}
      <section style={{ border: '2px solid #000', padding: '6px 8px', marginBottom: 8, breakInside: 'avoid' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{frases.manchete}</p>
        {frases.linhas.map((l) => <p key={l} style={{ margin: '4px 0 0' }}>{l}</p>)}
      </section>

      {/* Volumes/hora depois de Lacunas, como na tela. */}
      <section style={{ ...impF.identificacao, gridTemplateColumns: 'repeat(6, 1fr)' }}>
        {[
          ...numerosDaLeitura(leitura, takt, unidade, { juncao: Boolean(juncao) }),
          juncao
            ? { ...porHoraDaMedicao(conferencia, unidade), sub: `nas ${n} medições inteiras, com as paradas` }
            : porHoraDaMedicao(conferencia, unidade),
        ].map((k) => {
          /* No papel o cartao do takt diz de que TEMPO ele sai (v2.101.0):
             "40h42min ÷ 8.500 volumes" — a conta inteira vem depois do
             grafico, e a 1a pagina nao ganha uma linha a mais. */
          const sub = k.chave === 'takt' && tempo?.curto ? `${k.sub} · ${tempo.curto}` : k.sub;
          return (
            <div key={k.rotulo} style={imp.campo}>
              <span style={impF.campoRotulo}>{k.rotulo}</span>
              <span style={impF.campoValor}>{k.valor}</span>
              {sub && <span style={impF.campoSub}>{sub}</span>}
            </div>
          );
        })}
      </section>

      <GraficoIntervalos
        leitura={leitura} unidade={unidade} larguraFixa={LARGURA_GRAFICO_PAPEL}
        altura={alturaGrafico}
        segmentos={segmentosDaJuncao(juncao)}
        escalaTexto={ESCALA_PAPEL}
      />

      {/* DEPOIS DO GRAFICO (v2.98.2): deitada, a folha tem 186 mm de
          altura util, e observacao + analise do PCP (ou a tabela da
          junção) antes do grafico o empurravam inteiro para a 2a pagina,
          deixando a 1a meio em branco. O grafico e' a peca da folha: fica
          sempre na 1a, logo abaixo dos numeros; o que se escreve sobre
          ele vem em seguida. */}
      <div style={{ marginTop: 10 }}>
        {/* O TEMPO DA SEMANA (v2.101.0, pedido do PCP): o takt com a conta
            inteira — jornada, dias, setup, o que sobra e o programa. Sem ela
            o papel dizia "takt 17.2 s" e ninguem na reuniao sabia de onde.
            Logo depois do grafico: na 1a pagina, se couber. */}
        {tempo?.texto && <p style={impF.tempoSemana} data-conta-semana>{tempo.texto}</p>}
        {medicoes.filter((c) => c.observacao).map((c) => (
          <p key={c.id} style={{ margin: '0 0 10px' }}>
            <strong>Obs. do analista{juncao ? ` (${horaDaMedicao(c)})` : ''}:</strong> {c.observacao}
          </p>
        ))}
        {/* A analise salva vai junto: a folha que chega a' reuniao diz se o
            PCP ja' leu a medicao, e o que concluiu. */}
        {/* Na junção com notas diferentes (juntada de novo para reimprimir),
            a de cada medicao, com a hora dela. */}
        {(juncao && !conferencia.analise_nota ? medicoes.filter((c) => c.analisada_em) : [conferencia])
          .filter((c) => c.analisada_em)
          .map((c) => (
            <p key={c.id} style={{ margin: '0 0 10px', whiteSpace: 'pre-line' }}>
              <strong>Análise do PCP{c === conferencia ? '' : ` — ${horaDaMedicao(c)}`}</strong>
              {' '}({[c.analisada_por, formatarDataHora(c.analisada_em)].filter(Boolean).join(', ')})
              {c.analise_nota ? `: ${c.analise_nota}` : ''}
            </p>
          ))}
      </div>

      {/* Por que a linha parou: o mesmo quadro da tela, em tabela — na
          reuniao, o motivo e' o que a lideranca da linha vai cobrar. */}
      {motivos && (
        <section style={{ marginBottom: 10, breakInside: 'avoid' }}>
          <h2 style={impF.tituloSecao}>Por que a linha parou — paradas marcadas, por motivo</h2>
          <table style={impF.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Motivo</th>
                <th style={imp.thNum}>Paradas</th>
                <th style={imp.thNum}>Tempo</th>
                <th style={imp.thNum}>% do parado</th>
                {comObsDeParada && <th style={imp.th}>Observação</th>}
              </tr>
            </thead>
            <tbody>
              {motivos.motivos.map((m) => (
                <tr key={m.motivo}>
                  <td style={imp.td}>{m.rotulo}</td>
                  <td style={imp.tdNum}>{m.n}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{tempoSomado(m.ms)}</td>
                  <td style={imp.tdNum}>{pctDoParado(m.pct)}</td>
                  {comObsDeParada && <td style={imp.td}>{m.observacoes.join(' · ')}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={impF.nota}>{frasesDasParadas(motivos, { unidade, nMedicoes: n, saida: 'papel' })}</p>
        </section>
      )}

      {juncao && (
        <section style={{ marginBottom: 10, breakInside: 'avoid' }}>
          <h2 style={impF.tituloSecao}>As {n} medições</h2>
          <table style={impF.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Medição</th>
                {COLUNAS_MEDICOES(unidade, Boolean(r.juncao.deixou)).map(([chave, rotulo]) => <th key={chave} style={imp.thNum}>{rotulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhasDasMedicoes(r, unidade).map((l) => (
                <tr key={l.chave}>
                  {/* A linha da junção: borda em cima e negrito — nao cor. */}
                  <td style={l.total ? { ...imp.td, fontWeight: 700, borderTop: '1.5px solid #000' } : imp.td}>{l.rotulo}</td>
                  {COLUNAS_MEDICOES(unidade, Boolean(r.juncao.deixou)).map(([chave]) => (
                    <td
                      key={chave}
                      style={l.total || chave === 'roubados' || chave === 'lacunas' || chave === 'deixou'
                        ? { ...imp.tdNum, fontWeight: 700, ...(l.total ? { borderTop: '1.5px solid #000' } : {}) }
                        : imp.tdNum}
                    >
                      {l[chave]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {lacunas.length > 0 && (
        <section style={{ marginTop: 10 }}>
          <h2 style={impF.tituloSecao}>Onde a linha parou sem parada marcada</h2>
          <table style={impF.tabela}>
            <thead>
              <tr>
                {juncao && <th style={imp.th}>Medição</th>}
                <th style={imp.thNum}>{capital(unidade.singular)} nº</th>
                <th style={imp.thNum}>Intervalo</th>
                <th style={imp.thNum}>Além do normal</th>
                <th style={imp.th}>O que aconteceu</th>
              </tr>
            </thead>
            <tbody>
              {lacunas.map((l) => (
                <tr key={l.indice}>
                  {juncao && <td style={imp.td}>{faixaHoraria(l.conferencia) || horaDaMedicao(l.conferencia)}</td>}
                  <td style={imp.tdNum}>{juncao ? l.volume : l.indice + 2}</td>
                  <td style={imp.tdNum}>{emSegundos(l.ms)}</td>
                  <td style={imp.tdNum}>{emSegundos(l.ms - leitura.normalMs)}</td>
                  {/* Em branco de proposito: e' para preencher a caneta na
                      conversa com a lideranca da linha. */}
                  <td style={{ ...imp.td, width: '45%' }} />
                </tr>
              ))}
            </tbody>
          </table>
          {restantes > 0 && (
            <p style={impF.nota}>E mais {restantes} lacuna(s) menores — a lista completa está na tela.</p>
          )}
        </section>
      )}

      <p style={impF.nota}>
        {notaDoCriterio(leitura, unidade, {
          juncao: Boolean(juncao), roubo: roubo?.roubados > 0, lacunas: lacunasRoubo?.roubados > 0, deixou: deixou?.total > 0,
        })}
      </p>
    </div>,
    document.body,
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** De onde vieram as marcas, quando nao foi o tablet (ver `origem` no schema). */
function porVideo(medicoes) {
  const deVideo = medicoes.filter((c) => c.origem === 'video').length;
  if (!deVideo) return null;
  return deVideo === medicoes.length ? 'por vídeo' : `${deVideo} de ${medicoes.length} por vídeo`;
}

/**
 * A CONTA DO TAKT DA SEMANA, por maquina, como o painel do Ritmo / Demanda
 * a escreve: as horas em h/min DERIVADAS uma da outra (contaDaMaquina — a
 * subtracao que se confere de cabeca fecha sempre), o programa dividido
 * pelas maquinas do grupo (demandaPorMaquina) e o takt. Com 2 maquinas, o
 * takt de 43,9 s e' de 44 h sobre METADE dos volumes — dizer so' "7.222
 * volumes" levava quem confere a 21,9 s (revisao de 05/11).
 *
 * Sem setup cadastrado a conta diz que falta (contaDaMaquina), como a tela.
 * Sem takt, null: o motivo ja' esta' no cartao e na leitura — repetir
 * gastaria uma linha da folha.
 */
function contaDoTempo(takt, maquinas, unidade) {
  if (!(takt?.taktMs > 0)) return null;
  const conta = contaDaMaquina({
    jornadaPorMaquina: takt.jornadaPorMaquina, setupPorMaquina: takt.setupPorMaquina, dias: takt.dias,
  });
  const parte = demandaPorMaquina({ demanda: takt.demanda, maquinas });
  if (!conta || !parte) return null;
  const horas = formatarHorasMin(conta.produtivoMin / 60);
  const porMaq = Number(maquinas) > 1
    ? `${parte.semana} ${unidade.plural} na semana ÷ ${maquinas} máquinas = ${parte.texto} por máquina`
    : `${parte.texto} ${unidade.plural} na semana`;
  return {
    // Com mais de uma maquina o divisor e' a parte de CADA uma — e diz isso:
    // "÷ 1.100 volumes" sozinho e' um numero que nao esta' no programa.
    curto: `${horas} ÷ ${parte.texto} ${unidade.plural}${Number(maquinas) > 1 ? ' por máquina' : ''}`,
    texto: `Tempo da semana ${takt.semana} — ${conta.texto} ${porMaq} → takt ${(takt.taktMs / 1000).toFixed(1)} s por ${unidade.singular}.`,
  };
}
