/**
 * O PROGRAMA DA EMBALAGEM, como a planilha do PCP o traz — lote a lote,
 * dia a dia, em VOLUMES — somado por SEMANA, que e' o que demanda_semanal
 * guarda e o takt usa.
 *
 * A planilha (MODELO_HORA_A_HORA) tem duas abas com o mesmo formato:
 *
 *   PROGRAMACAO            os lotes em aberto: atrasados, de hoje e futuros
 *   PROGRAMACAO_CONCLUIDA  os que terminaram — a linha MUDA de aba ao fim
 *
 * Ler so' a PROGRAMACAO da' o numero errado, e errado de um jeito que
 * ninguem ve: conforme a fabrica produz, as linhas saem da aba, o total da
 * semana encolhe e o takt fica mais folgado a cada dia. O programa da
 * semana e' a soma das DUAS, pela data PROGRAMADA de cada linha (o lote de
 * 23/10 que ainda esta' em aberto e' da semana de 23/10, nao desta).
 *
 * Qtd_cx e' caixa = VOLUME ("VOL 1/3 HOME RIPADO..."): a mesma unidade do
 * toque no tablet. Um produto de tres volumes conta tres.
 *
 * A SEMANA e' a ISO, de segunda a domingo, com inicio na segunda. O casamento
 * com a medicao e' pela data (ver src/domain/demanda/calendario.js), entao o
 * numero so' rotula. Nao se usa o calendario da fabrica (034-26 = 31/08)
 * porque ele so' existe nas semanas que o PCP colou para outro grupo: a
 * embalagem ficaria sem programa nas semanas que a furadeira ainda nao tem,
 * e misturar os dois rotulos repetiria numero de semana em periodos
 * diferentes.
 *
 * Tudo aqui e' puro: recebe as linhas e devolve as semanas. Quem le a
 * planilha e quem grava no banco moram em outros arquivos.
 */
import { semanaIso } from '../../src/domain/demanda/calendario.js';

export const ABAS_DO_PROGRAMA = ['PROGRAMACAO', 'PROGRAMACAO_CONCLUIDA'];

const UM_DIA = 86400000;
// O Sheets conta datas em dias desde 30/12/1899 (a mesma epoca do Excel).
const EPOCA_SHEETS = Date.UTC(1899, 11, 30);

const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** As colunas que importam, pelo CABECALHO — nunca pela posicao. */
const COLUNAS = {
  data: (c) => c === 'data',
  quantidade: (c) => c === 'qtd_cx' || c === 'qtd',
  lote: (c) => c === 'lote',
  codigo: (c) => c === 'codigo',
};

const isoDoDia = (d) => d.toISOString().slice(0, 10);

function diaValido(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d : null;
}

/**
 * A data de uma celula -> 'AAAA-MM-DD', ou null.
 *
 * Lida com o NUMERO de serie (o que o Sheets devolve para celula de data
 * com UNFORMATTED_VALUE: o ano vem junto, sem adivinhar) e com o TEXTO
 * "23/10" ou "23/10/2026". O "23/10" sem ano — a PROGRAMACAO mostra assim
 * — fica no ano que poe a data mais perto de `hoje`: em janeiro, "28/12"
 * e' do ano que passou, e em dezembro "05/01" e' do proximo.
 */
export function lerDia(valor, hoje = new Date()) {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (valor < 1) return null;
    return isoDoDia(new Date(EPOCA_SHEETS + (Math.floor(valor) * UM_DIA)));
  }
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(String(valor ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (m[3]) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = diaValido(ano, mes, dia);
    return d ? isoDoDia(d) : null;
  }
  const base = hoje.getUTCFullYear();
  const candidatas = [base - 1, base, base + 1]
    .map((ano) => diaValido(ano, mes, dia))
    .filter(Boolean)
    .sort((a, b) => Math.abs(a - hoje) - Math.abs(b - hoje));
  return candidatas.length ? isoDoDia(candidatas[0]) : null;
}

/** Quantidade de caixas: inteiro positivo, ou null. */
function lerQuantidade(valor) {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor > 0 ? valor : null;
  const texto = String(valor ?? '').trim();
  // "1.250" com ponto de milhar, como o PCP digita; virgula decimal nao
  // existe em caixa — se aparecer, a linha e' recusada, nao arredondada.
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(texto)) return null;
  const n = Number(texto.replace(/\./g, ''));
  return n > 0 ? n : null;
}

/** A segunda-feira da semana ISO de um dia 'AAAA-MM-DD'. */
function segundaDe(diaIso) {
  const d = new Date(`${diaIso}T00:00:00Z`);
  const dds = d.getUTCDay() || 7;
  return isoDoDia(new Date(d.getTime() - ((dds - 1) * UM_DIA)));
}

function colunasDa(aba, cabecalho) {
  const nomes = (cabecalho || []).map(normalizar);
  const achar = (regra) => nomes.findIndex(regra);
  const cols = Object.fromEntries(Object.entries(COLUNAS).map(([k, regra]) => [k, achar(regra)]));
  // Sem data ou sem quantidade, a aba mudou de formato: gravar um programa
  // lido torto e' pior que nao gravar nenhum. A sincronizacao para aqui e
  // o programa guardado continua valendo.
  const faltam = [cols.data < 0 && 'Data', cols.quantidade < 0 && 'Qtd_cx'].filter(Boolean);
  if (faltam.length) {
    throw new Error(`A aba ${aba} não tem a coluna ${faltam.join(' nem a ')} no cabeçalho`);
  }
  return cols;
}

/**
 * As linhas das duas abas -> as semanas do programa.
 *
 * `abas` e' { PROGRAMACAO: [[cabecalho...], [linha...], ...], ... }, como
 * o Sheets devolve. A linha que aparece nas DUAS abas (mesmo lote e mesmo
 * codigo — acontece no instante em que ela muda de aba) conta uma vez.
 *
 * Devolve as semanas (so' as com volume) e o que ficou de fora, contado:
 * linha com quantidade e sem data legivel, com data e sem quantidade, e a
 * duplicada entre abas. A tela mostra esses numeros — linha ignorada calada
 * e' volume que some do programa sem ninguem saber.
 */
export function semanasDaPlanilha(abas, { hoje = new Date() } = {}) {
  const porSemana = new Map();
  const vistas = new Set();
  const ignoradas = { semData: 0, semQuantidade: 0, duplicadas: 0 };
  let linhas = 0;

  // A concluida primeiro: na linha repetida entre abas, vale a que terminou.
  for (const aba of [...ABAS_DO_PROGRAMA].reverse()) {
    const [cabecalho, ...corpo] = abas?.[aba] || [];
    if (!cabecalho) throw new Error(`A aba ${aba} veio vazia, sem cabeçalho`);
    const cols = colunasDa(aba, cabecalho);
    const desta = new Set();

    for (const linha of corpo) {
      const celula = (i) => (i >= 0 ? linha?.[i] : undefined);
      const vazia = (v) => v === undefined || v === null || String(v).trim() === '';
      if (!linha || linha.every(vazia)) continue;

      const dia = lerDia(celula(cols.data), hoje);
      const qtd = lerQuantidade(celula(cols.quantidade));
      if (!dia && qtd === null) continue;
      if (!dia) { ignoradas.semData += 1; continue; }
      if (qtd === null) { ignoradas.semQuantidade += 1; continue; }

      const lote = String(celula(cols.lote) ?? '').trim();
      const codigo = String(celula(cols.codigo) ?? '').replace(/\D/g, '');
      const chave = lote && codigo ? `${lote}|${codigo}` : null;
      if (chave && vistas.has(chave)) { ignoradas.duplicadas += 1; continue; }
      if (chave) desta.add(chave);

      const inicio = segundaDe(dia);
      const atual = porSemana.get(inicio) || { inicio, pecas: 0, linhas: 0 };
      atual.pecas += qtd;
      atual.linhas += 1;
      porSemana.set(inicio, atual);
      linhas += 1;
    }
    // So' entre abas: dentro da mesma aba, duas linhas iguais sao duas
    // linhas do programa.
    desta.forEach((c) => vistas.add(c));
  }

  const semanas = [...porSemana.values()]
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1))
    .map((s) => {
      const { ano, numero } = semanaIso(new Date(`${s.inicio}T12:00:00Z`));
      return { ano, numero, inicio: s.inicio, pecas: s.pecas, linhas: s.linhas };
    });
  return { semanas, linhas, ignoradas };
}
