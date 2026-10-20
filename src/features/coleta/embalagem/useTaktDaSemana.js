/**
 * O TAKT DA SEMANA, no tablet — por volume, em ms.
 *
 * A conta e' a mesma do PC (taktDaMedicao: programa da semana, jornada e
 * setup planejado do grupo), com a data de HOJE. O que muda e' de onde vem
 * o dado: o grupo sai do cadastro em cache (lib/maquinas.js) e o programa
 * do servidor — guardado no aparelho a cada leitura, porque o tablet da
 * embalagem perde rede e o takt nao pode sumir junto com ela.
 *
 * Programa velho no cache nao engana ninguem: a semana e' casada pela data,
 * e semana que o cache nao cobre devolve 'sem-semana', nao o takt de outra.
 */
import { useEffect, useMemo, useState } from 'react';
import { taktDaMedicao } from '../../../domain/demandaSemanal.js';
import { listarDemanda } from '../../../lib/api.js';

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

export function useTaktDaSemana({ grupo, maquinasDoGrupo }) {
  const grupoId = grupo?.id || null;
  const [demandas, setDemandas] = useState(() => (grupoId ? lerCache(grupoId) : null));
  const [semRede, setSemRede] = useState(false);

  useEffect(() => {
    if (!grupoId) return undefined;
    let vivo = true;
    setDemandas(lerCache(grupoId));
    listarDemanda(grupoId)
      .then((lista) => {
        if (!vivo) return;
        gravarCache(grupoId, lista);
        setDemandas(lista);
        setSemRede(false);
      })
      .catch(() => { if (vivo) setSemRede(true); });
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
 * Por que nao ha' takt, em palavras de chao de fabrica.
 *
 * null = nao avisar. Programa nao colado e' assunto do PCP, nao de quem
 * esta' no tablet: la' ninguem tem o que fazer com o aviso, e a tela do PC
 * (Embalagem Takt Time) continua dizendo que falta o programa.
 */
export function motivoSemTakt(estado) {
  switch (estado) {
    case 'carregando': return 'Buscando o programa da semana…';
    case 'sem-rede': return 'Sem rede: o programa da semana ainda não chegou a este aparelho.';
    case 'sem-grupo': return 'A máquina não está no grupo EMBALAGEM do cadastro.';
    case 'sem-demanda': return null;
    case 'sem-semana': return 'O programa da embalagem não cobre esta semana.';
    case 'sem-horas': return 'Faltam as horas da semana do grupo EMBALAGEM no cadastro.';
    case 'setup-excede': return 'O setup cadastrado da embalagem passa da jornada.';
    default: return 'Sem takt para esta semana.';
  }
}
