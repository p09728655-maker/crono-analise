import { useCallback, useEffect, useState } from 'react';
import ListaEstudos from './features/estudos/ListaEstudos.jsx';
import DetalheEstudo from './features/estudos/DetalheEstudo.jsx';
import ColetaFuradeira from './features/coleta/ColetaFuradeira.jsx';
import ConferenciaRapida from './features/coleta/ConferenciaRapida.jsx';
import PainelAnalise from './features/analise/PainelAnalise.jsx';
import RelatorioConferencias from './features/analise/RelatorioConferencias.jsx';
import BarraSincronizacao from './components/BarraSincronizacao.jsx';
import { SistemaEncerrado } from './components/SairDoSistema.jsx';
import EntrarNoPc from './features/analise/EntrarNoPc.jsx';
import PrepararAparelho from './features/coleta/PrepararAparelho.jsx';
import { caminhos, ehDesktop, useRota } from './lib/dispositivo.js';
import { obterEstudo } from './lib/api.js';
import { aparelhoPareado, temSessao } from './lib/supabase.js';
import { carregarMotivos } from './lib/motivosParada.js';
import { cores as escuro } from './theme/tokens.js';

/**
 * Re-renderiza quando a sessao muda — entrar, sair, pareamento, revogacao.
 *
 * O estado em si mora no localStorage (src/lib/supabase.js); aqui so' se
 * escuta o aviso. 'storage' cobre a OUTRA aba; o evento proprio cobre esta,
 * porque o navegador nao entrega 'storage' para a aba que escreveu.
 */
function useSessaoViva() {
  const [, marcar] = useState(0);
  useEffect(() => {
    const reagir = () => marcar((n) => n + 1);
    window.addEventListener('ritmopatrimar-sessao', reagir);
    window.addEventListener('storage', reagir);
    return () => {
      window.removeEventListener('ritmopatrimar-sessao', reagir);
      window.removeEventListener('storage', reagir);
    };
  }, []);
}

/**
 * Toda a navegacao vem da URL — ver src/lib/dispositivo.js.
 *
 * Isso e' o que faz Voltar, recarregar e link direto funcionarem. O estado
 * de tela nao mora mais em useState: e' derivado do caminho, entao o
 * historico do navegador e a interface nunca discordam.
 */
export default function App() {
  const [rota, navegar] = useRota();
  const { modo, tela, estudoId, operacaoId } = rota;
  const desktop = ehDesktop();
  useSessaoViva();

  /**
   * Sair do sistema — so' existe no aparelho de toque.
   *
   * No PC o app vive numa aba: fechar e' o X do navegador. No tablet ele
   * roda instalado, em tela cheia, e nao havia por onde sair ao fim do
   * turno. O estado mora AQUI, e nao na lista, porque encerrar cobre o app
   * inteiro — nao e' um modal de uma tela.
   */
  const [encerrado, setEncerrado] = useState(false);

  const irParaLista = useCallback(() => navegar(caminhos.lista(modo)), [navegar, modo]);
  const abrirEstudo = useCallback((id) => navegar(caminhos.estudo(modo, id)), [navegar, modo]);
  const editarEstudo = useCallback(
    (id) => navegar(`${caminhos.estudo('analise', id)}?editar=1`),
    [navegar],
  );
  const coletar = useCallback(
    (estudo, operacao) => navegar(caminhos.coletar(estudo.id, operacao.id)),
    [navegar],
  );
  /**
   * Ir medir um estudo — a MESMA tela de coleta de sempre.
   *
   * Nao ha rota nova aqui: e' o caminho que o alternador de modo ja' usava,
   * so' que agora alcancado direto do estudo que esta' esperando, em vez de
   * "trocar de modo e procurar de novo na lista".
   */
  const medirEstudo = useCallback((id) => navegar(caminhos.estudo('coleta', id)), [navegar]);
  const trocarModo = useCallback(() => {
    const outro = modo === 'analise' ? 'coleta' : 'analise';
    // Mantem o estudo aberto ao trocar de modo, em vez de jogar para a lista.
    navegar(estudoId ? caminhos.estudo(outro, estudoId) : caminhos.lista(outro));
  }, [navegar, modo, estudoId]);

  const emColeta = tela === 'coleta';
  // A conferencia rapida tambem e' tela cheia de cronometro: sem barra de
  // sincronizacao (ela nao fala com o servidor) e sem distracao.
  const telaCheia = emColeta || tela === 'rapida';

  // Recarregar no meio da coleta perderia o ciclo em andamento.
  useEffect(() => {
    if (!emColeta) return undefined;
    const aoSair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [emColeta]);

  /**
   * Cadastro de motivos de parada, uma vez por abertura.
   *
   * A coleta ja' abre com a lista do cache (ou com os motivos de fabrica),
   * entao isto nao bloqueia nada: e' so' a busca da versao mais recente.
   * Falha em silencio de proposito — ver src/lib/motivosParada.js.
   */
  useEffect(() => { carregarMotivos(); }, []);

  // A URL canonica evita que "/" fique no historico e confunda o Voltar.
  useEffect(() => {
    if (rota.padrao) navegar(caminhos.lista(modo), { substituir: true });
  }, [rota.padrao, modo, navegar]);

  // Celular e tablet SO abrem a coleta. Analise e' trabalho de PC — no
  // chao de fabrica ela so' atrapalha e abre porta para toque errado.
  // Um link /analise aberto no celular cai na coleta equivalente.
  useEffect(() => {
    if (desktop || modo !== 'analise') return;
    navegar(estudoId ? caminhos.estudo('coleta', estudoId) : caminhos.lista('coleta'), { substituir: true });
  }, [desktop, modo, estudoId, navegar]);

  // Enquanto o redirecionamento acima nao aplica, nao renderiza a analise
  // no aparelho de toque — nem por um quadro.
  if (!desktop && modo === 'analise') return null;

  if (encerrado) return <SistemaEncerrado aoEntrar={() => setEncerrado(false)} />;

  /**
   * A porta de entrada, por tipo de aparelho.
   *
   * PC: cada pessoa entra com e-mail e senha — e' quem assina o que faz.
   * Tablet: pareado uma vez, entra sozinho para sempre; sem pareamento,
   * a unica tela possivel e' a de parear. As duas condicoes reagem ao
   * useSessaoViva la' de cima: entrar/sair troca a tela na hora.
   */
  if (desktop && !temSessao()) return <EntrarNoPc />;
  if (!desktop && !temSessao() && !aparelhoPareado()) return <PrepararAparelho />;

  return (
    <>
      {!telaCheia && (
        <div className="somente-tela">
          <BarraSincronizacao />
        </div>
      )}

      {/* Sem alternador de modo no aparelho de toque: coleta e' o unico modo la. */}
      {tela === 'lista' && (
        <ListaEstudos
          aoAbrir={abrirEstudo}
          aoEditar={editarEstudo}
          aoMedir={medirEstudo}
          modo={modo}
          aoTrocarModo={desktop ? trocarModo : undefined}
          aoConferirRapido={() => navegar(caminhos.rapida())}
          aoSairDoSistema={desktop ? undefined : () => setEncerrado(true)}
          aoVerConferencias={() => navegar(caminhos.conferencias())}
        />
      )}

      {tela === 'rapida' && (
        <ConferenciaRapida aoSair={() => navegar(caminhos.lista('coleta'))} />
      )}

      {tela === 'conferencias' && (
        <RelatorioConferencias aoVoltar={() => navegar(caminhos.lista('analise'))} />
      )}

      {tela === 'estudo' && (
        modo === 'analise'
          ? <PainelAnalise estudoId={estudoId} aoVoltar={irParaLista} aoColetar={coletar} />
          : <DetalheEstudo estudoId={estudoId} aoColetar={coletar} aoVoltar={irParaLista} />
      )}

      {emColeta && (
        <CarregarColeta estudoId={estudoId} operacaoId={operacaoId} aoSair={() => abrirEstudo(estudoId)} />
      )}
    </>
  );
}

/**
 * Carrega estudo e operacao a partir do ID da URL.
 *
 * A tela de coleta precisa dos objetos, nao so' dos ids. Com a navegacao na
 * URL, abrir o link direto (ou recarregar no meio da coleta) precisa
 * funcionar sem depender de estado que ficou para tras.
 */
function CarregarColeta({ estudoId, operacaoId, aoSair }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;
    obterEstudo(estudoId)
      .then((r) => {
        if (cancelado) return;
        const operacao = r.operacoes.find((o) => o.id === operacaoId);
        if (!operacao) { setErro('Operação não encontrada neste estudo.'); return; }
        setDados({ estudo: r.estudo, operacao: { ...operacao, fr: Number(operacao.fr_pct) } });
      })
      .catch((e) => { if (!cancelado) setErro(e.message); });
    return () => { cancelado = true; };
  }, [estudoId, operacaoId]);

  const centro = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
    background: escuro.fundo, color: escuro.textoFraco, textAlign: 'center',
    fontFamily: "'Calibri', 'Carlito', 'Segoe UI', system-ui, sans-serif",
  };

  if (erro) {
    return (
      <div style={centro}>
        <p style={{ margin: 0 }}>{erro}</p>
        <button
          type="button"
          onClick={aoSair}
          style={{
            minHeight: 56, padding: '0 24px', background: escuro.vermelho, border: 'none',
            borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Voltar ao estudo
        </button>
      </div>
    );
  }

  if (!dados) return <div style={centro}>Carregando operação...</div>;

  return <ColetaFuradeira estudo={dados.estudo} operacao={dados.operacao} aoSair={aoSair} />;
}
