/**
 * Prazo da funcao serverless.
 *
 * O bug que originou isto: a analise por IA estourava o teto da Vercel, ela
 * respondia uma pagina de erro em TEXTO, e o app mostrava "O servidor
 * demorou demais para responder" — sem dizer o que fazer. Cortar antes, por
 * conta propria, e' o que permite responder JSON com uma saida pratica.
 *
 * O que precisa continuar valendo: o corte acontece ANTES do teto (com
 * folga para responder), e encerrar() cancela o corte quando a resposta
 * chegou a tempo — senao o temporizador segura a instancia viva depois de
 * a resposta ja' ter saido.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLGA_MS, PRAZO_MS, TETO_FUNCAO_MS, comPrazo } from '../api/_lib/prazo.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('comPrazo', () => {
  it('corta ANTES do teto da funcao, com folga para responder', () => {
    expect(PRAZO_MS).toBe(TETO_FUNCAO_MS - FOLGA_MS);
    expect(PRAZO_MS).toBeLessThan(TETO_FUNCAO_MS);
    // Folga suficiente para montar, serializar e enviar a resposta.
    expect(FOLGA_MS).toBeGreaterThanOrEqual(5000);
  });

  it('o sinal comeca livre e aborta ao fim do prazo', () => {
    const { sinal } = comPrazo(1000);
    expect(sinal.aborted).toBe(false);
    vi.advanceTimersByTime(999);
    expect(sinal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(sinal.aborted).toBe(true);
  });

  it('encerrar() cancela o corte — resposta que chegou a tempo nao aborta depois', () => {
    const { sinal, encerrar } = comPrazo(1000);
    encerrar();
    vi.advanceTimersByTime(10_000);
    expect(sinal.aborted).toBe(false);
  });

  it('encerrar() duas vezes nao quebra — o finally pode rodar apos o catch', () => {
    const { encerrar } = comPrazo(1000);
    encerrar();
    expect(() => encerrar()).not.toThrow();
  });

  it('o teto declarado aqui e o do vercel.json sao o mesmo numero', async () => {
    // Sao dois arquivos que precisam concordar: se o maxDuration mudar e
    // este valor nao, o corte deixa de acontecer antes do corte da Vercel —
    // e o erro volta a ser a pagina em texto.
    const { readFileSync } = await import('node:fs');
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
    const segundos = vercel.functions['api/**/*.js'].maxDuration;
    expect(segundos * 1000).toBe(TETO_FUNCAO_MS);
  });
});
