/**
 * O TAKT DA SEMANA de um grupo, do programa que o PCP colou — em ms, POR
 * MAQUINA, na unidade do programa (peca; na embalagem, volume).
 *
 * A conta e' a mesma do PC (taktDaMedicao: programa da semana, jornada e
 * setup planejado do grupo), com a data de HOJE. O que muda e' de onde vem
 * o dado: o grupo sai do cadastro em cache (lib/maquinas.js) e o programa
 * do servidor — guardado no aparelho a cada leitura, porque o tablet perde
 * rede e o takt nao pode sumir junto com ela.
 *
 * Programa velho no cache nao engana ninguem: a semana e' casada pela data,
 * e semana que o cache nao cobre devolve 'sem-semana', nao o takt de outra.
 *
 * Mora aqui, e nao na tela da embalagem, porque o Novo estudo faz a mesma
 * pergunta. Duas contas do mesmo takt acabariam em dois numeros.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { unidadeDoPosto } from '../domain/cronoanalise.js';
import { taktDaMedicao } from '../domain/demandaSemanal.js';
import { diaCivil } from '../domain/demanda/calendario.js';
import { listarDemanda } from './api.js';
import {
  grupoIdDaMaquina, maquinaDoCadastro, produtosDoGrupo, useBuscaDoCadastro, useCadastroMaquinas,
} from './maquinas.js';

const chave = (grupoId) => `ritmopatrimar.demanda.${grupoId}`;

function lerCache(grupoId) {
  try {
    const lista = JSON.parse(localStorage.getItem(chave(grupoId)));
    return Array.isArray(lista) ? lista : null;
  } catch { return null; }
}

function gravarCache(grupoId, lista) {
  try { localStorage.setItem(chave(grupoId), JSON.stringify(lista)); } catch { /* segue sem cache */ }
}

const inicial = (grupoId) => ({
  grupoId, demandas: grupoId ? lerCache(grupoId) : null, semRede: false, doServidor: false,
});

/**
 * O programa lido SO' VALE para o grupo a que pertence. No Novo estudo o
 * analista troca de posto: sem conferir o grupo, o programa da furadeira
 * valeria por um instante para a fresadora. Pura, para o teste provar o
 * que a tela nao consegue ver (o instante dura um quadro).
 */
export const programaLido = (lido, grupoId) => (lido?.grupoId === grupoId ? lido : inicial(grupoId));

/** "2026-10-26" — o dia civil da fabrica (Sao Paulo), a chave da semana. */
const diaDeHoje = () => diaCivil(new Date())?.toISOString().slice(0, 10) ?? '';

export function useTaktDaSemana({ grupo, maquinasDoGrupo }) {
  const grupoId = grupo?.id || null;
  const [lido, setLido] = useState(() => inicial(grupoId));
  const atual = useMemo(() => programaLido(lido, grupoId), [lido, grupoId]);
  const { demandas, semRede, doServidor } = atual;

  /* O DIA, revisto a cada minuto: o tablet da embalagem fica ligado de um
     dia para o outro, e com a tela aberta na virada da semana o takt
     continuava o da semana anterior. So' redesenha quando o dia muda. */
  const [hoje, setHoje] = useState(diaDeHoje);
  useEffect(() => {
    const id = setInterval(() => setHoje(diaDeHoje()), 60000);
    return () => clearInterval(id);
  }, []);

  /* Busca de novo quando o DIA muda, nao so' quando o grupo muda: a
     semana nova costuma ser colada com a tela ja' aberta (o tablet fica
     ligado), e sem buscar de novo a virada dizia "nao cobre esta semana"
     com o programa ja' no servidor. */
  useEffect(() => {
    if (!grupoId) return undefined;
    let vivo = true;
    setLido(inicial(grupoId));
    listarDemanda(grupoId)
      .then((lista) => {
        if (!vivo) return;
        gravarCache(grupoId, lista);
        setLido({ grupoId, demandas: lista, semRede: false, doServidor: true });
      })
      .catch(() => { if (vivo) setLido((s) => (s.grupoId === grupoId ? { ...s, semRede: true } : s)); });
    return () => { vivo = false; };
  }, [grupoId, hoje]);

  return useMemo(() => {
    // `confirmado` = o programa veio do servidor nesta abertura. Sem isso
    // ele e' o guardado no aparelho (sem rede, ou a busca ainda em curso),
    // e a tela precisa dizer, porque o PCP pode ter colado outro.
    const base = { semRede, confirmado: doServidor };
    if (!grupo) return { taktMs: null, estado: 'sem-grupo', semana: null, ...base };
    // Sem programa nenhum ainda (primeira abertura sem rede): nao ha' o que
    // calcular, e a tela diz que falta rede, nao que falta programa.
    if (demandas === null) return { taktMs: null, estado: semRede ? 'sem-rede' : 'carregando', semana: null, ...base };
    const t = taktDaMedicao({
      demandas,
      horas: grupo.horas_semana,
      maquinas: maquinasDoGrupo,
      setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
      // Meio-dia do dia civil: o dia e' o que importa, e o meio-dia nao
      // escorrega para o dia vizinho em fuso nenhum.
      data: hoje ? `${hoje}T15:00:00Z` : new Date().toISOString(),
      // O takt nao depende do ritmo; a leitura so' precisa de algum.
      pecas: 1,
      duracaoMs: 3600000,
    });
    return { ...t, ...base };
  }, [grupo, maquinasDoGrupo, demandas, semRede, doServidor, hoje]);
}

/**
 * O POSTO pelo nome que o estudo grava: o grupo dele no cadastro, os
 * produtos do grupo e o takt da semana.
 *
 * E' a mesma cadeia do tablet (maquina -> grupo -> produtos e programa),
 * para o estudo nao ter lista de produto nem takt proprios. Posto fora do
 * cadastro, ou sem grupo, devolve grupo nulo e nenhum produto: a tela
 * volta ao texto livre e a demanda digitada, como sempre foi.
 */
export function useProgramaDoPosto(recurso) {
  const cadastro = useCadastroMaquinas();
  const busca = useBuscaDoCadastro();
  const grupoId = grupoIdDaMaquina(cadastro, recurso);
  /* A CHAVE do grupo para "o posto mudou de grupo?": o id do grupo, ou
     'sem-grupo' para maquina do cadastro sem grupo, ou null quando o nome
     nao esta' no cadastro (inclusive pela metade, durante a digitacao) —
     e ai' nao ha' como saber, entao nao conta como troca. */
  const maquina = maquinaDoCadastro(cadastro, recurso);
  const grupoChave = maquina ? (maquina.grupo_id || 'sem-grupo') : null;
  const grupo = useMemo(
    () => (cadastro.grupos || []).find((g) => g && g.id === grupoId) || null,
    [cadastro, grupoId],
  );
  // As ATIVAS do grupo: sao elas que somam tempo disponivel (useDemanda).
  const maquinasDoGrupo = useMemo(
    () => (cadastro.maquinas || []).filter((m) => m && m.ativa !== false && m.grupo_id === grupoId).length,
    [cadastro, grupoId],
  );
  const produtos = useMemo(() => produtosDoGrupo(cadastro, grupoId), [cadastro, grupoId]);
  const takt = useTaktDaSemana({ grupo, maquinasDoGrupo });
  /* Lista vazia sozinha nao diz o que falta. Vazia com a busca FALHA e'
     cadastro que nao chegou (rede); vazia buscando e' espera; vazia com a
     busca OK e' empresa sem maquina cadastrada — ai' "posto fora do
     cadastro" e' a verdade. */
  const vazio = !(cadastro.maquinas || []).length;
  return {
    grupo, grupoChave, noCadastro: Boolean(maquina), maquinasDoGrupo, produtos, takt,
    semCadastro: vazio && busca === 'falhou',
    buscandoCadastro: vazio && (busca === 'buscando' || busca === 'nunca'),
  };
}

/** "0002 · FURADEIRA" — o grupo como o cadastro e a lateral o escrevem. */
export const rotuloDoGrupo = (grupo) => [grupo?.codigo, grupo?.nome].filter(Boolean).join(' · ');

/**
 * O takt do programa como o painel Ritmo / Demanda o mostra — ou null
 * quando nao ha' takt (sem grupo, sem programa, semana nao coberta...).
 * A unidade e' a do programa: na embalagem, volume.
 */
export function programaDoTakt({ grupo, maquinasDoGrupo, takt } = {}) {
  if (!grupo || !(takt?.taktMs > 0)) return null;
  return {
    taktMs: takt.taktMs,
    semana: takt.semana,
    demanda: takt.demanda ?? null,
    horasPorMaquina: takt.horasPorMaquina ?? null,
    jornadaPorMaquina: takt.jornadaPorMaquina ?? null,
    setupPorMaquina: takt.setupPorMaquina ?? null,
    // Semana casada pelo NUMERO (programa sem data de inicio): o quadro do
    // programa faz a ressalva, e o painel do estudo faz a mesma.
    casadoPorData: takt.casadoPorData ?? true,
    confirmado: takt.confirmado ?? true,
    semRede: Boolean(takt.semRede),
    maquinas: maquinasDoGrupo,
    grupo: rotuloDoGrupo(grupo),
    unidade: unidadeDoPosto(grupo.nome),
  };
}

/**
 * O PRODUTO ACOMPANHA O GRUPO do posto. Trocar o posto para outro grupo
 * tira o produto que era da lista do grupo antigo e nao esta' na do novo:
 * sem isto o seletor nao achava o nome (campo vazio na tela) e o estudo
 * gravava a lateral da furadeira no posto da embalagem. Produto digitado a
 * mao, que nao e' de lista nenhuma, fica: e' do analista.
 */
export function produtoDeOutroGrupo({ produto, antes, depois }) {
  if (!produto) return false;
  const nomes = (lista) => new Set((lista || []).map((p) => p?.nome));
  return nomes(antes).has(produto) && !nomes(depois).has(produto);
}

/**
 * O PRODUTO ACOMPANHA O GRUPO DO POSTO — e volta com ele.
 *
 * - O analista troca o posto para OUTRO grupo (inclusive uma maquina do
 *   cadastro sem grupo): o produto que era da lista do grupo antigo e nao
 *   esta' na do novo sai do campo, e fica GUARDADO.
 * - O posto volta ao grupo de onde o produto saiu, com o campo vazio: o
 *   produto volta. Ir e voltar pela seta do teclado (cada seta e' um
 *   posto) nao apaga mais o que estava gravado.
 * - Posto fora do cadastro (o nome pela metade, durante a digitacao) nao
 *   conta: nao ha' como saber o grupo.
 * - O cadastro mudar sozinho (servidor diferente do cache) tambem nao: so'
 *   a troca feita pelo analista (o recurso mudou).
 *
 * Pura, para o teste provar cada caminho. estado: { recurso, grupoChave,
 * produtos, guardado }. Devolve o estado novo e o valor do campo.
 */
export function proximoProduto(estado, { recurso, grupoChave, produtos, produto }) {
  if (!grupoChave) return { estado: { ...estado, recurso }, produto };
  let valor = produto;
  let { guardado } = estado;
  if (guardado && guardado.grupoChave === grupoChave && !produto) {
    valor = guardado.produto;
    guardado = null;
  } else if (recurso !== estado.recurso && estado.grupoChave && grupoChave !== estado.grupoChave
    && produtoDeOutroGrupo({ produto, antes: estado.produtos, depois: produtos })) {
    guardado = { grupoChave: estado.grupoChave, produto };
    valor = '';
  }
  return { estado: { recurso, grupoChave, produtos, guardado }, produto: valor };
}

export function useProdutoSegueOGrupo({ recurso, grupoChave, produtos, produto, aoTrocar }) {
  const estado = useRef({ recurso, grupoChave, produtos, guardado: null });
  useEffect(() => {
    const r = proximoProduto(estado.current, { recurso, grupoChave, produtos, produto });
    estado.current = r.estado;
    if (r.produto !== produto) aoTrocar(r.produto);
  }, [recurso, grupoChave, produtos, produto, aoTrocar]);
}

/**
 * O TAKT QUE O BOTAO DO PROGRAMA ESCREVEU no Editar e' DAQUELE grupo — a
 * mesma regra do produto: trocar o posto de grupo (inclusive para maquina
 * sem grupo) devolve o campo ao que era; voltar ao grupo devolve o takt do
 * programa. Numero digitado pelo analista no meio do caminho e' dele, e a
 * marca se desfaz. marca: { grupoChave, escrito, anterior, fora } | null.
 */
export function proximaMarcaTakt(marca, { grupoChave, taktSeg }) {
  if (!marca || !grupoChave) return { marca, taktSeg };
  if (grupoChave !== marca.grupoChave) {
    if (marca.fora) return { marca, taktSeg };
    if (taktSeg === marca.escrito) return { marca: { ...marca, fora: true }, taktSeg: marca.anterior };
    return { marca: null, taktSeg };
  }
  if (!marca.fora) return { marca, taktSeg };
  if (taktSeg === marca.anterior) return { marca: { ...marca, fora: false }, taktSeg: marca.escrito };
  return { marca: null, taktSeg };
}

/** O clique no botao. Segundo clique no mesmo grupo nao troca o "anterior":
 *  sem isto, o duplo clique guardava o proprio takt do programa como o
 *  valor a devolver, e ele ia parar no posto da embalagem. */
export function marcarTaktDoPrograma(marca, { grupoChave, escrito, taktSeg }) {
  if (marca && marca.grupoChave === grupoChave && !marca.fora) return { ...marca, escrito };
  return { grupoChave, escrito, anterior: taktSeg, fora: false };
}
