import { useCallback, useEffect, useState } from 'react';
import ListaEstudos from './features/estudos/ListaEstudos.jsx';
import DetalheEstudo from './features/estudos/DetalheEstudo.jsx';
import ColetaFuradeira from './features/coleta/ColetaFuradeira.jsx';
import PainelAnalise from './features/analise/PainelAnalise.jsx';
import BarraSincronizacao from './components/BarraSincronizacao.jsx';
import { ehDesktop, useRota } from './lib/dispositivo.js';

/**
 * Duas experiencias separadas, uma base de codigo.
 *
 *   /coleta  — celular/tablet, no posto. Cronometrar e' a unica tarefa.
 *   /analise — PC, no escritorio. Ler resultado, decidir e imprimir.
 *
 * Sao tarefas diferentes, em posturas diferentes, com necessidades opostas:
 * a coleta quer um alvo gigante e nenhuma distracao; a analise quer densidade
 * de informacao e tabela. Misturar as duas produz uma tela ruim para ambas.
 *
 * A raiz "/" manda para a experiencia certa conforme o aparelho, mas as duas
 * rotas continuam acessiveis de qualquer lugar — bloquear criaria beco sem
 * saida quando o analista quiser conferir um numero no chao de fabrica.
 */
export default function App() {
  const [rota, navegar] = useRota();
  const [tela, setTela] = useState({ nome: 'lista' });

  const modo = rota.modo;

  const abrirEstudo = useCallback((estudoId) => setTela({ nome: 'estudo', estudoId }), []);
  const voltarParaLista = useCallback(() => setTela({ nome: 'lista' }), []);

  const coletar = useCallback((estudo, operacao) => {
    // Cronometrar sempre entra no modo coleta, venha de onde vier.
    if (modo !== 'coleta') navegar('/coleta');
    setTela({ nome: 'coleta', estudo, operacao });
  }, [modo, navegar]);

  // Recarregar no meio da coleta perderia o ciclo em andamento.
  useEffect(() => {
    if (tela.nome !== 'coleta') return undefined;
    const aoSair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [tela.nome]);

  // A tela de coleta ocupa tudo: sem barra de sincronizacao competindo.
  const emColeta = tela.nome === 'coleta';

  return (
    <>
      {!emColeta && (
        <div className="somente-tela">
          <BarraSincronizacao />
          <TrocaDeModo modo={modo} navegar={navegar} />
        </div>
      )}

      {tela.nome === 'lista' && <ListaEstudos aoAbrir={abrirEstudo} />}

      {tela.nome === 'estudo' && (
        modo === 'analise'
          ? <PainelAnalise estudoId={tela.estudoId} aoVoltar={voltarParaLista} aoColetar={coletar} />
          : <DetalheEstudo estudoId={tela.estudoId} aoColetar={coletar} aoVoltar={voltarParaLista} />
      )}

      {emColeta && (
        <ColetaFuradeira
          estudo={tela.estudo}
          operacao={tela.operacao}
          aoSair={() => abrirEstudo(tela.estudo.id)}
        />
      )}
    </>
  );
}

/**
 * Alternador entre as experiencias.
 *
 * So' aparece quando o aparelho nao bate com o modo — num PC no modo analise
 * ele seria ruido permanente. Aparece quando ha' de fato uma escolha a fazer.
 */
function TrocaDeModo({ modo, navegar }) {
  const desktop = ehDesktop();
  const combina = (desktop && modo === 'analise') || (!desktop && modo === 'coleta');
  if (combina) return null;

  const alvo = modo === 'coleta' ? 'analise' : 'coleta';
  const texto = alvo === 'analise'
    ? 'Ver análise e imprimir'
    : 'Ir para a coleta';

  return (
    <div style={est.troca}>
      <span style={est.trocaTexto}>
        {desktop
          ? 'Você está no modo coleta, feito para celular no posto.'
          : 'Você está no modo análise, feito para tela grande.'}
      </span>
      <button type="button" style={est.trocaBotao} onClick={() => navegar(`/${alvo}`)}>
        {texto}
      </button>
    </div>
  );
}

const est = {
  troca: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, flexWrap: 'wrap', padding: '8px 16px',
    background: '#2A3038', color: '#9AA5B1', fontSize: 12,
    borderBottom: '1px solid #3A424C',
  },
  trocaTexto: { opacity: 0.9 },
  trocaBotao: {
    minHeight: 32, padding: '0 12px', background: 'transparent',
    border: '1px solid currentColor', borderRadius: 6, color: '#F5F7FA',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
};
