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
  {
    id: 'op-2', nome: 'Furar fundo', fr_pct: 95, tempos: ciclos(7200, 900, 12, 21),
    // Como o servidor entrega: duracao_ms do banco e duracao ja' convertida.
    paradas: [
      { motivo: 'falta_material', duracao_ms: 720000, duracao: 720000 },
      { motivo: 'setup', duracao_ms: 240000, duracao: 240000 },
    ],
  },
  // Peca com 3 furacoes: o ciclo e' rapido, mas a peca exige tres.
  {
    id: 'op-3', nome: 'Trocar broca', fr_pct: 100, ciclos_por_peca: 3, tempos: ciclos(4700, 900, 13, 33),
    paradas: [{ motivo: 'ferramenta', duracao_ms: 180000, duracao: 180000 }],
  },
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

/* ------------------------------------------------------------- cenarios */
/**
 * MEDICAO DA LINHA: com ?cenario= o harness responde CONFORME A URL —
 * estudo, cadastro de maquinas e medicoes de ritmo. Sem cenario continua
 * devolvendo o MESMO corpo para toda URL, de proposito: e' o que prova que
 * o painel tolera resposta sem medicoes e sem cadastro.
 */
const MIN = 60000;
const haDias = (d) => new Date(Date.now() - d * 86400000).toISOString();
const medicao = (extra) => ({
  maquina: 'FURADEIRA 03', peca: 'PAINEL MDF 18MM', duracao_ms: 20 * MIN, pecas: 60,
  ciclos_por_peca: 1, paradas: [], arquivada: false, com_marcas: false, iniciado_em: haDias(9), ...extra,
});

const CADASTRO_FURADEIRA = {
  maquinas: [
    { id: 'm1', nome: 'FURADEIRA 03', grupo_id: 'g1', ativa: true },
    { id: 'm2', nome: 'FURADEIRA 04', grupo_id: 'g1', ativa: true },
  ],
  grupos: [{ id: 'g1', codigo: '0001', nome: 'FURADEIRAS', horas_semana: '44.00' }],
  produtos: [{ id: 'p1', nome: 'PAINEL MDF 18MM', codigo: null, grupo_id: 'g1', ativo: true, volumes: null }],
};

// 60 + 66 + 54 = 180 pecas em 60 min de relogio (180 pç/h); 5 min de
// setup na segunda: 180 em 55 min rodando (196 pç/h).
const MEDICOES_FURADEIRA = [
  medicao({ id: 'c1', iniciado_em: haDias(9) }),
  medicao({ id: 'c2', maquina: 'Furadeira 03', peca: 'Painel MDF 18mm', pecas: 66, iniciado_em: haDias(6),
    paradas: [{ motivo: 'setup', duracaoMs: 5 * MIN, observacao: null }] }),
  medicao({ id: 'c3', pecas: 54, iniciado_em: haDias(2) }),
];
// O que NAO pode entrar: arquivada, velha, outro produto, outra maquina.
const MEDICOES_DE_FORA = [
  medicao({ id: 'x1', pecas: 999, arquivada: true }),
  medicao({ id: 'x2', pecas: 999, iniciado_em: haDias(45) }),
  medicao({ id: 'x3', peca: 'LATERAL SLEEP', pecas: 999 }),
  medicao({ id: 'x4', maquina: 'FURADEIRA 04', pecas: 999 }),
];

// Embalagem: TP do gargalo 115 s (100 s × 1,15) = 31 produtos/h pelo tempo
// padrao; takt de 144 s = 25 produtos/h exigidos.
const ESTUDO_EMBALAGEM = {
  estudo: {
    id: 'estudo-2', nome: 'Embalagem rack — linha 1', produto: 'Rack Sirius 1.6',
    recurso: 'EMBALAGEM 01', setor: 'Embalagem', analista: 'Adriano',
    data_estudo: '2026-10-01', tolerancia_pct: '15.00', meta_obs: 10,
    takt_time_ms: 144000, status: 'concluido',
  },
  operacoes: [
    { id: 'e1', nome: 'Montar caixa', fr_pct: 100, tempos: Array.from({ length: 12 }, (_, i) => (i % 2 ? 101000 : 99000)), paradas: [] },
    { id: 'e2', nome: 'Aplicar isomanta', fr_pct: 100, tempos: Array.from({ length: 12 }, (_, i) => (i % 2 ? 71000 : 69000)), paradas: [] },
  ],
};
const cadastroEmbalagem = (volumes) => ({
  maquinas: [{ id: 'm5', nome: 'EMBALAGEM 01', grupo_id: 'g5', ativa: true }],
  grupos: [{ id: 'g5', codigo: '0005', nome: 'EMBALAGEM', horas_semana: '44.00' }],
  produtos: [{ id: 'p5', nome: 'RACK SIRIUS 1.6', codigo: '12345', grupo_id: 'g5', ativo: true, volumes }],
});
// 16 + 14 + 16 = 46 volumes em 60 min = 46 vol/h; rack de 2 volumes = 23 produtos/h.
const MEDICOES_EMBALAGEM = [16, 14, 16].map((pecas, i) => medicao({
  id: `v${i}`, maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6', pecas, com_marcas: true, iniciado_em: haDias(8 - i * 3),
}));

const CENARIOS = {
  furadeira: { estudo: RESPOSTA, cadastro: CADASTRO_FURADEIRA, conferencias: [...MEDICOES_FURADEIRA, ...MEDICOES_DE_FORA] },
  'furadeira-curta': { estudo: RESPOSTA, cadastro: CADASTRO_FURADEIRA, conferencias: MEDICOES_FURADEIRA.slice(0, 2) },
  'sem-medicao': { estudo: RESPOSTA, cadastro: CADASTRO_FURADEIRA, conferencias: [MEDICOES_DE_FORA[2]] },
  'medicao-falha': { estudo: RESPOSTA, cadastro: CADASTRO_FURADEIRA, conferencias: null },
  embalagem: { estudo: ESTUDO_EMBALAGEM, cadastro: cadastroEmbalagem(2), conferencias: MEDICOES_EMBALAGEM },
  'embalagem-sem-volumes': { estudo: ESTUDO_EMBALAGEM, cadastro: cadastroEmbalagem(null), conferencias: MEDICOES_EMBALAGEM },
};

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json' },
});

const cenario = CENARIOS[new URLSearchParams(window.location.search).get('cenario')];

// Intercepta a rede: o harness testa a tela, nao o backend.
window.fetch = async (url) => {
  if (!cenario) return json(RESPOSTA);
  const u = String(url);
  if (u.includes('/estudos')) return json(cenario.estudo);
  if (u.includes('/maquinas')) return json(cenario.cadastro);
  if (u.includes('/conferencias')) {
    return cenario.conferencias ? json({ conferencias: cenario.conferencias, outras: 0 }) : json({ erro: 'Erro interno' }, 500);
  }
  if (u.includes('/usuarios')) return json({ usuarios: [] });
  return json({});
};

createRoot(document.getElementById('raiz')).render(
  <PainelAnalise estudoId={cenario ? cenario.estudo.estudo.id : 'estudo-1'} aoVoltar={() => {}} aoColetar={() => {}} />,
);
