/**
 * Escalas do sistema visual.
 *
 * Existem porque antes cada componente escolhia numero no olho — 24 aqui,
 * 20 ali, 13px de fonte porque coube. O resultado nao e' feio por um erro
 * grande: e' feio pela soma de dezenas de decisoes sem regra. Escala e' o
 * que faz uma interface parecer feita por alguem, e nao montada.
 */

/** Espacamento em progressao previsivel. Nada fora desta lista. */
export const espaco = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gigante: 64,
};

/**
 * Escala tipografica com razao ~1.2 (terca menor).
 * Cada degrau e' perceptivelmente diferente do vizinho, sem saltos bruscos.
 */
export const texto = {
  micro:    { size: 11, height: 1.45, weight: 600, spacing: '0.06em' },
  legenda:  { size: 12, height: 1.5,  weight: 400, spacing: '0' },
  corpo:    { size: 14, height: 1.6,  weight: 400, spacing: '0' },
  corpoF:   { size: 14, height: 1.6,  weight: 600, spacing: '0' },
  destaque: { size: 17, height: 1.4,  weight: 700, spacing: '-0.01em' },
  titulo:   { size: 21, height: 1.3,  weight: 700, spacing: '-0.015em' },
  display:  { size: 40, height: 1.05, weight: 700, spacing: '-0.03em' },
};

/** Converte um degrau da escala em propriedades CSS. */
export const tipo = (degrau) => ({
  fontSize: texto[degrau].size,
  lineHeight: texto[degrau].height,
  fontWeight: texto[degrau].weight,
  letterSpacing: texto[degrau].spacing,
});

/** Rotulo em caixa alta: sempre micro, sempre com respiro entre letras. */
export const rotulo = (cor) => ({
  ...tipo('micro'),
  textTransform: 'uppercase',
  color: cor,
});

export const raio = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 };

/**
 * Elevacao sutil.
 *
 * Borda de 1px em tudo achata a interface e cria ruido de linha. Sombra
 * suave separa as camadas sem desenhar contorno em volta de cada coisa.
 */
export const elevacao = {
  plana: 'none',
  baixa: '0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.06)',
  media: '0 2px 4px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.07)',
  alta:  '0 8px 24px rgba(16, 24, 40, 0.10), 0 2px 6px rgba(16, 24, 40, 0.06)',
  escuraMedia: '0 2px 8px rgba(0, 0, 0, 0.30)',
  escuraAlta: '0 8px 28px rgba(0, 0, 0, 0.45)',
};

export const transicao = {
  rapida: '120ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '180ms cubic-bezier(0.4, 0, 0.2, 1)',
};

/** Numeros em tabela e indicador: largura fixa por digito, sem "dancar". */
export const numeros = {
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};
