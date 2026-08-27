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

/**
 * Conflitos de shorthand com longhand.
 *
 * Um objeto base com `borderBottom: '2px solid X'` e uma variante espalhada
 * por cima com `borderBottomColor: Y` produzem estilo imprevisivel no
 * rerender — o React avisa no console e a borda pode sumir. Nao quebra o
 * build nem falha em teste. Ja aconteceu duas vezes neste projeto.
 *
 * A deteccao olha o ponto onde o problema de fato acontece: a MISTURA em
 * JSX, do tipo {...est.aba, ...est.abaAtiva} ou {...est.faixa, borderColor}.
 * Procurar shorthand e longhand soltos pelo arquivo inteiro gera dezenas de
 * falsos positivos — objetos que nunca se encontram.
 */
const PARES = [
  ['border', ['borderColor', 'borderWidth', 'borderStyle']],
  ['borderBottom', ['borderBottomColor', 'borderBottomWidth', 'borderBottomStyle']],
  ['borderTop', ['borderTopColor', 'borderTopWidth', 'borderTopStyle']],
  ['borderLeft', ['borderLeftColor', 'borderLeftWidth', 'borderLeftStyle']],
  ['borderRight', ['borderRightColor', 'borderRightWidth', 'borderRightStyle']],
];

/** Corpo de uma chave do objeto de estilos, para inspecionar o que declara. */
function corpoDoEstilo(src, chave) {
  const re = new RegExp(`^\\s{2,4}${chave}:\\s*\\{`, 'm');
  const m = re.exec(src);
  if (!m) return '';
  let i = m.index + m[0].length - 1;
  let nivel = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') nivel++;
    else if (src[j] === '}') { nivel--; if (nivel === 0) return src.slice(i, j + 1); }
  }
  return '';
}

/** Extrai cada bloco style={{ ... }} respeitando chaves aninhadas. */
function blocosDeEstilo(src) {
  const blocos = [];
  const marca = 'style={{';
  let i = src.indexOf(marca);
  while (i !== -1) {
    let nivel = 0;
    for (let j = i + marca.length - 2; j < src.length; j++) {
      if (src[j] === '{') nivel++;
      else if (src[j] === '}') {
        nivel--;
        if (nivel === 0) { blocos.push(src.slice(i, j + 1)); i = src.indexOf(marca, j); break; }
      }
    }
    if (nivel !== 0) break;
  }
  return blocos;
}

function conflitosShorthand(src) {
  const achados = [];

  for (const bloco of blocosDeEstilo(src)) {
    // Referencias a est.X dentro do bloco, em qualquer forma:
    // {...est.a, ...est.b} ou {...est.a, ...(cond ? est.b : {})}
    const refs = [...bloco.matchAll(/est\.([a-zA-Z0-9]+)/g)].map((m) => m[1]);
    if (refs.length < 1) continue;

    const corpos = refs.map((r) => ({ nome: r, corpo: corpoDoEstilo(src, r) }));
    // Props escritas direto no bloco tambem contam como longhand aplicado.
    const direto = bloco.replace(/est\.[a-zA-Z0-9]+/g, '');

    for (const [curto, longos] of PARES) {
      const comCurto = corpos.filter((c) => new RegExp(`\\b${curto}:\\s*[\`'"]`).test(c.corpo));
      if (!comCurto.length) continue;

      for (const longo of longos) {
        const fontes = corpos
          .filter((c) => new RegExp(`\\b${longo}:`).test(c.corpo))
          .map((c) => `est.${c.nome}`);
        if (new RegExp(`\\b${longo}:`).test(direto)) fontes.push('prop direta');

        // So' e' conflito se o longhand vier de OUTRA fonte que nao a que
        // declara a shorthand — o mesmo objeto consigo mesmo nao mistura.
        const outras = fontes.filter((f) => !comCurto.some((c) => f === `est.${c.nome}`));
        if (outras.length) {
          achados.push(
            `est.${comCurto[0].nome} declara ${curto} (shorthand) e ${outras[0]} aplica ${longo} (longhand)`,
          );
        }
      }
    }
  }
  return [...new Set(achados)];
}

/**
 * Tela de fundo proprio que NAO cobre a janela.
 *
 * O body e' escuro (#14171A, a paleta da coleta). Toda tela clara pinta o
 * proprio fundo por cima — e se ela para antes do rodape, o que sobra da
 * janela fica preto. Foi assim que "Carregando estudo..." da analise, com
 * minHeight de 60vh, mostrava um tercos de tela preta embaixo do texto: o
 * usuario clicava em Analisar e via a tela ficar preta.
 *
 * A regra: quem declara `background` e mede a altura em unidade de
 * viewport tem de chegar a 100. Altura em px, %, ou sem fundo proprio,
 * nao entra — sao blocos DENTRO de uma tela, e o fundo ja' e' de quem
 * os contem. `maxHeight` tambem nao: e' teto de rolagem, nao piso de tela.
 */
function fundoQueNaoCobre(src) {
  const achados = [];
  for (const m of src.matchAll(/^\s{2,4}([a-zA-Z][a-zA-Z0-9]*):\s*\{/gm)) {
    const corpo = corpoDoEstilo(src, m[1]);
    if (!/\bbackground(?:Color)?:/.test(corpo)) continue;
    const altura = /\bminHeight:\s*['"`](\d+(?:\.\d+)?)(dvh|vh|svh|lvh)['"`]/.exec(corpo);
    if (altura && Number(altura[1]) < 100) {
      achados.push(`est.${m[1]} pinta fundo mas so' vai ate ${altura[1]}${altura[2]} — o resto da janela fica com o fundo escuro do body`);
    }
  }
  return achados;
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
  const conflitos = conflitosShorthand(src);
  const descobertos = fundoQueNaoCobre(src);

  if (faltando.length || conflitos.length || descobertos.length) {
    problemas += faltando.length + conflitos.length + descobertos.length;
    console.log(`${arq}`);
    faltando.forEach((k) => console.log(`   est.${k} usado mas nao definido`));
    conflitos.forEach((c) => console.log(`   ${c}`));
    descobertos.forEach((d) => console.log(`   ${d}`));
  }
}
console.log(problemas ? `\n${problemas} referencia(s) quebrada(s)` : '\nNenhuma referencia de estilo quebrada');
process.exit(problemas ? 1 : 0);
