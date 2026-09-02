/**
 * Tema e estilos da LISTA DE ESTUDOS — a tela nas duas experiencias.
 *
 *   coleta  (celular, no posto) — tema escuro, alvos grandes, cartoes.
 *   analise (PC, no escritorio) — tema claro igual ao do relatorio, tabela.
 *
 * `tema(analise)` escolhe a paleta; `estilos(t, analise)` monta o objeto
 * que o container calcula uma vez e passa aos quadros como prop `est`.
 * O verificador (test/checar-estilos.mjs) sabe que um quadro em lista/ que
 * usa uma chave de `est` sem declarar nem importar tem as chaves AQUI, no estilos.js
 * ao lado.
 */
import { ALVO_MINIMO, cores as escuro } from '../../../theme/tokens.js';
import { claro } from '../../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../../theme/escala.js';

/* -------------------------------------------------------------------- tema */

export function tema(analise) {
  // ok/atencao/critico sao os tons de ESTADO — nunca o vermelho, que aqui e'
  // identidade da marca (ver src/theme/tokens.js).
  return analise
    ? { fundo: claro.fundo, superficie: claro.papel, borda: claro.borda, realce: '#F8F9FB',
        texto: claro.texto, medio: claro.textoMedio, fraco: claro.textoFraco,
        vermelho: claro.vermelho, critico: claro.critico, criticoFundo: claro.criticoFundo,
        atencao: claro.atencao, ok: claro.ok,
        sombra: elevacao.baixa }
    : { fundo: escuro.fundo, superficie: escuro.superficie, borda: escuro.borda, realce: escuro.superficieAlta,
        texto: escuro.texto, medio: escuro.textoFraco, fraco: escuro.textoFraco,
        vermelho: escuro.vermelho, critico: escuro.critico, criticoFundo: escuro.criticoFundo,
        atencao: escuro.atencao, ok: escuro.ok,
        sombra: elevacao.escuraMedia };
}

export function estilos(t, analise) {
  const alvo = analise ? 40 : ALVO_MINIMO;

  return {
    tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
    // Lateral fixa + conteudo rolando: a navegacao nao sai da tela quando o
    // analista desce numa lista longa.
    telaComLateral: {
      minHeight: '100dvh', background: t.fundo, color: t.texto,
      display: 'flex', alignItems: 'flex-start',
    },
    conteudoLateral: {
      // Precisa comportar tabela (1180) + respiro + painel (280) + padding:
      // com 1400 sobrava faixa vazia a direita e a tabela nem chegava ao teto.
      flex: 1, minWidth: 0, maxWidth: 1560,
      padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
    },
    conteudo: {
      maxWidth: 1400, margin: '0 auto',
      padding: analise ? `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px` : espaco.lg,
      // So' no aparelho: no iPhone (viewport-fit=cover) o conteudo passa por
      // baixo da barra de status e o topo da lista sumia sob o relogio.
      ...(analise ? {} : { paddingTop: `calc(${espaco.lg}px + env(safe-area-inset-top, 0px))` }),
    },

    botaoPrimario: {
      minHeight: analise ? 40 : ALVO_MINIMO, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: analise ? elevacao.baixa : 'none',
      transition: `filter ${transicao.rapida}`,
    },
    botaoSecundario: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoPerigo: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: t.critico,
      border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    /* Sair do sistema — so' aparece no tablet. Contornado, nao preenchido:
       encerrar o turno nao pode competir com "+ Novo estudo", que e' o que
       a tela existe para oferecer. */
    botaoSair: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`,
      display: 'inline-flex', alignItems: 'center', gap: espaco.sm,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    iconeSair: { fontSize: 18, lineHeight: 1 },

    /* ---- atalho da conferencia rapida (so' coleta) ---- */
    atalhoRapida: {
      width: '100%', minHeight: ALVO_MINIMO,
      display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.lg, marginBottom: espaco.xl,
      background: t.superficie,
      // Borda na cor da marca para destacar do resto da lista sem gritar:
      // e' a unica acao da tela que funciona sem rede e sem cadastro.
      borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
      borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    secaoColeta: {
      display: 'flex', flexDirection: 'column', gap: 2,
      margin: `${espaco.xl}px 0 ${espaco.md}px`,
      paddingLeft: espaco.md,
      // Barra na cor da marca a esquerda: separa as duas secoes sem gastar
      // uma linha inteira de divisor em tela de tablet.
      borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: t.vermelho,
    },
    secaoRotulo: { ...rotulo(t.vermelho) },
    atalhoRotulo: { ...rotulo(t.vermelho), display: 'block', marginBottom: 2 },
    secaoTitulo: { ...tipo('destaque'), margin: 0 },
    secaoTexto: { ...tipo('legenda'), color: t.fraco, margin: 0, lineHeight: 1.45 },

    atalhoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    atalhoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    atalhoSeta: { fontSize: 20, color: t.vermelho, flexShrink: 0 },

    /* ---- tabela + painel de informacao (PC) ---- */
    areaComPainel: { display: 'flex', alignItems: 'flex-start', gap: espaco.xl },
    // A tabela para de crescer: linha larga demais obriga o olho a viajar
    // do nome ate' o numero e perde a linha no caminho. O teto subiu de 1040
    // para 1180 quando a coluna de acoes ganhou o quarto botao — o bastante
    // para ele caber, sem transformar a linha numa travessia.
    colunaTabela: { flex: 1, minWidth: 0, maxWidth: 1180 },
    painelInfo: {
      width: 280, flexShrink: 0, position: 'sticky', top: espaco.xl,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
    },
    painelBloco: {
      background: t.superficie, borderRadius: raio.lg,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      padding: espaco.lg, display: 'flex', flexDirection: 'column', gap: espaco.sm,
      boxShadow: t.sombra,
    },
    painelRotulo: rotulo(t.fraco),
    painelNumeros: {
      display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
      gap: `${espaco.md}px ${espaco.sm}px`,
    },
    painelNumero: { display: 'flex', flexDirection: 'column', minWidth: 0 },
    painelValor: { ...tipo('destaque'), ...numeros, color: t.texto },
    painelValorAtencao: { ...tipo('destaque'), ...numeros, color: t.critico },
    painelChave: { ...tipo('legenda'), color: t.fraco },
    painelLinha: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.sm, ...tipo('legenda'), color: t.medio,
    },
    painelLinhaTexto: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    painelLinhaNum: { flexShrink: 0, ...numeros, fontWeight: 700, color: t.texto },
    painelDestaque: { ...tipo('corpoF'), color: t.texto },
    painelNota: { ...tipo('legenda'), color: t.fraco },

    /* ---- proximas acoes (abaixo da tabela, so' no PC) ---- */
    // Filete no topo: a area e' outra coisa que a tabela, e sem a linha ela
    // parecia um rodape solto da ultima linha do ultimo grupo.
    acoesSecao: {
      marginTop: espaco.sm, paddingTop: espaco.xl,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
    },
    acoesCabecalho: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap',
    },
    acoesRotulo: rotulo(t.fraco),
    acoesResumo: { ...tipo('legenda'), color: t.fraco },
    acoesLista: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
    // Barra de estado a esquerda, o resto neutro: quatro cartoes contornados
    // de laranja transformariam a area num alarme continuo. A cor entra so'
    // onde ela informa — filete, ponto e rotulo do estado.
    acaoCartao: {
      display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: `${espaco.md}px ${espaco.lg}px`,
      padding: `${espaco.md}px ${espaco.lg}px`,
      background: t.superficie, borderRadius: raio.md,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderLeftWidth: 3,
      boxShadow: t.sombra,
    },
    // 320 nao e' o tamanho do texto: e' o ponto de quebra. Com base menor,
    // o cartao de botao curto ("Analisar") continuava em uma linha enquanto
    // os vizinhos ja' tinham quebrado — quatro cartoes, dois desenhos.
    acaoTexto: { flex: '1 1 320px', minWidth: 0 },
    acaoEstado: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      ...tipo('micro'), textTransform: 'uppercase',
    },
    acaoPonto: { width: 7, height: 7, borderRadius: raio.pill, flexShrink: 0 },
    acaoNome: {
      ...tipo('corpoF'), color: t.texto, marginTop: 2,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    // Sem `nowrap`: numa tela estreita esta linha quebra em duas em vez de
    // cortar justamente os numeros que justificam a acao.
    acaoDetalhe: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    acaoBotao: {
      flexShrink: 0, minHeight: 36, minWidth: 150, padding: `0 ${espaco.lg}px`,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 700,
      cursor: 'pointer', fontFamily: 'inherit',
    },
    acaoBotaoPrimario: {
      flexShrink: 0, minHeight: 36, minWidth: 150, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.sm, color: '#fff',
      ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: elevacao.baixa,
    },
    acoesNota: { ...tipo('legenda'), color: t.fraco },

    /* ---- agrupamento por produto ---- */
    filtro: {
      display: 'flex', gap: espaco.sm, marginBottom: espaco.xl,
      overflowX: 'auto', paddingBottom: espaco.xs,
    },
    filtroItem: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0,
      minHeight: analise ? 34 : 44, padding: `0 ${espaco.md}px`,
      background: t.superficie, borderRadius: raio.pill,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.medio, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `border-color ${transicao.rapida}, color ${transicao.rapida}`,
    },
    filtroAtivo: { borderColor: t.vermelho, color: t.texto },
    filtroContagem: {
      minWidth: 18, padding: '0 5px', borderRadius: raio.pill,
      background: t.realce, color: t.fraco, ...tipo('micro'),
      textTransform: 'none', letterSpacing: 0,
    },
    grupo: { marginBottom: espaco.xxl },
    grupoCabecalho: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap', marginBottom: espaco.md,
    },
    grupoTitulo: { ...tipo('destaque'), margin: 0, color: t.texto },
    grupoTituloVazio: { color: t.fraco, fontStyle: 'italic' },
    grupoResumo: { ...tipo('legenda'), color: t.fraco },

    /* ---- tabela (analise) ---- */
    painel: {
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      border: `1px solid ${t.borda}`, overflow: 'hidden',
    },
    areaRolagem: { overflowX: 'auto' },
    // A largura minima mora AQUI, uma vez so': abaixo dela a lista inteira
    // rola junto e a grade continua sendo a mesma para todos os grupos.
    // 980: abaixo disto o nome do estudo — a coluna que mais importa — ficaria
    // menor que o proprio nome. Melhor rolar a lista inteira que espremer.
    grade: { minWidth: 980 },
    // tableLayout fixo: a grade vem do colgroup, nao do conteudo de cada
    // grupo — e' o que mantem os grupos alinhados entre si.
    tabela: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: {
      textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    thNum: {
      textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    linha: { transition: `background ${transicao.rapida}` },
    linhaSobre: { background: t.realce },
    td: {
      padding: `${espaco.lg}px`, ...tipo('corpo'), color: t.medio,
      borderBottom: `1px solid ${t.borda}`,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    tdNome: {
      padding: `${espaco.lg}px`, ...tipo('corpoF'), color: t.texto,
      borderBottom: `1px solid ${t.borda}`,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    // Parece texto, nao botao: a linha inteira ja' reage ao mouse, e um
    // contorno em volta de cada nome viraria uma coluna de caixas. O
    // sublinhado so' aparece com o cursor em cima — e' ele que promete o
    // clique. Sem `display: block` o botao encolhe ao texto e o alvo fica
    // menor que a celula.
    linkNome: {
      display: 'block', width: '100%', padding: 0, textAlign: 'left',
      background: 'transparent', border: 'none',
      color: 'inherit', font: 'inherit', cursor: 'pointer',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    linkNomeSobre: { textDecoration: 'underline' },
    tdFraco: { padding: `${espaco.lg}px`, ...tipo('legenda'), color: t.fraco, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap' },
    tdNum: {
      padding: `${espaco.lg}px`, textAlign: 'right', ...tipo('corpoF'), ...numeros,
      color: t.texto, borderBottom: `1px solid ${t.borda}`,
    },
    tdAcoes: {
      padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right',
      borderBottom: `1px solid ${t.borda}`,
    },
    // Sem `nowrap`: numa tela estreita os botoes descem para a linha de
    // baixo em vez de sumirem cortados na borda direita.
    acoesLinha: {
      display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end',
      alignItems: 'center', gap: espaco.xs,
    },
    botaoLinha: {
      minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoRemover: {
      width: 32, height: 32, background: 'transparent', border: 'none',
      borderRadius: raio.sm, color: t.fraco, fontSize: 18, lineHeight: 1,
      cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- cartoes (coleta) ---- */
    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
    itemLista: { position: 'relative' },
    cartao: {
      width: '100%', minHeight: 76, display: 'flex', alignItems: 'center', gap: espaco.md,
      // Faixa reservada a direita para o botao de remover. Sem ela o × cai
      // em cima da contagem de ciclos — o absolute nao empurra conteudo.
      padding: espaco.lg, paddingRight: 56,
      background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    cartaoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
    cartaoNumero: { ...tipo('destaque'), ...numeros },
    cartaoRotulo: rotulo(t.fraco),
    botaoRemoverCartao: {
      // Centralizado na faixa reservada, nao no canto: no canto ele disputa
      // espaco com o numero e fica menor que o dedo precisa.
      position: 'absolute', top: '50%', right: espaco.sm, transform: 'translateY(-50%)',
      width: 40, height: 40,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- estado vazio estruturado (PC) ---- */
    vazioArea: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xl,
      paddingTop: espaco.xxxl,
    },
    vazioCartao: {
      width: '100%', maxWidth: 560,
      padding: `${espaco.xxxl}px ${espaco.xxl}px`,
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: espaco.md, textAlign: 'center',
    },
    vazioTitulo: { ...tipo('titulo'), margin: 0 },
    vazioTexto: { ...tipo('corpo'), margin: 0, color: t.medio, maxWidth: 400 },
    // Rotulo do sistema acima do titulo: responde "onde estou" antes de
    // "o que faco".
    vazioRotulo: rotulo(t.fraco),
    // Acao principal: maior que os botoes de ferramenta, sozinha no cartao.
    botaoGrande: {
      minHeight: 52, padding: `0 ${espaco.xxl}px`, marginTop: espaco.sm,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('destaque'), cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: elevacao.baixa,
    },

    fluxoRotulo: { ...rotulo(t.fraco), marginTop: espaco.xl },
    vazioFaixa: {
      width: '100%', maxWidth: 1080, marginTop: espaco.sm,
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    },
    fluxoEtapa: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
    fluxoSeta: { flexShrink: 0, padding: `0 ${espaco.sm}px`, color: t.fraco, fontSize: 18 },
    fluxoNumero: {
      flexShrink: 0, width: 22, height: 22, borderRadius: raio.pill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.realce, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.medio, ...tipo('micro'), fontWeight: 700,
    },
    vazioBloco: {
      flex: 1, minWidth: 0,
      display: 'flex', alignItems: 'center', gap: espaco.md, padding: espaco.lg,
      background: t.superficie, borderRadius: raio.lg,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    vazioBlocoTitulo: { ...tipo('corpoF') },
    vazioBlocoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },

    /* ---- estudos arquivados ---- */
    listaArquivados: {
      listStyle: 'none', margin: 0, padding: 0,
      display: 'flex', flexDirection: 'column', gap: espaco.sm,
      maxHeight: '50vh', overflowY: 'auto',
    },
    itemArquivado: {
      display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.md, background: t.realce, borderRadius: raio.md,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    arquivadoNome: {
      ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    arquivadoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    confirmarExclusao: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0 },
    confirmarTexto: { ...tipo('legenda'), color: t.critico, fontWeight: 600 },
    // Laranja de estado critico, nao o vermelho da marca: isto e' perigo,
    // e o vermelho Patrimar e' identidade — nunca aviso.
    botaoExcluirDeVez: {
      minHeight: 32, padding: `0 ${espaco.md}px`, background: t.critico,
      border: 'none', borderRadius: raio.sm, color: '#fff',
      ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- modal ---- */
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    formulario: {
      width: '100%', maxWidth: 520, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
      maxHeight: '92dvh', overflowY: 'auto',
    },
    formularioLargo: { maxWidth: 960 },
    formTitulo: { ...tipo('titulo'), margin: 0 },
    textoModal: { ...tipo('corpo'), margin: 0, color: t.medio },
    acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },
    // minmax(0, 1fr): input tem largura minima intrinseca e, sem o 0, a
    // coluna recusa encolher e estoura o painel no celular.
    duasColunas: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.lg },
    umaColuna: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: espaco.lg },

    /* ---- novo estudo em etapas ---- */
    formCabecalho: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: espaco.lg, flexWrap: 'wrap',
    },
    formCorpo: { display: 'flex', flexDirection: 'column', gap: espaco.xl },
    formCorpoDuplo: {
      display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: espaco.xl,
      alignItems: 'start',
    },
    formEsquerda: { display: 'flex', flexDirection: 'column', gap: espaco.xl, minWidth: 0 },
    secao: { display: 'flex', flexDirection: 'column', gap: espaco.md },
    campoLargo: { gridColumn: '1 / -1' },
    secaoSeparada: {
      display: 'flex', flexDirection: 'column', gap: espaco.md,
      paddingTop: espaco.lg,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    formRotulo: rotulo(t.fraco),

    etapas: {
      display: 'flex', alignItems: 'center', gap: espaco.sm,
      listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap',
    },
    etapaItem: { display: 'flex', alignItems: 'center', gap: espaco.sm },
    etapaTraco: { width: 18, height: 1, background: t.borda },
    etapaBotao: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      background: 'transparent', border: 'none', padding: 2,
      cursor: 'pointer', fontFamily: 'inherit',
    },
    etapaNumero: {
      width: 22, height: 22, borderRadius: raio.pill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.realce, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.fraco, ...tipo('micro'), fontWeight: 700,
    },
    etapaNumeroAtivo: { background: t.vermelho, borderColor: t.vermelho, color: '#fff' },
    etapaRotulo: { ...tipo('legenda'), fontWeight: 600, color: t.fraco },
    etapaRotuloAtivo: { color: t.texto },

    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    // "escolher do cadastro" do SeletorMaquina: volta do texto livre para a
    // lista. Discreto de proposito — o caminho normal e' escolher.
    linkCadastro: {
      marginTop: espaco.xs, padding: 0, alignSelf: 'flex-start',
      background: 'transparent', border: 'none', color: t.fraco,
      ...tipo('legenda'), fontWeight: 600, textDecoration: 'underline',
      cursor: 'pointer', fontFamily: 'inherit',
    },
    rotuloCampo: rotulo(t.fraco),
    obrigatorio: { color: t.critico },
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
      transition: `border-color ${transicao.rapida}`,
    },
    erroForm: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
    },
  };
}

