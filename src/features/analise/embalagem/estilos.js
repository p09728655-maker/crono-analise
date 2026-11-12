/**
 * Estilos do relatorio PERDAS DA EMBALAGEM (v2.110.0) — so' o que e' desta
 * tela. Moldura, KPIs, tabela, painel e pareto vem do relatorio de ritmo
 * (`est` de conferencias/estilos.js), para a tela parecer da mesma casa.
 */
import { claro } from '../../../theme/tokensAnalise.js';
import { espaco, numeros, raio, rotulo, tipo } from '../../../theme/escala.js';

const t = claro;

export const ep = {
  topo: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: espaco.lg,
    flexWrap: 'wrap', marginBottom: espaco.lg,
  },
  titulo: { ...tipo('destaque'), margin: 0 },
  subtitulo: { ...tipo('legenda'), color: t.textoMedio, margin: `${espaco.xs}px 0 0`, maxWidth: 760, lineHeight: 1.5 },
  // O numero que decide: o tempo sem produzir, com a borda da cor de atencao.
  kpiDestaque: { borderColor: t.critico, borderWidth: 2 },
  secaoTitulo: { ...tipo('corpoF'), margin: 0 },
  secaoDica: { ...tipo('legenda'), color: t.textoMedio, margin: `2px 0 0`, lineHeight: 1.5 },
  // O motivo que nao diz o motivo: ambar, porque esconde a causa.
  avisoOutro: {
    ...tipo('legenda'), color: t.texto, margin: `${espaco.md}px 0 0`, lineHeight: 1.5,
    padding: `${espaco.sm}px ${espaco.md}px`, background: t.atencaoFundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
  },
  rotuloOutro: { fontWeight: 700 },
  vezes: { ...tipo('legenda'), color: t.textoFraco, marginLeft: espaco.xs },
  // A hora extra: uma grade de rotulo + uma coluna por semana.
  horaGrade: {
    // As colunas (rotulo + uma por semana) vem da tela, que sabe quantas semanas ha'.
    display: 'grid',
    marginTop: espaco.md, ...tipo('corpo'), ...numeros,
  },
  horaRotulo: { padding: `${espaco.sm}px ${espaco.md}px ${espaco.sm}px 0`, color: t.textoMedio, borderBottom: `1px solid ${t.borda}` },
  horaCabeca: { ...rotulo(t.textoFraco), padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', borderBottom: `1px solid ${t.borda}` },
  horaValor: { padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap' },
  horaValorForte: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', borderBottom: `1px solid ${t.borda}`,
    whiteSpace: 'nowrap', fontWeight: 700, color: t.texto,
  },
  // O nome inteiro: cortado, "HOME RIPADO SUPREMO 2.3 VOL 1/3" e "2/3"
  // viravam a mesma linha (revisao da v2.110.0).
  tdProduto: {
    padding: espaco.lg, ...tipo('corpo'), color: t.textoMedio, borderBottom: `1px solid ${t.borda}`,
    minWidth: 220, maxWidth: 360, overflowWrap: 'anywhere',
  },
  notas: { ...tipo('legenda'), color: t.textoMedio, lineHeight: 1.6, margin: 0, paddingLeft: espaco.lg },
  verTodos: {
    margin: `${espaco.md}px ${espaco.lg}px`, padding: 0, background: 'transparent', border: 'none',
    ...tipo('legenda'), color: t.textoMedio, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit',
  },
};
