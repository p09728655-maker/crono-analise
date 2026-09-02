import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { AvisoSalvar, BotaoSalvar, ComParadas, RitmoDoPeriodo, SemAParada } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * O que aparece EMBAIXO do formulario de horarios, conforme o que ja' foi
 * preenchido: a explicacao (nada ainda), o aviso de parada maior que o
 * periodo, ou o resultado — que recalcula a cada tecla. Sem botao
 * "calcular": ele so' atrasaria.
 */
export default function ResultadoHorarios({
  resultado, duracaoMs, totalParadaMs, excede, salvo, aoSalvar, aoMaisUmPeriodo, aoOutraPeca,
}) {
  // Paradas maiores que o periodo: sobra zero de maquina rodando e nao ha
  // ritmo a calcular. A tela diz isso em vez de sumir com o resultado.
  if (excede) {
    return (
      <section style={est.avisoParada} role="alert">
        As paradas somam {formatarDuracao(totalParadaMs)} e o período tem
        {' '}{formatarDuracao(duracaoMs)} — não sobra tempo de máquina rodando.
        Confira os horários ou os minutos de parada.
      </section>
    );
  }

  if (!resultado || !(resultado.pecas > 0)) {
    return (
      <section style={est.explicacao}>
        Passe pela máquina e toque <strong>Agora</strong> na chegada; na
        volta, toque <strong>Agora</strong> de novo, digite quantas peças
        saíram e a conta aparece aqui — peças/hora e ciclo médio. Também
        dá para digitar os horários depois, de cabeça. Se houve
        <strong> setup</strong> ou outra parada no meio, marque acima:
        o ritmo passa a sair do tempo em que a máquina rodou.
      </section>
    );
  }

  return (
    <section style={est.painelHoras} aria-label="Resultado dos horários">
      <RitmoDoPeriodo calculado={resultado} periodo={duracaoMs} />
      <ComParadas calculado={resultado} />
      <SemAParada calculado={resultado} />
      <BotaoSalvar salvo={salvo} aoSalvar={aoSalvar} />
      {/* A mesma nota do resultado ao vivo: quem salva aqui precisa saber
          que a medicao SOBE para o PC — sem ela, o recibo era a unica
          pista e ja' induziu leitura errada uma vez. */}
      <AvisoSalvar />
      {/* Mesma peca primeiro: depois de salvar, o proximo passo do fluxo
          de referencia e' repetir a medicao — trocar de peca e' o caso
          menos frequente. */}
      <button type="button" style={est.botaoOutraPeca} onClick={aoMaisUmPeriodo}>
        ↻ MAIS UM PERÍODO — MESMA PEÇA
      </button>
      <button type="button" style={est.botaoOutraPeca} onClick={aoOutraPeca}>
        ➜ COMEÇAR OUTRA PEÇA
      </button>
    </section>
  );
}
