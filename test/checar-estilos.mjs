/**
 * Procura referencias a est.X que nao existem no objeto de estilos.
 * Uma chave inexistente nao lanca erro: o React so' ignora, e o elemento
 * aparece sem estilo nenhum. E' um bug silencioso — foi assim que dois
 * botoes ficaram com 21px de altura.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';

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

function conflitosShorthand(src, fonte = src) {
  const achados = [];

  for (const bloco of blocosDeEstilo(src)) {
    // Referencias a est.X dentro do bloco, em qualquer forma:
    // {...est.a, ...est.b} ou {...est.a, ...(cond ? est.b : {})}
    const refs = [...bloco.matchAll(/est\.([a-zA-Z0-9]+)/g)].map((m) => m[1]);
    if (refs.length < 1) continue;

    const corpos = refs.map((r) => ({ nome: r, corpo: corpoDoEstilo(fonte, r) }));
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

/**
 * Onde mora o objeto de estilos que vale para este arquivo.
 *
 * Ou ele declara o proprio `est` (o caso comum), ou importa um `est`
 * compartilhado de um modulo vizinho — e' assim que os quadros do
 * relatorio de conferencias dividem botao, tabela e janela sem cada um
 * carregar uma copia. Nesse caso as chaves sao conferidas contra o modulo
 * importado; sem isso, o arquivo que importa ficaria fora da verificacao
 * justamente por nao ter `const est =` — e o bug silencioso voltaria.
 */
function fonteDeEstilos(arq, src) {
  if (/const est\s*=|function estilos/.test(src)) return src;
  const m = /import\s*\{[^}]*\b(?:est|imp)\b[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/.exec(src);
  if (!m) return null;
  return readFileSync(join(dirname(arq), m[1]), 'utf8');
}

/**
 * As chaves de UM objeto de estilos (`const est = {` ou `const imp = {`),
 * so' as dele. Quando `est` e `imp` moram no mesmo modulo e os dois tem
 * `tabela`, `th` e `tdNum`, conferir `imp.tdNum` contra a uniao das chaves
 * deixaria passar um rename feito so' num dos lados — e a folha A4 e' onde
 * estilo quebrado menos se ve', porque so' aparece ao imprimir.
 * Sem o objeto (arquivo que declara `est` de outro jeito), devolve null e
 * a conferencia cai na uniao de todas as chaves do arquivo, como antes.
 */
function chavesDoObjeto(fonte, nome) {
  const m = new RegExp(`const ${nome}\\s*=\\s*\\{`).exec(fonte);
  if (!m) return null;
  let nivel = 0;
  const inicio = m.index + m[0].length - 1;
  for (let j = inicio; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}') {
      nivel--;
      if (nivel === 0) {
        const corpo = fonte.slice(inicio, j + 1);
        return new Set([...corpo.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):\s*\S/gm)].map((k) => k[1]));
      }
    }
  }
  return null;
}

let problemas = 0;
for (const arq of arquivos('src')) {
  const src = readFileSync(arq, 'utf8');
  const fonte = fonteDeEstilos(arq, src);
  if (!fonte) continue;

  // Chaves declaradas no(s) objeto(s) de estilo (nivel raso, com indentacao).
  const declaradas = new Set([...fonte.matchAll(/^\s{2,4}([a-zA-Z][a-zA-Z0-9]*):\s*\S/gm)].map((m) => m[1]));
  // Referencias est.X e imp.X no JSX, conferidas contra o objeto certo.
  const faltando = [];
  for (const objeto of ['est', 'imp']) {
    const usadas = new Set([...src.matchAll(new RegExp(`\\b${objeto}\\.([a-zA-Z][a-zA-Z0-9]*)`, 'g'))].map((m) => m[1]));
    const chaves = chavesDoObjeto(fonte, objeto) || declaradas;
    for (const k of usadas) if (!chaves.has(k)) faltando.push(`${objeto}.${k}`);
  }
  const conflitos = conflitosShorthand(src, fonte);
  // O fundo que nao cobre e' defeito do objeto, nao de quem o usa: e'
  // apontado uma vez, no arquivo que o declara.
  const descobertos = fonte === src ? fundoQueNaoCobre(src) : [];

  if (faltando.length || conflitos.length || descobertos.length) {
    problemas += faltando.length + conflitos.length + descobertos.length;
    console.log(`${arq}`);
    faltando.forEach((k) => console.log(`   ${k} usado mas nao definido`));
    conflitos.forEach((c) => console.log(`   ${c}`));
    descobertos.forEach((d) => console.log(`   ${d}`));
  }
}
console.log(problemas ? `\n${problemas} referencia(s) quebrada(s)` : '\nNenhuma referencia de estilo quebrada');
process.exit(problemas ? 1 : 0);
