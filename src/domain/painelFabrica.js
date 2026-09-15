/**
 * GESTAO A VISTA — o painel de monitor, no chao de fabrica.
 *
 * Nao e' o relatorio numa fonte maior. O relatorio e' lido sentado, por
 * quem vai decidir; este e' lido de passagem, a metros de distancia, por
 * quem esta' trabalhando. Isso muda o que ele pode afirmar.
 *
 * DUAS COISAS QUE ESTE ARQUIVO EXISTE PARA IMPEDIR:
 *
 *  - NUMERO VELHO COM CARA DE AGORA. O RitmoPatrimar mede por AMOSTRAGEM:
 *    o analista passa no posto, mede vinte minutos e vai embora. Um painel
 *    de parede sugere "agora" por natureza — e mostrar 750 pc/h de uma
 *    medicao de quarta-feira, numa terca, e' mentir sem escrever nada
 *    falso. Por isso cada maquina carrega a IDADE da propria medicao, e
 *    quem passou do limite e' marcada como velha em vez de exibir o
 *    numero como corrente.
 *  - MAQUINA QUE SUMIU. Posto sem medicao no periodo simplesmente nao
 *    aparecia em resumo nenhum. Num painel de gestao a vista, a maquina
 *    que ninguem mediu ha' duas semanas e' justamente a que precisa
 *    aparecer — some dela e a fabrica esquece que ela existe.
 *
 * O ritmo da manchete e' o de RELOGIO (paradas dentro), como no resto do
 * app: e' ele que enche o caminhao. O de maquina rodando entra ao lado,
 * como potencial.
 *
 * As maquinas vem AGRUPADAS pelo grupo do cadastro e nunca ordenadas
 * entre grupos: uma CNC a 181 pc/h nao e' "pior" que uma furadeira a 750
 * — sao servicos diferentes, e ranquear os dois na mesma lista e' o tipo
 * de comparacao que o relatorio inteiro recusa.
 */
import { MS_POR_HORA } from './estatistica.js';
import { nomeChave, resumirConferencias } from './cronoanalise.js';
import { quandoMediu } from './relatorioConferencias.js';

/** Sem grupo no cadastro — pendencia de cadastro, nao nome de grupo. */
export const SEM_GRUPO_PAINEL = '__sem_grupo';

/**
 * Ate' quando uma medicao ainda fala do presente.
 *
 * Dois dias. A escolha e' de PCP, nao de tela: uma medicao de ontem ainda
 * descreve o posto de hoje (mesma peca, mesmo turno, mesmo setup); uma de
 * uma semana atras atravessou trocas de peca e de operador, e afirmar que
 * ela e' o ritmo de agora e' chute. Quem quiser o numero velho tem o
 * relatorio, que diz o periodo inteiro.
 */
export const DIAS_ATE_ENVELHECER = 2;

const horas = (ms) => ms / 3600000;

/**
 * O painel: uma faixa por grupo, um cartao por maquina.
 *
 * @param conferencias medicoes ja' cortadas pela janela de tempo
 * @param maquinas     o CADASTRO — e' ele que revela o posto sem medicao
 * @param grupoDe      nome da maquina -> rotulo do grupo ("0002 · FURADEIRA")
 * @param agora        instante de referencia, para a idade de cada medicao
 */
export function painelDeMaquinas(conferencias, {
  maquinas = [], grupoDe = () => null, agora = Date.now(),
} = {}) {
  const resumo = resumirConferencias(conferencias || []);

  /* A medicao MAIS RECENTE de cada maquina. E' o que da' idade ao numero,
     e o resumo nao guarda instante nenhum — ele soma, nao data. */
  const ultima = new Map();
  for (const c of conferencias || []) {
    const ts = quandoMediu(c);
    if (!Number.isFinite(ts)) continue;
    const chave = nomeChave(c.maquina ?? c.maquina_nome ?? '');
    if (!chave) continue;
    if (!ultima.has(chave) || ts > ultima.get(chave)) ultima.set(chave, ts);
  }

  const medidas = resumo.map((g) => {
    const ts = ultima.get(nomeChave(g.maquina)) ?? null;
    const idadeMs = ts == null ? null : Math.max(0, agora - ts);
    return {
      maquina: g.maquina,
      grupo: grupoDe(g.maquina) || null,
      medida: true,
      n: g.n,
      confiavel: g.confiavel,
      // O que DECIDE: pecas por hora de presenca, paradas dentro.
      ritmoRelogio: g.totalMs > 0 ? (g.totalPecas * MS_POR_HORA) / g.totalMs : null,
      // O potencial, para a distancia entre os dois dizer o que ha' a ganhar.
      ritmoRodando: g.ritmoMedio,
      disponibilidadePct: g.disponibilidadePct,
      pecas: g.totalPecas,
      horasObservadas: horas(g.totalMs),
      paradaMs: g.totalParadaMs,
      // O maior motivo, que e' o que se trata primeiro.
      maiorParada: g.paradasPorMotivo?.[0]
        ? { rotulo: g.paradasPorMotivo[0].rotulo, ms: g.paradasPorMotivo[0].ms }
        : null,
      medidaEm: ts,
      idadeMs,
      // VELHA nao e' invalida: o numero continua certo sobre o periodo dele.
      // A tela e' que nao pode apresenta-lo como o ritmo de agora.
      velha: idadeMs != null && idadeMs > DIAS_ATE_ENVELHECER * 86400000,
    };
  });

  /* O CADASTRO revela quem NAO foi medido. Sem isto o painel mostra so'
     quem tem numero, e a maquina esquecida fica esquecida tambem nele. */
  const comMedicao = new Set(medidas.map((m) => nomeChave(m.maquina)));
  const semMedicao = (maquinas || [])
    .filter((m) => m.ativa !== false && !comMedicao.has(nomeChave(m.nome)))
    .map((m) => ({
      maquina: m.nome,
      grupo: grupoDe(m.nome) || null,
      medida: false,
      n: 0,
      confiavel: false,
      ritmoRelogio: null,
      ritmoRodando: null,
      disponibilidadePct: null,
      pecas: 0,
      horasObservadas: 0,
      paradaMs: 0,
      maiorParada: null,
      medidaEm: null,
      idadeMs: null,
      velha: false,
    }));

  /* Por GRUPO. Maquina sem grupo no cadastro vai para um balde proprio,
     que a tela nomeia como pendencia — nao como grupo. */
  const porGrupo = new Map();
  for (const m of [...medidas, ...semMedicao]) {
    const chave = m.grupo || SEM_GRUPO_PAINEL;
    if (!porGrupo.has(chave)) porGrupo.set(chave, []);
    porGrupo.get(chave).push(m);
  }

  const grupos = [...porGrupo.entries()].map(([grupo, lista]) => ({
    grupo,
    maquinas: [...lista].sort(ordemDoPainel),
    // Quantas do grupo estao sem numero utilizavel agora: e' o que a faixa
    // do grupo precisa dizer antes de qualquer media.
    semNumero: lista.filter((m) => !m.medida || m.velha).length,
  }));

  // Os grupos saem pelo CODIGO do cadastro ("0002 · FURADEIRA"), que e' a
  // ordem que a fabrica usa. O balde sem grupo por ultimo.
  grupos.sort((a, b) => {
    if (a.grupo === SEM_GRUPO_PAINEL) return 1;
    if (b.grupo === SEM_GRUPO_PAINEL) return -1;
    return String(a.grupo).localeCompare(String(b.grupo), 'pt-BR');
  });

  return {
    grupos,
    total: medidas.length + semMedicao.length,
    // Quantas maquinas o painel nao consegue afirmar agora — o numero que
    // diz se o painel esta' sendo alimentado ou se virou enfeite.
    semNumero: [...medidas, ...semMedicao].filter((m) => !m.medida || m.velha).length,
  };
}

/**
 * DENTRO do grupo, o que exige atencao primeiro.
 *
 * Maquinas do mesmo grupo fazem o mesmo servico, entao aqui comparar vale
 * — e o menor ritmo do grupo e' onde a capacidade se perde. Antes delas
 * vem quem nao tem numero: "ninguem mediu esta maquina" e' uma pendencia
 * mais urgente que um ritmo baixo, porque nem se sabe se e' baixo.
 */
function ordemDoPainel(a, b) {
  const pesoDe = (m) => (!m.medida ? 0 : (m.velha ? 1 : 2));
  const pa = pesoDe(a);
  const pb = pesoDe(b);
  if (pa !== pb) return pa - pb;
  if (pa === 2) return (a.ritmoRelogio ?? 0) - (b.ritmoRelogio ?? 0);
  // Sem numero, a mais esquecida primeiro (medida ha' mais tempo).
  return (b.idadeMs ?? Infinity) - (a.idadeMs ?? Infinity);
}
