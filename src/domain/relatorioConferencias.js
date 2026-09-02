/**
 * O que o RELATORIO RITMO POR MAQUINA calcula por cima dos resumos.
 *
 * resumirConferencias (cronoanalise.js) entrega uma linha por maquina e
 * uma por peca. O relatorio ainda precisa de tres leituras que ate' set/26
 * viviam dentro do componente React, sem teste: os numeros do topo, as
 * barras do grafico por medicao e a lateral organizada por grupo do
 * cadastro. Aqui elas sao funcoes puras — sem React, sem rede — para que
 * um numero errado apareca no teste antes de aparecer na reuniao.
 */
import {
  CRITERIOS_CONFERENCIA, conferenciaRapida, faixaHoraria, nomeChave, somarParadas,
} from './cronoanalise.js';

/** Id do item "Todas" na lateral. Filtro nenhum e' `null`; a lateral
    precisa de um id de verdade para marcar o ativo. */
export const TODAS = '__todas';

/** O nome que a medicao sem maquina recebe — o mesmo de resumirConferencias. */
export const SEM_MAQUINA = 'Sem máquina';

const nomeDaMaquina = (c) => String(c.maquina || '').trim() || SEM_MAQUINA;

/**
 * O filtro da lateral corta o relatorio INTEIRO — medicoes, resumos,
 * numeros do topo e a folha impressa. Uma unica regra ("o que esta' na
 * tela e' o que imprime") e' mais facil de entender do que um filtro que
 * vale para umas secoes e nao para outras.
 */
export function filtrarPorMaquina(conferencias, maquina) {
  if (!maquina) return conferencias;
  const chave = nomeChave(maquina);
  return conferencias.filter((c) => nomeChave(nomeDaMaquina(c)) === chave);
}

/** O mesmo corte, sobre os resumos (por maquina ou por peca x maquina). */
export function filtrarResumo(resumo, maquina) {
  if (!maquina) return resumo;
  const chave = nomeChave(maquina);
  return resumo.filter((g) => nomeChave(g.maquina) === chave);
}

/**
 * Os numeros do topo, em palavras que qualquer pessoa le: ritmo medio
 * (pecas/hora — a tela converte para minuto), quantas medicoes, quanto
 * tempo a maquina rodou e quanto ficou parada, com o pareto das paradas.
 *
 * O ritmo e' ponderado pelo TEMPO (soma de pecas sobre soma do tempo com a
 * maquina rodando), nunca media de taxas: media de taxas deixaria uma
 * medicao de 5 minutos valer o mesmo que uma de 2 horas. Parada maior que
 * o periodo conta ate' o periodo — o tempo rodando nunca fica negativo.
 * Sem tempo rodando o ritmo e' `null`, e a tela mostra vazio.
 */
export function resumoDoPeriodo(conferencias, maquinas = []) {
  if (!conferencias.length) return null;
  let totalMs = 0; let paradaMs = 0; let pecasTot = 0;
  const todasParadas = [];
  for (const c of conferencias) {
    const dur = Number(c.duracao_ms) || 0;
    const par = somarParadas(c.paradas);
    totalMs += dur;
    paradaMs += Math.min(par.totalMs, dur);
    pecasTot += Number(c.pecas) || 0;
    if (c.paradas?.length) todasParadas.push(...c.paradas);
  }
  const produtivoMs = totalMs - paradaMs;
  return {
    n: conferencias.length,
    maquinas: maquinas.length,
    pecasTot,
    totalMs,
    produtivoMs,
    paradaMs,
    ritmoMedio: produtivoMs > 0 ? (pecasTot * 3600000) / produtivoMs : null,
    // O pareto e' a soma BRUTA por motivo, sem o teto do periodo: ele
    // responde "qual motivo pesa mais", e ratear o teto entre motivos
    // inventaria proporcao. Os dois numeros so' divergem com parada maior
    // que o periodo — que o servidor recusa gravar (api/conferencias.js).
    pareto: somarParadas(todasParadas),
  };
}

export const formatarDataHora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Com a lateral filtrada numa maquina, o grafico abre POR MEDICAO: uma
 * barra por medicao, com a peca embaixo — e' assim que se enxerga qual
 * peca puxa o ritmo para cima ou para baixo. Sem filtro, cada maquina e'
 * uma barra so' (a media ponderada), porque duas barras da mesma maquina
 * nao se comparam com a barra unica da vizinha.
 *
 * Da esquerda para a direita, da mais antiga para a mais recente: e' a
 * ordem em que o posto foi medido (a lista chega da mais recente). A marca
 * `confiavel` aqui e' MEDICAO CURTA (menos de 5 min de maquina rodando) —
 * a legenda que vai junto diz isso. Medicao sem ritmo (periodo zero,
 * parada maior que o periodo) fica de fora em vez de virar barra vazia.
 */
export function barrasPorMedicao(conferencias, maquina) {
  if (!maquina) return null;
  return [...conferencias].reverse().map((c) => {
    const calc = conferenciaRapida({
      duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
      ciclosPorPeca: c.ciclos_por_peca,
    });
    if (!calc || !(calc.pecasPorHora > 0)) return null;
    const peca = String(c.peca || '').trim();
    return {
      chave: c.id,
      rotulo: faixaHoraria(c) || formatarDataHora(c.salvo_em),
      nota: peca ? (peca.length > 20 ? `${peca.slice(0, 19)}…` : peca) : null,
      ritmoMedio: calc.pecasPorHora,
      confiavel: calc.produtivoMs >= CRITERIOS_CONFERENCIA.minPeriodoMs,
      maquina,
    };
  }).filter(Boolean);
}

/**
 * A lateral lista as maquinas DEBAIXO DO GRUPO do cadastro
 * (0002 · FURADEIRA, 0004 · FRESADORA), a mesma leitura que o celular ja'
 * oferece na escolha da maquina. Com postos de naturezas diferentes
 * medidos no mesmo relatorio, uma lista corrida de nomes obrigava a
 * decorar qual maquina e' de qual grupo.
 *
 * Maquina sem grupo no cadastro nao some: cai em "Sem grupo", no fim — o
 * cadastro organiza, nao trava, como no celular. Grupos em ordem de codigo
 * (0002 antes de 0004). Com um grupo so' o cabecalho nao organiza nada:
 * repetiria o obvio acima de uma lista que ja' e' toda dele.
 *
 * O bloco aparece MESMO com uma maquina so' (mudanca de 31/08): ele sumia
 * com uma unica maquina medida, e o usuario nao achava onde filtrar para
 * imprimir — controle que aparece e some nao se aprende.
 */
export function itensDaLateral({ resumo = [], total = 0, grupoDe = () => null } = {}) {
  if (!resumo.length) return [];
  const porGrupo = new Map();
  for (const g of resumo) {
    const grupo = grupoDe(g.maquina) || 'Sem grupo';
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push(g);
  }
  const grupos = [...porGrupo.keys()].sort((a, b) => {
    if (a === 'Sem grupo') return 1;
    if (b === 'Sem grupo') return -1;
    return a.localeCompare(b, 'pt-BR');
  });

  const itens = [{ id: TODAS, rotulo: 'Todas', contador: total }];
  const nomearGrupos = grupos.length > 1;
  for (const grupo of grupos) {
    if (nomearGrupos) itens.push({ id: `grupo:${grupo}`, rotulo: grupo, cabecalho: true });
    for (const g of porGrupo.get(grupo)) {
      itens.push({ id: g.maquina, rotulo: g.maquina, contador: g.n, recuado: nomearGrupos });
    }
  }
  return itens;
}

/**
 * O lote de UMA maquina: os ids das linhas que estao na tela sob aquele
 * nome. So' existe com a maquina escolhida na lateral — "arquivar tudo"
 * sem escolher maquina seria esvaziar o relatorio inteiro num clique.
 * `arquivada` e' o estado que o lote vai receber: na face das ativas o
 * lote arquiva; na das arquivadas, restaura.
 */
export function loteDaMaquina({ filtro, visiveis = [], verArquivadas = false } = {}) {
  if (!filtro || !visiveis.length) return null;
  return { maquina: filtro, ids: visiveis.map((c) => c.id), arquivada: !verArquivadas };
}
