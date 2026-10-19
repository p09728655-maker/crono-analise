/**
 * ROTULOS QUE NAO SE ENCOSTAM — para os numeros escritos dentro do grafico.
 *
 * Duas lacunas a poucos volumes uma da outra escreviam o valor e o numero
 * do volume no mesmo lugar. Com o contorno branco dos rotulos, o de cima
 * apagava parte do de baixo e o que sobrava parecia um numero valido e
 * errado ("22270.0 s" sobre a barra de 270 s, "723" no eixo no lugar de
 * 72 e 73 — revisao de 19/10). Rotulo que nao cabe sai inteiro: a barra
 * continua hachurada e a tabela das lacunas continua listando todas.
 */

/** Largura aproximada de um texto curto de numeros no SVG, com folga. */
export function larguraDoTexto(texto, fonte = 10.5) {
  return String(texto).length * fonte * 0.62;
}

/**
 * Aceita os candidatos NA ORDEM EM QUE VEM (o primeiro tem prioridade) e
 * descarta o que invadiria a extensao em x de um ja' aceito. Cada
 * candidato: { chave, x (centro), largura }. Devolve as chaves aceitas, ate'
 * `maximo`.
 */
export function rotulosSemColisao(candidatos, { folga = 3, maximo = Infinity } = {}) {
  const aceitos = [];
  for (const c of candidatos) {
    if (aceitos.length >= maximo) break;
    const ini = c.x - c.largura / 2 - folga;
    const fim = c.x + c.largura / 2 + folga;
    if (aceitos.every((a) => fim <= a.ini || ini >= a.fim)) aceitos.push({ chave: c.chave, ini, fim });
  }
  return new Set(aceitos.map((a) => a.chave));
}
