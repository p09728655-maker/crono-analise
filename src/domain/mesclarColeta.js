/**
 * Mescla a fila local (IndexedDB) no estudo vindo do servidor.
 *
 * O ciclo recem-cronometrado grava primeiro no aparelho e so' depois
 * chega ao servidor. Sem esta mescla, a tela do estudo mostrava a
 * contagem VELHA ao sair do cronometro — o selo so' ficava verde
 * entrando e saindo de novo, depois que a sincronizacao corria.
 *
 * A verdade local vale na tela: n, TP e selo contam o que o aparelho
 * ja' coletou, sincronizado ou nao. O clientId deduplica contra o que
 * o servidor por acaso ja' recebeu (a sincronizacao pode correr no
 * meio do carregamento).
 */
export function mesclarColetaLocal(dados, fila) {
  if (!dados?.operacoes?.length || !fila?.length) return dados;

  const porOperacao = new Map();
  for (const item of fila) {
    if (item.tipo !== 'observacao') continue;
    if (!porOperacao.has(item.operacaoId)) porOperacao.set(item.operacaoId, []);
    porOperacao.get(item.operacaoId).push(item);
  }
  if (!porOperacao.size) return dados;

  return {
    ...dados,
    operacoes: dados.operacoes.map((op) => {
      const pendentes = porOperacao.get(op.id) || [];
      const jaNoServidor = new Set((op.observacoes || []).map((o) => o.client_id));
      const novos = pendentes.filter((p) => !jaNoServidor.has(p.clientId));
      if (!novos.length) return op;
      return {
        ...op,
        // A fila e' o fim da linha do tempo: sao os ciclos mais novos.
        tempos: [...(op.tempos || []), ...novos.map((n) => Number(n.duracaoMs))],
        pendentesLocais: novos.length,
      };
    }),
  };
}
