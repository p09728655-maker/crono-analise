import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * O COMPARATIVO, em destaque: o que saiu x o que teria saido no MESMO
 * periodo, sem a parada.
 *
 * O relatorio ja' dizia o tempo parado e o ritmo, mas quem le' tinha de
 * fazer a conta de cabeca para saber o que aquilo custou em PECA. Aqui os
 * dois numeros ficam lado a lado e a diferenca fica em destaque, porque e'
 * ela que muda a conversa na reuniao.
 *
 * So' aparece com parada marcada (comparativoDeParadas devolve null sem
 * parada): sem parada, o que saiu ja' E' o potencial, e o quadro viraria
 * enfeite. Quem decide isso e' quem chama.
 */
export default function ComparativoParadas({ comparativo, resumo, filtro }) {
  return (
    <section style={est.comparativo} aria-label="Comparativo com e sem parada">
      <div style={est.comparativoTopo}>
        <h2 style={est.comparativoTitulo}>
          O que a parada custou{filtro ? ` — ${filtro}` : ''}
        </h2>
        {/* O MESMO criterio do cartao da maquina. Sem esta nota, uma
            medicao de 6 min afirmava "deixou de sair 21 peças" ao lado de
            um cartao dizendo "ainda em medição" — sobre o mesmo dado. Nota
            discreta, nunca carimbo: o numero continua valendo, so' avisa
            que ainda assenta. */}
        {resumo.some((g) => !g.confiavel) && (
          <p style={est.comparativoNota}>
            Ainda em medição: com mais medições este número muda.
          </p>
        )}
        <p style={est.comparativoDica}>
          Mesmo período observado ({formatarDuracao(comparativo.duracaoMs)}). A conta é
          feita <strong>máquina por máquina</strong> e somada: cada uma no ritmo que ela
          própria já provou com ela rodando. Não é meta nem capacidade de catálogo — é o
          que {comparativo.maquinas > 1 ? 'esses postos fariam' : 'esse posto faria'} sem
          a parada no meio.
        </p>
      </div>

      <div style={est.comparativoGrade}>
        <div style={est.comparativoCaixa}>
          <div style={est.comparativoRotulo}>Saiu no período</div>
          <div style={est.comparativoValor}>
            {comparativo.pecas}
            <span style={est.comparativoUnidade}>peças</span>
          </div>
          <div style={est.comparativoSub}>
            {Math.round(comparativo.ritmoPeriodo)} pç/h · {porMinuto(comparativo.ritmoPeriodo)} pç/min
          </div>
          <div style={est.comparativoSub}>
            com {formatarDuracao(comparativo.paradaMs)} de máquina parada dentro do período
          </div>
        </div>

        <div style={est.comparativoCaixa}>
          <div style={est.comparativoRotulo}>Teria saído no mesmo tempo</div>
          <div style={est.comparativoValor}>
            {comparativo.potencial}
            <span style={est.comparativoUnidade}>peças</span>
          </div>
          <div style={est.comparativoSub}>
            {Math.round(comparativo.ritmoPotencial)} pç/h · {porMinuto(comparativo.ritmoPotencial)} pç/min
          </div>
          <div style={est.comparativoSub}>
            o ritmo de cada máquina rodando ({formatarDuracao(comparativo.produtivoMs)} no
            total), aplicado ao período dela
          </div>
        </div>

        <div style={est.comparativoCaixaDestaque}>
          <div style={est.comparativoRotuloDestaque}>Deixou de sair</div>
          <div style={est.comparativoValorDestaque}>
            {comparativo.perdidas}
            <span style={est.comparativoUnidade}>peças</span>
          </div>
          <div style={est.comparativoSubDestaque}>
            {Math.round(comparativo.ganhoPct)}% a mais de produção no mesmo tempo
          </div>
          <div style={est.comparativoSubDestaque}>
            é o que os {formatarDuracao(comparativo.paradaMs)} parados custaram
          </div>
        </div>
      </div>
    </section>
  );
}
