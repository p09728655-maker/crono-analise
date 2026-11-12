/**
 * PERDAS DA EMBALAGEM (v2.110.0) — onde a linha deixa de produzir, a partir
 * das medicoes do tablet e do video, e o que isso custa em horas na semana.
 *
 * Nenhuma regra nova de ritmo: cada medicao e' lida com as MESMAS contas do
 * volume a volume (leituraPecaAPeca), em tres camadas:
 *  - PERIODO: o relogio do 1o ao ultimo volume / (N-1), tudo dentro — o que
 *    sai de verdade;
 *  - NORMAL: o ritmo da linha quando roda, sem as paradas marcadas e sem as
 *    lacunas — a capacidade que ela provou;
 *  - SEM PRODUZIR = paradas marcadas (o relogio menos as marcas, que ja' vem
 *    sem elas) + lacunas (o excesso dos intervalos acima do dobro do normal:
 *    paradas que ninguem marcou).
 * relogio = (N-1) x normal + lacunas + paradas, exato.
 *
 * Tudo puro: recebe as medicoes como a API manda (snake_case, com
 * `marcas_ms` e `paradas`) e devolve numeros. A tela so' desenha.
 */
import { leituraPecaAPeca } from './crono/intervalos.js';

/** O motivo que nao diz o motivo: a tela aponta quanto da parada esta' nele. */
export const MOTIVO_SEM_DEFINICAO = 'outro';

/**
 * O nome do produto para juntar medicoes: sem o codigo na frente ("501134 ·
 * "), maiusculas e espacos unicos. Nome digitado diferente ("Rqck Flip")
 * continua separado — a tela diz para corrigir na lista, onde a correcao
 * vale para o resto do app tambem.
 */
export function chaveDoProduto(peca) {
  const nome = String(peca ?? '').trim().replace(/\s+/g, ' ').replace(/^\d+\s*·\s*/, '');
  return nome ? nome.toLocaleUpperCase('pt-BR') : 'PRODUTO NÃO INFORMADO';
}

const chaveMaquina = (m) => String(m ?? '').trim().toLocaleLowerCase('pt-BR');
const instante = (v) => (v ? new Date(v).getTime() : NaN);

/**
 * O trecho de tempo da medicao, para achar sobreposicao: do inicio ao fim
 * (ou inicio + duracao). Sem inicio, o salvo_em menos a duracao.
 */
function trecho(c) {
  const dur = Number(c.duracao_ms) || 0;
  let ini = instante(c.iniciado_em);
  let fim = instante(c.finalizado_em);
  if (!Number.isFinite(ini)) ini = instante(c.salvo_em) - dur;
  if (!Number.isFinite(fim)) fim = ini + dur;
  return { ini, fim };
}

/**
 * MEDICOES QUE SE SOBREPOEM na mesma maquina (o tablet e o video do mesmo
 * trecho, por exemplo) contariam o mesmo tempo duas vezes. Fica a de mais
 * volumes — cobre mais do trecho —, e a tela diz quantas sairam.
 */
export function semSobreposicao(medicoes) {
  const ordem = [...(medicoes || [])].sort((a, b) => (Number(b.pecas) || 0) - (Number(a.pecas) || 0));
  const mantidas = [];
  const descartadas = [];
  for (const c of ordem) {
    const t = trecho(c);
    const bate = mantidas.some((m) => chaveMaquina(m.maquina) === chaveMaquina(c.maquina)
      && Number.isFinite(t.ini) && t.ini < trecho(m).fim && trecho(m).ini < t.fim);
    (bate ? descartadas : mantidas).push(c);
  }
  return { mantidas, descartadas };
}

/**
 * AS TRES CAMADAS DE UMA MEDICAO, em ms. null sem pelo menos dois volumes
 * marcados (nao ha' intervalo). Com menos de 10 intervalos a leitura nao
 * separa lacuna (a mesma regra do volume a volume): o normal e' a media e
 * as lacunas ficam zero — `suficiente: false`.
 */
export function perdasDaMedicao(c) {
  const marcas = (Array.isArray(c?.marcas_ms) ? c.marcas_ms : []).map(Number).filter(Number.isFinite);
  if (marcas.length < 2) return null;
  const intervalos = marcas.length - 1;
  const somaMs = marcas[marcas.length - 1] - marcas[0];
  if (!(somaMs > 0)) return null;
  const rel = Number(c.marcas_relogio_ms);
  const relogioMs = rel > 0 ? Math.max(rel, somaMs) : somaMs;
  const leitura = leituraPecaAPeca({ marcasMs: marcas });
  const suficiente = Boolean(leitura?.suficiente);
  return {
    intervalos,
    volumes: Number(c.pecas) || marcas.length,
    relogioMs,
    paradasMs: relogioMs - somaMs,
    lacunasMs: suficiente ? leitura.excessoMs : 0,
    normalMs: suficiente ? leitura.normalMs : somaMs / intervalos,
    nLacunas: suficiente ? leitura.lacunas.length : 0,
    suficiente,
  };
}

/** Soma de medicoes lidas -> os numeros de um grupo (produto ou total). */
function somar(lidas) {
  const s = lidas.reduce((a, x) => ({
    medicoes: a.medicoes + 1,
    volumes: a.volumes + x.volumes,
    intervalos: a.intervalos + x.intervalos,
    relogioMs: a.relogioMs + x.relogioMs,
    paradasMs: a.paradasMs + x.paradasMs,
    lacunasMs: a.lacunasMs + x.lacunasMs,
    normalXint: a.normalXint + x.normalMs * x.intervalos,
    nLacunas: a.nLacunas + x.nLacunas,
    curtas: a.curtas + (x.suficiente ? 0 : 1),
  }), {
    medicoes: 0, volumes: 0, intervalos: 0, relogioMs: 0, paradasMs: 0, lacunasMs: 0, normalXint: 0, nLacunas: 0, curtas: 0,
  });
  const normalMs = s.intervalos > 0 ? s.normalXint / s.intervalos : null;
  const semProduzirMs = s.paradasMs + s.lacunasMs;
  return {
    medicoes: s.medicoes,
    volumes: s.volumes,
    horasMedidas: s.relogioMs / 3600000,
    // Ponderados pelo tempo (soma do relogio / soma dos intervalos), nunca
    // media de medias: a medicao de 2 h pesa mais que a de 5 min.
    periodoMs: s.intervalos > 0 ? s.relogioMs / s.intervalos : null,
    normalMs,
    paradasMs: s.paradasMs,
    lacunasMs: s.lacunasMs,
    nLacunas: s.nLacunas,
    semProduzirMs,
    perdaPct: s.relogioMs > 0 ? (100 * semProduzirMs) / s.relogioMs : null,
    // O que daria para ter saido no tempo parado, no ritmo que a propria
    // linha provou.
    volumesPerdidos: normalMs > 0 ? semProduzirMs / normalMs : null,
    curtas: s.curtas,
  };
}

/**
 * O RELATORIO: total, por produto (do que mais perdeu tempo ao que menos) e
 * as paradas marcadas por motivo.
 *
 * As paradas por motivo vem da lista de cada medicao — inclusive as
 * marcadas antes do 1o volume ou depois do ultimo, que ficam fora do
 * relogio do trecho: a soma delas pode passar um pouco das "paradas" do
 * total, e a tela diz isso.
 */
export function relatorioDePerdas(medicoes) {
  const { mantidas, descartadas } = semSobreposicao(medicoes);
  const lidas = [];
  let semMarcas = 0;
  for (const c of mantidas) {
    const p = perdasDaMedicao(c);
    if (p) lidas.push({ ...p, produto: chaveDoProduto(c.peca), medicao: c });
    else semMarcas += 1;
  }
  const porProdutoMapa = new Map();
  for (const x of lidas) {
    if (!porProdutoMapa.has(x.produto)) porProdutoMapa.set(x.produto, []);
    porProdutoMapa.get(x.produto).push(x);
  }
  const porProduto = [...porProdutoMapa.entries()]
    .map(([produto, xs]) => ({ produto, ...somar(xs) }))
    .sort((a, b) => b.semProduzirMs - a.semProduzirMs || a.produto.localeCompare(b.produto));

  const motivosMapa = new Map();
  for (const x of lidas) {
    for (const p of x.medicao.paradas || []) {
      const ms = Number(p?.duracaoMs ?? p?.duracao_ms) || 0;
      if (ms <= 0) continue;
      const codigo = String(p.motivo || MOTIVO_SEM_DEFINICAO);
      const m = motivosMapa.get(codigo) || { motivo: codigo, ms: 0, vezes: 0 };
      m.ms += ms;
      m.vezes += 1;
      motivosMapa.set(codigo, m);
    }
  }
  const totalMotivosMs = [...motivosMapa.values()].reduce((a, m) => a + m.ms, 0);
  const porMotivo = [...motivosMapa.values()]
    .map((m) => ({ ...m, pct: totalMotivosMs > 0 ? (100 * m.ms) / totalMotivosMs : 0 }))
    .sort((a, b) => b.ms - a.ms);

  return {
    total: lidas.length ? somar(lidas) : null,
    porProduto,
    porMotivo,
    totalMotivosMs,
    semDefinicaoPct: totalMotivosMs > 0 ? (100 * (motivosMapa.get(MOTIVO_SEM_DEFINICAO)?.ms || 0)) / totalMotivosMs : 0,
    sobrepostas: descartadas.length,
    semMarcas,
  };
}

/**
 * A HORA EXTRA DA SEMANA, ESTIMADA: o programa da semana feito no ritmo do
 * PERIODO medido contra as horas que a linha tem (jornada menos o setup
 * planejado — as mesmas do takt), e o mesmo programa no ritmo NORMAL. A
 * diferenca entre os dois e' o que as paradas e as lacunas custam.
 *
 * E' estimativa: o ritmo medido e' o das medicoes, com o mix de produtos
 * delas, que nao e' o mix da semana. null sem programa ou sem horas.
 *
 * @param demanda volumes programados na semana
 * @param horasPorMaquina horas produtivas de cada maquina (taktDaMedicao)
 * @param maquinas maquinas ativas que dividem o programa
 */
export function horaExtraDaSemana({
  demanda, horasPorMaquina, maquinas = 1, periodoMs, normalMs,
} = {}) {
  const d = Number(demanda);
  const h = Number(horasPorMaquina);
  const n = Math.max(1, Number(maquinas) || 1);
  if (!(d > 0) || !(h > 0) || !(periodoMs > 0) || !(normalMs > 0)) return null;
  const precisaPeriodo = (d * periodoMs) / n / 3600000;
  const precisaNormal = (d * normalMs) / n / 3600000;
  return {
    demanda: d,
    horasDisponiveis: h,
    precisaPeriodo,
    precisaNormal,
    horaExtra: Math.max(0, precisaPeriodo - h),
    horaExtraSemPerdas: Math.max(0, precisaNormal - h),
    custoDasPerdas: precisaPeriodo - precisaNormal,
  };
}
