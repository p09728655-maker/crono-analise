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
import { listarDemanda } from './api.js';
import { grupoIdDaMaquina, produtosDoGrupo, useCadastroMaquinas } from './maquinas.js';

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

const inicial = (grupoId) => ({ grupoId, demandas: grupoId ? lerCache(grupoId) : null, semRede: false });

export function useTaktDaSemana({ grupo, maquinasDoGrupo }) {
  const grupoId = grupo?.id || null;
  /* O programa fica guardado JUNTO do grupo a que pertence. No Novo estudo
     o analista troca de posto: sem o grupo ao lado, o programa da
     furadeira valeria por um instante para a fresadora. */
  const [lido, setLido] = useState(() => inicial(grupoId));
  const atual = useMemo(() => (lido.grupoId === grupoId ? lido : inicial(grupoId)), [lido, grupoId]);
  const { demandas, semRede } = atual;

  useEffect(() => {
    if (!grupoId) return undefined;
    let vivo = true;
    setLido(inicial(grupoId));
    listarDemanda(grupoId)
      .then((lista) => {
        if (!vivo) return;
        gravarCache(grupoId, lista);
        setLido({ grupoId, demandas: lista, semRede: false });
      })
      .catch(() => { if (vivo) setLido((s) => (s.grupoId === grupoId ? { ...s, semRede: true } : s)); });
    return () => { vivo = false; };
  }, [grupoId]);

  return useMemo(() => {
    if (!grupo) return { taktMs: null, estado: 'sem-grupo', semana: null, semRede };
    // Sem programa nenhum ainda (primeira abertura sem rede): nao ha' o que
    // calcular, e a tela diz que falta rede, nao que falta programa.
    if (demandas === null) return { taktMs: null, estado: semRede ? 'sem-rede' : 'carregando', semana: null, semRede };
    const t = taktDaMedicao({
      demandas,
      horas: grupo.horas_semana,
      maquinas: maquinasDoGrupo,
      setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
      data: new Date().toISOString(),
      // O takt nao depende do ritmo; a leitura so' precisa de algum.
      pecas: 1,
      duracaoMs: 3600000,
    });
    return { ...t, semRede };
  }, [grupo, maquinasDoGrupo, demandas, semRede]);
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
  const grupoId = grupoIdDaMaquina(cadastro, recurso);
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
  return { grupo, maquinasDoGrupo, produtos, takt };
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

export function useProdutoSegueOGrupo({ grupoId, produtos, produto, aoLimpar }) {
  const anterior = useRef({ grupoId, produtos });
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = { grupoId, produtos };
    if (antes.grupoId === grupoId) return;
    if (produtoDeOutroGrupo({ produto, antes: antes.produtos, depois: produtos })) aoLimpar();
  }, [grupoId, produtos, produto, aoLimpar]);
}
