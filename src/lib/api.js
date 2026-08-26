/**
 * Cliente HTTP da API. Sincronizacao com retry e backoff exponencial.
 * Nunca lanca por falta de rede: quem chama decide o que fazer, e a fila
 * local ja' garantiu que o dado esta salvo.
 */
import { listarFila, removerDaFila } from './filaOffline.js';
import {
  ErroDeEntrada, adotarCredencialDoAparelho, entrarComEmail, sairDaConta, tokenDeAcesso,
} from './supabase.js';

const BASE = import.meta.env?.VITE_API_BASE || '/api';

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function requisitar(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  // O token do Supabase e' quem abre a API agora — do analista que entrou
  // no PC ou do tablet pareado. Nenhum segredo mora mais no bundle: sem
  // sessao, a requisicao vai sem Authorization e volta 401.
  const jwt = await tokenDeAcesso();
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: sinal,
  });

  const texto = await resposta.text();

  // Nem toda resposta e' JSON: quando a funcao estoura o tempo, a Vercel
  // devolve uma pagina de erro em TEXTO. Fazer JSON.parse nela produzia
  // "Unexpected token 'A'..." na tela do analista — mensagem que nao diz
  // nada sobre o que aconteceu nem sobre o que fazer.
  let dados = {};
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      if (resposta.status === 504 || /timeout|timed out/i.test(texto)) {
        throw new ErroApi(504, 'O servidor demorou demais para responder. Tente de novo.');
      }
      throw new ErroApi(
        resposta.status,
        resposta.ok
          ? 'Resposta inesperada do servidor.'
          : `Falha no servidor (${resposta.status}). Tente de novo em alguns instantes.`,
      );
    }
  }

  if (!resposta.ok) throw new ErroApi(resposta.status, dados.erro || 'Falha na requisicao', dados.detalhes);
  return dados;
}

export const listarEstudos = () => requisitar('/estudos');
export const listarArquivados = () => requisitar('/estudos?arquivados=1');
export const restaurarEstudo = (id) =>
  requisitar(`/estudos?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: { status: 'coletando' } });
export const obterEstudo = (id) => requisitar(`/estudos?id=${encodeURIComponent(id)}`);
export const criarEstudo = (dados) => requisitar('/estudos', { metodo: 'POST', corpo: dados });
export const atualizarEstudo = (id, dados) =>
  requisitar(`/estudos?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: dados });
export const removerEstudo = (id) =>
  requisitar(`/estudos?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });
export const criarOperacao = (dados) => requisitar('/operacoes', { metodo: 'POST', corpo: dados });
export const atualizarOperacao = (id, dados) =>
  requisitar(`/operacoes?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: dados });
export const removerOperacao = (id) =>
  requisitar(`/operacoes?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });
// "Servidor" no nome de proposito: lib/conferencias.js tem o listar LOCAL
// (a memoria do aparelho) e os dois convivem no mesmo app.
export const listarConferenciasServidor = ({ maquina, arquivadas = false } = {}) => {
  const q = new URLSearchParams();
  if (maquina) q.set('maquina', maquina);
  if (arquivadas) q.set('arquivadas', '1');
  const busca = q.toString();
  return requisitar(`/conferencias${busca ? `?${busca}` : ''}`);
};
export const arquivarConferencia = (id, arquivada = true) =>
  requisitar(`/conferencias?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: { arquivada } });
// Paradas cadastradas no PC (setup marcado depois, olhando o apontamento).
// A lista vai INTEIRA — e' o estado final das paradas daquela conferencia,
// nao um acrescimo: assim corrigir e apagar usam o mesmo caminho.
export const salvarParadasConferencia = (id, paradas) =>
  requisitar(`/conferencias?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: { paradas } });
export const excluirConferencia = (id) =>
  requisitar(`/conferencias?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });
export const analisarConferenciasComIa = (dados) =>
  requisitar('/ai/analisar', { metodo: 'POST', corpo: dados });
export const analisarComIa = (dados) => requisitar('/ai/analisar', { metodo: 'POST', corpo: dados });
export const obterConfigIa = () => requisitar('/config').then((r) => r.chaveIa);
export const salvarChaveIa = (chaveIa) =>
  requisitar('/config', { metodo: 'POST', corpo: { chaveIa } }).then((r) => r.chaveIa);
// Apaga a chave salva no servidor. Se houver ANTHROPIC_API_KEY no ambiente,
// ela reassume — e' a configuracao do administrador, e o app nao a remove.
export const removerChaveIa = () =>
  requisitar('/config', { metodo: 'DELETE' }).then((r) => r.chaveIa);

/* ------------------------------------------- cadastro de motivos de parada */
export const listarMotivosParada = () => requisitar('/motivos-parada').then((r) => r.motivos || []);
export const criarMotivoParada = (dados) =>
  requisitar('/motivos-parada', { metodo: 'POST', corpo: dados }).then((r) => r.motivo);
// Carga inicial: grava de uma vez os motivos que o app ja' usava, para o
// cadastro nao comecar em branco pedindo redigitacao do que ja' existia.
export const semearMotivosParada = (motivos) =>
  requisitar('/motivos-parada', { metodo: 'POST', corpo: { motivos } }).then((r) => r.motivos || []);
export const atualizarMotivoParada = (id, dados) =>
  requisitar(`/motivos-parada?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: dados })
    .then((r) => r.motivo);
// A ordem vai INTEIRA numa chamada so': trocar dois vizinhos com dois PATCH
// deixaria a lista torta se o segundo falhasse.
export const ordenarMotivosParada = (ids) =>
  requisitar('/motivos-parada', { metodo: 'PATCH', corpo: { ordem: ids } }).then((r) => r.motivos || []);
export const removerMotivoParada = (id) =>
  requisitar(`/motivos-parada?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });

/* ------------------------------------------ analistas e identificacao */
export const listarUsuarios = () => requisitar('/usuarios').then((r) => r.usuarios || []);
export const criarUsuario = (dados) =>
  requisitar('/usuarios', { metodo: 'POST', corpo: dados }).then((r) => r.usuario);
export const atualizarUsuario = (id, dados) =>
  requisitar(`/usuarios?id=${encodeURIComponent(id)}`, { metodo: 'PATCH', corpo: dados })
    .then((r) => r.usuario);
export const removerUsuario = (id) =>
  requisitar(`/usuarios?id=${encodeURIComponent(id)}`, { metodo: 'DELETE' });

// Sem sessao o /sessao responde 401 — que aqui significa "ninguem", nao erro.
export const quemSouEu = () => requisitar('/sessao').then((r) => r.usuario)
  .catch((e) => { if (e instanceof ErroApi && e.status === 401) return null; throw e; });

/**
 * Entrar e sair falam com o SUPABASE, nao com a nossa API: e' ele quem
 * guarda senha e sessao. O que muda para quem chama e' nada — mesmos nomes,
 * mesmo contrato de sempre.
 */
export const entrar = async (email, senha) => {
  try {
    await entrarComEmail(email, senha);
  } catch (e) {
    throw e instanceof ErroDeEntrada ? new ErroApi(401, e.message) : e;
  }
  return quemSouEu();
};
export const sair = () => sairDaConta();

/* ---------------------------------------------- pareamento do tablet */
export const gerarCodigoPareamento = () =>
  requisitar('/dispositivos', { metodo: 'POST', corpo: { acao: 'codigo' } });

/** Troca o codigo pela credencial do aparelho e ja' entra com ela. */
export const parearAparelho = async (codigo, nome) => {
  const r = await requisitar('/dispositivos', { metodo: 'POST', corpo: { codigo, nome } });
  await adotarCredencialDoAparelho({ email: r.email, senha: r.senha });
  return r.dispositivo;
};

const LOTE = 200;
const TENTATIVAS = 4;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Envia a fila local para o servidor.
 *
 * Um 4xx (dado invalido) NAO e' retentado: reenviar nao vai consertar o
 * payload e travaria a fila para sempre. Falha de rede e 5xx sao retentados
 * com backoff exponencial.
 */
export async function sincronizar({ aoProgresso } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { enviados: 0, offline: true };
  }

  const fila = await listarFila();
  if (!fila.length) return { enviados: 0, offline: false };

  let enviados = 0;

  for (let i = 0; i < fila.length; i += LOTE) {
    const fatia = fila.slice(i, i + LOTE);
    const corpo = {
      observacoes: fatia.filter((x) => x.tipo === 'observacao').map(paraObservacao),
      paradas: fatia.filter((x) => x.tipo === 'parada').map(paraParada),
      conferencias: fatia.filter((x) => x.tipo === 'conferencia').map(paraConferencia),
    };

    let ultimoErro = null;
    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
      try {
        const r = await requisitar('/sync', { metodo: 'POST', corpo });
        // Limpa tudo que o servidor confirmou — inclusive duplicados ja'
        // existentes la'. Item confirmado nao pode continuar na fila.
        await removerDaFila(r.clientIds || []);
        enviados += fatia.length;
        aoProgresso?.({ enviados, total: fila.length });
        ultimoErro = null;
        break;
      } catch (err) {
        ultimoErro = err;
        if (err instanceof ErroApi && err.status >= 400 && err.status < 500) throw err;
        if (tentativa < TENTATIVAS - 1) await espera(2 ** tentativa * 1000);
      }
    }
    if (ultimoErro) throw ultimoErro;
  }

  return { enviados, offline: false };
}

const paraObservacao = (x) => ({
  clientId: x.clientId,
  operacaoId: x.operacaoId,
  duracaoMs: x.duracaoMs,
  rodada: x.rodada ?? 1,
  coletadoEm: x.coletadoEm,
});

const paraParada = (x) => ({
  clientId: x.clientId,
  operacaoId: x.operacaoId,
  motivo: x.motivo,
  observacao: x.observacao ?? null,
  duracaoMs: x.duracaoMs,
  iniciadoEm: x.iniciadoEm,
});

const paraConferencia = (x) => ({
  clientId: x.clientId,
  maquina: x.maquina ?? null,
  peca: x.peca ?? null,
  horaInicial: x.horaInicial ?? null,
  horaFinal: x.horaFinal ?? null,
  duracaoMs: x.duracaoMs,
  pecas: x.pecas,
  // Paradas do periodo. Conferencia enfileirada antes desta versao nao tem
  // o campo — vai como lista vazia e continua valendo.
  paradas: (x.paradas || []).map((p) => ({
    motivo: p.motivo,
    duracaoMs: Math.round(p.duracaoMs),
    observacao: p.observacao ?? null,
  })),
  salvoEm: x.salvoEm,
});
