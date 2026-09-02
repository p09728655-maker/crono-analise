import { useEffect, useState } from 'react';
import {
  formatarCronometro, formatarDuracao, rotuloMotivo, textoDecimal,
} from '../../../domain/cronoanalise.js';
import { codigoPreferido } from '../../../lib/motivosParada.js';
import { est } from './estilos.js';

/**
 * Paradas do periodo — o painel que separa setup do resto.
 *
 * Fica junto dos campos do periodo porque e' isso que ele descreve: quanto
 * daquele intervalo a maquina NAO estava produzindo. Setup ganha botao
 * proprio porque e' a parada mais comum da furadeira (troca de gabarito,
 * programa, broca) e a unica que o processo exige — as outras entram pelo
 * segundo botao e viram escolha de motivo.
 *
 * O campo e' em MINUTOS: ninguem no chao de fabrica pensa em milissegundos.
 */
export default function Paradas({ motivos, paradas, resumo, duracaoMs, setupCrono, aoIniciarSetup, aoEncerrarSetup, aoAdicionar, aoAlterar, aoRemover }) {
  const produtivoMs = duracaoMs > 0 ? duracaoMs - Math.min(resumo.totalMs, duracaoMs) : 0;

  return (
    <div style={est.blocoParadas} aria-label="Paradas no período">
      <span style={est.rotuloCampo}>PARADAS NO PERÍODO</span>

      {setupCrono ? (
        <CronoSetup inicio={setupCrono.inicio} aoEncerrar={aoEncerrarSetup} />
      ) : (
        <div style={est.linhaBotoesParada}>
          {/* Setup abre CRONOMETRO, nao linha em branco: era o unico numero
              estimado de cabeca numa tela onde tudo e' medido. Quem prefere
              digitar usa Outra parada e troca o motivo — a dica diz isso.
              Sem cronometro disponivel (o resultado do ao vivo, em que o
              periodo ja' fechou), o botao volta a criar a linha manual. */}
          <button
            type="button" style={est.botaoSetup}
            onClick={aoIniciarSetup || (() => aoAdicionar(codigoPreferido(motivos, 'setup')))}
          >
            {aoIniciarSetup ? '⏱ SETUP / TROCA' : '+ SETUP / TROCA'}
          </button>
          <button
            type="button" style={est.botaoParada}
            onClick={() => aoAdicionar(codigoPreferido(motivos, 'falta_material'))}
          >
            + OUTRA PARADA
          </button>
        </div>
      )}

      {paradas.length === 0 ? (
        <span style={est.dicaParada}>
          {setupCrono
            ? 'O tempo entra na lista quando o setup terminar — e continua editável lá.'
            : `Nenhuma marcada — o período inteiro conta como máquina rodando.${aoIniciarSetup ? ' Setup / troca cronometra a parada; para digitar minutos de cabeça, use Outra parada e troque o motivo.' : ''}`}
        </span>
      ) : (
        <>
          {paradas.map((p) => (
            <div key={p.id} style={est.linhaParada}>
              <select
                value={p.motivo}
                onChange={(ev) => aoAlterar(p.id, 'motivo', ev.target.value)}
                style={est.selectMotivo}
                aria-label="Motivo da parada"
              >
                {motivos.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>
                ))}
              </select>
              {/* TEXTO, nao `type="number"`: o teclado brasileiro entrega
                  virgula e o campo numerico a DESCARTA em silencio — "1,25"
                  virava 125, cem vezes o valor, e em periodo longo passava
                  liso. O inputMode mantem o teclado numerico; textoDecimal
                  deixa passar digitos e um separador so'. */}
              <input
                type="text"
                inputMode="decimal"
                placeholder="min"
                value={p.minutos}
                onChange={(ev) => aoAlterar(p.id, 'minutos', textoDecimal(ev.target.value))}
                style={est.inputMinutos}
                aria-label={`Minutos parada — ${rotuloMotivo(p.motivo)}`}
              />
              <button
                type="button"
                style={est.itemRemover}
                onClick={() => aoRemover(p.id)}
                aria-label={`Remover parada ${rotuloMotivo(p.motivo)}`}
              >
                ×
              </button>
            </div>
          ))}

          {resumo.totalMs > 0 && (
            <span style={est.dicaParada}>
              Parado {formatarDuracao(resumo.totalMs)}
              {resumo.setupMs > 0 && ` (setup ${formatarDuracao(resumo.setupMs)})`}
              {duracaoMs > 0 && produtivoMs > 0 && ` · máquina rodando ${formatarDuracao(produtivoMs)}`}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Cronometro do setup no caminho dos horarios.
 *
 * Um toque quando a troca comeca, outro quando a maquina volta a rodar:
 * os minutos caem na lista de paradas ja' convertidos (duas casas), ainda
 * editaveis. Precisa de relogio proprio porque no formulario nada mais
 * repinta a tela — ao vivo quem repinta e' o cronometro do periodo.
 */
function CronoSetup({ inicio, aoEncerrar }) {
  const [decorrido, setDecorrido] = useState(() => performance.now() - inicio);
  useEffect(() => {
    const id = setInterval(() => setDecorrido(performance.now() - inicio), 100);
    return () => clearInterval(id);
  }, [inicio]);

  return (
    <div style={est.cronoSetup} role="timer" aria-label="Setup em andamento">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={est.cronoSetupRotulo}>SETUP EM ANDAMENTO</div>
        <div style={est.cronoSetupTempo}>{formatarCronometro(decorrido)}</div>
      </div>
      <button type="button" style={est.botaoFimSetup} onClick={aoEncerrar}>
        ■ SETUP TERMINOU
      </button>
    </div>
  );
}

