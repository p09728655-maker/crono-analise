
/**
 * Cabecalho de secao da COLETA.
 *
 * No tablet as duas coletas convivem na mesma tela, e sao coisas
 * diferentes: a furadeira se confere por vazao (peças/hora num periodo), a
 * embalagem se estuda ciclo a ciclo (com FR e tolerancia, virando tempo
 * padrao). Sem isto o analista abria a errada — o atalho da conferencia
 * ficava colado na lista de estudos, como se fosse mais um item dela.
 *
 * O rotulo nomeia o POSTO e o titulo nomeia o METODO, porque no chao de
 * fabrica a pergunta vem sempre na primeira ordem: "vim medir a furadeira".
 */
export function SecaoColeta({ est, rotulo: nome, titulo, texto }) {
  return (
    <div style={est.secaoColeta}>
      <span style={est.secaoRotulo}>{nome}</span>
      <h2 style={est.secaoTitulo}>{titulo}</h2>
      <p style={est.secaoTexto}>{texto}</p>
    </div>
  );
}

/**
 * Filtro por produto.
 *
 * Uma linha de opcoes, nao um menu: com poucos produtos, esconder a lista
 * atras de um clique custa mais que mostra-la. Acima de um limite ela vira
 * rolagem horizontal em vez de crescer para baixo e empurrar o conteudo.
 */
export function FiltroProduto({ grupos, filtro, aoFiltrar, est }) {
  const total = grupos.reduce((acc, g) => acc + g.estudos.length, 0);

  return (
    <div style={est.filtro} role="group" aria-label="Filtrar por produto">
      <button
        type="button"
        onClick={() => aoFiltrar(null)}
        aria-pressed={filtro === null}
        style={{ ...est.filtroItem, ...(filtro === null ? est.filtroAtivo : {}) }}
      >
        {/* "Todos os produtos", nao "Todos": o rotulo precisa se distinguir
            de um produto que por acaso tenha esse nome — e tem, porque quem
            cadastra usa a palavra para dizer "vale para todos os modelos". */}
        Todos os produtos
        <span style={est.filtroContagem}>{total}</span>
      </button>

      {grupos.map((g) => (
        <button
          key={g.chave}
          type="button"
          onClick={() => aoFiltrar(g.chave === filtro ? null : g.chave)}
          aria-pressed={g.chave === filtro}
          style={{ ...est.filtroItem, ...(g.chave === filtro ? est.filtroAtivo : {}) }}
        >
          {g.rotulo}
          <span style={est.filtroContagem}>{g.estudos.length}</span>
        </button>
      ))}
    </div>
  );
}

/** Marca grafica sobria, linear, sem ilustracao decorativa. */
export function Simbolo({ tipo: qual, cor, tamanho = 36 }) {
  const base = { width: tamanho, height: tamanho, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (qual === 'alerta') {
    return (
      <svg {...base}>
        <circle cx="12" cy="12" r="9.25" stroke={cor} strokeWidth="1.5" />
        <path d="M12 7.5v5.5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill={cor} />
      </svg>
    );
  }
  if (qual === 'grafico') {
    return (
      <svg {...base}>
        <path d="M5 19.5v-6M12 19.5V6.5M19 19.5v-9" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M3.5 21.5h17" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (qual === 'pessoas') {
    return (
      <svg {...base}>
        <circle cx="9" cy="8.5" r="3.25" stroke={cor} strokeWidth="1.5" />
        <path d="M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.5 5.7a3.25 3.25 0 1 1 0 5.7M17 14.7c2.1.5 3.5 2.2 3.5 4.8" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...base}>
      <circle cx="12" cy="13.5" r="8" stroke={cor} strokeWidth="1.5" />
      <path d="M12 9.5v4l2.5 1.8" stroke={cor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 3h5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

