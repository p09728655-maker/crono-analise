/**
 * A OPERACAO CRONOMETRADA: TO -> TN -> TP.
 *
 * O nucleo da cronoanalise. Tempo observado vira tempo normal pelo fator
 * de ritmo, e tempo normal vira tempo padrao pela tolerancia. Com a carta
 * de controle junto: tempo padrao calculado sobre amostra instavel e'
 * numero bonito sobre processo que nao se repete.
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
} from '../estatistica.js';

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
    // Concordancia: uma observacao FALTA, varias FALTAM. A frase sai na
    // tela (lista de pendencias) e na folha A4 — "Faltam 1 observações"
    // trava o olho de quem le' no meio da leitura.
    const faltam = meta - resultado.n;
    return {
      ok: false,
      motivo: faltam === 1
        ? 'Falta 1 observação para a meta'
        : `Faltam ${faltam} observações para a meta`,
    };
  }
  return { ok: true, motivo: 'Meta de ciclos atingida' };
}
