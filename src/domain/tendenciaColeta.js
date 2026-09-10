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
 * As frases seguem o mesmo criterio das sugestoes (sugestoes.js), que e' o
 * de tendencia(): direcao so' com |variacao| >= 5% do ciclo medio E
 * inclinacao distinguivel do acaso a 95% para o n da coleta. Abaixo disso
 * a reta continua desenhada — e' o que mostra que a variacao e' ruido —,
 * mas a leitura diz "sem direcao" em vez de inventar tendencia.
 *
 * A PORCENTAGEM EXIBIDA compara o fim da reta com o inicio (fim ÷ inicio),
 * que e' o que o olho ve' no quadro: reta de 7,5 s a 10,0 s e' +33%. O
 * criterio de direcao usa outra base (o ciclo medio, simetrica) e por isso
 * a frase escreve os dois extremos ao lado da porcentagem — o numero
 * declara de onde sai.
 */
import { temposValidos, tendencia } from './estatistica.js';
import { formatarSegundos } from './cronoanalise.js';

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
  // Variacao do inicio ao fim DA RETA. Com inicio nao positivo (so'
  // acontece com toque acidental misturado a ciclos longos) nao ha' base
  // para a razao: cai na base do ciclo medio, que e' a de tendencia().
  const pctExibida = reta && reta.inicio > 0 ? ((reta.fim / reta.inicio) - 1) * 100 : t.pct;
  return {
    n,
    ciclos,
    reta,
    direcao: t.direcao,
    pct: t.pct,
    pctExibida,
    r2: t.r2,
    r2Minimo: t.r2Minimo,
  };
}

/**
 * A leitura em palavras. `rotulo` e' a palavra curta que vai no titulo do
 * quadro; `frase` explica o que a curva mostra e o que fazer com isso.
 *
 * Nunca fala em R2: quem le' e' supervisor e encarregado. O que importa
 * para eles e' se os ciclos subiram, cairam ou so' oscilaram — e o que
 * isso faz com o tempo padrao.
 *
 * `mostrarPct` diz se o selo do quadro pode carregar a porcentagem. Com a
 * leitura "Estavel" ela nao pode: "Estavel · −7%" se contradiz na mesma
 * linha, e quem le' fica sem saber qual metade vale.
 */
export function lerTendencia(serie) {
  const { n, direcao, pct, pctExibida, r2, r2Minimo, reta } = serie;
  const variacao = Math.abs(Math.round(pctExibida));
  const extremos = reta ? `de ${formatarSegundos(reta.inicio)} s a ${formatarSegundos(reta.fim)} s` : '';

  if (n < MIN_CICLOS_TENDENCIA) {
    return {
      rotulo: 'Poucos ciclos',
      tom: 'neutro',
      mostrarPct: false,
      frase: n === 1
        ? 'Com 1 ciclo não há tendência a ler: são precisos pelo menos 3.'
        : `Com ${n} ciclos não há tendência a ler: são precisos pelo menos 3.`,
    };
  }

  if (direcao === 'degradacao') {
    return {
      rotulo: 'Ciclos subindo',
      tom: 'atencao',
      mostrarPct: true,
      frase: `A reta sobe ${extremos} do primeiro ao último ciclo: ${variacao}% mais lentos. `
        + 'Verificar fadiga, vida útil da ferramenta e abastecimento do posto — '
        + 'fadiga entra na tolerância, não no tempo normal.',
    };
  }

  if (direcao === 'aprendizado') {
    return {
      rotulo: 'Ciclos caindo',
      tom: 'ok',
      mostrarPct: true,
      frase: `A reta cai ${extremos} do primeiro ao último ciclo: ${variacao}% mais rápidos, `
        + 'curva de aprendizado. A média da coleta inteira puxa o tempo padrão para cima; '
        + 'vale cronometrar de novo com o operador já aquecido.',
    };
  }

  /* Variacao que importa, mas inclinacao que nao se distingue do acaso.
     O limiar compara o pct SEM arredondar: e' o mesmo criterio de
     tendencia(), e arredondar antes faria 4,6% virar "5%" na frase.
     Dois motivos, duas frases: a reta explica pouco (os ciclos sobem e
     descem — dispersao, CV%) ou explica bem mas sao poucos ciclos para
     afirmar (r2 alto que ainda nao chega ao minimo deste n). Nenhuma das
     duas cobra ciclo: a meta de amostra e' decisao do analista. */
  if (Math.abs(pct) >= RUIDO_PCT && r2 < r2Minimo) {
    if (r2 >= 0.3) {
      return {
        rotulo: 'Sem direção',
        tom: 'neutro',
        mostrarPct: true,
        frase: `A reta inclina ${variacao}% (${extremos}), mas com ${n} ciclos isso ainda não se `
          + 'distingue do acaso: não é tendência confirmada.',
      };
    }
    return {
      rotulo: 'Sem direção',
      tom: 'neutro',
      mostrarPct: true,
      frase: `A reta inclina ${variacao}% (${extremos}), mas os ciclos sobem e descem sem padrão: `
        + 'é dispersão, não tendência. Olhar o CV% da operação, não a ordem dos ciclos.',
    };
  }

  return {
    rotulo: 'Estável',
    tom: 'ok',
    mostrarPct: false,
    frase: 'Os ciclos não mudaram de forma consistente do início ao fim da coleta: '
      + 'o tempo padrão representa a coleta inteira.',
  };
}
