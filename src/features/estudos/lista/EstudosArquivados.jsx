import { useState } from 'react';

/**
 * Estudos arquivados — a volta do caminho que so' tinha ida.
 *
 * Arquivar preserva o dado (ciclo cronometrado nao se refaz), mas o estudo
 * sumia da lista sem nenhum lugar onde reve-lo: quem arquivou por engano
 * ficava sem saida dentro do app. Aqui ele reaparece com a contagem de
 * ciclos intacta e volta para a lista num clique.
 */
export default function EstudosArquivados({ est, arquivados, analise, aoRestaurar, aoExcluirDeVez, aoFechar }) {
  const [restaurando, setRestaurando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);

  async function restaurar(id) {
    setRestaurando(id);
    setErro(null);
    try { await aoRestaurar(id); }
    catch (e) { setErro(e.message); setRestaurando(null); }
  }

  async function excluirDeVez(id) {
    setExcluindo(id);
    setErro(null);
    try { await aoExcluirDeVez(id); setConfirmando(null); }
    catch (e) { setErro(e.message); }
    setExcluindo(null);
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Estudos arquivados">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>Estudos arquivados</h2>
        <p style={est.textoModal}>
          Arquivar tira o estudo da lista, mas <strong>não apaga nada</strong> —
          os ciclos continuam no banco.
          {analise
            ? ' Restaurar devolve o estudo à análise, sem reabri-lo na coleta do tablet. Excluir de vez é para estudo de teste: apaga tudo, sem volta.'
            : ' Restaurar traz o estudo de volta para a coleta.'}
        </p>

        <ul style={est.listaArquivados}>
          {arquivados.map((e) => (
            <li key={e.id} style={est.itemArquivado}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={est.arquivadoNome}>{e.nome}</div>
                <div style={est.arquivadoSub}>
                  {[e.recurso, e.analista_nome || e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
                  {' · '}{e.total_observacoes} ciclo(s)
                </div>
              </div>
              {confirmando === e.id ? (
                <span style={est.confirmarExclusao}>
                  {/* O numero na pergunta e' o custo real do clique. */}
                  <span style={est.confirmarTexto}>
                    Apagar {e.total_observacoes} ciclo(s) para sempre?
                  </span>
                  <button
                    type="button" style={est.botaoExcluirDeVez} disabled={excluindo === e.id}
                    onClick={() => excluirDeVez(e.id)}
                  >
                    {excluindo === e.id ? 'Apagando...' : 'Apagar tudo'}
                  </button>
                  <button type="button" style={est.botaoLinha} onClick={() => setConfirmando(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <span style={est.confirmarExclusao}>
                  <button
                    type="button"
                    style={est.botaoLinha}
                    onClick={() => restaurar(e.id)}
                    disabled={restaurando === e.id}
                  >
                    {restaurando === e.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                  {aoExcluirDeVez && (
                    <button
                      type="button" style={est.botaoLinha}
                      onClick={() => setConfirmando(e.id)}
                      aria-label={`Excluir de vez ${e.nome}`}
                    >
                      Excluir de vez
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={{ ...est.botaoSecundario, flex: 1 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

