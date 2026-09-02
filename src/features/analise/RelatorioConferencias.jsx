import { useState } from 'react';
import { VERSAO } from '../../versao.js';
import { TODAS, loteDaMaquina } from '../../domain/relatorioConferencias.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import ComparativoMaquinas from './ComparativoMaquinas.jsx';
import RitmoPorCiclo from './RitmoPorCiclo.jsx';
import { useConferencias } from './conferencias/useConferencias.js';
import { useLeitura } from './conferencias/useLeitura.js';
import { est } from './conferencias/estilos.js';
import KpisDoPeriodo from './conferencias/KpisDoPeriodo.jsx';
import ComparativoParadas from './conferencias/ComparativoParadas.jsx';
import CartoesMaquina from './conferencias/CartoesMaquina.jsx';
import TabelaRitmoPorPeca from './conferencias/TabelaRitmoPorPeca.jsx';
import GraficosRitmo from './conferencias/GraficosRitmo.jsx';
import ParetoParadas from './conferencias/ParetoParadas.jsx';
import AnalisePeriodo from './conferencias/AnalisePeriodo.jsx';
import TabelaMedicoes from './conferencias/TabelaMedicoes.jsx';
import RenomearPeca from './conferencias/RenomearPeca.jsx';
import EditorParadas from './conferencias/EditorParadas.jsx';
import { ConfirmarExclusao, ConfirmarLote } from './conferencias/Confirmacoes.jsx';
import ImpressaoConferencias from './conferencias/ImpressaoConferencias.jsx';

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
 * O FILTRO por maquina, na lateral, vale para o relatorio INTEIRO:
 * numeros do topo, cartoes, quadros, grafico E a folha impressa. O que
 * esta' na tela e' o que sai no papel — e' assim que se imprime o relatorio
 * de uma maquina so'.
 *
 * Este arquivo e' o ARRANJO: quem carrega e grava e' useConferencias, quem
 * calcula e' useLeitura (e o dominio por tras dele), e cada quadro da tela
 * mora em conferencias/. Aqui fica a ordem em que os quadros aparecem, o
 * que abre e fecha, e ONDE cada erro e' mostrado.
 */

/* A escolha de levar a analise para o papel fica gravada no navegador:
   quem imprime com analise hoje quase sempre quer amanha tambem. Sem
   armazenamento (aba privada), a escolha vale so' enquanto a tela vive. */
const CHAVE_ANALISE_PAPEL = 'ritmo.analise-na-impressao';
const lerAnaliseNoPapel = () => {
  try { return localStorage.getItem(CHAVE_ANALISE_PAPEL) === '1'; } catch { return false; }
};

export default function RelatorioConferencias({ aoVoltar, aoVerInicio }) {
  const dados = useConferencias();
  const {
    linhas, outras, estado, erro, ocupado, verArquivadas, mapaGrupos, grupoDe,
    limparErro, carregar,
  } = dados;

  const [filtro, setFiltro] = useState(null);
  const [verVersoes, setVerVersoes] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [confirmandoLote, setConfirmandoLote] = useState(null);
  const [editandoParadas, setEditandoParadas] = useState(null);
  const [renomeando, setRenomeando] = useState(null);
  const [analiseNoPapel, setAnaliseNoPapel] = useState(lerAnaliseNoPapel);

  const alternarAnaliseNoPapel = () => setAnaliseNoPapel((v) => {
    const novo = !v;
    try { localStorage.setItem(CHAVE_ANALISE_PAPEL, novo ? '1' : '0'); } catch { /* sem armazenamento */ }
    return novo;
  });

  // Trocar de face (ativas x arquivadas) derruba o filtro: a maquina
  // escolhida pode nao existir do outro lado, e a tela ficaria vazia sem
  // dizer por que.
  const trocarFace = () => { setFiltro(null); dados.alternarArquivadas(); };
  const fecharJanela = (fechar) => () => { limparErro(); fechar(null); };

  const leitura = useLeitura({ linhas, filtro, mapaGrupos, grupoDe });
  const {
    visiveis, resumoVisivel, resumoPecasVisivel, analise, barrasDoFiltro, painel,
    curvaDoDia, comparativo, entreMaquinas, porCiclo, secoes,
  } = leitura;

  const lote = loteDaMaquina({ filtro, visiveis, verArquivadas });
  const janelaAberta = Boolean(editandoParadas || confirmando || confirmandoLote || renomeando);

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
          /* A mesma lateral da lista e do estudo. O filtro por maquina vai
             para dentro dela pelo mesmo motivo que os produtos foram na
             lista: e' navegacao, nao um controle do conteudo. */
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
                aoClicar: trocarFace,
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
                <button type="button" style={est.botaoImprimir} onClick={trocarFace}>
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
          {erro && estado === 'pronto' && !janelaAberta && (
            <div style={est.avisoFlutuante} role="alert">
              <span style={{ flex: 1, minWidth: 0 }}>{erro}</span>
              <button type="button" style={est.botaoLinha} onClick={limparErro}>
                Fechar
              </button>
            </div>
          )}

          {/* A ORDEM dos quadros e' a ordem da leitura: os numeros do
              periodo, o que a parada custou, cada maquina sozinha, depois a
              comparacao entre elas (que pressupoe ter visto cada uma), a
              regua do ciclo (que responde a duvida que a comparacao
              levanta), o ritmo por peca, os graficos, as paradas, a analise
              — e a tabela de tudo no fim. Na face das ARQUIVADAS so' os
              cartoes e a tabela ficam: ritmo nao sai de arquivadas. */}
          {estado === 'pronto' && linhas.length > 0 && (
            <>
              {!verArquivadas && painel && <KpisDoPeriodo painel={painel} />}

              {!verArquivadas && comparativo && (
                <ComparativoParadas comparativo={comparativo} resumo={resumoVisivel} filtro={filtro} />
              )}

              <CartoesMaquina resumo={resumoVisivel} grupoDe={grupoDe} />

              {!verArquivadas && <ComparativoMaquinas comparativo={entreMaquinas} />}

              {!verArquivadas && <RitmoPorCiclo classes={porCiclo.classes} mistas={porCiclo.mistas} />}

              {!verArquivadas && resumoPecasVisivel.length > 0 && (
                <TabelaRitmoPorPeca resumoPecas={resumoPecasVisivel} />
              )}

              {!verArquivadas && (
                <GraficosRitmo
                  resumo={resumoVisivel}
                  filtro={filtro}
                  barrasDoFiltro={barrasDoFiltro}
                  curvaDoDia={curvaDoDia}
                />
              )}

              {!verArquivadas && painel && painel.pareto.totalMs > 0 && (
                <ParetoParadas pareto={painel.pareto} />
              )}

              {!verArquivadas && (
                <AnalisePeriodo
                  secoes={analise}
                  resumo={resumoVisivel}
                  noPapel={analiseNoPapel}
                  aoAlternarPapel={alternarAnaliseNoPapel}
                />
              )}

              <TabelaMedicoes
                linhas={visiveis}
                filtro={filtro}
                verArquivadas={verArquivadas}
                lote={lote}
                ocupado={ocupado}
                aoArquivarLote={setConfirmandoLote}
                aoRenomear={setRenomeando}
                aoEditarParadas={setEditandoParadas}
                aoAlternarArquivo={dados.alternarArquivo}
                aoExcluir={setConfirmando}
              />
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
            aoFechar={fecharJanela(setRenomeando)}
            aoGravar={(campos) => dados.gravarNomeDaPeca(
              { conferencia: renomeando, ...campos }, () => setRenomeando(null),
            )}
          />
        )}

        {editandoParadas && (
          <EditorParadas
            conferencia={editandoParadas}
            erro={erro}
            ocupado={ocupado === editandoParadas.id}
            aoFechar={fecharJanela(setEditandoParadas)}
            aoGravar={(paradas) => dados.gravarParadas(
              editandoParadas, paradas, () => setEditandoParadas(null),
            )}
          />
        )}

        {confirmandoLote && (
          <ConfirmarLote
            lote={confirmandoLote}
            erro={erro}
            ocupado={ocupado === 'lote'}
            aoCancelar={fecharJanela(setConfirmandoLote)}
            /* O filtro morre junto: a maquina que acabou de sair da lista
               nao tem mais o que mostrar, e a tela ficaria vazia sem dizer
               por que. */
            aoConfirmar={() => dados.alternarArquivoDaMaquina(
              confirmandoLote, () => { setConfirmandoLote(null); setFiltro(null); },
            )}
          />
        )}

        {confirmando && (
          <ConfirmarExclusao
            conferencia={confirmando}
            erro={erro}
            ocupado={ocupado === confirmando.id}
            aoCancelar={fecharJanela(setConfirmando)}
            aoConfirmar={() => dados.excluir(confirmando, () => setConfirmando(null))}
          />
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
