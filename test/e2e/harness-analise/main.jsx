import { createRoot } from 'react-dom/client';
import PainelAnalise from '/src/features/analise/PainelAnalise.jsx';

/** Ciclos sinteticos com dispersao realista de furadeira. */
function ciclos(base, dispersao, n, semente = 1) {
  let s = semente;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length: n }, () => Math.round(base + (rnd() - 0.5) * 2 * dispersao));
}

const OPERACOES = [
  { id: 'op-1', nome: 'Furar lateral', fr_pct: 100, tempos: ciclos(9800, 400, 14, 7), paradas: [] },
  { id: 'op-2', nome: 'Furar fundo', fr_pct: 95, tempos: ciclos(7200, 900, 12, 21), paradas: [{ duracao: 45000 }] },
  // Peca com 3 furacoes: o ciclo e' rapido, mas a peca exige tres.
  { id: 'op-3', nome: 'Trocar broca', fr_pct: 100, ciclos_por_peca: 3, tempos: ciclos(4700, 900, 13, 33), paradas: [] },
  { id: 'op-4', nome: 'Conferir furo', fr_pct: 105, tempos: ciclos(4100, 300, 6, 44), paradas: [] },
];

const RESPOSTA = {
  estudo: {
    id: 'estudo-1', nome: 'Furação lateral — linha 2', produto: 'Painel MDF 18mm',
    recurso: 'Furadeira 03', setor: 'Usinagem', analista: 'Maurício',
    data_estudo: '2026-08-25', tolerancia_pct: '15.00', meta_obs: 12,
    takt_time_ms: 12000, status: 'coletando',
  },
  operacoes: OPERACOES,
};

// Intercepta a rede: o harness testa a tela, nao o backend.
window.fetch = async () => new Response(JSON.stringify(RESPOSTA), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

createRoot(document.getElementById('raiz')).render(
  <PainelAnalise estudoId="estudo-1" aoVoltar={() => {}} aoColetar={() => {}} />,
);
