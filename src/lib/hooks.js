import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mantem a tela acesa durante a coleta.
 *
 * Sem isto o tablet apaga sozinho no meio do estudo e o analista perde o
 * ciclo em andamento — problema real de chao de fabrica, porque as maos
 * dele estao ocupadas e o ciclo nao espera.
 *
 * A API nao existe em todos os navegadores; a falta dela nunca quebra a
 * coleta, apenas devolve suportado=false para a UI avisar.
 */
export function useWakeLock(ativo) {
  const sentinelaRef = useRef(null);
  const [suportado] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);

  useEffect(() => {
    if (!ativo || !suportado) return undefined;
    let cancelado = false;

    const adquirir = async () => {
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelado) { s.release().catch(() => {}); return; }
        sentinelaRef.current = s;
      } catch {
        // Negado (bateria baixa, aba em background). Segue sem travar a coleta.
      }
    };

    adquirir();

    // O bloqueio cai sozinho quando a aba perde o foco; ao voltar, refaz.
    const aoVoltar = () => { if (document.visibilityState === 'visible') adquirir(); };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoVoltar);
      sentinelaRef.current?.release().catch(() => {});
      sentinelaRef.current = null;
    };
  }, [ativo, suportado]);

  return suportado;
}

/**
 * Cronometro de alta precisao.
 *
 * Baseado em performance.now() e requestAnimationFrame. Deliberadamente NAO
 * usa setInterval somando 100ms: intervalos sofrem throttling e atraso de
 * agendamento, e o erro se acumula. Numa coleta de 40 ciclos isso viraria
 * segundos de distorcao. Aqui cada leitura e' a diferenca entre dois
 * instantes reais, entao nao existe deriva acumulada.
 */
export function useCronometro() {
  const [decorrido, setDecorrido] = useState(0);
  const [rodando, setRodando] = useState(false);
  const inicioRef = useRef(0);
  const pausaRef = useRef(0);
  const frameRef = useRef(0);

  const tick = useCallback(() => {
    setDecorrido(performance.now() - inicioRef.current - pausaRef.current);
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const iniciar = useCallback(() => {
    inicioRef.current = performance.now();
    pausaRef.current = 0;
    setDecorrido(0);
    setRodando(true);
  }, []);

  /** Marca o fim do ciclo e ja' reinicia — coleta continua nao pode ter buraco. */
  const marcarEReiniciar = useCallback(() => {
    const agora = performance.now();
    const duracao = agora - inicioRef.current - pausaRef.current;
    inicioRef.current = agora;
    pausaRef.current = 0;
    setDecorrido(0);
    return duracao;
  }, []);

  const parar = useCallback(() => {
    setRodando(false);
    cancelAnimationFrame(frameRef.current);
    return performance.now() - inicioRef.current - pausaRef.current;
  }, []);

  /** Soma o tempo parado para que ele nao entre na duracao do ciclo. */
  const somarPausa = useCallback((ms) => { pausaRef.current += ms; }, []);

  useEffect(() => {
    if (!rodando) return undefined;
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [rodando, tick]);

  return { decorrido, rodando, iniciar, marcarEReiniciar, parar, somarPausa };
}

/** Vibra o aparelho. Confirmacao tatil vale mais que sonora perto da furadeira. */
export function vibrar(padrao) {
  try { navigator.vibrate?.(padrao); } catch { /* sem suporte, ignora */ }
}

/** Estado de conectividade, para a UI mostrar a fila pendente com honestidade. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const sobe = () => setOnline(true);
    const cai = () => setOnline(false);
    window.addEventListener('online', sobe);
    window.addEventListener('offline', cai);
    return () => { window.removeEventListener('online', sobe); window.removeEventListener('offline', cai); };
  }, []);
  return online;
}
