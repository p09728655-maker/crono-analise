/**
 * Estilos do ESTUDO ABERTO (painel de analise) — a tela inteira num objeto
 * so', dividido pelos quadros em estudo/. O verificador
 * (test/checar-estilos.mjs) segue o `import { est }` e confere as chaves
 * usadas contra este arquivo.
 */
import { claro, fonteAnalise } from '../../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../../theme/escala.js';

export const corNivel = (n) => ({ estavel: claro.ok, atencao: claro.atencao, critico: claro.critico }[n] || claro.neutro);



export const est = {
  tela: { minHeight: '100vh', background: claro.fundo, color: claro.texto, fontFamily: fonteAnalise.familia },
  // Lateral fixa + conteudo rolando — mesmo esqueleto da lista de estudos.
  telaComLateral: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start' },
  conteudoLateral: {
    flex: 1, minWidth: 0, maxWidth: 1400,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: claro.vermelho, border: 'none',
    borderRadius: raio.md, color: '#fff', ...tipo('corpoF'),
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },
  botaoSecundario: {
    minHeight: 36, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  /* --- ressalva de amostra: uma linha, detalhe sob demanda --- */
  /* Flutua sobre a pagina, presa a' JANELA e nao ao topo do documento: a
     recusa de um clique dado no fim da tabela precisa ser lida sem rolar
     a tela inteira para cima. Mesmo padrao do relatorio Ritmo por
     maquina, onde "o arquivar nao funciona" nasceu de um erro guardado
     em estado e nunca renderizado. */
  avisoFlutuante: {
    position: 'fixed', zIndex: 40,
    left: '50%', bottom: espaco.xl, transform: 'translateX(-50%)',
    width: 'max-content', maxWidth: 'min(760px, calc(100vw - 32px))',
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    boxShadow: elevacao.alta, ...tipo('corpo'), color: claro.texto,
  },

  avisoAmostra: {
    maxWidth: 1400, margin: `0 auto ${espaco.lg}px`, padding: `${espaco.md}px ${espaco.lg}px`,
    ...tipo('corpo'), background: claro.atencaoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.atencao,
    borderRadius: raio.md, color: claro.texto,
  },
  avisoResumo: {
    display: 'flex', alignItems: 'center', gap: espaco.sm, cursor: 'pointer',
    listStyle: 'none', fontWeight: 600,
  },
  avisoIcone: {
    width: 20, height: 20, flexShrink: 0, borderRadius: '50%',
    background: claro.atencao, color: '#fff', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  listaPendencias: { margin: `${espaco.sm}px 0 0`, paddingLeft: espaco.xxl },
  itemPendencia: { marginTop: espaco.xs },
  linkColeta: {
    marginLeft: espaco.sm, padding: '2px 8px', background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.bordaForte, borderRadius: raio.sm,
    ...tipo('micro'), textTransform: 'none', cursor: 'pointer',
    fontFamily: 'inherit', color: claro.textoMedio,
  },

  /* --- a resposta --- */
  resposta: {
    maxWidth: 1400, margin: `0 auto ${espaco.lg}px`, padding: espaco.xl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.media,
    borderLeft: `4px solid ${claro.vermelho}`,
    display: 'flex', gap: espaco.xxl, flexWrap: 'wrap',
  },
  respostaBloco: { flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: espaco.xs },
  respostaDivisor: { width: 1, alignSelf: 'stretch', background: claro.borda },
  respostaRotulo: rotulo(claro.textoFraco),
  respostaNumeroLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.sm },
  respostaNumero: { ...tipo('display'), ...numeros, fontFamily: fonteAnalise.numero },
  respostaUnidade: { ...tipo('corpo'), color: claro.textoMedio },
  respostaExplica: { ...tipo('corpo'), margin: `${espaco.xs}px 0 0`, color: claro.textoMedio },
  respostaVazia: { ...tipo('corpo'), margin: 0, color: claro.textoFraco },

  /* --- numeros de apoio --- */
  contexto: {
    maxWidth: 1400, margin: `0 auto ${espaco.xl}px`, padding: `${espaco.md}px ${espaco.xl}px`,
    display: 'flex', gap: espaco.xxl, flexWrap: 'wrap',
    borderTop: `1px solid ${claro.borda}`, borderBottom: `1px solid ${claro.borda}`,
  },
  contextoItem: { display: 'flex', alignItems: 'baseline', gap: espaco.sm },
  contextoRotulo: { ...tipo('legenda'), color: claro.textoFraco },
  contextoValor: { ...tipo('corpoF'), ...numeros, fontFamily: fonteAnalise.numero },

  /* --- primeiro passo --- */
  primeiroPasso: {
    maxWidth: 640, margin: `${espaco.xxl}px auto`, padding: espaco.xxl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${claro.borda}`,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: espaco.md,
  },
  primeiroPassoTitulo: { ...tipo('titulo'), margin: 0 },
  primeiroPassoTexto: { ...tipo('corpo'), margin: 0, color: claro.textoMedio },

  /* --- tabela de operacoes --- */
  blocoTabela: {
    maxWidth: 1400, margin: `${espaco.xl}px auto`, background: claro.papel,
    borderRadius: raio.lg, boxShadow: elevacao.baixa, border: `1px solid ${claro.borda}`,
    overflow: 'hidden',
  },
  cabecalhoSecao: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.md, padding: `${espaco.lg}px ${espaco.xl}px`,
    borderBottom: `1px solid ${claro.borda}`,
  },
  tituloSecao: { ...tipo('destaque'), margin: 0 },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`, ...rotulo(claro.textoFraco),
    background: '#F8F9FB', borderBottom: `1px solid ${claro.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`, ...rotulo(claro.textoFraco),
    background: '#F8F9FB', borderBottom: `1px solid ${claro.borda}`, whiteSpace: 'nowrap',
  },
  td: { padding: `${espaco.lg}px`, ...tipo('corpo'), color: claro.textoMedio, borderBottom: `1px solid ${claro.borda}` },
  tdNum: {
    padding: `${espaco.lg}px`, textAlign: 'right', ...tipo('corpo'), ...numeros,
    fontFamily: fonteAnalise.numero, color: claro.texto, borderBottom: `1px solid ${claro.borda}`,
  },
  linhaGargalo: { background: 'rgba(194, 65, 12, 0.05)' },
  selo: {
    marginLeft: espaco.sm, padding: '2px 7px', background: claro.critico, color: '#fff',
    borderRadius: raio.sm, ...tipo('micro'), fontSize: 10,
  },
  meta: { color: claro.textoFraco, ...tipo('legenda') },
  iaConfirmar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: espaco.md, borderRadius: raio.md,
    background: claro.atencaoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.atencao,
    ...tipo('legenda'), color: claro.texto, lineHeight: 1.5,
  },
  iaConfirmarAcoes: { display: 'flex', alignItems: 'center', gap: espaco.md, flexShrink: 0 },
  // Laranja queimado, nao o vermelho da marca: aqui e' status, e o vermelho
  // deste app e' identidade.
  botaoPerigo: {
    minHeight: 34, padding: `0 ${espaco.md}px`, background: claro.critico,
    border: 'none', borderRadius: raio.sm, color: '#fff',
    ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },

  /* ---- cartoes de numero (capacidade, operadores, sugestoes) ---- */
  gradeKpi: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: espaco.lg, padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  // Barra de acento a esquerda. A cor nunca informa sozinha: o rotulo esta
  // em cima e a nota, em palavras, embaixo.
  cartaoKpi: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.fundo, borderRadius: raio.md,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: claro.borda,
  },
  kpiRotulo: { ...rotulo(claro.textoFraco) },
  kpiLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.xs, minWidth: 0 },
  kpiValor: { ...tipo('titulo'), ...numeros, fontFamily: fonteAnalise.numero, color: claro.texto },
  kpiUnidade: { ...tipo('legenda'), color: claro.textoFraco },
  kpiNota: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.4 },

  /* ---- dimensionamento de operadores ---- */
  blocoFormula: {
    margin: `${espaco.lg}px ${espaco.xl}px 0`, padding: espaco.lg,
    background: claro.fundo, borderRadius: raio.md,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  formulaTitulo: { ...tipo('corpoF'), color: claro.texto },
  formulaConta: {
    ...tipo('corpo'), ...numeros, fontFamily: fonteAnalise.numero,
    color: claro.textoMedio,
  },
  formulaResultado: { color: claro.vermelho, fontSize: 16 },
  rotuloBloco: { ...rotulo(claro.textoFraco) },
  listaContribuicao: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  linhaContribuicao: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px minmax(120px, 2fr) 68px',
    alignItems: 'center', gap: espaco.md,
  },
  contribNome: {
    ...tipo('corpo'), color: claro.texto, minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  contribTempo: { ...tipo('corpo'), ...numeros, color: claro.textoMedio, textAlign: 'right' },
  contribOps: { ...tipo('legenda'), ...numeros, color: claro.textoFraco, textAlign: 'right' },
  blocoAtual: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    borderTop: `1px solid ${claro.borda}`,
  },
  linhaAtual: { display: 'flex', alignItems: 'stretch', gap: espaco.lg, flexWrap: 'wrap' },
  inputOperadores: {
    width: 110, flexShrink: 0, minHeight: 56, textAlign: 'center',
    background: claro.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.texto, ...tipo('titulo'), ...numeros, fontFamily: fonteAnalise.numero,
  },
  notaAtual: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.45 },
  veredito: {
    flex: '1 1 320px', minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: `${espaco.md}px ${espaco.lg}px`, borderRadius: raio.md,
    background: claro.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
  },
  vereditoTexto: { ...tipo('legenda'), color: claro.textoMedio, lineHeight: 1.5 },

  /* ---- sugestoes de melhoria ---- */
  listaSugestoes: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  cartaoSugestao: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.fundo, borderRadius: raio.md,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: claro.borda,
  },
  sugestaoTopo: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap', minWidth: 0 },
  sugestaoOperacao: {
    maxWidth: 320, padding: `2px ${espaco.sm}px`, borderRadius: raio.sm,
    background: claro.papel, ...tipo('legenda'), color: claro.textoMedio,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  sugestaoTitulo: { ...tipo('corpoF'), color: claro.texto },
  sugestaoDiagnostico: { ...tipo('corpo'), color: claro.textoMedio, margin: 0, lineHeight: 1.5 },
  sugestaoAcao: {
    ...tipo('corpo'), color: claro.texto, margin: 0, lineHeight: 1.5,
    padding: `${espaco.sm}px ${espaco.md}px`, borderRadius: raio.sm,
    background: claro.papel,
  },

  /* ---- paradas do estudo ---- */
  paradasResumo: { ...tipo('legenda'), color: claro.textoMedio },
  // O custo em peca fica em destaque: e' a unica linha desta aba que uma
  // reuniao de producao le' sem precisar de traducao.
  custoParada: {
    margin: `0 ${espaco.xl}px ${espaco.lg}px`,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    borderRadius: raio.md, ...tipo('corpo'), color: claro.texto, lineHeight: 1.5,
  },
  vazioParadas: {
    margin: 0, padding: `${espaco.xl}px`, ...tipo('corpo'),
    color: claro.textoMedio, lineHeight: 1.6, maxWidth: 720,
  },
  listaMotivos: {
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  linhaMotivo: { display: 'flex', flexDirection: 'column', gap: espaco.xs, minWidth: 0 },
  motivoTopo: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: espaco.md, minWidth: 0,
  },
  motivoNome: { ...tipo('corpoF'), color: claro.texto },
  motivoNumero: { ...tipo('corpo'), ...numeros, color: claro.texto, whiteSpace: 'nowrap' },
  barraTrilho: { height: 8, borderRadius: raio.pill, background: claro.fundo, overflow: 'hidden' },
  // Laranja de atencao, nao o vermelho da marca: parada e' perda a tratar,
  // e o vermelho aqui e' identidade, nunca status.
  barraValor: { height: '100%', background: claro.atencao, borderRadius: raio.pill },
  motivoAcao: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.45 },
  notaParadas: {
    margin: 0, padding: `${espaco.lg}px ${espaco.xl}px`,
    borderTop: `1px solid ${claro.borda}`,
    ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.5,
  },
  estabilidade: { display: 'inline-flex', alignItems: 'center', gap: espaco.sm, ...tipo('corpo') },
  ponto: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  botaoAcaoLinha: {
    minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.sm,
    color: claro.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoRemoverOp: {
    width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
    borderRadius: raio.sm, color: claro.textoFraco, fontSize: 18, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  /* --- modal de operacao --- */
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: espaco.lg, overflowY: 'auto',
  },
  formulario: {
    width: '100%', maxWidth: 540, background: claro.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  /* ---- analise com IA ---- */
  ia: {
    marginTop: espaco.xxl, padding: espaco.xl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  iaTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: claro.textoFraco, margin: '2px 0 0' },
  iaAcoes: { display: 'flex', alignItems: 'center', gap: espaco.md, flexWrap: 'wrap' },
  iaChave: { ...tipo('legenda'), ...numeros, color: claro.textoFraco },
  iaBotao: {
    minHeight: 40, padding: `0 ${espaco.xl}px`,
    background: claro.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  iaBotaoTexto: {
    minHeight: 40, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  iaForm: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: '#F8F9FB',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    maxWidth: 560,
  },
  iaFormAcoes: { display: 'flex', justifyContent: 'flex-end', gap: espaco.md },
  iaErro: {
    padding: espaco.md, background: claro.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: claro.texto,
  },
  iaResposta: {
    padding: espaco.lg, background: '#F8F9FB',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  iaRespostaTexto: { ...tipo('corpo'), whiteSpace: 'pre-wrap', lineHeight: 1.55 },
  iaMeta: { ...tipo('micro'), color: claro.textoFraco },

  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  fieldset: { border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: espaco.sm },
  rotuloCampo: rotulo(claro.textoFraco),
  // "escolher do cadastro" do SeletorMaquina: volta do texto livre para a
  // lista. Discreto — o caminho normal e' escolher.
  linkCadastro: {
    marginTop: espaco.xs, padding: 0, alignSelf: 'flex-start',
    background: 'transparent', border: 'none', color: claro.textoFraco,
    ...tipo('legenda'), fontWeight: 600, textDecoration: 'underline',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  dica: { ...tipo('legenda'), color: claro.textoFraco, fontStyle: 'italic' },
  input: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: claro.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.sm,
    color: claro.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  grupoFr: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: espaco.sm },
  botaoFr: {
    minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: claro.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
    borderRadius: raio.sm, color: claro.textoMedio, cursor: 'pointer', fontFamily: 'inherit',
    ...tipo('legenda'),
    transition: `border-color ${transicao.rapida}, background ${transicao.rapida}`,
  },
  botaoFrAtivo: { borderColor: claro.vermelho, color: claro.texto, background: 'rgba(219, 33, 38, 0.07)' },
  erroForm: {
    padding: espaco.md, background: claro.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    borderRadius: raio.sm, ...tipo('legenda'),
  },
  semDados: {
    maxWidth: 1400, margin: `${espaco.xxl}px auto`, padding: espaco.xxl,
    textAlign: 'center', ...tipo('corpo'), color: claro.textoFraco,
    background: claro.papel, border: `1px dashed ${claro.borda}`, borderRadius: raio.lg,
  },
  /* Carregando e erro sao TELA INTEIRA, nao um bloco no meio do nada.
     Com 60vh a caixa clara cobria so' dois tercos da janela e o resto
     ficava com o fundo escuro do body (#14171A, a paleta da coleta):
     abrir a analise piscava uma faixa preta embaixo do "Carregando
     estudo...", e no erro ela ficava la' parada. A analise e' clara do
     topo ao rodape — 100dvh e' o que garante isso. */
  estadoVazio: {
    minHeight: '100dvh', width: '100%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: espaco.lg,
    padding: espaco.xl, textAlign: 'center',
    background: claro.fundo, color: claro.textoMedio, fontFamily: fonteAnalise.familia,
  },
};

