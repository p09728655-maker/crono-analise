import { useCallback, useEffect, useState } from 'react';
import ListaEstudos from './features/estudos/ListaEstudos.jsx';
import DetalheEstudo from './features/estudos/DetalheEstudo.jsx';
import ColetaFuradeira from './features/coleta/ColetaFuradeira.jsx';
import PainelAnalise from './features/analise/PainelAnalise.jsx';
import BarraSincronizacao from './components/BarraSincronizacao.jsx';
import { caminhos, useRota } from './lib/dispositivo.js';
import { obterEstudo } from './lib/api.js';
import { cores as escuro } from './theme/tokens.js';

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

  const irParaLista = useCallback(() => navegar(caminhos.lista(modo)), [navegar, modo]);
  const abrirEstudo = useCallback((id) => navegar(caminhos.estudo(modo, id)), [navegar, modo]);
  const coletar = useCallback(
    (estudo, operacao) => navegar(caminhos.coletar(estudo.id, operacao.id)),
    [navegar],
  );
  const trocarModo = useCallback(() => {
    const outro = modo === 'analise' ? 'coleta' : 'analise';
    // Mantem o estudo aberto ao trocar de modo, em vez de jogar para a lista.
    navegar(estudoId ? caminhos.estudo(outro, estudoId) : caminhos.lista(outro));
  }, [navegar, modo, estudoId]);

  const emColeta = tela === 'coleta';

  // Recarregar no meio da coleta perderia o ciclo em andamento.
  useEffect(() => {
    if (!emColeta) return undefined;
    const aoSair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [emColeta]);

  // A URL canonica evita que "/" fique no historico e confunda o Voltar.
  useEffect(() => {
    if (rota.padrao) navegar(caminhos.lista(modo), { substituir: true });
  }, [rota.padrao, modo, navegar]);

  return (
    <>
      {!emColeta && (
        <div className="somente-tela">
          <BarraSincronizacao />
        </div>
      )}

      {tela === 'lista' && (
        <ListaEstudos aoAbrir={abrirEstudo} modo={modo} aoTrocarModo={trocarModo} />
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
