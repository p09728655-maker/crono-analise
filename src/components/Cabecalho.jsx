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
 * Alternador de modo em abas sublinhadas.
 *
 * Duas opcoes de navegacao no topo, com a ativa marcada pelo sublinhado
 * vermelho da marca — o mesmo padrao das abas internas do painel. A inativa
 * carrega um sublinhado transparente da mesma espessura, para o texto nao
 * pular quando a marcacao muda de lugar.
 */
function TrocaModo({ modo, aoTrocar, est }) {
  return (
    <nav style={est.abas} aria-label="Modo de uso">
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
            aria-current={ativo ? 'page' : undefined}
            style={{ ...est.aba, ...(ativo ? est.abaAtiva : {}) }}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </nav>
  );
}

const paleta = (analise) => (analise
  ? { superficie: claro.papel, borda: claro.borda, texto: claro.texto,
      fraco: claro.textoFraco, medio: claro.textoMedio, sombra: elevacao.baixa,
      vermelho: claro.vermelho }
  : { superficie: escuro.superficie, borda: escuro.borda, texto: escuro.texto,
      fraco: escuro.textoFraco, medio: escuro.textoFraco, sombra: elevacao.escuraMedia,
      vermelho: escuro.vermelho });

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

    abas: { display: 'inline-flex', gap: espaco.lg },
    aba: {
      minHeight: 38, padding: `0 ${espaco.xs}px`,
      background: 'transparent', borderWidth: 0,
      borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent',
      color: t.fraco, ...tipo('corpo'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `color ${transicao.rapida}, border-color ${transicao.rapida}`,
    },
    abaAtiva: {
      color: t.texto,
      borderBottomColor: t.vermelho,
    },
    rotuloMicro: rotulo(t.fraco),
  };
}
