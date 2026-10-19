/**
 * IMPRIMIR COM NOME DE ARQUIVO.
 *
 * O "Salvar como PDF" do navegador usa o TITULO DA PAGINA como nome do
 * arquivo. Sem isto toda folha saia "RitmoPatrimar — Estudo de Tempos.pdf",
 * e a pasta do PCP virava uma fila de arquivos iguais que so' se distinguem
 * abrindo um por um.
 *
 * O titulo troca so' durante a impressao e volta no `afterprint` — a aba do
 * navegador e o historico continuam com o nome do sistema.
 */

/** Caracteres que o Windows nao aceita em nome de arquivo. */
const PROIBIDOS = /[\\/:*?"<>|]+/g;

/**
 * O nome do arquivo a partir das partes, na ordem: vazias saem, o que o
 * Windows recusa vira hifen, espaco repetido vira um so'.
 */
export function nomeDoArquivo(...partes) {
  return partes
    .map((p) => String(p ?? '').replace(PROIBIDOS, '-').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' - ');
}

/** Data e hora como cabem num nome de arquivo: "19-10-2026 13h36". */
export function dataDoArquivo(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}-${dois(d.getMonth() + 1)}-${d.getFullYear()} ${dois(d.getHours())}h${dois(d.getMinutes())}`;
}

export function imprimirComo(nome) {
  const anterior = document.title;
  const voltar = () => {
    document.title = anterior;
    window.removeEventListener('afterprint', voltar);
  };
  window.addEventListener('afterprint', voltar);
  document.title = nome || anterior;
  window.print();
}
