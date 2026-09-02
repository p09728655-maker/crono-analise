import { formatarCronometro, formatarDuracao, rotuloMotivo } from '../../../domain/cronoanalise.js';
import { Parcial } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * A TELA DO CRONOMETRO RODANDO: o tempo, o alvo gigante e a barra de
 * acoes. Sem rolagem e sem distracao — e' a mesma postura da coleta: em
 * pe', as vezes de luva, olhando a maquina e nao o celular.
 */
export default function CronometroAoVivo({ crono, parcial, totalParadaMs, motivos }) {
  const {
    decorrido, pecas, pulso, emParada, tempoParadaAtual, escolhendoMotivo, setEscolhendoMotivo,
    contarPeca, desfazer, iniciarParada, encerrarParada, encerrar,
  } = crono;

  return (
    <>
      <section style={est.painelTempo} aria-label="Tempo decorrido">
        <span style={est.rotuloTempo}>TEMPO</span>
        <span style={est.tempoCorrido}>{formatarCronometro(decorrido)}</span>
        <div style={est.linhaParcial}>
          <Parcial rotulo="Peças" valor={String(pecas)} />
          <Parcial rotulo="Ritmo" valor={parcial && pecas > 0 ? String(Math.round(parcial.pecasPorHora)) : '—'} sufixo="pç/h" />
          <Parcial rotulo="Parado" valor={totalParadaMs > 0 ? formatarDuracao(totalParadaMs) : '—'} />
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
      ) : (
        <button
          type="button"
          onPointerDown={contarPeca}
          style={{ ...est.botaoGrande, ...est.botaoContar }}
          aria-label="Contar uma peça"
        >
          <span key={pulso} style={est.contagem}>{pecas}</span>
          <span style={est.rotuloBotao}>TOQUE A CADA PEÇA</span>
          <span style={est.dicaBotao}>ou só cronometre e digite o total no fim</span>
        </button>
      )}

      <nav style={est.barraInferiorTres} aria-label="Ações da conferência">
        <button type="button" style={est.botaoBarra} onClick={desfazer} disabled={!pecas || !!emParada}>
          <span style={est.iconeBarra}>↩</span>
          Desfazer
        </button>
        <button
          type="button"
          style={{ ...est.botaoBarra, ...est.botaoParou }}
          onClick={() => (emParada ? encerrarParada() : setEscolhendoMotivo(true))}
        >
          <span style={est.iconeBarra}>{emParada ? '▶' : '⏸'}</span>
          {emParada ? 'Voltou' : 'Parou'}
        </button>
        <button type="button" style={{ ...est.botaoBarra, ...est.botaoEncerrar }} onClick={encerrar}>
          <span style={est.iconeBarra}>■</span>
          Encerrar
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
