/**
 * Estilos do RITMO DA MAQUINA — a tela inteira num objeto so'.
 *
 * A tela e' montada por varias secoes (formulario de horarios, cronometro
 * ao vivo, resultado, historico) que dividem botao, campo e parcial. O
 * verificador (test/checar-estilos.mjs) segue o `import { est }` e confere
 * as chaves usadas contra este arquivo.
 */
import { ALVO_MINIMO, cores, espaco, fonte, raio, sombra, tamanho, transicao } from '../../../theme/tokens.js';

export const est = {
  tela: {
    height: '100dvh',
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: espaco.md,
    padding: espaco.md,
    // Area segura do iPhone nos DOIS extremos. So' o rodape era tratado:
    // com viewport-fit=cover o conteudo passa por baixo da barra de status,
    // e a seta de voltar subia para debaixo do relogio do aparelho.
    paddingTop: `calc(${espaco.md}px + env(safe-area-inset-top, 0px))`,
    paddingBottom: `calc(${espaco.md}px + env(safe-area-inset-bottom, 0px))`,
    background: cores.fundo,
    color: cores.texto,
    fontFamily: fonte.familia,
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },

  cabecalho: { display: 'flex', alignItems: 'center', gap: espaco.md, flexShrink: 0 },
  botaoVoltar: {
    width: 44, height: 44, flexShrink: 0,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.md, color: cores.texto, fontSize: 20, cursor: 'pointer',
  },
  titulo: {
    fontSize: tamanho.titulo, fontWeight: 700, lineHeight: 1.2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  subtitulo: {
    fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  selo: {
    flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '4px 8px',
    borderRadius: raio.sm, color: cores.textoFraco,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
  },

  // Fora da cronometragem ao vivo pode rolar: formulario com teclado aberto
  // em tela baixa nao pode cortar campo. Durante o ao vivo segue travado.
  telaRolavel: { overflowY: 'auto' },

  explicacao: {
    flexShrink: 0, padding: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.lg,
    fontSize: tamanho.corpo, color: cores.textoFraco, lineHeight: 1.5,
  },

  /* ---- conferencia por horarios (caminho principal) ---- */
  formHoras: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  linhaHoras: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.md },
  campoHora: { display: 'flex', flexDirection: 'column', gap: espaco.xs, minWidth: 0 },
  rotuloCampo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  // "Agora" embaixo do campo, nao ao lado: dividir 200px de coluna entre
  // input de hora e botao corta o valor ("07:00 AM" some pela metade).
  horaComAgora: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  inputHora: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums', outline: 'none',
    // Sem o esquema escuro o WebKit pinta o relogio interno preto no fundo
    // escuro e o campo parece vazio.
    colorScheme: 'dark',
  },
  botaoAgora: {
    width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  inputPecasForm: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.md}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero, outline: 'none',
  },
  painelHoras: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.md,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  selectMaquina: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.corpo, fontWeight: 600,
    fontFamily: 'inherit', outline: 'none', colorScheme: 'dark',
  },
  linkCadastro: {
    marginTop: espaco.xs, padding: 0, alignSelf: 'flex-start',
    background: 'transparent', border: 'none', color: cores.textoFraco,
    fontSize: tamanho.legenda, fontWeight: 600, textDecoration: 'underline',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  inputTexto: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.md}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.corpo, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
  },
  botaoSalvar: {
    width: '100%', minHeight: ALVO_MINIMO,
    background: cores.vermelho, border: 'none', borderRadius: raio.md,
    color: '#fff', fontSize: tamanho.corpo, fontWeight: 700, letterSpacing: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSalvarFeito: { background: cores.ok, cursor: 'default' },
  botaoOutraPeca: {
    width: '100%', minHeight: 56,
    background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.md,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  erroSalvar: {
    padding: espaco.md, textAlign: 'center',
    fontSize: tamanho.legenda, color: cores.texto, lineHeight: 1.4,
    background: cores.criticoFundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.critico,
  },

  /* ---- conferencias salvas neste aparelho ---- */
  historico: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.sm,
    paddingTop: espaco.md,
  },
  historicoDica: {
    fontSize: tamanho.legenda, color: cores.textoFraco,
    marginBottom: espaco.sm, lineHeight: 1.4,
  },
  historicoTitulo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  itemHistorico: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.sm}px ${espaco.md}px`,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.md,
  },
  itemPeca: {
    fontSize: tamanho.pequeno, fontWeight: 700,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemDetalhe: { fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2 },
  itemRitmo: {
    flexShrink: 0, fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums',
  },
  itemRitmoSufixo: { fontSize: tamanho.legenda, color: cores.textoFraco, marginLeft: 3, fontWeight: 400 },
  itemRemover: {
    flexShrink: 0, width: 40, height: 40,
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: cores.textoFraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
  },

  divisorOu: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: espaco.md, padding: `${espaco.xs}px 0` },
  traco: { flex: 1, height: 1, background: cores.borda },
  textoOu: { fontSize: tamanho.legenda, color: cores.textoFraco },
  botaoVivo: { flex: '0 0 auto', minHeight: 72 },

  painelTempo: {
    flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.md,
  },
  rotuloTempo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  tempoCorrido: {
    fontSize: 48, fontWeight: 700, fontFamily: fonte.numero, lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
  linhaParcial: {
    display: 'flex', gap: espaco.xl, justifyContent: 'center',
    // Quebra de linha: sao ate quatro numeros, e o celular do chao de
    // fabrica e' estreito. Sem isto, os tres primeiros esmagavam o quarto.
    flexWrap: 'wrap', rowGap: espaco.md,
    marginTop: espaco.xs, width: '100%',
  },
  /* ---- comparativo: o que saiu x o que teria saido no mesmo tempo ---- */
  comparativo: {
    width: '100%', marginTop: espaco.md,
    background: cores.superficieAlta, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    padding: `${espaco.md}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  },
  comparativoRotulo: {
    fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase',
    textAlign: 'center',
  },
  comparativoLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.sm, flexWrap: 'wrap', justifyContent: 'center' },
  // O que saiu fica menor e apagado; o potencial e' o numero grande. A
  // leitura e' "de X para Y" — a seta faz o trabalho sem precisar de texto.
  comparativoDe: { fontSize: tamanho.titulo, fontFamily: fonte.numero, color: cores.textoFraco },
  comparativoSeta: { fontSize: tamanho.titulo, color: cores.textoFraco },
  comparativoPara: { fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero, color: cores.texto },
  // A PERDA e' o que salta, como no PC — nao o potencial. A manchete desta
  // tela e' a producao real (decisao de ago/2026, 20 linhas acima); deixar o
  // potencial como maior numero do bloco contrariava a mesma regra.
  // O destaque e' TAMANHO e PESO, nao cor: o ambar de atencao da paleta da
  // 2.65:1 sobre a superficie escura desta tela (medido), abaixo do piso.
  comparativoUnidade: { fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, color: cores.texto },
  comparativoSub: { fontSize: tamanho.legenda, color: cores.textoFraco, fontFamily: fonte.numero },
  comparativoPerda: { fontSize: tamanho.legenda, color: cores.texto, textAlign: 'center' },

  parcial: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 },
  parcialRotulo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  parcialValor: { fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, lineHeight: 1.1 },
  parcialSufixo: { fontSize: tamanho.legenda, color: cores.textoFraco, marginLeft: 3, fontWeight: 400 },

  botaoGrande: {
    flex: '1 1 auto', minHeight: 180,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: espaco.sm,
    border: 'none', borderRadius: raio.lg, cursor: 'pointer',
    fontFamily: fonte.familia, color: '#fff',
    boxShadow: sombra.alta, transition: `transform ${transicao.rapida}`,
    userSelect: 'none',
  },
  botaoIniciar: { background: `linear-gradient(160deg, ${cores.vermelho}, ${cores.bordeaux})` },
  botaoContar: { background: `linear-gradient(160deg, #1D4ED8, #1E3A8A)` },
  iconeIniciar: { fontSize: 56, lineHeight: 1 },
  contagem: {
    fontSize: tamanho.cronometro, fontWeight: 700, fontFamily: fonte.numero,
    lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums',
  },
  rotuloBotao: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, opacity: 0.92 },
  dicaBotao: { fontSize: tamanho.legenda, opacity: 0.75 },

  barraInferior: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm, flexShrink: 0 },
  botaoBarra: {
    minHeight: ALVO_MINIMO,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    color: cores.texto, fontSize: tamanho.legenda, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoEncerrar: { borderColor: cores.critico, color: cores.critico },
  botaoNova: { borderColor: cores.ok, color: cores.ok },
  iconeBarra: { fontSize: 18, lineHeight: 1 },

  painelResultado: {
    // Cresce ate' preencher a tela, mas NUNCA encolhe abaixo do conteudo:
    // encolhendo, o miolo centralizado vazava por cima do aviso de salvar
    // (a tela ja' rola nesta fase — sobrar conteudo e' rolagem, nao invasao).
    flex: '1 0 auto',
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  linhaResultado: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.md },
  blocoResultado: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs },
  valorTempo: {
    fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.4,
  },
  inputPecas: {
    width: '100%', maxWidth: 140, minHeight: 44, textAlign: 'center',
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, outline: 'none',
  },
  destaqueRitmo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
    padding: `${espaco.lg}px 0`,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: cores.borda,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: cores.borda,
  },
  valorRitmo: {
    fontSize: tamanho.cronometro, fontWeight: 700, fontFamily: fonte.numero,
    lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', color: cores.ok,
  },
  sufixoRitmo: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, color: cores.textoFraco },

  aviso: {
    flexShrink: 0, padding: espaco.md, textAlign: 'center',
    fontSize: tamanho.legenda, color: cores.textoFraco, lineHeight: 1.5,
    background: cores.atencaoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.atencao,
  },

  /* ---- paradas do periodo ---- */
  blocoParadas: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm, minWidth: 0,
    paddingTop: espaco.md,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: cores.borda,
  },
  linhaBotoesParada: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm },
  // Setup ganha destaque proprio: e' a parada que o analista mais marca na
  // furadeira, e procurar por ela num menu custaria mais que o toque.
  botaoSetup: {
    minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.atencao, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoParada: {
    minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  dicaParada: { fontSize: tamanho.legenda, color: cores.textoFraco, lineHeight: 1.4 },
  /* ---- ciclos de furacao ---- */
  blocoCiclos: { display: 'flex', flexDirection: 'column', gap: espaco.sm, minWidth: 0 },
  linhaCiclos: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: espaco.sm },
  botaoCiclo: {
    minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoCicloAtivo: { borderColor: cores.ok, color: cores.ok, background: cores.okFundo },
  // Faixa do setup em andamento: mesma paleta ambar do botao que a abriu.
  cronoSetup: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md,
    background: cores.atencaoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.atencao,
  },
  cronoSetupRotulo: { fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: cores.atencao },
  cronoSetupTempo: {
    fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, marginTop: 2,
  },
  botaoFimSetup: {
    flexShrink: 0, minHeight: 48, padding: `0 ${espaco.md}px`,
    background: cores.atencao, border: 'none', borderRadius: raio.sm,
    color: '#fff', fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  linhaParada: { display: 'flex', alignItems: 'center', gap: espaco.sm, minWidth: 0 },
  selectMotivo: {
    flex: 1, minWidth: 0, minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 600,
    fontFamily: 'inherit', outline: 'none', colorScheme: 'dark',
  },
  inputMinutos: {
    width: 84, flexShrink: 0, minHeight: 48, textAlign: 'center',
    background: cores.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.titulo, fontWeight: 700,
    fontFamily: fonte.numero, outline: 'none',
  },
  avisoParada: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, fontSize: tamanho.corpo, color: cores.texto, lineHeight: 1.5,
    background: cores.criticoFundo, borderRadius: raio.lg,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.critico,
  },

  /* ---- parada durante o cronometro ao vivo ---- */
  barraInferiorTres: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: espaco.sm, flexShrink: 0 },
  botaoParou: { borderColor: cores.atencao, color: cores.atencao },
  botaoVoltarProduzir: { background: `linear-gradient(160deg, ${cores.atencao}, #7C3A06)` },
  rotuloParadaAtiva: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, opacity: 0.92 },
  folhaMotivos: {
    position: 'fixed', inset: 0, zIndex: 30,
    display: 'flex', alignItems: 'flex-end',
    background: 'rgba(0,0,0,0.6)', padding: espaco.md,
  },
  folhaCaixa: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: espaco.md,
    background: cores.superficie,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.lg,
    padding: espaco.lg, boxShadow: sombra.alta,
    maxHeight: '86dvh', overflowY: 'auto',
  },
  folhaTitulo: { fontSize: tamanho.titulo, fontWeight: 700 },
  gradeMotivos: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm },
  chipMotivo: {
    minHeight: 60, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.md,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, lineHeight: 1.25,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  chipSetup: { borderColor: cores.atencao },

  rodape: { flexShrink: 0, height: espaco.md },
};
