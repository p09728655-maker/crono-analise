/**
 * Estilos do CRONOMETRAR POR VIDEO (v2.99.0) — so' o que e' desta tela.
 * Moldura, painel, cartoes, botoes e janela vem do relatorio (`est` de
 * conferencias/estilos.js), para a tela parecer da mesma casa: aqui fica
 * o player, a barra de controles, as teclas e a lista das marcas.
 */
import { claro } from '../../../theme/tokensAnalise.js';
import {
  elevacao, espaco, numeros, raio, rotulo, tipo,
} from '../../../theme/escala.js';

const t = claro;

export const ev = {
  // Video a' esquerda, marcas a' direita; abaixo de 1100 px, um embaixo do
  // outro (a <style> da tela).
  grade: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
    gap: espaco.lg, alignItems: 'start',
  },
  coluna: { display: 'flex', flexDirection: 'column', gap: espaco.md, minWidth: 0 },
  cartao: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.lg, display: 'flex', flexDirection: 'column', gap: espaco.md, minWidth: 0,
  },
  titulo: { ...tipo('destaque'), margin: 0 },
  dica: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.5 },
  campos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: espaco.md },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs, minWidth: 0 },
  rotulo: { ...rotulo(t.textoFraco) },
  link: {
    alignSelf: 'flex-start', padding: 0, background: 'transparent', border: 'none',
    ...tipo('legenda'), color: t.textoMedio, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit',
  },
  arquivo: { ...tipo('corpo') },

  // O player: fundo preto, altura limitada para os controles caberem sem rolar.
  video: {
    width: '100%', maxHeight: '62dvh', background: '#000', borderRadius: raio.md, display: 'block',
  },
  controlesBloco: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  controles: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap' },
  tempo: { ...tipo('corpoF'), ...numeros, minWidth: 150 },
  barraTempo: { flex: '1 1 260px', minWidth: 160, accentColor: t.vermelho },
  botaoControle: {
    minHeight: 36, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoControleAtivo: { borderColor: t.texto, background: '#EEF0F3' },

  // As acoes que tambem tem tecla: o atalho escrito no proprio botao.
  acoes: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: espaco.sm },
  acao: {
    minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    background: t.papel, borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  acaoVolume: { background: '#1D4ED8', borderColor: '#1D4ED8', color: '#fff' },
  acaoLargada: { background: t.vermelho, borderColor: t.vermelho, color: '#fff' },
  acaoParou: { borderColor: t.atencao, color: t.atencao },
  acaoEncerrar: { borderColor: t.critico, color: t.critico },
  tecla: {
    display: 'inline-block', minWidth: 18, padding: '0 5px', borderRadius: 4,
    borderWidth: 1, borderStyle: 'solid', borderColor: 'currentColor',
    ...tipo('micro'), opacity: 0.85,
  },

  // O que nao marcou, e por que: logo abaixo das acoes, onde se olhou.
  aviso: {
    ...tipo('corpo'), color: t.texto, margin: 0, padding: `${espaco.sm}px ${espaco.md}px`,
    background: t.atencaoFundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
  },
  paradaAberta: {
    ...tipo('corpoF'), color: t.texto, margin: 0, padding: `${espaco.sm}px ${espaco.md}px`,
    background: t.atencaoFundo, borderRadius: raio.sm,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.atencao,
  },

  // Os numeros enquanto marca: os mesmos do tablet.
  numeros: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: espaco.sm },
  numero: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  numeroValor: { ...tipo('destaque'), ...numeros },
  numeroAtencao: { background: t.atencaoFundo, borderRadius: raio.sm, padding: '0 4px', alignSelf: 'flex-start' },
  numeroSub: { ...tipo('legenda'), color: t.textoFraco },

  // A lista das marcas: rola sozinha; clicar leva o video ao ponto.
  lista: {
    maxHeight: '46dvh', overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none',
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
  item: {
    display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto 28px', alignItems: 'center', gap: espaco.sm,
    padding: `${espaco.xs}px 0`, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
  },
  itemParada: { background: t.atencaoFundo },
  itemTempo: {
    padding: 0, background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
    ...tipo('corpoF'), ...numeros, color: t.texto, fontFamily: 'inherit',
    textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
  },
  itemTexto: { ...tipo('legenda'), color: t.textoMedio, minWidth: 0, overflowWrap: 'anywhere' },
  itemNumero: { ...tipo('legenda'), ...numeros, color: t.textoFraco, textAlign: 'right' },
  itemRemover: {
    width: 28, height: 28, padding: 0, background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: t.textoFraco, fontSize: 16, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
  },
  teclas: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.8 },

  // A escolha do motivo da parada: grade de botoes, como no tablet.
  motivos: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: espaco.sm },
  motivo: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  observacao: {
    minHeight: 72, padding: espaco.md, background: t.fundo, resize: 'vertical',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  },
  ok: {
    ...tipo('corpoF'), color: t.texto, margin: 0, padding: `${espaco.md}px ${espaco.lg}px`,
    background: t.okFundo, borderRadius: raio.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.ok,
  },
  linhaBotoes: { display: 'flex', gap: espaco.sm, flexWrap: 'wrap', alignItems: 'center' },
};
