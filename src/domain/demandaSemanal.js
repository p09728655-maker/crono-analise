/**
 * DEMANDA SEMANAL — o programa de producao, semana a semana.
 *
 * O PCP mantem a quantidade programada numa planilha (SEMANA, LOTE 1..5,
 * TOTAL SEMANA). Sem ela o relatorio de ritmo responde "quanto o posto
 * entrega" e nunca "isso basta?" — que e' a pergunta que a reuniao faz.
 *
 * Este arquivo nao fala com tela nem com banco: interpreta a COLAGEM da
 * planilha e devolve as semanas mais os avisos do que nao deu para ler.
 *
 * Por que colagem, e nao digitacao: a planilha ja' existe e tem dezenas de
 * linhas. Redigitar 36 semanas e' onde nasce o numero trocado que ninguem
 * confere — e o takt calculado sobre ele tem cara de resultado.
 *
 * POR QUE POR SEMANA, E NAO UM NUMERO SO': a demanda varia demais para
 * caber num campo fixo. Nas 36 semanas de 2026 medidas pelo PCP a media
 * foi 107.086 pecas com desvio de 18.723 (CV 17,5%) — da menor semana
 * (64.750) para a maior (134.586) sao 2,08x. Um takt fixo na media erra
 * 66% na semana fraca. O numero tem de vir com a semana a que pertence.
 */

/** Codigo de semana COM ano: "001-26" = semana 1 de 2026; "1/2026" idem. */
const RE_SEMANA_COM_ANO = /^(\d{1,3})\s*[-/]\s*(\d{2}|\d{4})$/;
/**
 * Codigo de semana SEM ano, como a planilha do PCP escreve: "S02", "S 2",
 * "SEM 02", "SEMANA 2". O ano vem de outra celula da linha ou do parametro
 * — inventar um ano aqui e' o tipo de chute que vira comparacao errada.
 */
const RE_SEMANA_SO_NUMERO = /^(?:s|sem|semana)\s*[-.]?\s*(\d{1,2})$/i;

/**
 * Linhas de rodape da planilha: totalizadores, nao semanas. Entram aqui
 * porque a colagem vem com elas e o interpretador precisa ignora-las sem
 * reclamar — "TOTAL ACUMULADO 3.855.110" nao e' uma semana ilegivel.
 */
const RE_RODAPE = /^(total|m[eé]dia|maior|menor|m[ií]n|m[aá]x|soma)\b/i;

/** Quantas semanas uma colagem pode trazer — dois anos de planilha. */
export const MAX_SEMANAS = 120;

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
    const ano = comAno[2].length === 2 ? 2000 + Number(comAno[2]) : Number(comAno[2]);
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

/** Celulas de uma linha colada: tabulacao, ponto-e-virgula ou 2+ espacos. */
const celulas = (linha) => linha.split(/\t|;|\s{2,}/).map((c) => c.trim());

/**
 * Qual coluna traz o total da semana.
 *
 * Preferencia pelo CABECALHO: "TOTAL SEMANA" e' o que o PCP quer comparar,
 * e adivinhar pela posicao erra na planilha que tem "MÉDIA / LOTE" no fim.
 * "TOTAL ACUMULADO" nao conta — e' rodape, nao coluna.
 */
function colunaDoTotal(linhas) {
  const cols = cabecalho(linhas);
  if (!cols) return null;
  const i = cols.findIndex((c, k) => k > 0 && /total/i.test(c) && !/acumulad/i.test(c));
  return i > 0 ? i : null;
}

/** A linha de cabecalho: a que nomeia uma coluna SEMANA. */
function cabecalho(linhas) {
  for (const linha of linhas) {
    const cols = celulas(linha);
    if (cols.length >= 2 && cols.some((c) => /^semanas?$/i.test(c))) return cols;
  }
  return null;
}

/**
 * QUAL COLUNA E' A SEMANA — e esta e' a pergunta que ja' custou caro.
 *
 * A planilha do PCP tem DUAS colunas parecidas: SEMANA (S02, S04, S05...,
 * a semana do calendario, que pula semana sem programa) e Nº PLANILHA
 * (001-26, 002-26..., um contador sequencial de planilhas). As duas
 * "parecem" semana; so' a primeira e'.
 *
 * Lendo a coluna errada, o programa da S39 entrava como semana 36 e o
 * relatorio comparava medicao de uma semana com o programa de outra — com
 * o desvio crescendo a cada semana pulada no ano. Aconteceu de verdade
 * (set/2026), e so' foi descoberto porque o usuario mandou a planilha
 * inteira depois.
 *
 * Por isso a coluna vem do CABECALHO, e a coluna de planilha e' ignorada
 * com aviso na tela — nao em silencio.
 */
function colunaDaSemana(linhas) {
  const cols = cabecalho(linhas);
  if (!cols) return null;
  const i = cols.findIndex((c) => /^semanas?$/i.test(c));
  return i >= 0 ? i : null;
}

/** A coluna que numera PLANILHAS, se existir. So' serve para avisar. */
function colunaDaPlanilha(linhas) {
  const cols = cabecalho(linhas);
  if (!cols) return null;
  const i = cols.findIndex((c) => /planilha/i.test(c));
  return i >= 0 ? i : null;
}

/**
 * SEM CABECALHO, qual coluna e' o total?
 *
 * A que vale a SOMA das anteriores. Numa linha "S02 | 25.000 | 27.750 |
 * 34.900 | 28.650 | 11.950 | 128.250 | 25.650", so' a sexta fecha a conta
 * dos cinco lotes — a media por lote (25.650) nao fecha nada. E' inferencia
 * VERIFICADA, nao chute por posicao: ou a soma bate, ou nao ha' resposta.
 *
 * Existe porque exigir o cabecalho na colagem e' exigir que a pessoa
 * arraste o mouse ate' a linha certa; quem copia as linhas de dados no
 * Excel raramente leva o cabecalho junto — e a recusa saia como 36 avisos
 * de "sem quantidade legível", que nao dizem o que fazer.
 *
 * Devolve null quando nenhuma coluna fecha, ou quando mais de uma fecha
 * (ambiguidade real: ai' o cabecalho decide, e a tela pede por ele).
 */
function colunaQueFechaASoma(cols) {
  const numeros = cols.map(numeroPtBr);
  const candidatas = [];
  for (let i = 2; i < numeros.length; i++) {
    if (numeros[i] === null) continue;
    const antes = numeros.slice(0, i).filter((n) => n !== null);
    if (antes.length < 2) continue;
    const soma = antes.reduce((a, b) => a + b, 0);
    if (Math.abs(soma - numeros[i]) <= 1) candidatas.push(i);
  }
  return candidatas.length === 1 ? candidatas[0] : null;
}

/**
 * O ano escondido na linha: a coluna Nº PLANILHA traz "001-26", e o "-26"
 * e' o ano do programa. Serve para a semana "S02", que vem sem ano nenhum.
 */
function anoNaLinha(cols) {
  for (const c of cols) {
    const m = RE_SEMANA_COM_ANO.exec(String(c).trim());
    if (!m) continue;
    const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (ano >= 2000 && ano <= 2099) return ano;
  }
  return null;
}

/**
 * Colagem da planilha -> semanas + avisos.
 *
 * Toda linha que comeca com codigo de semana vira demanda; o resto e'
 * ignorado em silencio quando e' claramente rodape ou cabecalho, e vira
 * AVISO quando parecia uma semana e nao deu para ler. Aviso nao impede
 * salvar o que foi lido: a planilha real tem linha em branco, subtotal e
 * coluna a mais, e recusar tudo por causa delas devolve o trabalho para o
 * usuario sem motivo.
 *
 * @returns {{ semanas: Array<{ano, numero, chave, pecas}>, avisos: string[] }}
 */
export function interpretarColagem(texto, { ano = new Date().getFullYear() } = {}) {
  const linhas = String(texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const coluna = colunaDoTotal(linhas);
  const iSemana = colunaDaSemana(linhas) ?? 0;
  const iPlanilha = colunaDaPlanilha(linhas);
  const avisos = [];
  const porChave = new Map();
  // Quantas linhas tinham semana legivel e nenhuma quantidade identificavel.
  let semAmparo = 0;

  /**
   * A coluna de planilha e' a armadilha desta planilha: ela tambem "parece"
   * semana. Avisar e' obrigatorio — ignorar em silencio foi o que deixou o
   * programa entrar deslocado tres semanas sem ninguem perceber.
   */
  if (iPlanilha !== null && iPlanilha !== iSemana) {
    avisos.push(
      'A coluna Nº PLANILHA foi ignorada: ela numera as planilhas, não as semanas. '
      + 'A semana lida é a da coluna SEMANA.',
    );
  }

  for (const linha of linhas) {
    const cols = celulas(linha);
    const celulaSemana = cols[iSemana] ?? '';
    // "S02" nao traz ano; o "-26" da coluna de planilha traz. Sem nenhum
    // dos dois, vale o ano informado (a tela manda o corrente).
    const semana = lerCodigoSemana(celulaSemana, { ano: anoNaLinha(cols) ?? ano });
    if (!semana) {
      // Cabecalho, rodape e linha de texto passam sem reclamacao. O que
      // parece semana e nao e' ("01/26", "semana 5") vira aviso: e' onde
      // mora o erro de digitacao que apagaria uma semana do programa.
      const c0 = celulaSemana;
      if (c0 && !RE_RODAPE.test(c0) && !/^semanas?$/i.test(c0) && /\d/.test(c0) && cols.length > 1) {
        avisos.push(`Linha ignorada, não parece uma semana: "${linha.slice(0, 60)}"`);
      }
      continue;
    }

    // Numeros por posicao ABSOLUTA: a semana pode nao estar na coluna 0, e
    // entre ela e o total pode haver coluna de texto (a de planilha).
    const doCabecalho = coluna !== null ? numeroPtBr(cols[coluna]) : null;
    const validos = cols.map(numeroPtBr).filter((n) => n !== null);
    // Sem cabecalho: um numero so' e' o total; varios, vale a coluna que
    // fecha a soma dos anteriores.
    const daSoma = coluna === null ? colunaQueFechaASoma(cols) : null;
    const pecas = doCabecalho
      ?? (validos.length === 1 ? validos[0] : (daSoma !== null ? numeroPtBr(cols[daSoma]) : null));

    const chave = chaveSemana(semana);
    if (pecas === null || pecas <= 0) {
      // UM aviso para a colagem inteira, nao um por linha: o problema e' da
      // colagem (falta o cabecalho), nao de cada semana.
      semAmparo += 1;
      continue;
    }

    /**
     * O total conferido contra a soma dos lotes.
     *
     * E' o que pega coluna trocada: se a leitura pegou "MÉDIA / LOTE" no
     * lugar de "TOTAL SEMANA", a diferenca salta. Nao bloqueia — a
     * planilha pode ter lote fora da conta — mas avisa com os dois numeros.
     */
    const colunaDoTotalNaLinha = coluna ?? daSoma;
    if (colunaDoTotalNaLinha !== null && validos.length > 1) {
      // Tudo o que e' numero ANTES da coluna do total e' lote. A semana e a
      // planilha nao entram: "S02" e "001-26" nao viram numero.
      const lotes = cols.slice(0, colunaDoTotalNaLinha).map(numeroPtBr).filter((n) => n !== null);
      const soma = lotes.reduce((a, b) => a + b, 0);
      if (lotes.length > 1 && Math.abs(soma - pecas) > 1) {
        avisos.push(
          `Semana ${chave}: o total (${pecas.toLocaleString('pt-BR')}) não bate com a soma dos lotes `
          + `(${soma.toLocaleString('pt-BR')}). Confira a coluna.`,
        );
      }
    }

    if (porChave.has(chave) && porChave.get(chave).pecas !== pecas) {
      avisos.push(`Semana ${chave} aparece duas vezes com quantidades diferentes — ficou a última.`);
    }
    porChave.set(chave, { ...semana, chave, pecas });
  }

  if (semAmparo > 0) {
    avisos.push(
      `${semAmparo} linha(s) com semana legível não trouxeram quantidade identificável. `
      + 'Cole junto o cabeçalho da planilha (a linha com SEMANA e TOTAL SEMANA) — '
      + 'com ele não há dúvida sobre qual coluna é o total.',
    );
  }

  const semanas = ordenarSemanas([...porChave.values()]);
  if (semanas.length > MAX_SEMANAS) {
    avisos.push(`A colagem trouxe ${semanas.length} semanas; ficaram as ${MAX_SEMANAS} mais recentes.`);
    return { semanas: semanas.slice(-MAX_SEMANAS), avisos };
  }
  return { semanas, avisos };
}

/**
 * Leitura do programa: media, variacao e extremos.
 *
 * Existe para a tela poder dizer, ao lado do que foi colado, o que aquele
 * conjunto significa — e principalmente QUANTO ele varia. E' a variacao que
 * justifica guardar semana a semana em vez de um numero so'.
 */
export function resumoDaDemanda(semanas) {
  const valores = (semanas || []).map((s) => s.pecas).filter((n) => n > 0);
  if (!valores.length) return null;
  const n = valores.length;
  const media = valores.reduce((a, b) => a + b, 0) / n;
  // Desvio AMOSTRAL, como no resto do app: as semanas medidas sao uma
  // amostra do programa, nao o programa inteiro.
  const dp = n > 1
    ? Math.sqrt(valores.reduce((a, v) => a + ((v - media) ** 2), 0) / (n - 1))
    : 0;
  const ordenadas = ordenarSemanas(semanas.filter((s) => s.pecas > 0));
  const maior = ordenadas.reduce((a, s) => (s.pecas > a.pecas ? s : a), ordenadas[0]);
  const menor = ordenadas.reduce((a, s) => (s.pecas < a.pecas ? s : a), ordenadas[0]);
  return {
    n,
    media,
    dp,
    cvPct: media > 0 ? (dp / media) * 100 : 0,
    maior,
    menor,
    primeira: ordenadas[0],
    ultima: ordenadas[ordenadas.length - 1],
  };
}

/**
 * O QUE A DEMANDA EXIGE do grupo, na semana.
 *
 * Takt e' tempo disponivel dividido pela demanda. Num grupo de maquinas em
 * PARALELO (tres furadeiras fazendo o mesmo servico) o tempo disponivel e'
 * a soma das maquinas: 3 furadeiras x 44 h = 132 horas-maquina. Por isso o
 * numero que interessa ao chao e' o ritmo POR MAQUINA — e' ele que se
 * compara com as pecas/hora que o relatorio mede em cada posto.
 *
 * Devolve null quando falta dado. Nao ha' padrao de 44 h aqui de proposito:
 * jornada e' decisao de turno, e assumir uma produz veredito sobre um turno
 * que talvez nao exista.
 *
 * @param pecas    demanda da semana (pecas)
 * @param horas    horas disponiveis por maquina na semana
 * @param maquinas maquinas ativas no grupo (minimo 1)
 */
export function ritmoExigido({ pecas, horas, maquinas = 1 } = {}) {
  const p = Number(pecas) || 0;
  const h = Number(horas) || 0;
  const m = Math.max(0, Math.floor(Number(maquinas) || 0));
  if (p <= 0 || h <= 0 || m <= 0) return null;

  const horasDisponiveis = h * m;               // horas-maquina na semana
  const pecasPorHoraGrupo = p / horasDisponiveis * m; // o grupo inteiro, por hora de relogio
  const pecasPorHoraMaquina = p / horasDisponiveis;   // o que cada maquina precisa fazer
  return {
    horasDisponiveis,
    pecasPorHoraGrupo,
    pecasPorHoraMaquina,
    // Takt POR MAQUINA, em ms: o tempo que cada maquina tem para cada peca.
    taktMs: 3600000 / pecasPorHoraMaquina,
  };
}

/**
 * Quantas maquinas o ritmo medido exige para dar conta da demanda.
 *
 * E' a leitura que fecha a conta no chao: "cada furadeira faz 800 pc/h, o
 * programa pede 107.086 na semana, a jornada e' 44 h — entao sao 3,0
 * furadeiras". Usa o ritmo REAL medido (o de relogio, com as paradas
 * dentro), nao o potencial: maquina parada nao produz.
 *
 * @param pecas       demanda da semana
 * @param horas       horas disponiveis por maquina na semana
 * @param ritmoMedido pecas/hora que UMA maquina entrega
 */
export function maquinasNecessarias({ pecas, horas, ritmoMedido } = {}) {
  const p = Number(pecas) || 0;
  const h = Number(horas) || 0;
  const r = Number(ritmoMedido) || 0;
  if (p <= 0 || h <= 0 || r <= 0) return null;
  return p / (h * r);
}

/**
 * A SEMANA de uma medicao — ISO 8601, no relogio da fabrica.
 *
 * O programa e' numerado por semana (001-26) e a medicao e' datada. Para
 * casar os dois e' preciso dizer a que semana a data pertence, e a conta
 * usa o dia CIVIL da fabrica: a medicao de segunda as 07h em Sao Paulo nao
 * pode cair na semana anterior porque o navegador do PC esta' em UTC.
 *
 * ISO: a semana comeca na SEGUNDA e a semana 1 e' a que contem a primeira
 * quinta-feira do ano. E' a convencao do Brasil e a que o Excel usa em
 * NUMSEMANA(data; 21) — se a numeracao do PCP for outra, a tela deixa
 * escolher a semana a mao, e por isso este numero nunca decide sozinho.
 */
const FUSO_FABRICA = 'America/Sao_Paulo';

const civilDaFabrica = (() => {
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO_FABRICA, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { fmt = null; }
  return (data) => {
    // Ambiente sem base de fusos: cai no relogio local — pior que o certo,
    // melhor que quebrar o relatorio.
    if (!fmt) return [data.getFullYear(), data.getMonth() + 1, data.getDate()];
    const [a, m, d] = fmt.format(data).split('-').map(Number);
    return [a, m, d];
  };
})();

export function semanaIso(data) {
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) return null;
  const [a, m, d] = civilDaFabrica(quando);
  // A quinta-feira da mesma semana define o ano ISO: e' o que faz 31/12 e
  // 01/01 caírem na mesma semana quando e' o caso.
  const utc = new Date(Date.UTC(a, m - 1, d));
  const diaDaSemana = utc.getUTCDay() || 7;            // segunda = 1, domingo = 7
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const ano = utc.getUTCFullYear();
  const primeiroDia = Date.UTC(ano, 0, 1);
  const numero = Math.ceil((((utc.getTime() - primeiroDia) / 86400000) + 1) / 7);
  return { ano, numero };
}

/** Segunda e domingo de uma semana ISO — para a tela mostrar o periodo. */
export function intervaloIso({ ano, numero } = {}) {
  if (!(ano >= 2000 && numero >= 1 && numero <= 53)) return null;
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const dia = jan4.getUTCDay() || 7;
  const inicio = new Date(jan4);
  inicio.setUTCDate(jan4.getUTCDate() - dia + 1 + ((numero - 1) * 7));
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio, fim };
}

/**
 * O VEREDITO da semana: o que a demanda exige contra o que o posto entrega.
 *
 * Duas reguas, de proposito:
 *
 *  - `ritmoRelogio` (pecas por HORA DE PRESENCA, paradas dentro) e' o que
 *    decide. E' ele que enche o caminhao. Comparar o takt com o ritmo de
 *    maquina rodando dá um veredito otimista pelo tamanho da parada: com
 *    85% de disponibilidade, 44 h de relogio valem 37 h de producao.
 *  - `ritmoRodando` entra so' como o "se nao parasse" — a distancia entre
 *    os dois e' exatamente o que ha' a ganhar tratando parada, e e' o
 *    numero que decide entre comprar maquina e organizar o setup.
 *
 * Devolve null quando falta qualquer peca da conta. Nao ha' aproximacao:
 * veredito sobre dado que nao existe e' chute com cara de indicador.
 */
export function vereditoDaSemana({
  pecas, horas, maquinas = 1, ritmoRelogio, ritmoRodando,
} = {}) {
  const exigido = ritmoExigido({ pecas, horas, maquinas });
  const real = Number(ritmoRelogio) || 0;
  if (!exigido || real <= 0) return null;

  const potencial = Number(ritmoRodando) || 0;
  const precisa = maquinasNecessarias({ pecas, horas, ritmoMedido: real });
  return {
    ...exigido,
    ritmoRelogio: real,
    ritmoRodando: potencial > 0 ? potencial : null,
    atende: real >= exigido.pecasPorHoraMaquina,
    // Quanto sobra (+) ou falta (-) no ritmo de cada maquina, em %.
    folgaPct: ((real / exigido.pecasPorHoraMaquina) - 1) * 100,
    maquinasNecessarias: precisa,
    maquinasSeNaoParasse: potencial > 0
      ? maquinasNecessarias({ pecas, horas, ritmoMedido: potencial })
      : null,
    // Quantas maquinas o grupo TEM. Fica no resultado para a tela nao
    // precisar recalcular a comparacao que ela vai escrever em palavras.
    maquinas: Math.max(1, Math.floor(Number(maquinas) || 1)),
  };
}

/**
 * A LEITURA da demanda para o relatorio: qual semana comparar, com o que,
 * e o que falta quando nao da' para comparar.
 *
 * Existe para a tela nao precisar decidir nada: ela recebe um estado e os
 * numeros prontos. Os estados sao os quatro caminhos honestos —
 *   sem-demanda  o grupo nao tem programa cadastrado;
 *   sem-semana   ha' programa, mas nao o da semana das medicoes;
 *   sem-horas    ha' programa e falta a jornada do grupo;
 *   pronto       da' para comparar.
 *
 * A semana ESCOLHIDA manda; sem escolha, vale a semana da medicao mais
 * recente. Nunca "a ultima cadastrada": comparar medicao de marco com o
 * programa de setembro daria um veredito que ninguem consegue explicar.
 */
export function leituraDaDemanda({
  demandas = [], horas = null, maquinas = 0, ritmoRelogio = null, ritmoRodando = null,
  datas = [], semanaEscolhida = null,
} = {}) {
  const semanas = ordenarSemanas(
    (demandas || []).map((d) => ({ ...d, chave: chaveSemana(d) })),
  );
  if (!semanas.length) return { estado: 'sem-demanda', semanas: [] };

  const medidas = ordenarSemanas(
    (datas || []).map((d) => semanaIso(d)).filter(Boolean),
  );
  const daMedicao = medidas.length ? medidas[medidas.length - 1] : null;
  const alvo = semanaEscolhida || daMedicao || semanas[semanas.length - 1];
  const registro = semanas.find((s) => s.ano === alvo.ano && s.numero === alvo.numero) || null;

  /**
   * O CARIMBO DO PROGRAMA: de quando ele e' e ate' onde vai.
   *
   * A conta pode estar certa e o veredito errado do mesmo jeito, se o
   * programa for de tres meses atras. A tela nao tinha como dizer isso —
   * numero sem idade nao levanta suspeita em ninguem.
   */
  const gravacoes = semanas
    .map((s) => new Date(s.atualizado_em))
    .filter((d) => !Number.isNaN(d.getTime()));
  const programa = {
    n: semanas.length,
    primeira: semanas[0],
    ultima: semanas[semanas.length - 1],
    atualizadoEm: gravacoes.length
      ? new Date(Math.max(...gravacoes.map((d) => d.getTime())))
      : null,
  };

  const base = {
    semanas,
    programa,
    semana: { ...alvo, chave: chaveSemana(alvo) },
    intervalo: intervaloIso(alvo),
    // Quantas semanas DIFERENTES as medicoes cobrem: com mais de uma, o
    // ritmo medido e' de um periodo que atravessa semanas, e a tela precisa
    // dizer isso em vez de deixar entender que mediu so' aquela.
    semanasMedidas: new Set(medidas.map(chaveSemana)).size,
    escolhaAutomatica: !semanaEscolhida && Boolean(daMedicao),
  };

  if (!registro) return { ...base, estado: 'sem-semana', demanda: null, veredito: null };
  if (!(Number(horas) > 0) || !(Number(maquinas) > 0)) {
    return { ...base, estado: 'sem-horas', demanda: registro.pecas, veredito: null };
  }
  return {
    ...base,
    estado: 'pronto',
    demanda: registro.pecas,
    veredito: vereditoDaSemana({
      pecas: registro.pecas, horas, maquinas, ritmoRelogio, ritmoRodando,
    }),
  };
}
