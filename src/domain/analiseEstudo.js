/**
 * A ANALISE DE UM ESTUDO — o que o painel do PC e as duas folhas impressas
 * leem. Puro: sem React, sem rede.
 *
 * Um estudo de tempos existe para responder duas perguntas: quanto a linha
 * produz por hora, e quantos operadores ela precisa. Tudo o mais — media,
 * CV, carta de controle — e' o caminho ate' essas duas respostas.
 *
 * Ate' set/26 estas contas viviam dentro do componente da tela, sem
 * teste. Vieram para o dominio para que um numero errado apareca no teste
 * antes de aparecer na reuniao.
 */
import {
  amostraSuficiente, calcularOperacao, comparativoCapacidade, operadoresNecessarios,
  resumirParadasDoEstudo,
} from './cronoanalise.js';
import { sugerirMelhorias } from './sugestoes.js';

/**
 * Primeiro passo: cada operacao calculada, o gargalo, a soma dos TP por
 * peca, a capacidade da linha e as pendencias de amostra.
 *
 * `dados` e' o que /api/estudos?id= devolve: { estudo, operacoes }.
 */
export function analisarEstudo(dados) {
  if (!dados) return null;
  const tolerancia = Number(dados.estudo.tolerancia_pct);
  const taktMs = dados.estudo.takt_time_ms ? Number(dados.estudo.takt_time_ms) : 0;

  const operacoes = dados.operacoes.map((op) => ({
    ...op,
    resultado: calcularOperacao(
      { ...op, fr: Number(op.fr_pct), ciclosPorPeca: Number(op.ciclos_por_peca) || 1 },
      tolerancia,
    ),
  }));

  const comDados = operacoes.filter((o) => o.resultado);
  // Tudo que se compara com o Takt usa o tempo POR PECA: o Takt e' o ritmo
  // que a demanda exige em pecas, nao em ciclos de maquina.
  const somaTp = comDados.reduce((acc, o) => acc + o.resultado.tpPorPeca, 0);
  const gargalo = comDados.reduce(
    (pior, o) => (!pior || o.resultado.tpPorPeca > pior.resultado.tpPorPeca ? o : pior), null,
  );

  return {
    tolerancia,
    taktMs,
    operacoes,
    comDados,
    somaTp,
    gargalo,
    // Capacidade da linha e' ditada pelo gargalo, nao pela media.
    capacidadeLinha: gargalo ? gargalo.resultado.cap : 0,
    operadores: taktMs > 0 ? operadoresNecessarios(somaTp, taktMs) : null,
    totalCiclos: comDados.reduce((acc, o) => acc + o.resultado.n, 0),
    // Paradas registradas na coleta (botao Parada, com motivo). Ja' eram
    // descontadas do ciclo para nao inflar o TO; faltava mostra-las.
    paradas: resumirParadasDoEstudo(dados.operacoes),
    pendencias: operacoes
      .map((o) => ({ op: o, s: amostraSuficiente(o.resultado, dados.estudo.meta_obs) }))
      .filter((x) => !x.s.ok),
  };
}

/**
 * Segundo passo: sugestoes e comparativos. Saem de um passo separado
 * porque dependem do primeiro inteiro — gargalo, Takt e paradas ja'
 * resolvidos.
 */
export function lerEstudo(analise) {
  if (!analise) return null;
  return {
    capacidade: comparativoCapacidade({
      taktMs: analise.taktMs, capacidadeLinha: analise.capacidadeLinha,
    }),
    sugestoes: sugerirMelhorias({
      operacoes: analise.operacoes,
      taktMs: analise.taktMs,
      gargalo: analise.gargalo,
      paradas: analise.paradas,
    }),
  };
}
