
export default function CartoesEstudos({ estudos, est, aoAbrir, aoRemover }) {
  return (
    <ul style={est.lista}>
      {estudos.map((e) => (
        <li key={e.id} style={est.itemLista}>
          <button type="button" style={est.cartao} onClick={() => aoAbrir?.(e.id)}>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={est.cartaoTitulo}>{e.nome}</div>
              <div style={est.cartaoSub}>
                {/* Sem o produto: ele ja' nomeia o grupo logo acima. */}
                {[e.recurso, e.analista_nome || e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
              </div>
            </div>
            <div style={est.cartaoNumeros}>
              <span style={est.cartaoNumero}>{e.total_observacoes}</span>
              <span style={est.cartaoRotulo}>ciclos</span>
            </div>
          </button>
          {/* Fora do cartao: encostado no alvo principal, o dedo removeria por engano.
              "Arquivar", nao "Excluir": no tablet este botao nunca apaga. */}
          <button
            type="button"
            style={est.botaoRemoverCartao}
            onClick={() => aoRemover?.(e)}
            aria-label={`Arquivar ${e.nome}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

