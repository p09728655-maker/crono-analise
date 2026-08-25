import { createRoot } from 'react-dom/client';
import DetalheEstudo from '/src/features/estudos/DetalheEstudo.jsx';

const RESPOSTA = {
  estudo: {
    id: 'e1', nome: 'Furação', recurso: 'FURADEIRA 16', produto: 'SLEEP LATERAL DIREITA',
    analista: 'Oderli', tolerancia_pct: '15.00', meta_obs: 12, takt_time_ms: null,
    data_estudo: '2026-08-25', status: 'coletando',
  },
  operacoes: [
    { id: 'op1', estudo_id: 'e1', nome: 'FURAR', fr_pct: '100.00', ciclos_por_peca: 1,
      ordem: 0, tempos: [9800, 10100, 9700], observacoes: [], paradas: [] },
  ],
};
window.fetch = async () => new Response(JSON.stringify(RESPOSTA), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
window.__voltou = false;

createRoot(document.getElementById('raiz')).render(
  <DetalheEstudo estudoId="e1" aoColetar={() => {}} aoVoltar={() => { window.__voltou = true; }} />,
);
