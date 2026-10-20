import {
  formatarCronometro, formatarDuracao, formatarSegundos, rotuloMotivo,
} from '../../../domain/cronoanalise.js';
import { Parcial } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * A TELA DO CRONOMETRO RODANDO: o tempo, o alvo gigante e a barra de
 * acoes. Sem rolagem e sem distracao — e' a mesma postura da coleta: em
 * pe', as vezes de luva, olhando a maquina e nao o celular.
 */
export default function CronometroAoVivo({
  crono, parcial, totalParadaMs, motivos, unidade,
  // Embalagem Takt Time: o ritmo por hora da lugar ao ULTIMO intervalo, ao
  // tempo POR VOLUME do periodo ate' aqui (paradas dentro — a regua do
  // takt, ver periodoPorPeca) e ao takt, em segundos.
  modoTakt = false, taktMs = null, porVolumeMs = null,
}) {
  const {
    decorrido, pecas, pulso, emParada, tempoParadaAtual, escolhendoMotivo, setEscolhendoMotivo,
    contarPeca, desfazer, iniciarParada, encerrarParada, encerrar, ultimoIntervaloMs,
    aguardandoLargada,
  } = crono;
  /* O aviso vai no tempo por volume do PERIODO, nao no ultimo intervalo: o
     rack de dois volumes sai com os dois colados (25 s, 100 s...), e o
     ultimo passaria do takt a cada dois volumes numa linha que atende. E
     com as paradas dentro: marcar "Parou" nao pode apagar o aviso. */
  const acimaDoTakt = modoTakt && taktMs > 0 && porVolumeMs > taktMs;

  return (
    <>
      <section style={est.painelTempo} aria-label="Tempo decorrido">
        <span style={est.rotuloTempo}>TEMPO</span>
        <span style={est.tempoCorrido}>{formatarCronometro(decorrido)}</span>
        <div style={est.linhaParcial}>
          {/* Na embalagem o toque conta VOLUME — e a tela diz isso, porque
              o programa da embalagem tambem vem em volumes. */}
          <Parcial rotulo={maiuscula(unidade.plural)} valor={String(pecas)} />
          {modoTakt ? (
            <>
              <Parcial
                rotulo="Último"
                valor={ultimoIntervaloMs ? formatarSegundos(ultimoIntervaloMs) : '—'}
                sufixo="s"
              />
              {/* Acima do takt, ganha SETA no rotulo e fundo: a cor sozinha
                  nao serve a quem olha de longe, de luva, com sol. */}
              <Parcial
                rotulo={acimaDoTakt ? 'Por vol ▲ takt' : 'Por volume'}
                valor={porVolumeMs ? formatarSegundos(porVolumeMs) : '—'}
                sufixo="s"
                tom={acimaDoTakt ? 'atencao' : null}
              />
              <Parcial rotulo="Takt" valor={taktMs > 0 ? formatarSegundos(taktMs) : '—'} sufixo="s" />
            </>
          ) : (
            <Parcial rotulo="Ritmo" valor={parcial && pecas > 0 ? String(Math.round(parcial.pecasPorHora)) : '—'} sufixo={`${unidade.abrev}/h`} />
          )}
          {/* No modo takt sao quatro numeros e a tela e' de celular: o
              parado sai daqui (a parada em curso ocupa a tela inteira) e
              volta no resultado. */}
          {!modoTakt && (
            <Parcial rotulo="Parado" valor={totalParadaMs > 0 ? formatarDuracao(totalParadaMs) : '—'} />
          )}
        </div>
      </section>

      {emParada ? (
        /* Maquina parada: o relogio do periodo segue correndo (a parada
           esta' DENTRO dele), mas contar peca fica bloqueado e a tela
           inteira vira o botao de voltar a produzir. */
        <button
          type="button"
          onPointerDown={encerrarParada}
          style={{ ...est.botaoGrande, ...est.botaoVoltarProduzir }}
          aria-label="Encerrar a parada e voltar a produzir"
        >
          <span style={est.rotuloParadaAtiva}>PARADA · {rotuloMotivo(emParada.motivo)}</span>
          <span style={est.contagem}>{formatarCronometro(Math.max(0, tempoParadaAtual))}</span>
          <span style={est.rotuloBotao}>▶ VOLTOU A PRODUZIR</span>
        </button>
      ) : aguardandoLargada ? (
        /* Armado: o relogio abre neste toque, que nao conta volume (ver
           useCronometroAoVivo). Outra cor, para ninguem confundir de longe
           com o alvo que ja' esta' contando. */
        <button
          type="button"
          onPointerDown={contarPeca}
          style={{ ...est.botaoGrande, ...est.botaoIniciar }}
          aria-label="Largada: abrir o relógio"
        >
          <span style={est.iconeIniciar}>▶</span>
          <span style={est.rotuloBotao}>TOQUE QUANDO FECHAR UM {unidade.singular.toUpperCase()}</span>
          <span style={est.dicaBotao}>o relógio começa neste toque · ele não conta {unidade.singular}</span>
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={contarPeca}
          style={{ ...est.botaoGrande, ...est.botaoContar }}
          aria-label={`Contar ${unidade.comArtigo}`}
        >
          <span key={pulso} style={est.contagem}>{pecas}</span>
          <span style={est.rotuloBotao}>TOQUE A CADA {unidade.singular.toUpperCase()}</span>
          {/* Na embalagem, digitar o total no fim perde o intervalo de cada
              volume — que e' o motivo da tela. A dica nao convida a isso. */}
          <span style={est.dicaBotao}>
            {modoTakt ? 'o horário de cada toque é gravado sozinho' : 'ou só cronometre e digite o total no fim'}
          </span>
        </button>
      )}

      <nav style={est.barraInferiorTres} aria-label="Ações da conferência">
        <button type="button" style={est.botaoBarra} onClick={desfazer} disabled={!pecas || !!emParada}>
          <span style={est.iconeBarra}>↩</span>
          Desfazer
        </button>
        {/* Antes da largada nao ha' periodo para a parada caber dentro. */}
        <button
          type="button"
          style={{ ...est.botaoBarra, ...est.botaoParou }}
          onClick={() => (emParada ? encerrarParada() : setEscolhendoMotivo(true))}
          disabled={aguardandoLargada}
        >
          <span style={est.iconeBarra}>{emParada ? '▶' : '⏸'}</span>
          {emParada ? 'Voltou' : 'Parou'}
        </button>
        {/* Sem largada nada foi medido: o botao volta ao comeco, e diz isso. */}
        <button type="button" style={{ ...est.botaoBarra, ...est.botaoEncerrar }} onClick={encerrar}>
          <span style={est.iconeBarra}>{aguardandoLargada ? '✕' : '■'}</span>
          {aguardandoLargada ? 'Cancelar' : 'Encerrar'}
        </button>
      </nav>

      {escolhendoMotivo && (
        <div style={est.folhaMotivos} role="dialog" aria-label="Por que a máquina parou">
          <div style={est.folhaCaixa}>
            <div style={est.folhaTitulo}>Por que parou?</div>
            <div style={est.gradeMotivos}>
              {motivos.map((m) => (
                <button
                  key={m.codigo}
                  type="button"
                  style={{ ...est.chipMotivo, ...(m.codigo === 'setup' ? est.chipSetup : {}) }}
                  onClick={() => iniciarParada(m.codigo)}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            <button type="button" style={est.botaoOutraPeca} onClick={() => setEscolhendoMotivo(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
