import { claro } from '../theme/tokensAnalise.js';
import { cores as escuro } from '../theme/tokens.js';
import { elevacao, espaco, raio, rotulo, tipo, transicao } from '../theme/escala.js';
import { LOGO_PATRIMAR, LOGO_PATRIMAR_CLARO } from '../theme/logo.js';

/**
 * Barra de topo fixa.
 *
 * Antes o cabecalho era logo + titulo + botoes flutuando direto sobre o
 * fundo da pagina, sem nada segurando. Isso e' o que faz uma interface
 * parecer inacabada: os elementos existem, mas nao pertencem a lugar
 * nenhum. Uma barra com superficie propria e elevacao ancora o topo e
 * separa navegacao de conteudo.
 */
export default function Cabecalho({ modo, titulo, subtitulo, acoes, aoTrocarModo, aoVoltar }) {
  const analise = modo === 'analise';
  const t = paleta(analise);
  const est = estilos(t, analise);

  return (
    <header style={est.barra}>
      <div style={est.interno}>
        <div style={est.marca}>
          {aoVoltar && (
            <button type="button" onClick={aoVoltar} style={est.voltar} aria-label="Voltar para a lista de estudos">
              <span aria-hidden="true" style={est.seta}>←</span>
              Estudos
            </button>
          )}
          <img src={analise ? LOGO_PATRIMAR : LOGO_PATRIMAR_CLARO} alt="Patrimar Móveis" style={est.logo} />
          <span style={est.divisorMarca} />
          <div style={{ minWidth: 0 }}>
            <div style={est.titulo}>{titulo}</div>
            {subtitulo && <div style={est.subtitulo}>{subtitulo}</div>}
          </div>
        </div>

        <div style={est.acoes}>
          {aoTrocarModo && <TrocaModo modo={modo} aoTrocar={aoTrocarModo} est={est} />}
          {acoes}
        </div>
      </div>
    </header>
  );
}

/**
 * Alternador de modo em controle segmentado.
 *
 * Antes eram duas coisas soltas: um selo que parecia botao mas nao era, e um
 * botao de texto ao lado. Duas formas para uma escolha binaria. Segmentado
 * mostra as duas opcoes e qual esta ativa, numa peca so.
 */
function TrocaModo({ modo, aoTrocar, est }) {
  return (
    <div style={est.segmentado} role="group" aria-label="Modo de uso">
      {[
        { id: 'coleta', rotulo: 'Coleta', dica: 'Celular, no posto' },
        { id: 'analise', rotulo: 'Análise', dica: 'PC, com impressão' },
      ].map((opcao) => {
        const ativo = modo === opcao.id;
        return (
          <button
            key={opcao.id}
            type="button"
            onClick={() => { if (!ativo) aoTrocar(); }}
            title={opcao.dica}
            aria-pressed={ativo}
            style={{ ...est.segmento, ...(ativo ? est.segmentoAtivo : {}) }}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

const paleta = (analise) => (analise
  ? { superficie: claro.papel, borda: claro.borda, texto: claro.texto,
      fraco: claro.textoFraco, medio: claro.textoMedio, sombra: elevacao.baixa,
      trilho: claro.fundo }
  : { superficie: escuro.superficie, borda: escuro.borda, texto: escuro.texto,
      fraco: escuro.textoFraco, medio: escuro.textoFraco, sombra: elevacao.escuraMedia,
      trilho: escuro.fundo });

function estilos(t, analise) {
  return {
    barra: {
      position: 'sticky', top: 0, zIndex: 10,
      background: t.superficie,
      borderBottom: `1px solid ${t.borda}`,
      boxShadow: t.sombra,
    },
    interno: {
      maxWidth: 1400, margin: '0 auto',
      padding: `${espaco.md}px ${espaco.xl}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: espaco.lg, flexWrap: 'wrap',
    },
    marca: { display: 'flex', alignItems: 'center', gap: espaco.lg, minWidth: 0 },
    logo: { height: 32, width: 'auto', display: 'block', flexShrink: 0 },
    divisorMarca: { width: 1, height: 28, background: t.borda, flexShrink: 0 },
    voltar: {
      minHeight: 34, padding: `0 ${espaco.md}px 0 ${espaco.sm}px`, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderRadius: raio.md, color: t.medio, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `background ${transicao.rapida}`,
    },
    seta: { fontSize: 15, lineHeight: 1 },
    titulo: {
      ...tipo('destaque'), color: t.texto,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    subtitulo: {
      ...tipo('legenda'), color: t.fraco, marginTop: 1,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    },
    acoes: { display: 'flex', alignItems: 'center', gap: espaco.md, flexWrap: 'wrap' },

    segmentado: {
      display: 'inline-flex', padding: 3, gap: 2,
      background: t.trilho, borderRadius: raio.md,
      border: `1px solid ${t.borda}`,
    },
    segmento: {
      minHeight: 32, padding: `0 ${espaco.md}px`,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `background ${transicao.rapida}, color ${transicao.rapida}`,
    },
    segmentoAtivo: {
      background: t.superficie, color: t.texto,
      boxShadow: analise ? elevacao.baixa : 'none',
    },
    rotuloMicro: rotulo(t.fraco),
  };
}
