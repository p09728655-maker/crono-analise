/**
 * Nucleo da cronoanalise: TO -> TN -> TP -> capacidade.
 * Funcoes puras. Toda a matematica do sistema mora aqui.
 */
import {
  MS_POR_HORA,
  cartaDeControle,
  classificarEstabilidade,
  coeficienteVariacao,
  desvioPadrao,
  foraDeControle,
  media,
  observacoesMinimas,
  temposValidos,
  tendencia,
} from './estatistica.js';

/** Motivos de parada padronizados. Codigo estavel; rotulo pode mudar sem quebrar dado. */
export const MOTIVOS_PARADA = [
  { codigo: 'setup', rotulo: 'Setup / Troca', acao: 'Aplicar SMED e padronizar o plano de troca.' },
  { codigo: 'manutencao', rotulo: 'Manutenção corretiva', acao: 'Implantar TPM e analisar histórico de falhas.' },
  { codigo: 'falta_material', rotulo: 'Falta de material', acao: 'Revisar kanban, ponto de pedido e lead time.' },
  { codigo: 'qualidade', rotulo: 'Problema de qualidade', acao: 'Reforçar CEP e inspeção de início de lote.' },
  { codigo: 'ferramenta', rotulo: 'Troca de broca / ferramenta', acao: 'Monitorar vida útil da broca e criar plano de troca programada.' },
  { codigo: 'ajuste_maquina', rotulo: 'Ajuste de máquina', acao: 'Padronizar gabarito e batente para eliminar ajuste manual.' },
  { codigo: 'reuniao', rotulo: 'Reunião / Treinamento', acao: 'Agendar fora do horário produtivo.' },
  { codigo: 'pessoal', rotulo: 'Necessidade pessoal', acao: 'Já coberto pela tolerância; não tratar como perda.' },
  { codigo: 'outro', rotulo: 'Outro', acao: 'Detalhar na observação para permitir classificação posterior.' },
];

export const FR_PRESETS = [
  { valor: 85, rotulo: 'Muito lento' },
  { valor: 95, rotulo: 'Abaixo do normal' },
  { valor: 100, rotulo: 'Normal' },
  { valor: 110, rotulo: 'Acima do normal' },
  { valor: 120, rotulo: 'Muito rápido' },
];

/**
 * Calcula todos os indicadores de uma operacao.
 * Retorna null quando ainda nao ha observacao valida — o chamador decide
 * como renderizar o estado vazio, em vez de receber zeros enganosos.
 */
export function calcularOperacao(operacao, toleranciaPct = 0) {
  const validos = temposValidos(operacao?.tempos);
  if (!validos.length) return null;

  const fr = Number(operacao.fr) || 100;
  const toMed = media(validos);
  const tnMed = toMed * (fr / 100);
  const tpVal = tnMed * (1 + toleranciaPct / 100);

  /**
   * Quantas vezes a operacao se repete por peca.
   *
   * O cronometro mede UM ciclo da maquina, mas a peca pode exigir varios:
   * na furadeira, uma peca com 3 furacoes leva 3x o tempo de uma com 1.
   * Sem isto o sistema assumiria 1 ciclo = 1 peca e superestimaria a
   * capacidade — justamente o numero que sustenta o dimensionamento.
   */
  const ciclosPorPeca = Math.max(1, Number(operacao.ciclosPorPeca) || 1);
  const tpPorPeca = tpVal * ciclosPorPeca;

  const paradas = operacao.paradas || [];
  const totalParada = paradas.reduce((acc, p) => acc + (p.duracao || 0), 0);
  const cvPct = coeficienteVariacao(validos);

  return {
    n: validos.length,
    toMed,
    tnMed,
    tpVal,
    ciclosPorPeca,
    tpPorPeca,
    cvPct,
    sd: desvioPadrao(validos),
    min: Math.min(...validos),
    max: Math.max(...validos),
    // Capacidade em PECAS por hora — usa o tempo da peca, nao o do ciclo.
    cap: tpPorPeca > 0 ? Math.floor(MS_POR_HORA / tpPorPeca) : 0,
    estabilidade: classificarEstabilidade(cvPct),
    obsMinimas: observacoesMinimas(cvPct),
    carta: cartaDeControle(validos),
    outliers: foraDeControle(validos),
    tendencia: tendencia(validos),
    totalParada,
    nParadas: paradas.length,
  };
}

/**
 * A operacao ja tem observacoes suficientes?
 *
 * O criterio e' a META definida pelo analista — e so' ela. O minimo de
 * Nievel chegou a travar a amostra aqui, mas em posto de ciclo curto ele
 * virava exigencia sem fim: CV alto pedia mais ciclos, e o app parecia
 * nunca se dar por satisfeito. Decisao de processo (ago/2026): Nievel e
 * CV% continuam calculados e visiveis como REFERENCIA de confiabilidade
 * (na tela e no relatorio impresso), mas nao seguram mais o estudo.
 */
export function amostraSuficiente(resultado, metaObs) {
  if (!resultado) return { ok: false, motivo: 'Sem observações' };
  const meta = Number(metaObs) || 0;
  if (meta > 0 && resultado.n < meta) {
    return { ok: false, motivo: `Faltam ${meta - resultado.n} observações para a meta` };
  }
  return { ok: true, motivo: 'Meta de ciclos atingida' };
}

/**
 * Conferencia rapida: ritmo observado num periodo, sem estudo cadastrado.
 *
 * O analista passa pelo posto, cronometra um intervalo (ex: 7:00 as 7:10)
 * e informa quantas pecas sairam (150). Nao ha' FR, tolerancia nem amostra
 * por ciclo — e' uma medicao de vazao, nao um estudo de tempos. Por isso o
 * resultado fala em pecas/hora e ciclo MEDIO, nunca em TO/TN/TP.
 */
export function conferenciaRapida({ duracaoMs, pecas }) {
  const dur = Number(duracaoMs) || 0;
  if (dur <= 0) return null;
  const qtd = Math.max(0, Math.floor(Number(pecas) || 0));
  const pecasPorHora = (qtd * MS_POR_HORA) / dur;
  return {
    duracaoMs: dur,
    pecas: qtd,
    pecasPorHora,
    pecasPorMinuto: pecasPorHora / 60,
    // Sem peca nao ha ciclo: null obriga o chamador a mostrar vazio, nao 0.
    cicloMedioMs: qtd > 0 ? dur / qtd : null,
  };
}

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
 * OEE = Disponibilidade x Desempenho x Qualidade.
 * Recebe e devolve fracoes 0..1 para evitar confusao de escala.
 */
export function oee({ disponibilidade, desempenho, qualidade }) {
  const d = Number(disponibilidade) || 0;
  const p = Number(desempenho) || 0;
  const q = Number(qualidade) || 0;
  return { disponibilidade: d, desempenho: p, qualidade: q, oee: d * p * q };
}

/** Formata ms como segundos com casas decimais — uso exclusivo de apresentacao. */
export function formatarSegundos(ms, casas = 1) {
  if (!Number.isFinite(ms)) return '—';
  return (ms / 1000).toFixed(casas);
}

/** Formata ms como cronometro mm:ss.d para leitura a distancia. */
export function formatarCronometro(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalDecimos = Math.floor(ms / 100);
  const decimos = totalDecimos % 10;
  const totalSeg = Math.floor(totalDecimos / 10);
  const seg = totalSeg % 60;
  const min = Math.floor(totalSeg / 60);
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${decimos}`;
}
