import { useState } from 'react';

/**
 * Remover estudo — e o que "remover" quer dizer em cada aparelho.
 *
 * No PC: estudo com ciclos arquiva, estudo sem ciclo e' apagado. Rascunho
 * e teste nao merecem virar lixo eterno na lista de arquivados.
 *
 * No TABLET (soArquiva): arquiva sempre, nunca apaga. "Sem ciclo" nao quer
 * dizer "sem trabalho" — o analista monta operacoes, fator de ritmo, meta e
 * roteiro do ERP no PC e manda para o posto ANTES da primeira
 * cronometragem. Um toque no chao de fabrica apagava esse preparo inteiro,
 * e a tela ainda prometia isso por escrito: "apagado definitivamente".
 * A API e a RLS repetem a regra; aqui a tela para de oferecer o que o
 * aparelho nao pode mais fazer.
 */
export default function ConfirmarRemocao({ est, estudo, soArquiva, aoConfirmar, aoCancelar }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const ciclos = Number(estudo.total_observacoes) || 0;
  const temDados = ciclos > 0;
  const arquiva = temDados || soArquiva;

  async function executar() {
    setProcessando(true);
    setErro(null);
    try { await aoConfirmar(); }
    catch (e) { setErro(e.message); setProcessando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Confirmar remoção">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>{arquiva ? 'Arquivar estudo?' : 'Excluir estudo?'}</h2>
        <p style={est.textoModal}><strong>{estudo.nome}</strong></p>
        <p style={est.textoModal}>
          {temDados ? (
            <>
              Este estudo tem <strong>{ciclos} ciclo(s) cronometrado(s)</strong>. Ele sai da
              lista mas <strong>não é apagado</strong> — os dados continuam no banco.
              Tempo de cronometragem não se refaz.
            </>
          ) : soArquiva ? (
            <>
              Ainda não há ciclo coletado, mas o estudo já vem montado do PC —
              operações, fator de ritmo e meta. Ele sai desta lista
              e <strong>não é apagado</strong>: fica em Arquivados, aqui e no PC.
            </>
          ) : (
            <>Nenhum ciclo foi coletado, então não há nada a preservar. O estudo
            será <strong>apagado definitivamente</strong>.</>
          )}
        </p>
        {erro && <div style={est.erroForm}>{erro}</div>}
        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={processando}>
            Cancelar
          </button>
          <button type="button" style={{ ...est.botaoPerigo, flex: 1 }} onClick={executar} disabled={processando}>
            {processando ? 'Removendo...' : (arquiva ? 'Arquivar' : 'Excluir')}
          </button>
        </div>
      </div>
    </div>
  );
}

