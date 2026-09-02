import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { espaco } from '../../../theme/escala.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * Ritmo POR PECA — o numero que planeja carga e lote. Uma linha por peca x
 * maquina, com a maquina rodando.
 *
 * A coluna ACION. e' a que o redesenho de 31/08 tirou junto com o jargao.
 * Sem ela, duas linhas com ritmos diferentes nao tinham como ser
 * explicadas — e a explicacao estava gravada na medicao o tempo todo.
 */
export default function TabelaRitmoPorPeca({ resumoPecas }) {
  return (
    <section style={est.painel} aria-label="Ritmo por peça">
      {/* O mesmo respiro das celulas: sem ele o titulo encosta na borda do
          cartao e parece cortado (apontado em 28/08). */}
      <div style={{ padding: `${espaco.lg}px ${espaco.lg}px ${espaco.sm}px` }}>
        <h2 style={est.iaTitulo}>Ritmo por peça</h2>
        <p style={est.iaTexto}>
          Quantas peças saem por hora e por minuto, peça a peça, com a máquina rodando.
          A coluna <strong>Acion.</strong> diz quantas vezes o motor é acionado para
          fazer uma peça: peça de mais acionamentos rende menos peças/hora sem a
          máquina estar mais lenta.
        </p>
      </div>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Peça</th>
            <th style={est.th}>Máquina</th>
            <th style={est.thNum} title="Acionamentos do motor para fazer uma peça">
              Acion.
            </th>
            <th style={est.thNum}>Medições</th>
            <th style={est.thNum}>Peças</th>
            <th style={est.thNum}>Tempo rodando</th>
            <th style={est.thNum}>Peças/hora</th>
            <th style={est.thNum}>Peças/min</th>
            <th style={est.thNum} title="Tempo de um acionamento do motor — comparável entre peças de furação diferente">
              Por acion.
            </th>
          </tr>
        </thead>
        <tbody>
          {resumoPecas.map((g) => (
            <tr key={`${g.maquina}·${g.peca}`}>
              <td style={est.tdCurto}>{g.peca}</td>
              <td style={est.tdCurto}>{g.maquina}</td>
              <td
                style={est.tdNum}
                title={g.ciclosMistos
                  ? `Gravada com ${g.ciclosVistos.join(' e ')} acionamentos — corrija na medição`
                  : undefined}
              >
                {g.ciclosMistos ? `${g.ciclosVistos.join('/')} ⚠` : g.ciclosPorPeca}
              </td>
              <td style={est.tdNum}>{g.n}</td>
              <td style={est.tdNum}>{g.totalPecas}</td>
              <td style={est.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
              <td style={est.tdNumForte}>{Math.round(g.ritmoMedio)}</td>
              <td style={est.tdNum}>{porMinuto(g.ritmoMedio)}</td>
              <td style={est.tdNum}>{(g.cicloMotorMs / 1000).toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
