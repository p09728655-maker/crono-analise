import { createRoot } from 'react-dom/client';
import ListaEstudos from '/src/features/estudos/ListaEstudos.jsx';

// Grafias diferentes do MESMO produto, para exercitar o agrupamento.
const RESPOSTA = {
  estudos: [
    { id: 'e1', nome: 'Furação lateral', recurso: 'Furadeira 03',
      produto: 'Sleep Base', analista: 'Maurício', total_operacoes: 4, total_observacoes: 45 },
    { id: 'e2', nome: 'Furação fundo', recurso: 'Furadeira 16',
      produto: 'SLEEP BASE', analista: 'Oderli', total_operacoes: 2, total_observacoes: 12 },
    { id: 'e3', nome: 'Corte base', recurso: 'Seccionadora 01',
      produto: 'sleep base', analista: 'Maurício', total_operacoes: 3, total_observacoes: 30 },
    { id: 'e4', nome: 'Usinagem topo', recurso: 'CNC 02',
      produto: 'Painel MDF 18mm', analista: 'Oderli', total_operacoes: 2, total_observacoes: 18 },
    { id: 'e5', nome: 'Estudo sem produto', recurso: 'Furadeira 03',
      produto: '', analista: 'EU', total_operacoes: 1, total_observacoes: 0 },
  ],
};
// ?vazio=1 simula banco sem estudo nenhum; POSTs ficam em window.__posts.
const params = new URLSearchParams(location.search);
const vazio = params.get('vazio') === '1';
window.__posts = [];
window.__aberto = null;
window.fetch = async (url, opts = {}) => {
  if ((opts.method || 'GET') === 'POST') {
    const corpo = JSON.parse(opts.body);
    window.__posts.push({ url: String(url), corpo });
    return new Response(JSON.stringify({ estudo: { id: 'novo-1' }, operacoes: [] }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(vazio ? { estudos: [] } : RESPOSTA), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// ?modo=analise no harness para inspecionar as duas variantes.
const modo = params.get('modo') || 'coleta';
createRoot(document.getElementById('raiz')).render(
  <ListaEstudos aoAbrir={(id) => { window.__aberto = id; }} modo={modo} aoTrocarModo={() => {}} />,
);
