import { createRoot } from 'react-dom/client';
import ListaEstudos from '/src/features/estudos/ListaEstudos.jsx';

const RESPOSTA = {
  estudos: [
    { id: 'e1', nome: 'Furação lateral — linha 2', recurso: 'Furadeira 03',
      produto: 'Painel MDF 18mm', analista: 'Maurício', total_operacoes: 4, total_observacoes: 45 },
    { id: 'e2', nome: 'Furadeira 16', recurso: 'FURADEIRA',
      produto: 'LATERAL', analista: 'EU', total_operacoes: 2, total_observacoes: 12 },
  ],
};
window.fetch = async () => new Response(JSON.stringify(RESPOSTA), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

// ?modo=analise no harness para inspecionar as duas variantes.
const modo = new URLSearchParams(location.search).get('modo') || 'coleta';
createRoot(document.getElementById('raiz')).render(
  <ListaEstudos aoAbrir={() => {}} modo={modo} aoTrocarModo={() => {}} />,
);
