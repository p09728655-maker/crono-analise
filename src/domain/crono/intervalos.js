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
 * O intervalo antes da PRIMEIRA peca nao entra. No Ritmo da maquina (e na
 * embalagem antes da 2.92) o cronometro comeca num instante qualquer, e o
 * tempo ate' a primeira marca nao e' ciclo de nada. Na embalagem com
 * largada ele seria um volume inteiro, mas o PC nao distingue uma medicao da
 * outra: a regra e' uma so'. N marcas dao N-1 intervalos.
 */
import { media } from '../estatistica.js';

/**
 * Criterios declarados ANTES dos numeros, como os da conferencia.
 *
 * - minIntervalos: com menos de dez intervalos a media e as lacunas
 *   descrevem um punhado de volumes, nao a linha. O grafico aparece mesmo
 *   assim (e' o dado bruto); a leitura, nao.
 * - fatorLacuna: intervalo maior que o DOBRO do ritmo normal e' lacuna.
 *   Regra que se explica numa frase na reuniao — "o volume que demorou mais
 *   que o dobro do normal" —, e nao um limite estatistico que ninguem no
 *   chao consegue conferir.
 */
export const CRITERIOS_INTERVALOS = {
  minIntervalos: 10,
  fatorLacuna: 2,
};

/** N marcas, N-1 intervalos: o tempo entre uma peca e a seguinte. */
export function intervalosEntreMarcas(marcas) {
  const lista = Array.isArray(marcas) ? marcas.map(Number) : [];
  const intervalos = [];
  for (let i = 1; i < lista.length; i++) intervalos.push(lista[i] - lista[i - 1]);
  return intervalos;
}

/**
 * O RITMO NORMAL e as LACUNAS, decididos juntos.
 *
 * Normal e' a MEDIA dos intervalos que nao sao lacuna; lacuna e' o que
 * passa do dobro do normal. Como um depende do outro, a conta repete ate'
 * parar de mudar: uma parada de vinte minutos inflaria a media a ponto de
 * esconder a de tres minutos ao lado dela, e so' saindo a primeira a
 * segunda aparece. Termina sempre — cada volta so' tira intervalo, e o
 * menor deles nunca passa do dobro da media.
 *
 * MEDIA, e nao mediana, por causa do volume em par. O rack de dois volumes
 * sai com os dois colados (25 s, 100 s, 25 s, 100 s...): a mediana dava
 * 25 s, o "dobro do normal" virava 50 s e metade dos volumes saia como
 * lacuna — numa linha que fez 59,6 s por volume, dentro de um takt de 72 s,
 * sem parar nenhuma vez. A media pondera pelo tempo, como todo ritmo deste
 * sistema.
 */
function normalELacunas(intervalos, fator) {
  let lacunas = new Set();
  for (let volta = 0; volta < intervalos.length; volta++) {
    const normais = intervalos.filter((_, i) => !lacunas.has(i));
    const normal = media(normais);
    const novas = new Set(intervalos.map((ms, i) => (ms > normal * fator ? i : -1)).filter((i) => i >= 0));
    if (novas.size === lacunas.size) return { normalMs: normal, lacunas: novas };
    lacunas = novas;
  }
  return { normalMs: media(intervalos.filter((_, i) => !lacunas.has(i))), lacunas };
}

/**
 * O TEMPO POR VOLUME QUE SE COMPARA COM O TAKT — o do relogio, paradas dentro.
 *
 * E' a mesma regua do veredito da semana (vereditoDaSemana, ritmo de
 * relogio): o volume que nao saiu porque a linha estava parada tambem nao
 * entrou no caminhao, marcada a parada ou nao. Comparar o takt com a linha
 * RODANDO premiava quem aperta "Parou" (revisao de 19/10).
 *
 * ENTRE O PRIMEIRO E O ULTIMO TOQUE, dividido por N-1 — e nao a duracao
 * inteira por N. A duracao traz a sobra antes do primeiro toque e depois do
 * ultimo, e com 14 volumes de 75 s a conta "duracao / N" dava 69,8 s:
 * aprovava no takt de 72 s uma linha mais lenta que ele em todos os volumes.
 * Entre o primeiro e o ultimo toque ha' exatamente N-1 volumes. E o relogio
 * ja' traz dentro a parada anotada DEPOIS do periodo (esquecida no calor da
 * coleta) — somar paradas as marcas contaria essa duas vezes.
 *
 * O SETUP entra uma vez so', como em leituraDaDemanda: com setup PLANEJADO
 * (maior que zero) ele ja' saiu das horas do takt, entao o setup que caiu
 * DENTRO do trecho sai daqui tambem — e so' ele. A troca costuma vir antes
 * do primeiro volume, fora do trecho; descontar o setup da medicao inteira
 * tirava do relogio um tempo que ele nunca conteve, e 10 min de troca
 * faziam uma linha de 75 s sair com 28,8 s (revisao de 19/10). O setup e'
 * o marcado AO VIVO, que o tablet sabe onde caiu; o anotado depois fica no
 * relogio — erro para o lado pessimista, nunca o contrario.
 *
 * Null sem dois toques ou sem relogio: a tela mostra vazio, nunca zero.
 */
export function periodoPorPeca({
  relogioEntreMarcasMs, volumes, setupNoTrechoMs = 0, setupPlanejado = false,
} = {}) {
  const relogio = Number(relogioEntreMarcasMs) || 0;
  const n = Math.floor(Number(volumes) || 0);
  const desconto = setupPlanejado ? Math.min(Math.max(0, Number(setupNoTrechoMs) || 0), relogio) : 0;
  if (n < 2 || relogio <= 0 || relogio - desconto <= 0) return null;
  return (relogio - desconto) / (n - 1);
}

/**
 * A LEITURA de uma medicao volume a volume.
 *
 * Devolve null sem pelo menos dois toques (nao ha' intervalo nenhum). Com
 * menos de `minIntervalos`, devolve so' os intervalos e o motivo: o grafico
 * pode ser desenhado, a leitura nao.
 *
 * TRES CAMADAS, do que saiu ao "se nao parasse":
 *
 *  - PERIODO (periodoPorPecaMs, de fora): relogio entre o primeiro e o
 *    ultimo toque / (N-1), paradas dentro. E' o que se compara com o takt
 *    — ver periodoPorPeca.
 *  - RODANDO (mediaMs): soma dos intervalos / quantidade, sem as paradas
 *    marcadas no cronometro. A diferenca para o periodo sao elas.
 *  - NORMAL (normalMs): rodando sem as lacunas. A diferenca para o rodando
 *    sao as paradas que ninguem marcou; o que sobra acima do takt e' o
 *    passo da linha.
 *
 * Cada camada que cai abaixo do takt diz de onde vem a diferenca — parada
 * marcada, lacuna ou passo —, e cada uma pede uma acao diferente.
 *
 * Volume a volume contra o takt nao e' leitura: com volumes em par, metade
 * passa do takt e metade fica muito abaixo, numa linha que atende. Por isso
 * nao ha' "quantos volumes acima do takt" aqui — so' a media contra ele.
 *
 * @param marcasMs instante de cada volume, ms no relogio da linha rodando
 * @param taktMs   takt da semana da medicao, por maquina (opcional)
 */
export function leituraPecaAPeca({ marcasMs, taktMs = null, periodoPorPecaMs = null } = {}) {
  const intervalos = intervalosEntreMarcas(marcasMs);
  if (!intervalos.length) return null;

  const c = CRITERIOS_INTERVALOS;
  const n = intervalos.length;
  const takt = Number(taktMs) > 0 ? Number(taktMs) : null;
  const periodo = Number(periodoPorPecaMs) > 0 ? Number(periodoPorPecaMs) : null;
  const base = { n, intervalos, taktMs: takt, periodoMs: periodo, criterios: c };

  if (n < c.minIntervalos) {
    return {
      ...base,
      suficiente: false,
      motivo: `${n} ${n === 1 ? 'intervalo' : 'intervalos'} — a leitura começa com ${c.minIntervalos}`,
    };
  }

  const mediaMs = media(intervalos);
  const { normalMs, lacunas: indices } = normalELacunas(intervalos, c.fatorLacuna);
  const lacunas = [...indices].sort((a, b) => a - b).map((indice) => ({ indice, ms: intervalos[indice] }));

  /**
   * O que a lacuna custou. O excesso e' o tempo ALEM do normal — o volume
   * de 3 min numa linha de 1 min custou 2 min, nao 3. Dividido pelo normal,
   * vira o que daria para ter saido nesse tempo ao ritmo que a propria
   * linha provou ("18 min de lacuna, umas 15 caixas"), no mesmo espirito
   * de potencialSemParada.
   */
  const excessoMs = lacunas.reduce((soma, x) => soma + (x.ms - normalMs), 0);

  return {
    ...base,
    suficiente: true,
    motivo: null,
    mediaMs,
    normalMs,
    menorMs: Math.min(...intervalos),
    maiorMs: Math.max(...intervalos),
    limiteLacunaMs: normalMs * c.fatorLacuna,
    lacunas,
    excessoMs,
    pecasNoExcesso: normalMs > 0 ? excessoMs / normalMs : 0,
    // Positivo: MAIS LENTO que o takt. O do periodo e' o veredito.
    periodoVsTaktPct: takt && periodo ? ((periodo / takt) - 1) * 100 : null,
    mediaVsTaktPct: takt ? ((mediaMs / takt) - 1) * 100 : null,
    normalVsTaktPct: takt ? ((normalMs / takt) - 1) * 100 : null,
  };
}
