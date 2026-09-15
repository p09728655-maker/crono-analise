/**
 * O POSTO AO LONGO DO DIA e o conjunto de maquinas.
 *
 * Duas leituras que so' fazem sentido sobre VARIAS conferencias: onde o
 * ritmo cai no relogio do turno, e o que as paradas custam quando se
 * somam as maquinas de um grupo.
 *
 * A soma e' de CADA UMA, nunca do conjunto: aplicar o ritmo do conjunto
 * ao tempo parado do conjunto mistura postos de ritmos diferentes e
 * produz um ganho que nao existe em maquina nenhuma.
 */
import { MS_POR_HORA } from '../estatistica.js';
import { CRITERIOS_CONFERENCIA, conferenciaRapida, potencialSemParada } from './conferencia.js';

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
