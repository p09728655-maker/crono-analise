/**
 * Estilos da DEMANDA SEMANAL — a janela inteira num lugar so'.
 *
 * A tela e' montada por varios quadros (tempo disponivel, semana digitada,
 * colagem da planilha, programa gravado) e todos precisam parecer da mesma
 * casa: mesmo botao, mesmo campo, mesma tabela. Cada quadro com o proprio
 * objeto de estilos foi o que fez dois botoes iguais nascerem com alturas
 * diferentes em outras telas. O verificador (test/checar-estilos.mjs)
 * segue o `import { est }` e confere as chaves usadas contra este arquivo.
 */
import { claro } from '../../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../../theme/escala.js';

const t = claro;

export const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  caixa: {
    width: '100%', maxWidth: 760, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },

  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  campoCurto: { display: 'flex', flexDirection: 'column', gap: espaco.xs, maxWidth: 260, flex: 1 },
  rotuloCampo: rotulo(t.textoFraco),
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic' },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  campoEstreito: { display: 'flex', flexDirection: 'column', gap: espaco.xs, width: 150 },
  linhaCampos: { display: 'flex', gap: espaco.md, alignItems: 'flex-end', flexWrap: 'wrap' },

  /* ---- tempo disponivel: dois grupos de campos e a conta ---- */
  gradeTempo: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: espaco.md,
  },
  // fieldset com a moldura do navegador zerada: o agrupamento visual e' a
  // legenda em caixa alta, nao a borda cinza de formulario dos anos 90.
  grupoCampos: {
    margin: 0, padding: `${espaco.md}px ${espaco.md}px ${espaco.md}px`, minWidth: 0,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    background: t.papel,
  },
  legendaCampos: { ...rotulo(t.textoMedio), padding: `0 ${espaco.xs}px` },
  contaTempo: {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: espaco.sm,
  },
  contaCaixa: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // O resultado e' o unico dos tres que o relatorio usa: borda mais forte,
  // nao cor de alerta — produtivas nao e' problema, e' a resposta.
  contaCaixaResultado: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.papel, borderRadius: raio.sm,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.bordaForte,
  },
  contaCaixaAlerta: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.md}px`, background: t.criticoFundo, borderRadius: raio.sm,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.critico,
  },
  contaRotulo: { ...rotulo(t.textoFraco) },
  contaValor: { ...tipo('titulo'), ...numeros, color: t.texto, lineHeight: 1.1 },
  contaValorVazio: { ...tipo('titulo'), ...numeros, color: t.textoFraco, lineHeight: 1.1 },
  contaUnidade: { ...tipo('legenda'), color: t.textoMedio, marginLeft: espaco.xs },
  contaFormula: { ...tipo('legenda'), ...numeros, color: t.textoMedio, lineHeight: 1.35 },

  bloco: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  blocoTitulo: { ...rotulo(t.textoFraco) },
  blocoTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },
  blocoAviso: { ...tipo('legenda'), color: t.textoFraco, margin: 0, fontStyle: 'italic' },

  areaColagem: {
    width: '100%', minHeight: 120, padding: espaco.md, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('legenda'),
    fontFamily: "'Roboto Mono', 'Consolas', monospace", outline: 'none', resize: 'vertical',
  },
  previa: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    padding: espaco.md, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  previaTitulo: { ...tipo('corpoF'), color: t.texto },
  previaLinhas: { display: 'flex', gap: espaco.md, flexWrap: 'wrap' },
  previaItem: { ...tipo('legenda'), ...numeros, color: t.textoMedio },
  // Aviso NAO impede gravar: a planilha real tem linha torta, e recusar
  // tudo por causa de uma devolveria o trabalho sem motivo.
  aviso: {
    padding: `${espaco.xs}px ${espaco.sm}px`, background: t.fundo, borderRadius: raio.sm,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: '#D97706',
    ...tipo('legenda'), color: t.texto,
  },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },

  tabelaBox: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoFraco), borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoFraco), borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  td: {
    padding: `${espaco.sm}px ${espaco.md}px`, ...tipo('corpo'), ...numeros,
    color: t.texto, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', ...tipo('corpo'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdPeriodo: {
    padding: `${espaco.sm}px ${espaco.md}px`, ...tipo('legenda'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdAcoes: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },

  botaoPrimario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 36, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoTexto: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
  },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  acoes: { display: 'flex', gap: espaco.md, alignItems: 'center', flexWrap: 'wrap' },
};
