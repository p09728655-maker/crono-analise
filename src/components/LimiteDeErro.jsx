import { Component } from 'react';
import { cores } from '../theme/tokens.js';

/**
 * Limite de erro da aplicacao.
 *
 * Sem isto, qualquer excecao durante a renderizacao desmonta a arvore inteira
 * e o usuario ve uma TELA BRANCA — sem explicacao e sem saida. No chao de
 * fabrica isso e' pior que um erro: a pessoa nao sabe se travou, se perdeu
 * dado, nem o que fazer.
 *
 * Aqui o erro vira uma tela com contexto e duas saidas reais. E a mensagem
 * diz explicitamente que os ciclos ja' coletados estao salvos no aparelho,
 * porque essa e' a primeira duvida de quem esta cronometrando.
 */
export default class LimiteDeErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('[ritmopatrimar] erro de renderizacao:', erro, info?.componentStack);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div style={est.tela} role="alert">
        <h1 style={est.titulo}>Algo quebrou nesta tela</h1>

        <p style={est.texto}>
          Os ciclos que você já cronometrou <strong>estão salvos no aparelho</strong> e
          serão enviados assim que possível. Nada foi perdido.
        </p>

        <pre style={est.detalhe}>{String(erro?.message || erro)}</pre>

        <div style={est.acoes}>
          <button
            type="button"
            style={est.botaoPrimario}
            onClick={() => { window.location.href = '/'; }}
          >
            Voltar ao início
          </button>
          <button
            type="button"
            style={est.botaoSecundario}
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}

const est = {
  tela: {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
    background: cores.fundo, color: cores.texto, textAlign: 'center',
    fontFamily: "'Calibri', 'Carlito', 'Segoe UI', system-ui, sans-serif",
  },
  titulo: { margin: 0, fontSize: 22, fontWeight: 700 },
  texto: { margin: 0, maxWidth: 460, lineHeight: 1.6, fontSize: 14, color: cores.textoFraco },
  detalhe: {
    margin: 0, maxWidth: 460, padding: 12, overflowX: 'auto',
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: 8,
    fontSize: 12, color: cores.textoFraco, textAlign: 'left',
    fontFamily: "'Consolas', monospace", whiteSpace: 'pre-wrap',
  },
  acoes: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  botaoPrimario: {
    minHeight: 56, padding: '0 24px', background: cores.vermelho, border: 'none',
    borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: 56, padding: '0 24px', background: 'transparent',
    border: `1px solid ${cores.borda}`, borderRadius: 10, color: cores.textoFraco,
    fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
  },
};
