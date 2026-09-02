import { faixaHoraria } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * As duas janelas de confirmacao do relatorio. As duas mostram o `erro`
 * DENTRO da janela, ao lado do botao que falhou: e' a unica forma de a
 * recusa do servidor ser lida por quem acabou de clicar.
 */

/**
 * Arquivar (ou restaurar) uma maquina inteira mexe em varias linhas de uma
 * vez: a janela diz QUANTAS, e diz que nada e' apagado — a confusao entre
 * arquivar e excluir e' a que custa dado.
 */
export function ConfirmarLote({ lote, erro, ocupado, aoCancelar, aoConfirmar }) {
  return (
    <div style={est.modal} role="dialog" aria-label="Arquivar máquina">
      <div style={est.caixaModal}>
        <h2 style={est.tituloModal}>
          {lote.arquivada
            ? `Arquivar as medições da ${lote.maquina}?`
            : `Restaurar as medições da ${lote.maquina}?`}
        </h2>
        <p style={est.textoModal}>
          {lote.arquivada
            ? <>
                <strong>{lote.ids.length} medição(ões)</strong> saem dos cálculos
                e da folha impressa. <strong>Nada é apagado</strong>: elas continuam no banco,
                em Arquivadas, e voltam com um clique.
              </>
            : <>
                <strong>{lote.ids.length} medição(ões)</strong> voltam para o
                relatório e para os cálculos de ritmo desta máquina.
              </>}
        </p>
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoLinha} onClick={aoCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="button" style={est.botaoImprimir} onClick={aoConfirmar} disabled={ocupado}>
            {ocupado
              ? 'Gravando...'
              : (lote.arquivada ? `Arquivar ${lote.ids.length}` : `Restaurar ${lote.ids.length}`)}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Excluir e' definitivo — a janela diz isso e aponta o Arquivar como o
 * caminho para a medicao real mas atipica. E' a mesma distincao do estudo,
 * pelo mesmo motivo.
 */
export function ConfirmarExclusao({ conferencia, erro, ocupado, aoCancelar, aoConfirmar }) {
  return (
    <div style={est.modal} role="dialog" aria-label="Excluir medição">
      <div style={est.caixaModal}>
        <h2 style={est.tituloModal}>Excluir medição?</h2>
        <p style={est.textoModal}>
          <strong>{[conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
          {faixaHoraria(conferencia) ? ` · ${faixaHoraria(conferencia)}` : ''}
          {' · '}{conferencia.pecas} pç
        </p>
        <p style={est.textoModal}>
          A exclusão é <strong>definitiva</strong>. Se a medição é real mas atípica
          (setup no meio do período, por exemplo), prefira <strong>Arquivar</strong>:
          ela sai dos cálculos e continua guardada.
        </p>
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...est.botaoPerigo, flex: 1 }}
            onClick={aoConfirmar}
            disabled={ocupado}
          >
            {ocupado ? 'Excluindo...' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
