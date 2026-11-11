/**
 * O GRAFICO DO VOLUME A VOLUME: as linhas de referencia coladas (v2.103.1,
 * pedido do PCP com print — takt 15.4 s e periodo 15.2 s a 1,4 px, as duas
 * pretas: uma sumia debaixo da outra). As linhas ficam no valor exato; o
 * periodo ganha a cor do veredito e a legenda diz que estao coladas.
 */
import { describe, expect, it } from 'vitest';
import { claro } from '../src/theme/tokensAnalise.js';

const { COLADA_PX, corDoPeriodo, textoColadaNoAlvo } = await import('../src/features/analise/graficos/Intervalos.jsx');

describe('a cor da linha do periodo e o veredito', () => {
  it('dentro do takt, verde; acima, laranja; sem takt, a cor do texto', () => {
    expect(corDoPeriodo(15200, 15400)).toBe(claro.ok);
    expect(corDoPeriodo(15400, 15400)).toBe(claro.ok);
    expect(corDoPeriodo(20700, 15400)).toBe(claro.critico);
    expect(corDoPeriodo(15200, null)).toBe(claro.texto);
    // Nunca o preto do takt quando ha' takt: colados, um sumiria no outro.
    expect(corDoPeriodo(15200, 15400)).not.toBe(claro.texto);
  });
});

describe('a legenda da linha colada no takt', () => {
  it('o caso do print: 15.2 s a 1,4 px do takt de 15.4 s', () => {
    expect(textoColadaNoAlvo(15200, 15400, 1.4)).toBe(' — colada no tempo-alvo (0.2 s abaixo)');
  });

  it('a diferenca e' + "' a dos numeros escritos, acima ou abaixo", () => {
    // 15.26 escreve 15.3; 15.44 escreve 15.4: 0.1, nunca 0.18.
    expect(textoColadaNoAlvo(15260, 15440, 2)).toBe(' — colada no tempo-alvo (0.1 s abaixo)');
    expect(textoColadaNoAlvo(15800, 15400, 3)).toBe(' — colada no tempo-alvo (0.4 s acima)');
    expect(textoColadaNoAlvo(15420, 15380, 0.3)).toBe(' — igual ao tempo-alvo');
  });

  it('longe do takt, ou sem takt, nada', () => {
    expect(textoColadaNoAlvo(13800, 15400, COLADA_PX)).toBe('');
    expect(textoColadaNoAlvo(13800, 15400, 10)).toBe('');
    expect(textoColadaNoAlvo(15200, 0, 1)).toBe('');
    expect(textoColadaNoAlvo(0, 15400, 1)).toBe('');
  });
});
