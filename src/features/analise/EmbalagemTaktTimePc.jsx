import {
  Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { VERSAO } from '../../versao.js';
import {
  conferenciaRapida, faixaHoraria, formatarDuracao, formatarSegundos, nomeChave, somarParadas,
  unidadeDoPosto,
} from '../../domain/cronoanalise.js';
import { diasProgramados, taktDaMedicao } from '../../domain/demandaSemanal.js';
import { filtrarPorPeriodo, formatarDataHora } from '../../domain/relatorioConferencias.js';
import {
  emOrdem, faixaDaJuncao, idsDaJuncao, medicaoDaJuncao, motivoParaNaoJuntar,
} from '../../domain/juncaoMedicoes.js';
import { lerDemanda, listarCadastroMaquinas, listarConferenciasServidor } from '../../lib/api.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import VolumeAVolume, { cliqueSimples, useAnalisesDoPcp } from './conferencias/VolumeAVolume.jsx';
import Produtos from './Produtos.jsx';
import MotivosParada from './MotivosParada.jsx';
import { est } from './conferencias/estilos.js';
import { quandoLida, textoDaFalha } from './demanda/planilha.js';

/** Janela padrao, a mesma do relatorio de ritmo: o que esta' acontecendo agora. */
const DIAS = 30;
const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';

/**
 * EMBALAGEM TAKT TIME — no PC.
 *
 * Funcao PROPRIA, separada do relatorio de Ritmo por maquina, a pedido do
 * PPCP. As medicoes sao as mesmas (a embalagem tambem aparece no relatorio
 * de ritmo, como qualquer posto); o que muda e' a pergunta: aqui nao se
 * compara maquina com maquina, se olha cada medicao volume a volume contra
 * o takt da semana em que ela foi feita, em segundos.
 *
 * No topo, o TAKT DESTA SEMANA — e' o numero que o chao precisa ter na
 * cabeca. Abaixo, as medicoes da embalagem; as que foram tocadas volume a
 * volume abrem o detalhe (grafico, lacunas, folha A4) AO LADO da lista
 * (abaixo dela, em tela estreita). Clicar de novo na linha aberta fecha.
 *
 * A LISTA E' A FILA DO QUE FALTA LER: lida a medicao, o PCP salva a analise
 * pelo botao do topo do detalhe, o painel fecha e a medicao SAI da lista —
 * vai para "Analisadas", a um clique, para reabrir ou imprimir. No lugar da
 * lista (v2.94.1) o detalhe tirava a fila de vista; com a analisada saindo,
 * a fila encurta sozinha (pedido do PCP em 27/10). O cartao A ANALISAR
 * conta o mesmo que a fila: as que da' para analisar (ver analisavel) e
 * ainda nao tem analise salva.
 *
 * A medicao aberta tem entrada propria no historico do navegador: o
 * Voltar do navegador (e o botao lateral do mouse) fecha o painel, como o
 * botao da tela — sem ela, saia da tela e levava as notas digitadas.
 * Trocar de medicao com o painel aberto troca a entrada, nao empilha: o
 * Voltar nao passeia pelas medicoes ja' vistas.
 *
 * A JUNCAO: marcadas duas ou mais medicoes do mesmo produto, maquina e
 * semana (as caixas da lista), "Juntar" abre as tres no mesmo painel, como
 * uma medicao so' (ver domain/juncaoMedicoes.js). A junção tem entrada no
 * historico como uma medicao — o Voltar fecha, o F5 reabre — e a analise
 * salva nela vale para todas: as N saem da fila de uma vez.
 */
const ESTILO_GRADE = `
  @media (max-width: 1279px) {
    .embalagem-dividida { grid-template-columns: minmax(0, 1fr) !important; }
    .embalagem-detalhe { position: static !important; max-height: none !important; overflow: visible !important; }
  }
  .embalagem-linha:hover > td { background: #F5F8FC; }
`;
/** No estado da entrada do historico: o id da medicao aberta. */
const CHAVE_HISTORICO = 'embalagemMedicao';
/**
 * Da' para analisar: tocada volume a volume e com dois toques ou mais. Com
 * um toque nao ha' intervalo, e a feita por horarios (ou com a contagem
 * corrigida a' mao) nao tem toque: o detalhe nao tem leitura nem botao, e
 * na fila ela nunca sairia dali.
 */
const analisavel = (c) => Boolean(c.com_marcas) && Number(c.pecas) >= 2;
/** Em que vista da lista a medicao mora: a fila, as analisadas ou as outras. */
const vistaDe = (c) => {
  if (!analisavel(c)) return 'outras';
  return c.analisada_em ? 'analisadas' : 'fila';
};
/** Na junção, a fila manda se alguma ainda nao foi lida. */
const vistaDaAberta = (c) => (c.juncao
  ? (c.medicoes.some((m) => !m.analisada_em) ? 'fila' : 'analisadas')
  : vistaDe(c));
/**
 * O que reabrir pelo id da entrada do historico: uma medicao ou a junção
 * (ver idDaJuncao). Junção que ja' nao se forma — alguma medicao sumiu da
 * lista, ou deixou de casar com as outras — nao reabre.
 */
function acharAberta(id, medicoes) {
  const ids = idsDaJuncao(id);
  if (!ids) return medicoes.find((m) => m.id === id && m.com_marcas) || null;
  const lista = ids.map((x) => medicoes.find((m) => m.id === x && analisavel(m)));
  if (lista.some((m) => !m) || motivoParaNaoJuntar(lista)) return null;
  return medicaoDaJuncao(lista);
}
/** A linha de uma medicao na lista — o que recebe o foco quando o painel fecha. */
const seletorDaLinha = (id) => `[data-medicao="${id}"]`;
/** O botao da vista que esta' na tela: o foco cai nele quando a linha nao esta'. */
const VISTA_NA_TELA = '[data-vista][aria-pressed="true"]';
export default function EmbalagemTaktTimePc({ aoVoltar, aoVerInicio }) {
  const [verVersoes, setVerVersoes] = useState(false);
  const [carga, setCarga] = useState({ estado: 'carregando' });
  const [aberta, setAberta] = useState(null);
  // 'fila' (as nao analisadas), 'analisadas' ou 'outras' (sem intervalos).
  const [vista, setVista] = useState('fila');
  // Aberta por clique rola ate' o detalhe quando ele nasce fora da vista
  // (tela estreita); a que o F5 reabre, nunca.
  const [porClique, setPorClique] = useState(true);
  const refDetalhe = useRef(null);
  // O que recebe o foco quando o painel fecha (um seletor): a linha de onde
  // se saiu ou, se ela saiu da lista (analisada), a seguinte. O teclado
  // continua dali.
  const focarAoFechar = useRef(null);
  // O Voltar do navegador chega por evento, fora do render: ele le daqui o
  // que esta' aberto, as medicoes e se a analise da aberta esta' salvando.
  // E sabe se quem voltou foi a propria tela (Fechar, Salvar), que nunca e'
  // barrada.
  const atual = useRef({
    aberta: null, carregada: false, medicoes: [], salvandoAberta: false,
  });
  // Salvamento que responde depois de a tela ter sido deixada nao mexe em
  // nada: a tela de agora pode ter reaberto a MESMA medicao.
  const montada = useRef(false);
  const voltandoPelaTela = useRef(false);
  const abrirAoCarregar = useRef(null);
  // Os dois cadastros que a embalagem pede no tablet: o que se embala e por
  // que a linha para. Aqui a um clique, sem caçar no menu de outra tela.
  const [cadastroAberto, setCadastroAberto] = useState(null); // 'produtos' | 'motivos' | null
  // As medicoes marcadas para juntar (ids, na ordem em que foram marcadas).
  // Valem entre as vistas: a junção pode ter uma lida e duas na fila.
  const [marcadas, setMarcadas] = useState([]);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      listarCadastroMaquinas(),
      listarConferenciasServidor(),
      // As arquivadas so' para CONTAR: arquivada no relatorio de ritmo some
      // daqui tambem, e a tela precisa dizer isso em vez de "nenhuma".
      listarConferenciasServidor({ arquivadas: true }).catch(() => ({ conferencias: [] })),
    ])
      .then(async ([cadastro, lista, arquivadas]) => {
        const grupos = (cadastro.grupos || []).filter(ehEmbalagem);
        // O programa de cada grupo da embalagem (hoje, um so'), com o estado
        // da leitura da planilha do PCP. Falha do programa nao derruba a
        // tela: o takt aparece como indisponivel.
        const programas = await Promise.all(grupos.map((g) => lerDemanda(g.id).catch(() => null)));
        if (vivo) {
          setCarga({
            estado: 'pronto', cadastro, grupos, conferencias: lista.conferencias || [],
            arquivadas: arquivadas.conferencias || [],
            demandas: new Map(grupos.map((g, i) => [g.id, programas[i]?.demandas ?? null])),
            planilhas: new Map(grupos.map((g, i) => [g.id, programas[i]?.planilha ?? null])),
          });
        }
      })
      .catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, []);

  const leitura = useMemo(() => {
    if (carga.estado !== 'pronto') return null;
    const idsGrupos = new Set(carga.grupos.map((g) => g.id));
    const maquinas = (carga.cadastro.maquinas || []).filter((m) => idsGrupos.has(m.grupo_id));
    const grupoDaMaquina = new Map(maquinas.map((m) => [nomeChave(m.nome), m.grupo_id]));
    const ativasDoGrupo = (id) => maquinas.filter((m) => m.grupo_id === id && m.ativa).length;
    const medicoes = filtrarPorPeriodo(
      carga.conferencias.filter((c) => grupoDaMaquina.has(nomeChave(c.maquina))),
      DIAS,
    );
    const taktHoje = carga.grupos.map((g) => ({
      grupo: g,
      planilha: carga.planilhas.get(g.id),
      ...(carga.demandas.get(g.id) === null
        ? { taktMs: null, estado: 'erro-programa', semana: null }
        : taktDaMedicao({
          demandas: carga.demandas.get(g.id),
          horas: g.horas_semana,
          maquinas: ativasDoGrupo(g.id),
          setup: { setupsDia: g.setups_dia, dias: g.dias_semana, minutos: g.setup_min },
          data: new Date().toISOString(),
          pecas: 1,
          duracaoMs: 3600000,
        })),
    }));
    const arquivadas = carga.arquivadas.filter((c) => grupoDaMaquina.has(nomeChave(c.maquina))).length;
    const tocadas = medicoes.filter((c) => c.com_marcas).length;
    // A analisar, so' as que o detalhe deixa analisar (ver analisavel).
    const analisaveis = medicoes.filter(analisavel);
    const aAnalisar = analisaveis.filter((c) => !c.analisada_em).length;
    return {
      medicoes, taktHoje, ativasDoGrupo, arquivadas, tocadas, analisaveis: analisaveis.length, aAnalisar,
      grupoDe: (maquina) => carga.grupos.find((g) => g.id === grupoDaMaquina.get(nomeChave(maquina))) || null,
    };
  }, [carga]);

  /* Trocou de medicao: o detalhe, que rola sozinho ao lado da lista, volta
     ao topo — a nova nao pode abrir no meio, onde a anterior foi deixada.
     Fechou: o foco vai a' linha de onde se saiu (ou a' seguinte, se ela
     saiu da lista). LAYOUT effect de proposito: o efeito do filho
     (VolumeAVolume) roda antes do efeito comum do pai e mede o painel para
     decidir se rola a pagina; medido ainda rolado por dentro, ele parecia
     fora da vista e a pagina pulava. */
  useLayoutEffect(() => {
    if (aberta) {
      if (refDetalhe.current) refDetalhe.current.scrollTop = 0;
      return;
    }
    if (focarAoFechar.current === null) return;
    // A linha pode nao estar na tela: trocou-se de vista com o painel aberto,
    // ou a seguinte da fila esta' noutra vista. O foco cai no botao da vista
    // que esta' na tela, nao no corpo da pagina.
    const el = document.querySelector(focarAoFechar.current) || document.querySelector(VISTA_NA_TELA);
    focarAoFechar.current = null;
    if (!el) return;
    el.focus({ preventScroll: true });
    // Em tela estreita o painel vinha abaixo da lista, e a pagina rolou ate'
    // ele: a linha que recebe o foco ficou fora da tela. Ai' a tela vai ate'
    // ela; ao lado da lista, ela ja' esta' a' vista e nada se mexe.
    const { top, bottom } = el.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) el.scrollIntoView?.({ block: 'center' });
  }, [aberta?.id]);

  // A lista vai para a vista em que a medicao mora: aberta pelo Avancar, F5
  // ou Reabrir, a linha marcada tem de estar ao lado do painel.
  const mostrar = (c, { clique = true } = {}) => {
    focarAoFechar.current = seletorDaLinha(c.juncao ? c.medicoes[0].id : c.id);
    // A junção reaberta pelo F5 ou pelo Avancar volta com as medicoes dela
    // marcadas: fechada, ela se junta de novo pela barra.
    if (c.juncao) setMarcadas(c.medicoes.map((m) => m.id));
    setVista(vistaDaAberta(c));
    setPorClique(clique);
    setAberta(c);
  };
  // Com o painel ja' aberto, a outra medicao TROCA a entrada do historico:
  // o Voltar fecha o painel, nao passeia pelas medicoes vistas. Clicar na
  // aberta fecha — menos enquanto a analise DELA esta' sendo salva, como o
  // botao Fechar (a de outra medicao avisa na linha dela).
  const abrir = (c) => {
    const daTela = atual.current.aberta;
    if (daTela?.id === c.id) {
      if (!atual.current.salvandoAberta) fecharPainel();
      return;
    }
    if (daTela && window.history.state?.[CHAVE_HISTORICO] === daTela.id) {
      window.history.replaceState({ [CHAVE_HISTORICO]: c.id }, '');
    } else {
      window.history.pushState({ [CHAVE_HISTORICO]: c.id }, '');
    }
    mostrar(c);
  };
  // Fecha o painel desfazendo a entrada que abrir criou: o historico fica
  // como se a medicao nao tivesse sido aberta. Quem fecha e' o popstate.
  // So' se a entrada for DESTA medicao: um salvamento que responde depois
  // de a tela ter sido deixada nao pode fechar a medicao aberta agora.
  const fecharPainel = () => {
    const id = window.history.state?.[CHAVE_HISTORICO];
    if (id && id === atual.current.aberta?.id) {
      voltandoPelaTela.current = true;
      window.history.back();
    } else {
      setAberta(null);
    }
  };

  /* Voltar e Avancar do navegador fecham e reabrem o painel. Com a
     analise salvando, o Voltar do navegador nao fecha: a entrada da
     medicao volta ao historico, porque a recusa precisa de onde aparecer
     (o botao Fechar fica travado pelo mesmo motivo). */
  useEffect(() => {
    const caminho = window.location.pathname;
    montada.current = true;
    // Recarregada (F5) ou de volta de outra tela com a medicao aberta, ela
    // reabre quando a lista chegar — a entrada do historico e' dela.
    abrirAoCarregar.current = window.history.state?.[CHAVE_HISTORICO] ?? null;
    // A pagina fica onde esta' ao abrir e fechar o painel (ele rola por
    // dentro). A rolagem do navegador pulava a pagina no Voltar barrado ao
    // salvar.
    // O modo fica gravado na entrada do historico: na saida, volta a 'auto'
    // (o padrao do resto do app), nao ao que estava — que pode ser o
    // 'manual' deixado por esta mesma tela numa visita anterior.
    window.history.scrollRestoration = 'manual';
    const aoNavegar = () => {
      // O Voltar que ja' saiu da tela e' do App, nao daqui.
      if (window.location.pathname !== caminho) return;
      const id = window.history.state?.[CHAVE_HISTORICO] ?? null;
      const {
        aberta: daTela, carregada, medicoes, salvandoAberta,
      } = atual.current;
      // Antes da lista chegar nao ha' o que abrir: vale a entrada de AGORA
      // quando ela chegar, nao a de quando a tela montou.
      if (!carregada) {
        abrirAoCarregar.current = id;
        return;
      }
      const pelaTela = voltandoPelaTela.current;
      voltandoPelaTela.current = false;
      if (id === (daTela?.id ?? null)) return;
      if (daTela && salvandoAberta && !pelaTela) {
        window.history.pushState({ [CHAVE_HISTORICO]: daTela.id }, '');
        return;
      }
      if (id === null) {
        setAberta(null);
        return;
      }
      const c = acharAberta(id, medicoes);
      if (c) mostrar(c);
    };
    window.addEventListener('popstate', aoNavegar);
    return () => {
      montada.current = false;
      window.removeEventListener('popstate', aoNavegar);
      window.history.scrollRestoration = 'auto';
    };
  }, []);

  useEffect(() => {
    const id = abrirAoCarregar.current;
    if (!leitura || !id) return;
    abrirAoCarregar.current = null;
    const c = acharAberta(id, leitura.medicoes);
    // Sumiu da lista (arquivada, fora dos 30 dias): a entrada vira da lista,
    // senao o Voltar seguinte nao mudaria nada. Lista que nao veio (erro)
    // nao mexe na entrada: o proximo F5, com a lista boa, ainda reabre.
    if (c) mostrar(c, { clique: false });
    else window.history.replaceState({}, '');
  }, [leitura]);

  /* A analise salva no painel muda a linha e o cartao na hora, sem buscar
     a lista de novo. Salvar fecha o painel (so' se a aberta ainda for a
     salva) e a medicao sai da fila; o foco vai a' linha seguinte da fila
     (sem seguinte, ao botao Analisadas). Reabrir deixa o detalhe aberto,
     com a nota no campo, e a lista volta para a fila, onde ela esta'.
     A junção salva todas de uma vez: chegam varias, saem todas da fila, e
     as marcas se vao (a junção cumpriu o papel). */
  const analises = useAnalisesDoPcp((atualizadas, { fechar }) => {
    if (!montada.current) return;
    const porId = new Map((Array.isArray(atualizadas) ? atualizadas : [atualizadas]).map((a) => [a.id, a]));
    const juntar = (c) => (porId.has(c.id) ? { ...c, ...porId.get(c.id) } : c);
    setCarga((carregada) => ({ ...carregada, conferencias: carregada.conferencias.map(juntar) }));
    const daTela = atual.current.aberta;
    const ehDaTela = daTela && (daTela.juncao ? daTela.medicoes.some((m) => porId.has(m.id)) : porId.has(daTela.id));
    if (!ehDaTela) return;
    if (fechar) {
      const fila = atual.current.medicoes.filter((m) => vistaDe(m) === 'fila');
      const ultima = Math.max(...fila.map((m, k) => (porId.has(m.id) ? k : -1)));
      const ficou = (m) => !porId.has(m.id);
      const seguinte = fila.slice(ultima + 1).find(ficou) || fila.slice(0, Math.max(ultima, 0)).reverse().find(ficou);
      if (daTela.juncao) setMarcadas([]);
      fecharPainel();
      focarAoFechar.current = seguinte ? seletorDaLinha(seguinte.id) : '[data-vista="analisadas"]';
    } else {
      setAberta((a) => (a ? juntar(a) : a));
      setVista(vistaDe(juntar(daTela)));
    }
  });

  useLayoutEffect(() => {
    atual.current = {
      aberta,
      carregada: Boolean(leitura),
      medicoes: leitura?.medicoes || [],
      salvandoAberta: aberta ? analises.salvandoA(aberta.id) : false,
    };
  });

  /* Sair da tela descarta a nota digitada e nao salva, e uma analise ainda
     indo para o servidor perde onde mostrar a recusa: a lateral pergunta
     antes, e recarregar ou fechar a aba tambem (beforeunload, como a
     coleta no App). O Voltar do navegador a partir da lista, nao. */
  const naoSalvas = (leitura ? leitura.medicoes.filter(analises.notaNaoSalva).length : 0)
    + analises.juncoesNaoSalvas(leitura?.medicoes || []);
  const pendente = analises.ocupado || naoSalvas > 0;
  useEffect(() => {
    if (!pendente) return undefined;
    const aoSair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [pendente]);
  const sairDaTela = (ir) => {
    if (!pendente) {
      ir();
      return;
    }
    const motivos = [
      analises.ocupado && 'Uma análise ainda está indo para o servidor: saindo agora, você não fica sabendo se ele recusar.',
      naoSalvas > 0 && (naoSalvas === 1
        ? 'Há 1 nota digitada e não salva (Análise do PCP). Sair da tela descarta essa nota.'
        : `Há ${naoSalvas} notas digitadas e não salvas (Análise do PCP). Sair da tela descarta essas notas.`),
    ].filter(Boolean);
    if (window.confirm(`${motivos.join('\n')}\n\nSair mesmo assim?`)) ir();
  };

  const grupoAberto = aberta && leitura ? leitura.grupoDe(aberta.maquina) : null;

  /* AS MARCADAS PARA JUNTAR. O motivo da trava vai escrito na barra: botao
     travado sem o porque parece quebrado. */
  const doMarcadas = leitura
    ? marcadas.map((id) => leitura.medicoes.find((m) => m.id === id)).filter(Boolean)
    : [];
  const selecao = {
    ids: new Set(doMarcadas.map((c) => c.id)),
    medicoes: doMarcadas,
    motivo: motivoParaNaoJuntar(doMarcadas),
    alternar: (c) => setMarcadas((ids) => (ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id])),
    limpar: () => setMarcadas([]),
    // A mesma junção ja' aberta fica como esta': juntar de novo nao a fecha.
    juntar: () => {
      if (motivoParaNaoJuntar(doMarcadas)) return;
      const juncao = medicaoDaJuncao(doMarcadas);
      if (atual.current.aberta?.id === juncao.id) return;
      abrir(juncao);
    },
  };
  const abertasIds = new Set(aberta ? (aberta.juncao ? aberta.medicoes.map((m) => m.id) : [aberta.id]) : []);

  return (
    <div style={est.tela}>
      <style>{ESTILO_GRADE}</style>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={() => sairDaTela(aoVoltar)}
          voltarRotulo="Estudos"
          aoVerInicio={aoVerInicio && (() => sairDaTela(aoVerInicio))}
          contexto={{
            rotulo: 'Embalagem',
            titulo: 'Embalagem Takt Time',
            subtitulo: 'Cada volume contra o takt da semana, em segundos',
          }}
        />

        <main style={est.conteudoLateral}>
          {carga.estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando a embalagem" texto="Buscando o cadastro, o programa e as medições." />
          )}
          {carga.estado === 'erro' && (
            <div style={est.faixaErro} role="alert">Não deu para carregar: {carga.erro}</div>
          )}

          {leitura && (
            <>
              <div style={est.barraCadastros}>
                {/* Guardados contra o duplo clique, como os botoes do painel. */}
                <button type="button" style={est.botaoLinha} onClick={cliqueSimples(() => setCadastroAberto('produtos'))}>
                  Produtos da embalagem
                </button>
                <button type="button" style={est.botaoLinha} onClick={cliqueSimples(() => setCadastroAberto('motivos'))}>
                  Motivos de parada
                </button>
              </div>
              {/* A planilha do PCP que nao foi lida: o takt abaixo e' do
                  programa guardado, e a tela diz isso antes do numero. */}
              {leitura.taktHoje.filter((t) => t.planilha?.estado === 'erro').map((t) => (
                <div key={`planilha-${t.grupo.id}`} style={est.faixaErro} role="alert">
                  {textoDaFalha(t.planilha)}
                </div>
              ))}
              <div style={est.kpis}>
                {leitura.taktHoje.length === 0 && (
                  <div style={est.kpi}>
                    <div style={est.kpiRotulo}>Takt desta semana</div>
                    <div style={est.kpiValor}>—</div>
                    <div style={est.kpiSub}>
                      Nenhum grupo EMBALAGEM no cadastro (Ferramentas → Máquinas).
                    </div>
                  </div>
                )}
                {leitura.taktHoje.map((t) => (
                  <div key={t.grupo.id} style={est.kpi}>
                    <div style={est.kpiRotulo}>Takt desta semana · {t.grupo.nome}</div>
                    <div style={est.kpiValor}>
                      {t.taktMs > 0 ? `${formatarSegundos(t.taktMs)} s` : '—'}
                    </div>
                    <div style={est.kpiSub}>
                      {t.taktMs > 0 ? `por volume · semana ${t.semana}` : semTaktCurto(t.estado)}
                      {/* Semana com feriado ou ainda sendo programada: o takt usa
                          as horas so' dos dias com lote, e diz quantos. */}
                      {t.taktMs > 0 && diasProgramados(t.dias) && ` · ${diasProgramados(t.dias)}`}
                      {/* De quando e' o programa: takt sem idade e' o risco. */}
                      {t.planilha?.estado === 'ok' && ` · da planilha do PCP, lida ${quandoLida(t.planilha.lidaEm)}`}
                    </div>
                  </div>
                ))}
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Medições em {DIAS} dias</div>
                  <div style={est.kpiValor}>{leitura.medicoes.length}</div>
                  <div style={est.kpiSub}>
                    {leitura.tocadas} volume a volume
                    {leitura.arquivadas > 0
                      ? ` · ${leitura.arquivadas} ${leitura.arquivadas === 1 ? 'arquivada' : 'arquivadas'} fora da conta`
                      : ''}
                  </div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>A analisar</div>
                  <div style={est.kpiValor}>{leitura.aAnalisar}</div>
                  <div style={est.kpiSub}>{subAAnalisar(leitura)}</div>
                </div>
              </div>

              {leitura.medicoes.length === 0 ? (
                <EstadoVazio
                  modo="analise"
                  titulo="Nenhuma medição da embalagem"
                  texto={`Nos últimos ${DIAS} dias.${leitura.arquivadas > 0
                    ? ` ${leitura.arquivadas === 1 ? 'Há 1 medição da embalagem arquivada' : `Há ${leitura.arquivadas} medições da embalagem arquivadas`} — restaure no relatório Ritmo por máquina, em Arquivadas.`
                    : ''} A medição nasce no tablet, em Embalagem Takt Time: um toque a cada volume embalado.`}
                />
              ) : (
                /* A medicao selecionada abre AQUI, ao lado da lista. Sem
                   nenhuma aberta, a lista ocupa a largura toda. */
                <div
                  className={aberta ? 'embalagem-dividida' : undefined}
                  style={aberta ? est.embDividida : undefined}
                >
                  <TabelaEmbalagem
                    medicoes={leitura.medicoes}
                    vista={vista}
                    aoTrocarVista={setVista}
                    abertasIds={abertasIds}
                    selecao={selecao}
                    aoAbrir={abrir}
                    pendenciaDe={analises.pendencia}
                    ocupado={analises.ocupado}
                  />
                  {aberta && (
                    <div ref={refDetalhe} className="embalagem-detalhe" style={est.embDetalhe}>
                      <VolumeAVolume
                        conferencia={aberta}
                        grupo={grupoAberto}
                        maquinasDoGrupo={grupoAberto ? leitura.ativasDoGrupo(grupoAberto.id) : 0}
                        aoFechar={fecharPainel}
                        analise={analises.da(aberta)}
                        rolar={porClique}
                      />
                    </div>
                  )}
                </div>
              )}

              <p style={est.painelDica}>
                O takt é o programa da semana do grupo EMBALAGEM — em VOLUMES, não em produtos,
                lido da planilha do PCP quando a leitura está ligada — dividido pelas horas dos
                dias programados, descontado o setup planejado. Um produto que sai em dois
                volumes conta dois.
              </p>
            </>
          )}
        </main>
      </div>

      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
      {cadastroAberto === 'produtos' && (
        <Produtos grupoInicial={leitura?.taktHoje[0]?.grupo.id || null} aoFechar={() => setCadastroAberto(null)} />
      )}
      {cadastroAberto === 'motivos' && <MotivosParada aoFechar={() => setCadastroAberto(null)} />}
    </div>
  );
}

// A janela vai escrita: uma medicao de 31 dias sem analise ja' nao conta,
// e "todas analisadas" diria que ela foi lida.
function subAAnalisar({ tocadas, analisaveis, aAnalisar }) {
  if (tocadas === 0) return `nenhuma medição volume a volume em ${DIAS} dias`;
  if (analisaveis === 0) return 'só medições de um toque, sem intervalo para analisar';
  if (aAnalisar === 0) return `nenhuma pendente nos últimos ${DIAS} dias`;
  return `de ${analisaveis} ${analisaveis === 1 ? 'medição' : 'medições'} volume a volume em ${DIAS} dias`;
}

function semTaktCurto(estado) {
  switch (estado) {
    case 'sem-demanda': return 'sem programa da embalagem cadastrado';
    case 'sem-semana': return 'o programa não cobre esta semana';
    case 'sem-horas': return 'faltam as horas da semana do grupo';
    case 'sem-dias': return 'faltam os dias de produção da semana do grupo';
    case 'setup-excede': return 'setup cadastrado passa da jornada';
    case 'erro-programa': return 'não deu para carregar o programa';
    default: return 'sem takt para esta semana';
  }
}

/**
 * O que a lista diz no alto, por vista. Volumes/hora valem nas tres: e' o
 * que de fato saiu, com as paradas dentro.
 */
const DICA_DA_VISTA = {
  fila: 'Clique numa medição para abrir o volume a volume (ao lado da lista; abaixo dela, em tela '
    + 'estreita). Lida, salve a análise no alto dela: a medição sai desta lista e vai para Analisadas. '
    + 'Volumes/hora do período inteiro, com as paradas dentro — o que de fato saiu. Para ler várias '
    + 'medições do mesmo produto como uma só, marque as caixas e clique em Juntar.',
  analisadas: 'As medições com a análise do PCP salva. Clique numa para ver, imprimir ou reabrir a '
    + 'análise — reaberta, ela volta para Não analisadas. Volumes/hora do período inteiro, com as '
    + 'paradas dentro. Marque as caixas para juntar de novo e reimprimir.',
  outras: 'Medidas por horários, com a contagem corrigida à mão ou com um toque só: não há intervalo '
    + 'entre volumes para ler, e elas não têm análise do PCP. Os volumes/hora valem, com as paradas dentro.',
};

/** O aviso da linha para cada pendencia de analise (ver useAnalisesDoPcp). */
const AVISO_PENDENCIA = {
  'salvar-recusado': { texto: 'Análise não salva — abra para ver o motivo', estilo: est.embPendenciaCritica },
  'reabrir-recusado': { texto: 'Não reabriu — abra para ver o motivo', estilo: est.embPendenciaCritica },
  'nota-nao-salva': { texto: 'Nota digitada, ainda não salva', estilo: est.embPendenciaAtencao },
  'nota-juncao-nao-salva': {
    texto: 'Nota de junção digitada, ainda não salva — marque as medições e junte de novo',
    estilo: est.embPendenciaAtencao,
  },
};

/**
 * As medicoes da embalagem, uma por linha — COMPACTA: cada celula tem o
 * principal em cima e o complemento embaixo (data e horarios; periodo e
 * parado; volumes/hora e volumes). A maquina so' aparece quando ha' mais
 * de uma — com uma so', era a mesma palavra em todas as linhas.
 *
 * So' as tocadas volume a volume abrem o detalhe: o produto vira o botao
 * da linha (o teclado chega nele) e a linha inteira abre com o mouse. As
 * feitas por horarios nao tem intervalo, e a linha diz isso por escrito.
 *
 * AS VISTAS: "Não analisadas" e' a fila — a medicao com analise salva sai
 * dela, e ela conta o mesmo que o cartao A ANALISAR — e "Analisadas" guarda
 * as lidas, para reabrir ou imprimir. A que nao se analisa (por horarios,
 * contagem corrigida a' mao, um toque so') fica em "Sem intervalos": na
 * fila, ela nunca sairia, e a fila nunca esvaziaria. As vistas travam
 * enquanto uma analise salva: a recusa avisa na linha, e a linha tem de
 * estar a' vista.
 *
 * A CAIXA da linha marca a medicao para juntar (so' as que se analisam: as
 * "Sem intervalos" nao tem o que juntar). O clique nela nao abre a linha.
 * Com alguma marcada, a barra diz quantas, o que somam e — se nao der
 * para juntar — por que.
 */
function TabelaEmbalagem({
  medicoes: todas, vista, aoTrocarVista, abertasIds, selecao, aoAbrir, pendenciaDe, ocupado = false,
}) {
  const variasMaquinas = new Set(todas.map((c) => nomeChave(c.maquina))).size > 1;
  const porVista = { fila: [], analisadas: [], outras: [] };
  todas.forEach((c) => porVista[vistaDe(c)].push(c));
  const medicoes = porVista[vista];
  const comCaixa = vista !== 'outras';
  const colunas = comCaixa ? 5 : 4;
  const marcadas = selecao.medicoes;
  const nMarcadas = marcadas.length;
  const botaoVista = (qual, rotulo, titulo) => (
    <button
      type="button"
      style={vista === qual ? est.botaoLinhaAtivo : est.botaoLinha}
      aria-pressed={vista === qual}
      data-vista={qual}
      title={titulo}
      disabled={ocupado}
      onClick={cliqueSimples(() => aoTrocarVista(qual))}
    >
      {rotulo} ({porVista[qual].length})
    </button>
  );
  return (
    <section style={est.painel} aria-label="Medições da embalagem">
      <div style={est.painelTopo}>
        <div style={est.painelTopoTexto}>
          <h2 style={est.painelTitulo}>Medições da embalagem</h2>
          <p style={est.painelDica}>{DICA_DA_VISTA[vista]}</p>
          <div style={est.embVistas}>
            {botaoVista('fila', 'Não analisadas')}
            {botaoVista('analisadas', 'Analisadas')}
            {porVista.outras.length > 0 && botaoVista(
              'outras',
              'Sem intervalos',
              'Medidas por horários, com a contagem corrigida à mão ou com um toque só: não há intervalo entre volumes para ler',
            )}
          </div>
          {nMarcadas > 0 && (
            <div style={est.embBarraJuntar} role="region" aria-label="Medições marcadas para juntar">
              <div style={est.embBarraTexto}>
                <span style={est.embBarraTitulo}>
                  {nMarcadas} {nMarcadas === 1 ? 'medição marcada' : 'medições marcadas'}
                  {!selecao.motivo && ` · ${marcadas[0].peca} · ${marcadas[0].maquina}`}
                </span>
                {selecao.motivo
                  ? <span style={est.embBarraMotivo} role="status">{selecao.motivo}</span>
                  : (
                    <span style={est.embBarraSub}>
                      {marcadas.reduce((soma, c) => soma + (Number(c.pecas) || 0), 0)} volumes em{' '}
                      {formatarDuracao(marcadas.reduce((soma, c) => soma + (Number(c.duracao_ms) || 0), 0))} medidos
                      {' · '}{faixaDaJuncao(emOrdem(marcadas))}
                    </span>
                  )}
              </div>
              <button type="button" style={est.botaoSecundario} onClick={cliqueSimples(selecao.limpar)} disabled={ocupado}>
                Desmarcar
              </button>
              <button
                type="button"
                style={selecao.motivo ? est.embBotaoJuntarTravado : est.embBotaoJuntar}
                onClick={cliqueSimples(selecao.juntar)}
                disabled={Boolean(selecao.motivo) || ocupado}
              >
                {nMarcadas >= 2 ? `Juntar as ${nMarcadas}` : 'Juntar'}
              </button>
            </div>
          )}
        </div>
      </div>
      {medicoes.length === 0 && (
        <p style={est.painelDica} role="status">
          {vista === 'analisadas' && `Nenhuma medição analisada nos últimos ${DIAS} dias.`}
          {vista === 'fila' && `Nada para analisar nos últimos ${DIAS} dias.${porVista.analisadas.length
            ? ' As lidas estão em Analisadas.'
            : ''}${porVista.outras.length
            ? ' As medidas por horários, com a contagem corrigida à mão ou com um toque só estão em Sem intervalos.'
            : ''}`}
        </p>
      )}
      {medicoes.length > 0 && (
        <table style={est.tabela}>
          <thead>
            <tr>
              {comCaixa && <th style={est.embThCaixa} aria-label="Marcar para juntar" />}
              <th style={est.embTh}>Quando</th>
              <th style={est.embTh}>Produto</th>
              <th style={est.embThNum}>Período</th>
              <th style={est.embThNum}>Volumes/<wbr />hora</th>
            </tr>
          </thead>
          <tbody>
            {medicoes.map((c) => {
              const calc = conferenciaRapida({ duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas });
              const par = somarParadas(c.paradas);
              const abre = Boolean(c.com_marcas);
              const selecionada = abertasIds.has(c.id);
              // O dia em que se MEDIU, o mesmo do detalhe e do corte dos 30 dias
              // (salvo_em e' o dia em que sincronizou: offline, pode ser outro).
              const [dia, hora] = formatarDataHora(c.iniciado_em || c.salvo_em).split(' ');
              const estiloLinha = selecionada ? est.linhaSelecionada : (abre ? est.embLinhaClicavel : undefined);
              const classeLinha = abre && !selecionada ? 'embalagem-linha' : undefined;
              // O segundo clique de um duplo clique nao abre: ver cliqueSimples.
              const aoClicarLinha = abre ? cliqueSimples(() => aoAbrir(c)) : undefined;
              const aviso = AVISO_PENDENCIA[pendenciaDe(c)];
              return (
                <Fragment key={c.id}>
                <tr style={estiloLinha} className={classeLinha} onClick={aoClicarLinha}>
                  {comCaixa && (
                    /* O clique na caixa marca, nao abre a linha. */
                    <td style={est.embTdCaixa} onClick={(ev) => ev.stopPropagation()}>
                      {analisavel(c) && (
                        <label style={est.embCaixa} title="Marcar para juntar">
                          <input
                            type="checkbox"
                            style={est.embCaixaInput}
                            checked={selecao.ids.has(c.id)}
                            onChange={() => selecao.alternar(c)}
                            disabled={ocupado}
                            aria-label={`Marcar para juntar: ${c.peca || 'produto não informado'}, ${dia} ${faixaHoraria(c) || hora || ''}`.trim()}
                          />
                        </label>
                      )}
                    </td>
                  )}
                  <td style={est.embTdQuando}>
                    <span style={est.embForte}>{dia}</span>
                    <span style={est.embSub}>{faixaHoraria(c) || hora || '—'}</span>
                  </td>
                  <td style={est.embTd}>
                    {abre ? (
                      <button
                        type="button"
                        style={est.embProduto}
                        data-medicao={c.id}
                        aria-pressed={selecionada}
                        // A linha tambem abre: sem isto, o clique abriria duas vezes.
                        onClick={(ev) => {
                          ev.stopPropagation();
                          aoClicarLinha(ev);
                        }}
                      >
                        {c.peca || 'Produto não informado'}
                      </button>
                    ) : (
                      <span style={est.embProdutoTexto}>{c.peca || '—'}</span>
                    )}
                    {variasMaquinas && <span style={est.embSub}>{c.maquina || '—'}</span>}
                    {abre && c.analisada_em && (
                      <span style={est.embAnalisada} title={c.analise_nota || undefined}>
                        ✓ Analisada{c.analisada_por ? ` · ${c.analisada_por}` : ''}
                      </span>
                    )}
                    {/* A recusa que ficou sem resolver, ou a nota digitada e
                        deixada para tras: fechado o painel, sem isto ninguem
                        saberia. Na aberta, o painel ja' diz. */}
                    {abre && !selecionada && aviso && <span style={aviso.estilo}>{aviso.texto}</span>}
                    {!abre && (
                      <span style={est.embSub} title="Medida por horários ou com a contagem corrigida à mão">
                        sem toques — não abre volume a volume
                      </span>
                    )}
                  </td>
                  <td style={est.embTdNum}>
                    <span style={est.embForte}>{formatarDuracao(Number(c.duracao_ms))}</span>
                    {/* Lista estreita quebra "parado / 6 min", nunca "parado 6 / min". */}
                    <span style={est.embSub}>
                      {par.totalMs > 0 ? `parado ${formatarDuracao(par.totalMs).replace(/ /g, '\u00a0')}` : 'sem parada marcada'}
                    </span>
                  </td>
                  <td style={est.embTdNum}>
                    <span style={est.embForte}>{calc ? Math.round(calc.pecasPorHoraBruto) : '—'}</span>
                    <span style={est.embSub}>{c.pecas} {Number(c.pecas) === 1 ? 'volume' : 'volumes'}</span>
                  </td>
                </tr>
                {/* A nota do analista, numa linha propria — como no relatorio
                    de ritmo. E' muitas vezes a explicacao da lacuna. */}
                {c.observacao && (
                  <tr style={estiloLinha} className={classeLinha} onClick={aoClicarLinha}>
                    <td style={est.tdObservacao} colSpan={colunas}>
                      <span style={est.rotuloObservacao}>Obs.</span>
                      {c.observacao}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
