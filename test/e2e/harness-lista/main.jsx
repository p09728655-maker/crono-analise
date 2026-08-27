import { createRoot } from 'react-dom/client';
import ListaEstudos from '/src/features/estudos/ListaEstudos.jsx';
import { enfileirar } from '/src/lib/filaOffline.js';

// Grafias diferentes do MESMO produto, para exercitar o agrupamento.
const RESPOSTA = {
  estudos: [
    { id: 'e1', nome: 'Furação lateral', recurso: 'Furadeira 03',
      produto: 'Sleep Base', analista: 'Maurício', total_operacoes: 4, total_observacoes: 45, status: 'coletando' },
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
// ?sair=1 liga o botao "Sair" — ele so' existe no aparelho de toque, e e' o
// App quem decide isso. O harness renderiza a lista sozinha, entao a decisao
// vem pela URL.
const comSair = params.get('sair') === '1';
// ?comconcluido=1 acrescenta um estudo CONCLUIDO: ele deve aparecer no PC
// (com o botao de mandar ao tablet) e sumir da lista do tablet.
const comConcluido = params.get('comconcluido') === '1';
// ?umproduto=1 deixa so' um grupo — o caso em que o filtro por produto nao
// filtra nada e por isso nao deve aparecer.
const umProduto = params.get('umproduto') === '1';
window.__posts = [];
window.__patches = [];
window.__deletes = [];
window.__aberto = null;
window.__saiu = false;
// A fila offline vive no IndexedDB do navegador: o teste precisa poder
// colocar registro nela para exercitar o aviso de "ainda nao enviados".
window.__enfileirar = enfileirar;
// Restaurar tira o estudo da lista de arquivados, como o servidor faria.
let arquivados = comArquivados ? { estudos: [...ARQUIVADOS.estudos] } : { estudos: [] };
let restaurados = [];
let chaveIa = { configurada: false, origem: null, resumo: null };
// Cadastro de motivos de parada — comeca VAZIO de proposito: e' o estado de
// uma instalacao nova, e o que a tela precisa saber tratar.
// Cadastro de analistas e quem esta neste PC. Comeca VAZIO: e o estado de
// quem nunca abriu Ferramentas > Analistas, e e' o que a tela precisa saber
// tratar sem travar a criacao de estudo.
let usuarios = [];
let proximoUsuario = 1;
let sessao = null;

let motivos = [];
let proximoMotivo = 1;
const codigoDe = (v) => String(v || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

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

  if (alvo.includes('/usuarios')) {
    const id = new URL(alvo, location.origin).searchParams.get('id');
    const corpo = opts.body ? JSON.parse(opts.body) : {};
    if (metodo === 'POST') {
      window.__posts.push({ url: alvo, corpo });
      const u = {
        id: `u${proximoUsuario++}`, nome: corpo.nome, email: corpo.email || null,
        papel: corpo.papel || 'analista', ativo: true,
        // O servidor NUNCA devolve a senha: so' se ha uma.
        tem_senha: Boolean(corpo.senha), estudos: 0,
      };
      usuarios.push(u);
      return new Response(JSON.stringify({ usuario: u }), {
        status: 201, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'PATCH') {
      window.__patches.push({ url: alvo, corpo });
      const u = usuarios.find((x) => x.id === id);
      if (u) Object.assign(u, corpo, { tem_senha: corpo.senha ? true : u.tem_senha });
      delete u?.senha;
      return new Response(JSON.stringify({ usuario: u }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'DELETE') {
      window.__deletes.push(alvo);
      usuarios = usuarios.filter((x) => x.id !== id);
      return new Response(JSON.stringify({ acao: 'excluido' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ usuarios }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (alvo.includes('/sessao')) {
    const corpo = opts.body ? JSON.parse(opts.body) : {};
    if (metodo === 'POST') {
      const u = usuarios.find((x) => x.email && x.email.toLowerCase() === String(corpo.email).toLowerCase());
      if (!u || !u.tem_senha) {
        return new Response(JSON.stringify({ erro: 'E-mail ou senha nao confere' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
      sessao = u;
      return new Response(JSON.stringify({ token: 'a'.repeat(64), usuario: u }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'DELETE') {
      sessao = null;
      return new Response(JSON.stringify({ acao: 'saiu' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ usuario: sessao }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (alvo.includes('/motivos-parada')) {
    const id = new URL(alvo, location.origin).searchParams.get('id');
    const corpo = opts.body ? JSON.parse(opts.body) : {};
    if (metodo === 'POST') {
      window.__posts.push({ url: alvo, corpo });
      const entrando = Array.isArray(corpo.motivos) ? corpo.motivos : [corpo];
      for (const m of entrando) {
        const codigo = codigoDe(m.codigo || m.rotulo);
        if (motivos.some((x) => x.codigo === codigo)) continue;
        motivos.push({
          id: `m${proximoMotivo++}`, codigo, rotulo: m.rotulo,
          acao: m.acao || null, ordem: motivos.length, ativo: true,
        });
      }
      const ultimo = motivos[motivos.length - 1];
      return new Response(JSON.stringify({ motivos, motivo: ultimo }), {
        status: 201, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'PATCH') {
      window.__patches.push({ url: alvo, corpo });
      if (!id && Array.isArray(corpo.ordem)) {
        motivos = corpo.ordem.map((mid) => motivos.find((m) => m.id === mid)).filter(Boolean);
      } else if (corpo.codigo) {
        return new Response(JSON.stringify({ erro: 'O codigo de um motivo nao muda' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      } else {
        const alvoMotivo = motivos.find((m) => m.id === id);
        if (alvoMotivo) Object.assign(alvoMotivo, corpo);
      }
      return new Response(JSON.stringify({ motivos, motivo: motivos.find((m) => m.id === id) }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (metodo === 'DELETE') {
      window.__deletes.push(alvo);
      // "usado" no nome simula o motivo que ja' tem parada registrada: o
      // servidor recusa a exclusao e manda desativar.
      if (motivos.find((m) => m.id === id)?.codigo.includes('usado')) {
        return new Response(JSON.stringify({ erro: 'ja foi usado em paradas registradas. Desative-o em vez de excluir' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      motivos = motivos.filter((m) => m.id !== id);
      return new Response(JSON.stringify({ acao: 'excluido' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ motivos }), {
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
      // O status vem do CLIENTE: restaurar no PC manda 'concluido', no
      // tablet manda 'coletando' — o harness so' repete, como o servidor.
      arquivados = { estudos: arquivados.estudos.filter((e) => e.id !== id) };
      restaurados.push({ ...alvoEstudo, status: corpo.status || 'coletando' });
    }
    return new Response(JSON.stringify({ estudo: { id, status: corpo.status } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (metodo === 'DELETE') {
    window.__deletes.push(alvo);
    const id = new URL(alvo, location.origin).searchParams.get('id');
    arquivados = { estudos: arquivados.estudos.filter((e) => e.id !== id) };
    return new Response(JSON.stringify({ acao: 'excluido' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (alvo.includes('arquivados=1')) {
    return new Response(JSON.stringify(arquivados), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const base = vazio ? { estudos: [] }
    : umProduto ? { estudos: RESPOSTA.estudos.filter((e) => e.produto === 'Sleep Base') }
    : RESPOSTA;
  const extras = comConcluido
    ? [{ id: 'e9', nome: 'Estudo pronto', recurso: 'Furadeira 03', produto: 'Sleep Base',
         analista: 'Oderli', total_operacoes: 2, total_observacoes: 40, status: 'concluido' }]
    : [];
  return new Response(JSON.stringify({ estudos: [...base.estudos, ...extras, ...restaurados] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};

// ?modo=analise no harness para inspecionar as duas variantes.
const modo = params.get('modo') || 'coleta';
createRoot(document.getElementById('raiz')).render(
  <ListaEstudos
    aoAbrir={(id) => { window.__aberto = id; }}
    modo={modo}
    aoTrocarModo={() => {}}
    aoSairDoSistema={comSair ? () => { window.__saiu = true; } : undefined}
  />,
);
