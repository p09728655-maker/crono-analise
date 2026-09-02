import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { espaco } from '../../../theme/escala.js';
import { est } from './estilos.js';

/** As paradas do periodo, os maiores motivos primeiro — o pareto. */
export default function ParetoParadas({ pareto }) {
  return (
    <div style={est.duasColunas}>
      <section style={est.painelMiolo} aria-label="Paradas do período">
        <h2 style={est.iaTitulo}>Paradas</h2>
        <p style={est.iaTexto}>
          {formatarDuracao(pareto.totalMs)} de máquina parada — os maiores motivos primeiro
        </p>
        <div style={{ display: 'grid', gap: espaco.md, marginTop: espaco.md }}>
          {pareto.porMotivo.map((m) => (
            <div key={m.motivo} style={est.paretoLinha}>
              <span>{m.rotulo}</span>
              <span style={est.paretoTrilha}>
                <i style={{ ...est.paretoBarra, width: `${Math.max(4, m.pct)}%` }} />
              </span>
              <b style={{ whiteSpace: 'nowrap' }}>{formatarDuracao(m.ms)}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
