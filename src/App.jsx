import { useCallback, useEffect, useState } from 'react';
import ListaEstudos from './features/estudos/ListaEstudos.jsx';
import DetalheEstudo from './features/estudos/DetalheEstudo.jsx';
import ColetaFuradeira from './features/coleta/ColetaFuradeira.jsx';
import PainelAnalise from './features/analise/PainelAnalise.jsx';
import BarraSincronizacao from './components/BarraSincronizacao.jsx';
import { useRota } from './lib/dispositivo.js';

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
        </div>
      )}

      {tela.nome === 'lista' && (
        <ListaEstudos
          aoAbrir={abrirEstudo}
          modo={modo}
          aoTrocarModo={() => navegar(modo === 'analise' ? '/coleta' : '/analise')}
        />
      )}

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
