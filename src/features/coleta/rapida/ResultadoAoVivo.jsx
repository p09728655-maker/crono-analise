import { formatarCronometro, formatarDuracao } from '../../../domain/cronoanalise.js';
import Paradas from './Paradas.jsx';
import { CampoMaquina, CiclosFuracao } from './CamposDaPeca.jsx';
import { AvisoSalvar, BotaoSalvar, ComParadas, RitmoDoPeriodo, SemAParada } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * O RESULTADO DO CRONOMETRO: o periodo fechou, e o que se ajusta agora e'
 * o que o cronometro nao sabia — maquina, peca, ciclos, a contagem lida no
 * contador da maquina e a parada esquecida no calor da coleta. Tudo
 * editavel antes de salvar, sem refazer a conferencia.
 */
export default function ResultadoAoVivo({
  crono, resultado, excede, totalParadaMs, motivos, paradas,
  maquina, aoTrocarMaquina, peca, aoTrocarPeca, ciclosPorPeca, aoTrocarCiclos,
  salvo, aoSalvar, aoSair,
}) {
  const { duracaoFinal, pecasFinais, setPecasFinais, novaConferencia } = crono;

  const editorParadas = (
    <Paradas
      motivos={motivos}
      paradas={paradas.paradas}
      resumo={paradas.total}
      duracaoMs={duracaoFinal}
      aoAdicionar={paradas.adicionar}
      aoAlterar={paradas.alterar}
      aoRemover={paradas.remover}
    />
  );

  if (!resultado) {
    // Paradas maiores que o periodo cronometrado: nao ha ritmo a calcular.
    // A tela diz isso e deixa a lista de paradas na mao para corrigir.
    if (!excede) return null;
    return (
      <section style={est.avisoParada} role="alert">
        As paradas somam {formatarDuracao(totalParadaMs)} e o período
        cronometrado tem {formatarDuracao(duracaoFinal)} — não sobra tempo de
        máquina rodando. Ajuste os minutos de parada abaixo.
        {editorParadas}
      </section>
    );
  }

  return (
    <>
      <section style={est.painelResultado} aria-label="Resultado da conferência">
        <div style={est.linhaResultado}>
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

        <div style={est.linhaResultado}>
          <div style={est.blocoResultado}>
            <span style={est.rotuloTempo}>TEMPO CRONOMETRADO</span>
            <span style={est.valorTempo}>{formatarCronometro(duracaoFinal)}</span>
          </div>
          <label style={est.blocoResultado}>
            <span style={est.rotuloTempo}>PEÇAS NO PERÍODO</span>
            {/* Editavel de proposito: quem leu o contador da maquina
                corrige aqui e o resultado recalcula na hora. */}
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={pecasFinais}
              onChange={(ev) => setPecasFinais(ev.target.value)}
              style={est.inputPecas}
              aria-label="Peças no período"
            />
          </label>
        </div>

        {/* Mesma hierarquia do caminho dos horarios: a manchete e' o que
            saiu do posto; o ritmo de maquina rodando fica na linha das
            paradas. O periodo nao repete aqui — esta' no TEMPO CRONOMETRADO. */}
        <RitmoDoPeriodo calculado={resultado}>
          <CiclosFuracao valor={ciclosPorPeca} aoTrocar={aoTrocarCiclos} compacto />
        </RitmoDoPeriodo>
        <ComParadas calculado={resultado} />
        <SemAParada calculado={resultado} />

        {/* Editavel tambem aqui: parada esquecida no calor da coleta se
            corrige antes de salvar, sem refazer a conferencia. */}
        {editorParadas}

        {resultado.pecas > 0 && <BotaoSalvar salvo={salvo} aoSalvar={aoSalvar} />}
      </section>

      <AvisoSalvar />

      <nav style={est.barraInferior} aria-label="Ações do resultado">
        <button type="button" style={est.botaoBarra} onClick={aoSair}>
          <span style={est.iconeBarra}>←</span>
          Sair
        </button>
        <button
          type="button"
          style={{ ...est.botaoBarra, ...est.botaoNova }}
          onClick={novaConferencia}
        >
          <span style={est.iconeBarra}>▶</span>
          Nova conferência
        </button>
      </nav>
    </>
  );
}
