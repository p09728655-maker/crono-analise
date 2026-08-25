/**
 * Extracao de texto de PDF no navegador, sem biblioteca.
 *
 * O objetivo NAO e' ler qualquer PDF do mundo — e' ler o relatorio
 * "Processos de Producao" que o ERP Logica gera (Aspose.Pdf, PDF 1.7,
 * xref classico, fontes Identity-H com ToUnicode). Para esse formato,
 * ~200 linhas resolvem; a alternativa (pdf.js) custa mais de 1 MB de
 * bundle para o celular do chao de fabrica baixar.
 *
 * A descompressao FlateDecode usa DecompressionStream('deflate'), nativo
 * do navegador (e do Node 18+), por isso nao ha dependencia nenhuma.
 *
 * PDFs fora desse perfil (criptografados, xref em stream comprimido)
 * falham com erro claro — melhor recusar do que importar dado errado.
 */

/** Bytes -> string latin1 (1 byte = 1 char), para varrer a estrutura. */
function paraLatin1(bytes) {
  let s = '';
  const PASSO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASSO) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + PASSO));
  }
  return s;
}

/** Inflate de um stream FlateDecode (formato zlib). */
async function inflar(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/**
 * Varre `N 0 obj ... endobj` do arquivo inteiro, sem depender da tabela
 * xref. O corpo de um stream e' delimitado pelo /Length do dicionario —
 * nunca por busca textual, porque dado binario pode conter "endobj".
 */
function mapearObjetos(texto) {
  const objetos = new Map();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(texto))) {
    const num = Number(m[1]);
    let pos = re.lastIndex;
    while (pos < texto.length && /\s/.test(texto[pos])) pos++;

    let dicionario = '';
    if (texto.startsWith('<<', pos)) {
      const fim = fimDoDicionario(texto, pos);
      dicionario = texto.slice(pos, fim);
      pos = fim;
    } else {
      // Objeto simples (um numero, um array): vai ate' o endobj.
      const fim = texto.indexOf('endobj', pos);
      dicionario = texto.slice(pos, fim < 0 ? pos : fim).trim();
      objetos.set(num, { dicionario, inicioStream: -1, num });
      continue;
    }

    while (pos < texto.length && /\s/.test(texto[pos])) pos++;
    let inicioStream = -1;
    if (texto.startsWith('stream', pos)) {
      pos += 'stream'.length;
      if (texto[pos] === '\r') pos++;
      if (texto[pos] === '\n') pos++;
      inicioStream = pos;
    }
    objetos.set(num, { dicionario, inicioStream, num });
  }
  return objetos;
}

/** Avanca do `<<` inicial ate' depois do `>>` correspondente. */
function fimDoDicionario(texto, pos) {
  let nivel = 0;
  let i = pos;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '<' && texto[i + 1] === '<') { nivel++; i += 2; continue; }
    if (c === '>' && texto[i + 1] === '>') { nivel--; i += 2; if (!nivel) return i; continue; }
    if (c === '(') { i = fimDaStringLiteral(texto, i); continue; }
    i++;
  }
  return i;
}

/** Avanca do `(` inicial ate' depois do `)` correspondente, honrando `\`. */
function fimDaStringLiteral(texto, pos) {
  let nivel = 0;
  let i = pos;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '(') nivel++;
    if (c === ')') { nivel--; if (!nivel) return i + 1; }
    i++;
  }
  return i;
}

/** Le uma referencia `/Chave 12 0 R` do dicionario. */
const referencia = (dic, chave) => {
  const m = new RegExp(`\\/${chave}\\s+(\\d+)\\s+0\\s+R`).exec(dic);
  return m ? Number(m[1]) : null;
};

/** Le um inteiro direto `/Chave 123` do dicionario. */
const inteiroDireto = (dic, chave) => {
  const m = new RegExp(`\\/${chave}\\s+(\\d+)(?![\\d\\s]*0\\s+R)`).exec(dic);
  return m ? Number(m[1]) : null;
};

/** Conteudo (ja descomprimido, como latin1) do stream de um objeto. */
async function streamDoObjeto(obj, bytes, objetos) {
  if (!obj || obj.inicioStream < 0) return null;
  let tamanho = inteiroDireto(obj.dicionario, 'Length');
  if (tamanho == null) {
    const ref = referencia(obj.dicionario, 'Length');
    const alvo = ref != null ? objetos.get(ref) : null;
    tamanho = alvo ? Number(alvo.dicionario) : NaN;
  }
  if (!Number.isFinite(tamanho)) return null;

  let dados = bytes.subarray(obj.inicioStream, obj.inicioStream + tamanho);
  if (/\/Filter\s*\/FlateDecode/.test(obj.dicionario)) dados = await inflar(dados);
  return paraLatin1(dados);
}

/** Hex de um CMap ("0041") -> string UTF-16BE ("A", inclusive pares multi-char). */
function hexParaTexto(hex) {
  let s = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return s;
}

/**
 * ToUnicode CMap -> Map de CID para texto.
 * Cobre bfchar e bfrange (com destino unico incremental ou array).
 */
function lerCmap(texto) {
  const mapa = new Map();

  const reChar = /beginbfchar([\s\S]*?)endbfchar/g;
  let bloco;
  while ((bloco = reChar.exec(texto))) {
    const rePar = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g;
    let par;
    while ((par = rePar.exec(bloco[1]))) {
      mapa.set(parseInt(par[1], 16), hexParaTexto(par[2]));
    }
  }

  const reRange = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((bloco = reRange.exec(texto))) {
    const reTripla = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g;
    let tripla;
    while ((tripla = reTripla.exec(bloco[1]))) {
      const de = parseInt(tripla[1], 16);
      const ate = parseInt(tripla[2], 16);
      const destino = tripla[3];
      if (destino[0] === '[') {
        const itens = destino.match(/<([0-9a-fA-F]+)>/g) || [];
        itens.forEach((item, k) => mapa.set(de + k, hexParaTexto(item.slice(1, -1))));
      } else {
        const base = parseInt(destino.slice(1, -1), 16);
        for (let cid = de; cid <= ate; cid++) {
          mapa.set(cid, String.fromCharCode(base + (cid - de)));
        }
      }
    }
  }
  return mapa;
}

/** Bytes de uma string do PDF decodificados pela fonte corrente. */
function decodificar(bytesTexto, cmap) {
  if (!cmap) return bytesTexto; // fonte simples: 1 byte = 1 char
  let s = '';
  for (let i = 0; i + 1 < bytesTexto.length; i += 2) {
    const cid = (bytesTexto.charCodeAt(i) << 8) | bytesTexto.charCodeAt(i + 1);
    s += cmap.get(cid) ?? '';
  }
  return s;
}

/** String literal `(...)` -> bytes (como chars), resolvendo escapes. */
function lerLiteral(texto, pos) {
  let s = '';
  let nivel = 0;
  let i = pos;
  for (; i < texto.length; i++) {
    const c = texto[i];
    if (c === '\\') {
      const prox = texto[++i];
      const OCTAL = /[0-7]/;
      if (OCTAL.test(prox)) {
        let oct = prox;
        while (oct.length < 3 && OCTAL.test(texto[i + 1])) oct += texto[++i];
        s += String.fromCharCode(parseInt(oct, 8));
      } else {
        s += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[prox] ?? prox;
      }
      continue;
    }
    if (c === '(') { nivel++; if (nivel > 1) s += c; continue; }
    if (c === ')') { nivel--; if (!nivel) return { valor: s, fim: i + 1 }; s += c; continue; }
    s += c;
  }
  return { valor: s, fim: i };
}

/**
 * Percorre o content stream extraindo o texto dos operadores Tj/TJ/'/".
 * Cada operador de exibicao vira uma linha — e' a granularidade que o
 * interpretador do roteiro espera.
 */
function extrairDoConteudo(conteudo, fontes) {
  const linhas = [];
  let cmap = null;          // ToUnicode da fonte corrente
  let pilhaStrings = [];    // strings ja lidas, aguardando o operador
  let ultimoNome = null;

  let i = 0;
  while (i < conteudo.length) {
    const c = conteudo[i];

    if (c === '(') {
      const { valor, fim } = lerLiteral(conteudo, i);
      pilhaStrings.push(valor);
      i = fim;
      continue;
    }
    if (c === '<' && conteudo[i + 1] === '<') { i = fimDoDicionario(conteudo, i); continue; }
    if (c === '<') {
      const fecha = conteudo.indexOf('>', i);
      const hex = conteudo.slice(i + 1, fecha < 0 ? conteudo.length : fecha).replace(/\s+/g, '');
      let bytesTexto = '';
      for (let k = 0; k + 1 < hex.length; k += 2) {
        bytesTexto += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
      }
      pilhaStrings.push(bytesTexto);
      i = fecha < 0 ? conteudo.length : fecha + 1;
      continue;
    }
    if (c === '/') {
      let fim = i + 1;
      while (fim < conteudo.length && /[^\s()<>[\]{}/%]/.test(conteudo[fim])) fim++;
      ultimoNome = conteudo.slice(i + 1, fim);
      i = fim;
      continue;
    }
    if (/[A-Za-z'"]/.test(c)) {
      let fim = i;
      while (fim < conteudo.length && /[A-Za-z0-9'"*]/.test(conteudo[fim])) fim++;
      const op = conteudo.slice(i, fim);
      if (op === 'Tf' && ultimoNome) cmap = fontes.get(ultimoNome) ?? null;
      if (op === 'Tj' || op === "'" || op === '"' || op === 'TJ') {
        const textoOp = pilhaStrings.map((s) => decodificar(s, cmap)).join('');
        if (textoOp) linhas.push(textoOp);
        pilhaStrings = [];
      }
      if (op === 'BT' || op === 'ET') pilhaStrings = [];
      i = fim;
      continue;
    }
    if (c === ']') { i++; continue; } // strings do TJ ja estao na pilha
    i++;
  }
  return linhas;
}

/**
 * Extrai o texto de todas as paginas do PDF, uma linha por operador de
 * texto. Lanca Error com mensagem em portugues quando o arquivo nao tem
 * o formato esperado.
 */
export async function extrairTextoPdf(entrada) {
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const texto = paraLatin1(bytes);

  if (!texto.startsWith('%PDF')) throw new Error('O arquivo não é um PDF.');
  if (/\/Encrypt\b/.test(texto)) {
    throw new Error('Este PDF é protegido por senha e não pode ser lido.');
  }

  const objetos = mapearObjetos(texto);

  const paginas = [...objetos.values()].filter((o) => /\/Type\s*\/Page\b/.test(o.dicionario));
  if (!paginas.length) {
    throw new Error('Não encontrei páginas neste PDF. Gere o relatório de novo no ERP e tente outra vez.');
  }

  const linhas = [];
  for (const pagina of paginas) {
    // Fontes: no proprio /Resources da pagina ou herdadas do no' pai.
    let recursos = pagina.dicionario;
    let no = pagina;
    while (no && !/\/Font\b/.test(recursos)) {
      const pai = referencia(no.dicionario, 'Parent');
      no = pai != null ? objetos.get(pai) : null;
      recursos = no ? no.dicionario : recursos;
    }
    const fontes = new Map();
    const reFonte = /\/([^\s/<>[\]]+)\s+(\d+)\s+0\s+R/g;
    const blocoFontes = /\/Font\s*<<([\s\S]*?)>>/.exec(recursos)?.[1] ?? '';
    let f;
    while ((f = reFonte.exec(blocoFontes))) {
      const fonte = objetos.get(Number(f[2]));
      const toUnicode = fonte ? referencia(fonte.dicionario, 'ToUnicode') : null;
      if (toUnicode == null) { fontes.set(f[1], null); continue; }
      const cmapTexto = await streamDoObjeto(objetos.get(toUnicode), bytes, objetos);
      fontes.set(f[1], cmapTexto ? lerCmap(cmapTexto) : null);
    }

    // Conteudo: um stream unico ou um array de streams.
    const refs = [];
    const unico = referencia(pagina.dicionario, 'Contents');
    if (unico != null) refs.push(unico);
    else {
      const arr = /\/Contents\s*\[([^\]]*)\]/.exec(pagina.dicionario)?.[1] ?? '';
      const reRef = /(\d+)\s+0\s+R/g;
      let r;
      while ((r = reRef.exec(arr))) refs.push(Number(r[1]));
    }

    for (const ref of refs) {
      const conteudo = await streamDoObjeto(objetos.get(ref), bytes, objetos);
      if (conteudo) linhas.push(...extrairDoConteudo(conteudo, fontes));
    }
  }

  if (!linhas.length) {
    throw new Error('O PDF foi aberto mas não tem texto legível. Ele pode ser um formato que este importador não cobre.');
  }
  return linhas.join('\n');
}
