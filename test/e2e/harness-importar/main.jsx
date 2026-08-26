import { createRoot } from 'react-dom/client';
import ListaEstudos from '/src/features/estudos/ListaEstudos.jsx';

/**
 * A lista ja tem um estudo do MESMO produto do PDF, em grafia diferente —
 * o aviso de duplicidade da importacao precisa disparar mesmo assim.
 */
const LISTA = {
  estudos: [
    { id: 'e1', nome: 'FURAÇÃO SLEEP', recurso: 'FUR16',
      produto: 'Mesa Cabeceira Sleep Branco', analista: 'Maurício',
      total_operacoes: 1, total_observacoes: 31 },
  ],
};

window.__posts = [];
window.__aberto = null;
window.fetch = async (url, opts = {}) => {
  const metodo = opts.method || 'GET';
  if (metodo === 'POST') {
    const corpo = JSON.parse(opts.body);
    window.__posts.push({ url: String(url), corpo });
    return new Response(JSON.stringify({
      estudo: { id: `novo-${window.__posts.length}` },
      operacoes: (corpo.operacoes || []).map((o, i) => ({ id: `op${i}`, ...o })),
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  // A lista de arquivados e' outra chamada; aqui nao ha nenhum.
  if (String(url).includes('arquivados=1')) {
    return new Response(JSON.stringify({ estudos: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(LISTA), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

const modo = new URLSearchParams(location.search).get('modo') || 'analise';
createRoot(document.getElementById('raiz')).render(
  <ListaEstudos aoAbrir={(id) => { window.__aberto = id; }} modo={modo} aoTrocarModo={() => {}} />,
);
