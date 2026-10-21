/**
 * CAPACIDADE DA LINHA: takt, operadores e OEE.
 *
 * O elo entre o tempo padrao de cada operacao e a decisao de quantas
 * pessoas a linha precisa. Funcoes puras, sem padrao escondido: faltando
 * dado, devolvem zero ou null em vez de supor turno.
 */
import { MS_POR_HORA } from '../estatistica.js';

/** Takt Time em ms. Ritmo que a demanda exige. */
export function taktTime(tempoDisponivelSeg, quantidade) {
  const qtd = Number(quantidade) || 0;
  if (qtd <= 0) return 0;
  return ((Number(tempoDisponivelSeg) || 0) * 1000) / qtd;
}

/** Numero de operadores necessarios = soma dos TP / Takt. */
export function operadoresNecessarios(somaTpMs, taktMs) {
  if (!taktMs || taktMs <= 0) return 0;
  return somaTpMs / taktMs;
}

/**
 * Capacidade: os TRES numeros por hora, na unidade do estudo.
 *
 *   esperado  o que o Takt EXIGE (3.600.000 / takt);
 *   real      a CAPACIDADE PELO TEMPO PADRAO — o que o gargalo do estudo
 *             permite. O nome "real" e' de quando so' havia este numero;
 *             fica por compatibilidade, mas nao e' medicao: e' conta;
 *   medido    o que a linha ENTREGOU, medido no posto (relogio, paradas
 *             dentro). Opcional: so' chega aqui quando a medicao tem
 *             amostra suficiente e esta' na unidade do estudo.
 *
 * O atingimento e o deficit/superavit sao do MEDIDO contra o exigido
 * quando ha' medido — e' a linha que enche o caminhao, nao a conta. Sem
 * medido, continuam da capacidade pelo tempo padrao, como sempre foram, e
 * `base` diz qual dos dois foi usado: um 74% nao pode ser lido sem saber
 * de onde saiu.
 *
 * Sem Takt configurado nao ha esperado: o comparativo devolve null em vez
 * de inventar uma meta.
 *
 * Os tres numeros saem CHEIOS, sem arredondar: quem exibe arredonda (a
 * tela escreve para baixo, com uma casa abaixo de 100/h — exibirPorHora,
 * em textosMedicao).
 * Arredondar antes de dividir trocava o veredito na embalagem, onde a
 * taxa e' ~25 por hora e uma unidade vale 4%: exigido 24,66 e medido
 * 24,3 viravam 24 contra 24 — "100%, atende" para uma linha abaixo do
 * takt (revisao de 20/10). `atende` e' decidido aqui, com os valores
 * cheios, para nenhuma tela refazer a conta com o numero arredondado.
 */
export function comparativoCapacidade({ taktMs, capacidadeLinha, medido } = {}) {
  const takt = Number(taktMs) || 0;
  const real = Math.max(0, Number(capacidadeLinha) || 0);
  // So' numero (ou texto de numero) conta: null, '', booleano e objeto sao
  // "sem medido" — Number(null) e Number(true) virariam 0 e 1 calados.
  const bruto = typeof medido === 'number' || (typeof medido === 'string' && medido.trim())
    ? Number(medido) : NaN;
  const medidoH = Number.isFinite(bruto) && bruto > 0 ? bruto : null;
  const base = medidoH !== null ? 'medido' : 'capacidade';
  const entrega = base === 'medido' ? medidoH : real;
  /* Quanto do que o tempo padrao permite a linha de fato entrega. A
     distancia ate' 100% e' a perda do chao — parada, ritmo, espera — que
     o estudo sozinho nao enxerga. So' com medido e com capacidade. */
  const pctDaCapacidade = medidoH !== null && real > 0 ? (medidoH / real) * 100 : null;

  if (takt <= 0) {
    return {
      esperado: null, real, medido: medidoH, base, atingimentoPct: null, diferenca: null, atende: null, pctDaCapacidade,
    };
  }

  const esperado = MS_POR_HORA / takt;
  /* Sem ciclos (capacidade 0) e sem medido nao ha' com o que comparar: o
     estudo recem-criado, com o takt do programa ja' gravado, dizia
     "Atingimento 0% · Deficit -25 · nao atende" para uma linha que ninguem
     mediu. Exigido sim; veredito, nao. */
  if (base === 'capacidade' && !(real > 0)) {
    return {
      esperado, real, medido: medidoH, base, atingimentoPct: null, diferenca: null, atende: null, pctDaCapacidade,
    };
  }
  return {
    esperado,
    real,
    medido: medidoH,
    base,
    atingimentoPct: (entrega / esperado) * 100,
    // Positivo sobra, negativo falta. E' o numero que vai para a reuniao.
    diferenca: entrega - esperado,
    atende: entrega >= esperado,
    pctDaCapacidade,
  };
}

/**
 * Dimensionamento: quantos operadores preciso — e quantos tenho.
 *
 * O calculo exato quase nunca da' inteiro (0,54 operador nao existe no chao
 * de fabrica), entao arredonda para CIMA e reporta a eficiencia que sobra
 * desse arredondamento: com 0,54 de necessidade e 1 operador, metade do
 * tempo dele fica ociosa — e' informacao de balanceamento, nao erro.
 *
 * `operadoresAtuais` e' opcional: sem ele o retorno traz so' a necessidade.
 */
export function dimensionarOperadores({ somaTpMs, taktMs, operadoresAtuais } = {}) {
  const exato = operadoresNecessarios(somaTpMs, taktMs);
  if (exato <= 0) return null;

  const necessarios = Math.ceil(exato);
  const bruto = Number(operadoresAtuais);
  const atuais = Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : null;

  return {
    exato,
    necessarios,
    // Eficiencia do time dimensionado: quanto do tempo dele e' trabalho.
    eficienciaPct: (exato / necessarios) * 100,
    atuais,
    // Positivo sobra gente, negativo falta.
    diferenca: atuais === null ? null : atuais - necessarios,
    eficienciaAtualPct: atuais ? (exato / atuais) * 100 : null,
  };
}

/**
 * OEE = Disponibilidade x Desempenho x Qualidade.
 * Recebe e devolve fracoes 0..1 para evitar confusao de escala.
 */
export function oee({ disponibilidade, desempenho, qualidade }) {
  const d = Number(disponibilidade) || 0;
  const p = Number(desempenho) || 0;
  const q = Number(qualidade) || 0;
  return { disponibilidade: d, desempenho: p, qualidade: q, oee: d * p * q };
}
