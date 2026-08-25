/**
 * Tokens da experiencia de ANALISE (desktop e impressao).
 *
 * Tema claro de proposito. A coleta e' escura porque acontece de pe' diante
 * da maquina, com luz irregular. A analise acontece sentado, no escritorio,
 * e termina em papel — entao a tela usa a mesma paleta do relatorio impresso.
 * O que aparece no monitor e' o que sai na impressora.
 *
 * Cores de serie validadas com scripts/validate_palette.js (modo light):
 * CVD dE 24,7 · visao normal dE 33,6 · contraste >= 3:1. Todos os testes passam.
 */
import { marca, status } from './tokens.js';

export const claro = {
  fundo: '#F4F5F7',
  papel: '#FFFFFF',
  borda: '#D8DCE2',
  bordaForte: '#B4BBC4',
  texto: '#14171A',
  textoMedio: '#4A525C',
  textoFraco: '#6B7480',
  ...marca,
  ...status,
};

/** Slots categoricos. Ordem fixa — nunca ciclar nem gerar hue novo. */
export const serie = {
  tn: '#2a78d6',        // Tempo Normal — trabalho efetivo
  tolerancia: '#eb6834', // Acrescimo de tolerancia (fadiga/necessidades)
};

/**
 * Linha de referencia (Takt). Nao e' uma serie: e' um limite.
 * Grafite tracejado + rotulo direto, o que sobrevive a impressao em P&B.
 */
export const referencia = {
  linha: marca.grafite,
  traco: '6 4',
};

export const impressao = {
  // A4 util, descontando margem de 12mm de cada lado.
  larguraMm: 186,
  margemMm: 12,
};

export const fonteAnalise = {
  familia: "'Calibri', 'Carlito', 'Segoe UI', system-ui, -apple-system, sans-serif",
  numero: "'Roboto Mono', 'Consolas', 'DejaVu Sans Mono', monospace",
};
