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

/** Rotulo legivel de um motivo de parada. Codigo desconhecido volta como veio. */
export function rotuloMotivo(codigo) {
  const achado = MOTIVOS_PARADA.find((m) => m.codigo === codigo);
  return achado ? achado.rotulo : String(codigo || 'Parada');
}

/**
 * Soma as paradas de um periodo, separando SETUP do resto.
 *
 * Setup sai separado porque e' a unica parada que o proprio processo
 * exige: trocar gabarito, programa ou broca faz parte de produzir lote
 * variado. As outras — falta de material, manutencao, qualidade — sao
 * perda a ser eliminada. Misturar as duas numa unica "parada" esconde
 * justamente a decisao que o PCP precisa tomar (reduzir setup com SMED x
 * atacar a causa da perda).
 *
 * Aceita paradas do aparelho (camelCase) e do banco (snake_case).
 */
export function somarParadas(paradas) {
  let totalMs = 0;
  let setupMs = 0;
  const porMotivo = new Map();

  for (const p of paradas || []) {
    const ms = Math.max(0, Number(p?.duracaoMs ?? p?.duracao_ms) || 0);
    if (ms <= 0) continue;
    const motivo = String(p?.motivo || 'outro');
    totalMs += ms;
    if (motivo === 'setup') setupMs += ms;
    porMotivo.set(motivo, (porMotivo.get(motivo) || 0) + ms);
  }

  return {
    totalMs,
    setupMs,
    outrasMs: totalMs - setupMs,
    n: [...porMotivo.keys()].length,
    // Maior perda primeiro: a lista ja' sai em ordem de Pareto.
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, ms]) => ({ motivo, rotulo: rotuloMotivo(motivo), ms }))
      .sort((a, b) => b.ms - a.ms),
  };
}

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
export function conferenciaRapida({ duracaoMs, pecas, paradas }) {
  const dur = Number(duracaoMs) || 0;
  if (dur <= 0) return null;

  /**
   * Parada dentro do periodo nao e' ritmo. Se das 7:00 as 7:30 a furadeira
   * passou 10 minutos em setup, o ritmo dela e' 20 minutos de trabalho —
   * nao 30. Sem separar isso, o mesmo posto aparece lento no dia de troca
   * de lote e rapido no dia de lote longo, e o numero nunca fecha.
   */
  const par = somarParadas(paradas);
  const paradaMs = Math.min(par.totalMs, dur);
  const produtivoMs = dur - paradaMs;
  // Periodo inteiro parado: nao ha ritmo a medir. Null obriga o chamador a
  // mostrar vazio (e a tela explica), em vez de dividir por zero.
  if (produtivoMs <= 0) return null;

  const qtd = Math.max(0, Math.floor(Number(pecas) || 0));
  const pecasPorHora = (qtd * MS_POR_HORA) / produtivoMs;
  return {
    duracaoMs: dur,
    pecas: qtd,
    paradaMs,
    setupMs: Math.min(par.setupMs, dur),
    produtivoMs,
    paradasPorMotivo: par.porMotivo,
    // Ritmo com a maquina RODANDO — e' este que sustenta capacidade.
    pecasPorHora,
    pecasPorMinuto: pecasPorHora / 60,
    // Ritmo do periodo inteiro, paradas incluidas: o que o posto entregou
    // por hora de presenca. Sem parada marcada, os dois sao o mesmo numero.
    pecasPorHoraBruto: (qtd * MS_POR_HORA) / dur,
    // Quanto do periodo a maquina passou produzindo.
    disponibilidadePct: (produtivoMs / dur) * 100,
    // Sem peca nao ha ciclo: null obriga o chamador a mostrar vazio, nao 0.
    cicloMedioMs: qtd > 0 ? produtivoMs / qtd : null,
  };
}

/**
 * Criterios de confiabilidade do estudo por maquina.
 *
 * Mesma filosofia da meta/Nievel no estudo de ciclos: o criterio nao
 * esconde numero nenhum, mas e' DECLARADO antes dos numeros — na tela e
 * impresso — porque o relatorio circula em reuniao, e "12000 pc/h" vindo
 * de uma unica conferencia de 1 minuto nao pode passar por referencia.
 */
export const CRITERIOS_CONFERENCIA = {
  // Uma medicao so' descreve um instante; tres começam a descrever o posto.
  minConferencias: 3,
  // Menos de meia hora observada nao sustenta decisao de capacidade.
  minTempoTotalMs: 30 * 60000,
  // Conferencia mais curta que isto mede rajada, nao ritmo.
  minPeriodoMs: 5 * 60000,
};

/**
 * Resumo das conferencias por maquina — o "estudo das furadeiras".
 *
 * Agrupa as conferencias salvas pelo posto conferido e responde o que o
 * gestor pergunta diante do relatorio: quantas medicoes, qual o ritmo
 * MEDIO real, qual o melhor e o pior registro (e com qual peca) — e se a
 * amostra passa nos CRITERIOS_CONFERENCIA para valer como referencia.
 *
 * O ritmo medio e' PONDERADO pelo tempo (soma de pecas / soma do tempo
 * PRODUTIVO), nao a media das taxas: uma conferencia de 2h vale mais que
 * uma de 5min, e a media simples deixaria a medicao curta distorcer o
 * numero que vai sustentar decisao de capacidade.
 *
 * Tempo produtivo = periodo observado menos as paradas marcadas (setup,
 * falta de material, manutencao). Conferencia sem parada marcada da' o
 * mesmo resultado de antes — produtivo e periodo sao o mesmo numero.
 *
 * Aceita linhas do servidor (snake_case) e do aparelho (camelCase).
 */
export function resumirConferencias(conferencias) {
  const grupos = new Map();

  for (const c of conferencias || []) {
    const duracao = Number(c.duracaoMs ?? c.duracao_ms) || 0;
    const pecas = Number(c.pecas) || 0;
    if (duracao <= 0 || pecas <= 0) continue;

    // Tempo produtivo: o periodo menos o que ficou parado (setup, falta de
    // material, manutencao). E' sobre ele que o ritmo e' calculado — parada
    // e' perda a tratar, nao lentidao da maquina.
    const par = somarParadas(c.paradas);
    const paradaMs = Math.min(par.totalMs, duracao);
    const produtivoMs = duracao - paradaMs;
    if (produtivoMs <= 0) continue;

    const chave = String(c.maquina || '').trim() || 'Sem máquina';
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        maquina: chave, n: 0, totalPecas: 0, totalMs: 0,
        totalProdutivoMs: 0, totalParadaMs: 0, totalSetupMs: 0, paradasPorMotivo: new Map(),
        curtas: 0, ritmos: [], melhor: null, pior: null,
      });
    }
    const g = grupos.get(chave);
    const ritmo = (pecas * MS_POR_HORA) / produtivoMs;
    const peca = String(c.peca || '').trim() || null;

    g.n += 1;
    g.totalPecas += pecas;
    g.totalMs += duracao;
    g.totalProdutivoMs += produtivoMs;
    g.totalParadaMs += paradaMs;
    g.totalSetupMs += Math.min(par.setupMs, duracao);
    for (const m of par.porMotivo) g.paradasPorMotivo.set(m.motivo, (g.paradasPorMotivo.get(m.motivo) || 0) + m.ms);
    g.ritmos.push(ritmo);
    // Periodo curto se mede pelo tempo PRODUTIVO: meia hora de relogio com
    // 27 minutos de setup deixa 3 minutos de ritmo observado.
    if (produtivoMs < CRITERIOS_CONFERENCIA.minPeriodoMs) g.curtas += 1;
    if (!g.melhor || ritmo > g.melhor.ritmo) g.melhor = { ritmo, peca };
    if (!g.pior || ritmo < g.pior.ritmo) g.pior = { ritmo, peca };
  }

  const c = CRITERIOS_CONFERENCIA;
  return [...grupos.values()]
    .map((g) => {
      const motivos = [];
      if (g.n < c.minConferencias) {
        motivos.push(`${g.n} conferência(s) — mínimo de ${c.minConferencias} para servir de referência`);
      }
      if (g.totalProdutivoMs < c.minTempoTotalMs) {
        // Com parada marcada o texto diz de onde saiu a diferenca: senao o
        // analista ve "20 min" onde cronometrou 30 e acha que o app errou.
        motivos.push(g.totalParadaMs > 0
          ? `tempo produtivo de ${formatarDuracao(g.totalProdutivoMs)} (${formatarDuracao(g.totalMs)} observados, ${formatarDuracao(g.totalParadaMs)} parados) — mínimo de ${formatarDuracao(c.minTempoTotalMs)}`
          : `tempo total observado de ${formatarDuracao(g.totalMs)} — mínimo de ${formatarDuracao(c.minTempoTotalMs)}`);
      }
      if (g.curtas > 0) {
        motivos.push(`${g.curtas} conferência(s) com menos de ${formatarDuracao(c.minPeriodoMs)} de máquina rodando — período curto mede rajada, não ritmo`);
      }
      return {
        ...g,
        // Ponderado pelo tempo produtivo: soma de pecas sobre soma do tempo
        // em que a maquina de fato rodou.
        ritmoMedio: (g.totalPecas * MS_POR_HORA) / g.totalProdutivoMs,
        // Ritmo do relogio, paradas incluidas — o que saiu do posto por
        // hora de presenca. Sem parada marcada, igual ao ritmoMedio.
        ritmoBruto: (g.totalPecas * MS_POR_HORA) / g.totalMs,
        disponibilidadePct: (g.totalProdutivoMs / g.totalMs) * 100,
        cicloMedioMs: g.totalProdutivoMs / g.totalPecas,
        paradasPorMotivo: [...g.paradasPorMotivo.entries()]
          .map(([motivo, ms]) => ({ motivo, rotulo: rotuloMotivo(motivo), ms }))
          .sort((a, b) => b.ms - a.ms),
        // CV entre conferencias: referencia de estabilidade do posto.
        cvPct: g.ritmos.length >= 2 ? coeficienteVariacao(g.ritmos) : null,
        confiavel: motivos.length === 0,
        motivos,
      };
    })
    .sort((a, b) => b.n - a.n || a.maquina.localeCompare(b.maquina));
}

/**
 * Duracao entre dois horarios de relogio ("HH:MM"), em ms.
 *
 * E' assim que a conferencia acontece de verdade: o analista passa pela
 * maquina as 7:00, volta as 7:10 e le o contador — ninguem fica parado
 * segurando cronometro. Virada de meia-noite conta como dia seguinte
 * (23:50 -> 00:10 = 20 min), porque turno da noite tambem confere ritmo.
 * Horarios iguais ou invalidos devolvem 0 — campo ainda nao preenchido,
 * nao "24 horas".
 */
export function duracaoEntreHoras(horaInicial, horaFinal) {
  const minutos = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const inicio = minutos(horaInicial);
  const fim = minutos(horaFinal);
  if (inicio === null || fim === null) return 0;
  const diff = fim - inicio;
  if (diff === 0) return 0;
  return (diff > 0 ? diff : diff + 24 * 60) * 60000;
}

/** Formata duracao em ms como "10 min" / "1 h" / "2 h 30 min" — apresentacao. */
export function formatarDuracao(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  // Antes do arredondamento: 30s arredondaria para "1 min" e mentiria.
  if (ms < 60000) return '< 1 min';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (!h) return `${min} min`;
  return min ? `${h} h ${min} min` : `${h} h`;
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
