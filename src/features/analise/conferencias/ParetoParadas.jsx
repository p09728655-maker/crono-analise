import { Fragment } from 'react';
import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * As paradas do periodo, os maiores motivos primeiro — o pareto.
 *
 * Os tres campos de cada motivo entram DIRETO no grid da lista, sem um
 * elemento de linha em volta: e' o que faz todas as barras comecarem no
 * mesmo x. Envolver cada motivo numa div com as proprias colunas fazia
 * cada linha se alinhar sozinha, e num pareto a barra e' a leitura —
 * comeco desalinhado muda o comprimento aparente de cada uma.
 */
export default function ParetoParadas({ pareto }) {
  return (
    <div style={est.duasColunas}>
      <section style={est.painelMiolo} aria-label="Paradas do período">
        <h2 style={est.iaTitulo}>Paradas</h2>
        <p style={est.iaTexto}>
          {formatarDuracao(pareto.totalMs)} de máquina parada — os maiores motivos primeiro
        </p>
        <div style={est.paretoGrade}>
          {pareto.porMotivo.map((m) => (
            <Fragment key={m.motivo}>
              <span style={est.paretoRotulo} title={m.rotulo}>{m.rotulo}</span>
              <span style={est.paretoTrilha}>
                <i style={{ ...est.paretoBarra, width: `${Math.max(4, m.pct)}%` }} />
              </span>
              <b style={est.paretoValor}>{formatarDuracao(m.ms)}</b>
            </Fragment>
          ))}
        </div>
      </section>
    </div>
  );
}
