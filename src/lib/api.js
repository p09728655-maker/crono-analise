/**
 * Cliente HTTP da API. Sincronizacao com retry e backoff exponencial.
 * Nunca lanca por falta de rede: quem chama decide o que fazer, e a fila
 * local ja' garantiu que o dado esta salvo.
 */
import { listarFila, removerDaFila } from './filaOffline.js';

const BASE = import.meta.env?.VITE_API_BASE || '/api';
const TOKEN = import.meta.env?.VITE_API_TOKEN || '';

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function requisitar(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: sinal,
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};
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
export const listarConferenciasServidor = (maquina) =>
  requisitar(`/conferencias${maquina ? `?maquina=${encodeURIComponent(maquina)}` : ''}`);
export const analisarComIa = (dados) => requisitar('/ai/analisar', { metodo: 'POST', corpo: dados });
export const obterConfigIa = () => requisitar('/config').then((r) => r.chaveIa);
export const salvarChaveIa = (chaveIa) =>
  requisitar('/config', { metodo: 'POST', corpo: { chaveIa } }).then((r) => r.chaveIa);

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
  salvoEm: x.salvoEm,
});
