/**
 * Estilos do PAINEL DE GESTAO A VISTA — monitor no chao de fabrica.
 *
 * ESCURO, como a coleta e pelo mesmo motivo: iluminacao irregular de
 * fabrica, e numero claro sobre fundo escuro salta de longe. Nao e' o
 * relatorio numa fonte maior — as escalas aqui sao de LEITURA A METROS,
 * e por isso o cartao mostra poucas coisas e cada uma e' grande.
 *
 * Sem hover, sem foco, sem transicao: ninguem chega perto deste monitor.
 * O verificador (test/checar-estilos.mjs) segue o `import { est }`.
 */
import { cores, espaco, fonte, raio } from '../../theme/tokens.js';

const t = cores;

export const est = {
  tela: {
    minHeight: '100dvh', background: t.fundo, color: t.texto,
    fontFamily: fonte.familia,
    padding: `${espaco.xl}px ${espaco.xxl}px ${espaco.xxl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xl,
  },

  /* ---- topo: de que periodo o painel fala, e quando se atualizou ---- */
  topo: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: espaco.xl, flexWrap: 'wrap',
    borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    paddingBottom: espaco.md,
  },
  titulo: { fontSize: 34, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' },
  subtitulo: { fontSize: 18, color: t.textoFraco, margin: 0 },
  relogio: { fontSize: 18, color: t.textoFraco, fontFamily: fonte.numero, whiteSpace: 'nowrap' },

  /* ---- um bloco por grupo ---- */
  grupo: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  grupoTopo: { display: 'flex', alignItems: 'baseline', gap: espaco.lg, flexWrap: 'wrap' },
  grupoNome: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '0.02em' },
  grupoPendencia: { fontSize: 17, color: t.atencao, fontWeight: 600 },

  /* auto-FIT, nao auto-fill, pela mesma razao do resto do app: num monitor
     de parede buraco a direita e' tela desperdicada, e aqui a tela inteira
     e' o recurso escasso. */
  grade: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
    gap: espaco.lg,
  },

  /* ---- o cartao de cada maquina ---- */
  cartao: {
    background: t.superficie, borderRadius: raio.lg,
    borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    minWidth: 0,
  },
  // VELHA: o numero continua certo sobre o periodo dele, e o cartao para
  // de se apresentar como o ritmo de agora. Ambar, nao vermelho — nao ha'
  // nada errado com a maquina, ha' com a idade do dado.
  cartaoVelho: {
    background: t.superficie, borderRadius: raio.lg,
    borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: t.atencao,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    minWidth: 0,
  },
  // SEM MEDICAO: pendencia de medicao, e a mais urgente do painel — nem
  // se sabe se o posto esta' bem.
  cartaoSemNumero: {
    background: t.superficieAlta, borderRadius: raio.lg,
    borderLeftWidth: 6, borderLeftStyle: 'solid', borderLeftColor: t.critico,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    minWidth: 0,
  },

  maquina: {
    fontSize: 20, fontWeight: 700, letterSpacing: '0.01em',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  // O numero da manchete: e' ele que se le' de longe, e por isso e' o
  // unico que passa dos 40px.
  ritmo: {
    fontSize: 60, fontWeight: 700, lineHeight: 1.05,
    fontFamily: fonte.numero, letterSpacing: '-0.02em',
  },
  ritmoUnidade: { fontSize: 20, color: t.textoFraco, marginLeft: espaco.sm, fontFamily: fonte.familia },
  ritmoVazio: { fontSize: 44, fontWeight: 700, lineHeight: 1.1, color: t.textoFraco },
  linha: { fontSize: 16, color: t.textoFraco, fontFamily: fonte.numero },
  // A IDADE do dado, sempre. Um painel de parede sugere "agora"; sem esta
  // linha, medicao de quarta vira o ritmo de terca sem escrever nada falso.
  idade: { fontSize: 16, color: t.textoFraco },
  idadeVelha: { fontSize: 16, color: t.atencao, fontWeight: 600 },
  pendencia: { fontSize: 16, color: t.critico, fontWeight: 600 },

  vazio: {
    fontSize: 22, color: t.textoFraco, textAlign: 'center',
    padding: `${espaco.xxxl}px ${espaco.xl}px`,
  },
};
