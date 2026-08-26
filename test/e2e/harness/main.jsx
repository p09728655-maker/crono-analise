import { createRoot } from 'react-dom/client';
import ColetaFuradeira from '/src/features/coleta/ColetaFuradeira.jsx';

// ?meta=3 encurta a meta para o teste chegar nela sem cronometrar 12 ciclos.
const meta = Number(new URLSearchParams(location.search).get('meta')) || 12;
const estudo = { nome: 'Furacao lateral', recurso: 'Furadeira 03', tolerancia_pct: 15, meta_obs: meta };
const operacao = { id: '33333333-3333-3333-3333-333333333333', nome: 'Furar lateral', fr_pct: 100, tempos: [], paradas: [] };

// Expoe os ciclos registrados para o teste inspecionar.
window.__registrados = [];

createRoot(document.getElementById('raiz')).render(
  <ColetaFuradeira
    estudo={estudo}
    operacao={operacao}
    aoRegistrar={(item) => window.__registrados.push(item)}
    aoSair={() => { window.__saiu = true; }}
  />,
);
