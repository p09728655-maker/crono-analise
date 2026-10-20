/**
 * VOLUMES POR PRODUTO — quantos volumes fazem UM produto embalado.
 *
 * Na embalagem o tablet conta VOLUME (o rack de dois volumes conta dois),
 * e o estudo de tempos mede o PRODUTO. Para colocar a medicao da linha ao lado
 * do estudo e' preciso saber, produto a produto, quantos volumes ele tem.
 * O numero mora no cadastro de produtos (coluna `volumes`, 1 a 50, ou
 * NULL = "nao informado").
 *
 * A regra que sustenta o resto: VAZIO NUNCA VIRA 1. Supor um volume para
 * um rack de dois dobraria o ritmo medido em produtos e daria uma linha
 * folgada que nao existe. Sem o numero, quem chama mostra o que mediu em
 * volumes e pede o cadastro — nao converte.
 *
 * Puro: sem React, sem rede.
 */
import { nomeChave } from './crono/conferencia.js';

/** Teto do cadastro: o mesmo CHECK do banco. Acima disso e' erro de digitacao. */
export const VOLUMES_MAX = 50;

/**
 * Le o campo `volumes` como veio do servidor (ou do cache do tablet).
 *
 * So' inteiro de 1 a VOLUMES_MAX vale. `undefined` (cache de antes da
 * coluna existir), null, '', 0, 1.5, texto e booleano sao "nao informado"
 * — null, nunca 1.
 */
export function lerVolumes(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  if (typeof valor === 'string' && !valor.trim()) return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= VOLUMES_MAX ? n : null;
}

/**
 * Os volumes do produto, achado pelo NOME (nomeChave) na lista de produtos
 * do grupo do posto — e' o nome que o estudo e a medicao guardam, nao um id.
 *
 * Dois produtos com a mesma chave (o banco separa "Armário" de "Armario",
 * a tela nao) so' dao numero se concordarem: com 1 num e 2 no outro, nao ha'
 * como saber qual o analista quis, e escolher um seria inventar.
 *
 * PRODUTO DESATIVADO TAMBEM VALE. Desativar tira o produto da lista do
 * tablet (nao se mede mais), mas o estudo e as medicoes de antes continuam
 * sendo daquele rack — e o rack continua tendo dois volumes. Sem isto, a
 * analise de um estudo antigo perdia a conversao no dia em que alguem
 * desativou o produto. Quem chama passa a lista do grupo COM os inativos;
 * o ativo de mesmo nome manda quando existe (e' o cadastro de hoje), e o
 * inativo so' entra quando nao ha' ativo com aquele nome.
 */
export function volumesDoProduto(produtos, nome) {
  const chave = nomeChave(nome);
  if (!chave) return null;
  const doNome = (Array.isArray(produtos) ? produtos : [])
    .filter((p) => p && nomeChave(p.nome) === chave);
  const ativos = doNome.filter((p) => p.ativo !== false);
  const achados = (ativos.length ? ativos : doNome).map((p) => lerVolumes(p.volumes));
  if (!achados.length || achados.some((v) => v === null)) return null;
  return achados.every((v) => v === achados[0]) ? achados[0] : null;
}

/**
 * Quantas unidades CONTADAS no posto fazem um produto.
 *
 * `unidade` e' o que unidadeDoPosto devolve (ou so' o singular): na
 * 'volume' um produto = os volumes do produto; na 'peça', fator 1 — a
 * furadeira conta a propria peca do estudo. Volume sem volumes informados
 * devolve null: o chamador nao converte.
 */
export function contadasPorProduto(unidade, volumes) {
  const singular = typeof unidade === 'string' ? unidade : unidade?.singular;
  if (singular !== 'volume') return 1;
  return lerVolumes(volumes);
}
