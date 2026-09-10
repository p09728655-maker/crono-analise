/**
 * TENDENCIA AO LONGO DA COLETA — a serie que o grafico desenha e as frases
 * que a tela e o papel dizem sobre ela.
 *
 * A regressao mora em estatistica.js (tendencia) e ja' alimentava as
 * sugestoes; o que faltava era ENXERGAR a curva: o analista lia "tempos
 * subindo 12%" sem ver onde subiram — se foi do meio para o fim (fadiga),
 * se foram tres ciclos lentos no comeco (aquecimento) ou se e' dispersao
 * pura que a reta resume mal. O grafico responde isso; este modulo entrega
 * os pontos, a reta e a leitura de um lugar so', para tela e folha A4
 * dizerem a mesma coisa sobre os mesmos ciclos.
 *
 * As frases seguem o mesmo criterio das sugestoes (sugestoes.js): direcao
 * so' com |variacao| >= 5% E r2 >= 0,3. Abaixo disso a reta continua
 * desenhada — e' o que mostra que a variacao e' ruido —, mas a leitura diz
 * "sem direcao" em vez de inventar tendencia.
 */
import { temposValidos, tendencia } from './estatistica.js';

/** Minimo de ciclos validos para a regressao existir (mesmo de tendencia()). */
export const MIN_CICLOS_TENDENCIA = 3;

/** Variacao do inicio ao fim (em %) que separa tendencia de ruido. */
const RUIDO_PCT = 5;

/**
 * A serie de uma operacao: os ciclos validos NA ORDEM em que foram
 * cronometrados e a reta ajustada sobre eles.
 *
 * `reta` e' null com menos de MIN_CICLOS_TENDENCIA ciclos: dois pontos
 * sempre cabem numa reta, e desenha-la fingiria tendencia onde nao ha'
 * amostra. Os pontos ainda saem — o grafico mostra o pouco que existe.
 */
export function serieDeTendencia(tempos) {
  const ciclos = temposValidos(tempos);
  const n = ciclos.length;
  const t = tendencia(ciclos);
  const reta = n >= MIN_CICLOS_TENDENCIA
    ? { inicio: t.intercepto, fim: t.intercepto + t.slope * (n - 1) }
    : null;
  return {
    n,
    ciclos,
    reta,
    direcao: t.direcao,
    pct: t.pct,
    r2: t.r2,
  };
}

/**
 * A leitura em palavras. `rotulo` e' a palavra curta que vai no titulo do
 * quadro; `frase` explica o que a curva mostra e o que fazer com isso.
 *
 * Nunca fala em R2: quem le' e' supervisor e encarregado. O que importa
 * para eles e' se os ciclos subiram, cairam ou so' oscilaram — e o que
 * isso faz com o tempo padrao.
 */
export function lerTendencia(serie) {
  const { n, direcao, pct, r2 } = serie;
  const variacao = Math.abs(Math.round(pct));

  if (n < MIN_CICLOS_TENDENCIA) {
    return {
      rotulo: 'Poucos ciclos',
      tom: 'neutro',
      frase: n === 1
        ? 'Com 1 ciclo não há tendência a ler: são precisos pelo menos 3.'
        : `Com ${n} ciclos não há tendência a ler: são precisos pelo menos 3.`,
    };
  }

  if (direcao === 'degradacao') {
    return {
      rotulo: 'Ciclos subindo',
      tom: 'atencao',
      frase: `Os ciclos ficaram ${variacao}% mais lentos do início ao fim da coleta. `
        + 'Verificar fadiga, vida útil da ferramenta e abastecimento do posto — '
        + 'fadiga entra na tolerância, não no tempo normal.',
    };
  }

  if (direcao === 'aprendizado') {
    return {
      rotulo: 'Ciclos caindo',
      tom: 'ok',
      frase: `Os ciclos ficaram ${variacao}% mais rápidos do início ao fim da coleta: `
        + 'curva de aprendizado. A média da coleta inteira puxa o tempo padrão para cima; '
        + 'vale cronometrar de novo com o operador já aquecido.',
    };
  }

  // Variacao grande mas reta que explica pouco: os ciclos sobem e descem
  // sem direcao. E' dispersao (CV%), nao tendencia — dizer "estavel" aqui
  // esconderia a instabilidade.
  if (variacao >= RUIDO_PCT && r2 < 0.3) {
    return {
      rotulo: 'Sem direção',
      tom: 'neutro',
      frase: `Do início ao fim a reta varia ${variacao}%, mas os ciclos sobem e descem sem padrão: `
        + 'é dispersão, não tendência. Olhar o CV% da operação, não a ordem dos ciclos.',
    };
  }

  return {
    rotulo: 'Estável',
    tom: 'ok',
    frase: 'Os ciclos não mudaram de forma consistente do início ao fim da coleta: '
      + 'o tempo padrão representa a coleta inteira.',
  };
}
