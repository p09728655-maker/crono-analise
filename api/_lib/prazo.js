/**
 * Prazo da funcao serverless.
 *
 * A Vercel corta a funcao no `maxDuration` do vercel.json. Quando isso
 * acontece, quem responde e' ela — com uma pagina de erro em TEXTO, nao em
 * JSON. O navegador entao mostrava "O servidor demorou demais para
 * responder" sem dizer o que fazer, e a analise parecia simplesmente
 * quebrada.
 *
 * Aqui o corte e' NOSSO: abortamos a chamada com folga e devolvemos JSON
 * com uma saida pratica. A folga cobre o que ainda acontece depois do
 * aborto — montar a resposta, serializar, enviar.
 */

/** Precisa bater com `functions["api/**\/*.js"].maxDuration` no vercel.json. */
export const TETO_FUNCAO_MS = 60_000;

/** Sobra para responder depois de abortar. */
export const FOLGA_MS = 8_000;

export const PRAZO_MS = TETO_FUNCAO_MS - FOLGA_MS;

/**
 * Devolve um sinal que aborta ao fim do prazo.
 *
 * `encerrar()` e' obrigatorio no finally: sem ele o temporizador segura a
 * instancia viva depois da resposta ja' ter saido.
 */
export function comPrazo(prazoMs = PRAZO_MS) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), prazoMs);
  // Nao segura o processo vivo so' por causa deste temporizador.
  timer.unref?.();
  return {
    sinal: controle.signal,
    encerrar: () => clearTimeout(timer),
  };
}
