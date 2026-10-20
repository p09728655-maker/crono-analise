/**
 * A MEDICAO REAL DA LINHA, para a analise de um estudo de tempos.
 *
 * O estudo diz o que a linha PODE fazer: a capacidade do gargalo pelo
 * tempo padrao. O tablet mede o que ela FEZ: pecas (ou volumes) contados
 * no posto, com as paradas dentro. Ate' aqui os dois numeros moravam em
 * telas diferentes, e o PPCP comparava de cabeca — ou nao comparava.
 *
 * Esta funcao pega as medicoes de ritmo (Ritmo por maquina, Embalagem Takt
 * Time) do MESMO posto e do MESMO produto do estudo, nos ultimos 30 dias, e
 * devolve o ritmo da linha na unidade do estudo. Puro: sem React, sem rede.
 *
 * Duas reguas, as mesmas do relatorio Ritmo por maquina:
 *   - RELOGIO: Σ contadas × 3.600.000 / Σ duracao, paradas DENTRO. E' a
 *     regua do programa: o volume que nao saiu porque a linha parou tambem
 *     nao entrou no caminhao. E' este que vai contra o takt.
 *   - RODANDO: Σ contadas × 3.600.000 / Σ (duracao − paradas). E' o
 *     diagnostico: quanto a linha faz quando nao para.
 * As duas sao ponderadas pelo tempo (soma sobre soma), nunca media de
 * taxas — a mesma conta de resumirConferencias, que e' quem faz a soma.
 */
import { CRITERIOS_CONFERENCIA, nomeChave, resumirConferencias } from './crono/conferencia.js';
import { filtrarPorPeriodo, quandoMediu } from './relatorioConferencias.js';
import { contadasPorProduto } from './volumes.js';

/** Janela da medicao: a mesma do relatorio e da Embalagem Takt Time no PC. */
export const DIAS_MEDICAO = 30;

/*
 * O `motivo` de a medicao nao entrar no atingimento, do mais cedo ao mais
 * tarde no caminho. A tela escreve o que fazer a partir dele.
 *   sem-posto            o estudo nao tem recurso/posto
 *   sem-produto          o estudo nao tem produto
 *   sem-medicao          nenhuma medicao do posto com o produto na janela
 *   sem-volumes          embalagem sem os volumes do produto no cadastro
 *   amostra-insuficiente abaixo dos CRITERIOS_CONFERENCIA
 * null: a medicao entra (usavel).
 */

const singularDe = (unidade) => {
  const s = typeof unidade === 'string' ? unidade : unidade?.singular;
  return s === 'volume' ? 'volume' : 'peça';
};

const duracaoDe = (c) => Number(c?.duracaoMs ?? c?.duracao_ms) || 0;

/**
 * `conferencias`: a lista do servidor (GET /api/conferencias), qualquer
 * maquina — o filtro e' aqui, por nomeChave, porque o servidor compara o
 * texto exato e "furadeira 03" nao acharia "FURADEIRA 03".
 * `unidade`: unidadeDoPosto do grupo do posto ('peça' ou 'volume').
 * `volumes`: os volumes do produto (volumesDoProduto), ou null.
 * `agora`: ms ou Date — a janela conta a partir dele.
 */
export function medicaoDoEstudo({
  conferencias, recurso, produto, unidade, volumes, agora = Date.now(), dias = DIAS_MEDICAO,
} = {}) {
  const contada = singularDe(unidade);
  const instante = agora instanceof Date ? agora.getTime() : Number(agora);
  const ts = Number.isFinite(instante) ? instante : Date.now();

  // Mesmo formato em todos os caminhos: a tela le' os campos sem perguntar
  // antes se a medicao existe.
  const vazio = (motivo, extra = {}) => ({
    motivo, usavel: false, dias, contada, unidade: null, volumes: null, convertido: false,
    n: 0, desde: null, ate: null, totalMs: 0, produtivoMs: 0, paradaMs: 0, contadas: 0,
    ritmoRelogio: null, ritmoRodando: null, ritmoRelogioContado: null, ritmoRodandoContado: null,
    suficiente: false, faltas: null, motivosAmostra: [], outrosProdutos: 0, antigas: 0,
    ...extra,
  });

  const chavePosto = nomeChave(recurso);
  if (!chavePosto) return vazio('sem-posto');
  const chaveProduto = nomeChave(produto);
  if (!chaveProduto) return vazio('sem-produto');

  // Arquivada saiu da conta de proposito, no relatorio: aqui tambem. O GET
  // padrao ja' nao as traz; o filtro e' a rede para quem mandar a lista toda.
  const doPosto = (Array.isArray(conferencias) ? conferencias : [])
    .filter((c) => c && !c.arquivada && nomeChave(c.maquina) === chavePosto);
  const doProduto = doPosto.filter((c) => nomeChave(c.peca) === chaveProduto);
  const naJanela = filtrarPorPeriodo(doProduto, dias, ts)
    .filter((c) => duracaoDe(c) > 0 && (Number(c.pecas) || 0) > 0);
  // O que ajuda a achar o porque do vazio: medicao do posto com OUTRO nome
  // de produto (grafia diferente, produto trocado) e medicao antiga.
  const outrosProdutos = filtrarPorPeriodo(doPosto, dias, ts)
    .filter((c) => nomeChave(c.peca) !== chaveProduto).length;
  const antigas = doProduto.length - filtrarPorPeriodo(doProduto, dias, ts).length;

  // Todas tem o mesmo posto e o mesmo produto: o resumo por peca devolve
  // UM grupo, com a soma, as duas reguas e o criterio de amostra do
  // relatorio — o mesmo numero que a tabela "Ritmo por peca" mostra.
  const [g] = resumirConferencias(naJanela, { porPeca: true });
  if (!g) return vazio('sem-medicao', { outrosProdutos, antigas });

  const instantes = naJanela.map(quandoMediu).filter(Number.isFinite);
  const c = CRITERIOS_CONFERENCIA;
  const faltas = {
    medicoes: g.n < c.minConferencias,
    tempo: g.totalProdutivoMs < c.minTempoTotalMs,
    curtas: g.curtas,
  };

  /* Na embalagem o tablet conta VOLUME e o estudo mede o PRODUTO: divide
     pelos volumes do produto. Sem os volumes NAO converte — devolve o que
     mediu, em volumes, e a tela pede o cadastro. Supor 1 daria um rack de
     dois volumes saindo no dobro do ritmo real. */
  const porProduto = contadasPorProduto(contada, volumes);
  const convertido = contada === 'volume' && porProduto !== null;
  const divisor = porProduto || 1;
  const unidadeResultado = contada === 'peça' ? 'peça' : (convertido ? 'produto' : 'volume');

  const motivo = contada === 'volume' && !convertido
    ? 'sem-volumes'
    : (g.confiavel ? null : 'amostra-insuficiente');

  return {
    motivo,
    // Entra no atingimento so' na unidade do estudo E com amostra que
    // sustenta decisao. O numero aparece nos outros casos, com a ressalva.
    usavel: motivo === null,
    dias,
    contada,
    unidade: unidadeResultado,
    volumes: contada === 'volume' ? porProduto : null,
    convertido,
    n: g.n,
    desde: instantes.length ? Math.min(...instantes) : null,
    ate: instantes.length ? Math.max(...instantes) : null,
    totalMs: g.totalMs,
    produtivoMs: g.totalProdutivoMs,
    paradaMs: g.totalParadaMs,
    contadas: g.totalPecas,
    ritmoRelogio: g.ritmoBruto / divisor,
    ritmoRodando: g.ritmoMedio / divisor,
    // O que o posto contou por hora, antes de converter (vol/h na embalagem).
    ritmoRelogioContado: g.ritmoBruto,
    ritmoRodandoContado: g.ritmoMedio,
    suficiente: g.confiavel,
    faltas,
    motivosAmostra: g.motivos,
    outrosProdutos,
    antigas,
  };
}
