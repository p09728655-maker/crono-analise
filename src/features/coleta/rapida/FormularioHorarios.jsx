import { vibrar } from '../../../lib/hooks.js';
import Paradas from './Paradas.jsx';
import { CampoMaquina, CiclosFuracao } from './CamposDaPeca.jsx';
import { est } from './estilos.js';
import { agoraHM } from './formato.js';

/**
 * O FORMULARIO DE HORARIOS — o caminho principal da tela.
 *
 * O analista PASSA pelo posto as 7:00 e toca Agora; volta as 7:10, toca
 * Agora de novo, le o contador da maquina (150 pecas) e a conta sai. Os
 * horarios tambem podem ser digitados de cabeca, depois do fato. As
 * paradas do periodo ficam junto dos campos, porque e' isso que elas
 * descrevem: quanto daquele intervalo a maquina NAO estava produzindo.
 */
export default function FormularioHorarios({
  maquina, aoTrocarMaquina, peca, aoTrocarPeca, ciclosPorPeca, aoTrocarCiclos,
  horaInicial, aoTrocarHoraInicial, horaFinal, aoTrocarHoraFinal,
  pecasPeriodo, aoTrocarPecas, duracaoMs, motivos, paradas,
}) {
  return (
    <section style={est.formHoras} aria-label="Conferência por horários">
      <div style={est.linhaHoras}>
        <label style={est.campoHora}>
          <span style={est.rotuloCampo}>MÁQUINA</span>
          <CampoMaquina valor={maquina} aoTrocar={aoTrocarMaquina} />
        </label>
        <label style={est.campoHora}>
          <span style={est.rotuloCampo}>PEÇA</span>
          <input
            type="text"
            placeholder="Ex: Lateral Mesa"
            value={peca}
            onChange={(ev) => aoTrocarPeca(ev.target.value)}
            style={est.inputTexto}
            aria-label="Nome da peça"
          />
        </label>
      </div>

      <CiclosFuracao valor={ciclosPorPeca} aoTrocar={aoTrocarCiclos} />

      <div style={est.linhaHoras}>
        {[
          ['HORA INICIAL', 'Hora inicial', horaInicial, aoTrocarHoraInicial],
          ['HORA FINAL', 'Hora final', horaFinal, aoTrocarHoraFinal],
        ].map(([rotulo, aria, valor, trocar]) => (
          <div key={aria} style={est.campoHora}>
            <span style={est.rotuloCampo}>{rotulo}</span>
            <div style={est.horaComAgora}>
              <input
                type="time"
                value={valor}
                onChange={(ev) => trocar(ev.target.value)}
                style={est.inputHora}
                aria-label={aria}
              />
              <button
                type="button"
                style={est.botaoAgora}
                onClick={() => { trocar(agoraHM()); vibrar(30); }}
              >
                Agora
              </button>
            </div>
          </div>
        ))}
      </div>

      <label style={est.campoHora}>
        <span style={est.rotuloCampo}>PEÇAS NO PERÍODO</span>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="Ex: 150"
          value={pecasPeriodo}
          onChange={(ev) => aoTrocarPecas(ev.target.value)}
          style={est.inputPecasForm}
          aria-label="Peças no período"
        />
      </label>

      <Paradas
        motivos={motivos}
        paradas={paradas.paradas}
        resumo={paradas.total}
        duracaoMs={duracaoMs}
        setupCrono={paradas.setupCrono}
        aoIniciarSetup={paradas.iniciarSetup}
        aoEncerrarSetup={paradas.encerrarSetup}
        aoAdicionar={paradas.adicionar}
        aoAlterar={paradas.alterar}
        aoRemover={paradas.remover}
      />
    </section>
  );
}
