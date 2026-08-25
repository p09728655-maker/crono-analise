/**
 * Estatistica de cronoanalise — funcoes puras, sem dependencia de UI.
 *
 * Todos os tempos trafegam em MILISSEGUNDOS (inteiros). A conversao para
 * segundos acontece so na borda de apresentacao. Isso evita erro de
 * arredondamento acumulado ao longo de dezenas de observacoes.
 */

/** Toque abaixo disso e' considerado acidental (dedo/luva encostando duas vezes). */
export const TOQUE_MINIMO_MS = 200;

/** Z para 95% de confianca, usado na formula de Nievel. */
export const Z_95 = 1.96;

/** Erro relativo admitido (%) padrao para dimensionamento de amostra. */
export const ERRO_PADRAO_PCT = 5;

export const MS_POR_HORA = 3_600_000;

/** Descarta toques acidentais. E' o unico filtro aplicado ao dado bruto. */
export function temposValidos(tempos) {
  if (!Array.isArray(tempos)) return [];
  return tempos.filter((t) => typeof t === 'number' && Number.isFinite(t) && t > TOQUE_MINIMO_MS);
}

export function media(valores) {
  if (!valores.length) return 0;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

/**
 * Desvio padrao AMOSTRAL (denominador n-1).
 * Cronoanalise trabalha com amostra de ciclos, nunca com a populacao inteira,
 * entao n-1 e' o denominador correto.
 */
export function desvioPadrao(valores) {
  if (valores.length < 2) return 0;
  const m = media(valores);
  const soma = valores.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(soma / (valores.length - 1));
}

/** Coeficiente de variacao em %. Mede a estabilidade do processo. */
export function coeficienteVariacao(valores) {
  if (valores.length < 2) return 0;
  const m = media(valores);
  if (m === 0) return 0;
  return (desvioPadrao(valores) / m) * 100;
}

/**
 * Formula de Nievel: numero minimo de observacoes para validade estatistica.
 *   n = (Z * CV% / erro%)^2
 * Com 95% de confianca e +-5% de erro: n = (1,96 * CV / 5)^2
 */
export function observacoesMinimas(cvPct, { z = Z_95, erroPct = ERRO_PADRAO_PCT } = {}) {
  if (!cvPct || cvPct <= 0) return 0;
  return Math.ceil((z * cvPct / erroPct) ** 2);
}

/** Classificacao de estabilidade a partir do CV%. Cor NUNCA vem sozinha. */
export function classificarEstabilidade(cvPct) {
  if (cvPct <= 10) return { nivel: 'estavel', rotulo: 'Estável', descricao: 'Processo consistente' };
  if (cvPct <= 20) return { nivel: 'atencao', rotulo: 'Variação moderada', descricao: 'Investigar causas de dispersão' };
  return { nivel: 'critico', rotulo: 'Alta variação', descricao: 'Processo instável — padronizar antes de cronometrar' };
}

/**
 * Limites da carta de controle (+-3 sigma).
 * Limite inferior nunca e' negativo: tempo negativo nao existe.
 */
export function cartaDeControle(valores) {
  const m = media(valores);
  const sd = desvioPadrao(valores);
  return {
    media: m,
    sd,
    lsc: m + 3 * sd,
    lic: Math.max(0, m - 3 * sd),
  };
}

/** Observacoes fora de +-3 sigma — candidatas a causa especial. */
export function foraDeControle(valores) {
  if (valores.length < 2) return [];
  const { lsc, lic } = cartaDeControle(valores);
  return valores
    .map((valor, indice) => ({ valor, indice }))
    .filter(({ valor }) => valor > lsc || valor < lic);
}

/**
 * Tendencia por regressao linear simples sobre a ordem das observacoes.
 * Serve para detectar curva de aprendizado (tempos caindo) ou fadiga (subindo).
 */
export function tendencia(valores) {
  const n = valores.length;
  if (n < 3) return { slope: 0, r2: 0, direcao: 'estavel', pct: 0 };

  const somaX = (n * (n - 1)) / 2;
  const somaXX = (n * (n - 1) * (2 * n - 1)) / 6;
  const somaY = valores.reduce((acc, v) => acc + v, 0);
  const somaXY = valores.reduce((acc, v, i) => acc + i * v, 0);

  const denominador = n * somaXX - somaX * somaX;
  if (denominador === 0) return { slope: 0, r2: 0, direcao: 'estavel', pct: 0 };

  const slope = (n * somaXY - somaX * somaY) / denominador;
  const mediaY = somaY / n;
  const intercepto = (somaY - slope * somaX) / n;

  const ssTot = valores.reduce((acc, v) => acc + (v - mediaY) ** 2, 0);
  const ssRes = valores.reduce((acc, v, i) => acc + (v - (intercepto + slope * i)) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  const variacaoTotal = slope * (n - 1);
  const pct = mediaY === 0 ? 0 : (variacaoTotal / mediaY) * 100;

  let direcao = 'estavel';
  if (Math.abs(pct) >= 5 && r2 >= 0.3) direcao = slope < 0 ? 'aprendizado' : 'degradacao';

  return { slope, r2, direcao, pct };
}

/** Mediana. Base dos indicadores robustos. */
export function mediana(valores) {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}

/**
 * MAD (Median Absolute Deviation) escalado para ser comparavel ao desvio padrao.
 * O fator 1,4826 faz o MAD convergir para sigma em distribuicao normal.
 */
export const FATOR_MAD = 1.4826;

export function mad(valores) {
  if (valores.length < 2) return 0;
  const med = mediana(valores);
  return mediana(valores.map((v) => Math.abs(v - med))) * FATOR_MAD;
}

/** Fator que faz o desvio absoluto medio convergir para sigma na normal. */
export const FATOR_MEANAD = 1.2533;

/**
 * Escala robusta de dispersao, com fallback.
 *
 * O MAD zera quando mais da metade das observacoes e' identica — situacao
 * comum em ciclo de maquina muito repetitivo, como a furadeira. Nesse caso
 * cai para o desvio absoluto medio, que so' zera se TODOS os valores forem
 * iguais (a' onde realmente nao existe outlier).
 */
export function escalaRobusta(valores) {
  if (valores.length < 2) return 0;
  const escalaMad = mad(valores);
  if (escalaMad > 0) return escalaMad;
  const med = mediana(valores);
  const meanAd = media(valores.map((v) => Math.abs(v - med))) * FATOR_MEANAD;
  return meanAd;
}

/**
 * Deteccao ROBUSTA de observacao atipica.
 *
 * Existe porque a carta +-3 sigma sofre efeito de mascaramento: um unico
 * ciclo grosseiramente errado infla o proprio desvio padrao e passa a caber
 * dentro dos limites. Ex.: serie de ~1000ms com um ciclo de 5000ms eleva o
 * LSC de 1018ms para 5444ms e o outlier deixa de ser sinalizado.
 *
 * Mediana e MAD nao se deixam arrastar por pontos extremos, entao esta e' a
 * deteccao usada durante a COLETA, quando ainda da' tempo de reagir.
 */
export function outliersRobustos(valores, limite = 3.5) {
  if (valores.length < 4) return [];
  const med = mediana(valores);
  const escala = escalaRobusta(valores);
  if (escala === 0) return [];
  return valores
    .map((valor, indice) => ({ valor, indice, escore: Math.abs(valor - med) / escala }))
    .filter((o) => o.escore > limite);
}

/**
 * A ultima observacao destoa do padrao ja estabelecido?
 * Compara o novo ciclo contra o historico ANTERIOR — nunca contra uma serie
 * que ja inclui o proprio ponto, o que diluiria o desvio.
 */
export function ultimaObservacaoAtipica(valores, limite = 3.5) {
  if (valores.length < 5) return null;
  const historico = valores.slice(0, -1);
  const atual = valores[valores.length - 1];
  const med = mediana(historico);
  const escala = escalaRobusta(historico);
  if (escala === 0) return null;
  const escore = Math.abs(atual - med) / escala;
  if (escore <= limite) return null;
  return { valor: atual, escore, mediana: med, acima: atual > med };
}
