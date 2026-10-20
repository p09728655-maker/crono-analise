import { useEffect, useMemo, useState } from 'react';
import { nomeChave, unidadeDoPosto } from '../../../domain/cronoanalise.js';
import { medicaoDoEstudo } from '../../../domain/medicaoDoEstudo.js';
import { volumesDoProduto } from '../../../domain/volumes.js';
import { listarConferenciasServidor } from '../../../lib/api.js';
import {
  carregarMaquinas, grupoIdDaMaquina, maquinasAtivas, produtosDoGrupo, useCadastroMaquinas,
} from '../../../lib/maquinas.js';

/**
 * A MEDICAO DA LINHA para o estudo aberto — a carga e o casamento.
 *
 * Corre em PARALELO ao estudo e nunca derruba o painel: o estudo de tempos
 * se le' inteiro sem a medicao, e uma falha aqui vira uma frase no quadro
 * de capacidade, nao uma tela de erro. Mesma regra da Embalagem Takt Time
 * no PC com o programa da semana.
 *
 * Duas cargas: as medicoes (a lista inteira — o filtro por posto e produto
 * e' feito no dominio, por nomeChave) e o cadastro de maquinas, que diz o
 * grupo do posto, a UNIDADE que o tablet contou ali (peca ou volume) e os
 * volumes do produto. O cadastro vem do cache do aparelho e e' atualizado
 * pelo servidor; a conta so' sai depois que o servidor responde (ou falha),
 * porque com o cache vazio a embalagem seria lida como peca por um
 * instante — volumes/h com rotulo de pecas/h.
 *
 * Devolve { estado: 'carregando' | 'erro' | 'pronto', erro, medicao,
 * postoNoCadastro }.
 */
export function useMedicaoDoEstudo(estudo) {
  const cadastro = useCadastroMaquinas();
  const [carga, setCarga] = useState({ estado: 'carregando', conferencias: [] });

  useEffect(() => {
    let vivo = true;
    Promise.all([
      carregarMaquinas(),
      listarConferenciasServidor(),
    ])
      .then(([doServidor, r]) => {
        if (!vivo) return;
        // Servidor sem resposta E aparelho sem cadastro: nao ha' como saber
        // se o posto conta peca ou volume. Melhor dizer que nao deu do que
        // chutar peca para uma embalagem.
        // (maquinasAtivas le' o cadastro do modulo na hora: o `cadastro` do
        // hook, aqui dentro, ainda seria o do primeiro render.)
        const semCadastro = !doServidor && !maquinasAtivas().length;
        if (semCadastro) {
          setCarga({ estado: 'erro', erro: 'cadastro de máquinas indisponível', conferencias: [] });
          return;
        }
        // Resposta fora do formato (o harness devolve o mesmo corpo para
        // toda URL) vale como lista vazia, nao como erro.
        setCarga({ estado: 'pronto', conferencias: Array.isArray(r?.conferencias) ? r.conferencias : [] });
      })
      .catch((e) => {
        if (vivo) setCarga({ estado: 'erro', erro: e?.message || 'falha de rede', conferencias: [] });
      });
    return () => { vivo = false; };
  }, []);

  const recurso = estudo?.recurso || '';
  const produto = estudo?.produto || '';

  const leitura = useMemo(() => {
    if (carga.estado !== 'pronto') return { medicao: null, postoNoCadastro: null };
    const grupoId = grupoIdDaMaquina(cadastro, recurso);
    const grupo = (cadastro?.grupos || []).find((g) => g && g.id === grupoId) || null;
    // Posto fora do cadastro (ou sem grupo) conta PECA: o tablet so' conta
    // volume na Embalagem Takt Time, que exige a maquina num grupo embalagem.
    const unidade = unidadeDoPosto(grupo?.nome);
    return {
      medicao: medicaoDoEstudo({
        conferencias: carga.conferencias,
        recurso,
        produto,
        unidade,
        volumes: volumesDoProduto(produtosDoGrupo(cadastro, grupoId), produto),
        agora: Date.now(),
      }),
      // Estudo com o nome do GRUPO no posto ("EMBALAGEM") nunca casa: a
      // medicao grava a MAQUINA ("EMBALAGEM 01"). A tela precisa dizer isso.
      postoNoCadastro: (cadastro?.maquinas || []).some((m) => m && nomeChave(m.nome) === nomeChave(recurso)),
    };
  }, [carga, cadastro, recurso, produto]);

  return { estado: carga.estado, erro: carga.erro || null, ...leitura };
}
