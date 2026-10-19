/**
 * PECA A PECA — o intervalo entre uma peca e a seguinte, contra o takt.
 *
 * O ritmo da conferencia (pecas/hora) responde "quanto saiu". Nao responde
 * COMO saiu: 60 caixas numa hora podem ser uma a cada minuto, certinho, ou
 * quarenta em ritmo bom e uma lacuna de vinte minutos que ninguem marcou.
 * Os dois dao o mesmo numero no fim e pedem acoes opostas — a primeira
 * linha precisa de mais gente, a segunda precisa de quem descubra o que
 * aconteceu naqueles vinte minutos.
 *
 * As MARCAS sao o instante de cada toque no "Cronometrar ao vivo", em ms,
 * no RELOGIO DA LINHA RODANDO: o tempo de parada marcada durante o
 * cronometro ja' saiu delas (ver useCronometroAoVivo). Por isso, intervalo
 * grande que sobra aqui e' parada que NINGUEM marcou — a perda invisivel,
 * que nao aparece no Pareto porque nunca virou parada.
 *
 * Paradas marcadas DEPOIS (no resultado do tablet ou no PC) nao sabem em
 * que ponto do periodo aconteceram, entao continuam dentro dos intervalos.
 *
 * O intervalo antes da PRIMEIRA peca nao entra: o cronometro comeca num
 * instante qualquer, e o tempo ate' a primeira marca nao e' ciclo de nada.
 * N marcas dao N-1 intervalos.
 */
import { classificarEstabilidade, coeficienteVariacao, media, mediana } from '../estatistica.js';

/**
 * Criterios declarados ANTES dos numeros, como os da conferencia.
 *
 * - minIntervalos: com menos de dez intervalos a mediana e a variacao
 *   descrevem um punhado de pecas, nao o posto. O grafico aparece mesmo
 *   assim (e' o dado bruto); a leitura, nao.
 * - fatorLacuna: intervalo maior que o DOBRO da mediana e' lacuna. Regra
 *   que se explica numa frase na reuniao — "a caixa que demorou mais que o
 *   dobro do normal" —, por isso o dobro e nao um limite estatistico que
 *   ninguem no chao consegue conferir.
 */
export const CRITERIOS_INTERVALOS = {
  minIntervalos: 10,
  fatorLacuna: 2,
};

/** Teto de marcas por medicao: mais que isso nao e' toque de gente. */
export const MAX_MARCAS = 20000;

/**
 * As marcas servem? Inteiros >= 0, em ordem, uma por peca, dentro do periodo.
 *
 * Devolve a lista limpa ou null. Null e' o caminho comum e nao um erro: a
 * medicao feita por horarios, ou com a contagem corrigida a mao no fim,
 * simplesmente nao tem marcas — e marca que nao bate com a contagem daria
 * intervalo falso, entao e' melhor nenhuma.
 */
export function marcasValidas(marcas, { pecas, duracaoMs } = {}) {
  if (!Array.isArray(marcas) || !marcas.length || marcas.length > MAX_MARCAS) return null;
  const qtd = Number(pecas);
  if (Number.isFinite(qtd) && marcas.length !== qtd) return null;
  const teto = Number(duracaoMs);
  let anterior = 0;
  const limpas = [];
  for (const m of marcas) {
    const v = Number(m);
    if (!Number.isInteger(v) || v < anterior) return null;
    if (Number.isFinite(teto) && teto > 0 && v > teto) return null;
    limpas.push(v);
    anterior = v;
  }
  return limpas;
}

/** N marcas, N-1 intervalos: o tempo entre uma peca e a seguinte. */
export function intervalosEntreMarcas(marcas) {
  const lista = Array.isArray(marcas) ? marcas.map(Number) : [];
  const intervalos = [];
  for (let i = 1; i < lista.length; i++) intervalos.push(lista[i] - lista[i - 1]);
  return intervalos;
}

/**
 * A LEITURA de uma medicao peca a peca.
 *
 * Devolve null sem pelo menos dois toques (nao ha' intervalo nenhum). Com
 * menos de `minIntervalos`, devolve so' os intervalos e o motivo: o grafico
 * pode ser desenhado, a leitura nao.
 *
 * @param marcasMs instante de cada peca, ms no relogio da linha rodando
 * @param taktMs   takt da semana da medicao, por maquina (opcional)
 */
export function leituraPecaAPeca({ marcasMs, taktMs = null } = {}) {
  const intervalos = intervalosEntreMarcas(marcasMs);
  if (!intervalos.length) return null;

  const c = CRITERIOS_INTERVALOS;
  const n = intervalos.length;
  const takt = Number(taktMs) > 0 ? Number(taktMs) : null;
  const base = { n, intervalos, taktMs: takt, criterios: c };

  if (n < c.minIntervalos) {
    return {
      ...base,
      suficiente: false,
      motivo: `${n} intervalo(s) — mínimo de ${c.minIntervalos} para ler o ritmo peça a peça`,
    };
  }

  const medianaMs = mediana(intervalos);

  /**
   * LACUNA e o que ela custou. O excesso e' o tempo ALEM do normal — a
   * caixa de 3 min numa linha de 1 min custou 2 min, nao 3. Dividido pela
   * mediana, vira o que daria para ter saido nesse tempo ao ritmo que a
   * propria linha provou: e' o numero que muda a conversa ("18 min de
   * lacuna, umas 15 caixas"), no mesmo espirito de potencialSemParada.
   */
  const limiteLacunaMs = medianaMs * c.fatorLacuna;
  const lacunas = medianaMs > 0
    ? intervalos
      .map((ms, indice) => ({ indice, ms }))
      .filter((x) => x.ms > limiteLacunaMs)
    : [];
  const excessoMs = lacunas.reduce((soma, x) => soma + (x.ms - medianaMs), 0);

  /**
   * REGULARIDADE SEM AS LACUNAS. Lacuna ja' e' contada e listada a parte;
   * deixa-la dentro do CV dizia "alta variacao" de uma linha que bateu
   * 60 s em todos os volumes e parou uma vez — a pergunta da regularidade
   * e' outra: quando a linha anda, ela anda no mesmo passo?
   */
  const normais = intervalos.filter((ms) => !(medianaMs > 0 && ms > limiteLacunaMs));
  const cvPct = coeficienteVariacao(normais);

  /**
   * Contra o TAKT: quantas pecas sairam mais devagar que ele, e onde fica
   * o intervalo tipico. A mediana, e nao a media: tres lacunas grandes
   * puxariam a media para cima e fariam a linha inteira parecer lenta,
   * quando o que ha' sao tres buracos — e buraco se trata diferente de
   * ritmo.
   */
  const acimaDoTakt = takt ? intervalos.filter((ms) => ms > takt).length : null;

  return {
    ...base,
    suficiente: true,
    motivo: null,
    medianaMs,
    mediaMs: media(intervalos),
    menorMs: Math.min(...intervalos),
    maiorMs: Math.max(...intervalos),
    cvPct,
    estabilidade: classificarEstabilidade(cvPct),
    limiteLacunaMs,
    lacunas,
    excessoMs,
    pecasNoExcesso: medianaMs > 0 ? excessoMs / medianaMs : 0,
    acimaDoTakt,
    acimaDoTaktPct: takt ? (acimaDoTakt / n) * 100 : null,
    // Positivo: o intervalo tipico e' MAIS LENTO que o takt.
    medianaVsTaktPct: takt ? ((medianaMs / takt) - 1) * 100 : null,
  };
}
