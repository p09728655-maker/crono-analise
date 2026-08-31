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

/**
 * Motivos de parada de FABRICA — o ponto de partida.
 *
 * Esta lista deixou de ser a verdade e virou o padrao: a fabrica cadastra a
 * dela em Ferramentas > Motivos de parada, e o app passa a usar aquela. Os
 * nove daqui continuam existindo por dois motivos concretos:
 *
 *  - Enquanto nada foi cadastrado (instalacao nova) e sempre que o tablet
 *    esta' sem rede e sem cache, a coleta precisa de algo para oferecer.
 *  - Parada gravada com um codigo que depois saiu do cadastro ainda precisa
 *    de nome no relatorio. Codigo daqui sempre resolve.
 */
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

/**
 * Periodo conferido, como "10:16–10:36".
 *
 * Le os INSTANTES (iniciado_em/finalizado_em). O texto "HH:MM" das colunas
 * antigas segue como ultimo recurso: elas ja' foram derrubadas do banco, mas
 * um servidor REVERTIDO para antes da migracao voltaria a devolver so' o
 * texto — e ai' a tela mostraria um travessao no lugar do periodo, que e'
 * pior do que a hora sem o dia.
 *
 * A hora sai no fuso do computador que esta' olhando, que e' o da fabrica.
 */
export function faixaHoraria(conferencia) {
  const c = conferencia || {};
  if (c.iniciado_em && c.finalizado_em) {
    const hm = (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${hm(c.iniciado_em)}–${hm(c.finalizado_em)}`;
  }
  if (c.hora_inicial && c.hora_final) return `${c.hora_inicial}–${c.hora_final}`;
  return null;
}

/**
 * Catalogo em vigor.
 *
 * Comeca nos motivos de fabrica e e' trocado por src/lib/motivosParada.js
 * assim que o cadastro da empresa chega (do cache do aparelho ou do
 * servidor). Mora aqui, e nao no React, porque quem precisa do nome de um
 * motivo e' o CALCULO — resumirParadas, sugerirMelhorias, o relatorio
 * impresso — e nenhum deles recebe props.
 */
let catalogo = MOTIVOS_PARADA;

/** Troca o catalogo em vigor. Lista vazia volta para os motivos de fabrica. */
export function definirCatalogoParadas(motivos) {
  catalogo = Array.isArray(motivos) && motivos.length ? motivos : MOTIVOS_PARADA;
}

/**
 * Procura primeiro no cadastro da empresa, depois nos motivos de fabrica.
 *
 * A segunda busca e' o que impede parada antiga de virar codigo cru na tela
 * quando um motivo padrao e' removido do cadastro.
 */
function acharMotivo(valor) {
  const casa = (m) => m.codigo === valor || m.rotulo === valor;
  return catalogo.find(casa) || MOTIVOS_PARADA.find(casa) || null;
}

/**
 * Rotulo legivel de um motivo de parada. Codigo desconhecido volta como veio.
 *
 * Aceita tambem o proprio rotulo: a coleta de ciclos gravou o texto ("Setup
 * / Troca") antes de passar a gravar o codigo, e parada velha no banco nao
 * pode virar "Parada" generica so' porque a convencao mudou.
 */
export function rotuloMotivo(codigo) {
  const achado = acharMotivo(codigo);
  return achado ? achado.rotulo : String(codigo || 'Parada');
}

/** A acao que o motivo pede. Sai no relatorio: motivo sem acao nao vira melhoria. */
export function acaoDoMotivo(codigo) {
  const achado = acharMotivo(codigo);
  return achado?.acao || 'Detalhar na observação para permitir classificação posterior.';
}

/** Codigo canonico do motivo — aceita codigo ou rotulo (dado antigo). */
function codigoMotivo(valor) {
  const achado = acharMotivo(valor);
  return achado ? achado.codigo : String(valor || 'outro');
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

  let n = 0;

  for (const p of paradas || []) {
    // Tres nomes para o mesmo campo: conferencia (duracaoMs), banco
    // (duracao_ms) e o payload do estudo (duracao).
    const ms = Math.max(0, Number(p?.duracaoMs ?? p?.duracao_ms ?? p?.duracao) || 0);
    if (ms <= 0) continue;
    const motivo = codigoMotivo(p?.motivo);
    totalMs += ms;
    n += 1;
    if (motivo === 'setup') setupMs += ms;
    const atual = porMotivo.get(motivo) || { ms: 0, n: 0 };
    porMotivo.set(motivo, { ms: atual.ms + ms, n: atual.n + 1 });
  }

  return {
    totalMs,
    setupMs,
    outrasMs: totalMs - setupMs,
    n,
    // Maior perda primeiro: a lista ja' sai em ordem de Pareto.
    porMotivo: [...porMotivo.entries()]
      .map(([motivo, v]) => ({
        motivo,
        rotulo: rotuloMotivo(motivo),
        acao: acaoDoMotivo(motivo),
        ms: v.ms,
        n: v.n,
        pct: totalMs > 0 ? (v.ms / totalMs) * 100 : 0,
      }))
      .sort((a, b) => b.ms - a.ms),
  };
}

/**
 * Paradas do ESTUDO inteiro — o que a tela de analise e o papel mostram.
 *
 * A coleta ciclo a ciclo ja' registrava a parada (botao Parada, com motivo)
 * e ja' a descontava do ciclo, para nao inflar o TO. Mas o registro morria
 * no banco: nenhuma tela mostrava. Perda medida que ninguem le nao vira
 * melhoria — e' so' trabalho jogado fora.
 *
 * O denominador do percentual e' o tempo com o CRONOMETRO NA MAO (ciclos
 * validos + paradas), nao o turno: o estudo nao observou o turno inteiro, e
 * dizer "12% do turno" a partir de 25 ciclos seria inventar base.
 */
export function resumirParadasDoEstudo(operacoes) {
  const todas = [];
  const porOperacao = [];
  let cronometradoMs = 0;

  for (const op of operacoes || []) {
    const soma = somarParadas(op?.paradas);
    const tempos = temposValidos(op?.tempos);
    cronometradoMs += tempos.reduce((acc, t) => acc + t, 0);
    if (op?.paradas?.length) todas.push(...op.paradas);
    if (soma.totalMs > 0) {
      porOperacao.push({ id: op.id, nome: op.nome, ms: soma.totalMs, n: soma.n });
    }
  }

  const geral = somarParadas(todas);
  const base = geral.totalMs + cronometradoMs;

  return {
    totalMs: geral.totalMs,
    setupMs: geral.setupMs,
    n: geral.n,
    cronometradoMs,
    pctDoObservado: base > 0 ? (geral.totalMs / base) * 100 : 0,
    porMotivo: geral.porMotivo,
    porOperacao: porOperacao.sort((a, b) => b.ms - a.ms),
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
export function conferenciaRapida({ duracaoMs, pecas, paradas, ciclosPorPeca }) {
  const dur = Number(duracaoMs) || 0;
  if (dur <= 0) return null;

  // Ciclos de FURACAO por peca: quantas vezes o motor e' acionado para
  // furar UMA peca. Lateral simples fura num ciclo; ha' pecas em que o
  // motor sobe e desce (2 ciclos) ou chega a 3. Mesmo conceito do
  // ciclosPorPeca do estudo — e mesmo fallback: nao informado, e' 1.
  const ciclos = Math.max(1, Math.floor(Number(ciclosPorPeca) || 1));

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
    ciclosPorPeca: ciclos,
    // Tempo de UM acionamento do motor. E' o numero comparavel entre pecas:
    // a peca de 2 ciclos leva o dobro do tempo sem a furadeira estar lenta.
    cicloMotorMs: qtd > 0 ? produtivoMs / (qtd * ciclos) : null,
  };
}

/**
 * O COMPARATIVO: o que saiu x o que teria saido no MESMO TEMPO.
 *
 * Minuto parado e' abstrato; peca que deixou de sair, nao. O relatorio ja'
 * dizia quanto tempo a maquina ficou parada e a que ritmo ela roda — mas
 * quem le' precisava fazer a conta de cabeca para saber o que aquilo custou
 * em PECA. Este e' o numero que muda conversa de reuniao: "no mesmo
 * periodo, sem essa parada, teriam saido 790 em vez de 619".
 *
 * A conta e' direta e sem projecao nenhuma: o ritmo que a propria maquina
 * provou COM ELA RODANDO, aplicado ao periodo INTEIRO que foi observado.
 * Nao e' meta, nao e' capacidade teorica de catalogo, nao supoe turno nem
 * ganho de processo — e' o que o posto ja' fez, sem a parada no meio.
 *
 * Devolve null quando nao ha' o que comparar: sem periodo, sem tempo
 * rodando, ou sem parada nenhuma (ai o que saiu JA' e' o potencial).
 */
export function potencialSemParada({ pecas, duracaoMs, produtivoMs }) {
  const dur = Number(duracaoMs) || 0;
  const rodando = Number(produtivoMs) || 0;
  const saiu = Math.max(0, Math.floor(Number(pecas) || 0));
  if (dur <= 0 || rodando <= 0 || rodando >= dur || saiu <= 0) return null;

  const ritmoRodando = (saiu * MS_POR_HORA) / rodando;
  const ritmoPeriodo = (saiu * MS_POR_HORA) / dur;
  // O potencial e' o ritmo de maquina rodando esticado para o periodo todo.
  const potencial = Math.round((ritmoRodando * dur) / MS_POR_HORA);
  const perdidas = Math.max(0, potencial - saiu);

  return {
    pecas: saiu,
    potencial,
    perdidas,
    paradaMs: dur - rodando,
    duracaoMs: dur,
    produtivoMs: rodando,
    ritmoPeriodo,
    // O ritmo do potencial E' o de maquina rodando: mesma conta, outra
    // pergunta. Fica com nome proprio para a tela nao precisar saber disso.
    ritmoPotencial: ritmoRodando,
    // Quanto a producao do periodo cresceria — a leitura de ganho.
    ganhoPct: saiu > 0 ? (perdidas / saiu) * 100 : 0,
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
/**
 * Chave de agrupamento de um NOME DIGITADO no chao de fabrica.
 *
 * Maquina e peca sao texto livre no celular, e o mesmo nome sai digitado
 * de tres jeitos: "Princesa Fundo", "princesa fundo ", "princesa  fundo".
 * Agrupar pelo texto exato dividia a mesma peca em linhas que nao somam —
 * o analista fazia 3 medicoes e o quadro creditava 1+2 (caso real de
 * 28/08). A chave ignora caixa, acento e espaco repetido; o NOME EXIBIDO
 * continua como foi digitado (o primeiro visto no grupo).
 */
export function nomeChave(nome) {
  return String(nome || '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function resumirConferencias(conferencias, { porPeca = false } = {}) {
  /**
   * `porPeca` agrupa por PECA x MAQUINA em vez de so' por maquina — e' o
   * "Referencia por peca" do relatorio. A conta e o criterio sao os mesmos;
   * o que muda e' a pergunta: a maquina responde "quanto este posto rende",
   * a peca responde "quanto ESTA peca rende NESTE posto" — que e' o numero
   * que dimensiona carga e lote. Conferencia sem nome de peca fica de fora
   * deste agrupamento: sem nome nao ha' o que referenciar.
   */
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

    const nomeMaquina = String(c.maquina || '').trim() || 'Sem máquina';
    const nomePeca = String(c.peca || '').trim();
    if (porPeca && !nomePeca) continue;
    // Agrupa pela chave NORMALIZADA (ver nomeChave); \u0000 nao aparece em
    // nome digitado e separa maquina de peca sem risco.
    const chave = porPeca ? `${nomeChave(nomeMaquina)}\u0000${nomeChave(nomePeca)}` : nomeChave(nomeMaquina);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        maquina: nomeMaquina, ...(porPeca ? { peca: nomePeca } : {}),
        n: 0, totalPecas: 0, totalAcionamentos: 0, totalMs: 0,
        totalProdutivoMs: 0, totalParadaMs: 0, totalSetupMs: 0, paradasPorMotivo: new Map(),
        curtas: 0, ritmos: [], melhor: null, pior: null,
      });
    }
    const g = grupos.get(chave);
    const ritmo = (pecas * MS_POR_HORA) / produtivoMs;
    const peca = String(c.peca || '').trim() || null;
    // Ciclos de furacao da peca conferida (1 se a conferencia e' antiga e
    // nao trouxe o dado). Somados viram ACIONAMENTOS do motor: e' por eles
    // que pecas de furacao diferente ficam comparaveis na mesma maquina.
    const ciclos = Math.max(1, Math.floor(Number(c.ciclosPorPeca ?? c.ciclos_por_peca) || 1));

    g.n += 1;
    g.totalPecas += pecas;
    g.totalAcionamentos += pecas * ciclos;
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
        // Tempo de um acionamento do motor, ponderado como o ritmo. So'
        // difere do ciclo medio quando alguma peca fura em mais de um ciclo.
        cicloMotorMs: g.totalProdutivoMs / g.totalAcionamentos,
        paradasPorMotivo: [...g.paradasPorMotivo.entries()]
          .map(([motivo, ms]) => ({ motivo, rotulo: rotuloMotivo(motivo), ms }))
          .sort((a, b) => b.ms - a.ms),
        // CV entre conferencias: referencia de estabilidade do posto.
        cvPct: g.ritmos.length >= 2 ? coeficienteVariacao(g.ritmos) : null,
        // A regua do CV, em palavras — a mesma do estudo de ciclos. O numero
        // cru ("17,3%") obrigava o leitor a saber a tabela de cabeca.
        estabilidade: g.ritmos.length >= 2 ? classificarEstabilidade(coeficienteVariacao(g.ritmos)) : null,
        confiavel: motivos.length === 0,
        motivos,
      };
    })
    .sort((a, b) => (porPeca
      ? (a.peca.localeCompare(b.peca) || a.maquina.localeCompare(b.maquina))
      : (b.n - a.n || a.maquina.localeCompare(b.maquina))));
}

/**
 * O FUSO DA FABRICA.
 *
 * O servidor compoe `iniciado_em` com America/Sao_Paulo fixo (api/sync.js) —
 * "07:00" e' 07:00 no chao de fabrica. Se a leitura usasse o fuso do
 * navegador, o mesmo dado viraria 10h num PC em UTC e o relatorio apontaria
 * uma hora que nao existe no turno. Escrita e leitura tem de usar o mesmo
 * relogio, e o relogio e' o da fabrica.
 */
const FUSO_FABRICA = 'America/Sao_Paulo';

const horaDaFabrica = (() => {
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_FABRICA, hour: '2-digit', hour12: false });
  } catch { fmt = null; }
  return (data) => {
    // Ambiente sem base de fusos (raro, mas existe): cai no relogio local —
    // pior que o certo, melhor que quebrar o relatorio.
    if (!fmt) return data.getHours();
    const h = Number(fmt.format(data));
    return Number.isFinite(h) ? h % 24 : data.getHours();
  };
})();

/**
 * O COMPARATIVO DE UM CONJUNTO de maquinas — soma o de CADA UMA.
 *
 * Nao da' para aplicar o ritmo do conjunto ao tempo parado do conjunto: o
 * ritmo medio e' puxado por quem rodou bem, e o tempo parado e' de quem
 * parou. Somar antes de dividir credita a maquina lenta o ritmo da rapida.
 *
 * Exemplo real (auditoria de 31/08): furadeira com 1000 pc em 1 h sem
 * parada, serra com 100 pc em 1 h com 30 min parados. Pelo conjunto, o
 * quadro dizia "deixaram de sair 367 pecas"; maquina a maquina, a perda e'
 * 100 — as 267 de diferenca sao producao que a serra nunca faria, creditada
 * a ela pelo ritmo da furadeira. Erro de 3,7 vezes num numero que vai para
 * reuniao.
 *
 * Entao: uma conta por maquina, e a soma delas. Com uma maquina so', o
 * resultado e' identico ao de potencialSemParada — e' a mesma conta.
 *
 * Recebe o resumo por maquina (resumirConferencias) e devolve null quando
 * nao ha' perda a mostrar: sem parada, o que saiu JA' e' o potencial.
 */
export function comparativoDeParadas(maquinas) {
  let pecas = 0;
  let potencial = 0;
  let duracaoMs = 0;
  let produtivoMs = 0;

  for (const g of maquinas || []) {
    const totalPecas = Number(g?.totalPecas) || 0;
    const totalMs = Number(g?.totalMs) || 0;
    const totalProdutivoMs = Number(g?.totalProdutivoMs) || 0;
    if (totalMs <= 0 || totalPecas <= 0) continue;

    const c = potencialSemParada({
      pecas: totalPecas, duracaoMs: totalMs, produtivoMs: totalProdutivoMs,
    });
    pecas += totalPecas;
    duracaoMs += totalMs;
    produtivoMs += totalProdutivoMs;
    // Maquina sem parada nao tem potencial extra: ela ja' entregou o dela.
    potencial += c ? c.potencial : totalPecas;
  }

  const perdidas = potencial - pecas;
  // Sem perda nao ha' comparativo: um quadro em destaque dizendo "deixou de
  // sair 0 peças" e' ruido com cara de alerta.
  if (duracaoMs <= 0 || pecas <= 0 || perdidas <= 0) return null;

  return {
    pecas,
    potencial,
    perdidas,
    duracaoMs,
    produtivoMs,
    paradaMs: duracaoMs - produtivoMs,
    ritmoPeriodo: (pecas * MS_POR_HORA) / duracaoMs,
    // O ritmo do potencial sai do POTENCIAL somado, nao do ritmo do
    // conjunto: assim o numero grande e o ritmo ao lado contam a mesma
    // historia, com uma maquina ou com dez.
    ritmoPotencial: (potencial * MS_POR_HORA) / duracaoMs,
    ganhoPct: (perdidas / pecas) * 100,
    maquinas: (maquinas || []).length,
  };
}

/**
 * A CURVA DO DIA — ritmo por hora do relogio.
 *
 * O relatorio sabia dizer quanto um posto rende, mas nao QUANDO ele rende.
 * E' na hora do dia que aparece o que a media esconde: a queda depois do
 * almoco, o fim de turno mais lento, a hora em que a troca sempre cai.
 *
 * Junta as medicoes feitas na MESMA hora do relogio, de qualquer data —
 * com um turno so', isso e' a curva do turno. Duas medicoes das 7h de dias
 * diferentes somam; e' o unico jeito de a curva existir com o volume de
 * medicao que uma fabrica realmente faz.
 *
 * A medicao entra na hora em que COMECOU. Ratear uma medicao que atravessa
 * a hora daria uma precisao que o dado nao tem — o contador e' lido no fim
 * do periodo, entao nem se sabe quantas pecas sairam em cada metade.
 *
 * A hora e' a da FABRICA (ver FUSO_FABRICA), nao a do navegador: o mesmo
 * dado precisa cair na mesma hora num PC do escritorio, num tablet e numa
 * maquina virtual em UTC.
 *
 * Mesma ponderacao do resto do relatorio: soma de pecas sobre soma do tempo
 * rodando, nunca media de taxas.
 */
export function ritmoPorHoraDoDia(conferencias) {
  const horas = new Map();

  for (const c of conferencias || []) {
    const calc = conferenciaRapida({
      duracaoMs: Number(c.duracaoMs ?? c.duracao_ms),
      pecas: c.pecas,
      paradas: c.paradas,
      ciclosPorPeca: c.ciclosPorPeca ?? c.ciclos_por_peca,
    });
    if (!calc) continue;

    /**
     * Sem `iniciado_em` (medicao antiga, do tempo em que so' havia
     * horario em texto), o inicio se DEDUZ: salvo_em e' o FIM do periodo,
     * entao o comeco e' ele menos a duracao. Usar salvo_em direto jogaria
     * uma medicao das 17h no balde das 18h — e a curva mandaria investigar
     * uma hora que nao foi medida.
     */
    const marcado = c.iniciadoEm ?? c.iniciado_em;
    const fim = c.salvoEm ?? c.salvo_em;
    const inicio = marcado
      ? new Date(marcado)
      : new Date(new Date(fim ?? NaN).getTime() - calc.duracaoMs);
    if (Number.isNaN(inicio.getTime())) continue;

    const hora = horaDaFabrica(inicio);
    if (!horas.has(hora)) horas.set(hora, { hora, n: 0, pecas: 0, produtivoMs: 0, totalMs: 0 });
    const g = horas.get(hora);
    g.n += 1;
    g.pecas += calc.pecas;
    g.produtivoMs += calc.produtivoMs;
    g.totalMs += calc.duracaoMs;
  }

  return [...horas.values()]
    .filter((g) => g.produtivoMs > 0 && g.pecas > 0)
    .map((g) => ({
      ...g,
      chave: `h${g.hora}`,
      rotulo: `${String(g.hora).padStart(2, '0')}h`,
      ritmoMedio: (g.pecas * MS_POR_HORA) / g.produtivoMs,
      // Mesmo criterio que ja' marca medicao curta no resto do relatorio:
      // uma hora com 4 min medidos nao descreve hora nenhuma.
      confiavel: g.produtivoMs >= CRITERIOS_CONFERENCIA.minPeriodoMs,
    }))
    .sort((a, b) => a.hora - b.hora);
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

/**
 * O QUE PODE ENTRAR NUM CAMPO DECIMAL DIGITADO.
 *
 * `<input type="number">` parece a escolha obvia e e' uma armadilha aqui: o
 * teclado numerico brasileiro entrega VIRGULA, e o navegador simplesmente
 * descarta o caractere que nao pertence ao formato dele. O analista digita
 * "1,25" no campo de minutos de parada e fica gravado 125 — cem vezes o
 * valor, sem aviso nenhum. Em periodo curto o resultado quebra e alguem
 * percebe; em periodo de 4 h passa liso (auditoria de 31/08).
 *
 * Entao o campo e' de TEXTO, com inputMode decimal (o teclado continua o
 * numerico), e o que se digita passa por aqui: sobram digitos e UM separador,
 * virgula ou ponto. A conversao para numero continua sendo de quem calcula.
 */
export function textoDecimal(valor) {
  const so = String(valor ?? '').replace(/[^\d.,]/g, '');
  // Segundo separador em diante nao entra: "1,2,5" nao e' numero nenhum.
  const i = so.search(/[.,]/);
  if (i === -1) return so;
  return so.slice(0, i + 1) + so.slice(i + 1).replace(/[.,]/g, '');
}

/** Numero a partir do que foi digitado num campo decimal (aceita virgula). */
export function numeroDecimal(valor) {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
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
