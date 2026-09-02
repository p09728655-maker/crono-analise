/**
 * RASCUNHO — a medicao em andamento sobrevive ao aparelho.
 *
 * O fluxo desta tela e' "marca 7:00, segue o caminho da fabrica, volta as
 * 7:10". Nesses dez minutos o celular apaga, o sistema recolhe a memoria e
 * a aba morre — e o analista voltava para um formulario EM BRANCO, com a
 * hora inicial perdida. O periodo nao se refaz: ou se lembra da hora, ou
 * se mede tudo de novo.
 *
 * Grava no IndexedDB (a mesma base da fila, que ja' aguenta o aparelho
 * morrer) a cada mudanca. Falha de escrita nao interrompe a medicao: sem
 * rascunho a tela e' a de sempre. Uma medicao em andamento por aparelho:
 * a tela mede um posto por vez.
 *
 * `aoRestaurar` recebe o rascunho lido; cada campo so' deve ser restaurado
 * se ainda estiver vazio — a leitura e' assincrona, e nada do rascunho pode
 * passar por cima do que o analista ja' comecou a digitar enquanto ela vinha.
 */
import { useCallback, useEffect, useRef } from 'react';
import { lerRascunho, limparRascunho, salvarRascunho } from '../../../lib/filaOffline.js';

const CHAVE_RASCUNHO = 'conferencia-em-andamento';

export function useRascunho({ campos, aoRestaurar }) {
  const lido = useRef(false);
  const restaurar = useRef(aoRestaurar);
  restaurar.current = aoRestaurar;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await lerRascunho(CHAVE_RASCUNHO);
        if (!vivo || !r) return;
        restaurar.current(r);
      } catch { /* sem rascunho neste navegador: a tela e' a de sempre */ }
      finally { lido.current = true; }
    })();
    return () => { vivo = false; };
  }, []);

  const { maquina, peca, ciclosPorPeca, horaInicial, horaFinal, pecasPeriodo, paradas } = campos;
  useEffect(() => {
    // So' depois de tentar ler: senao o estado vazio da montagem apagaria o
    // rascunho antes de ele chegar na tela.
    if (!lido.current) return;
    const vazio = !maquina && !peca && !horaInicial && !horaFinal && !pecasPeriodo && !paradas.length;
    const guardar = vazio
      ? limparRascunho(CHAVE_RASCUNHO)
      : salvarRascunho(CHAVE_RASCUNHO, {
        maquina, peca, ciclosPorPeca, horaInicial, horaFinal, pecasPeriodo, paradas,
      });
    guardar?.catch?.(() => {});
  }, [maquina, peca, ciclosPorPeca, horaInicial, horaFinal, pecasPeriodo, paradas]);

  /** A medicao ja' esta' guardada e na fila: o rascunho cumpriu o papel dele
      e sai de cena, para nao ressuscitar na proxima abertura da tela. */
  const limpar = useCallback(() => limparRascunho(CHAVE_RASCUNHO)?.catch?.(() => {}), []);

  return { limpar };
}
