import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  CRITERIOS_CONFERENCIA, comparativoDeParadas, conferenciaRapida, faixaHoraria,
  formatarDuracao, nomeChave, numeroDecimal, resumirConferencias, ritmoPorHoraDoDia,
  rotuloMotivo, somarParadas, textoDecimal,
} from '../../domain/cronoanalise.js';
import { analisarConferencias } from '../../domain/analiseConferencias.js';
import { compararMaquinas, constanciaTexto, lerGrupo } from '../../domain/comparativoMaquinas.js';
import { classesDeCiclo, lerClasse } from '../../domain/ritmoPorCiclo.js';
import { codigoPreferido, useMotivosParada } from '../../lib/motivosParada.js';
import {
  analisarConferenciasComIa, arquivarConferencia, arquivarConferencias, excluirConferencia,
  listarCadastroMaquinas, listarConferenciasServidor, renomearPecaConferencia,
  renomearPecaConferencias, salvarParadasConferencia,
} from '../../lib/api.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import { GraficoRitmoMaquinas } from './graficos.jsx';
import ComparativoMaquinas from './ComparativoMaquinas.jsx';
import RitmoPorCiclo from './RitmoPorCiclo.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';

/**
 * RELATORIO RITMO POR MAQUINA — modelo BASICO, no PC.
 *
 * Chamava-se "Furadeiras" de quando so' havia furadeira medida. O cadastro
 * ganhou fresadora, embalagem e o que mais entrar: o nome passou a mentir
 * sobre o que a tela cobre, e quem media uma fresadora nao achava onde ver
 * o resultado. O relatorio e' de POSTO, seja ele qual for.
 *
 * As medicoes nascem no celular, sobem pela fila offline e chegam aqui.
 * Redesenho de ago/2026, a pedido de quem usa: o relatorio anterior
 * carimbava "AMOSTRA INSUFICIENTE" em quase tudo e falava em CV%, ciclo do
 * motor e criterios — jargao que so' o analista lia. Este aqui responde as
 * perguntas de qualquer pessoa da fabrica, em portugues:
 *
 *   - quantas pecas por hora (e POR MINUTO) cada maquina faz;
 *   - quantas pecas por hora cada PECA faz em cada maquina;
 *   - quanto tempo a maquina rodou e quanto ficou parada, e por que.
 *
 * O criterio de amostra NAO sumiu do calculo (resumirConferencias segue se
 * autoavaliando) — ele virou uma nota discreta em cinza ("ainda em
 * medicao"), nunca um carimbo na frente do numero.
 *
 * O FILTRO por maquina, na lateral, vale para o relatorio INTEIRO:
 * numeros do topo, cartoes, quadros, grafico E a folha impressa. O que
 * esta' na tela e' o que sai no papel — e' assim que se imprime o relatorio
 * de uma maquina so'.
 *
 * O ritmo medio e' ponderado pelo tempo (soma de pecas sobre soma do tempo
 * com a maquina rodando): media simples de taxas deixaria uma medicao de
 * 5 minutos valer o mesmo que uma de 2 horas.
 */
/* Id do item "Todas" na lateral. Filtro nenhum e' `null` no estado; a
   lateral precisa de um id de verdade para marcar o ativo. */
const TODAS = '__todas';

/** Pecas por minuto a partir do ritmo em pecas/hora — pedido de 31/08. */
const porMinuto = (pecasPorHora) => (pecasPorHora / 60).toFixed(1);

/* A escolha de levar a analise para o papel fica gravada no navegador:
   quem imprime com analise hoje quase sempre quer amanha tambem. Sem
   armazenamento (aba privada), a escolha vale so' enquanto a tela vive. */
const CHAVE_ANALISE_PAPEL = 'ritmo.analise-na-impressao';
const lerAnaliseNoPapel = () => {
  try { return localStorage.getItem(CHAVE_ANALISE_PAPEL) === '1'; } catch { return false; }
};

export default function RelatorioConferencias({ aoVoltar, aoVerInicio }) {
  const [linhas, setLinhas] = useState([]);
  const [outras, setOutras] = useState(0);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [confirmandoLote, setConfirmandoLote] = useState(null);
  const [editandoParadas, setEditandoParadas] = useState(null);
  const [renomeando, setRenomeando] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [analiseNoPapel, setAnaliseNoPapel] = useState(lerAnaliseNoPapel);

  const alternarAnaliseNoPapel = () => setAnaliseNoPapel((v) => {
    const novo = !v;
    try { localStorage.setItem(CHAVE_ANALISE_PAPEL, novo ? '1' : '0'); } catch { /* sem armazenamento */ }
    return novo;
  });

  useEffect(() => { carregar(verArquivadas); }, [verArquivadas]);

  /**
   * O GRUPO da maquina (0002 · FURADEIRA) vem do cadastro, ligado pelo
   * nome — a medicao grava texto, e a ligacao usa a mesma chave
   * normalizada do agrupamento. Falha de carga nao derruba o relatorio:
   * sem cadastro, as maquinas simplesmente aparecem sem grupo.
   */
  const [mapaGrupos, setMapaGrupos] = useState(() => new Map());
  useEffect(() => {
    listarCadastroMaquinas()
      .then(({ maquinas }) => {
        const mapa = new Map();
        for (const m of maquinas) {
          if (m.grupo_codigo) mapa.set(nomeChave(m.nome), `${m.grupo_codigo} · ${m.grupo_nome}`);
        }
        setMapaGrupos(mapa);
      })
      .catch(() => {});
  }, []);
  const grupoDe = (maquina) => mapaGrupos.get(nomeChave(maquina)) || null;

  async function carregar(arquivadas = verArquivadas) {
    setEstado('carregando');
    try {
      const r = await listarConferenciasServidor({ arquivadas });
      setLinhas(r.conferencias || []);
      setOutras(r.outras || 0);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  async function alternarArquivo(c) {
    setOcupado(c.id);
    setErro(null);
    try { await arquivarConferencia(c.id, !c.arquivada); await carregar(); }
    catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  /**
   * ARQUIVAR POR MAQUINA — o pedido de quem usa: a medicao chega uma a uma,
   * mas sai por posto ("a FURADEIRA 16 ja' foi analisada, tira ela do
   * relatorio"). Arquivar de linha em linha exigia um clique por medicao e
   * nao dava para saber quando tinha acabado.
   *
   * O lote e' exatamente o que esta' na tela sob aquele nome: os mesmos ids
   * das linhas visiveis. Assim o que se arquiva e' o que se ve — a mesma
   * regra do "imprime o que esta' na tela".
   */
  async function alternarArquivoDaMaquina(lote) {
    setOcupado('lote');
    setErro(null);
    try {
      await arquivarConferencias(lote.ids, lote.arquivada);
      setConfirmandoLote(null);
      // O filtro morre junto: a maquina que acabou de sair da lista nao tem
      // mais o que mostrar, e a tela ficaria vazia sem dizer por que.
      setFiltro(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  /**
   * RENOMEAR A PECA — o nome vem digitado do aparelho, e o mesmo produto
   * chega com grafias diferentes conforme quem mediu. No Ritmo por peca
   * isso vira duas linhas com metade das medicoes cada, e nenhuma delas
   * descreve a peca. Corrigir o texto e' o que junta as medicoes de novo.
   *
   * `tambemAsOutras` e' o coracao da correcao: renomear so' a linha aberta
   * deixaria as outras medicoes com a grafia velha — o problema continuaria
   * de pe'. Por isso o padrao e' corrigir todas as que tem o mesmo nome.
   */
  async function gravarNomeDaPeca({ conferencia, nome, tambemAsOutras, irmas }) {
    setOcupado(conferencia.id);
    setErro(null);
    try {
      if (tambemAsOutras && irmas.length > 1) await renomearPecaConferencias(irmas, nome);
      else await renomearPecaConferencia(conferencia.id, nome);
      setRenomeando(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  async function gravarParadas(c, paradas) {
    setOcupado(c.id);
    setErro(null);
    try {
      await salvarParadasConferencia(c.id, paradas);
      setEditandoParadas(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  async function excluir(c) {
    setOcupado(c.id);
    setErro(null);
    try { await excluirConferencia(c.id); setConfirmando(null); await carregar(); }
    catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  const resumo = useMemo(() => resumirConferencias(linhas), [linhas]);
  // Ritmo POR PECA: mesmo calculo, agrupado por peca x maquina — e' o
  // numero que dimensiona carga e lote. Ver resumirConferencias.
  const resumoPecas = useMemo(() => resumirConferencias(linhas, { porPeca: true }), [linhas]);

  /**
   * O filtro da lateral corta o relatorio INTEIRO — medicoes, resumos,
   * numeros do topo e a folha impressa. Uma unica regra ("o que esta' na
   * tela e' o que imprime") e' mais facil de entender do que um filtro que
   * vale para umas secoes e nao para outras.
   */
  const visiveis = useMemo(
    () => (filtro
      ? linhas.filter((c) => nomeChave(String(c.maquina || '').trim() || 'Sem máquina') === nomeChave(filtro))
      : linhas),
    [linhas, filtro],
  );
  const resumoVisivel = useMemo(
    () => (filtro ? resumo.filter((g) => nomeChave(g.maquina) === nomeChave(filtro)) : resumo),
    [resumo, filtro],
  );
  const resumoPecasVisivel = useMemo(
    () => (filtro ? resumoPecas.filter((g) => nomeChave(g.maquina) === nomeChave(filtro)) : resumoPecas),
    [resumoPecas, filtro],
  );

  /* A analise e' calculada UMA vez, aqui, porque tem dois leitores: o
     painel na tela e — quando o usuario marca "Sair na impressão" — a
     folha A4. Calcular em cada um deixaria os dois divergirem um dia. */
  const analise = useMemo(
    () => analisarConferencias({
      maquinas: resumoVisivel, pecas: resumoPecasVisivel, conferencias: visiveis, grupoDe,
    }),
    // mapaGrupos, nao grupoDe: a funcao e' recriada a cada render e
    // reiniciaria a analise a toa. O que muda a leitura e' o cadastro.
    [resumoVisivel, resumoPecasVisivel, visiveis, mapaGrupos],
  );

  /**
   * Com a lateral filtrada numa maquina, o grafico abre POR MEDICAO:
   * uma barra por medicao, com a peca embaixo — e' assim que se enxerga
   * qual peca puxa o ritmo para cima ou para baixo. Sem filtro, cada
   * maquina e' uma barra so' (a media ponderada), porque duas barras da
   * mesma maquina nao se comparam com a barra unica da vizinha.
   *
   * Da esquerda para a direita, da mais antiga para a mais recente: e' a
   * ordem em que o posto foi medido. A hachura aqui marca MEDICAO CURTA
   * (menos de 5 min de maquina rodando) — a legenda que vai junto diz isso.
   */
  const barrasDoFiltro = useMemo(() => {
    if (!filtro) return null;
    return [...visiveis].reverse().map((c) => {
      const calc = conferenciaRapida({
        duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
        ciclosPorPeca: c.ciclos_por_peca,
      });
      if (!calc || !(calc.pecasPorHora > 0)) return null;
      const peca = String(c.peca || '').trim();
      return {
        chave: c.id,
        rotulo: faixaHoraria(c) || formatarDataHora(c.salvo_em),
        nota: peca ? (peca.length > 20 ? `${peca.slice(0, 19)}…` : peca) : null,
        ritmoMedio: calc.pecasPorHora,
        confiavel: calc.produtivoMs >= CRITERIOS_CONFERENCIA.minPeriodoMs,
        maquina: filtro,
      };
    }).filter(Boolean);
  }, [filtro, visiveis]);

  /**
   * Os numeros do topo, em palavras que qualquer pessoa le: ritmo medio
   * (pecas/hora E pecas/minuto), quantas medicoes, quanto tempo a maquina
   * rodou e quanto ficou parada. Seguem o filtro da lateral.
   */
  const painel = useMemo(() => {
    if (!visiveis.length) return null;
    let totalMs = 0; let paradaMs = 0; let pecasTot = 0;
    const todasParadas = [];
    for (const c of visiveis) {
      const dur = Number(c.duracao_ms) || 0;
      const par = somarParadas(c.paradas);
      totalMs += dur;
      paradaMs += Math.min(par.totalMs, dur);
      pecasTot += Number(c.pecas) || 0;
      if (c.paradas?.length) todasParadas.push(...c.paradas);
    }
    const produtivoMs = totalMs - paradaMs;
    return {
      n: visiveis.length,
      maquinas: resumoVisivel.length,
      pecasTot,
      totalMs,
      produtivoMs,
      paradaMs,
      ritmoMedio: produtivoMs > 0 ? (pecasTot * 3600000) / produtivoMs : null,
      pareto: somarParadas(todasParadas),
    };
  }, [visiveis, resumoVisivel]);

  /**
   * A CURVA DO DIA: o ritmo por hora do relogio, juntando as medicoes
   * feitas na mesma hora de qualquer data. Segue o filtro da lateral como
   * o resto — filtrou a maquina, e' a curva dela.
   */
  /**
   * So' com UMA maquina em vista. Misturando postos, a hora "fraca" pode
   * ser so' a hora em que a maquina mais lenta foi medida — a curva diria
   * "as 9h rende menos" quando o que mudou foi a maquina, nao a hora. Com
   * uma maquina (filtrada na lateral, ou porque so' ha' uma), a comparacao
   * e' hora contra hora do mesmo posto.
   */
  const curvaDoDia = useMemo(
    () => (resumoVisivel.length === 1 ? ritmoPorHoraDoDia(visiveis) : []),
    [visiveis, resumoVisivel.length],
  );

  /**
   * O COMPARATIVO do periodo: o que saiu x o que teria saido no MESMO
   * tempo, sem parada. Sai do painel, entao segue o filtro da lateral
   * como todo o resto da tela — e some quando nao houve parada, porque
   * ai' o que saiu ja' E' o potencial e comparar seria inventar perda.
   */
  const comparativo = useMemo(() => comparativoDeParadas(resumoVisivel), [resumoVisivel]);

  /**
   * O COMPARATIVO ENTRE MAQUINAS — "qual esta' melhor?".
   *
   * Calculado aqui, uma vez, pelo mesmo motivo da analise: a tela e o PAPEL
   * leem os dois, e dois calculos divergem um dia.
   *
   * Usa o GRUPO do cadastro para saber quais maquinas podem ser comparadas
   * entre si — por isso depende de mapaGrupos, e nao da funcao grupoDe (que
   * e' recriada a cada render e reiniciaria a conta a toa).
   *
   * Com uma maquina escolhida na lateral nao ha' com quem comparar: o
   * quadro simplesmente nao aparece (compararMaquinas devolve grupo nenhum
   * com uma maquina so').
   */
  const entreMaquinas = useMemo(
    () => compararMaquinas({ maquinas: resumoVisivel, pecas: resumoPecasVisivel, grupoDe }),
    [resumoVisivel, resumoPecasVisivel, mapaGrupos],
  );

  /**
   * AS CLASSES DE CICLO — pecas agrupadas por quantos acionamentos do motor
   * pedem. E' a leitura que responde "as pecas sao diferentes, e dai'?": com
   * a mesma furacao, o ritmo deveria bater, e quem foge da faixa aponta para
   * o manuseio. Segue o filtro da lateral como todo o resto.
   */
  const porCiclo = useMemo(() => classesDeCiclo(resumoPecasVisivel), [resumoPecasVisivel]);

  /* A mesma lateral da lista e do estudo. O filtro por maquina vai para
     dentro dela pelo mesmo motivo que os produtos foram na lista: e'
     navegacao, nao um controle do conteudo.

     O bloco aparece MESMO com uma maquina so' (mudanca de 31/08): ele
     sumia com uma unica maquina medida, e o usuario nao achava onde
     filtrar para imprimir — controle que aparece e some nao se aprende. */
  /**
   * A lateral lista as maquinas DEBAIXO DO GRUPO do cadastro
   * (0002 · FURADEIRA, 0004 · FRESADORA), a mesma leitura que o celular ja'
   * oferece na escolha da maquina. Com postos de naturezas diferentes
   * medidos no mesmo relatorio, uma lista corrida de nomes obrigava a
   * decorar qual maquina e' de qual grupo.
   *
   * Maquina sem grupo no cadastro nao some: cai em "Sem grupo", no fim — o
   * cadastro organiza, nao trava, como no celular.
   */
  const secoes = useMemo(() => {
    if (!resumo.length) return [];
    const porGrupo = new Map();
    for (const g of resumo) {
      const grupo = grupoDe(g.maquina) || 'Sem grupo';
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
      porGrupo.get(grupo).push(g);
    }
    // Grupos em ordem de codigo (0002 antes de 0004); "Sem grupo" por ultimo.
    const grupos = [...porGrupo.keys()].sort((a, b) => {
      if (a === 'Sem grupo') return 1;
      if (b === 'Sem grupo') return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    const itens = [{ id: TODAS, rotulo: 'Todas', contador: linhas.length }];
    // Com um grupo so' o cabecalho nao organiza nada: repetiria o obvio
    // acima de uma lista que ja' e' toda dele.
    const nomearGrupos = grupos.length > 1;
    for (const grupo of grupos) {
      if (nomearGrupos) itens.push({ id: `grupo:${grupo}`, rotulo: grupo, cabecalho: true });
      for (const g of porGrupo.get(grupo)) {
        itens.push({ id: g.maquina, rotulo: g.maquina, contador: g.n, recuado: nomearGrupos });
      }
    }
    return itens;
  }, [resumo, linhas.length, mapaGrupos]);

  /* O lote de UMA maquina: os ids das linhas que estao na tela sob aquele
     nome. So' existe com a maquina escolhida na lateral — "arquivar tudo"
     sem escolher maquina seria esvaziar o relatorio inteiro num clique. */
  const loteDaMaquina = filtro && visiveis.length
    ? { maquina: filtro, ids: visiveis.map((c) => c.id), arquivada: !verArquivadas }
    : null;

  return (
    <div style={est.tela}>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Estudos"
          aoVerInicio={aoVerInicio}
          contexto={{
            rotulo: 'Relatório',
            // "Furadeiras" era o nome de quando so' havia furadeira medida.
            // Com fresadora e embalagem no cadastro, o nome do relatorio
            // passou a mentir sobre o que ele cobre.
            titulo: 'Ritmo por máquina',
            subtitulo: 'Peças/hora e peças/minuto de cada posto',
          }}
          acaoPrimaria={estado === 'pronto' && linhas.length > 0 && !verArquivadas
            ? {
                // O rotulo diz O QUE vai sair no papel: com uma maquina
                // escolhida na lateral, imprime so' ela.
                rotulo: secoes.length ? (filtro ? 'Imprimir esta máquina' : 'Imprimir todas') : 'Imprimir',
                aoClicar: () => window.print(),
              }
            : undefined}
          secoes={secoes}
          secoesRotulo="Máquinas"
          secaoAtiva={filtro ?? TODAS}
          aoTrocarSecao={(id) => setFiltro(id === TODAS ? null : id)}
          /* O "arquivar esta maquina" NAO vem para ca'. A lateral e'
             navegacao (mais imprimir, que nao muda dado); arquivar mora no
             cabecalho da tabela, encostado nas linhas que vao sair — o
             mesmo lugar do "Arquivar" de cada linha. */
          acoes={estado === 'pronto' && (verArquivadas || outras > 0)
            ? [{
                rotulo: verArquivadas ? 'Ver ativas' : `Arquivadas ${outras}`,
                aoClicar: () => { setFiltro(null); setVerArquivadas((v) => !v); },
              }]
            : []}
          acoesRotulo="Este relatório"
        />

        <main style={est.conteudoLateral}>
          {estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando medições" texto="Buscando as medições sincronizadas." />
          )}

          {estado === 'erro' && (
            <EstadoVazio
              modo="analise"
              titulo="Não foi possível carregar"
              texto={erro}
              acao={(
                <button type="button" style={est.botaoImprimir} onClick={() => carregar()}>
                  Tentar de novo
                </button>
              )}
            />
          )}

          {/* Lista vazia com medicao arquivada do outro lado nao e' "nada
              sincronizado": era isso que a tela dizia depois de arquivar a
              ultima medicao de uma maquina — e parecia perda de dado. */}
          {estado === 'pronto' && !linhas.length && (
            <EstadoVazio
              modo="analise"
              titulo={verArquivadas ? 'Nenhuma medição arquivada' : (
                outras > 0 ? 'Todas as medições estão arquivadas' : 'Nenhuma medição sincronizada'
              )}
              texto={verArquivadas
                ? 'O que foi arquivado volta para cá. Nada foi apagado do banco.'
                : (outras > 0
                  ? (outras === 1
                    ? 'A única medição deste relatório está arquivada — fora dos cálculos, guardada no banco.'
                    : `As ${outras} medições deste relatório estão arquivadas — fora dos cálculos, guardadas no banco.`)
                  : 'Esta tela mede o ritmo de qualquer posto: no celular, abra Ritmo da máquina, informe máquina, peça e horários, e a medição aparece aqui assim que o aparelho sincroniza. Para cronometrar ciclo a ciclo, com tempo padrão, use um estudo de tempos.')}
              acao={(verArquivadas || outras > 0) ? (
                <button
                  type="button"
                  style={est.botaoImprimir}
                  onClick={() => { setFiltro(null); setVerArquivadas((v) => !v); }}
                >
                  {verArquivadas ? 'Ver ativas' : `Ver arquivadas (${outras})`}
                </button>
              ) : undefined}
            />
          )}

          {/* Falha de acao (arquivar, excluir) precisa APARECER — e aparecer
              ONDE O USUARIO ESTA'.
              A faixa ja' existia, mas no topo do relatorio: quem clicava em
              "Arquivar" na tabela, no fim de uma pagina de dois metros,
              recebia a recusa a mil pixels acima da propria tela e concluia
              que o botao nao fazia nada. Foi exatamente esse o "arquivar nao
              funciona" relatado em 31/08. Agora ela flutua sobre a pagina,
              visivel de qualquer altura da rolagem.
              Com uma janela aberta ela nao aparece: la' o erro sai dentro da
              propria janela, ao lado do botao que falhou. */}
          {erro && estado === 'pronto' && !editandoParadas && !confirmando && !confirmandoLote
            && !renomeando && (
            <div style={est.avisoFlutuante} role="alert">
              <span style={{ flex: 1, minWidth: 0 }}>{erro}</span>
              <button type="button" style={est.botaoLinha} onClick={() => setErro(null)}>
                Fechar
              </button>
            </div>
          )}

          {estado === 'pronto' && linhas.length > 0 && (
            <>
              {!verArquivadas && painel && (
                <section style={est.kpis} aria-label="Resumo do período">
                  {[
                    {
                      rot: 'Ritmo médio',
                      val: painel.ritmoMedio != null ? `${Math.round(painel.ritmoMedio)} pç/h` : '—',
                      // A BASE junto do numero: sem ela, este cartao mostra
                      // o mesmo valor do POTENCIAL do quadro abaixo e um
                      // valor diferente do que saiu — a mesma confusao de
                      // 10,3 x 13,2, agora dentro de uma tela so'.
                      sub: painel.ritmoMedio != null
                        ? `${porMinuto(painel.ritmoMedio)} peças por minuto — só o tempo com a máquina rodando`
                        : 'sem tempo de máquina rodando',
                    },
                    { rot: 'Medições', val: String(painel.n), sub: `${painel.maquinas} máquina(s) · ${painel.pecasTot} peças` },
                    {
                      // O PERCENTUAL na frente, a duracao embaixo: e' a
                      // disponibilidade do periodo, e percentual e' o que se
                      // acompanha no tempo. "18 min de 30" obrigava quem le'
                      // a dividir de cabeca para chegar no mesmo numero.
                      rot: 'Máquina rodando',
                      val: painel.totalMs > 0
                        ? `${Math.round((painel.produtivoMs / painel.totalMs) * 100)}%`
                        : '—',
                      sub: `${formatarDuracao(painel.produtivoMs)} de ${formatarDuracao(painel.totalMs)} observados`,
                    },
                    {
                      rot: 'Tempo parado',
                      val: painel.paradaMs > 0 ? formatarDuracao(painel.paradaMs) : '—',
                      sub: painel.pareto.setupMs > 0
                        ? `${formatarDuracao(painel.pareto.setupMs)} em troca/setup`
                        : 'nenhuma parada marcada',
                    },
                  ].map((k) => (
                    <div key={k.rot} style={est.kpi}>
                      <div style={est.kpiRotulo}>{k.rot}</div>
                      <div style={est.kpiValor}>{k.val}</div>
                      <div style={est.kpiSub}>{k.sub}</div>
                    </div>
                  ))}
                </section>
              )}

              {/* O COMPARATIVO, em destaque.
                  O relatorio ja' dizia o tempo parado e o ritmo, mas quem
                  le' tinha de fazer a conta de cabeca para saber o que
                  aquilo custou em PECA. Aqui os dois numeros ficam lado a
                  lado — o que saiu e o que teria saido no MESMO periodo,
                  sem a parada — e a diferenca fica em destaque, porque e'
                  ela que muda a conversa na reuniao.
                  So' aparece com parada marcada: sem parada, o que saiu ja'
                  E' o potencial, e o quadro viraria enfeite. */}
              {!verArquivadas && comparativo && (
                <section style={est.comparativo} aria-label="Comparativo com e sem parada">
                  <div style={est.comparativoTopo}>
                    <h2 style={est.comparativoTitulo}>
                      O que a parada custou{filtro ? ` — ${filtro}` : ''}
                    </h2>
                    {/* O MESMO criterio do cartao da maquina. Sem esta nota,
                        uma medicao de 6 min afirmava "deixou de sair 21
                        peças" ao lado de um cartao dizendo "ainda em
                        medição" — sobre o mesmo dado. Nota discreta, nunca
                        carimbo: o numero continua valendo, so' avisa que
                        ainda assenta. */}
                    {resumoVisivel.some((g) => !g.confiavel) && (
                      <p style={est.comparativoNota}>
                        Ainda em medição: com mais medições este número muda.
                      </p>
                    )}
                    <p style={est.comparativoDica}>
                      Mesmo período observado ({formatarDuracao(comparativo.duracaoMs)}). A conta é
                      feita <strong>máquina por máquina</strong> e somada: cada uma no ritmo que ela
                      própria já provou com ela rodando. Não é meta nem capacidade de catálogo — é o
                      que {comparativo.maquinas > 1 ? 'esses postos fariam' : 'esse posto faria'} sem
                      a parada no meio.
                    </p>
                  </div>

                  <div style={est.comparativoGrade}>
                    <div style={est.comparativoCaixa}>
                      <div style={est.comparativoRotulo}>Saiu no período</div>
                      <div style={est.comparativoValor}>
                        {comparativo.pecas}
                        <span style={est.comparativoUnidade}>peças</span>
                      </div>
                      <div style={est.comparativoSub}>
                        {Math.round(comparativo.ritmoPeriodo)} pç/h · {porMinuto(comparativo.ritmoPeriodo)} pç/min
                      </div>
                      <div style={est.comparativoSub}>
                        com {formatarDuracao(comparativo.paradaMs)} de máquina parada dentro do período
                      </div>
                    </div>

                    <div style={est.comparativoCaixa}>
                      <div style={est.comparativoRotulo}>Teria saído no mesmo tempo</div>
                      <div style={est.comparativoValor}>
                        {comparativo.potencial}
                        <span style={est.comparativoUnidade}>peças</span>
                      </div>
                      <div style={est.comparativoSub}>
                        {Math.round(comparativo.ritmoPotencial)} pç/h · {porMinuto(comparativo.ritmoPotencial)} pç/min
                      </div>
                      <div style={est.comparativoSub}>
                        o ritmo de cada máquina rodando ({formatarDuracao(comparativo.produtivoMs)} no
                        total), aplicado ao período dela
                      </div>
                    </div>

                    <div style={est.comparativoCaixaDestaque}>
                      <div style={est.comparativoRotuloDestaque}>Deixou de sair</div>
                      <div style={est.comparativoValorDestaque}>
                        {comparativo.perdidas}
                        <span style={est.comparativoUnidade}>peças</span>
                      </div>
                      <div style={est.comparativoSubDestaque}>
                        {Math.round(comparativo.ganhoPct)}% a mais de produção no mesmo tempo
                      </div>
                      <div style={est.comparativoSubDestaque}>
                        é o que os {formatarDuracao(comparativo.paradaMs)} parados custaram
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section style={est.resumoGrade} aria-label="Resumo por máquina">
                {resumoVisivel.map((g) => (
                  <div key={g.maquina} style={est.cartaoMaquina}>
                    <div style={est.cartaoTopo}>
                      <div style={est.cartaoTitulo}>
                        {g.maquina}
                        {grupoDe(g.maquina) && <span style={est.cartaoGrupo}>{grupoDe(g.maquina)}</span>}
                      </div>
                    </div>
                    <div style={est.cartaoRitmo}>
                      {Math.round(g.ritmoMedio)}
                      <span style={est.cartaoRitmoSufixo}>peças por hora</span>
                    </div>
                    <div style={est.cartaoRitmoMinuto}>{porMinuto(g.ritmoMedio)} peças por minuto</div>
                    <div style={est.cartaoLinhas}>
                      <span>{g.n} medição(ões) · {g.totalPecas} peças · {formatarDuracao(g.totalProdutivoMs)} rodando</span>
                      {/* O percentual ja' vem pronto de resumirConferencias
                          (disponibilidadePct) — a tela nao refaz a conta. Sem
                          parada marcada seria sempre 100%, e a linha viraria
                          ruido: por isso so' aparece com parada. */}
                      {g.totalParadaMs > 0 && (
                        <span>Máquina rodando: {Math.round(g.disponibilidadePct)}% do período observado</span>
                      )}
                      {g.totalParadaMs > 0 && (
                        <span>
                          Parado: {formatarDuracao(g.totalParadaMs)}
                          {g.totalSetupMs > 0 && ` (troca/setup ${formatarDuracao(g.totalSetupMs)})`}
                        </span>
                      )}
                      {g.n >= 2 && g.melhor && (
                        <span>
                          Melhor: {Math.round(g.melhor.ritmo)} pç/h{g.melhor.peca ? ` (${g.melhor.peca})` : ''}
                          {' · '}Pior: {Math.round(g.pior.ritmo)} pç/h{g.pior.peca ? ` (${g.pior.peca})` : ''}
                        </span>
                      )}
                    </div>
                    {/* Nota em cinza, nunca carimbo: o numero ja' e' o
                        resultado — a nota so' lembra que ele ainda assenta. */}
                    {!g.confiavel && (
                      <div style={est.notaPoucas}>
                        Ainda em medição — o número fica mais certeiro com mais medições.
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {/* QUAL MAQUINA ESTA' MELHOR — depois dos cartoes, porque a
                  comparacao pressupoe ter visto cada maquina sozinha.
                  Compara dentro do GRUPO do cadastro e separa a pergunta em
                  ritmo, tempo rodando e constancia: ver ComparativoMaquinas. */}
              {!verArquivadas && <ComparativoMaquinas comparativo={entreMaquinas} />}

              {/* A REGUA DO CICLO. Vem depois do comparativo porque e' ele
                  que levanta a duvida ("as pecas sao diferentes") que este
                  quadro responde. Ver RitmoPorCiclo. */}
              {!verArquivadas && <RitmoPorCiclo classes={porCiclo.classes} mistas={porCiclo.mistas} />}

              {/* Ritmo POR PECA — o numero que planeja carga e lote.
                  So' na visao ativa: ritmo nao sai de arquivadas. */}
              {!verArquivadas && resumoPecasVisivel.length > 0 && (
                <section style={est.painel} aria-label="Ritmo por peça">
                  {/* O mesmo respiro das celulas: sem ele o titulo encosta na
                      borda do cartao e parece cortado (apontado em 28/08). */}
                  <div style={{ padding: `${espaco.lg}px ${espaco.lg}px ${espaco.sm}px` }}>
                    <h2 style={est.iaTitulo}>Ritmo por peça</h2>
                    <p style={est.iaTexto}>
                      Quantas peças saem por hora e por minuto, peça a peça, com a máquina rodando.
                      A coluna <strong>Acion.</strong> diz quantas vezes o motor é acionado para
                      fazer uma peça: peça de mais acionamentos rende menos peças/hora sem a
                      máquina estar mais lenta.
                    </p>
                  </div>
                  <table style={est.tabela}>
                    <thead>
                      <tr>
                        <th style={est.th}>Peça</th>
                        <th style={est.th}>Máquina</th>
                        {/* A coluna que o redesenho de 31/08 tirou junto com o
                            jargao. Sem ela, duas linhas com ritmos diferentes
                            nao tinham como ser explicadas — e a explicacao
                            estava gravada na medicao o tempo todo. */}
                        <th style={est.thNum} title="Acionamentos do motor para fazer uma peça">
                          Acion.
                        </th>
                        <th style={est.thNum}>Medições</th>
                        <th style={est.thNum}>Peças</th>
                        <th style={est.thNum}>Tempo rodando</th>
                        <th style={est.thNum}>Peças/hora</th>
                        <th style={est.thNum}>Peças/min</th>
                        <th style={est.thNum} title="Tempo de um acionamento do motor — comparável entre peças de furação diferente">
                          Por acion.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoPecasVisivel.map((g) => (
                        <tr key={`${g.maquina}·${g.peca}`}>
                          <td style={est.tdCurto}>{g.peca}</td>
                          <td style={est.tdCurto}>{g.maquina}</td>
                          <td
                            style={est.tdNum}
                            title={g.ciclosMistos
                              ? `Gravada com ${g.ciclosVistos.join(' e ')} acionamentos — corrija na medição`
                              : undefined}
                          >
                            {g.ciclosMistos ? `${g.ciclosVistos.join('/')} ⚠` : g.ciclosPorPeca}
                          </td>
                          <td style={est.tdNum}>{g.n}</td>
                          <td style={est.tdNum}>{g.totalPecas}</td>
                          <td style={est.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                          <td style={est.tdNumForte}>{Math.round(g.ritmoMedio)}</td>
                          <td style={est.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                          <td style={est.tdNum}>{(g.cicloMotorMs / 1000).toFixed(1)}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {!verArquivadas && resumoVisivel.length > 0 && (
                <section style={est.painelGrafico} aria-label="Ritmo por máquina">
                  {filtro && barrasDoFiltro?.length ? (
                    <GraficoRitmoMaquinas
                      maquinas={barrasDoFiltro}
                      titulo={`Medições — ${filtro}`}
                      subtitulo="Peças/hora de cada medição, da mais antiga para a mais recente"
                      rotuloOk="Medição"
                      rotuloFraco="Medição curta (menos de 5 min rodando)"
                      notaFraca="medição curta"
                    />
                  ) : (
                    <GraficoRitmoMaquinas
                      maquinas={resumoVisivel}
                      subtitulo="Peças por hora de cada máquina, com a máquina rodando"
                      rotuloOk="Ritmo medido"
                      rotuloFraco="Ainda em medição"
                      notaFraca="ainda em medição"
                    />
                  )}
                </section>
              )}

              {/* A CURVA DO DIA.
                  A media do periodo esconde a hora fraca: o posto que faz
                  700 pc/h de manha e 500 depois do almoco aparece como 620
                  o dia inteiro, e ninguem vai olhar o que muda as 13h.
                  Com UMA hora medida nao ha curva — uma barra sozinha nao
                  compara com nada, entao o quadro so' aparece com duas. */}
              {/* Com varias maquinas medidas, a curva nao aparece — e a tela
                  diz por que e o que fazer, em vez de sumir em silencio. */}
              {!verArquivadas && resumoVisivel.length > 1 && (
                <p style={est.dicaCurva}>
                  Para ver o <strong>ritmo por hora do dia</strong> — onde aparece a queda de fim de
                  turno —, escolha uma máquina em MÁQUINAS, ao lado. Com postos diferentes juntos, a
                  hora fraca seria só a hora em que a máquina mais lenta foi medida.
                </p>
              )}

              {/* Uma maquina, uma hora medida: nao ha' curva, e quem filtrou
                  precisa saber que ela existe e o que destrava. */}
              {!verArquivadas && resumoVisivel.length === 1 && curvaDoDia.length === 1 && (
                <p style={est.dicaCurva}>
                  Ainda não dá para montar o <strong>ritmo por hora do dia</strong>: há medições em
                  uma hora só ({curvaDoDia[0].rotulo}). Meça esta máquina em outro horário — a curva
                  compara hora contra hora do mesmo posto e é onde aparece a queda de fim de turno.
                </p>
              )}

              {!verArquivadas && curvaDoDia.length >= 2 && (
                <section style={est.painelGrafico} aria-label="Ritmo por hora do dia">
                  <GraficoRitmoMaquinas
                    maquinas={curvaDoDia.map((h) => ({
                      ...h,
                      nota: h.n > 1 ? `${h.n} medições` : '1 medição',
                    }))}
                    titulo={`Ritmo por hora do dia${filtro ? ` — ${filtro}` : ''}`}
                    subtitulo="Peças por hora com a máquina rodando, em cada hora do relógio — as medições da mesma hora somam, mesmo de datas diferentes"
                    rotuloOk="Hora medida"
                    rotuloFraco="Menos de 5 min medidos nessa hora"
                    notaFraca="pouco tempo medido"
                  />
                </section>
              )}

              {!verArquivadas && painel && painel.pareto.totalMs > 0 && (
                <div style={est.duasColunas}>
                  <section style={est.painelMiolo} aria-label="Paradas do período">
                    <h2 style={est.iaTitulo}>Paradas</h2>
                    <p style={est.iaTexto}>
                      {formatarDuracao(painel.pareto.totalMs)} de máquina parada — os maiores motivos primeiro
                    </p>
                    <div style={{ display: 'grid', gap: espaco.md, marginTop: espaco.md }}>
                      {painel.pareto.porMotivo.map((m) => (
                        <div key={m.motivo} style={est.paretoLinha}>
                          <span>{m.rotulo}</span>
                          <span style={est.paretoTrilha}>
                            <i style={{ ...est.paretoBarra, width: `${Math.max(4, m.pct)}%` }} />
                          </span>
                          <b style={{ whiteSpace: 'nowrap' }}>{formatarDuracao(m.ms)}</b>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {!verArquivadas && (
                <AnalisePeriodo
                  secoes={analise}
                  resumo={resumoVisivel}
                  noPapel={analiseNoPapel}
                  aoAlternarPapel={alternarAnaliseNoPapel}
                />
              )}

              <section style={est.painel} aria-label={verArquivadas ? 'Medições arquivadas' : 'Todas as medições'}>
                {/* O cabecalho da tabela existe por causa do botao: arquivar
                    UMA maquina inteira precisa ficar ao lado das linhas que
                    vao sair, nao escondido so' na lateral. */}
                <div style={est.painelTopo}>
                  <div style={est.painelTopoTexto}>
                    <h2 style={est.painelTitulo}>
                      {verArquivadas ? 'Medições arquivadas' : 'Todas as medições'}
                      {filtro ? ` · ${filtro}` : ''}
                    </h2>
                    {/* De QUAL tempo saem os numeros. O celular mostra o
                        peças/min do PERIODO (com as paradas dentro) e este
                        relatorio mostra o de MAQUINA RODANDO: os dois estao
                        certos, mas sem dizer isso pareciam contradicao. */}
                    <p style={est.painelDica}>
                      Peças/hora e peças/min saem do tempo com a MÁQUINA RODANDO — o tempo
                      parado sai da conta. No celular, o número grande é a produção do período
                      inteiro; o de máquina rodando fica na linha das paradas.
                    </p>
                    <p style={est.painelDica}>
                      {loteDaMaquina
                        ? (verArquivadas
                          ? `${loteDaMaquina.ids.length} medição(ões) desta máquina — dá para restaurar todas de uma vez.`
                          : `${loteDaMaquina.ids.length} medição(ões) desta máquina — dá para arquivar todas de uma vez.`)
                        : 'Escolha uma máquina em MÁQUINAS, ao lado, para arquivar (ou restaurar) todas as medições dela de uma vez.'}
                    </p>
                  </div>
                  {loteDaMaquina && (
                    <button
                      type="button"
                      style={est.botaoLote}
                      onClick={() => setConfirmandoLote(loteDaMaquina)}
                      disabled={ocupado === 'lote'}
                    >
                      {verArquivadas ? 'Restaurar esta máquina' : 'Arquivar esta máquina'}
                    </button>
                  )}
                </div>
                <table style={est.tabela}>
                  <thead>
                    <tr>
                      <th style={est.th}>Data</th>
                      <th style={est.th}>Máquina</th>
                      <th style={est.th}>Peça</th>
                      <th style={est.th}>Horários</th>
                      <th style={est.thNum}>Período</th>
                      <th style={est.thNum}>Parado</th>
                      <th style={est.thNum}>Rodando %</th>
                      <th style={est.thNum}>Peças</th>
                      <th style={est.thNum}>Peças/hora</th>
                      <th style={est.thNum}>Peças/min</th>
                      <th style={est.th} aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => {
                      const calc = conferenciaRapida({
                        duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
                        ciclosPorPeca: c.ciclos_por_peca,
                      });
                      const par = somarParadas(c.paradas);
                      return (
                        <tr key={c.id}>
                          <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                          <td style={est.tdCurto}>{c.maquina || '—'}</td>
                          {/* O NOME DA PECA e' clicavel: e' texto digitado no
                              aparelho, e e' onde as grafias divergem. Corrigir
                              onde o erro se ve' e' mais curto do que caçar um
                              botao de edicao no fim da linha. */}
                          <td style={est.tdCurto}>
                            <button
                              type="button"
                              style={est.botaoNome}
                              onClick={() => setRenomeando(c)}
                              disabled={ocupado === c.id}
                              title="Corrigir o nome da peça"
                            >
                              {c.peca || 'Sem nome'}
                            </button>
                          </td>
                          <td style={est.tdFraco}>
                            {faixaHoraria(c) || '—'}
                          </td>
                          <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                          <td style={est.tdNum} title={par.porMotivo.map((m) => `${m.rotulo}: ${formatarDuracao(m.ms)}`).join(' · ')}>
                            {par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}
                          </td>
                          {/* Quanto do periodo a maquina passou produzindo —
                              o mesmo numero do cartao, medicao a medicao. */}
                          <td style={est.tdNum} title="Quanto do período a máquina passou produzindo">
                            {calc ? `${Math.round(calc.disponibilidadePct)}%` : '—'}
                          </td>
                          <td style={est.tdNum}>{c.pecas}</td>
                          <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdAcoes}>
                            <button
                              type="button"
                              style={est.botaoLinha}
                              onClick={() => setEditandoParadas(c)}
                              disabled={ocupado === c.id}
                              title="Marcar setup e outras paradas deste período"
                            >
                              {par.porMotivo.length ? `Paradas (${par.porMotivo.length})` : 'Paradas'}
                            </button>
                            <button
                              type="button"
                              style={est.botaoLinha}
                              onClick={() => alternarArquivo(c)}
                              disabled={ocupado === c.id}
                              title={c.arquivada
                                ? 'Voltar para os cálculos'
                                : 'Tirar dos cálculos sem apagar (medição atípica)'}
                            >
                              {c.arquivada ? 'Restaurar' : 'Arquivar'}
                            </button>
                            <button
                              type="button"
                              style={est.botaoExcluir}
                              onClick={() => setConfirmando(c)}
                              disabled={ocupado === c.id}
                              aria-label={`Excluir medição de ${c.maquina || 'sem máquina'}`}
                              title="Excluir de vez (registro errado)"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </main>

        {verVersoes && (
          <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />
        )}

        {renomeando && (
          <RenomearPeca
            conferencia={renomeando}
            /* VISIVEIS, nao todas: com a maquina filtrada, o lote alcancava
               medicao de outra maquina que nao esta na tela. A regra desta
               tela e' "o que se muda e o que se ve" — vale para arquivar e
               vale para renomear. */
            linhas={visiveis}
            erro={erro}
            ocupado={ocupado === renomeando.id}
            aoFechar={() => { setErro(null); setRenomeando(null); }}
            aoGravar={(dados) => gravarNomeDaPeca({ conferencia: renomeando, ...dados })}
          />
        )}

        {editandoParadas && (
          <EditorParadas
            conferencia={editandoParadas}
            erro={erro}
            ocupado={ocupado === editandoParadas.id}
            aoFechar={() => { setErro(null); setEditandoParadas(null); }}
            aoGravar={(paradas) => gravarParadas(editandoParadas, paradas)}
          />
        )}

        {/* Arquivar uma maquina inteira mexe em varias linhas de uma vez: a
            janela diz QUANTAS, e diz que nada e' apagado — a confusao entre
            arquivar e excluir e' a que custa dado. */}
        {confirmandoLote && (
          <div style={est.modal} role="dialog" aria-label="Arquivar máquina">
            <div style={est.caixaModal}>
              <h2 style={est.tituloModal}>
                {confirmandoLote.arquivada
                  ? `Arquivar as medições da ${confirmandoLote.maquina}?`
                  : `Restaurar as medições da ${confirmandoLote.maquina}?`}
              </h2>
              <p style={est.textoModal}>
                {confirmandoLote.arquivada
                  ? <>
                      <strong>{confirmandoLote.ids.length} medição(ões)</strong> saem dos cálculos
                      e da folha impressa. <strong>Nada é apagado</strong>: elas continuam no banco,
                      em Arquivadas, e voltam com um clique.
                    </>
                  : <>
                      <strong>{confirmandoLote.ids.length} medição(ões)</strong> voltam para o
                      relatório e para os cálculos de ritmo desta máquina.
                    </>}
              </p>
              {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

              <div style={est.acoesModal}>
                <button
                  type="button"
                  style={est.botaoLinha}
                  onClick={() => { setErro(null); setConfirmandoLote(null); }}
                  disabled={ocupado === 'lote'}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  style={est.botaoImprimir}
                  onClick={() => alternarArquivoDaMaquina(confirmandoLote)}
                  disabled={ocupado === 'lote'}
                >
                  {ocupado === 'lote'
                    ? 'Gravando...'
                    : (confirmandoLote.arquivada
                      ? `Arquivar ${confirmandoLote.ids.length}`
                      : `Restaurar ${confirmandoLote.ids.length}`)}
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmando && (
          <div style={est.modal} role="dialog" aria-label="Excluir medição">
            <div style={est.caixaModal}>
              <h2 style={est.tituloModal}>Excluir medição?</h2>
              <p style={est.textoModal}>
                <strong>{[confirmando.maquina, confirmando.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
                {faixaHoraria(confirmando) ? ` · ${faixaHoraria(confirmando)}` : ''}
                {' · '}{confirmando.pecas} pç
              </p>
              <p style={est.textoModal}>
                A exclusão é <strong>definitiva</strong>. Se a medição é real mas atípica
                (setup no meio do período, por exemplo), prefira <strong>Arquivar</strong>:
                ela sai dos cálculos e continua guardada.
              </p>
              {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

              <div style={est.acoesModal}>
                <button type="button" style={est.botaoSecundario} onClick={() => { setErro(null); setConfirmando(null); }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{ ...est.botaoPerigo, flex: 1 }}
                  onClick={() => excluir(confirmando)}
                  disabled={ocupado === confirmando.id}
                >
                  {ocupado === confirmando.id ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {estado === 'pronto' && linhas.length > 0 && (
        <ImpressaoConferencias
          linhas={visiveis}
          resumo={resumoVisivel}
          resumoPecas={resumoPecasVisivel}
          grupoDe={grupoDe}
          filtro={filtro}
          analise={analiseNoPapel ? analise : null}
          entreMaquinas={entreMaquinas}
          porCiclo={porCiclo}
        />
      )}
    </div>
  );
}

/**
 * CORRIGIR O NOME DA PECA de uma medicao — no PC.
 *
 * O nome nao vem de cadastro: e' digitado no aparelho, medicao a medicao,
 * por quem esta' no corredor. O mesmo produto chega escrito de tres jeitos
 * conforme o dia e a pessoa, e o Ritmo por peca — que agrupa por esse texto
 * — passa a mostrar tres pecas com um terco das medicoes cada. Nenhuma das
 * tres descreve a peca de verdade.
 *
 * Por isso a janela renomeia AS OUTRAS junto, por padrao: corrigir so' a
 * linha aberta deixaria as demais com a grafia velha e o Ritmo por peca
 * continuaria partido. Quem quiser corrigir uma medicao so' (a peca ali era
 * mesmo outra) desmarca a caixa.
 *
 * A correcao alcanca a lista que esta' carregada — ativas ou arquivadas,
 * conforme a face aberta. E' o que a janela diz, com o numero na frente.
 */
function RenomearPeca({ conferencia, linhas, erro, ocupado, aoFechar, aoGravar }) {
  const nomeAtual = String(conferencia.peca || '').trim();
  const [nome, setNome] = useState(nomeAtual);
  const [tambemAsOutras, setTambemAsOutras] = useState(true);

  /* As medicoes que carregam a MESMA grafia — a mesma chave normalizada do
     agrupamento, entao o que a janela promete corrigir e' exatamente o que
     estava junto no Ritmo por peca. Medicao SEM nome nao arrasta ninguem:
     "sem nome" nao e' uma grafia, e' a ausencia de uma. */
  const irmas = useMemo(() => (nomeAtual
    ? linhas.filter((c) => nomeChave(c.peca) === nomeChave(nomeAtual)).map((c) => c.id)
    : [conferencia.id]),
  [linhas, nomeAtual, conferencia.id]);

  /* Os nomes que JA' existem no relatorio, para escolher em vez de
     redigitar: e' redigitando que nasce a terceira grafia. */
  const nomesConhecidos = useMemo(() => {
    const vistos = new Map();
    for (const c of linhas) {
      const n = String(c.peca || '').trim();
      if (n && !vistos.has(nomeChave(n))) vistos.set(nomeChave(n), n);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);

  const limpo = nome.trim();
  // Nome VAZIO nao renomeia: apagar nao e' corrigir. Sem esta trava, limpar
  // o campo e clicar apagava o nome de ate 500 medicoes de uma vez, sem
  // volta — a grafia antiga nao fica guardada em lugar nenhum.
  const mudou = Boolean(limpo) && limpo !== nomeAtual;
  const emLote = tambemAsOutras && irmas.length > 1;
  const outras = irmas.length - 1;

  return (
    <div style={est.modal} role="dialog" aria-label="Nome da peça">
      <div style={est.caixaModal}>
        <h2 style={est.tituloModal}>Nome da peça</h2>
        <p style={est.textoModal}>
          {[conferencia.maquina, faixaHoraria(conferencia)].filter(Boolean).join(' · ') || 'Medição'}
          {' · '}{conferencia.pecas} pç
        </p>

        <label style={est.rotuloCampo} htmlFor="nome-da-peca">Peça</label>
        <input
          id="nome-da-peca"
          style={est.inputNome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          autoFocus
          list="pecas-ja-medidas"
          placeholder="Ex.: Sleep base 380x330x15"
          aria-label="Nome da peça"
        />
        {/* A lista das pecas ja' medidas: escolher a grafia que existe e'
            o que junta as medicoes. Redigitar e' de onde vem a divergencia
            — e o teclado do PC nao corrige nome de peca. */}
        <datalist id="pecas-ja-medidas">
          {nomesConhecidos.map((n) => <option key={n} value={n} />)}
        </datalist>

        {/* DE -> PARA, escrito: renomear em lote reescreve dado historico e
            nao tem volta. Ver as duas grafias lado a lado antes de clicar e'
            o que separa juntar a peca de inventar uma referencia que nunca
            existiu. */}
        {mudou && (
          <p style={est.textoModal}>
            {emLote
              ? <>As <strong>{irmas.length} medições</strong> que hoje se chamam «{nomeAtual}» passam
                a se chamar <strong>«{limpo}»</strong>.</>
              : <>Esta medição passa de «{nomeAtual || 'sem nome'}» para <strong>«{limpo}»</strong>.</>}
            {' '}Não há como desfazer.
          </p>
        )}

        {irmas.length > 1 && (
          <label style={est.rotuloPapel}>
            <input
              type="checkbox"
              style={est.caixaPapel}
              checked={tambemAsOutras}
              onChange={() => setTambemAsOutras((v) => !v)}
              aria-label="Corrigir também as outras medições com este nome"
            />
            <span>
              {outras === 1
                ? 'Corrigir também a outra medição com este mesmo nome'
                : `Corrigir também as outras ${outras} medições com este mesmo nome`}
              {' '}— é o que junta a peça numa linha só no Ritmo por peça.
            </span>
          </label>
        )}
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoLinha} onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            style={est.botaoImprimir}
            onClick={() => aoGravar({ nome: limpo, tambemAsOutras, irmas })}
            disabled={ocupado || !mudou}
          >
            {ocupado
              ? 'Gravando...'
              : (emLote ? `Renomear as ${irmas.length} medições` : 'Renomear')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * CADASTRO DE PARADAS de uma medicao — no PC.
 *
 * Quem confere no corredor raramente para para digitar o setup; quem monta
 * o relatorio, sim. Aqui a parada e' reconstituida depois, com o
 * apontamento na mao: motivo, minutos e uma observacao livre.
 *
 * A lista e' gravada INTEIRA (nao incremental): o que esta na tela vira o
 * estado final das paradas daquela medicao, entao corrigir um numero e
 * apagar uma linha usam o mesmo caminho e o mesmo botao.
 *
 * A soma nao pode alcancar o periodo: sem tempo de maquina rodando nao ha
 * ritmo, e a medicao sairia dos calculos sem dizer por que. O aviso
 * aparece antes de gravar — o servidor recusa igual, mas errar no botao e'
 * pior que errar antes dele.
 */
function EditorParadas({ conferencia, erro, ocupado, aoFechar, aoGravar }) {
  const motivos = useMotivosParada();
  const duracaoMs = Number(conferencia.duracao_ms) || 0;
  const [linhas, setLinhas] = useState(() => (conferencia.paradas || []).map((p, i) => ({
    chave: `p${i}`,
    motivo: p.motivo || 'outro',
    minutos: String(+((Number(p.duracaoMs ?? p.duracao_ms) || 0) / 60000).toFixed(2)),
    observacao: p.observacao || '',
  })));
  const [proxima, setProxima] = useState(0);

  const limpas = linhas
    .map((l) => ({
      motivo: l.motivo,
      duracaoMs: Math.round(numeroDecimal(l.minutos) * 60000),
      observacao: l.observacao.trim() || null,
    }))
    .filter((l) => l.duracaoMs > 0);

  const somaMs = limpas.reduce((acc, l) => acc + l.duracaoMs, 0);
  const excede = somaMs >= duracaoMs;
  const produtivoMs = Math.max(0, duracaoMs - somaMs);

  const adicionar = (motivo) => {
    setLinhas((l) => [...l, { chave: `n${proxima}`, motivo, minutos: '', observacao: '' }]);
    setProxima((n) => n + 1);
  };
  const alterar = (chave, campo, valor) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: valor } : x)));
  const remover = (chave) => setLinhas((l) => l.filter((x) => x.chave !== chave));

  return (
    <div style={est.modal} role="dialog" aria-label="Paradas da medição">
      <div style={{ ...est.caixaModal, maxWidth: 620 }}>
        <h2 style={est.tituloModal}>Paradas do período</h2>
        <p style={est.textoModal}>
          <strong>{[conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
          {faixaHoraria(conferencia) ? ` · ${faixaHoraria(conferencia)}` : ''}
          {' · '}{formatarDuracao(duracaoMs)} · {conferencia.pecas} pç
        </p>
        <p style={est.textoModal}>
          Marque quanto tempo a máquina ficou parada dentro deste período. O ritmo
          passa a ser calculado sobre o tempo em que ela <strong>rodou</strong> — e a
          medição continua contando, em vez de ser arquivada.
        </p>

        <div style={est.linhaBotoesParada}>
          <button
            type="button" style={est.botaoSetup}
            onClick={() => adicionar(codigoPreferido(motivos, 'setup'))}
          >
            + Setup / troca
          </button>
          <button
            type="button" style={est.botaoSecundario}
            onClick={() => adicionar(codigoPreferido(motivos, 'falta_material'))}
          >
            + Outra parada
          </button>
        </div>

        {linhas.length === 0 ? (
          <p style={est.textoModal}>
            Nenhuma parada marcada — o período inteiro conta como máquina rodando.
          </p>
        ) : (
          <div style={est.listaParadas}>
            {linhas.map((l) => (
              <div key={l.chave} style={est.linhaParada}>
                <select
                  value={l.motivo}
                  onChange={(ev) => alterar(l.chave, 'motivo', ev.target.value)}
                  style={est.selectMotivo}
                  aria-label="Motivo da parada"
                >
                  {motivos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>
                  ))}
                </select>
                {/* TEXTO, nao `type="number"`: o teclado numerico brasileiro
                    manda VIRGULA e o campo numerico a descarta em silencio —
                    "1,25" virava 125. Mesma correcao do celular. */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={l.minutos}
                  onChange={(ev) => alterar(l.chave, 'minutos', textoDecimal(ev.target.value))}
                  style={est.inputMinutos}
                  aria-label={`Minutos parada — ${rotuloMotivo(l.motivo)}`}
                />
                <span style={est.sufixoMinutos}>min</span>
                <input
                  type="text"
                  placeholder="Observação (opcional)"
                  value={l.observacao}
                  onChange={(ev) => alterar(l.chave, 'observacao', ev.target.value)}
                  style={est.inputObs}
                  aria-label="Observação da parada"
                />
                <button
                  type="button"
                  style={est.botaoExcluir}
                  onClick={() => remover(l.chave)}
                  aria-label={`Remover parada ${rotuloMotivo(l.motivo)}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={est.textoModal}>
          Período {formatarDuracao(duracaoMs)} · parado {somaMs > 0 ? formatarDuracao(somaMs) : '—'}
          {' · '}máquina rodando {produtivoMs > 0 ? formatarDuracao(produtivoMs) : '—'}
        </p>

        {excede && (
          <div style={est.faixaErro} role="alert">
            As paradas somam o período inteiro — não sobraria tempo de máquina rodando.
          </div>
        )}
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...est.botaoImprimir, flex: 1 }}
            onClick={() => aoGravar(limpas)}
            disabled={ocupado || excede}
          >
            {ocupado ? 'Gravando...' : 'Gravar paradas'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ANALISE DO PERIODO — o algoritmo primeiro, a IA como opcao.
 *
 * Ate' 31/08 a leitura dos numeros so' existia via IA: cada clique gastava
 * a chave do usuario para dizer o que os proprios numeros ja' diziam. A
 * analise agora e' GERADA POR REGRA (analisarConferencias, no dominio):
 * aparece na hora, de graca, offline — e identica para os mesmos numeros.
 *
 * A IA continua como botao OPCIONAL, discreto, para quem quer uma segunda
 * leitura em texto corrido: sobe o mesmo resumo por maquina de sempre
 * (incluindo `confiavel` e os motivos). Ambas seguem o filtro da lateral.
 */
function AnalisePeriodo({ secoes, resumo, noPapel, aoAlternarPapel }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);

  async function analisar() {
    setRodando(true);
    setErro(null);
    try {
      setResposta(await analisarConferenciasComIa({
        maquinas: resumo.map((g) => ({
          maquina: g.maquina,
          n: g.n,
          pecas: g.totalPecas,
          minutos: +(g.totalMs / 60000).toFixed(1),
          minutosProdutivos: +(g.totalProdutivoMs / 60000).toFixed(1),
          minutosParados: +(g.totalParadaMs / 60000).toFixed(1),
          minutosSetup: +(g.totalSetupMs / 60000).toFixed(1),
          disponibilidadePct: +g.disponibilidadePct.toFixed(1),
          paradas: g.paradasPorMotivo.map((m) => ({ motivo: m.rotulo, minutos: +(m.ms / 60000).toFixed(1) })),
          ritmo: +g.ritmoMedio.toFixed(1),
          cicloSeg: +(g.cicloMedioMs / 1000).toFixed(2),
          acionamentos: g.totalAcionamentos,
          cicloMotorSeg: +(g.cicloMotorMs / 1000).toFixed(2),
          cvPct: g.cvPct != null ? +g.cvPct.toFixed(1) : null,
          melhor: g.melhor ? +g.melhor.ritmo.toFixed(1) : null,
          pior: g.pior ? +g.pior.ritmo.toFixed(1) : null,
          confiavel: g.confiavel,
          motivos: g.motivos,
        })),
      }));
    } catch (e) { setErro(e.message); }
    setRodando(false);
  }

  return (
    <section style={est.painelIa} aria-label="Análise do período">
      <div style={est.analiseTopo}>
        <div style={{ minWidth: 0 }}>
          <h2 style={est.iaTitulo}>Análise do período</h2>
          <p style={est.iaTexto}>
            Gerada na hora pelos números deste relatório — sem IA, sem custo, funciona sem internet.
          </p>
        </div>
        {/* A opcao mora ONDE a analise mora: quem le e quer levar para a
            reuniao marca aqui, e a folha A4 passa a sair com a analise.
            A escolha fica gravada no navegador. */}
        <label style={est.rotuloPapel}>
          <input
            type="checkbox"
            checked={noPapel}
            onChange={aoAlternarPapel}
            style={est.caixaPapel}
          />
          Sair na impressão
        </label>
      </div>

      {secoes.map((s) => (
        <div key={s.titulo} style={est.analiseSecao}>
          <h3 style={est.analiseTitulo}>{s.titulo}</h3>
          {s.linhas.map((l) => (
            <p key={l} style={est.analiseLinha}>{l}</p>
          ))}
        </div>
      ))}

      {/* A IA vira opcao, atras de um botao discreto: quem quiser uma
          segunda leitura em texto corrido paga o token; ninguem mais
          precisa da chave para ter analise. */}
      <div style={est.iaOpcional}>
        <span style={est.iaTexto}>
          Quer uma segunda leitura, em texto corrido? Opcional — usa a chave da IA.
        </span>
        <button type="button" style={est.botaoSecundario} onClick={analisar} disabled={rodando}>
          {rodando ? 'Analisando...' : 'Analisar com IA'}
        </button>
      </div>

      {erro && <div style={est.iaErro}>{erro}</div>}

      {resposta && (
        <div style={est.iaResposta}>
          <div style={est.iaRespostaTexto}>{resposta.analise}</div>
          <div style={est.iaMeta}>
            Gerada por {resposta.modelo}
            {resposta.uso?.saida ? ` · ${resposta.uso.saida} tokens` : ''} — confira antes de
            decidir: a IA lê os números, não o posto.
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * FOLHA DO RITMO POR MAQUINA — A4 retrato, modelo basico.
 *
 * Nao e' a tela no papel — a tela tem filtro, botao e cor de interface; o
 * papel tem contexto e responsavel. Recebe os dados JA' FILTRADOS pela
 * lateral: com uma maquina escolhida, sai a folha daquela maquina, com o
 * nome dela no titulo e na identificacao.
 *
 * Sem jargao (decisao de 31/08): nada de CV%, ciclo do motor ou criterio
 * de amostra carimbado. Os numeros sao pecas/hora e pecas/minuto; maquina
 * medida ha' pouco tempo leva uma NOTA em texto corrido, nao um selo.
 */
function ImpressaoConferencias({ linhas, resumo, resumoPecas, grupoDe, filtro, analise, entreMaquinas, porCiclo }) {
  // Grupos cobertos pelo periodo, na ordem dos codigos — vao na identificacao.
  const gruposCobertos = [...new Set(resumo.map((g) => grupoDe?.(g.maquina)).filter(Boolean))].sort();
  const hoje = new Date().toLocaleDateString('pt-BR');
  const emMedicao = resumo.filter((g) => !g.confiavel);

  const datas = linhas.map((c) => new Date(c.salvo_em)).filter((d) => !Number.isNaN(d.getTime()));
  const periodo = datas.length
    ? `${new Date(Math.min(...datas)).toLocaleDateString('pt-BR')} a ${new Date(Math.max(...datas)).toLocaleDateString('pt-BR')}`
    : '—';
  const totalPecas = resumo.reduce((acc, g) => acc + g.totalPecas, 0);
  const totalMs = resumo.reduce((acc, g) => acc + g.totalMs, 0);
  const totalProdutivoMs = resumo.reduce((acc, g) => acc + g.totalProdutivoMs, 0);
  const totalParadaMs = resumo.reduce((acc, g) => acc + g.totalParadaMs, 0);
  const totalSetupMs = resumo.reduce((acc, g) => acc + g.totalSetupMs, 0);
  const ritmoGeral = totalProdutivoMs > 0 ? (totalPecas * 3600000) / totalProdutivoMs : null;
  // O mesmo comparativo da tela — o papel e' o que vai para a reuniao, e e'
  // la' que a pergunta "quanto isso custou?" e' feita.
  const comparativo = comparativoDeParadas(resumo);
  // A curva do dia no papel e' TABELA, nao grafico: a folha nao tem nenhuma
  // outra imagem, e a hora com o numero ao lado le-se melhor impressa.
  // So' com UMA maquina, pelo mesmo motivo da tela: misturando postos, a
  // hora fraca seria a hora da maquina mais lenta, nao uma hora fraca.
  const curvaDoDia = resumo.length === 1 ? ritmoPorHoraDoDia(linhas) : [];

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Ritmo por Máquina{filtro ? ` — ${filtro}` : ''}</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          filtro ? ['Máquina', filtro] : ['Máquinas', String(resumo.length)],
          ['Grupos de máquina', gruposCobertos.length ? gruposCobertos.join(' · ') : '—'],
          ['Período coberto', periodo],
          ['Medições', String(linhas.length)],
          ['Total de peças', String(totalPecas)],
          ['Tempo rodando', formatarDuracao(totalProdutivoMs)],
          ['Tempo parado', totalParadaMs > 0
            ? `${formatarDuracao(totalParadaMs)}${totalSetupMs > 0 ? ` (troca/setup ${formatarDuracao(totalSetupMs)})` : ''}`
            : 'Nenhuma parada marcada'],
          ['Máquina rodando', totalMs > 0
            ? `${Math.round((totalProdutivoMs / totalMs) * 100)}% do período observado`
            : '—'],
          ['Ritmo médio', ritmoGeral != null
            ? `${Math.round(ritmoGeral)} pç/h · ${porMinuto(ritmoGeral)} pç/min`
            : '—'],
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={imp.campoRotulo}>{k}</span>
            <span style={imp.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {comparativo && (
        <section style={imp.comparativo}>
          <h2 style={imp.tituloSecao}>O que a parada custou</h2>
          <div style={imp.comparativoGrade}>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Saiu no período</span>
              <span style={imp.comparativoValor}>{comparativo.pecas} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ritmoPeriodo)} pç/h · {porMinuto(comparativo.ritmoPeriodo)} pç/min
              </span>
            </div>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Teria saído no mesmo tempo</span>
              <span style={imp.comparativoValor}>{comparativo.potencial} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ritmoPotencial)} pç/h · {porMinuto(comparativo.ritmoPotencial)} pç/min
              </span>
            </div>
            <div style={imp.comparativoCaixaDestaque}>
              <span style={imp.comparativoRotulo}>Deixou de sair</span>
              <span style={imp.comparativoValor}>{comparativo.perdidas} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ganhoPct)}% a mais no mesmo tempo
              </span>
            </div>
          </div>
          <p style={imp.comparativoNota}>
            Período observado de {formatarDuracao(comparativo.duracaoMs)}, com
            {' '}{formatarDuracao(comparativo.paradaMs)} de máquina parada. O potencial é calculado
            MÁQUINA POR MÁQUINA e somado — cada uma no ritmo que ela própria fez com ela rodando,
            aplicado ao período dela. Não é meta nem capacidade de catálogo.
          </p>
        </section>
      )}

      <h2 style={imp.tituloSecao}>Ritmo por máquina</h2>
      <table style={imp.tabela}>
        <thead>
          <tr>
            <th style={imp.th}>Máquina</th>
            <th style={imp.th}>Grupo</th>
            <th style={imp.thNum}>Medições</th>
            <th style={imp.thNum}>Peças</th>
            <th style={imp.thNum}>Tempo rodando</th>
            <th style={imp.thNum}>Parado</th>
            <th style={imp.thNum}>Rodando %</th>
            <th style={imp.thNum}>Peças/hora</th>
            <th style={imp.thNum}>Peças/min</th>
          </tr>
        </thead>
        <tbody>
          {resumo.map((g) => (
            <tr key={g.maquina}>
              <td style={imp.td}>{g.maquina}</td>
              <td style={imp.td}>{grupoDe?.(g.maquina) || '—'}</td>
              <td style={imp.tdNum}>{g.n}</td>
              <td style={imp.tdNum}>{g.totalPecas}</td>
              <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
              <td style={imp.tdNum}>{g.totalParadaMs > 0 ? formatarDuracao(g.totalParadaMs) : '—'}</td>
              <td style={imp.tdNum}>{Math.round(g.disponibilidadePct)}%</td>
              <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
              <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Nota em texto corrido, nao carimbo: o numero ja' saiu na tabela. */}
      {emMedicao.length > 0 && (
        <p style={{ ...imp.nota, margin: '6px 0 0' }}>
          Ainda em medição: {emMedicao.map((g) => g.maquina).join(', ')} — o ritmo
          {emMedicao.length > 1 ? ' dessas máquinas' : ' desta máquina'} fica mais
          certeiro com mais medições.
        </p>
      )}

      {/* QUAL MAQUINA ESTA' MELHOR, no papel.
          E' a pergunta que a reuniao faz diante da folha, e a folha precisa
          responder sozinha — inclusive a RECUSA, quando o mix de pecas nao
          deixa comparar. As frases sao as mesmas da tela (lerGrupo, no
          dominio): papel e tela dizendo coisas diferentes sobre os mesmos
          numeros e' o comeco de uma discussao inutil na reuniao. */}
      {entreMaquinas?.grupos.length > 0 && (
        <section style={imp.entreMaquinas}>
          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Comparativo entre máquinas</h2>
          <p style={{ ...imp.nota, margin: '0 0 6px' }}>
            Comparação feita DENTRO DE CADA GRUPO do cadastro — máquinas que fazem a mesma
            coisa. Postos de grupos diferentes não disputam peças/hora.
          </p>

          {entreMaquinas.grupos.map((g) => (
            <div key={g.grupo} style={imp.grupoBloco}>
              <div style={imp.grupoNome}>{g.grupo}</div>
              {lerGrupo(g).map((frase) => (
                <p key={frase} style={imp.analiseLinha}>{frase}</p>
              ))}
              <table style={{ ...imp.tabela, marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={imp.th}>Máquina</th>
                    <th style={imp.thNum}>Medições</th>
                    <th style={imp.thNum}>Peças/hora</th>
                    <th style={imp.thNum}>vs. líder</th>
                    {g.temCiclos && <th style={imp.thNum}>Ciclos/hora</th>}
                    <th style={imp.thNum}>Rodando %</th>
                    <th style={imp.th}>Constância</th>
                    <th style={imp.thNum}>Do próprio melhor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.maquina}>
                      <td style={imp.td}>
                        {l.maquina}
                        {!l.confiavel && ' (ainda em medição)'}
                      </td>
                      <td style={imp.tdNum}>{l.n}</td>
                      <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(l.ritmoMedio)}</td>
                      {/* Mesmo motivo da tela: grupo incomparavel nao
                          imprime indice — o numero desmentiria a ressalva. */}
                      <td style={imp.tdNum}>
                        {g.comparavel && l.indicePct != null ? `${Math.round(l.indicePct)}%` : '—'}
                      </td>
                      {g.temCiclos && (
                        <td style={imp.tdNum}>{l.ciclosPorHora != null ? Math.round(l.ciclosPorHora) : '—'}</td>
                      )}
                      <td style={imp.tdNum}>{Math.round(l.disponibilidadePct)}%</td>
                      <td style={imp.td}>{constanciaTexto(l.cvPct) || '—'}</td>
                      <td style={imp.tdNum}>
                        {l.aproveitamentoPct != null ? `${Math.round(l.aproveitamentoPct)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* O que medir para destravar — a folha e' o que vai para a
                  mao de quem mede. Sem esta linha, o papel dizia "nao da'
                  para comparar" e nao dizia o caminho: quem le' fica sabendo
                  do problema e nao da solucao. */}
              {!g.comparavel && (
                <p style={{ ...imp.nota, margin: '4px 0 0' }}>
                  Uma medição da mesma peça em cada máquina deste grupo já destrava a comparação
                  direta — é a medição de maior retorno para o relatório agora.
                </p>
              )}

              {g.duelos.length > 0 && (
                <p style={{ ...imp.nota, margin: '5px 0 0' }}>
                  <strong>Mesma peça nas duas</strong> (comparação sem ressalva):{' '}
                  {g.duelos.map((d) => (
                    `${d.peca} — ${d.linhas.map((l) => `${l.maquina} ${Math.round(l.ritmoMedio)} pç/h`).join(' x ')}`
                    + `${d.empate ? ' (praticamente igual)' : ` (${d.lider.maquina} ${Math.round(d.difPct)}% mais rápido)`}`
                  )).join(' · ')}
                </p>
              )}
            </div>
          ))}

          {entreMaquinas.semPar.length > 0 && (
            <p style={{ ...imp.nota, margin: '5px 0 0' }}>
              Fora do comparativo:{' '}
              {entreMaquinas.semPar.map((s) => `${s.maquina} (única medida em ${s.grupo})`).join(', ')}
              {' — '}comparação só existe com outra máquina do mesmo grupo.
            </p>
          )}
        </section>
      )}

      {/* A ANALISE no papel e' OPCAO, marcada na tela ("Sair na impressão"):
          o papel circula em reuniao, e a leitura pronta poupa quem le — mas
          quem quer so' os numeros imprime como sempre. A nota diz que ela e'
          automatica: leitura de regra, para conferir, nao parecer de gente. */}
      {analise?.length > 0 && (
        <>
          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Análise do período</h2>
          <p style={{ ...imp.nota, margin: '0 0 6px' }}>
            Gerada automaticamente pelos números deste relatório — confira antes de decidir.
          </p>
          {analise.map((s) => (
            <div key={s.titulo} style={imp.analiseBloco}>
              <div style={imp.analiseTitulo}>{s.titulo}</div>
              {s.linhas.map((l) => (
                <p key={l} style={imp.analiseLinha}>{l}</p>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Ritmo por peca: o numero que o PCP leva para dimensionar carga e lote. */}
      {resumoPecas?.length > 0 && (
        <>
          {curvaDoDia.length >= 2 && (
            <>
              <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por hora do dia</h2>
              <table style={imp.tabela}>
                <thead>
                  <tr>
                    <th style={imp.th}>Hora</th>
                    <th style={imp.thNum}>Medições</th>
                    <th style={imp.thNum}>Peças</th>
                    <th style={imp.thNum}>Tempo rodando</th>
                    <th style={imp.thNum}>Peças/hora</th>
                    <th style={imp.thNum}>Peças/min</th>
                  </tr>
                </thead>
                <tbody>
                  {curvaDoDia.map((h) => (
                    <tr key={h.chave}>
                      <td style={imp.td}>{h.rotulo}</td>
                      <td style={imp.tdNum}>{h.n}</td>
                      <td style={imp.tdNum}>{h.pecas}</td>
                      <td style={imp.tdNum}>{formatarDuracao(h.produtivoMs)}</td>
                      <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(h.ritmoMedio)}</td>
                      <td style={imp.tdNum}>{porMinuto(h.ritmoMedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={imp.nota}>
                Cada medição entra na hora em que começou, e as medições da mesma hora somam
                entre si, mesmo de datas diferentes — é a curva do turno.
              </p>
            </>
          )}

          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por peça</h2>
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Peça</th>
                <th style={imp.th}>Máquina</th>
                <th style={imp.thNum}>Acion.</th>
                <th style={imp.thNum}>Medições</th>
                <th style={imp.thNum}>Peças</th>
                <th style={imp.thNum}>Tempo rodando</th>
                <th style={imp.thNum}>Peças/hora</th>
                <th style={imp.thNum}>Peças/min</th>
                <th style={imp.thNum}>Por acion.</th>
              </tr>
            </thead>
            <tbody>
              {resumoPecas.map((g) => (
                <tr key={`${g.maquina}·${g.peca}`}>
                  <td style={imp.td}>{g.peca}</td>
                  <td style={imp.td}>{g.maquina}</td>
                  <td style={imp.tdNum}>{g.ciclosMistos ? g.ciclosVistos.join('/') : g.ciclosPorPeca}</td>
                  <td style={imp.tdNum}>{g.n}</td>
                  <td style={imp.tdNum}>{g.totalPecas}</td>
                  <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{(g.cicloMotorMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={imp.nota}>
            ACION.: quantas vezes o motor é acionado para fazer uma peça. Peça de mais
            acionamentos rende menos peças/hora sem a máquina estar mais lenta — POR ACION. é o
            número comparável entre peças de furação diferente.
          </p>

          {/* A REGUA DO CICLO no papel: pecas de mesmo acionamento deveriam
              sair na mesma faixa, e quem foge dela aponta para o manuseio.
              As frases sao as mesmas da tela (lerClasse, no dominio). */}
          {porCiclo?.classes.some((c) => c.temFaixa) && (
            <>
              <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por acionamento do motor</h2>
              {porCiclo.classes.filter((c) => c.temFaixa).map((c) => (
                <div key={`${c.maquina}-${c.ciclos}`} style={imp.grupoBloco}>
                  <div style={imp.grupoNome}>
                    {c.maquina} · {c.ciclos === 1 ? '1 acionamento' : `${c.ciclos} acionamentos`} por peça
                  </div>
                  {lerClasse(c).map((frase) => (
                    <p key={frase} style={imp.analiseLinha}>{frase}</p>
                  ))}
                </div>
              ))}
              <p style={imp.nota}>
                Peça fora da faixa da própria classe não é peça errada: o tempo de uma peça é
                MANUSEIO mais FURAÇÃO, e só a furação depende do acionamento. Peça grande demora
                mais para posicionar sem a máquina ter culpa — é aí que se procura primeiro.
              </p>
            </>
          )}

          {porCiclo?.mistas.length > 0 && (
            <p style={imp.nota}>
              Fora da leitura por acionamento:{' '}
              {porCiclo.mistas.map((m) => `${m.peca} na ${m.maquina} (gravada com ${m.ciclosVistos.join(' e ')})`).join(', ')}
              {' — '}o mesmo produto não pode pedir dois números de acionamento; corrija na medição.
            </p>
          )}
        </>
      )}

      <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Medições registradas ({linhas.length})</h2>
      <table style={imp.tabela}>
        <thead>
          <tr>
            <th style={imp.th}>Data</th>
            <th style={imp.th}>Máquina</th>
            <th style={imp.th}>Peça</th>
            <th style={imp.th}>Horários</th>
            <th style={imp.thNum}>Período</th>
            <th style={imp.thNum}>Parado</th>
            <th style={imp.thNum}>Peças</th>
            <th style={imp.thNum}>Peças/hora</th>
            <th style={imp.thNum}>Peças/min</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const calc = conferenciaRapida({
              duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
              ciclosPorPeca: c.ciclos_por_peca,
            });
            const par = somarParadas(c.paradas);
            return (
              <tr key={c.id}>
                <td style={imp.td}>{formatarDataHora(c.salvo_em)}</td>
                <td style={imp.td}>{c.maquina || '—'}</td>
                <td style={imp.td}>{c.peca || '—'}</td>
                <td style={imp.td}>{faixaHoraria(c) || '—'}</td>
                <td style={imp.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={imp.tdNum}>{par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}</td>
                <td style={imp.tdNum}>{c.pecas}</td>
                <td style={{ ...imp.tdNum, fontWeight: 700 }}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                <td style={imp.tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legenda em PALAVRAS: o documento circula em reuniao e nao pode
          depender de quem escreveu para ser entendido. */}
      <section style={imp.legenda}>
        <strong>Como ler este relatório</strong>
        <div style={imp.gradeLegenda}>
          {[
            ['Medição', 'um período observado no posto: hora inicial, hora final e as peças produzidas.'],
            ['Período', 'tempo entre a hora inicial e a hora final.'],
            ['Parado', 'tempo em que a máquina não produziu dentro do período: troca/setup, falta de material, manutenção.'],
            ['Peças/hora', 'quantas peças saem em uma hora com a máquina rodando.'],
            ['Peças/min', 'o mesmo ritmo, em peças por minuto.'],
            ['Ritmo médio', 'total de peças dividido pelo tempo total com a máquina rodando.'],
            ['Máquina rodando', 'quanto do período observado a máquina passou produzindo. '
              + 'É a DISPONIBILIDADE do período — 100% menos o tempo parado.'],
            ['Deixou de sair', 'peças que teriam saído no MESMO período se a máquina não tivesse '
              + 'parado, ao ritmo que ela própria fez rodando. Não é meta nem capacidade de catálogo.'],
            ['Grupo', 'grupo do cadastro de máquinas, com o código da fábrica (ex: 0002 · FURADEIRA).'],
            ['Ainda em medição', 'máquina medida poucas vezes ou por pouco tempo — o número pode mudar com mais medições.'],
          ].map(([sigla, texto]) => (
            <div key={sigla} style={imp.itemLegenda}>
              <strong style={{ whiteSpace: 'nowrap' }}>{sigla}:</strong>
              <span>{texto}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={imp.assinaturas}>
        {['Analista responsável', 'Coordenador PPCP'].map((papel) => (
          <div key={papel} style={imp.assinatura}>
            <div style={imp.linhaAssinatura} />
            <span style={imp.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const formatarDataHora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ estilos */

const t = claro;

const est = {
  tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
  telaComLateral: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start' },
  conteudoLateral: {
    // Sem max-width: em monitor largo o relatorio ocupa a tela toda em vez
    // de deixar uma faixa vazia a direita (apontado em 28/08).
    flex: 1, minWidth: 0,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },

  /* ---- comparativo: o que saiu x o que teria saido no mesmo tempo ---- */
  comparativo: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  comparativoTopo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  comparativoTitulo: { ...tipo('corpoF'), margin: 0 },
  comparativoDica: { ...tipo('legenda'), color: t.textoMedio, margin: 0, maxWidth: 760 },
  comparativoGrade: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: espaco.lg, alignItems: 'stretch',
  },
  comparativoCaixa: {
    background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // O que deixou de sair e' o numero que muda a conversa: fundo, borda e
  // corpo proprios. Cor nao carrega a informacao sozinha — o rotulo diz.
  comparativoCaixaDestaque: {
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.critico,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // textoFraco sobre o fundo cinza da caixa dava 4.34:1 (piso 4.5) e o
  // rotulo do destaque, 4.22:1 — o texto mais fraco era justamente o que
  // nomeia o numero mais importante. Medido em 31/08.
  comparativoRotulo: { ...rotulo(t.textoMedio) },
  comparativoRotuloDestaque: { ...rotulo(t.texto) },
  comparativoValor: { ...tipo('display'), ...numeros, lineHeight: 1.1 },
  comparativoValorDestaque: { ...tipo('display'), ...numeros, lineHeight: 1.1, color: t.critico },
  comparativoUnidade: { ...tipo('corpo'), color: t.textoMedio, marginLeft: espaco.sm },
  comparativoSub: { ...tipo('legenda'), ...numeros, color: t.textoMedio },
  comparativoSubDestaque: { ...tipo('legenda'), ...numeros, color: t.texto },
  comparativoNota: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },

  /* ---- faixa de numeros do topo ---- */
  kpis: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))',
    gap: espaco.md, marginBottom: espaco.xl,
  },
  kpi: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  kpiRotulo: { ...rotulo(t.textoFraco) },
  kpiValor: { ...tipo('display'), ...numeros, lineHeight: 1.15, marginTop: 2 },
  kpiSub: { ...tipo('legenda'), color: t.textoMedio, marginTop: 2 },

  /* ---- paradas (pareto) ---- */
  duasColunas: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  painelMiolo: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, padding: espaco.xl,
  },
  paretoLinha: {
    display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto',
    gap: espaco.md, alignItems: 'center', ...tipo('corpo'), ...numeros,
  },
  paretoTrilha: { height: 10, background: '#EDF0F3', borderRadius: raio.pill, overflow: 'hidden' },
  paretoBarra: { display: 'block', height: '100%', borderRadius: raio.pill, background: '#D97706' },

  resumoGrade: {
    // auto-FIT, nao auto-fill: com uma maquina filtrada, o cartao ESTICA e
    // ocupa a tela em vez de deixar um buraco a direita (apontado em 28/08).
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  cartaoMaquina: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.sm,
  },
  cartaoTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.md, flexWrap: 'wrap',
  },
  cartaoGrupo: {
    display: 'block', ...tipo('micro'), color: t.textoFraco,
    letterSpacing: 1, marginTop: 2,
  },
  cartaoTitulo: { ...tipo('corpoF') },
  cartaoRitmo: {
    ...tipo('display'), ...numeros,
    display: 'flex', alignItems: 'baseline', gap: espaco.sm,
  },
  cartaoRitmoSufixo: { ...tipo('legenda'), color: t.textoFraco },
  // Pedido de 31/08: o mesmo ritmo em pecas por MINUTO, logo abaixo do
  // numero grande — e' a escala em que o posto pensa (contador de pecas).
  cartaoRitmoMinuto: { ...tipo('corpoF'), ...numeros, color: t.textoMedio },
  cartaoLinhas: {
    display: 'flex', flexDirection: 'column', gap: 2,
    ...tipo('legenda'), ...numeros, color: t.textoMedio,
  },
  // Nota discreta, em cinza: informa sem carimbar o numero de "errado".
  notaPoucas: { ...tipo('legenda'), color: t.textoFraco, lineHeight: 1.5 },

  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  /* O botao que mexe em VARIAS linhas nao pode ser igual ao que mexe em uma:
     eram gemeos a 25 px de distancia no mesmo painel, so' a largura mudava.
     Borda mais forte e texto mais pesado — sem virar acao primaria, que na
     tela e' so' Imprimir. */
  botaoLote: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.sm,
    color: t.texto, ...tipo('legenda'), fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  botaoLinha: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoExcluir: {
    width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
    borderRadius: raio.sm, color: t.textoFraco, fontSize: 18, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  tdAcoes: {
    padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${t.borda}`,
  },

  painelGrafico: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
  },

  painelIa: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: t.textoFraco, margin: '2px 0 0' },
  /* ---- analise automatica (por regra, sem IA) ---- */
  analiseTopo: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
  },
  // Alvo de clique generoso: o rotulo inteiro alterna a caixa.
  rotuloPapel: {
    display: 'inline-flex', alignItems: 'center', gap: espaco.sm,
    minHeight: 32, ...tipo('legenda'), color: t.textoMedio,
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  },
  caixaPapel: { width: 16, height: 16, margin: 0, accentColor: t.vermelho, cursor: 'pointer' },
  analiseSecao: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  analiseTitulo: { ...rotulo(t.textoFraco), margin: 0 },
  analiseLinha: { ...tipo('corpo'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },
  // A opcao de IA fica depois da analise, separada por um fio: presente
  // para quem quiser, invisivel para quem nao precisa.
  iaOpcional: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    paddingTop: espaco.md, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
  iaErro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  iaResposta: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  iaRespostaTexto: { ...tipo('corpo'), color: t.texto, whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  iaMeta: { ...tipo('legenda'), color: t.textoFraco },

  faixaErro: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md, marginBottom: espaco.lg,
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    ...tipo('legenda'), color: t.texto,
  },
  /* Flutua sobre a pagina, presa a' JANELA e nao ao topo do documento: a
     recusa de um clique dado no fim da tabela precisa ser lida sem rolar
     dois metros para cima. */
  avisoFlutuante: {
    position: 'fixed', zIndex: 40,
    left: '50%', bottom: espaco.xl, transform: 'translateX(-50%)',
    width: 'max-content', maxWidth: 'min(760px, calc(100vw - 32px))',
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    boxShadow: elevacao.alta, ...tipo('corpo'), color: t.texto,
  },

  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg,
  },
  caixaModal: {
    width: '100%', maxWidth: 520, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  tituloModal: { ...tipo('titulo'), margin: 0 },
  rotuloCampo: { ...rotulo(t.textoFraco), marginBottom: -espaco.xs },
  inputNome: {
    minHeight: 40, padding: `0 ${espaco.md}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', width: '100%',
  },
  /* O nome da peca na tabela e' BOTAO, mas nao pode parecer um: e' o dado
     da linha. A pista de que da' para clicar e' o sublinhado pontilhado. */
  botaoNome: {
    padding: 0, background: 'transparent', border: 'none', textAlign: 'left',
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', cursor: 'pointer',
    textDecoration: 'underline', textDecorationStyle: 'dotted',
    textUnderlineOffset: 3, textDecorationColor: t.textoFraco,
  },
  textoModal: { ...tipo('corpo'), margin: 0, color: t.textoMedio },
  acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },

  /* ---- cadastro de paradas ---- */
  linhaBotoesParada: { display: 'flex', gap: espaco.sm, flexWrap: 'wrap' },
  // Setup com borda de atencao: e' a parada mais marcada e a unica que o
  // processo exige. Cor sozinha nao identifica nada aqui — o rotulo diz.
  botaoSetup: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  listaParadas: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    maxHeight: '38vh', overflowY: 'auto',
  },
  linhaParada: { display: 'flex', alignItems: 'center', gap: espaco.sm, minWidth: 0 },
  selectMotivo: {
    flex: '0 0 200px', minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },
  inputMinutos: {
    width: 72, flexShrink: 0, minHeight: 38, textAlign: 'right',
    padding: `0 ${espaco.sm}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpoF'), ...numeros, fontFamily: 'inherit',
  },
  sufixoMinutos: { flexShrink: 0, ...tipo('legenda'), color: t.textoFraco },
  inputObs: {
    flex: 1, minWidth: 0, minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },

  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, overflowX: 'auto', marginBottom: espaco.xl,
  },
  painelTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: `${espaco.lg}px ${espaco.lg}px ${espaco.md}px`,
  },
  // A nota encolhe; o botao fica na direita, na mesma linha do titulo. Sem
  // isto o texto ocupava a largura toda e empurrava o botao para baixo.
  painelTopoTexto: { flex: '1 1 320px', minWidth: 0 },
  dicaCurva: {
    ...tipo('legenda'), color: t.textoMedio, margin: `0 0 ${espaco.xl}px`,
    padding: `${espaco.md}px ${espaco.lg}px`, background: t.papel,
    borderRadius: raio.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    lineHeight: 1.5,
  },
  painelTitulo: { ...tipo('corpoF'), margin: 0 },
  painelDica: { ...tipo('legenda'), color: t.textoFraco, margin: `2px 0 0` },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdCurto: {
    padding: espaco.lg, ...tipo('corpo'), color: t.textoMedio,
    borderBottom: `1px solid ${t.borda}`,
    // Nome comprido nao pode empilhar uma palavra por linha.
    maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  tdFraco: {
    padding: espaco.lg, ...tipo('legenda'), color: t.textoFraco,
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpo'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNumForte: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpoF'), ...numeros,
    color: t.texto, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
};

/* Impressao: mesmos valores da Folha de Analise do estudo — o papel dos dois
   relatorios precisa parecer da mesma casa. */
const imp = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45,
           fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif" },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555', textAlign: 'right' },

  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },

  tituloSecao: { fontSize: 12, fontWeight: 700, margin: '0 0 6px', paddingBottom: 3, borderBottom: '1px solid #999' },

  /* Comparativo no papel. O destaque nao pode depender de cor: a folha sai
     em P&B na maioria das impressoras da fabrica. Quem destaca e' a borda
     grossa e o fundo cinza — a cor so' reforca. */
  comparativo: { marginBottom: 14, breakInside: 'avoid' },
  comparativoGrade: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  comparativoCaixa: {
    display: 'flex', flexDirection: 'column', gap: 1,
    border: '1px solid #999', padding: '6px 8px',
  },
  comparativoCaixaDestaque: {
    display: 'flex', flexDirection: 'column', gap: 1,
    border: '2px solid #000', background: '#EEE', padding: '6px 8px',
  },
  comparativoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#444' },
  comparativoValor: { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  comparativoSub: { fontSize: 8.5, color: '#333' },
  comparativoNota: { fontSize: 8.5, color: '#333', margin: '5px 0 0', lineHeight: 1.4 },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5, breakInside: 'avoid' },
  th: { textAlign: 'left', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  td: { padding: '3px 5px', borderBottom: '1px solid #DDD', verticalAlign: 'top' },
  tdNum: { padding: '3px 5px', borderBottom: '1px solid #DDD', textAlign: 'right',
           fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },

  /* ---- comparativo entre maquinas no papel ---- */
  entreMaquinas: { marginBottom: 10 },
  // Um grupo nao se parte entre duas folhas: a tabela sem a leitura que a
  // explica (ou o contrario) e' pior do que uma folha com mais respiro.
  grupoBloco: { breakInside: 'avoid', marginBottom: 8 },
  grupoNome: {
    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.6, color: '#555', marginBottom: 2,
  },

  /* ---- analise do periodo no papel ---- */
  analiseBloco: { breakInside: 'avoid', marginBottom: 6 },
  analiseTitulo: {
    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.6, color: '#555', marginBottom: 1,
  },
  analiseLinha: { margin: '0 0 3px', fontSize: 9.5, lineHeight: 1.5 },

  legenda: { marginTop: 14, border: '1px solid #DDD', padding: 8, breakInside: 'avoid' },
  gradeLegenda: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', marginTop: 6 },
  itemLegenda: { display: 'flex', gap: 6, fontSize: 9, lineHeight: 1.45, breakInside: 'avoid' },
  nota: { margin: '8px 0 0', fontSize: 9, color: '#555', lineHeight: 1.5 },

  assinaturas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 32, breakInside: 'avoid' },
  assinatura: { textAlign: 'center' },
  linhaAssinatura: { borderTop: '1px solid #000', marginBottom: 4 },
  papelAssinatura: { fontSize: 9, color: '#555' },
};
