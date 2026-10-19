/**
 * Numero escrito no grafico nunca encosta em outro — duas lacunas vizinhas
 * escreviam "22270.0 s" e "723" (revisao de 19/10).
 */
import { describe, expect, it } from 'vitest';
import { larguraDoTexto, rotulosSemColisao } from '../src/features/analise/graficos/rotulos.js';

const rotulo = (chave, x, texto) => ({ chave, x, largura: larguraDoTexto(texto) });

describe('rotulos sem colisao', () => {
  it('o primeiro da lista (o maior) vence o vizinho que encostaria nele', () => {
    // Barras de 270 s e 250 s a 6 px uma da outra: so' a maior ganha o valor.
    const aceitos = rotulosSemColisao([rotulo(36, 100, '270.0 s'), rotulo(35, 94, '250.0 s'), rotulo(70, 300, '310.0 s')]);
    expect([...aceitos]).toEqual([36, 70]);
  });

  it('numeros do eixo em volumes vizinhos nao se juntam num numero so', () => {
    // 72 e 73 a 3,65 px (a banda da folha A4): escrito um so'.
    const aceitos = rotulosSemColisao([rotulo(70, 200, '72'), rotulo(71, 203.65, '73')]);
    expect(aceitos.size).toBe(1);
    // Afastados o bastante, os dois.
    expect(rotulosSemColisao([rotulo(70, 200, '72'), rotulo(71, 230, '73')]).size).toBe(2);
  });

  it('respeita o maximo, contando so os aceitos', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => rotulo(i, i * 100, '100.0 s'));
    expect(rotulosSemColisao(muitos, { maximo: 6 }).size).toBe(6);
  });
});
