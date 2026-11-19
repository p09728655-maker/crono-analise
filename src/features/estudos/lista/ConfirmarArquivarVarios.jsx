import { useState } from 'react';

/** Quantos nomes a janela lista antes do "e mais N". */
const MAX_NOMES = 8;

/**
 * ARQUIVAR VARIOS ESTUDOS DE UMA VEZ (v2.118.0, PPCP 19/11/2026: "ter opcao
 * para arquivar mais de um estudo de uma vez").
 *
 * So' ARQUIVA — nunca apaga. O "×" de cada linha apaga o estudo sem ciclo
 * (rascunho, teste); em lote isso seria apagar varios preparos de uma vez
 * sem ver um por um. Aqui vai `status: 'arquivado'` para todos: com ou sem
 * ciclo, sai da lista, continua no banco e volta em Arquivados.
 *
 * Diz quantos estao no TABLET (coletando): arquivar tira o estudo da coleta
 * do posto, e quem estiver medindo nele deixa de ver.
 *
 * `aoConfirmar` arquiva um por um e devolve { feitos, total, erro, emQual }: uma
 * recusa no meio para ali, e a janela diz quantos ja' foram e em qual parou
 * — os arquivados saem da lista, os outros continuam marcados.
 */
export default function ConfirmarArquivarVarios({
  est, estudos, aoConfirmar, aoCancelar, aoConcluir,
}) {
  const [processando, setProcessando] = useState(false);
  const [falha, setFalha] = useState(null);
  const n = estudos.length;
  const noTablet = estudos.filter((e) => e.status === 'coletando').length;
  const ciclos = estudos.reduce((s, e) => s + (Number(e.total_observacoes) || 0), 0);

  async function executar() {
    setProcessando(true);
    setFalha(null);
    const r = await aoConfirmar();
    if (r.erro) {
      setFalha(r);
      setProcessando(false);
      return;
    }
    aoConcluir();
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Arquivar estudos marcados">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>{n === 1 ? 'Arquivar o estudo marcado?' : `Arquivar os ${n} estudos marcados?`}</h2>
        <ul style={est.listaModal}>
          {estudos.slice(0, MAX_NOMES).map((e) => <li key={e.id}>{e.nome}</li>)}
          {n > MAX_NOMES && <li>e mais {n - MAX_NOMES}</li>}
        </ul>
        <p style={est.textoModal}>
          Saem da lista, mas <strong>nada é apagado</strong>
          {ciclos > 0 ? <> — os {ciclos} ciclo(s) cronometrado(s) continuam no banco</> : null}.
          Voltam com um clique em Arquivados.
          {noTablet > 0 && (
            <>
              {' '}<strong>{noTablet === 1 ? '1 deles está no tablet' : `${noTablet} deles estão no tablet`}</strong>
              {' '}(coletando): sai da coleta do posto também.
            </>
          )}
        </p>
        {falha && (
          <div style={est.erroForm} role="alert">
            {falha.feitos > 0
              ? `Arquivou ${falha.feitos} de ${falha.total}, e parou em “${falha.emQual}”: ${falha.erro}. Os que faltam continuam marcados.`
              : `Não arquivou “${falha.emQual}”: ${falha.erro}. Nada foi arquivado.`}
          </div>
        )}
        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={processando}>
            {falha ? 'Fechar' : 'Cancelar'}
          </button>
          <button type="button" style={{ ...est.botaoPerigo, flex: 1 }} onClick={executar} disabled={processando}>
            {processando ? 'Arquivando...' : (falha ? 'Tentar os que faltam' : `Arquivar ${n === 1 ? 'o estudo' : `os ${n}`}`)}
          </button>
        </div>
      </div>
    </div>
  );
}
