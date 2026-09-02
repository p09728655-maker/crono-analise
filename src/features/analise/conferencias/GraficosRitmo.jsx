import { GraficoRitmoMaquinas } from '../graficos.jsx';
import { est } from './estilos.js';

/**
 * Os dois graficos do relatorio e as notas que explicam quando um deles
 * nao aparece.
 *
 * RITMO POR MAQUINA: uma barra por maquina (a media ponderada). Com a
 * lateral filtrada numa maquina, abre POR MEDICAO — uma barra por
 * medicao, com a peca embaixo; e' assim que se enxerga qual peca puxa o
 * ritmo para cima ou para baixo. A hachura marca medicao curta.
 *
 * A CURVA DO DIA: a media do periodo esconde a hora fraca — o posto que
 * faz 700 pc/h de manha e 500 depois do almoco aparece como 620 o dia
 * inteiro, e ninguem vai olhar o que muda as 13h. So' com UMA maquina em
 * vista (ver useLeitura), e so' com DUAS horas medidas: uma barra sozinha
 * nao compara com nada. Nos dois casos em que a curva nao aparece, a tela
 * diz por que e o que fazer, em vez de sumir em silencio.
 */
export default function GraficosRitmo({ resumo, filtro, barrasDoFiltro, curvaDoDia }) {
  return (
    <>
      {resumo.length > 0 && (
        <section style={est.painelGrafico} aria-label="Ritmo por máquina">
          {filtro && barrasDoFiltro?.length ? (
            <GraficoRitmoMaquinas
              maquinas={barrasDoFiltro}
              titulo={`Medições — ${filtro}`}
              subtitulo="Peças/hora de cada medição, da mais antiga para a mais recente"
              rotuloOk="Medição"
              rotuloFraco="Medição curta (menos de 5 min rodando)"
              notaFraca="medição curta"
            />
          ) : (
            <GraficoRitmoMaquinas
              maquinas={resumo}
              subtitulo="Peças por hora de cada máquina, com a máquina rodando"
              rotuloOk="Ritmo medido"
              rotuloFraco="Ainda em medição"
              notaFraca="ainda em medição"
            />
          )}
        </section>
      )}

      {resumo.length > 1 && (
        <p style={est.dicaCurva}>
          Para ver o <strong>ritmo por hora do dia</strong> — onde aparece a queda de fim de
          turno —, escolha uma máquina em MÁQUINAS, ao lado. Com postos diferentes juntos, a
          hora fraca seria só a hora em que a máquina mais lenta foi medida.
        </p>
      )}

      {/* Uma maquina, uma hora medida: nao ha' curva, e quem filtrou
          precisa saber que ela existe e o que destrava. */}
      {resumo.length === 1 && curvaDoDia.length === 1 && (
        <p style={est.dicaCurva}>
          Ainda não dá para montar o <strong>ritmo por hora do dia</strong>: há medições em
          uma hora só ({curvaDoDia[0].rotulo}). Meça esta máquina em outro horário — a curva
          compara hora contra hora do mesmo posto e é onde aparece a queda de fim de turno.
        </p>
      )}

      {curvaDoDia.length >= 2 && (
        <section style={est.painelGrafico} aria-label="Ritmo por hora do dia">
          <GraficoRitmoMaquinas
            maquinas={curvaDoDia.map((h) => ({
              ...h,
              nota: h.n > 1 ? `${h.n} medições` : '1 medição',
            }))}
            titulo={`Ritmo por hora do dia${filtro ? ` — ${filtro}` : ''}`}
            subtitulo="Peças por hora com a máquina rodando, em cada hora do relógio — as medições da mesma hora somam, mesmo de datas diferentes"
            rotuloOk="Hora medida"
            rotuloFraco="Menos de 5 min medidos nessa hora"
            notaFraca="pouco tempo medido"
          />
        </section>
      )}
    </>
  );
}
