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
// Arquivados vivem numa lista propria (?arquivados=1 na API). Aqui eles so'
// existem quando o teste pede — ?arq=1 — para o botao "Arquivados" nao
// aparecer nos demais casos.
const ARQUIVADOS = {
  estudos: [
    { id: 'a1', nome: 'MESA CABECEIRA SLEEP BRANCO', recurso: 'FUR16',
      produto: 'Sleep', analista: 'Maurício', total_operacoes: 6, total_observacoes: 89, status: 'arquivado' },
  ],
};

// ?vazio=1 simula banco sem estudo nenhum; POSTs ficam em window.__posts.
const params = new URLSearchParams(location.search);
const vazio = params.get('vazio') === '1';
const comArquivados = params.get('arq') === '1';
window.__posts = [];
window.__patches = [];
window.__deletes = [];
window.__aberto = null;
// Restaurar tira o estudo da lista de arquivados, como o servidor faria.
let arquivados = comArquivados ? { estudos: [...ARQUIVADOS.estudos] } : { estudos: [] };
let restaurados = [];
let chaveIa = { configurada: false, origem: null, resumo: null };

window.fetch = async (url, opts = {}) => {
  const metodo = opts.method || 'GET';
  const alvo = String(url);

  // Chave da IA: estado proprio, como no servidor — o navegador nunca
  // recebe a chave de volta, so' os 4 ultimos caracteres.
  if (alvo.includes('/config')) {
    if (metodo === 'POST') {
      const corpo = JSON.parse(opts.body);
      window.__posts.push({ url: alvo, corpo });
      chaveIa = { configurada: true, origem: 'banco', resumo: `•••${String(corpo.chaveIa).slice(-4)}` };
      return new Response(JSON.stringify({ chaveIa }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'DELETE') {
      window.__deletes.push(alvo);
      chaveIa = { configurada: false, origem: null, resumo: null };
      return new Response(JSON.stringify({ chaveIa }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ chaveIa }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (metodo === 'POST') {
    const corpo = JSON.parse(opts.body);
    window.__posts.push({ url: alvo, corpo });
    return new Response(JSON.stringify({ estudo: { id: 'novo-1' }, operacoes: [] }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (metodo === 'PATCH') {
    const corpo = JSON.parse(opts.body);
    window.__patches.push({ url: alvo, corpo });
    const id = new URL(alvo, location.origin).searchParams.get('id');
    const alvoEstudo = arquivados.estudos.find((e) => e.id === id);
    if (alvoEstudo) {
      arquivados = { estudos: arquivados.estudos.filter((e) => e.id !== id) };
      restaurados.push({ ...alvoEstudo, status: 'coletando' });
    }
    return new Response(JSON.stringify({ estudo: { id, status: 'coletando' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (alvo.includes('arquivados=1')) {
    return new Response(JSON.stringify(arquivados), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = vazio ? { estudos: [] } : RESPOSTA;
  return new Response(JSON.stringify({ estudos: [...base.estudos, ...restaurados] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// ?modo=analise no harness para inspecionar as duas variantes.
const modo = params.get('modo') || 'coleta';
createRoot(document.getElementById('raiz')).render(
  <ListaEstudos aoAbrir={(id) => { window.__aberto = id; }} modo={modo} aoTrocarModo={() => {}} />,
);
