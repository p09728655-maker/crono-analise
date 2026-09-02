/**
 * Plural por extenso — "1 ciclo", "8 ciclos".
 *
 * A tabela usa "ciclo(s)" porque a coluna e' estreita e o rotulo se repete
 * em toda linha. Nos cartoes de acao a linha e' de leitura corrida, e ali
 * "8 operação(ões)" trava o olho no meio da frase.
 */
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const formatarData = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

