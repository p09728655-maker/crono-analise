import { useSyncExternalStore } from 'react';
import { listarMaquinas } from './api.js';

/**
 * O cadastro de maquinas, do lado do navegador.
 *
 * Mesma receita do cadastro de motivos, pelo mesmo motivo: a tela do
 * Ritmo da furadeira roda num celular que perde rede, e a lista precisa
 * estar la' ANTES de o servidor responder. Ordem de consulta:
 *
 *   1. o cadastro ja' visto neste aparelho (localStorage);
 *   2. o servidor, assim que responder — o que vier vira o novo cache;
 *   3. lista vazia, quando nunca houve nem um nem outro — e ai' a tela
 *      volta ao campo de texto livre, como sempre foi.
 *
 * Diferenca deliberada dos motivos: nao ha' "maquinas de fabrica". Motivo
 * de parada e' universal; maquina e' de cada planta — inventar uma lista
 * padrao so' criaria lixo para apagar.
 */
const CHAVE = 'ritmopatrimar.maquinas';

function lerCache() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(bruto) ? bruto : null;
  } catch { return null; }
}

function gravarCache(maquinas) {
  try { localStorage.setItem(CHAVE, JSON.stringify(maquinas)); } catch { /* segue sem cache */ }
}

const soAtivas = (lista) => lista.filter((m) => m.ativa !== false);

let catalogo = lerCache() || [];
// Guardada, nao filtrada a cada leitura: useSyncExternalStore compara por
// identidade, e um filter novo a cada snapshot faria a tela redesenhar em
// loop (a mesma armadilha documentada em motivosParada.js).
let ativas = soAtivas(catalogo);

const ouvintes = new Set();

function publicar(maquinas) {
  if (maquinas === catalogo) return;
  catalogo = maquinas;
  ativas = soAtivas(catalogo);
  ouvintes.forEach((fn) => fn());
}

/** So' as que o celular deve oferecer: desativada nomeia o passado. */
export const maquinasAtivas = () => ativas;

const assinar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };

/** Hook da lista ATIVA — o que a tela de conferencia oferece. */
export function useMaquinas() {
  return useSyncExternalStore(assinar, maquinasAtivas, maquinasAtivas);
}

/**
 * Busca o cadastro no servidor e adota o que vier.
 *
 * Falha de rede nao propaga: sem cadastro a tela usa texto livre, que e'
 * exatamente o comportamento de sempre — nenhum erro a mostrar.
 */
export async function carregarMaquinas() {
  try {
    const maquinas = await listarMaquinas();
    gravarCache(maquinas);
    publicar(maquinas);
    return maquinas;
  } catch {
    return catalogo;
  }
}

/** Adota uma lista recem-salva sem uma segunda ida ao servidor. */
export function adotarMaquinas(maquinas) {
  if (!Array.isArray(maquinas)) return;
  gravarCache(maquinas);
  publicar(maquinas);
}
