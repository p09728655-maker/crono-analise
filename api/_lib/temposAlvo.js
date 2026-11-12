/**
 * OS TEMPOS-ALVO DO PAINEL (v2.106.0) — GET /api/maquinas?alvo=1.
 *
 * PPCP, 11/11/2026: o takt da semana julgava todo volume pelo mesmo numero
 * (jornada ÷ volumes programados): produto pesado saia sempre vermelho e o
 * leve sempre verde, pelo peso e nao pelo desempenho → "tempo-alvo de cada
 * produto". O tempo-alvo e' o tempo que CADA volume pode levar para a linha
 * fazer a media sem hora extra:
 *
 *   s por UEP   = (jornada 527 min − setup do ⚙ do painel) × 60 ÷ META UEP
 *   tempo-alvo  = s por UEP × UEP do volume (cadastro do painel)
 *
 * A conta mora no PAINEL (.gs v5.62, getTemposAlvo): e' la' que estao a UEP
 * de cada codigo, a META UEP e o setup — o app nao guarda copia de nada
 * disso. Aqui so' se le, confere o formato e guarda na memoria da instancia
 * (10 min; 1 min depois de falha), como o programa da planilha
 * (programaEmbalagem.js): o tablet pergunta muito, o painel e' lento.
 *
 * v2.107.0: junto vem o takt de cada semana em segundos por UEP (.gs v5.63),
 * para a linha "a semana pede X s" de cada produto (ver domain/tempoAlvo.js).
 *
 * Mora em /maquinas (?alvo=1) pela mesma razao da demanda: o plano Hobby da
 * Vercel aceita 12 funcoes e o projeto esta' nelas. Qualquer usuario logado
 * le (o tablet da embalagem precisa); nada e' gravado.
 */
import { frasePorFalha, lerDoPainel, PRAZO_PAINEL_MS } from './painel.js';
import { json, ErroHttp } from './http.js';

const INTERVALO_MS = 10 * 60000;
const INTERVALO_DEPOIS_DE_FALHA_MS = 60000;
const MAX_PRODUTOS = 5000;

export const MENSAGEM_ALVO_GS_ANTIGO = 'O painel ainda não tem o tempo-alvo: falta colar o .gs v5.62 no Apps Script e reimplantar.';

const positivo = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const naoNegativo = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

/**
 * O que o painel respondeu, conferido. ok com a regua e a lista; o .gs
 * antigo nao conhece a acao e cai no getDados (sem `produtos`): gs-antigo,
 * para a tela dizer o que falta em vez de "erro". O alvo vem em segundos
 * (duas casas) e vai em ms; produto sem UEP vai com alvoMs null, nunca 0.
 */
export function respostaDosAlvos(corpo) {
  const objeto = corpo && typeof corpo === 'object' && !Array.isArray(corpo);
  if (objeto && corpo.ok === true && Array.isArray(corpo.produtos) && corpo.ref && typeof corpo.ref === 'object') {
    const r = corpo.ref;
    const ref = {
      metaUep: positivo(r.metaUep),
      metaOrigem: r.metaOrigem === 'planilha' ? 'planilha' : 'padrao',
      setupsDia: naoNegativo(r.setupsDia),
      setupMin: naoNegativo(r.setupMin),
      setupOrigem: r.setupOrigem === 'planilha' ? 'planilha' : 'padrao',
      setupDia: naoNegativo(r.setupDia),
      minDia: positivo(r.minDia),
      minProd: positivo(r.minProd),
      sUep: positivo(r.sUep),
    };
    if (!ref.metaUep || !ref.sUep) {
      return { estado: 'erro', mensagem: 'O painel mandou os tempos-alvo sem a régua (META UEP e segundos por UEP).' };
    }
    const produtos = corpo.produtos.slice(0, MAX_PRODUTOS)
      .filter((p) => p && typeof p.rot === 'string' && p.rot.trim())
      .map((p) => {
        const alvo = positivo(p.alvo);
        return { rot: p.rot.trim().replace(/\s+/g, ' '), uep: positivo(p.uep), alvoMs: alvo ? Math.round(alvo * 1000) : null };
      });
    return { estado: 'ok', ref, produtos, semanas: semanasDoPainel(corpo.semanas) };
  }
  if (objeto && corpo.ok === false && corpo.erro) {
    return { estado: 'erro', mensagem: `O painel não montou os tempos-alvo: ${String(corpo.erro).slice(0, 300)}` };
  }
  return { estado: 'gs-antigo', mensagem: MENSAGEM_ALVO_GS_ANTIGO };
}

/**
 * O TAKT DE CADA SEMANA (.gs v5.63): a semana de hoje e as anteriores, com os
 * segundos por UEP que a programacao pede (sUep) e o quanto ela pede da media
 * (pede, %). Conferido: data dd/mm/aaaa, sUep > 0 ou null. O painel antes da
 * v5.63 nao manda: lista vazia, e a tela fica com o takt por volume de antes.
 */
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;
export function semanasDoPainel(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 26)
    .filter((w) => w && DATA_BR.test(String(w.de ?? '')) && DATA_BR.test(String(w.ate ?? '')))
    .map((w) => ({
      de: String(w.de), ate: String(w.ate), atual: w.atual === true,
      sUep: positivo(w.sUep), pede: positivo(w.pede), uep: naoNegativo(w.uep), nUteis: naoNegativo(w.nUteis),
    }));
}

/** Uma ida ao painel. Nunca lanca. */
export async function lerTemposAlvo({ url, buscar, prazoMs = PRAZO_PAINEL_MS } = {}) {
  const opcoes = { params: { action: 'getTemposAlvo' }, prazoMs };
  if (url !== undefined) opcoes.url = url;
  if (buscar) opcoes.buscar = buscar;
  const g = await lerDoPainel(opcoes);
  if (!g.falha) return respostaDosAlvos(g.corpo);
  return {
    estado: g.falha === 'desligado' ? 'desligado' : 'erro',
    mensagem: frasePorFalha(g, { prazoMs, depois: 'O app tenta de novo em 1 min.' }),
  };
}

let ultimaOk = null; // { quando, resultado } — a ultima leitura ok
let ultimaFalha = null; // { quando, resultado } — a ultima tentativa que falhou
let emAndamento = null;

/** So' para os testes. */
export function _esquecer() { ultimaOk = null; ultimaFalha = null; emAndamento = null; }

/**
 * A leitura guardada: 10 min com sucesso, 1 min depois de falha; dois
 * pedidos ao mesmo tempo fazem UMA ida ao painel.
 *
 * A FALHA NAO APAGA A ULTIMA OK (revisao de 11/11/2026): com o painel calado,
 * quem pergunta recebe a ultima leitura boa (com o lidoEm dela, para a tela
 * dizer a idade), e o painel e' tentado de novo a cada minuto. So' sem
 * nenhuma leitura ok a falha vai adiante, com o motivo.
 */
export async function temposAlvo({ agora = Date.now(), ler = lerTemposAlvo } = {}) {
  if (ultimaOk && agora - ultimaOk.quando < INTERVALO_MS) return ultimaOk.resultado;
  if (ultimaFalha && agora - ultimaFalha.quando < INTERVALO_DEPOIS_DE_FALHA_MS) {
    return ultimaOk ? ultimaOk.resultado : ultimaFalha.resultado;
  }
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    const r = await ler();
    const resultado = { ...r, lidoEm: new Date(agora).toISOString() };
    if (resultado.estado === 'ok') {
      ultimaOk = { quando: agora, resultado };
      ultimaFalha = null;
      return resultado;
    }
    ultimaFalha = { quando: agora, resultado };
    return ultimaOk ? ultimaOk.resultado : resultado;
  })().finally(() => { emAndamento = null; });
  return emAndamento;
}

/** A rota: GET, qualquer usuario logado; sempre 200 — o `estado` diz o resto. */
export async function rotaTemposAlvo(req, res) {
  if (req.method !== 'GET') throw new ErroHttp(405, 'Os tempos-alvo só se leem (GET).');
  return json(res, 200, await temposAlvo());
}
