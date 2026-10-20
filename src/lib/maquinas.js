import { useSyncExternalStore } from 'react';
import { nomeChave } from '../domain/cronoanalise.js';
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

/** O cache guarda o cadastro INTEIRO: { maquinas, grupos, produtos }. Cache antigo
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
 * O cadastro INTEIRO ({ maquinas, grupos }), do mesmo cache. A Embalagem
 * Takt Time precisa do grupo — jornada e setup planejado — para calcular o
 * takt no proprio tablet, inclusive sem rede.
 */
const cadastroAtual = () => catalogo;
export function useCadastroMaquinas() {
  return useSyncExternalStore(assinar, cadastroAtual, cadastroAtual);
}

/**
 * Busca o cadastro no servidor e adota o que vier.
 *
 * Falha de rede nao propaga: sem cadastro a tela usa texto livre, que e'
 * exatamente o comportamento de sempre — nenhum erro a mostrar. Devolve o
 * cadastro que o SERVIDOR respondeu, ou null quando ele nao respondeu: a
 * Embalagem Takt Time precisa separar "sem rede" de "sem maquina
 * cadastrada", que pedem providencias de pessoas diferentes.
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

/**
 * Como foi a ULTIMA busca do cadastro: 'nunca' | 'buscando' | 'ok' |
 * 'falhou'. Lista vazia sozinha nao diz o que falta: "sem rede" e "a
 * empresa ainda nao cadastrou maquina" pedem providencias de pessoas
 * diferentes, e o aviso precisa saber qual das duas e'.
 */
let busca = 'nunca';
const ouvintesBusca = new Set();
function mudarBusca(nova) {
  if (nova === busca) return;
  busca = nova;
  ouvintesBusca.forEach((fn) => fn());
}
const buscaAtual = () => busca;
const assinarBusca = (fn) => { ouvintesBusca.add(fn); return () => ouvintesBusca.delete(fn); };
export function useBuscaDoCadastro() {
  return useSyncExternalStore(assinarBusca, buscaAtual, buscaAtual);
}

export async function carregarMaquinas() {
  if (emVoo) return emVoo;
  mudarBusca('buscando');
  emVoo = (async () => {
    try {
      const cadastro = await listarCadastroMaquinas();
      gravarCache(cadastro);
      publicar(cadastro);
      mudarBusca('ok');
      return cadastro;
    } catch {
      mudarBusca('falhou');
      return null;
    } finally {
      emVoo = null;
    }
  })();
  return emVoo;
}

/**
 * A MAQUINA do cadastro pelo nome, ou null quando o nome nao esta' la'.
 * Separa "maquina sem grupo" (achada, grupo_id nulo) de "posto fora do
 * cadastro" — o que inclui o nome ainda pela metade, durante a digitacao.
 */
export function maquinaDoCadastro(cadastro, nome) {
  if (!nome) return null;
  const chave = nomeChave(nome);
  return (cadastro?.maquinas || []).find((m) => m && nomeChave(m.nome) === chave) || null;
}

/**
 * O GRUPO de uma maquina, pelo NOME — e' o que a conferencia e o estudo
 * guardam. Mesma comparacao do relatorio (nomeChave): "furadeira 03" acha
 * "FURADEIRA 03". Nulo quando a maquina nao esta' no cadastro ou nao tem
 * grupo: ai' o tablet oferece so' o que vale para todos.
 */
export function grupoIdDaMaquina(cadastro, nome) {
  if (!nome) return null;
  const chave = nomeChave(nome);
  return (cadastro?.maquinas || []).find((m) => m && nomeChave(m.nome) === chave)?.grupo_id || null;
}

/**
 * Os PRODUTOS ativos de um grupo, na ordem do cadastro — o que o tablet
 * oferece no campo de produto. Sem grupo, nenhum: produto e' sempre de um
 * posto (o rack da embalagem nao e' a lateral da furadeira).
 */
export function produtosDoGrupo(cadastro, grupoId) {
  if (!grupoId) return [];
  return (cadastro?.produtos || []).filter((p) => p && p.ativo !== false && p.grupo_id === grupoId);
}

/** Adota um cadastro recem-salvo sem uma segunda ida ao servidor. */
export function adotarMaquinas(cadastro) {
  if (!cadastro || !Array.isArray(cadastro.maquinas)) return;
  gravarCache(cadastro);
  publicar(cadastro);
}
