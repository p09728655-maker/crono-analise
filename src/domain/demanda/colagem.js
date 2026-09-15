/**
 * A COLAGEM DA PLANILHA DO PCP -> semanas + avisos.
 *
 * Por que colagem, e nao digitacao: a planilha ja' existe e tem dezenas de
 * linhas. Redigitar 36 semanas e' onde nasce o numero trocado que ninguem
 * confere — e o takt calculado sobre ele tem cara de resultado.
 *
 * Quase todo o arquivo e' uma pergunta so': QUAL COLUNA E' QUAL. A
 * planilha tem duas colunas parecidas com semana (SEMANA e Nº PLANILHA) e
 * varias colunas de data (INICIO, CORTE MDP, PREV EMB), e cada troca
 * dessas move o programa inteiro de lugar sem erro nenhum na tela. As
 * regras aqui — cabecalho primeiro, formato depois, soma conferida — sao
 * cicatriz de erro que aconteceu de verdade.
 */
import {
  RE_SEMANA_COM_ANO, RE_SEMANA_SO_NUMERO, chaveSemana, dataIso, lerDataPtBr, numeroPtBr,
  ordenarSemanas, lerCodigoSemana,
} from './leitura.js';

/**
 * Linhas de rodape da planilha: totalizadores, nao semanas. Entram aqui
 * porque a colagem vem com elas e o interpretador precisa ignora-las sem
 * reclamar — "TOTAL ACUMULADO 3.855.110" nao e' uma semana ilegivel.
 */
const RE_RODAPE = /^(total|m[eé]dia|maior|menor|m[ií]n|m[aá]x|soma)\b/i;

/** Quantas semanas uma colagem pode trazer — dois anos de planilha. */
export const MAX_SEMANAS = 120;

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
