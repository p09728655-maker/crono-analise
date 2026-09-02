import { claro } from '../theme/tokensAnalise.js';
import { cores as escuro } from '../theme/tokens.js';
import { elevacao, espaco, numeros, raio, tipo } from '../theme/escala.js';
import { HISTORICO } from '../versao.js';

/**
 * Historico de versoes.
 *
 * Aberto pelo numero de versao no cabecalho. Responde a pergunta que o
 * usuario faz quando a tela amanhece diferente: "o que mudou?". Cada
 * entrada fala do trabalho, nao do codigo.
 */
export default function HistoricoVersoes({ modo = 'analise', aoFechar }) {
  const analise = modo === 'analise';
  const t = analise
    ? { superficie: claro.papel, fundo: claro.fundo, borda: claro.borda, texto: claro.texto,
        medio: claro.textoMedio, fraco: claro.textoFraco, vermelho: claro.vermelho }
    : { superficie: escuro.superficie, fundo: escuro.fundo, borda: escuro.borda, texto: escuro.texto,
        medio: escuro.textoFraco, fraco: escuro.textoFraco, vermelho: escuro.vermelho };
  const est = estilos(t, analise);

  return (
    <div style={est.modal} role="dialog" aria-label="Histórico de versões">
      <div style={est.caixa}>
        <div style={est.topo}>
          <h2 style={est.titulo}>Histórico de versões</h2>
          <button type="button" style={est.fechar} onClick={aoFechar} aria-label="Fechar histórico">
            ×
          </button>
        </div>

        <ol style={est.lista}>
          {HISTORICO.map((v, i) => (
            <li key={v.versao} style={{ ...est.entrada, ...(i === 0 ? {} : est.entradaSeparada) }}>
              <div style={est.entradaTopo}>
                <span style={{ ...est.numero, ...(i === 0 ? est.numeroAtual : {}) }}>v{v.versao}</span>
                {i === 0 && <span style={est.seloAtual}>atual</span>}
                <span style={est.meta}>
                  {v.titulo}
                  {v.data ? ` · ${formatarData(v.data)}` : ''}
                </span>
              </div>
              <ul style={est.itens}>
                {v.itens.map((item) => <li key={item} style={est.item}>{item}</li>)}
              </ul>
            </li>
          ))}
        </ol>

        <button type="button" style={est.botaoFechar} onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function formatarData(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

function estilos(t, analise) {
  return {
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    caixa: {
      width: '100%', maxWidth: 640, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta, margin: `${espaco.xl}px 0`,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
    },
    topo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: espaco.md },
    titulo: { ...tipo('titulo'), margin: 0 },
    fechar: {
      width: 40, height: 40, flexShrink: 0,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 22, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },

    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
    entrada: { padding: `${espaco.lg}px 0` },
    entradaSeparada: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda },
    entradaTopo: {
      display: 'flex', alignItems: 'baseline', gap: espaco.sm,
      flexWrap: 'wrap', marginBottom: espaco.sm,
    },
    numero: { ...tipo('corpoF'), ...numeros, color: t.medio },
    numeroAtual: { color: t.texto },
    seloAtual: {
      padding: '1px 8px', borderRadius: raio.pill,
      background: t.vermelho, color: '#fff',
      ...tipo('micro'), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    },
    meta: { ...tipo('legenda'), color: t.fraco },
    itens: { margin: 0, paddingLeft: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.xs },
    item: { ...tipo('corpo'), color: t.medio },

    botaoFechar: {
      alignSelf: 'flex-end',
      minHeight: analise ? 40 : 48, padding: `0 ${espaco.xl}px`,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
  };
}
