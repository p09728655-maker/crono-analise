/**
 * Leitura de planilha .xlsx no navegador, sem biblioteca.
 *
 * O objetivo NAO e' ler qualquer xlsx do mundo — e' ler o template de
 * tempos do RitmoProd (abas Config, Tempos, Paradas) que os analistas ja'
 * usam no chao de fabrica. Um .xlsx e' um zip de XMLs; para esse perfil,
 * ~150 linhas resolvem, contra centenas de KB de uma biblioteca de
 * planilha no bundle do celular.
 *
 * A descompressao usa DecompressionStream('deflate-raw'), nativo do
 * navegador (Chrome 103+; e do Node 21.2+ para os testes) — mesma decisao
 * do pdfTexto.js, nenhuma dependencia.
 *
 * Planilhas fora do perfil (criptografadas, zip64, compressao exotica)
 * falham com erro claro — melhor recusar do que importar dado errado.
 */

const decodificador = new TextDecoder('utf-8');

async function inflarRaw(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

const lerU16 = (b, i) => b[i] | (b[i + 1] << 8);
const lerU32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/**
 * Abre o zip pelo Central Directory (fim do arquivo) — nunca varrendo
 * assinaturas locais, porque dado comprimido pode conte-las por acaso.
 */
async function abrirZip(bytes) {
  let eocd = -1;
  const limite = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= limite; i--) {
    if (lerU32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('O arquivo não é uma planilha .xlsx válida.');

  const total = lerU16(bytes, eocd + 10);
  const entradas = new Map();
  let p = lerU32(bytes, eocd + 16);
  for (let n = 0; n < total; n++) {
    if (lerU32(bytes, p) !== 0x02014b50) break;
    const metodo = lerU16(bytes, p + 10);
    const tamComprimido = lerU32(bytes, p + 20);
    const tamNome = lerU16(bytes, p + 28);
    const tamExtra = lerU16(bytes, p + 30);
    const tamComentario = lerU16(bytes, p + 32);
    const offsetLocal = lerU32(bytes, p + 42);
    const nome = decodificador.decode(bytes.subarray(p + 46, p + 46 + tamNome));
    entradas.set(nome, { metodo, tamComprimido, offsetLocal });
    p += 46 + tamNome + tamExtra + tamComentario;
  }

  return async function ler(nome) {
    const e = entradas.get(nome);
    if (!e) return null;
    if (lerU32(bytes, e.offsetLocal) !== 0x04034b50) throw new Error('Planilha corrompida (zip).');
    // O cabecalho local tem nome/extra proprios, com tamanhos proprios.
    const inicio = e.offsetLocal + 30 + lerU16(bytes, e.offsetLocal + 26) + lerU16(bytes, e.offsetLocal + 28);
    const dados = bytes.subarray(inicio, inicio + e.tamComprimido);
    if (e.metodo === 0) return dados;
    if (e.metodo === 8) return inflarRaw(dados);
    throw new Error('Compressão de planilha não suportada.');
  };
}

/* ----------------------------------------------------------------- XML */

function desescapar(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9A-Fa-f]+);/g, (m, ent) => {
    if (ent === 'amp') return '&';
    if (ent === 'lt') return '<';
    if (ent === 'gt') return '>';
    if (ent === 'quot') return '"';
    if (ent === 'apos') return "'";
    const codigo = ent[1] === 'x' || ent[1] === 'X'
      ? parseInt(ent.slice(2), 16)
      : parseInt(ent.slice(1), 10);
    return Number.isFinite(codigo) ? String.fromCodePoint(codigo) : m;
  });
}

const atributo = (tag, nome) => {
  const m = new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(tag);
  return m ? desescapar(m[1]) : null;
};

/** Junta todos os <t> de um bloco (texto rico vem quebrado em runs). */
function textoDoBloco(xml) {
  let texto = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) texto += desescapar(m[1]);
  return texto;
}

function lerSharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => textoDoBloco(m[1]));
}

/** "BC12" -> indice de coluna 0-based. */
function colunaDaReferencia(ref) {
  let c = 0;
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break;
    c = c * 26 + (ch.charCodeAt(0) - 64);
  }
  return c - 1;
}

/** Uma aba -> matriz de linhas; celula vazia vira null. */
function lerAba(xml, shared) {
  const linhas = [];
  for (const mLinha of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const linha = [];
    for (const mCel of mLinha[1].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mCel[1];
      const corpo = mCel[2] || '';
      const ref = atributo(`<c ${attrs}>`, 'r');
      const tipo = atributo(`<c ${attrs}>`, 't');
      const col = ref ? colunaDaReferencia(ref) : linha.length;

      let valor = null;
      const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
      if (tipo === 's') valor = shared[Number(v)] ?? null;
      else if (tipo === 'inlineStr') valor = textoDoBloco(corpo);
      else if (tipo === 'str') valor = v != null ? desescapar(v) : null;
      else if (tipo === 'b') valor = v === '1';
      else if (v != null && v !== '') valor = Number(v);

      linha[col] = valor;
    }
    // Buracos de indice viram null explicitos, para o consumidor indexar.
    for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = null;
    linhas.push(linha);
  }
  return linhas;
}

/**
 * Le um .xlsx e devolve { nomeDaAba: linhas[][] }, na ordem do arquivo.
 */
export async function lerPlanilhaXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('O arquivo não é uma planilha .xlsx.');
  }
  const ler = await abrirZip(bytes);

  const workbook = await ler('xl/workbook.xml');
  if (!workbook) throw new Error('Planilha sem xl/workbook.xml — arquivo fora do padrão.');
  const xmlWorkbook = decodificador.decode(workbook);

  const xmlRels = decodificador.decode((await ler('xl/_rels/workbook.xml.rels')) ?? new Uint8Array());
  const alvoPorId = new Map(
    [...xmlRels.matchAll(/<Relationship\s[^>]*\/?>/g)].map((m) => {
      const tag = m[0];
      return [atributo(tag, 'Id'), atributo(tag, 'Target')];
    }),
  );

  const shared = lerSharedStrings(decodificador.decode((await ler('xl/sharedStrings.xml')) ?? new Uint8Array()));

  const abas = {};
  for (const m of xmlWorkbook.matchAll(/<sheet\s[^>]*\/?>/g)) {
    const nome = atributo(m[0], 'name');
    const rid = atributo(m[0], 'r:id') ?? atributo(m[0], 'id');
    let alvo = alvoPorId.get(rid);
    if (!nome || !alvo) continue;
    if (alvo.startsWith('/')) alvo = alvo.slice(1);
    else if (!alvo.startsWith('xl/')) alvo = `xl/${alvo}`;
    const conteudo = await ler(alvo);
    if (!conteudo) continue;
    abas[nome] = lerAba(decodificador.decode(conteudo), shared);
  }

  if (!Object.keys(abas).length) throw new Error('Nenhuma aba legível na planilha.');
  return abas;
}
