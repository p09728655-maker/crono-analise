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

/** Codigo de semana do PCP: "001-26" = semana 1 de 2026. */
const RE_SEMANA = /^(\d{1,3})\s*[-/]\s*(\d{2}|\d{4})$/;

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
export function lerCodigoSemana(valor) {
  const m = RE_SEMANA.exec(String(valor ?? '').trim());
  if (!m) return null;
  const numero = Number(m[1]);
  const ano = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  // 53 semanas e' o maximo de um ano ISO; 0 nao existe.
  if (!(numero >= 1 && numero <= 53)) return null;
  if (!(ano >= 2000 && ano <= 2099)) return null;
  return { ano, numero };
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
  for (const linha of linhas) {
    const cols = celulas(linha);
    if (cols.length < 2) continue;
    if (!/^semana$/i.test(cols[0])) continue;
    const i = cols.findIndex((c, k) => k > 0 && /total/i.test(c) && !/acumulad/i.test(c));
    if (i > 0) return i;
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
export function interpretarColagem(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const coluna = colunaDoTotal(linhas);
  const avisos = [];
  const porChave = new Map();

  for (const linha of linhas) {
    const cols = celulas(linha);
    const semana = lerCodigoSemana(cols[0]);
    if (!semana) {
      // Cabecalho, rodape e linha de texto passam sem reclamacao. O que
      // parece semana e nao e' ("01/26", "semana 5") vira aviso: e' onde
      // mora o erro de digitacao que apagaria uma semana do programa.
      const c0 = cols[0] || '';
      if (c0 && !RE_RODAPE.test(c0) && !/^semana$/i.test(c0) && /\d/.test(c0) && cols.length > 1) {
        avisos.push(`Linha ignorada, não parece uma semana: "${linha.slice(0, 60)}"`);
      }
      continue;
    }

    const numeros = cols.slice(1).map(numeroPtBr);
    // Com cabecalho, a coluna do total manda. Sem ele, a linha so' vale
    // quando traz um numero unico — somar lotes por conta propria seria
    // inventar a regra da planilha de outra pessoa.
    const doCabecalho = coluna !== null ? numeros[coluna - 1] : null;
    const validos = numeros.filter((n) => n !== null);
    const pecas = doCabecalho ?? (validos.length === 1 ? validos[0] : null);

    const chave = chaveSemana(semana);
    if (pecas === null || pecas <= 0) {
      avisos.push(`Semana ${chave} sem quantidade legível — não foi importada.`);
      continue;
    }

    /**
     * O total conferido contra a soma dos lotes.
     *
     * E' o que pega coluna trocada: se a leitura pegou "MÉDIA / LOTE" no
     * lugar de "TOTAL SEMANA", a diferenca salta. Nao bloqueia — a
     * planilha pode ter lote fora da conta — mas avisa com os dois numeros.
     */
    if (coluna !== null && validos.length > 1) {
      const lotes = numeros.slice(0, coluna - 1).filter((n) => n !== null);
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

  const base = {
    semanas,
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
