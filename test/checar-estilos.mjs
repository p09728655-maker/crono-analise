/**
 * Procura referencias a est.X que nao existem no objeto de estilos.
 * Uma chave inexistente nao lanca erro: o React so' ignora, e o elemento
 * aparece sem estilo nenhum. E' um bug silencioso — foi assim que dois
 * botoes ficaram com 21px de altura.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.jsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

let problemas = 0;
for (const arq of arquivos('src')) {
  const src = readFileSync(arq, 'utf8');
  if (!/const est\s*=|function estilos/.test(src)) continue;

  // Chaves declaradas no(s) objeto(s) de estilo (nivel raso, com indentacao).
  const declaradas = new Set([...src.matchAll(/^\s{2,4}([a-zA-Z][a-zA-Z0-9]*):\s*\S/gm)].map((m) => m[1]));
  // Referencias est.X no JSX.
  const usadas = new Set([...src.matchAll(/\best\.([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1]));

  const faltando = [...usadas].filter((k) => !declaradas.has(k));
  if (faltando.length) {
    problemas += faltando.length;
    console.log(`${arq}`);
    faltando.forEach((k) => console.log(`   est.${k} usado mas nao definido`));
  }
}
console.log(problemas ? `\n${problemas} referencia(s) quebrada(s)` : '\nNenhuma referencia de estilo quebrada');
process.exit(problemas ? 1 : 0);
