import { useCallback, useEffect, useMemo, useState } from 'react';
import { nomeChave, unidadeDoPosto } from '../../../domain/cronoanalise.js';
import { medicaoDoEstudo, unidadeDoEstudo } from '../../../domain/medicaoDoEstudo.js';
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
 * Tres cargas: as medicoes (a lista inteira — o filtro por posto e produto
 * e' feito no dominio, por nomeChave), as ARQUIVADAS (so' para contar: o
 * "nenhuma medicao" precisa saber se elas existem, guardadas) e o cadastro
 * de maquinas, que diz o grupo do posto, a UNIDADE que o tablet contou ali
 * (peca ou volume), o setup planejado do grupo e os volumes do produto. O
 * cadastro vem do cache do aparelho e e' atualizado pelo servidor; a conta
 * so' sai depois que o servidor responde (ou falha), porque com o cache
 * vazio a embalagem seria lida como peca por um instante — volumes/h com
 * rotulo de pecas/h.
 *
 * Devolve { estado: 'carregando' | 'erro' | 'pronto', erro, medicao,
 * postoNoCadastro, unidadeEstudo, recarregar }. `unidadeEstudo` ('peça' ou
 * 'produto') vale em qualquer estado: e' o que o resto do estudo escreve
 * ao lado dos numeros por hora.
 */
export function useMedicaoDoEstudo(estudo) {
  const cadastro = useCadastroMaquinas();
  const [carga, setCarga] = useState({ estado: 'carregando', conferencias: [], arquivadas: null });
  // "Tentar de novo" do cartao: o painel recarrega so' o estudo, e a carga
  // daqui corria uma vez so' — depois de um erro, so' recarregando a pagina.
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    // Na primeira carga o estado ja' nasce 'carregando'; na nova tentativa
    // o cartao volta ao "buscando" em vez de ficar no erro velho.
    if (tentativa > 0) setCarga({ estado: 'carregando', conferencias: [], arquivadas: null });
    Promise.all([
      carregarMaquinas(),
      listarConferenciasServidor(),
      // As arquivadas so' para CONTAR. Falha aqui nao derruba a medicao:
      // vira "nao se sabe" (null), como na Embalagem Takt Time do PC.
      listarConferenciasServidor({ arquivadas: true }).catch(() => null),
    ])
      .then(([doServidor, r, arq]) => {
        if (!vivo) return;
        // Servidor sem resposta E aparelho sem cadastro: nao ha' como saber
        // se o posto conta peca ou volume. Melhor dizer que nao deu do que
        // chutar peca para uma embalagem.
        // (maquinasAtivas le' o cadastro do modulo na hora: o `cadastro` do
        // hook, aqui dentro, ainda seria o do primeiro render.)
        const semCadastro = !doServidor && !maquinasAtivas().length;
        if (semCadastro) {
          setCarga({ estado: 'erro', erro: 'cadastro de máquinas indisponível', conferencias: [], arquivadas: null });
          return;
        }
        // Resposta fora do formato (o harness devolve o mesmo corpo para
        // toda URL) vale como lista vazia, nao como erro.
        setCarga({
          estado: 'pronto',
          conferencias: Array.isArray(r?.conferencias) ? r.conferencias : [],
          arquivadas: Array.isArray(arq?.conferencias) ? arq.conferencias : null,
        });
      })
      .catch((e) => {
        if (vivo) setCarga({ estado: 'erro', erro: e?.message || 'falha de rede', conferencias: [], arquivadas: null });
      });
    return () => { vivo = false; };
  }, [tentativa]);

  const recurso = estudo?.recurso || '';
  const produto = estudo?.produto || '';

  // O grupo do posto, do cadastro que houver (cache ou servidor).
  const grupoId = grupoIdDaMaquina(cadastro, recurso);
  const grupo = (cadastro?.grupos || []).find((g) => g && g.id === grupoId) || null;
  const unidadeEstudo = unidadeDoEstudo(grupo?.nome);

  const leitura = useMemo(() => {
    if (carga.estado !== 'pronto') return { medicao: null, postoNoCadastro: null };
    // Posto fora do cadastro (ou sem grupo) conta PECA: o tablet so' conta
    // volume na Embalagem Takt Time, que exige a maquina num grupo embalagem.
    const unidade = unidadeDoPosto(grupo?.nome);
    return {
      medicao: medicaoDoEstudo({
        conferencias: carga.conferencias,
        arquivadas: carga.arquivadas,
        recurso,
        produto,
        unidade,
        // Com os desativados: o rack desativado continua tendo dois
        // volumes, e o estudo de antes continua sendo dele.
        volumes: volumesDoProduto(produtosDoGrupo(cadastro, grupoId, { comInativos: true }), produto),
        // O setup planejado do grupo: com ele, o setup marcado sai do
        // relogio (ja' esta' no takt). Mesmos campos do Ritmo/Demanda.
        setup: grupo
          ? { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min }
          : null,
        agora: Date.now(),
      }),
      // Estudo com o nome do GRUPO no posto ("EMBALAGEM") nunca casa: a
      // medicao grava a MAQUINA ("EMBALAGEM 01"). A tela precisa dizer isso.
      postoNoCadastro: (cadastro?.maquinas || []).some((m) => m && nomeChave(m.nome) === nomeChave(recurso)),
    };
  }, [carga, cadastro, grupo, grupoId, recurso, produto]);

  return {
    estado: carga.estado, erro: carga.erro || null, ...leitura, unidadeEstudo, recarregar,
  };
}
