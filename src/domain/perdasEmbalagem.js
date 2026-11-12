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
 *  - SEM PRODUZIR = paradas marcadas no cronometro (o relogio menos as
 *    marcas, que ja' vem sem elas) + lacunas (o excesso dos intervalos acima
 *    do dobro do normal: paradas que o cronometro nao tirou).
 * relogio = (N-1) x normal + lacunas + paradas, exato.
 *
 * Duas regras da revisao da v2.110.0 (acertadas na v2.110.2):
 *  - o SETUP PLANEJADO marcado no trecho sai do relogio quando quem chama
 *    diz que ele ja' saiu das horas da linha (`descontarSetup`) — contado
 *    de novo inventava hora extra. Sai do quadro dos motivos o MESMO tempo
 *    (nao toda parada "setup" da lista): fora da conta e' fora de tudo, e
 *    so' isso;
 *  - a PARADA ANOTADA DEPOIS (no resultado do tablet ou no PC) nao tirou
 *    nada das marcas: o tempo dela FICA NA LACUNA, como no volume a volume
 *    (deixouDeEmbalar), e o motivo dela aparece no quadro dos motivos. A
 *    lista nao tem horario: nao se sabe se a anotada caiu no trecho ou
 *    antes do 1o volume. As v2.110.1 a 2.110.3 tentaram separar pela soma
 *    da lista, e cada regra escondia lacuna sem marca em algum caso real (a
 *    troca do comeco anotada depois, a anotada junto de uma lacuna curta).
 *    O total sem produzir e a hora extra nunca dependeram disso.
 *
 * Tudo puro: recebe as medicoes como a API manda (snake_case, com
 * `marcas_ms` e `paradas`) e devolve numeros. A tela so' desenha.
 */
import { leituraPecaAPeca } from './crono/intervalos.js';
import { nomeChave } from './crono/conferencia.js';
import { taktDaMedicao } from './demandaSemanal.js';
import { horasDeSetup } from './demanda/capacidade.js';

/** O motivo que nao diz o motivo: a tela aponta quanto da parada esta' nele. */
export const MOTIVO_SEM_DEFINICAO = 'outro';
/** O motivo do setup / troca (o mesmo que o cronometro separa em marcas_setup_ms). */
const MOTIVO_SETUP = 'setup';
const duracaoDa = (p) => Number(p?.duracaoMs ?? p?.duracao_ms) || 0;
/**
 * Folga do arredondamento da lista: cada parada ao vivo e' gravada em
 * minutos com 2 casas (ate' 0,3 s de diferenca). A mesma do volume a volume
 * (frasesDasParadas).
 */
const folgaDaLista = (n) => Math.max(1000, 300 * n);

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

// A maquina pela MESMA chave da API e do resto do app: sem acento, sem
// diferenca de maiuscula, espacos juntados (revisao da v2.110.1).
const chaveMaquina = nomeChave;
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
export function perdasDaMedicao(c, { descontarSetup = false } = {}) {
  const marcas = (Array.isArray(c?.marcas_ms) ? c.marcas_ms : []).map(Number).filter(Number.isFinite);
  if (marcas.length < 2) return null;
  const intervalos = marcas.length - 1;
  const somaMs = marcas[marcas.length - 1] - marcas[0];
  if (!(somaMs > 0)) return null;
  const rel = Number(c.marcas_relogio_ms);
  const relogioBrutoMs = rel > 0 ? Math.max(rel, somaMs) : somaMs;
  // O que o cronometro tirou das marcas entre o 1o e o ultimo volume.
  const noTrechoMs = relogioBrutoMs - somaMs;
  const setupMs = descontarSetup ? Math.min(Math.max(0, Number(c.marcas_setup_ms) || 0), noTrechoMs) : 0;
  const leitura = leituraPecaAPeca({ marcasMs: marcas });
  const suficiente = Boolean(leitura?.suficiente);
  const lacunasBrutasMs = suficiente ? leitura.excessoMs : 0;
  const normalMs = suficiente ? leitura.normalMs : somaMs / intervalos;
  return {
    intervalos,
    volumes: Number(c.pecas) || marcas.length,
    relogioMs: relogioBrutoMs - setupMs,
    setupMs,
    paradasMs: noTrechoMs - setupMs,
    lacunasMs: lacunasBrutasMs,
    normalMs,
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
    setupMs: a.setupMs + x.setupMs,
  }), {
    medicoes: 0, volumes: 0, intervalos: 0, relogioMs: 0, paradasMs: 0, lacunasMs: 0, normalXint: 0, nLacunas: 0, curtas: 0,
    setupMs: 0,
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
    // O setup planejado tirado do trecho (fora da conta): a tela o diz.
    setupMs: s.setupMs,
  };
}

/**
 * O RELATORIO: total, por produto (do que mais perdeu tempo ao que menos) e
 * as paradas marcadas por motivo.
 *
 * As paradas por motivo vem da lista de cada medicao — inclusive as
 * marcadas antes do 1o volume ou depois do ultimo, que ficam fora do
 * relogio do trecho: a soma delas pode passar um pouco das "paradas" do
 * total, e a tela diz isso. Na medicao com o setup fora da conta, o MESMO
 * setup que saiu do relogio (o marcado ao vivo entre os volumes) sai daqui
 * tambem — `setupForaMs` diz quanto. O setup antes do 1o volume ou anotado
 * depois fica no quadro: nao saiu da conta.
 */
export function relatorioDePerdas(medicoes, { descontarSetupDe = () => false } = {}) {
  // SEM MARCAS SAI ANTES da sobreposicao: a medicao por horarios (ou com a
  // contagem corrigida a' mao) ganhava a disputa pelos volumes e depois era
  // descartada — e a medicao boa sumia junto (revisao da v2.110.0).
  const comMarcas = [];
  let semMarcas = 0;
  for (const c of medicoes || []) {
    if (perdasDaMedicao(c)) comMarcas.push(c);
    else semMarcas += 1;
  }
  const { mantidas, descartadas } = semSobreposicao(comMarcas);
  const lidas = mantidas.map((c) => {
    const descontouSetup = Boolean(descontarSetupDe(c));
    return {
      ...perdasDaMedicao(c, { descontarSetup: descontouSetup }),
      descontouSetup,
      produto: chaveDoProduto(c.peca),
      medicao: c,
    };
  });
  const porProdutoMapa = new Map();
  for (const x of lidas) {
    if (!porProdutoMapa.has(x.produto)) porProdutoMapa.set(x.produto, []);
    porProdutoMapa.get(x.produto).push(x);
  }
  const porProduto = [...porProdutoMapa.entries()]
    .map(([produto, xs]) => ({ produto, ...somar(xs) }))
    .sort((a, b) => b.semProduzirMs - a.semProduzirMs || a.produto.localeCompare(b.produto));

  const motivosMapa = new Map();
  let setupForaMs = 0;
  for (const x of lidas) {
    const lista = x.medicao.paradas || [];
    // O setup que saiu do relogio sai do quadro abatido das paradas "setup"
    // da medicao, a de duracao mais proxima primeiro: a lista nao diz o
    // horario, e a troca que caiu no trecho e' a que tem o tamanho dele (a de
    // 20 min antes do 1o volume nao vira "2×").
    const abate = new Map();
    let setupATirar = x.setupMs;
    const setups = lista.filter((p) => String(p?.motivo) === MOTIVO_SETUP && duracaoDa(p) > 0)
      .sort((a, b) => Math.abs(duracaoDa(a) - setupATirar) - Math.abs(duracaoDa(b) - setupATirar));
    for (const p of setups) {
      if (setupATirar <= 0) break;
      const tira = Math.min(duracaoDa(p), setupATirar);
      abate.set(p, tira);
      setupATirar -= tira;
      setupForaMs += tira;
    }
    for (const p of lista) {
      let ms = duracaoDa(p);
      if (ms <= 0) continue;
      const codigo = String(p.motivo || MOTIVO_SEM_DEFINICAO);
      if (abate.has(p)) {
        ms -= abate.get(p);
        // O que sobrou dela e' arredondamento da lista, nao parada.
        if (ms < folgaDaLista(1)) continue;
      }
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
    setupForaMs,
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

/**
 * O SETUP PLANEJADO DO CADASTRO do grupo: com setups por dia e minutos por
 * setup, o takt tira o setup das horas da linha — e o setup que a medicao
 * pegou sai do relogio dela tambem. Sem, o setup e' perda: come as horas.
 * E' a regua do RELATORIO (as horas da linha), nao a do tempo-alvo: o
 * relatorio compara com as horas, e as duas pontas precisam da mesma regra
 * (revisao da v2.110.1).
 */
export function setupPlanejadoDoCadastro(grupo) {
  // A MESMA condicao do takt (setupDescontado em demanda/programa.js): as
  // horas de setup maiores que zero. Sem os dias da semana no cadastro, o
  // takt nao tira o setup das horas — e o resumo tambem nao o tira das
  // medicoes (revisao da v2.110.2).
  const horas = horasDeSetup({ setupsDia: grupo?.setups_dia, dias: grupo?.dias_semana, minutos: grupo?.setup_min });
  return (horas ?? 0) > 0;
}

/** O takt do grupo numa data: as horas, o programa e o setup planejado dela. */
export function taktDoGrupo({ grupo: g, ativas, demandas }, data) {
  return taktDaMedicao({
    demandas,
    horas: g.horas_semana,
    maquinas: ativas,
    setup: { setupsDia: g.setups_dia, dias: g.dias_semana, minutos: g.setup_min },
    data,
    // O takt nao depende do ritmo; a leitura so' pede um para o veredito.
    pecas: 1,
    duracaoMs: 3600000,
  });
}

/** Por que a semana nao tem conta, sem dizer "esta semana" (vale para a proxima). */
function porQueSemConta(estado) {
  switch (estado) {
    case 'sem-demanda': return 'não há programa de produção do grupo cadastrado.';
    case 'sem-semana': return 'o programa do grupo não cobre a semana.';
    case 'sem-horas': return 'faltam as horas da semana no cadastro do grupo.';
    case 'sem-dias': return 'faltam os dias de produção da semana no cadastro do grupo.';
    case 'setup-excede': return 'o setup cadastrado passa da jornada.';
    // Semana do programa com zero volumes para o grupo (feriado, parada):
    // sem volume nao ha' takt, e a leitura diz 'sem-ritmo'.
    case 'sem-ritmo':
    case 'pronto': return 'o programa da semana não tem volumes para o grupo.';
    default: return 'sem conta para a semana.';
  }
}

const DIA_MS = 86400000;

/**
 * A HORA EXTRA DE CADA GRUPO, esta semana e a proxima, cada uma no ritmo das
 * medicoes DO GRUPO (misturar linhas dava a uma o ritmo da outra).
 *
 * O setup das medicoes segue o das HORAS daquela semana (takt.setupPlanejado):
 * as horas sem o setup, as medicoes sem o setup; as horas com, as medicoes
 * com. Assim a conta nunca tira o setup de um lado so' — nem conta duas
 * vezes, nem some dos dois (revisao da v2.110.1).
 *
 * Semana sem conta vira um aviso com o porque — nunca some calada.
 *
 * @param grupos [{ grupo, ativas, medicoes, demandas, erroPrograma }]
 * @param agora  instante de hoje (ms), para "esta semana" e "a proxima"
 * @returns {{ colunas: object[], avisos: string[] }}
 */
export function horaExtraDosGrupos(grupos, { agora = Date.now() } = {}) {
  const colunas = [];
  const avisos = [];
  const lista = grupos || [];
  const varios = lista.length > 1;
  for (const x of lista) {
    const prefixo = varios ? `${x.grupo.nome} · ` : '';
    if (x.erroPrograma) {
      avisos.push(`${prefixo}não deu para ler o programa da semana (${x.erroPrograma}).`);
      continue;
    }
    for (const somar of [0, 7]) {
      const data = new Date(agora + somar * DIA_MS).toISOString();
      const takt = taktDoGrupo(x, data);
      // O dia em que a semana da fabrica comeca ("de 09/11"); o codigo do PCP
      // ("047-26") ninguem reconhece — sem a data, fica so' o nome da semana.
      const quando = takt.semana && String(takt.semana).startsWith('de ') ? ` (${takt.semana})` : '';
      const rotulo = `${prefixo}${somar ? 'Próxima semana' : 'Esta semana'}${quando}`;
      const rg = relatorioDePerdas(x.medicoes, { descontarSetupDe: () => Boolean(takt.setupPlanejado) }).total;
      if (!rg) {
        if (!somar) avisos.push(`${prefixo}sem medição com volumes marcados no período.`);
        break;
      }
      const conta = horaExtraDaSemana({
        demanda: takt.demanda,
        horasPorMaquina: takt.horasPorMaquina,
        maquinas: x.ativas,
        periodoMs: rg.periodoMs,
        normalMs: rg.normalMs,
      });
      if (conta) {
        colunas.push({
          chave: `${x.grupo.id}-${somar}`, rotulo, conta, ativas: x.ativas, periodoMs: rg.periodoMs, normalMs: rg.normalMs,
        });
      } else {
        avisos.push(`${rotulo}: ${porQueSemConta(takt.estado)}`);
      }
    }
  }
  return { colunas, avisos };
}
