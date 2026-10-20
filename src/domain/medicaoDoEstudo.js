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
 *
 * O SETUP FICA NO RELOGIO, e a tela mostra tambem o numero sem ele. O
 * estudo grava so' o numero do takt, nao de onde ele veio: o do programa
 * da semana ja' descontou o setup planejado (ai' tirar o setup marcado do
 * relogio e' o certo — a regra de leituraDaDemanda), mas o digitado com a
 * jornada cheia (o padrao e' 8,8 h) nao descontou, e tirar o setup do
 * relogio contaria a troca ZERO vezes — o veredito virava "atende" sem a
 * linha atender (revisao de 20/10). Sem saber a origem, fica o lado
 * seguro: setup dentro (erro pessimista, nunca um "atende" falso), e com
 * setup planejado no grupo o numero sem o setup marcado vai ao lado, para
 * quem sabe que o takt veio do programa. Gravar a origem do takt no estudo
 * resolve de vez.
 */
import { CRITERIOS_CONFERENCIA, nomeChave, resumirConferencias } from './crono/conferencia.js';
import { unidadeDoPosto } from './crono/formato.js';
import { horasDeSetup } from './demanda/capacidade.js';
import { MS_POR_HORA } from './estatistica.js';
import { filtrarPorPeriodo, quandoMediu } from './relatorioConferencias.js';
import { contadasPorProduto } from './volumes.js';

/** Janela da medicao: a mesma do relatorio e da Embalagem Takt Time no PC. */
export const DIAS_MEDICAO = 30;

/**
 * O teto da lista do servidor: o MAX_LINHAS de api/conferencias.js. A
 * lista vem das mais novas para as mais velhas, de TODAS as maquinas; com
 * ela cheia, medicao antiga deste posto pode ter ficado do lado de fora —
 * e a tela tem de dizer isso, nao tirar o ritmo de um pedaco calada.
 */
export const TETO_LISTA_CONFERENCIAS = 1000;

/**
 * A UNIDADE DO ESTUDO pelo grupo do posto no cadastro: na embalagem o
 * estudo mede o PRODUTO inteiro (o ciclo do "RACK SIRIUS 1.6" comeca em
 * "CX 1/1" e termina no rack embalado), fora dela, a peca. Posto fora do
 * cadastro (ou sem grupo) fica em peca — a mesma regra da medicao: o
 * tablet so' conta volume na maquina de um grupo embalagem.
 */
export function unidadeDoEstudo(nomeDoGrupo) {
  return unidadeDoPosto(nomeDoGrupo).singular === 'volume' ? 'produto' : 'peça';
}

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
 * `arquivadas`: a lista das arquivadas (GET ?arquivadas=1), so' para
 * CONTAR as do posto e produto — ou null quando nao se sabe (falhou).
 * `unidade`: unidadeDoPosto do grupo do posto ('peça' ou 'volume').
 * `volumes`: os volumes do produto (volumesDoProduto), ou null.
 * `setup`: o setup planejado do grupo { setupsDia, dias, minutos }, como
 * leituraDaDemanda recebe; ausente vale "nao informado".
 * `agora`: ms ou Date — a janela conta a partir dele.
 */
export function medicaoDoEstudo({
  conferencias, arquivadas = null, recurso, produto, unidade, volumes, setup = null,
  agora = Date.now(), dias = DIAS_MEDICAO,
} = {}) {
  const contada = singularDe(unidade);
  const instante = agora instanceof Date ? agora.getTime() : Number(agora);
  const ts = Number.isFinite(instante) ? instante : Date.now();

  const lista = Array.isArray(conferencias) ? conferencias : [];
  // Lista cheia: o que passou do teto nao chegou. Vale para todo caminho
  // com posto e produto — inclusive o "nenhuma medicao".
  const noTeto = lista.length >= TETO_LISTA_CONFERENCIAS;
  const horasSetup = horasDeSetup(setup || {});
  // "Ha' setup planejado" e' MAIOR QUE ZERO: o "este grupo nao faz setup"
  // (zero) nao tirou nada das horas, e o setup medido fica no relogio.
  const setupPlanejado = horasSetup != null && horasSetup > 0;

  // Mesmo formato em todos os caminhos: a tela le' os campos sem perguntar
  // antes se a medicao existe.
  const vazio = (motivo, extra = {}) => ({
    motivo, usavel: false, dias, contada, unidade: null, volumes: null, convertido: false,
    n: 0, desde: null, ate: null, totalMs: 0, produtivoMs: 0, paradaMs: 0, contadas: 0,
    relogioMs: 0, setupPlanejado, setupMedidoMs: 0, ritmoSemSetup: null,
    ritmoRelogio: null, ritmoRodando: null, ritmoRelogioContado: null, ritmoRodandoContado: null,
    suficiente: false, faltas: null, motivosAmostra: [], outrosProdutos: 0, antigas: 0,
    arquivadas: null, noTeto: false,
    ...extra,
  });

  const chavePosto = nomeChave(recurso);
  if (!chavePosto) return vazio('sem-posto');
  const chaveProduto = nomeChave(produto);
  if (!chaveProduto) return vazio('sem-produto');

  // Arquivada saiu da conta de proposito, no relatorio: aqui tambem. O GET
  // padrao ja' nao as traz; o filtro e' a rede para quem mandar a lista toda.
  const doPosto = lista
    .filter((c) => c && !c.arquivada && nomeChave(c.maquina) === chavePosto);
  const doProduto = doPosto.filter((c) => nomeChave(c.peca) === chaveProduto);
  const naJanela = filtrarPorPeriodo(doProduto, dias, ts)
    .filter((c) => duracaoDe(c) > 0 && (Number(c.pecas) || 0) > 0);
  // O que ajuda a achar o porque do vazio: medicao do posto com OUTRO nome
  // de produto (grafia diferente, produto trocado) e medicao antiga.
  const outrosProdutos = filtrarPorPeriodo(doPosto, dias, ts)
    .filter((c) => nomeChave(c.peca) !== chaveProduto).length;
  const antigas = doProduto.length - filtrarPorPeriodo(doProduto, dias, ts).length;
  /* As ARQUIVADAS do posto e do produto, na mesma janela. Arquivar tira da
     conta (de proposito), mas "nenhuma medicao" mandava medir de novo o
     que esta' guardado no banco — e parecia que o dado tinha sumido. Null
     quando a lista das arquivadas nao veio: nao se sabe, nao e' zero. */
  const arquivadasNaJanela = Array.isArray(arquivadas)
    ? filtrarPorPeriodo(arquivadas.filter((c) => c && c.arquivada !== false
      && nomeChave(c.maquina) === chavePosto && nomeChave(c.peca) === chaveProduto), dias, ts).length
    : null;

  // Todas tem o mesmo posto e o mesmo produto: o resumo por peca devolve
  // UM grupo, com a soma, as duas reguas e o criterio de amostra do
  // relatorio — o mesmo numero que a tabela "Ritmo por peca" mostra.
  const [g] = resumirConferencias(naJanela, { porPeca: true });
  if (!g) {
    return vazio('sem-medicao', {
      outrosProdutos, antigas, arquivadas: arquivadasNaJanela, noTeto,
    });
  }

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

  /* O relogio do medido, com TODAS as paradas dentro, inclusive o setup
     marcado (ver o cabecalho). Com setup planejado no grupo, o ritmo SEM o
     setup marcado vai ao lado — so' o MARCADO como setup sai; falta de
     material e manutencao sao perda do chao. Medicao que foi so' setup nao
     chega aqui (resumirConferencias a descarta: nao ha' ritmo nela). */
  const setupMedidoMs = g.totalSetupMs || 0;
  const relogioMs = g.totalMs;
  const ritmoRelogioContado = (g.totalPecas * MS_POR_HORA) / relogioMs;
  const ritmoSemSetupContado = setupPlanejado && setupMedidoMs > 0 && g.totalMs > setupMedidoMs
    ? (g.totalPecas * MS_POR_HORA) / (g.totalMs - setupMedidoMs) : null;

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
    // O tempo que divide o relogio: o observado inteiro, paradas dentro.
    relogioMs,
    setupPlanejado,
    setupMedidoMs,
    // Sem o setup marcado (so' com setup planejado no grupo): o numero a
    // comparar quando o takt do estudo veio do programa da semana.
    ritmoSemSetup: ritmoSemSetupContado == null ? null : ritmoSemSetupContado / divisor,
    ritmoRelogio: ritmoRelogioContado / divisor,
    ritmoRodando: g.ritmoMedio / divisor,
    // O que o posto contou por hora, antes de converter (vol/h na embalagem).
    ritmoRelogioContado,
    ritmoRodandoContado: g.ritmoMedio,
    suficiente: g.confiavel,
    faltas,
    motivosAmostra: g.motivos,
    outrosProdutos,
    antigas,
    arquivadas: arquivadasNaJanela,
    noTeto,
  };
}
