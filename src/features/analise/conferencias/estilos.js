/**
 * Estilos do RELATORIO RITMO POR MAQUINA — a tela (`est`) e a folha A4
 * (`imp`), num lugar so'.
 *
 * O relatorio e' montado por varios componentes (cartoes, tabelas,
 * janelas, folha impressa), e todos precisam parecer da mesma casa:
 * mesmo botao, mesma tabela, mesma janela. Cada componente com o proprio
 * objeto de estilos foi o que fez dois botoes iguais nascerem com alturas
 * diferentes em outras telas. O verificador (test/checar-estilos.mjs)
 * segue o `import { est }` e confere as chaves usadas contra este arquivo.
 */
import { claro } from '../../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../../theme/escala.js';

const t = claro;

export const est = {
  tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
  telaComLateral: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start' },
  conteudoLateral: {
    // Sem max-width: em monitor largo o relatorio ocupa a tela toda em vez
    // de deixar uma faixa vazia a direita (apontado em 28/08).
    flex: 1, minWidth: 0,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },

  /* ---- comparativo: o que saiu x o que teria saido no mesmo tempo ---- */
  comparativo: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  comparativoTopo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  comparativoTitulo: { ...tipo('corpoF'), margin: 0 },
  comparativoDica: { ...tipo('legenda'), color: t.textoMedio, margin: 0, maxWidth: 760 },
  comparativoGrade: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: espaco.lg, alignItems: 'stretch',
  },
  comparativoCaixa: {
    background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // O que deixou de sair e' o numero que muda a conversa: fundo, borda e
  // corpo proprios. Cor nao carrega a informacao sozinha — o rotulo diz.
  comparativoCaixaDestaque: {
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 2, borderStyle: 'solid', borderColor: t.critico,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // textoFraco sobre o fundo cinza da caixa dava 4.34:1 (piso 4.5) e o
  // rotulo do destaque, 4.22:1 — o texto mais fraco era justamente o que
  // nomeia o numero mais importante. Medido em 31/08.
  comparativoRotulo: { ...rotulo(t.textoMedio) },
  comparativoRotuloDestaque: { ...rotulo(t.texto) },
  comparativoValor: { ...tipo('display'), ...numeros, lineHeight: 1.1 },
  comparativoValorDestaque: { ...tipo('display'), ...numeros, lineHeight: 1.1, color: t.critico },
  comparativoUnidade: { ...tipo('corpo'), color: t.textoMedio, marginLeft: espaco.sm },
  comparativoSub: { ...tipo('legenda'), ...numeros, color: t.textoMedio },
  comparativoSubDestaque: { ...tipo('legenda'), ...numeros, color: t.texto },
  comparativoNota: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },

  /* ---- faixa de numeros do topo ---- */
  kpis: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))',
    gap: espaco.md, marginBottom: espaco.xl,
  },
  kpi: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  kpiRotulo: { ...rotulo(t.textoFraco) },
  kpiValor: { ...tipo('display'), ...numeros, lineHeight: 1.15, marginTop: 2 },
  kpiSub: { ...tipo('legenda'), color: t.textoMedio, marginTop: 2 },

  /* ---- paradas (pareto) ---- */
  duasColunas: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  painelMiolo: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, padding: espaco.xl,
  },
  paretoLinha: {
    display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto',
    gap: espaco.md, alignItems: 'center', ...tipo('corpo'), ...numeros,
  },
  paretoTrilha: { height: 10, background: '#EDF0F3', borderRadius: raio.pill, overflow: 'hidden' },
  paretoBarra: { display: 'block', height: '100%', borderRadius: raio.pill, background: '#D97706' },

  resumoGrade: {
    // auto-FIT, nao auto-fill: com uma maquina filtrada, o cartao ESTICA e
    // ocupa a tela em vez de deixar um buraco a direita (apontado em 28/08).
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  cartaoMaquina: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.sm,
  },
  cartaoTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.md, flexWrap: 'wrap',
  },
  cartaoGrupo: {
    display: 'block', ...tipo('micro'), color: t.textoFraco,
    letterSpacing: 1, marginTop: 2,
  },
  cartaoTitulo: { ...tipo('corpoF') },
  cartaoRitmo: {
    ...tipo('display'), ...numeros,
    display: 'flex', alignItems: 'baseline', gap: espaco.sm,
  },
  cartaoRitmoSufixo: { ...tipo('legenda'), color: t.textoFraco },
  // Pedido de 31/08: o mesmo ritmo em pecas por MINUTO, logo abaixo do
  // numero grande — e' a escala em que o posto pensa (contador de pecas).
  cartaoRitmoMinuto: { ...tipo('corpoF'), ...numeros, color: t.textoMedio },
  cartaoLinhas: {
    display: 'flex', flexDirection: 'column', gap: 2,
    ...tipo('legenda'), ...numeros, color: t.textoMedio,
  },
  // Nota discreta, em cinza: informa sem carimbar o numero de "errado".
  notaPoucas: { ...tipo('legenda'), color: t.textoFraco, lineHeight: 1.5 },

  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  /* O botao que mexe em VARIAS linhas nao pode ser igual ao que mexe em uma:
     eram gemeos a 25 px de distancia no mesmo painel, so' a largura mudava.
     Borda mais forte e texto mais pesado — sem virar acao primaria, que na
     tela e' so' Imprimir. */
  botaoLote: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.sm,
    color: t.texto, ...tipo('legenda'), fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  botaoLinha: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoExcluir: {
    width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
    borderRadius: raio.sm, color: t.textoFraco, fontSize: 18, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  tdAcoes: {
    padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${t.borda}`,
  },

  painelGrafico: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
  },

  painelIa: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: t.textoFraco, margin: '2px 0 0' },
  /* ---- analise automatica (por regra, sem IA) ---- */
  analiseTopo: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
  },
  // Alvo de clique generoso: o rotulo inteiro alterna a caixa.
  rotuloPapel: {
    display: 'inline-flex', alignItems: 'center', gap: espaco.sm,
    minHeight: 32, ...tipo('legenda'), color: t.textoMedio,
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  },
  caixaPapel: { width: 16, height: 16, margin: 0, accentColor: t.vermelho, cursor: 'pointer' },
  analiseSecao: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  analiseTitulo: { ...rotulo(t.textoFraco), margin: 0 },
  analiseLinha: { ...tipo('corpo'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },
  // A opcao de IA fica depois da analise, separada por um fio: presente
  // para quem quiser, invisivel para quem nao precisa.
  iaOpcional: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    paddingTop: espaco.md, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
  iaErro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  iaResposta: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  iaRespostaTexto: { ...tipo('corpo'), color: t.texto, whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  iaMeta: { ...tipo('legenda'), color: t.textoFraco },

  faixaErro: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md, marginBottom: espaco.lg,
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    ...tipo('legenda'), color: t.texto,
  },
  /* Flutua sobre a pagina, presa a' JANELA e nao ao topo do documento: a
     recusa de um clique dado no fim da tabela precisa ser lida sem rolar
     dois metros para cima. */
  avisoFlutuante: {
    position: 'fixed', zIndex: 40,
    left: '50%', bottom: espaco.xl, transform: 'translateX(-50%)',
    width: 'max-content', maxWidth: 'min(760px, calc(100vw - 32px))',
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    boxShadow: elevacao.alta, ...tipo('corpo'), color: t.texto,
  },

  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg,
  },
  caixaModal: {
    width: '100%', maxWidth: 520, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  tituloModal: { ...tipo('titulo'), margin: 0 },
  rotuloCampo: { ...rotulo(t.textoFraco), marginBottom: -espaco.xs },
  inputNome: {
    minHeight: 40, padding: `0 ${espaco.md}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', width: '100%',
  },
  /* O nome da peca na tabela e' BOTAO, mas nao pode parecer um: e' o dado
     da linha. A pista de que da' para clicar e' o sublinhado pontilhado. */
  botaoNome: {
    padding: 0, background: 'transparent', border: 'none', textAlign: 'left',
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', cursor: 'pointer',
    textDecoration: 'underline', textDecorationStyle: 'dotted',
    textUnderlineOffset: 3, textDecorationColor: t.textoFraco,
  },
  textoModal: { ...tipo('corpo'), margin: 0, color: t.textoMedio },
  acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },

  /* ---- cadastro de paradas ---- */
  linhaBotoesParada: { display: 'flex', gap: espaco.sm, flexWrap: 'wrap' },
  // Setup com borda de atencao: e' a parada mais marcada e a unica que o
  // processo exige. Cor sozinha nao identifica nada aqui — o rotulo diz.
  botaoSetup: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  listaParadas: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    maxHeight: '38vh', overflowY: 'auto',
  },
  linhaParada: { display: 'flex', alignItems: 'center', gap: espaco.sm, minWidth: 0 },
  selectMotivo: {
    flex: '0 0 200px', minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },
  inputMinutos: {
    width: 72, flexShrink: 0, minHeight: 38, textAlign: 'right',
    padding: `0 ${espaco.sm}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpoF'), ...numeros, fontFamily: 'inherit',
  },
  sufixoMinutos: { flexShrink: 0, ...tipo('legenda'), color: t.textoFraco },
  inputObs: {
    flex: 1, minWidth: 0, minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },

  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, overflowX: 'auto', marginBottom: espaco.xl,
  },
  painelTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: `${espaco.lg}px ${espaco.lg}px ${espaco.md}px`,
  },
  // A nota encolhe; o botao fica na direita, na mesma linha do titulo. Sem
  // isto o texto ocupava a largura toda e empurrava o botao para baixo.
  painelTopoTexto: { flex: '1 1 320px', minWidth: 0 },
  dicaCurva: {
    ...tipo('legenda'), color: t.textoMedio, margin: `0 0 ${espaco.xl}px`,
    padding: `${espaco.md}px ${espaco.lg}px`, background: t.papel,
    borderRadius: raio.md, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    lineHeight: 1.5,
  },
  painelTitulo: { ...tipo('corpoF'), margin: 0 },
  painelDica: { ...tipo('legenda'), color: t.textoFraco, margin: `2px 0 0` },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdCurto: {
    padding: espaco.lg, ...tipo('corpo'), color: t.textoMedio,
    borderBottom: `1px solid ${t.borda}`,
    // Nome comprido nao pode empilhar uma palavra por linha.
    maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  tdFraco: {
    padding: espaco.lg, ...tipo('legenda'), color: t.textoFraco,
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpo'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNumForte: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpoF'), ...numeros,
    color: t.texto, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
};

/* Impressao: mesmos valores da Folha de Analise do estudo — o papel dos dois
   relatorios precisa parecer da mesma casa. */
export const imp = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45,
           fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif" },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555', textAlign: 'right' },

  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },

  tituloSecao: { fontSize: 12, fontWeight: 700, margin: '0 0 6px', paddingBottom: 3, borderBottom: '1px solid #999' },

  /* Comparativo no papel. O destaque nao pode depender de cor: a folha sai
     em P&B na maioria das impressoras da fabrica. Quem destaca e' a borda
     grossa e o fundo cinza — a cor so' reforca. */
  comparativo: { marginBottom: 14, breakInside: 'avoid' },
  comparativoGrade: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  comparativoCaixa: {
    display: 'flex', flexDirection: 'column', gap: 1,
    border: '1px solid #999', padding: '6px 8px',
  },
  comparativoCaixaDestaque: {
    display: 'flex', flexDirection: 'column', gap: 1,
    border: '2px solid #000', background: '#EEE', padding: '6px 8px',
  },
  comparativoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#444' },
  comparativoValor: { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  comparativoSub: { fontSize: 8.5, color: '#333' },
  comparativoNota: { fontSize: 8.5, color: '#333', margin: '5px 0 0', lineHeight: 1.4 },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5, breakInside: 'avoid' },
  th: { textAlign: 'left', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  td: { padding: '3px 5px', borderBottom: '1px solid #DDD', verticalAlign: 'top' },
  tdNum: { padding: '3px 5px', borderBottom: '1px solid #DDD', textAlign: 'right',
           fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },

  /* ---- comparativo entre maquinas no papel ---- */
  entreMaquinas: { marginBottom: 10 },
  // Um grupo nao se parte entre duas folhas: a tabela sem a leitura que a
  // explica (ou o contrario) e' pior do que uma folha com mais respiro.
  grupoBloco: { breakInside: 'avoid', marginBottom: 8 },
  grupoNome: {
    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.6, color: '#555', marginBottom: 2,
  },

  /* ---- analise do periodo no papel ---- */
  analiseBloco: { breakInside: 'avoid', marginBottom: 6 },
  analiseTitulo: {
    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.6, color: '#555', marginBottom: 1,
  },
  analiseLinha: { margin: '0 0 3px', fontSize: 9.5, lineHeight: 1.5 },

  legenda: { marginTop: 14, border: '1px solid #DDD', padding: 8, breakInside: 'avoid' },
  gradeLegenda: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', marginTop: 6 },
  itemLegenda: { display: 'flex', gap: 6, fontSize: 9, lineHeight: 1.45, breakInside: 'avoid' },
  nota: { margin: '8px 0 0', fontSize: 9, color: '#555', lineHeight: 1.5 },

  assinaturas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 32, breakInside: 'avoid' },
  assinatura: { textAlign: 'center' },
  linhaAssinatura: { borderTop: '1px solid #000', marginBottom: 4 },
  papelAssinatura: { fontSize: 9, color: '#555' },
};
