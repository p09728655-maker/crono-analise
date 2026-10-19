/**
 * O RELOGIO DOS TOQUES contra o validador do servidor.
 *
 * O tablet grava, por toque, a marca (relogio rodando), o instante bruto e
 * o setup acumulado; o servidor confere que o setup no trecho nao passa do
 * que o trecho parou. Os dois lados precisam fechar AO MILISSEGUNDO: quando
 * o setup era arredondado sobre a soma, ele passava do parado por 1 ms em
 * 12,6% das medicoes, o servidor descartava o desconto e tablet e PC
 * mostravam tempos diferentes para a mesma medicao (revisao de 19/10).
 *
 * performance.now() devolve fracao de ms, e e' com fracao que se testa.
 */
import { describe, expect, it } from 'vitest';
import { duracaoDaParada, momentoDoToque } from '../src/features/coleta/rapida/useCronometroAoVivo.js';
import { marcasDaConferencia, relogioDasMarcas, setupDasMarcas } from '../api/_lib/validar.js';

/**
 * Uma sessao, do jeito que o hook a vive: eventos com instante fracionario.
 * { toque: t } ou { parada: [inicio, fim], setup: bool }.
 */
function viver(eventos, inicio = 0) {
  let paradaAcumulada = 0;
  let setupAcumulado = 0;
  const toques = [];
  for (const e of eventos) {
    if (e.toque != null) {
      toques.push(momentoDoToque({ agora: e.toque, inicio, paradaAcumulada, setupAcumulado }));
    } else {
      const ms = duracaoDaParada(e.parada[0], e.parada[1]);
      if (ms >= 1000) {
        paradaAcumulada += ms;
        if (e.setup) setupAcumulado += ms;
      }
    }
  }
  const marcas = toques.map((t) => t.marca);
  const relogio = toques.length >= 2 ? toques.at(-1).bruta - toques[0].bruta : null;
  const setup = toques.length >= 2 ? toques.at(-1).setup - toques[0].setup : null;
  return { marcas, relogio, setup };
}

/** O que o servidor grava a partir do que o tablet manda. */
function gravar({ marcas, relogio, setup }, duracaoMs) {
  const m = marcasDaConferencia(marcas, { pecas: marcas.length, duracaoMs });
  const r = relogioDasMarcas(relogio, { marcas: m, duracaoMs });
  return { marcas: m, relogio: r, setup: setupDasMarcas(setup, { marcas: m, relogio: r }) };
}

describe('o relogio dos toques fecha com o servidor ao milissegundo', () => {
  it('o caso da revisao: setup fracionario entre toques nao vira null', () => {
    const s = viver([
      { toque: 1000.4 },
      { parada: [1500.1, 3500.7], setup: true }, // 2000,6 ms
      { toque: 4000.2 },
      { toque: 5000.2 },
    ]);
    const g = gravar(s, 6000);
    expect(g.setup).toBe(s.setup);
    expect(g.setup).not.toBeNull();
    // O relogio menos o trecho rodando e' exatamente o que parou.
    expect(s.relogio - (s.marcas.at(-1) - s.marcas[0])).toBe(g.setup);
  });

  it('a troca antes do primeiro toque fica fora do trecho', () => {
    const s = viver([
      { parada: [100.3, 1800.9], setup: true },
      { toque: 2500.5 },
      { toque: 3500.5 },
    ]);
    expect(s.setup).toBe(0);
  });

  it('10 mil sessoes com tempo fracionario: o servidor nunca descarta o que o tablet mandou', () => {
    // Gerador deterministico: o teste nao pode ser verde por sorte.
    let semente = 20261019;
    const sorteio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
    let descartes = 0;
    for (let sessao = 0; sessao < 10000; sessao++) {
      const eventos = [];
      let t = sorteio() * 3000;
      const volumes = 2 + Math.floor(sorteio() * 20);
      for (let v = 0; v < volumes; v++) {
        if (sorteio() < 0.3) {
          const dur = 1000 + sorteio() * 5000;
          eventos.push({ parada: [t, t + dur], setup: sorteio() < 0.5 });
          t += dur + sorteio() * 50;
        }
        t += 200 + sorteio() * 3000;
        eventos.push({ toque: t });
      }
      const s = viver(eventos);
      const g = gravar(s, Math.ceil(t) + 1000);
      if (g.marcas === null || g.relogio !== s.relogio || g.setup !== s.setup) descartes += 1;
    }
    expect(descartes).toBe(0);
  });
});
