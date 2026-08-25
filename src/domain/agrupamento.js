/**
 * Agrupamento de estudos por produto.
 *
 * O campo `produto` e' texto livre, digitado por pessoas diferentes em dias
 * diferentes. "SLEEP BASE", "Sleep Base" e " sleep base " sao o mesmo
 * produto e precisam cair no mesmo grupo — senao o agrupamento fragmenta
 * justamente onde deveria organizar.
 *
 * A chave normaliza; o rotulo exibido preserva a grafia mais usada, porque
 * corrigir o que a pessoa digitou seria pior que agrupar.
 */

const SEM_PRODUTO = '__sem_produto__';

/** Chave de comparacao: sem acento, sem caixa, sem espaco duplicado. */
export function chaveProduto(produto) {
  const s = (produto || '').trim();
  if (!s) return SEM_PRODUTO;
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export const ehSemProduto = (chave) => chave === SEM_PRODUTO;

/**
 * Agrupa estudos por produto, do grupo maior para o menor.
 *
 * Grupos maiores primeiro porque e' onde esta o trabalho: um produto com
 * oito estudos merece aparecer antes de um com um. "Sem produto" vai por
 * ultimo — e' pendencia de cadastro, nao categoria.
 */
export function agruparPorProduto(estudos) {
  const grupos = new Map();

  for (const estudo of estudos) {
    const chave = chaveProduto(estudo.produto);
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, rotulos: new Map(), estudos: [] });
    }
    const grupo = grupos.get(chave);
    grupo.estudos.push(estudo);

    // Conta as grafias para escolher a mais usada como rotulo.
    if (!ehSemProduto(chave)) {
      const grafia = String(estudo.produto).trim();
      grupo.rotulos.set(grafia, (grupo.rotulos.get(grafia) || 0) + 1);
    }
  }

  return [...grupos.values()]
    .map((g) => ({
      chave: g.chave,
      rotulo: ehSemProduto(g.chave) ? 'Sem produto informado' : grafiaMaisUsada(g.rotulos),
      semProduto: ehSemProduto(g.chave),
      estudos: g.estudos,
      totalCiclos: g.estudos.reduce((acc, e) => acc + (Number(e.total_observacoes) || 0), 0),
    }))
    .sort((a, b) => {
      // "Sem produto" sempre por ultimo, seja qual for o tamanho.
      if (a.semProduto !== b.semProduto) return a.semProduto ? 1 : -1;
      if (b.estudos.length !== a.estudos.length) return b.estudos.length - a.estudos.length;
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR');
    });
}

/**
 * Grafia com maiuscula E minuscula — "Sleep Base", nao "SLEEP BASE" nem
 * "sleep base". E' o que alguem digita com cuidado, e le melhor como titulo.
 */
const bemGrafado = (texto) => /[a-zà-ÿ]/.test(texto) && /[A-ZÀ-Ý]/.test(texto);

function grafiaMaisUsada(rotulos) {
  const candidatos = [...rotulos.entries()].map(([grafia, contagem]) => ({ grafia, contagem }));

  candidatos.sort((a, b) => {
    // 1. A grafia mais usada ganha: e' a convencao real da equipe.
    if (b.contagem !== a.contagem) return b.contagem - a.contagem;
    // 2. No empate, prefere a bem grafada — "SLEEP BASE" gritando num titulo
    //    e' pior que "Sleep Base", mesmo tendo sido digitada tantas vezes.
    const ba = bemGrafado(a.grafia);
    const bb = bemGrafado(b.grafia);
    if (ba !== bb) return ba ? -1 : 1;
    // 3. Criterio final estavel, para o rotulo nao mudar a cada carregamento.
    return a.grafia.localeCompare(b.grafia, 'pt-BR');
  });

  return candidatos[0]?.grafia || '';
}

/** Produtos ja usados, para sugerir no cadastro e evitar novas variantes. */
export function produtosConhecidos(estudos) {
  return agruparPorProduto(estudos)
    .filter((g) => !g.semProduto)
    .map((g) => g.rotulo);
}
