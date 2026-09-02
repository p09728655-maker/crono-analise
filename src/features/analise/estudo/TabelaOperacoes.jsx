import { formatarDuracao, formatarSegundos } from '../../../domain/cronoanalise.js';
import { corNivel, est } from './estilos.js';

export default function TabelaOperacoes({ analise, metaObs, aoAdicionar, aoRemover, aoColetar, estudo }) {
  return (
    <section style={est.blocoTabela}>
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Operações</h2>
        {aoAdicionar && (
          <button type="button" style={est.botaoSecundario} onClick={aoAdicionar}>
            + Adicionar operação
          </button>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.th}>Operação</th>
              <th style={est.thNum}>Ciclos</th>
              <th style={est.thNum}>FR</th>
              <th style={est.thNum}>TO (s)</th>
              <th style={est.thNum}>TN (s)</th>
              <th style={est.thNum} title="Quantas vezes a operação roda por peça">Cic/pç</th>
              <th style={est.thNum}>TP ciclo (s)</th>
              <th style={est.thNum}>TP peça (s)</th>
              <th style={est.thNum}>CV%</th>
              <th style={est.thNum}>Cap/h</th>
              <th style={est.thNum} title="Tempo parado registrado nesta operação — não entra no TO">Parado</th>
              <th style={est.th}>Estabilidade</th>
              <th style={est.th} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {analise.operacoes.map((op) => {
              const r = op.resultado;
              const ehGargalo = analise.gargalo?.id === op.id;
              return (
                <tr key={op.id} style={ehGargalo ? est.linhaGargalo : undefined}>
                  <td style={est.td}>
                    {op.nome}
                    {ehGargalo && <span style={est.selo}>GARGALO</span>}
                  </td>
                  <td style={est.tdNum}>
                    {r ? r.n : 0}
                    <span style={est.meta}>/{metaObs}</span>
                  </td>
                  <td style={est.tdNum}>{Number(op.fr_pct)}%</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.toMed) : '—'}</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.tnMed) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.ciclosPorPeca : Number(op.ciclos_por_peca) || 1}</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.tpVal) : '—'}</td>
                  <td style={{ ...est.tdNum, fontWeight: 700 }}>{r ? formatarSegundos(r.tpPorPeca) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.cvPct.toFixed(1) : '—'}</td>
                  <td style={est.tdNum}>
                    {r && r.totalParada > 0 ? (
                      <>
                        {formatarDuracao(r.totalParada)}
                        <span style={est.meta}> ({r.nParadas})</span>
                      </>
                    ) : '—'}
                  </td>
                  <td style={est.td}>
                    {r ? (
                      <span style={est.estabilidade}>
                        <span style={{ ...est.ponto, background: corNivel(r.estabilidade.nivel) }} />
                        {r.estabilidade.rotulo}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...est.td, whiteSpace: 'nowrap' }}>
                    {/* Cronometrar e a acao frequente; Remover e destrutiva.
                        Com o mesmo peso visual, o clique errado fica barato
                        demais — por isso o Remover e' so' um icone discreto,
                        com rotulo acessivel e confirmacao. */}
                    {aoColetar && (
                      <button type="button" style={est.botaoAcaoLinha}
                              onClick={() => aoColetar(estudo, op)}>
                        Cronometrar
                      </button>
                    )}
                    {aoRemover && (
                      <button type="button" style={est.botaoRemoverOp}
                              onClick={() => aoRemover(op)}
                              title={`Remover ${op.nome}`}
                              aria-label={`Remover operação ${op.nome}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

