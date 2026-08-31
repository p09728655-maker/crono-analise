import { useSyncExternalStore } from 'react';
import { listarCadastroMaquinas } from './api.js';

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

/** O cache guarda o cadastro INTEIRO: { maquinas, grupos }. Cache antigo
 *  (so' a lista) e formato invalido caem no vazio — texto livre. */
function lerCache() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE));
    return bruto && Array.isArray(bruto.maquinas) ? bruto : null;
  } catch { return null; }
}

function gravarCache(cadastro) {
  try { localStorage.setItem(CHAVE, JSON.stringify(cadastro)); } catch { /* segue sem cache */ }
}

// A guarda de `m` nao e' paranoia: um item null no cache (JSON truncado,
// gravacao interrompida) estourava TypeError no IMPORT do modulo — tela
// branca, sem mensagem, e o aparelho so' voltava limpando o storage.
const soAtivas = (cadastro) => (cadastro?.maquinas || []).filter((m) => m && m.ativa !== false);

let catalogo = lerCache() || { maquinas: [], grupos: [] };
// Guardada, nao filtrada a cada leitura: useSyncExternalStore compara por
// identidade, e um filter novo a cada snapshot faria a tela redesenhar em
// loop (a mesma armadilha documentada em motivosParada.js).
let ativas = soAtivas(catalogo);

const ouvintes = new Set();

function publicar(cadastro) {
  if (cadastro === catalogo) return;
  catalogo = cadastro;
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
/**
 * Uma busca de cada vez.
 *
 * O campo de maquina virou componente e agora vive em tres telas, cada uma
 * pedindo o cadastro ao montar — mais o StrictMode, que monta duas vezes em
 * desenvolvimento. Sem esta trava eram quatro idas ao servidor para abrir a
 * tela de medir. Quem chegar no meio de uma busca em curso espera a mesma.
 */
let emVoo = null;

export async function carregarMaquinas() {
  if (emVoo) return emVoo;
  emVoo = (async () => {
    try {
      const cadastro = await listarCadastroMaquinas();
      gravarCache(cadastro);
      publicar(cadastro);
      return cadastro;
    } catch {
      return catalogo;
    } finally {
      emVoo = null;
    }
  })();
  return emVoo;
}

/** Adota um cadastro recem-salvo sem uma segunda ida ao servidor. */
export function adotarMaquinas(cadastro) {
  if (!cadastro || !Array.isArray(cadastro.maquinas)) return;
  gravarCache(cadastro);
  publicar(cadastro);
}
