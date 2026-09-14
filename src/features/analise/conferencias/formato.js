/** Pecas por minuto a partir do ritmo em pecas/hora — pedido de 31/08. */
export const porMinuto = (pecasPorHora) => (pecasPorHora / 60).toFixed(1);

/**
 * Tempo de UMA peca, na escala de quem le'.
 *
 * O relatorio deixou de ser so' das furadeiras: em embalagem e montagem a
 * peca leva minutos, e "300.0s" obriga o leitor a dividir de cabeca. Ate'
 * um minuto sai em segundos com uma casa (4.3s); dai' para cima, em
 * minutos e segundos (5min00s). Nao usa formatarDuracao porque ela
 * arredonda para o minuto — 90s viraria "2 min", 33% a mais, e este
 * numero entra em conta de capacidade.
 */
export function porPeca(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;
}
