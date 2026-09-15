/**
 * A CONFERENCIA DE RITMO — a medicao do posto, e o resumo de varias.
 *
 * Aqui mora a diferenca que sustenta todo o relatorio: o ritmo de RELOGIO
 * (pecas por hora de presenca, com as paradas dentro) e o ritmo RODANDO
 * (so' o tempo produtivo). O primeiro e' o que enche o caminhao; o segundo
 * e' o "se nao parasse", e a distancia entre os dois e' exatamente o que
 * ha' a ganhar tratando parada.
 *
 * O ritmo medio de um conjunto e' PONDERADO pelo tempo, nunca a media das
 * taxas: uma conferencia de 2 h vale mais que uma de 5 min, e a media
 * simples deixaria a medicao curta distorcer o numero que vai sustentar
 * decisao de capacidade.
 */
import {
  MS_POR_HORA, classificarEstabilidade, coeficienteVariacao,
} from '../estatistica.js';
import { rotuloMotivo, somarParadas } from './paradas.js';
import { formatarDuracao } from './formato.js';

/**
 * Conferencia rapida: ritmo observado num periodo, sem estudo cadastrado.
 *
 * O analista passa pelo posto, cronometra um intervalo (ex: 7:00 as 7:10)
 * e informa quantas pecas sairam (150). Nao ha' FR, tolerancia nem amostra
 * por ciclo — e' uma medicao de vazao, nao um estudo de tempos. Por isso o
 * resultado fala em pecas/hora e ciclo MEDIO, nunca em TO/TN/TP.
 */
export function conferenciaRapida({ duracaoMs, pecas, paradas, ciclosPorPeca, furacaoPassante }) {
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
    // Furacao passante atravessa a peca inteira: mesmo numero de
    // acionamentos, mais tempo em cada um. Passa adiante como dado da peca
    // — quem compara e' o relatorio, por classe de ciclo.
    furacaoPassante: Boolean(furacaoPassante),
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
        // Quais valores de ciclo por peca apareceram nas medicoes deste
        // grupo. E' o que permite dizer "esta peca e' de 1 ciclo" — e
        // detectar a peca gravada ora com 1, ora com 2 (erro de coleta ou
        // peca que mudou), em que a media de acionamentos mentiria.
        ciclosVistos: new Set(),
        // Mesma ideia para a furacao passante: a peca e' de um jeito so'.
        passanteVistos: new Set(),
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
    g.ciclosVistos.add(ciclos);
    g.passanteVistos.add(Boolean(c.furacaoPassante ?? c.furacao_passante));
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
        /**
         * O CICLO DA PECA — quantos acionamentos do motor ela pede.
         *
         * So' existe quando todas as medicoes do grupo concordam. Peca
         * gravada ora com 1 ciclo, ora com 2, devolve null e `ciclosMistos`:
         * a media daria 1,5 acionamento, que nao e' nada — e a leitura por
         * classe de ciclo precisa saber que ali ha' dado a corrigir, nao uma
         * peca de 1,5 ciclo.
         */
        ciclosPorPeca: g.ciclosVistos.size === 1 ? [...g.ciclosVistos][0] : null,
        ciclosMistos: g.ciclosVistos.size > 1,
        ciclosVistos: [...g.ciclosVistos].sort((a, b) => a - b),
        /**
         * A FURACAO da peca: passante ou nao. Mesma regra dos ciclos — so'
         * existe quando as medicoes concordam; gravada ora como passante,
         * ora como nao, devolve null e `passanteMista`, e a peca fica fora
         * da classe ate' alguem corrigir.
         */
        furacaoPassante: g.passanteVistos.size === 1 ? [...g.passanteVistos][0] : null,
        passanteMista: g.passanteVistos.size > 1,
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
