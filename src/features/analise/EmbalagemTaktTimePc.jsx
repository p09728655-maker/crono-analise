import {
  Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { VERSAO } from '../../versao.js';
import {
  conferenciaRapida, faixaHoraria, formatarDuracao, formatarSegundos, nomeChave, somarParadas,
  unidadeDoPosto,
} from '../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../domain/demandaSemanal.js';
import { filtrarPorPeriodo, formatarDataHora } from '../../domain/relatorioConferencias.js';
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
 * volume abrem o detalhe (grafico, lacunas, folha A4) NO LUGAR da lista,
 * com a largura toda. Ao lado da lista (v2.93.1) o detalhe ficava espremido
 * e a lista, comprimida (apontado em 27/10): quem analisa le uma medicao
 * por vez. "Voltar a' lista" devolve a lista na rolagem em que foi deixada.
 *
 * A medicao aberta tem entrada propria no historico do navegador: o
 * Voltar do navegador (e o botao lateral do mouse) volta a' lista, como o
 * botao da tela — sem ela, saia da tela e levava as notas digitadas.
 *
 * Lida a medicao, o PCP salva a analise pelo botao do topo do detalhe, e
 * volta para a lista. O cartao A ANALISAR conta as volume a volume que
 * ainda nao tem analise salva — e' o que falta ler.
 */
const ESTILO_LINHA = '.embalagem-linha:hover > td { background: #F5F8FC; }';
/** No estado da entrada do historico: o id da medicao aberta. */
const CHAVE_HISTORICO = 'embalagemMedicao';
export default function EmbalagemTaktTimePc({ aoVoltar, aoVerInicio }) {
  const [verVersoes, setVerVersoes] = useState(false);
  const [carga, setCarga] = useState({ estado: 'carregando' });
  const [aberta, setAberta] = useState(null);
  // Onde a lista estava rolada e de qual medicao se saiu: na volta, a
  // lista reaparece no mesmo ponto, com o foco na linha de onde se saiu.
  const rolagemDaLista = useRef(0);
  const saiuDe = useRef(null);
  // O Voltar do navegador chega por evento, fora do render: ele le daqui o
  // que esta' aberto, as medicoes e se ha' analise salvando. E sabe se quem
  // voltou foi a propria tela (Voltar à lista, Salvar), que nunca e' barrada.
  const atual = useRef({
    aberta: null, carregada: false, medicoes: [], ocupado: false,
  });
  // Salvamento que responde depois de a tela ter sido deixada nao mexe em
  // nada: a tela de agora pode ter reaberto a MESMA medicao.
  const montada = useRef(false);
  const voltandoPelaTela = useRef(false);
  const abrirAoCarregar = useRef(null);
  // Os dois cadastros que a embalagem pede no tablet: o que se embala e por
  // que a linha para. Aqui a um clique, sem caçar no menu de outra tela.
  const [cadastroAberto, setCadastroAberto] = useState(null); // 'produtos' | 'motivos' | null

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
    // A analisar, so' as que o detalhe deixa analisar: tocadas volume a
    // volume e com dois toques ou mais. Com um toque nao ha' intervalo, o
    // detalhe nao tem leitura nem botao — contada, ela nunca sairia daqui.
    const analisaveis = medicoes.filter((c) => c.com_marcas && Number(c.pecas) >= 2);
    const aAnalisar = analisaveis.filter((c) => !c.analisada_em).length;
    return {
      medicoes, taktHoje, ativasDoGrupo, arquivadas, tocadas, analisaveis: analisaveis.length, aAnalisar,
      grupoDe: (maquina) => carga.grupos.find((g) => g.id === grupoDaMaquina.get(nomeChave(maquina))) || null,
    };
  }, [carga]);

  /* Abriu uma medicao: a pagina vai ao topo, onde o detalhe comeca — quem
     clicou na ultima linha nao pode cair no meio dele. Voltou a' lista: a
     rolagem de antes, e o foco no produto de onde saiu (o teclado continua
     dali). LAYOUT effect: rola antes de pintar, sem o quadro no lugar errado. */
  useLayoutEffect(() => {
    if (aberta) {
      window.scrollTo(0, 0);
      return;
    }
    if (saiuDe.current === null) return;
    window.scrollTo(0, rolagemDaLista.current);
    document.querySelector(`[data-medicao="${saiuDe.current}"]`)?.focus({ preventScroll: true });
    saiuDe.current = null;
  }, [aberta?.id]);

  // Mostra a medicao no lugar da lista, guardando onde a lista estava.
  const mostrar = (c) => {
    rolagemDaLista.current = window.scrollY;
    saiuDe.current = c.id;
    setAberta(c);
  };
  const abrir = (c) => {
    window.history.pushState({ [CHAVE_HISTORICO]: c.id }, '');
    mostrar(c);
  };
  // Desfaz a entrada que abrir criou: depois de voltar, o historico fica
  // como se a medicao nao tivesse sido aberta. Quem fecha e' o popstate.
  // So' se a entrada for DESTA medicao: um salvamento que responde depois
  // de a tela ter sido deixada nao pode fechar a medicao aberta agora.
  const voltarALista = () => {
    const id = window.history.state?.[CHAVE_HISTORICO];
    if (id && id === atual.current.aberta?.id) {
      voltandoPelaTela.current = true;
      window.history.back();
    } else {
      setAberta(null);
    }
  };

  /* Voltar e Avancar do navegador andam entre a lista e a medicao. Com a
     analise salvando, o Voltar do navegador nao fecha: a entrada da
     medicao volta ao historico, porque a recusa precisa de onde aparecer
     (o botao Voltar à lista fica travado pelo mesmo motivo). */
  useEffect(() => {
    const caminho = window.location.pathname;
    montada.current = true;
    // Recarregada (F5) ou de volta de outra tela com a medicao aberta, ela
    // reabre quando a lista chegar — a entrada do historico e' dela.
    abrirAoCarregar.current = window.history.state?.[CHAVE_HISTORICO] ?? null;
    // A tela cuida da propria rolagem (lista no mesmo ponto, medicao no
    // topo). A do navegador pulava a pagina no Voltar barrado ao salvar.
    // O modo fica gravado na entrada do historico: na saida, volta a 'auto'
    // (o padrao do resto do app), nao ao que estava — que pode ser o
    // 'manual' deixado por esta mesma tela numa visita anterior.
    window.history.scrollRestoration = 'manual';
    const aoNavegar = () => {
      // O Voltar que ja' saiu da tela e' do App, nao daqui.
      if (window.location.pathname !== caminho) return;
      const id = window.history.state?.[CHAVE_HISTORICO] ?? null;
      const {
        aberta: daTela, carregada, medicoes, ocupado,
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
      if (daTela && ocupado && !pelaTela) {
        window.history.pushState({ [CHAVE_HISTORICO]: daTela.id }, '');
        return;
      }
      if (id === null) {
        setAberta(null);
        return;
      }
      const c = medicoes.find((m) => m.id === id && m.com_marcas);
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
    const c = leitura.medicoes.find((m) => m.id === id && m.com_marcas);
    // Sumiu da lista (arquivada, fora dos 30 dias): a entrada vira da lista,
    // senao o Voltar seguinte nao mudaria nada. Lista que nao veio (erro)
    // nao mexe na entrada: o proximo F5, com a lista boa, ainda reabre.
    if (c) mostrar(c);
    else window.history.replaceState({}, '');
  }, [leitura]);

  /* A analise salva no painel muda a linha e o cartao na hora, sem buscar
     a lista de novo. Salvar volta para a lista (so' se a aberta ainda for
     a salva); reabrir deixa o detalhe aberto, com a nota no campo. */
  const analises = useAnalisesDoPcp((atualizada, { fechar }) => {
    if (!montada.current) return;
    const juntar = (c) => (c.id === atualizada.id ? { ...c, ...atualizada } : c);
    setCarga((carregada) => ({ ...carregada, conferencias: carregada.conferencias.map(juntar) }));
    if (atual.current.aberta?.id !== atualizada.id) return;
    if (fechar) voltarALista();
    else setAberta((a) => (a ? juntar(a) : a));
  });

  useLayoutEffect(() => {
    atual.current = {
      aberta, carregada: Boolean(leitura), medicoes: leitura?.medicoes || [], ocupado: analises.ocupado,
    };
  });

  /* Sair da tela descarta a nota digitada e nao salva, e uma analise ainda
     indo para o servidor perde onde mostrar a recusa: a lateral pergunta
     antes, e recarregar ou fechar a aba tambem (beforeunload, como a
     coleta no App). O Voltar do navegador a partir da lista, nao. */
  const naoSalvas = leitura ? leitura.medicoes.filter(analises.notaNaoSalva).length : 0;
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

  return (
    <div style={est.tela}>
      <style>{ESTILO_LINHA}</style>
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

          {/* A medicao aberta toma a tela: cartoes e lista saem enquanto se
              analisa, e voltam com "Voltar à lista". */}
          {leitura && aberta && (
            <VolumeAVolume
              conferencia={aberta}
              grupo={grupoAberto}
              maquinasDoGrupo={grupoAberto ? leitura.ativasDoGrupo(grupoAberto.id) : 0}
              aoFechar={voltarALista}
              analise={analises.da(aberta)}
            />
          )}

          {leitura && !aberta && (
            <>
              <div style={est.barraCadastros}>
                {/* Guardados contra o duplo clique: o Voltar à lista fica neste
                    mesmo canto, e o segundo clique abria o cadastro. */}
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
                <TabelaEmbalagem
                  medicoes={leitura.medicoes}
                  aoAbrir={abrir}
                  pendenciaDe={analises.pendencia}
                />
              )}

              <p style={est.painelDica}>
                O takt é o programa da semana do grupo EMBALAGEM — colado em VOLUMES, não em
                produtos — dividido pelas horas da semana, descontado o setup planejado. Um
                produto que sai em dois volumes conta dois.
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
    case 'setup-excede': return 'setup cadastrado passa da jornada';
    case 'erro-programa': return 'não deu para carregar o programa';
    default: return 'sem takt para esta semana';
  }
}

/**
 * As medicoes da embalagem, uma por linha — COMPACTA: cada celula tem o
 * principal em cima e o complemento embaixo (data e horarios; periodo e
 * parado; volumes/hora e volumes). A maquina so' aparece quando ha' mais
 * de uma — com uma so', era a mesma palavra em todas as linhas.
 *
 * So' as tocadas volume a volume abrem o detalhe: o produto vira o botao
 * da linha (o teclado chega nele) e a linha inteira abre com o mouse. As
 * feitas por horarios nao tem intervalo, e a linha diz isso por escrito.
 */
/** O aviso da linha para cada pendencia de analise (ver useAnalisesDoPcp). */
const AVISO_PENDENCIA = {
  'salvar-recusado': { texto: 'Análise não salva — abra para ver o motivo', estilo: est.embPendenciaCritica },
  'reabrir-recusado': { texto: 'Não reabriu — abra para ver o motivo', estilo: est.embPendenciaCritica },
  'nota-nao-salva': { texto: 'Nota digitada, ainda não salva', estilo: est.embPendenciaAtencao },
};

function TabelaEmbalagem({ medicoes, aoAbrir, pendenciaDe }) {
  const variasMaquinas = new Set(medicoes.map((c) => nomeChave(c.maquina))).size > 1;
  return (
    <section style={est.painel} aria-label="Medições da embalagem">
      <div style={est.painelTopo}>
        <div style={est.painelTopoTexto}>
          <h2 style={est.painelTitulo}>Medições da embalagem</h2>
          <p style={est.painelDica}>
            Clique numa medição para abrir o volume a volume; lida, salve a análise no alto
            dela e você volta para cá. Volumes/hora do período inteiro, com as paradas
            dentro — o que de fato saiu.
          </p>
        </div>
      </div>
      <table style={est.tabela}>
        <thead>
          <tr>
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
            // O dia em que se MEDIU, o mesmo do detalhe e do corte dos 30 dias
            // (salvo_em e' o dia em que sincronizou: offline, pode ser outro).
            const [dia, hora] = formatarDataHora(c.iniciado_em || c.salvo_em).split(' ');
            const estiloLinha = abre ? est.embLinhaClicavel : undefined;
            const classeLinha = abre ? 'embalagem-linha' : undefined;
            // O segundo clique de um duplo clique nao abre: ver cliqueSimples.
            const aoClicarLinha = abre ? cliqueSimples(() => aoAbrir(c)) : undefined;
            const aviso = AVISO_PENDENCIA[pendenciaDe(c)];
            return (
              <Fragment key={c.id}>
              <tr style={estiloLinha} className={classeLinha} onClick={aoClicarLinha}>
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
                      deixada para tras: de volta a' lista, sem isto ninguem
                      saberia. */}
                  {abre && aviso && <span style={aviso.estilo}>{aviso.texto}</span>}
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
                  <td style={est.tdObservacao} colSpan={4}>
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
    </section>
  );
}
