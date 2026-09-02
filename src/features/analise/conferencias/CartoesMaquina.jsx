import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * Um cartao por maquina: o ritmo em pecas/hora (grande) e pecas/minuto
 * (logo abaixo — a escala em que o posto pensa, pelo contador de pecas),
 * quanto rodou, quanto parou, melhor e pior medicao.
 *
 * O criterio de amostra NAO sumiu do calculo (resumirConferencias segue se
 * autoavaliando) — ele virou uma nota discreta em cinza ("ainda em
 * medicao"), nunca um carimbo na frente do numero.
 */
export default function CartoesMaquina({ resumo, grupoDe }) {
  return (
    <section style={est.resumoGrade} aria-label="Resumo por máquina">
      {resumo.map((g) => (
        <div key={g.maquina} style={est.cartaoMaquina}>
          <div style={est.cartaoTopo}>
            <div style={est.cartaoTitulo}>
              {g.maquina}
              {grupoDe(g.maquina) && <span style={est.cartaoGrupo}>{grupoDe(g.maquina)}</span>}
            </div>
          </div>
          <div style={est.cartaoRitmo}>
            {Math.round(g.ritmoMedio)}
            <span style={est.cartaoRitmoSufixo}>peças por hora</span>
          </div>
          <div style={est.cartaoRitmoMinuto}>{porMinuto(g.ritmoMedio)} peças por minuto</div>
          <div style={est.cartaoLinhas}>
            <span>{g.n} medição(ões) · {g.totalPecas} peças · {formatarDuracao(g.totalProdutivoMs)} rodando</span>
            {/* O percentual ja' vem pronto de resumirConferencias
                (disponibilidadePct) — a tela nao refaz a conta. Sem parada
                marcada seria sempre 100%, e a linha viraria ruido: por isso
                so' aparece com parada. */}
            {g.totalParadaMs > 0 && (
              <span>Máquina rodando: {Math.round(g.disponibilidadePct)}% do período observado</span>
            )}
            {g.totalParadaMs > 0 && (
              <span>
                Parado: {formatarDuracao(g.totalParadaMs)}
                {g.totalSetupMs > 0 && ` (troca/setup ${formatarDuracao(g.totalSetupMs)})`}
              </span>
            )}
            {g.n >= 2 && g.melhor && (
              <span>
                Melhor: {Math.round(g.melhor.ritmo)} pç/h{g.melhor.peca ? ` (${g.melhor.peca})` : ''}
                {' · '}Pior: {Math.round(g.pior.ritmo)} pç/h{g.pior.peca ? ` (${g.pior.peca})` : ''}
              </span>
            )}
          </div>
          {/* Nota em cinza, nunca carimbo: o numero ja' e' o resultado — a
              nota so' lembra que ele ainda assenta. */}
          {!g.confiavel && (
            <div style={est.notaPoucas}>
              Ainda em medição — o número fica mais certeiro com mais medições.
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
