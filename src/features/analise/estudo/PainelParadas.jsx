import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * PARADAS DO ESTUDO — a perda que a coleta ja' media e ninguem via.
 *
 * A tela de coleta registra a parada com motivo e desconta do ciclo, para o
 * tempo parado nao inflar o TO. Sem esta aba o dado morria no banco: o
 * analista parava o cronometro, escolhia "Falta de material", e nunca mais
 * reencontrava aquilo — a perda ficava sem dono e sem acao.
 *
 * A leitura e' de Pareto: motivo, quanto custou, quanto representa do
 * parado, e A ACAO que ele pede. Motivo sem acao nao vira melhoria; e' por
 * isso que a acao vem na mesma linha, e nao num anexo.
 *
 * O percentual e' sobre o tempo com o CRONOMETRO NA MAO (ciclos + paradas),
 * nunca sobre o turno: o estudo nao observou o turno, e usar essa base
 * daria um numero que parece OEE sem ser.
 */
export default function PainelParadas({ resumo, capacidadeLinha = 0, gargalo = null, operacoes = [] }) {
  if (!resumo.n) {
    return (
      <section style={est.blocoTabela}>
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Paradas</h2>
        </div>
        <p style={est.vazioParadas}>
          Nenhuma parada registrada neste estudo. Durante a coleta, no celular,
          o botão <strong>Parada</strong> pergunta o motivo e cronometra o tempo
          parado — ele sai do ciclo (não infla o tempo observado) e aparece aqui,
          por motivo, com a ação que cada um pede. Nas furadeiras, onde não se
          cronometra ciclo a ciclo, as paradas ficam em
          <strong> Furadeiras → Ritmo por máquina</strong>.
        </p>
      </section>
    );
  }

  const maior = resumo.porMotivo[0]?.ms || 1;

  /**
   * O CUSTO DA PARADA EM PECAS — so' o do GARGALO.
   *
   * Minuto parado nao move reuniao; peca que deixou de sair, sim. Mas a
   * conta so' fecha para o posto que MANDA no ritmo da linha: parada em
   * operacao folgada e' absorvida pela folga dela e nao tira peca nenhuma
   * do fim da linha.
   *
   * Somar as paradas de todas as operacoes e multiplicar pela capacidade da
   * linha — como estava ate' a auditoria de 31/08 — errava duas vezes: dava
   * a folgada o ritmo do gargalo e somava tempos observados em MOMENTOS
   * diferentes (o analista cronometra um posto por vez). Num estudo de
   * exemplo, 55 pecas contra as 9 reais.
   *
   * O custo de cada operacao continua visivel na tabela abaixo, cada uma na
   * capacidade dela — e' o dado de quem vai tratar aquele posto.
   */
  const paradaDoGargalo = gargalo
    ? (resumo.porOperacao.find((o) => o.id === gargalo.id)?.ms || 0)
    : 0;
  const perdidas = capacidadeLinha > 0 && paradaDoGargalo > 0
    ? Math.round((capacidadeLinha * paradaDoGargalo) / 3600000)
    : 0;

  /* Capacidade de cada operacao, para o custo linha a linha da tabela. */
  const capPorOperacao = new Map(
    (operacoes || []).map((o) => [o.id, o.resultado?.cap || 0]),
  );

  return (
    <section style={est.blocoTabela}>
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Paradas registradas na coleta</h2>
        <span style={est.paradasResumo}>
          {formatarDuracao(resumo.totalMs)} em {resumo.n} parada(s) ·{' '}
          {resumo.pctDoObservado.toFixed(1)}% do tempo observado
        </span>
      </div>

      {perdidas > 0 && (
        <p style={est.custoParada} aria-label="Custo da parada em peças">
          <strong>{perdidas} peças deixaram de sair da linha</strong> nos
          {' '}{formatarDuracao(paradaDoGargalo)} em que <strong>{gargalo.nome}</strong> ficou parada
          — é o posto que manda no ritmo ({capacidadeLinha} pç/h ·
          {' '}{(capacidadeLinha / 60).toFixed(1)} pç/min). Parada nas outras operações é absorvida
          pela folga delas: o custo de cada uma está na tabela abaixo.
        </p>
      )}

      <div style={est.listaMotivos}>
        {resumo.porMotivo.map((m) => (
          <div key={m.motivo} style={est.linhaMotivo}>
            <div style={est.motivoTopo}>
              <span style={est.motivoNome}>{m.rotulo}</span>
              <span style={est.motivoNumero}>
                {formatarDuracao(m.ms)}
                <span style={est.meta}> · {m.n}× · {m.pct.toFixed(0)}%</span>
              </span>
            </div>
            {/* Barra so' para ordenar a leitura: o numero ja' esta escrito ao
                lado, entao ela nunca e' a unica portadora da informacao. */}
            <div style={est.barraTrilho}>
              <div style={{ ...est.barraValor, width: `${Math.max(2, (m.ms / maior) * 100)}%` }} />
            </div>
            <span style={est.motivoAcao}>{m.acao}</span>
          </div>
        ))}
      </div>

      {resumo.porOperacao.length > 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={est.tabela}>
            <thead>
              <tr>
                <th style={est.th}>Operação</th>
                <th style={est.thNum}>Paradas</th>
                <th style={est.thNum}>Tempo parado</th>
                <th style={est.thNum}>Peças do posto</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porOperacao.map((o) => (
                <tr key={o.id}>
                  <td style={est.td}>{o.nome}</td>
                  <td style={est.tdNum}>{o.n}</td>
                  <td style={est.tdNum}>{formatarDuracao(o.ms)}</td>
                  {/* Cada operacao na capacidade DELA: e' quanto aquele posto
                      deixou de processar, nao quanto a linha deixou de
                      entregar (so' o gargalo tira peca do fim da linha). */}
                  <td style={est.tdNum}>
                    {capPorOperacao.get(o.id)
                      ? Math.round((capPorOperacao.get(o.id) * o.ms) / 3600000)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={est.notaParadas}>
        O tempo parado <strong>não entra</strong> no tempo observado: ele é
        descontado do ciclo na hora da coleta, para não virar lentidão da
        operação. Ele é perda a tratar — por isso aparece separado, com a ação
        de cada motivo.
      </p>
    </section>
  );
}

