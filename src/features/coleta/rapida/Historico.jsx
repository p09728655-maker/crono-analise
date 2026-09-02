import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import { dataCurta } from './formato.js';

/**
 * SALVAS NESTE APARELHO — memoria de bolso para comparar depois, com o
 * estado de cada uma no caminho ate' o PC.
 *
 * Sem a marca de envio, o aparelho parecia um caderno particular: o
 * analista nao tinha como saber que o que esta aqui ja' esta' no relatorio
 * do PC — nem que o que ainda nao subiu vai subir sozinho na proxima
 * abertura.
 */
export default function Historico({ historico, naFila, aoRemover }) {
  if (!historico.length) return null;
  const noPc = (c) => c.enviada && !naFila.has(c.id);

  return (
    <section style={est.historico} aria-label="Conferências salvas neste aparelho">
      <div style={est.historicoTitulo}>SALVAS NESTE APARELHO</div>
      <div style={est.historicoDica}>
        {historico.every(noPc)
          ? 'Todas já estão no relatório do PC.'
          : 'As que ainda não subiram vão para o relatório do PC assim que houver rede.'}
      </div>
      {historico.map((c) => (
        <div key={c.id} style={est.itemHistorico}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={est.itemPeca}>
              {[c.maquina, c.peca].filter(Boolean).join(' · ') || 'Sem identificação'}
            </div>
            <div style={est.itemDetalhe}>
              {[
                c.horaInicial && c.horaFinal ? `${c.horaInicial}–${c.horaFinal}` : null,
                formatarDuracao(c.duracaoMs),
                `${c.pecas} pç`,
                c.ciclosPorPeca > 1 ? `${c.ciclosPorPeca} ciclos/pç` : null,
                c.paradaMs > 0 ? `${formatarDuracao(c.paradaMs)} parada` : null,
                dataCurta(c.salvoEm),
                noPc(c) ? 'no PC' : 'aguardando envio',
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={est.itemRitmo}>
            {/* O mesmo numero da manchete do resultado: producao do
                periodo. Registro antigo, sem o bruto, mostra o que tem. */}
            {Math.round(c.pecasPorHoraBruto ?? c.pecasPorHora)}
            <span style={est.itemRitmoSufixo}>pç/h</span>
          </div>
          <button
            type="button"
            style={est.itemRemover}
            onClick={() => aoRemover(c.id)}
            aria-label={`Remover conferência ${c.peca || 'sem nome'}`}
          >
            ×
          </button>
        </div>
      ))}
    </section>
  );
}
