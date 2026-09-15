/**
 * Estilos do CADASTRO DE MAQUINAS — a janela inteira num lugar so'.
 *
 * A tela e' montada pela coluna de grupos, pelo painel de maquinas e pela
 * folha impressa, e os tres precisam parecer da mesma casa: mesmo botao,
 * mesmo campo, mesma linha. O verificador (test/checar-estilos.mjs) segue
 * o `import { est }` e confere as chaves usadas contra este arquivo.
 *
 * `t` sai junto porque a regra de :hover da coluna de grupos e' escrita
 * como CSS de verdade (estilo inline nao faz :hover) e precisa da cor.
 */
import { claro } from '../../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../../theme/escala.js';

export const t = claro;

export const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  /**
   * A caixa nao cresce sem fim: ela para na altura da janela e quem rola e'
   * a LISTA, la' dentro. Antes, com 30 maquinas, o cadastro e a busca
   * subiam junto com o scroll e sumiam da tela — cadastrar exigia rolar de
   * volta ao fim da pagina toda vez.
   */
  caixa: {
    width: '100%', maxWidth: 940, maxHeight: 'calc(100dvh - 48px)',
    background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  topo: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: espaco.lg },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: `${espaco.xs}px 0 0`, color: t.textoMedio, maxWidth: 620 },

  /* Duas colunas: grupos a esquerda, maquinas do grupo a direita. Em tela
     estreita elas empilham — a lateral vira uma faixa de grupos em cima. */
  colunas: {
    display: 'flex', gap: espaco.lg, alignItems: 'stretch',
    flexWrap: 'wrap', minHeight: 0, flex: 1,
  },
  lateral: {
    flex: '1 1 232px', maxWidth: 280, minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: espaco.md, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    alignSelf: 'flex-start',
  },
  blocoRotulo: { ...rotulo(t.textoFraco), padding: `${espaco.xs}px ${espaco.sm}px` },

  itemGrupo: {
    display: 'flex', alignItems: 'center', gap: espaco.sm, width: '100%',
    minHeight: 34, padding: `0 ${espaco.sm}px`, textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  // O grupo aberto e' o contexto de tudo o que aparece a' direita — e de
  // onde a proxima maquina vai nascer. Precisa ficar claro qual e'.
  itemGrupoAtivo: { background: t.papel, color: t.texto, fontWeight: 600, boxShadow: elevacao.baixa },
  itemGrupoNome: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemGrupoContador: { ...tipo('legenda'), color: t.textoFraco, flexShrink: 0 },
  codigoGrupo: {
    padding: '1px 6px', borderRadius: raio.sm, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), letterSpacing: 1, flexShrink: 0,
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  avisoGrupo: {
    ...tipo('legenda'), color: t.textoMedio, margin: 0,
    padding: `0 ${espaco.sm}px ${espaco.sm}px`, lineHeight: 1.5,
  },
  acoesGrupo: {
    display: 'flex', gap: espaco.md, flexWrap: 'wrap',
    padding: `${espaco.xs}px ${espaco.sm}px ${espaco.sm}px`,
  },
  botaoNovoGrupo: {
    marginTop: espaco.xs, minHeight: 34, padding: `0 ${espaco.sm}px`, textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  formGrupo: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.sm, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  formGrupoAcoes: { display: 'flex', gap: espaco.md, alignItems: 'center', justifyContent: 'flex-end' },
  inputCodigo: {
    width: 90, minHeight: 36, padding: `0 ${espaco.sm}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), outline: 'none',
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },

  painel: {
    flex: '3 1 420px', minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  /* O cadastro no TOPO e a lista rolando embaixo: e' o que faz cadastrar
     oito furadeiras seguidas ser oito digitacoes, e nada mais. */
  novaLinha: { display: 'flex', gap: espaco.sm, alignItems: 'center', flexWrap: 'wrap' },
  destinoCadastro: { ...tipo('legenda'), color: t.textoMedio, whiteSpace: 'nowrap' },
  listaMaquinas: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    overflowY: 'auto', minHeight: 0, maxHeight: '52dvh',
    paddingRight: espaco.xs,
  },
  grupoTitulo: { ...rotulo(t.textoFraco), margin: `${espaco.md}px 0 ${espaco.xs}px` },
  linha: {
    display: 'flex', alignItems: 'center', gap: espaco.sm,
    minHeight: 40, padding: `0 ${espaco.md}px`, background: t.fundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // Desativada continua legivel: ela ainda nomeia conferencia antiga.
  linhaInativa: { opacity: 0.62 },
  linhaRotulo: {
    flex: 1, minWidth: 0, ...tipo('corpo'), color: t.texto,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  seloInativo: {
    padding: '1px 6px', borderRadius: raio.pill, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), flexShrink: 0,
  },
  linhaBotoes: { display: 'flex', gap: espaco.md, flexShrink: 0, alignItems: 'center' },

  form: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  formAcoes: { display: 'flex', gap: espaco.md, justifyContent: 'flex-end', alignItems: 'center' },
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic', margin: 0 },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },
  vazioAcoes: { display: 'flex', gap: espaco.md, flexWrap: 'wrap', marginTop: espaco.sm },

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
  botaoTexto: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
  },
  // Excluir nao tem o mesmo peso de Editar: ele apaga cadastro, e so' pede
  // confirmacao depois do clique. Fica em cinza fraco, sem sublinhado.
  botaoExcluir: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoFraco, ...tipo('legenda'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: t.critico,
    border: 'none', borderRadius: raio.sm, color: '#fff',
    ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  acoes: { display: 'flex', gap: espaco.md },
};
