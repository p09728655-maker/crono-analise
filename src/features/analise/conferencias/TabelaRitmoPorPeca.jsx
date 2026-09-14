import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { espaco } from '../../../theme/escala.js';
import { est } from './estilos.js';
import { porMinuto, porPeca } from './formato.js';

/**
 * Ritmo POR PECA — o numero que planeja carga e lote. Uma linha por peca x
 * maquina, com a maquina rodando.
 *
 * A coluna ACION. e' a que o redesenho de 31/08 tirou junto com o jargao.
 * Sem ela, duas linhas com ritmos diferentes nao tinham como ser
 * explicadas — e a explicacao estava gravada na medicao o tempo todo.
 *
 * POR PECA e POR ACION. sao o mesmo tempo em duas reguas: o tempo cheio da
 * peca, e ele dividido pelos acionamentos. Em peca de UM acionamento os
 * dois numeros sao identicos — e' por isso que a coluna por acionamento so'
 * aparece quando ha' peca de mais de um. Repetir o mesmo valor sob dois
 * rotulos que o texto acabou de dizer que significam coisas diferentes
 * ensina o leitor errado: e' a mesma razao pela qual a tela do celular
 * esconde "Ciclo motor" quando a peca e' de um ciclo so'.
 *
 * As colunas usam os estilos ESTREITOS: com 11 colunas e o respiro padrao a
 * tabela passa da largura do painel em 1440 e a ultima some atras da
 * rolagem lateral.
 */
export default function TabelaRitmoPorPeca({ resumoPecas }) {
  /**
   * So' ha' o que comparar por acionamento quando alguma peca pede mais de
   * um. Peca de acionamentos MISTOS (gravada ora com 1, ora com 2) nao
   * conta: ali o denominador e' uma media que nao corresponde a nenhuma
   * medicao, e a propria leitura por classe de ciclo exclui a peca.
   */
  const temPorAcion = resumoPecas.some((g) => g.ciclosPorPeca > 1);

  return (
    <section style={est.painel} aria-label="Ritmo por peça">
      {/* O mesmo respiro das celulas: sem ele o titulo encosta na borda do
          cartao e parece cortado (apontado em 28/08). */}
      <div style={{ padding: `${espaco.lg}px ${espaco.lg}px ${espaco.sm}px` }}>
        <h2 style={est.iaTitulo}>Ritmo por peça</h2>
        <p style={est.iaTexto}>
          Quantas peças saem por hora e por minuto, peça a peça, com a máquina rodando.
          <strong> Por peça</strong> é o tempo cheio de uma peça no posto — manuseio e
          furação juntos. A coluna <strong>Acion.</strong> diz quantas vezes o motor é
          acionado para fazer uma peça: peça de mais acionamentos rende menos peças/hora
          sem a máquina estar mais lenta.
          {temPorAcion
            ? <> Por isso <strong>Por acion.</strong> — o tempo por peça dividido pelos
              acionamentos, manuseio incluído — é a régua que compara peças de furação
              diferente.</>
            : <> Aqui toda peça é de um acionamento só: o tempo por acionamento seria o
              mesmo da coluna Por peça, e a tabela não repete o número.</>}
        </p>
      </div>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.thEstreito}>Peça</th>
            <th style={est.thEstreito}>Máquina</th>
            <th style={est.thNumEstreito} title="Acionamentos do motor para fazer uma peça">
              Acion.
            </th>
            <th style={est.thEstreito} title="Passante: a broca atravessa a peça. Só compara com passante.">
              Furação
            </th>
            <th style={est.thNumEstreito}>Medições</th>
            <th style={est.thNumEstreito}>Peças</th>
            <th style={est.thNumEstreito}>Tempo rodando</th>
            <th style={est.thNumEstreito}>Peças/hora</th>
            <th style={est.thNumEstreito}>Peças/min</th>
            {/* O celular chama este mesmo numero de "Ciclo médio (s/pç)". O
                rotulo aqui e' em portugues de fabrica (decisao de 31/08), e
                a dica faz a ponte para quem mediu no aparelho. */}
            <th
              style={est.thNumEstreito}
              title="Tempo cheio de uma peça, com a máquina rodando: manuseio e furação juntos. É o mesmo número que o celular mostra como Ciclo médio (s/pç)."
            >
              Por peça
            </th>
            {temPorAcion && (
              <th
                style={est.thNumEstreito}
                title="O tempo por peça dividido pelos acionamentos do motor — comparável entre peças de furação diferente"
              >
                Por acion.
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {resumoPecas.map((g) => (
            <tr key={`${g.maquina}·${g.peca}`}>
              <td style={est.tdCurtoEstreito}>{g.peca}</td>
              <td style={est.tdCurtoEstreito}>{g.maquina}</td>
              <td
                style={est.tdNumEstreito}
                title={g.ciclosMistos
                  ? `Gravada com ${g.ciclosVistos.join(' e ')} acionamentos — corrija na medição`
                  : undefined}
              >
                {g.ciclosMistos ? `${g.ciclosVistos.join('/')} ⚠` : g.ciclosPorPeca}
              </td>
              <td
                style={est.tdCurtoEstreito}
                title={g.passanteMista
                  ? 'Gravada ora como passante, ora como não passante — corrija na medição'
                  : undefined}
              >
                {g.passanteMista ? 'mista ⚠' : g.furacaoPassante ? 'passante' : '—'}
              </td>
              <td style={est.tdNumEstreito}>{g.n}</td>
              <td style={est.tdNumEstreito}>{g.totalPecas}</td>
              <td style={est.tdNumEstreito}>{formatarDuracao(g.totalProdutivoMs)}</td>
              <td style={est.tdNumForteEstreito}>{Math.round(g.ritmoMedio)}</td>
              <td style={est.tdNumEstreito}>{porMinuto(g.ritmoMedio)}</td>
              <td style={est.tdNumEstreito}>{porPeca(g.cicloMedioMs)}</td>
              {temPorAcion && (
                /* Acionamentos mistos: o tempo por acionamento sairia sobre
                   um denominador que nao e' nenhum dos dois gravados. */
                <td
                  style={est.tdNumEstreito}
                  title={g.ciclosMistos ? 'Acionamentos misturados na medição — sem régua por acionamento' : undefined}
                >
                  {g.ciclosMistos ? '—' : porPeca(g.cicloMotorMs)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
