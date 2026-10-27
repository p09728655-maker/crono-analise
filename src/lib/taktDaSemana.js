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
import { useEffect, useMemo, useState } from 'react';
import { unidadeDoPosto } from '../domain/cronoanalise.js';
import { taktDaMedicao } from '../domain/demandaSemanal.js';
import { nomeChave } from '../domain/cronoanalise.js';
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
/** O numero da meia hora corrente: muda as :00 e as :30. */
const janelaAtual = () => Math.floor(Date.now() / 1800000);

export function useTaktDaSemana({ grupo, maquinasDoGrupo }) {
  const grupoId = grupo?.id || null;
  const [lido, setLido] = useState(() => inicial(grupoId));
  const atual = useMemo(() => programaLido(lido, grupoId), [lido, grupoId]);
  const { demandas, semRede, doServidor } = atual;

  /* O DIA e a JANELA de meia hora, revistos a cada minuto. O tablet da
     embalagem fica ligado de um dia para o outro: o dia novo troca a
     semana do takt, e a janela faz o programa ser buscado de novo a cada
     30 minutos — a semana nova costuma ser colada com a tela ja' aberta (o
     PCP cola de manha), e buscar so' na virada a deixava de fora o dia
     inteiro. A meia-noite de SP (03h UTC) cai numa troca de janela, entao
     a virada tambem busca. So' redesenha quando um dos dois muda. */
  const [hoje, setHoje] = useState(diaDeHoje);
  const [janela, setJanela] = useState(janelaAtual);
  useEffect(() => {
    const id = setInterval(() => { setHoje(diaDeHoje()); setJanela(janelaAtual()); }, 60000);
    return () => clearInterval(id);
  }, []);

  /* Busca de novo a cada janela de 30 min, nao so' quando o grupo muda
     (ver acima). Uma GET por grupo a cada meia hora, e o guardado no
     aparelho segue valendo enquanto a busca nao responde. */
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
  }, [grupoId, janela]);

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
  // A maquina do cadastro (ou null): separa "sem grupo" de "fora do cadastro".
  const maquina = maquinaDoCadastro(cadastro, recurso);
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
    cadastro, grupo, noCadastro: Boolean(maquina), maquinasDoGrupo, produtos, takt,
    semCadastro: vazio && busca === 'falhou',
    buscandoCadastro: vazio && (busca === 'buscando' || busca === 'nunca'),
    buscaFalhou: busca === 'falhou',
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
    // Semana da planilha programada so' em parte: a jornada acima ja' e' so'
    // a desses dias, e o painel diz quantos (senao 35h12min parece erro).
    dias: takt.dias ?? null,
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
 * O PRODUTO TEM DE SER DO POSTO — conferido, nao adivinhado.
 *
 * A tela nao troca o produto sozinha quando o posto muda (tentar adivinhar
 * a intencao a cada tecla gerava um caso novo a cada revisao: a seta do
 * teclado, o nome pela metade, o cadastro chegando atrasado). Em vez
 * disso, ela AVISA e nao deixa gravar a combinacao errada: produto que e'
 * da lista de OUTRO grupo num posto que nao e' desse grupo. Produto
 * digitado a mao (de lista nenhuma) e' do analista e passa.
 *
 * Devolve null quando esta' tudo certo, ou { texto, grupos } para a tela.
 * Sem cadastro no aparelho nao ha' como conferir: passa.
 */
export function conflitoDoProduto({ produto, recurso, cadastro, grupo } = {}) {
  const chave = nomeChave(produto || '');
  if (!chave || !(cadastro?.produtos || []).length) return null;
  const donos = (cadastro.produtos || []).filter((p) => p && nomeChave(p.nome) === chave);
  if (!donos.length) return null;
  if (grupo && donos.some((p) => p.grupo_id === grupo.id)) return null;
  const grupos = [...new Set(donos.map((p) => p.grupo_id))]
    .map((id) => (cadastro.grupos || []).find((g) => g && g.id === id))
    .filter(Boolean)
    .map(rotuloDoGrupo);
  const posto = recurso ? `o posto ${recurso}` : 'o posto';
  const doPosto = grupo ? `${posto} é do ${rotuloDoGrupo(grupo)}` : `${posto} não é desse grupo`;
  return {
    grupos,
    texto: `${produto} é produto do ${grupos.join(' e do ') || 'cadastro de outro grupo'}, e ${doPosto}. `
      + 'Escolha um produto deste posto, ou troque o posto.',
  };
}

/**
 * O TAKT QUE O BOTAO DO PROGRAMA ESCREVEU (Editar estudo) e' do grupo em
 * que foi clicado. Se o posto mudou de grupo depois, a tela avisa e nao
 * deixa gravar esse numero — o analista digita o takt, ou usa o programa
 * do grupo novo. Nada e' trocado sozinho. marca: { grupoId, grupo, escrito }
 * do clique; digitar no campo desfaz a marca (o numero passa a ser dele).
 */
export function conflitoDoTakt({ marca, grupo, taktSeg } = {}) {
  if (!marca || taktSeg !== marca.escrito) return null;
  if (grupo && grupo.id === marca.grupoId) return null;
  return {
    texto: `Este takt (${marca.escrito} s) veio do programa do ${marca.grupo}, e o posto agora `
      + `${grupo ? `é do ${rotuloDoGrupo(grupo)}` : 'não é desse grupo'}. `
      + 'Digite o takt ou use o programa do grupo do posto.',
  };
}
