import { useCallback, useEffect, useState } from 'react';
import ListaEstudos from './features/estudos/ListaEstudos.jsx';
import DetalheEstudo from './features/estudos/DetalheEstudo.jsx';
import ColetaFuradeira from './features/coleta/ColetaFuradeira.jsx';
import BarraSincronizacao from './components/BarraSincronizacao.jsx';

/**
 * Navegacao por estado, sem router.
 * O app tem tres telas e um fluxo linear; uma dependencia de roteamento
 * so' adicionaria peso a um bundle que precisa abrir rapido num tablet
 * modesto de chao de fabrica.
 */
export default function App() {
  const [tela, setTela] = useState({ nome: 'estudos' });

  const abrirEstudo = useCallback((estudoId) => setTela({ nome: 'estudo', estudoId }), []);
  const voltarParaEstudos = useCallback(() => setTela({ nome: 'estudos' }), []);
  const coletar = useCallback((estudo, operacao) => setTela({ nome: 'coleta', estudo, operacao }), []);

  // Durante a coleta, um recarregamento acidental perderia o ciclo em curso.
  useEffect(() => {
    if (tela.nome !== 'coleta') return undefined;
    const aoSair = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [tela.nome]);

  return (
    <>
      {/* A barra some na coleta: a tela precisa inteira para o botao. */}
      {tela.nome !== 'coleta' && <BarraSincronizacao />}

      {tela.nome === 'estudos' && <ListaEstudos aoAbrir={abrirEstudo} />}

      {tela.nome === 'estudo' && (
        <DetalheEstudo estudoId={tela.estudoId} aoColetar={coletar} aoVoltar={voltarParaEstudos} />
      )}

      {tela.nome === 'coleta' && (
        <ColetaFuradeira
          estudo={tela.estudo}
          operacao={tela.operacao}
          aoSair={() => abrirEstudo(tela.estudo.id)}
        />
      )}
    </>
  );
}
