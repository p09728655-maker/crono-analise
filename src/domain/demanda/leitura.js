/**
 * COMO O PCP ESCREVE — semana, data e numero, lidos de texto.
 *
 * A base de tudo que vem da planilha: "S02" e "001-26" viram semana,
 * "08/01/2026" vira data, "128.250" vira numero. Inventar o que nao esta'
 * escrito e' o que este arquivo recusa a fazer: semana sem ano devolve
 * null, data em formato desconhecido devolve null. Quem chamou decide se
 * isso e' aviso ou linha ignorada.
 */

/** Codigo de semana COM ano: "001-26" = semana 1 de 2026; "1/2026" idem. */
export const RE_SEMANA_COM_ANO = /^(\d{1,3})\s*[-/]\s*(\d{2}|\d{4})$/;
/**
 * Codigo de semana SEM ano, como a planilha do PCP escreve: "S02", "S 2",
 * "SEM 02", "SEMANA 2". O ano vem de outra celula da linha ou do parametro
 * — inventar um ano aqui e' o tipo de chute que vira comparacao errada.
 */
export const RE_SEMANA_SO_NUMERO = /^(?:s|sem|semana)\s*[-.]?\s*(\d{1,2})$/i;

/**
 * "128.250" -> 128250. "1.234,6" -> 1235.
 *
 * O ponto e' separador de milhar (pt-BR) e some sempre; a virgula e'
 * decimal e a peca e' inteira, entao arredonda. Texto que nao vira numero
 * devolve null — quem chamou decide se isso e' aviso ou linha ignorada.
 */
export function numeroPtBr(valor) {
  const bruto = String(valor ?? '').trim();
  if (!bruto || !/\d/.test(bruto)) return null;
  if (!/^[\d.,\s]+$/.test(bruto)) return null;
  const limpo = bruto.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * "001-26" -> { ano: 2026, numero: 1 }. Ano de dois digitos vira 20xx: a
 * planilha do PCP nunca escreve o seculo, e semana "001-26" e' de 2026.
 */
export function lerCodigoSemana(valor, { ano: anoPadrao = null } = {}) {
  const bruto = String(valor ?? '').trim();
  const valido = (ano, numero) => (
    // 53 semanas e' o maximo de um ano ISO; 0 nao existe.
    numero >= 1 && numero <= 53 && ano >= 2000 && ano <= 2099 ? { ano, numero } : null
  );

  const comAno = RE_SEMANA_COM_ANO.exec(bruto);
  if (comAno) {
    const doisDigitos = comAno[2].length === 2;
    const ano = doisDigitos ? 2000 + Number(comAno[2]) : Number(comAno[2]);
    /**
     * "24/08" e' 24 de agosto OU semana 24 de 2008 — as duas leituras cabem
     * no mesmo formato. Lido como semana, o programa inteiro ia para um ano
     * onde medicao nenhuma iria procurar, e sem erro na tela. So' vale como
     * semana se der no ano de referencia; "001-26" nao e' ambiguo, porque
     * 26 nao e' mes nenhum.
     */
    const podeSerData = doisDigitos
      && Number(comAno[2]) >= 1 && Number(comAno[2]) <= 12
      && Number(comAno[1]) >= 1 && Number(comAno[1]) <= 31;
    if (podeSerData && ano !== Number(anoPadrao)) return null;
    return valido(ano, Number(comAno[1]));
  }

  // "S02" sozinho nao diz o ano: sem alguem informar, nao vira semana.
  const soNumero = RE_SEMANA_SO_NUMERO.exec(bruto);
  if (soNumero && anoPadrao) return valido(Number(anoPadrao), Number(soNumero[1]));
  return null;
}

/** { ano: 2026, numero: 1 } -> "001-26", como o PCP escreve. */
export const chaveSemana = ({ ano, numero }) =>
  `${String(numero).padStart(3, '0')}-${String(ano % 100).padStart(2, '0')}`;

/** Ordem no tempo: ano e depois numero. */
export const ordenarSemanas = (semanas) =>
  [...semanas].sort((a, b) => (a.ano - b.ano) || (a.numero - b.numero));

/** Data do PCP: "08/01/2026" ou "8/1/26". So' este formato — inverter dia e
    mes calado seria trocar a semana inteira de lugar. */
const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;

export function lerDataPtBr(valor) {
  const m = RE_DATA.exec(String(valor ?? '').trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (!(dia >= 1 && dia <= 31) || !(mes >= 1 && mes <= 12)) return null;
  if (!(ano >= 2000 && ano <= 2099)) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // 31/02 vira 03/03 no construtor: a data so' vale se voltar igual.
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) return null;
  return d;
}

/** "2026-01-08" — como a data viaja para a API e volta do banco. */
export const dataIso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
