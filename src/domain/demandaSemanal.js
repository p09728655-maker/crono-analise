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

/**
 * SEM CABECALHO, qual celula da linha e' a semana?
 *
 * A que vem no formato "S02". Ela e' inequivoca: so' a coluna SEMANA
 * escreve assim. "001-26" e' ambiguo — e' o formato da coluna Nº PLANILHA
 * E o formato que o proprio app usa para semana, entao sozinho ele nao
 * decide nada.
 *
 * Existe porque a regra do cabecalho nao alcanca quem cola so' as linhas
 * de dados: sem ela, a primeira coluna vencia, e a primeira coluna e' a do
 * contador de planilhas. O deslocamento de tres semanas voltou assim, uma
 * hora depois de ter sido corrigido (set/2026).
 */
function semanaNaLinha(cols) {
  const comS = cols.findIndex((c) => RE_SEMANA_SO_NUMERO.test(String(c ?? '').trim()));
  return comS >= 0 ? comS : 0;
}

/**
 * A coluna do INICIO da semana — a que resolve o problema de fundo.
 *
 * As semanas da fabrica NAO sao as do calendario: a 035-26 vai de terca
 * 08/09 a segunda 14/09 porque 07/09 foi feriado, e o rotulo S da fabrica
 * corre uma semana a frente do ISO. Casar programa e medicao por NUMERO
 * erra em toda semana com feriado; casar por DATA nao erra nunca.
 */
function colunaDoInicio(linhas) {
  const cols = cabecalho(linhas);
  if (!cols) return null;
  const i = cols.findIndex((c) => /^in[ií]cio$|^data$/i.test(c));
  return i >= 0 ? i : null;
}

/**
 * SEM CABECALHO: a primeira celula que for data.
 *
 * So' sem cabecalho. COM cabecalho, a data tem de vir da coluna chamada
 * INICIO e de nenhuma outra: a planilha do PCP tem varias colunas de data
 * (CORTE MDF, CORTE MDP, PREV EMB) e a de embalagem cai UMA SEMANA a
 * frente da producao. Pescar 'a primeira data da linha' com o cabecalho na
 * mao poria a semana inteira no lugar errado, calado — o mesmo erro que
 * esta tela existe para impedir.
 */
function inicioNaLinha(cols) {
  for (const c of cols) {
    const d = lerDataPtBr(c);
    if (d) return d;
  }
  return null;
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
 *
 * DUAS TRAVAS, e as duas custaram caro para existir:
 *
 *  - a celula do INICIO nao entra. "24/08" (24 de agosto, sem o ano) tem a
 *    cara exata de "semana 24 de 2008" — e o programa inteiro ia para
 *    2008, onde medicao nenhuma iria procurar.
 *  - o que PODE ser dia/mes so' vale se der no ano de referencia. "24/08"
 *    e' ambiguo (24 de agosto, ou semana 24 de 2008?); "033-26" nao e',
 *    porque 26 nao e' mes nenhum. Na duvida, a celula nao decide o ano.
 */
function anoNaLinha(cols, { ignorar = null, referencia = null } = {}) {
  for (let k = 0; k < cols.length; k++) {
    if (k === ignorar) continue;
    const m = RE_SEMANA_COM_ANO.exec(String(cols[k] ?? '').trim());
    if (!m) continue;
    const doisDigitos = m[2].length === 2;
    const ano = doisDigitos ? 2000 + Number(m[2]) : Number(m[2]);
    if (ano < 2000 || ano > 2099) continue;
    const podeSerData = doisDigitos
      && Number(m[2]) >= 1 && Number(m[2]) <= 12
      && Number(m[1]) >= 1 && Number(m[1]) <= 31;
    if (podeSerData && ano !== referencia) continue;
    return ano;
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
  // Com cabecalho a coluna e' fixa; sem ele, cada linha diz onde esta' a
  // semana — e quem manda e' o formato "S02".
  const iSemanaFixa = colunaDaSemana(linhas);
  const iInicio = colunaDoInicio(linhas);
  const iPlanilha = colunaDaPlanilha(linhas);
  let ignoradaPorFormato = false;
  // Semanas cuja celula de INICIO veio preenchida e nao virou data.
  const dataTorta = new Set();
  // Com cabecalho, a data so' vale se a coluna se chamar INICIO.
  const temCabecalho = cabecalho(linhas) !== null;
  const avisos = [];
  const porChave = new Map();
  // Quantas linhas tinham semana legivel e nenhuma quantidade identificavel.
  let semAmparo = 0;

  /**
   * A coluna de planilha e' a armadilha desta planilha: ela tambem "parece"
   * semana. Avisar e' obrigatorio — ignorar em silencio foi o que deixou o
   * programa entrar deslocado tres semanas sem ninguem perceber.
   */
  if (iPlanilha !== null && iPlanilha !== iSemanaFixa) {
    avisos.push(
      'A coluna Nº PLANILHA foi ignorada: ela numera as planilhas, não as semanas. '
      + 'A semana lida é a da coluna SEMANA.',
    );
  }

  for (const linha of linhas) {
    const cols = celulas(linha);
    const iSemana = iSemanaFixa ?? semanaNaLinha(cols);
    /**
     * A DATA DE INICIO vem antes da semana de proposito: quando ela traz o
     * ano (04/01/2027), e' ela quem diz de que ano e' o programa. Sem isso,
     * a planilha de 2027 colada em dezembro de 2026 entrava como semana 1
     * de 2026 e SOBRESCREVIA a demanda real daquela semana no banco (a
     * chave e' empresa+grupo+ano+numero), sem aviso nenhum.
     */
    const inicio = iInicio !== null
      ? lerDataPtBr(cols[iInicio])
      : (temCabecalho ? null : inicioNaLinha(cols));
    // Linha com "S02" em outra coluna e um "001-26" na frente: a primeira
    // coluna NAO e' a semana, e quem le' precisa saber disso.
    if (iSemanaFixa === null && iSemana > 0) ignoradaPorFormato = true;
    const celulaSemana = cols[iSemana] ?? '';
    // "S02" nao traz ano; o "-26" da coluna de planilha traz. Sem nenhum
    // dos dois, vale o ano informado (a tela manda o corrente).
    const semana = lerCodigoSemana(celulaSemana, {
      ano: inicio?.getUTCFullYear()
        ?? anoNaLinha(cols, { ignorar: iInicio, referencia: ano })
        ?? ano,
    });
    if (!semana) {
      // Cabecalho, rodape e linha de texto passam sem reclamacao. O que
      // parece semana e nao e' ("01/26", "semana 5") vira aviso: e' onde
      // mora o erro de digitacao que apagaria uma semana do programa.
      const c0 = celulaSemana;
      /**
       * O RODAPE pode nao estar na coluna da semana. Com a coluna Nº
       * PLANILHA na frente, "TOTAL ACUMULADO" fica na primeira celula e a
       * coluna SEMANA recebe o proprio 3.855.110 — que nao casa com
       * rodape nenhum e saia como "linha ignorada" na previa, assustando
       * quem colou uma planilha que estava certa.
       */
      const ehRodape = RE_RODAPE.test(c0) || RE_RODAPE.test(cols[0] ?? '');
      if (c0 && !ehRodape && !/^semanas?$/i.test(c0) && /\d/.test(c0) && cols.length > 1) {
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
    // O INICIO e' o que casa com a data da medicao. Sem ele a semana entra
    // mesmo assim (planilha antiga, sem a coluna), e o quadro cai no
    // casamento por numero — que erra em semana com feriado.
    // Celula de data que existe e nao vira data: some do casamento sem
    // deixar rastro, e a semana passa a casar por numero sozinha. Contar
    // aqui e' o que permite avisar depois. Por SEMANA, nao por linha: a
    // mesma semana colada duas vezes e' um problema so'.
    if (iInicio !== null && !inicio && String(cols[iInicio] ?? '').trim() !== '') {
      dataTorta.add(chave);
    }
    porChave.set(chave, { ...semana, chave, pecas, inicio: dataIso(inicio) });
  }

  if (ignoradaPorFormato) {
    avisos.push(
      'A colagem veio sem cabeçalho e com mais de uma coluna parecida com semana. '
      + 'Valeu a que está no formato S02 — a outra numera planilhas, não semanas.',
    );
  }

  if (semAmparo > 0) {
    avisos.push(
      `${semAmparo} linha(s) com semana legível não trouxeram quantidade identificável. `
      + 'Cole junto o cabeçalho da planilha (a linha com SEMANA e TOTAL SEMANA) — '
      + 'com ele não há dúvida sobre qual coluna é o total.',
    );
  }

  /**
   * SEM A COLUNA INICIO o programa entra, mas casa por NUMERO da semana —
   * e o numero da planilha nao e' o do calendario. Avisar e' o minimo:
   * quem colou tem como voltar ao Excel e trazer a coluna, e quem nao
   * trouxer ao menos sabe de que tamanho e' a margem de erro.
   */
  const semanas = ordenarSemanas([...porChave.values()]);
  const comData = semanas.filter((s) => s.inicio).length;
  if (semanas.length && comData === 0 && dataTorta.size === 0) {
    /**
     * COM CABECALHO a coluna precisa CHAMAR-SE INICIO, e o aviso tem de
     * dizer isso. A planilha do PCP tem varias colunas de data (CORTE MDF,
     * CORTE MDP, PREV EMB) e a de embalagem cai uma semana a frente da
     * producao: adivinhar qual delas e' o inicio poria a semana inteira no
     * lugar errado, calado.
     */
    avisos.push(
      temCabecalho
        ? 'Nenhuma coluna chamada INÍCIO na colagem. Sem a data, o relatório casa a '
          + 'medição pelo número da semana — e a semana da fábrica desloca por feriado. '
          + 'A coluna precisa se chamar INÍCIO: outras datas da planilha (PREV EMB, '
          + 'CORTE MDP) não são o começo da semana e não são adivinhadas.'
        : 'A colagem veio sem a coluna INÍCIO. Sem a data, o relatório casa a medição '
          + 'pelo número da semana — e a semana da fábrica desloca por feriado. '
          + 'Traga a coluna com a data de início de cada semana.',
    );
  }
  /**
   * COLUNA VEIO E NAO FOI LIDA e' pior que coluna ausente: a pessoa fez o
   * que foi pedido e o app nao usou, mandando-a buscar o que ela ja'
   * trouxe. O formato tem de aparecer no aviso — "24/08" sem o ano nao
   * vira data, e e' o erro mais facil de cometer.
   */
  if (dataTorta.size > 0) {
    avisos.push(
      `${dataTorta.size} semana(s) trouxeram INÍCIO que não deu para ler como data. `
      + 'Use o formato dd/mm/aaaa (08/09/2026). Essas semanas ficam sem data e '
      + 'casam pelo número da semana.',
    );
  }
  if (semanas.length && comData > 0 && comData < semanas.length) {
    avisos.push(
      `${semanas.length - comData} de ${semanas.length} semanas ficaram sem data de início `
      + '— essas casam pelo número da semana, as outras pela data.',
    );
  }
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
export function ritmoExigido({ pecas, horas, maquinas = 1, setupHoras = 0 } = {}) {
  const p = Number(pecas) || 0;
  const h = Number(horas) || 0;
  const m = Math.max(0, Math.floor(Number(maquinas) || 0));
  const setup = Math.max(0, Number(setupHoras) || 0);
  // O que sobra da jornada depois do setup e' o que produz. Setup maior
  // que a jornada nao e' folga negativa: e' cadastro errado, e nao ha' ritmo.
  const produtivas = h - setup;
  if (p <= 0 || h <= 0 || m <= 0 || produtivas <= 0) return null;

  const horasDisponiveis = produtivas * m;      // horas-maquina PRODUTIVAS na semana
  const pecasPorHoraGrupo = p / horasDisponiveis * m; // o grupo inteiro, por hora de relogio
  const pecasPorHoraMaquina = p / horasDisponiveis;   // o que cada maquina precisa fazer
  return {
    horasDisponiveis,
    // A jornada cheia e o setup, separados, para a tela escrever a conta
    // ("264 h de jornada − 50 h de setup = 214 h produtivas") em vez de
    // um numero que ninguem consegue conferir.
    horasJornada: h * m,
    horasSetup: setup * m,
    pecasPorHoraGrupo,
    pecasPorHoraMaquina,
    // Takt POR MAQUINA, em ms: o tempo que cada maquina tem para cada peca.
    taktMs: 3600000 / pecasPorHoraMaquina,
  };
}

/**
 * HORAS DE SETUP por maquina por semana, do cadastro do grupo.
 *
 * O setup e' o que a medicao NAO pega: a troca de peca (gabarito, batente,
 * posicao das brocas) acontece ENTRE uma medicao e a seguinte, e o
 * cronometro so' roda durante a corrida. No relatorio de setembro/2026 as
 * furadeiras tinham 49 min parados em 4h22 de medicao — e menos de 1 min
 * marcado como troca/setup, num posto que troca de peca cinco vezes por
 * dia. O setup nao estava em lado nenhum da conta: nem no ritmo entregue
 * (ritmo de corrida), nem nas horas disponiveis (jornada cheia). O
 * veredito saia otimista exatamente pelo tamanho do setup semanal.
 *
 * Por isso ele entra como PLANEJADO, no cadastro do grupo — setups por
 * DIA x dias de producao na semana x minutos por setup, por maquina — e
 * nao como medicao: e' como carga-maquina trata preparacao, e nao
 * depende da amostra do dia pegar duas ou tres trocas. Por dia porque e'
 * assim que o chao conta ("cinco trocas por dia"); os dias fecham a
 * conta com a jornada, que esta' por semana. Nao presumo cinco dias pelo
 * mesmo motivo que nao presumo 44 h: e' decisao de turno.
 *
 * Devolve null quando falta qualquer um dos tres: sem eles nao ha' setup
 * planejado, e a tela avisa que o veredito esta' sem ele.
 */
export function horasDeSetup({ setupsDia, dias, minutos } = {}) {
  const vazio = (v) => v == null || v === '';
  if (vazio(setupsDia) || vazio(dias) || vazio(minutos)) return null;
  const n = Number(setupsDia);
  const d = Number(dias);
  const min = Number(minutos);
  if (![n, d, min].every(Number.isFinite) || n < 0 || d <= 0 || min < 0) return null;
  return (n * d * min) / 60;
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
 * @param setupHoras  horas de setup por maquina na semana, que nao produzem
 */
export function maquinasNecessarias({ pecas, horas, ritmoMedido, setupHoras = 0 } = {}) {
  const p = Number(pecas) || 0;
  const h = (Number(horas) || 0) - Math.max(0, Number(setupHoras) || 0);
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

/**
 * QUANTOS DIAS uma semana do programa cobre a partir do inicio.
 *
 * SETE, fixo. A semana da fabrica produz de segunda a sexta, e a janela de
 * sete dias cobre o sabado e o domingo (onde nao ha' medicao) sem alcancar
 * a seguinte. Cobre tambem a semana deslocada por feriado: a 035-26 vai de
 * terca 08/09 a segunda 14/09, sete dias exatos.
 *
 * POR QUE NAO "ate' a vespera da proxima", que parecia mais esperto: a
 * planilha tem saltos de oito a onze dias (Pascoa, Tiradentes, Corpus
 * Christi, 7 de setembro), e esticar a janela ate' a semana seguinte
 * resolveria esses dias — mas atribuiria a semana ANTERIOR todos os dias
 * de uma semana que faltou na colagem. Colando S36 e S38 sem a S37, a
 * medicao de 02/09 sairia com a demanda de 24/08: 128.900 no lugar de
 * 93.200, "faltam 28% de ritmo, precisa de 4,2 maquinas" em vez de
 * "praticamente atende". Decisao de comprar maquina nascida de uma linha
 * que nao foi colada, e sem nenhum aviso na tela.
 *
 * O preco da janela fixa e' o oposto, e e' o preco certo: um dia util no
 * meio de um feriado longo (20/04, 06/05 em 2026) fica DESCOBERTO, e o
 * quadro diz "sem programa para o periodo desta medicao" — visivel, e com
 * o seletor de semana ali do lado para resolver na mao. Errar calado e'
 * pior que faltar em voz alta.
 */
const DIAS_DA_SEMANA_DO_PROGRAMA = 7;
const UM_DIA = 86400000;

/** "2026-09-08" -> Date do dia, as 00h UTC. Null quando nao e' data. */
export const emUtc = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * O DIA CIVIL DA FABRICA de uma medicao, as 00h UTC.
 *
 * A medicao guarda instante; a semana do programa e' um intervalo de DIAS.
 * Comparar os dois direto joga a medicao de segunda as 21h (00h UTC de
 * terca) para o dia seguinte — e na virada de semana isso troca de
 * programa. O dia vem do relogio de Sao Paulo, como no resto do app.
 */
function diaCivil(data) {
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) return null;
  const [a, m, d] = civilDaFabrica(quando);
  return new Date(Date.UTC(a, m - 1, d));
}

/**
 * As linhas do programa com O PERIODO que cada uma cobre.
 *
 * Ordenadas pela DATA, nao pelo rotulo: a premissa desta tela e' que o
 * rotulo da planilha nao e' confiavel (corre a frente do calendario, pula
 * numero, e a ultima planilha do ano pode chamar-se "S01"). Ordenar pelo
 * numero poria essa semana no comeco do ano.
 *
 * Linha sem data fica de fora: ela nao participa do casamento por data, e
 * o quadro cai no casamento por numero da semana (programa antigo, colado
 * antes da coluna INICIO existir).
 */
export function periodosDoPrograma(semanas) {
  return (semanas || [])
    .filter((s) => s?.inicio && emUtc(s.inicio))
    .sort((a, b) => (a.inicio < b.inicio ? -1 : (a.inicio > b.inicio ? 1 : 0)))
    .map((s) => {
      const inicio = emUtc(s.inicio);
      const fim = new Date(inicio.getTime() + ((DIAS_DA_SEMANA_DO_PROGRAMA - 1) * UM_DIA));
      return { semana: s, inicio, fim };
    });
}

/**
 * A linha do programa que COBRE uma data.
 *
 * E' o casamento que substitui o numero da semana. Numero erra sempre que
 * a fabrica pula uma semana ou desloca por feriado — e o rotulo S da
 * fabrica ainda corre uma semana a frente do ISO. Data com data nao tem
 * ambiguidade.
 */
export function semanaQueContem(semanas, data) {
  const dia = diaCivil(data);
  if (!dia) return null;
  const alvo = dia.getTime();
  // De tras para frente: com periodos sobrepostos por engano na planilha,
  // vale a semana mais recente que cobre a data, nao a primeira achada.
  const periodos = periodosDoPrograma(semanas).reverse();
  const achado = periodos.find((p) => alvo >= p.inicio.getTime() && alvo <= p.fim.getTime());
  return achado ? achado.semana : null;
}

/** O periodo coberto por UMA linha, dentro do programa a que ela pertence. */
export function periodoDaSemana(semanas, semana) {
  if (!semana?.inicio) return null;
  const achado = periodosDoPrograma(semanas)
    .find((p) => p.semana.ano === semana.ano && p.semana.numero === semana.numero);
  return achado ? { inicio: achado.inicio, fim: achado.fim } : null;
}

/**
 * A data do programa em pt-BR — SEM deslocar o dia.
 *
 * As datas do programa sao dias as 00h UTC. Formatadas no relogio local
 * (UTC-3 em Sao Paulo) elas voltam um dia: 08/09 aparece como 07/09, e o
 * periodo na tela deixa de bater com a planilha que o PCP tem aberta ao
 * lado. Por isso o fuso e' fixo em UTC aqui, e nao o do navegador.
 */
export const comoDia = (d, { ano = false } = {}) => (d instanceof Date && !Number.isNaN(d.getTime())
  ? d.toLocaleDateString('pt-BR', {
    timeZone: 'UTC', day: '2-digit', month: '2-digit', ...(ano ? { year: 'numeric' } : {}),
  })
  : '');

/** "31/08 a 04/09" — o periodo de uma semana, como a planilha o escreve. */
export const comoPeriodo = (periodo, { ano = false } = {}) => (periodo?.inicio && periodo?.fim
  ? `${comoDia(periodo.inicio)} a ${comoDia(periodo.fim, { ano })}`
  : '');

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
  pecas, horas, maquinas = 1, ritmoRelogio, ritmoRodando, setupHoras = null,
} = {}) {
  const setup = setupHoras == null ? 0 : Math.max(0, Number(setupHoras) || 0);
  const exigido = ritmoExigido({ pecas, horas, maquinas, setupHoras: setup });
  const real = Number(ritmoRelogio) || 0;
  if (!exigido || real <= 0) return null;

  const potencial = Number(ritmoRodando) || 0;
  const precisa = maquinasNecessarias({ pecas, horas, ritmoMedido: real, setupHoras: setup });
  return {
    ...exigido,
    ritmoRelogio: real,
    ritmoRodando: potencial > 0 ? potencial : null,
    atende: real >= exigido.pecasPorHoraMaquina,
    // Quanto sobra (+) ou falta (-) no ritmo de cada maquina, em %.
    folgaPct: ((real / exigido.pecasPorHoraMaquina) - 1) * 100,
    maquinasNecessarias: precisa,
    maquinasSeNaoParasse: potencial > 0
      ? maquinasNecessarias({ pecas, horas, ritmoMedido: potencial, setupHoras: setup })
      : null,
    // Se o setup planejado entrou na conta. Sem ele o veredito e' otimista
    // pelo tamanho do setup semanal — e a tela precisa dizer isso.
    setupInformado: setupHoras != null,
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
 * numeros prontos. Os estados sao os cinco caminhos honestos —
 *   sem-demanda  o grupo nao tem programa cadastrado;
 *   sem-semana   ha' programa, mas nao o da semana das medicoes;
 *   sem-horas    ha' programa e falta a jornada do grupo;
 *   sem-ritmo    ha' tudo e nao ha' medicao aproveitavel no periodo;
 *   pronto       da' para comparar.
 *
 * A semana ESCOLHIDA manda; sem escolha, vale a linha do programa cujo
 * PERIODO contem a medicao mais recente. Nunca "a ultima cadastrada":
 * comparar medicao de marco com o programa de setembro daria um veredito
 * que ninguem consegue explicar.
 */
export function leituraDaDemanda({
  demandas = [], horas = null, maquinas = 0, ritmoRelogio = null, ritmoRodando = null,
  datas = [], semanaEscolhida = null,
  // Setup PLANEJADO do grupo: { setupsDia, dias, minutos } por maquina.
  setup = null,
  // O periodo OBSERVADO: { pecas, totalMs, setupMs } — o que as medicoes
  // somaram, para tirar do relogio o setup que elas por acaso pegaram.
  observado = null,
} = {}) {
  const semanas = ordenarSemanas(
    (demandas || []).map((d) => ({ ...d, chave: chaveSemana(d) })),
  );
  if (!semanas.length) return { estado: 'sem-demanda', semanas: [] };

  const medidas = ordenarSemanas(
    (datas || []).map((d) => semanaIso(d)).filter(Boolean),
  );
  const daMedicao = medidas.length ? medidas[medidas.length - 1] : null;

  /**
   * POR DATA, quando a linha tem data — e e' a diferenca entre acertar e
   * errar sempre que houve feriado.
   *
   * O numero da semana nao casa: o rotulo S da planilha corre uma semana a
   * frente do ISO (a 034-26 e' "S37" e roda de 31/08 a 04/09, que e' a
   * semana ISO 36), e feriado desloca o inicio. Com a coluna INICIO na
   * planilha, a medicao cai na linha cujo PERIODO a contem, e nenhuma
   * dessas duas armadilhas alcanca o veredito.
   *
   * O casamento antigo, por numero ISO, continua valendo para as linhas
   * SEM data — e a decisao e' de cada linha, nao do programa inteiro. A
   * gravacao mescla: basta colar setembro com a coluna INICIO para o
   * programa ter linhas dos dois tipos, e regra de programa inteiro faria
   * as semanas antigas — visiveis na tela de Demanda — pararem de casar.
   */
  const temData = semanas.some((s) => s.inicio);
  const instantes = (datas || [])
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .filter((d) => !Number.isNaN(d.getTime()));
  const ultimaMedicao = instantes.length
    ? new Date(Math.max(...instantes.map((d) => d.getTime())))
    : null;

  const escolhido = semanaEscolhida
    ? semanas.find((s) => s.ano === semanaEscolhida.ano && s.numero === semanaEscolhida.numero)
    : null;
  const daData = ultimaMedicao ? semanaQueContem(semanas, ultimaMedicao) : null;
  // So' as linhas SEM data entram no casamento por numero: linha que tem
  // data ja' respondeu, e foi "nao".
  const doCalendario = daMedicao
    ? semanas.find((s) => !s.inicio && s.ano === daMedicao.ano && s.numero === daMedicao.numero)
    : null;
  /**
   * SEM MEDICAO NENHUMA em tela nao ha' data para casar, e ai' vale a
   * ultima semana cadastrada — e' so' o programa se mostrando, sem
   * veredito nenhum por cima (nao ha' ritmo medido para comparar).
   */
  const semMedicao = !instantes.length;
  // A ultima do programa e' a de DATA mais recente quando ha' data: o
  // rotulo nao serve nem para isso (a ultima planilha do ano pode
  // chamar-se "S01" e iria para o comeco da lista).
  const periodos = periodosDoPrograma(semanas);
  const ultimaDoPrograma = periodos.length
    ? periodos[periodos.length - 1].semana
    : semanas[semanas.length - 1];
  const registro = semanaEscolhida
    ? (escolhido || null)
    : (semMedicao ? ultimaDoPrograma : (daData || doCalendario || null));
  /**
   * A LINHA DA VEZ tem data? Nao e' propriedade do programa: no mesmo
   * programa uma semana pode ter data e outra nao.
   *
   * A pergunta e' "a linha tem data", e nao "foi a data que escolheu":
   * quando o usuario troca a semana no seletor, nada 'casou' — e cobrar
   * a coluna INICIO de uma semana que a tem, mostrando o periodo dela na
   * linha de cima, ensina a ignorar a ressalva que importa.
   */
  const casadoPorData = Boolean(registro?.inicio);

  // Quando nada casou, o alvo serve so' para a tela dizer DE QUE semana
  // sentiu falta: a da medicao, como o calendario a numera.
  const alvo = registro || semanaEscolhida || daMedicao || semanas[semanas.length - 1];

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
    // Quantas linhas do programa ainda nao tem data. A tela precisa saber:
    // veredito casado por numero merece ressalva, na tela e no papel.
    temData,
    semData: semanas.filter((s) => !s.inicio).length,
  };

  /**
   * O SETUP entra UMA vez so'. Planejado, ele sai das horas disponiveis.
   * Se as medicoes tambem pegaram troca/setup como parada, esse tempo ja'
   * esta' dentro do ritmo de relogio — e ficaria contado duas vezes: uma
   * nas horas, outra no ritmo. Por isso, com setup planejado informado, o
   * relogio da comparacao e' recalculado SEM as paradas de setup medidas:
   * pecas sobre (tempo observado − setup medido). Sem setup planejado,
   * o relogio fica como veio, com tudo dentro.
   */
  const setupHoras = horasDeSetup(setup || {});
  const setupMedidoMs = Math.max(0, Number(observado?.setupMs) || 0);
  const totalMs = Number(observado?.totalMs) || 0;
  const pecasObservadas = Number(observado?.pecas) || 0;
  const relogioSemSetup = setupHoras != null && setupMedidoMs > 0
    && totalMs > setupMedidoMs && pecasObservadas > 0
    ? (pecasObservadas * 3600000) / (totalMs - setupMedidoMs)
    : null;
  const relogio = relogioSemSetup ?? ritmoRelogio;

  const periodo = registro ? periodoDaSemana(semanas, registro) : null;
  const base = {
    semanas,
    programa,
    semana: { ...alvo, chave: chaveSemana(alvo) },
    // O periodo da PLANILHA quando ele existe; o do calendario ISO quando
    // nao. A tela escreve "de 31/08 a 04/09" nos dois casos, e so' o
    // primeiro e' a semana de verdade da fabrica.
    periodo,
    intervalo: periodo || intervaloIso(alvo),
    // Quantas semanas DIFERENTES as medicoes cobrem: com mais de uma, o
    // ritmo medido e' de um periodo que atravessa semanas, e a tela precisa
    // dizer isso em vez de deixar entender que mediu so' aquela.
    //
    // Contadas na semana da FABRICA quando ha' programa com data: contar
    // semana ISO aqui punha a tela a se contradizer na mesma frase — "o
    // periodo e' de 31/08 a 06/09" seguido de "as medicoes cobrem 2
    // semanas", porque 31/08 e 06/09 caem em semanas ISO diferentes.
    semanasMedidas: temData
      ? new Set(instantes.map((d) => semanaQueContem(semanas, d)?.chave
        ?? `fora:${chaveSemana(semanaIso(d))}`)).size
      : new Set(medidas.map(chaveSemana)).size,
    // A medicao mais recente em tela: e' ela que escolheu a linha do
    // programa, e e' o que a tela mostra quando nenhuma linha a cobre.
    medicao: ultimaMedicao ? diaCivil(ultimaMedicao) : null,
    escolhaAutomatica: !semanaEscolhida && Boolean(daMedicao),
    casadoPorData,
    // O setup como a tela escreve a conta: "25 × 20 min = 8,3 h por
    // máquina". Nulo quando nao informado — e a tela diz que falta.
    setup: setupHoras == null ? null : {
      setupsDia: Number(setup.setupsDia),
      dias: Number(setup.dias),
      minutos: Number(setup.minutos),
      horasPorMaquina: setupHoras,
      // Quanto de troca/setup as medicoes pegaram e foi tirado do relogio
      // para nao contar duas vezes. Zero na pratica de hoje (< 1 min).
      medidoMs: relogioSemSetup != null ? setupMedidoMs : 0,
    },
  };

  if (!registro) return { ...base, estado: 'sem-semana', demanda: null, veredito: null };
  if (!(Number(horas) > 0) || !(Number(maquinas) > 0)) {
    return { ...base, estado: 'sem-horas', demanda: registro.pecas, veredito: null };
  }
  // Setup que come a jornada inteira e' cadastro errado, nao folga
  // negativa: cai no mesmo estado de "falta a jornada", e a tela diz qual.
  if (setupHoras != null && setupHoras >= Number(horas)) {
    return { ...base, estado: 'sem-horas', demanda: registro.pecas, veredito: null };
  }
  /**
   * SEM RITMO MEDIDO nao ha' veredito — e 'pronto' com veredito nulo era
   * um estado que a tela nao sabia desenhar. Acontece quando o periodo
   * em tela nao tem medicao aproveitavel (duracao zerada, por exemplo):
   * ha' programa, ha' jornada, e nao ha' com o que comparar.
   */
  /**
   * SEM MEDICAO NENHUMA nao ha' veredito, mesmo que chegue um ritmo: o
   * ritmo sem data nao se sabe de que semana e', e comparar a ultima
   * semana cadastrada com ele e' exatamente o "comparar medicao de marco
   * com o programa de setembro" que este arquivo inteiro recusa.
   */
  const veredito = semMedicao ? null : vereditoDaSemana({
    pecas: registro.pecas, horas, maquinas, ritmoRelogio: relogio, ritmoRodando, setupHoras,
  });
  if (!veredito) return { ...base, estado: 'sem-ritmo', demanda: registro.pecas, veredito: null };
  return {
    ...base, estado: 'pronto', demanda: registro.pecas, veredito,
  };
}
