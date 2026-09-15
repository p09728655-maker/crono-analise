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
 * Capacidade ESPERADA (o que o Takt exige) x REAL (o que o gargalo entrega).
 *
 * O painel ja' dizia quanto a linha produz. Faltava a outra metade da
 * pergunta — se isso e' suficiente. Sem Takt configurado nao ha esperado: o
 * comparativo devolve null em vez de inventar uma meta.
 */
export function comparativoCapacidade({ taktMs, capacidadeLinha } = {}) {
  const takt = Number(taktMs) || 0;
  const real = Math.max(0, Math.floor(Number(capacidadeLinha) || 0));
  if (takt <= 0) return { esperado: null, real, atingimentoPct: null, diferenca: null };

  const esperado = Math.floor(MS_POR_HORA / takt);
  return {
    esperado,
    real,
    atingimentoPct: esperado > 0 ? (real / esperado) * 100 : null,
    // Positivo sobra, negativo falta. E' o numero que vai para a reuniao.
    diferenca: esperado > 0 ? real - esperado : null,
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
