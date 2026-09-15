/**
 * Estilos dos GRAFICOS — a moldura, a legenda e os quadros pequenos.
 *
 * Todos os quatro graficos dividem este objeto porque precisam parecer da
 * mesma casa: mesma figura, mesma legenda, mesmo rotulo de eixo. Parte
 * dele e' contrato com a FOLHA A4 (RelatorioImpressao e
 * ImpressaoConferencias usam os mesmos componentes), entao pixel mexido
 * aqui muda a paginacao do papel. O verificador (test/checar-estilos.mjs)
 * segue o `import { est }` e confere as chaves usadas contra este arquivo.
 */
import { claro } from '../../../theme/tokensAnalise.js';

export const est = {
  figura: { margin: 0, background: claro.papel, border: `1px solid ${claro.borda}`, borderRadius: 10, padding: 20 },
  titulo: { display: 'block', fontSize: 15, fontWeight: 700, color: claro.texto, marginBottom: 4 },
  subtitulo: { display: 'block', fontSize: 12, fontWeight: 400, color: claro.textoFraco, marginTop: 2 },
  legenda: { display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0', fontSize: 12, color: claro.textoMedio },
  legendaItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  legendaMarca: { width: 12, height: 12, borderRadius: 3, display: 'inline-block' },
  rolagem: { overflowX: 'auto' },
  rotuloEixo: { fontSize: '11px', fill: claro.textoFraco },
  tituloEixo: { fontSize: '11px', fill: claro.textoFraco },
  rotuloCategoria: { fontSize: '11px', fill: claro.textoMedio },
  rotuloReferencia: { fontSize: '10px', fill: claro.grafite, fontWeight: 700, letterSpacing: '0.5px' },
  valorBarra: { fontSize: '11px', fill: claro.texto, fontWeight: 700 },
  tooltip: {
    marginTop: 12, padding: '10px 14px', background: claro.fundo,
    border: `1px solid ${claro.borda}`, borderRadius: 6,
    display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: claro.textoMedio,
    // Quatro linhas de 2px de gap: a altura nao pode depender do conteudo,
    // senao o layout volta a pular entre ter e nao ter detalhe.
    minHeight: 86, boxSizing: 'border-box',
  },
  tooltipVazio: {
    marginTop: 12, padding: '10px 14px', background: claro.fundo,
    border: `1px dashed ${claro.borda}`, borderRadius: 6,
    display: 'flex', alignItems: 'center', fontSize: 12, color: claro.textoFraco,
    minHeight: 86, boxSizing: 'border-box',
  },
  vazio: {
    padding: 40, textAlign: 'center', color: claro.textoFraco, fontSize: 13,
    background: claro.papel, border: `1px dashed ${claro.borda}`, borderRadius: 10,
  },
  figuraQuebravel: {
    margin: 0, background: claro.papel, border: `1px solid ${claro.borda}`, borderRadius: 10, padding: 20,
    breakInside: 'auto', pageBreakInside: 'auto',
  },
  gradeTendencia: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14,
  },
  /* Geometria compartilhada com a folha A4 — o que e' so' de tela esta' em
     ESTILO_TELA_MINI. padding 12 e' contrato com o e2e (desconta 24 da celula). */
  miniTendencia: {
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: 8,
    padding: 12, minWidth: 0, background: claro.papel, breakInside: 'avoid', pageBreakInside: 'avoid',
  },
  miniTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 6, minWidth: 0,
  },
  miniNome: {
    fontSize: 13, fontWeight: 700, color: claro.texto,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
  },
  miniSelo: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3px', whiteSpace: 'nowrap',
    padding: '1px 8px', borderRadius: 999, borderWidth: 1, borderStyle: 'solid',
    background: claro.papel,
  },
  miniLeitura: { margin: '8px 0 0', fontSize: 11.5, lineHeight: 1.45, color: claro.textoMedio },
};
