import { useSyncExternalStore } from 'react';
import { MOTIVOS_PARADA, definirCatalogoParadas } from '../domain/cronoanalise.js';
import { listarMotivosParada } from './api.js';

/**
 * O cadastro de motivos de parada, do lado do navegador.
 *
 * A tela de coleta precisa da lista para perguntar "por que parou?" — e ela
 * roda num tablet que perde wifi o tempo todo. Entao a ordem de consulta e':
 *
 *   1. o cadastro que ja' foi visto neste aparelho (localStorage);
 *   2. o servidor, assim que responder — e o que vier vira o novo cache;
 *   3. os motivos de fabrica, quando nunca houve nem um nem outro.
 *
 * Nunca ha' estado de "carregando": a coleta abre com a melhor lista
 * disponivel e se corrige sozinha quando a rede responde. Esperar o
 * servidor para oferecer um botao de parada seria trocar um problema real
 * (lista desatualizada por alguns segundos) por um pior (operador diante da
 * maquina parada, sem onde tocar).
 *
 * O cadastro tambem alimenta o CALCULO: definirCatalogoParadas leva a lista
 * para o dominio, que e' quem resolve nome e acao de cada motivo no
 * relatorio e nas sugestoes.
 */
const CHAVE = 'ritmopatrimar.motivos-parada';

function lerCache() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(bruto) && bruto.length ? bruto : null;
  } catch { return null; }
}

function gravarCache(motivos) {
  try { localStorage.setItem(CHAVE, JSON.stringify(motivos)); } catch { /* segue sem cache */ }
}

const soAtivos = (lista) => lista.filter((m) => m.ativo !== false);

let catalogo = lerCache() || MOTIVOS_PARADA;
/**
 * A lista ativa fica GUARDADA, nao e' filtrada a cada leitura.
 *
 * useSyncExternalStore compara o retorno de getSnapshot por identidade:
 * devolver `catalogo.filter(...)` produz um array novo toda vez, o React
 * conclui que a loja mudou, redesenha, le de novo — e o app trava com
 * "Maximum update depth exceeded". A lista so' e' refiltrada quando o
 * catalogo de fato troca.
 */
let ativos = soAtivos(catalogo);
definirCatalogoParadas(catalogo);

const ouvintes = new Set();

function publicar(motivos) {
  // Mesma referencia = nada mudou: trocar por uma lista nova identica so'
  // faria a tela de coleta redesenhar sem motivo.
  if (motivos === catalogo) return;
  catalogo = motivos;
  ativos = soAtivos(catalogo);
  definirCatalogoParadas(catalogo);
  ouvintes.forEach((fn) => fn());
}

/** Os motivos em vigor — para quem le fora do React. */
export const motivosEmVigor = () => catalogo;

/** Só os que a coleta deve oferecer: desativado nomeia o passado, não o futuro. */
export const motivosAtivos = () => ativos;

const assinar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

/** Hook da lista ATIVA — o que uma tela de coleta oferece. */
export function useMotivosParada() {
  return useSyncExternalStore(assinar, motivosAtivos, motivosAtivos);
}

/**
 * Busca o cadastro no servidor e adota o que vier.
 *
 * Falha de rede nao propaga: o app ja' tem uma lista boa o suficiente, e
 * uma tela de erro sobre motivo de parada atrapalharia quem so' quer
 * cronometrar. Cadastro vazio no servidor mantem os motivos de fabrica —
 * e' o estado de quem ainda nao cadastrou nada.
 */
export async function carregarMotivos() {
  try {
    const motivos = await listarMotivosParada();
    if (motivos.length) {
      gravarCache(motivos);
      publicar(motivos);
    }
    return motivos;
  } catch {
    return catalogo;
  }
}

/**
 * O codigo a usar num botao de atalho ("+ Setup / troca").
 *
 * Os atalhos nasceram apontando para codigos fixos, de quando a lista era
 * do codigo. Com o cadastro na mao da fabrica, `setup` pode ter sido
 * desativado — e o atalho criaria uma parada com motivo que a lista de
 * escolha nem oferece. Some o preferido quando ele sumiu: cai no primeiro
 * motivo cadastrado, que e' o que o analista ve' selecionado.
 */
export function codigoPreferido(motivos, preferido) {
  if (motivos.some((m) => m.codigo === preferido)) return preferido;
  return motivos[0]?.codigo || preferido;
}

/** Adota uma lista recem-salva sem uma segunda ida ao servidor. */
export function adotarMotivos(motivos) {
  if (!Array.isArray(motivos)) return;
  if (motivos.length) gravarCache(motivos);
  publicar(motivos.length ? motivos : MOTIVOS_PARADA);
}
