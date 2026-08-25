import { claro } from '../theme/tokensAnalise.js';
import { espaco, raio, tipo, transicao } from '../theme/escala.js';

/**
 * Navegacao em abas.
 *
 * Serve para alternar VISTAS do mesmo objeto — nao para navegar entre
 * coisas diferentes. Por isso a aba ativa vive na URL como parametro
 * (?aba=), com replaceState: recarregar e compartilhar link preservam a
 * vista, mas o botao Voltar sai do estudo em vez de percorrer abas. Abas
 * nao sao lugares por onde se passou.
 */
export default function Abas({ abas, ativa, aoTrocar }) {
  return (
    <div style={est.trilho} role="tablist" aria-label="Seções da análise">
      {abas.map((aba) => {
        const selecionada = aba.id === ativa;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={selecionada}
            onClick={() => aoTrocar(aba.id)}
            style={{ ...est.aba, ...(selecionada ? est.abaAtiva : {}) }}
          >
            {aba.rotulo}
            {aba.contador != null && (
              <span style={{ ...est.contador, ...(selecionada ? est.contadorAtivo : {}) }}>
                {aba.contador}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const est = {
  trilho: {
    display: 'flex', gap: espaco.xs, flexWrap: 'wrap',
    borderBottom: `1px solid ${claro.borda}`,
    marginBottom: espaco.xl,
  },
  aba: {
    display: 'inline-flex', alignItems: 'center', gap: espaco.sm,
    minHeight: 44, padding: `0 ${espaco.lg}px`,
    background: 'transparent', border: 'none',
    // A borda de baixo e' o indicador; transparente mantem a altura estavel
    // e evita o texto "pular" ao trocar de aba. Longhand de proposito: a aba
    // ativa troca so' a cor, e misturar com a shorthand quebra no rerender.
    borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: 'transparent',
    color: claro.textoFraco, ...tipo('corpoF'),
    cursor: 'pointer', fontFamily: 'inherit',
    transition: `color ${transicao.rapida}, border-color ${transicao.rapida}`,
  },
  abaAtiva: { color: claro.texto, borderBottomColor: claro.vermelho },
  contador: {
    minWidth: 20, padding: '1px 6px', borderRadius: raio.pill,
    background: claro.fundo, color: claro.textoFraco,
    ...tipo('micro'), textTransform: 'none', letterSpacing: 0,
  },
  contadorAtivo: { background: 'rgba(219, 33, 38, 0.1)', color: claro.vermelho },
};
