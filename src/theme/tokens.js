/**
 * Design tokens — Patrimar Moveis.
 *
 * Regra critica de cor: o vermelho institucional (#DB2126) e' identidade,
 * NAO status. Se ele tambem sinalizasse erro, o operador perderia a
 * capacidade de distinguir "isto e' da Patrimar" de "isto esta com problema".
 * Estado critico usa laranja/ambar forte, sempre com icone e texto junto.
 */

export const marca = {
  vermelho: '#DB2126',
  bordeaux: '#A8140F',
  areia: '#F7ECC0',
  grafite: '#1F2328',
};

export const status = {
  ok: '#15803D',
  okFundo: 'rgba(21, 128, 61, 0.12)',
  atencao: '#B45309',
  atencaoFundo: 'rgba(180, 83, 9, 0.12)',
  // Laranja queimado, deliberadamente distinto do vermelho de marca.
  critico: '#C2410C',
  criticoFundo: 'rgba(194, 65, 12, 0.14)',
  neutro: '#64748B',
};

/**
 * Tema escuro por padrao na tela de coleta: o analista fica em pe' diante da
 * maquina, com iluminacao irregular. Fundo escuro reduz ofuscamento e faz o
 * cronometro claro saltar a' vista de longe.
 */
export const cores = {
  fundo: '#14171A',
  superficie: '#1F2328',
  superficieAlta: '#2A3038',
  borda: '#3A424C',
  texto: '#F5F7FA',
  textoFraco: '#9AA5B1',
  ...marca,
  ...status,
};

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const raio = { sm: 6, md: 10, lg: 14, pill: 999 };

export const fonte = {
  familia: "'Calibri', 'Carlito', 'Segoe UI', system-ui, -apple-system, sans-serif",
  // Fonte tabular para numeros: impede o cronometro de "dancar" a cada
  // decimo, porque todo digito ocupa a mesma largura.
  numero: "'Roboto Mono', 'Consolas', 'DejaVu Sans Mono', monospace",
};

export const tamanho = {
  legenda: 11,
  pequeno: 13,
  corpo: 15,
  titulo: 18,
  destaque: 24,
  numero: 40,
  // Cronometro legivel a ~2 metros da tela.
  cronometro: 72,
};

/**
 * Alvo minimo de toque. O padrao de acessibilidade e' 44px, mas o operador
 * usa luva de raspa e o tablet fica preso na bancada: 64px e' o piso aqui, e
 * a acao principal e' muito maior que isso.
 */
export const ALVO_MINIMO = 64;

export const sombra = {
  media: '0 4px 12px rgba(0,0,0,0.35)',
  alta: '0 8px 24px rgba(0,0,0,0.45)',
};

export const transicao = { rapida: '120ms ease', normal: '200ms ease' };
