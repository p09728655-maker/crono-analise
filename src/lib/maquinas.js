import { useSyncExternalStore } from 'react';
import { nomeChave } from '../domain/cronoanalise.js';
import { ErroApi, criarProduto, listarCadastroMaquinas } from './api.js';

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

/**
 * O produto que JA' esta' no cadastro do grupo com este nome — ativo ou
 * desativado —, pela comparacao do relatorio (nomeChave: sem caixa, sem
 * acento, sem espaco a mais). "rack sirius 1.6" digitado no tablet acha o
 * "Rack Sirius 1.6" da lista em vez de nascer um segundo.
 */
export function produtoDoCadastro(cadastro, grupoId, nome) {
  const chave = nomeChave(nome);
  if (!grupoId || !chave) return null;
  return (cadastro?.produtos || [])
    .find((p) => p && p.grupo_id === grupoId && nomeChave(p.nome) === chave) || null;
}

const SEM_REDE = 'Sem rede: o produto não foi cadastrado. O nome segue nesta medição como texto; '
  + 'cadastre quando houver rede.';

/**
 * CADASTRA O PRODUTO PELO TABLET, antes de medir (v2.97.0).
 *
 * O produto que nao estava na lista virava texto livre: ia so' naquela
 * medicao, nao voltava para a lista e a proxima pessoa escrevia de outro
 * jeito. Cadastrado aqui, ele entra no cadastro do GRUPO da maquina (o
 * mesmo do PC) e na lista deste aparelho na hora, sem esperar outra busca.
 *
 * Nome que ja' esta' no cadastro nao vai ao servidor: e' escolhido. O
 * desativado pelo PCP tambem nao — reativar e' decisao do PC. Nunca lanca;
 * devolve o que a tela precisa dizer:
 *   { estado: 'ok', produto, novo }   cadastrado agora (novo) ou ja' ativo
 *   { estado: 'desativado', produto } esta' no cadastro, desativado
 *   { estado: 'erro', mensagem }      sem rede, sem permissao, recusado
 */
export async function cadastrarProduto({ nome, grupoId }) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo || !grupoId) return { estado: 'erro', mensagem: 'Digite o nome do produto.' };
  const conhecido = (cadastro) => {
    const p = produtoDoCadastro(cadastro, grupoId, limpo);
    if (!p) return null;
    return p.ativo === false ? { estado: 'desativado', produto: p } : { estado: 'ok', produto: p, novo: false };
  };
  const jaTem = conhecido(catalogo);
  if (jaTem) return jaTem;
  /* O cadastro de AGORA antes de criar: o guardado no aparelho pode ser de
     horas atras, e outro tablet pode ter cadastrado o mesmo produto. Tambem
     espera a busca que ja' estiver no ar — a resposta dela, chegando depois
     do POST, publicaria a lista sem o produto recem-criado. Sem rede, a
     busca falha calada e o POST abaixo da' o aviso. */
  const atual = await carregarMaquinas();
  const doServidor = atual && conhecido(atual);
  if (doServidor) return doServidor;
  try {
    const produto = await criarProduto({ nome: limpo, grupoId });
    // Na lista deste aparelho ja': escolher o recem-cadastrado nao pode
    // depender de outra ida ao servidor (nem de rede, nas proximas).
    const cadastro = { ...catalogo, produtos: [...(catalogo.produtos || []), produto] };
    gravarCache(cadastro);
    publicar(cadastro);
    return { estado: 'ok', produto, novo: true };
  } catch (e) {
    if (!(e instanceof ErroApi)) return { estado: 'erro', mensagem: SEM_REDE };
    // 409: outro tablet (ou o PC) cadastrou o mesmo nome entre a busca e o
    // POST. Buscado o cadastro, ele e' o que se escolhe.
    if (e.status === 409) {
      const depois = await carregarMaquinas();
      const achado = depois && conhecido(depois);
      if (achado) return achado;
    }
    return { estado: 'erro', mensagem: e.message };
  }
}

/** Adota um cadastro recem-salvo sem uma segunda ida ao servidor. */
export function adotarMaquinas(cadastro) {
  if (!cadastro || !Array.isArray(cadastro.maquinas)) return;
  gravarCache(cadastro);
  publicar(cadastro);
}
