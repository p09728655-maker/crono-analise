/**
 * "Qual versao esta no ar AGORA?"
 *
 * O app aberto no tablet nao sabe que houve deploy: ele segue rodando o
 * bundle que baixou quando abriu. Num posto onde a tela fica aberta o dia
 * inteiro, isso significa trabalhar semanas numa versao antiga sem saber —
 * inclusive com bugs ja' corrigidos.
 *
 * O build publica `versao.json` (ver vite.config.js). Aqui a gente pergunta
 * por ele de tempos em tempos e compara com a versao deste bundle.
 */

/**
 * Decide se ha' o que avisar. Pura, para ser testavel.
 *
 * Compara por diferenca, nao por "maior": um rollback tambem muda o que
 * esta no ar, e continuar na versao retirada e' igualmente errado.
 */
export function precisaAtualizar(rodando, publicada) {
  if (!rodando || !publicada) return false;
  return rodando !== publicada;
}

/**
 * Le a versao publicada. Devolve null quando nao da' para saber — e'
 * silencio proposital: sem rede, com proxy no caminho ou em
 * desenvolvimento (onde o arquivo nem existe e o servidor devolve o
 * index.html), avisar seria pior que calar.
 */
export async function versaoPublicada() {
  try {
    // Sem cache: a pergunta so' faz sentido se a resposta for de agora.
    const r = await fetch('/versao.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const texto = await r.text();
    const dados = JSON.parse(texto);
    return typeof dados?.versao === 'string' ? dados.versao : null;
  } catch {
    return null;
  }
}
