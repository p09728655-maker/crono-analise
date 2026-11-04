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
export default function Historico({
  historico, naFila, aoRemover,
  // Na Embalagem Takt Time a contagem e' de VOLUMES. O PC de destino tambem
  // muda: la' a medicao aparece na tela da embalagem.
  abrev = 'pç', jaEsta = 'no relatório do PC', vaiPara = 'para o relatório do PC',
  // Embalagem Takt Time (v2.100.0): tocar na linha abre o resultado dela
  // no aparelho. Sem `aoAbrir`, a linha e' so' leitura, como sempre foi.
  aoAbrir = null,
  // Com uma maquina so' (a embalagem de hoje), o nome dela repetido em
  // toda linha so' empurrava o produto para fora.
  mostrarMaquina = true,
  // A coluna de volumes/hora com largura fixa, alinhada a' direita (ver
  // itemRitmoColuna). So' quem pede: no celular ela tira espaco do nome.
  colunaFixa = false,
}) {
  if (!historico.length) return null;
  const noPc = (c) => c.enviada && !naFila.has(c.id);
  const nome = (c) => (mostrarMaquina
    ? [c.maquina, c.peca].filter(Boolean).join(' · ')
    : c.peca || c.maquina) || 'Sem identificação';

  return (
    <section style={est.historico} aria-label="Conferências salvas neste aparelho">
      <div style={est.historicoTitulo}>SALVAS NESTE APARELHO</div>
      <div style={est.historicoDica}>
        {historico.every(noPc)
          ? `Todas já estão ${jaEsta}.`
          : `As que ainda não subiram vão ${vaiPara} assim que houver rede.`}
        {aoAbrir ? ' Toque numa medição para ver o resultado aqui.' : ''}
      </div>
      {historico.map((c) => (
        <div key={c.id} style={est.itemHistorico}>
          <Abrir aoAbrir={aoAbrir} id={c.id} rotulo={`Ver o resultado: ${nome(c)}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={est.itemPeca}>{nome(c)}</div>
              <div style={est.itemDetalhe}>
                {[
                  c.horaInicial && c.horaFinal ? `${c.horaInicial}–${c.horaFinal}` : null,
                  formatarDuracao(c.duracaoMs),
                  `${c.pecas} ${abrev}`,
                  c.ciclosPorPeca > 1 ? `${c.ciclosPorPeca} ciclos/pç` : null,
                  c.furacaoPassante ? 'passante' : null,
                  c.paradaMs > 0 ? `${formatarDuracao(c.paradaMs)} parada` : null,
                  dataCurta(c.salvoEm),
                  noPc(c) ? 'no PC' : 'aguardando envio',
                ].filter(Boolean).join(' · ')}
              </div>
              {c.observacao && (
                <div style={est.itemObservacao}>Obs.: {c.observacao}</div>
              )}
            </div>
            <div style={colunaFixa ? { ...est.itemRitmo, ...est.itemRitmoColuna } : est.itemRitmo}>
              {/* O mesmo numero da manchete do resultado: producao do
                  periodo. Registro antigo, sem o bruto, mostra o que tem. */}
              {Math.round(c.pecasPorHoraBruto ?? c.pecasPorHora)}
              <span style={est.itemRitmoSufixo}>{abrev}/h</span>
              {/* O mesmo tempo do numero de cima: o periodo inteiro. Com parada
                  marcada o rotulo diz isso, como o resultado ja' faz — senao o
                  analista compara com o "rodando" do PC e acha que um errou. */}
              <div style={est.itemRitmoMinuto}>
                {((c.pecasPorHoraBruto ?? c.pecasPorHora) / 60).toFixed(1)} {abrev}/min
                {c.paradaMs > 0 ? ' período' : ''}
              </div>
            </div>
          </Abrir>
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

/**
 * A linha como BOTAO quando ha' para onde abrir; sem isso, os mesmos
 * blocos lado a lado, como antes (o Ritmo da maquina nao abre resultado).
 */
function Abrir({
  aoAbrir, id, rotulo, children,
}) {
  if (!aoAbrir) return children;
  return (
    <button type="button" style={est.itemAbrir} onClick={() => aoAbrir(id)} aria-label={rotulo}>
      {children}
      <span style={est.itemSeta} aria-hidden="true">›</span>
    </button>
  );
}
