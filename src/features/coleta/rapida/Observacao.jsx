import { est } from './estilos.js';

/**
 * OBSERVACAO DA MEDICAO — o que o contador nao registra.
 *
 * "150 pecas em 14 minutos" nao diz que o operador era novo, que a broca
 * estava no fim da vida ou que o abastecimento veio aos trancos. Sem isso
 * escrito NA HORA, a medicao fora da faixa vira misterio no relatorio do PC
 * semanas depois — e quem mediu ja' nao lembra. E' o mesmo campo que a tela
 * de cronometrar ganhou (v2.68), agora na tela que se usa todo dia.
 *
 * Opcional e livre: nao entra em conta nenhuma. Sobe junto com a medicao
 * pela fila offline e sai na tabela de medicoes do PC e na folha impressa.
 *
 * Um textarea, nao um input: a nota tem mais de uma linha. Enter aqui e'
 * quebra de linha — nao ha' formulario a enviar. Espaco tambem e' texto:
 * useCronometroAoVivo ignora a barra de espaco vinda de um campo.
 *
 * DEPOIS DE SALVAR o campo TRAVA, e isso e' deliberado. A observacao faz
 * parte da medicao; deixa-la editavel reabriria o botao de salvar, e o
 * segundo toque gravaria uma SEGUNDA medicao do mesmo periodo — o
 * relatorio do PC passaria a contar o dobro de pecas e de tempo rodando, e
 * o criterio de amostra da maquina fecharia com medicao que nao existiu.
 * Travado, o campo nao mente: mostra o texto que foi salvo e diz que a
 * proxima nota e' da proxima medicao.
 */
export default function Observacao({ valor, aoTrocar, jaSalva }) {
  return (
    <label style={est.campoHora}>
      <span style={est.rotuloCampo}>OBSERVAÇÃO (OPCIONAL)</span>
      <textarea
        value={valor}
        onChange={(ev) => aoTrocar(ev.target.value)}
        style={{ ...est.inputObservacao, ...(jaSalva ? est.inputObservacaoTravada : {}) }}
        placeholder={jaSalva ? undefined : "O que o contador não registra: operador, broca, abastecimento, peça..."}
        aria-label="Observação da medição"
        maxLength={2000}
        rows={2}
        readOnly={jaSalva}
      />
      {jaSalva
        ? (
          <span style={est.dicaObservacao}>
            {valor.trim()
              ? 'Medição salva com esta observação. A próxima nota é da próxima medição.'
              : 'Medição salva. A observação precisa ser escrita antes de salvar.'}
          </span>
        )
        : <span style={est.dicaObservacao}>Sai no relatório Ritmo por máquina, junto desta medição.</span>}
    </label>
  );
}
