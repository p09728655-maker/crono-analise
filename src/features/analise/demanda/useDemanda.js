/**
 * O PROGRAMA DE PRODUCAO do grupo: cadastro, semanas gravadas e as acoes
 * que mudam dado no servidor.
 *
 * Toda acao passa pelo mesmo contrato (`aplicar`): trava os botoes, limpa
 * o erro anterior, chama o servidor e devolve se deu certo. Quem chamou
 * usa esse retorno para decidir o que limpar — a colagem so' some depois
 * que gravou, e nao no clique, porque falha de rede com a caixa ja' vazia
 * devolve o trabalho de colar de novo.
 *
 * Falha de carga deixa a lista em `null`, nao em vazio. "Nenhuma semana
 * cadastrada" junto de um erro sao duas afirmacoes que se contradizem —
 * uma diz que o cadastro esta' vazio, a outra que nao deu para saber.
 */
import { useEffect, useState } from 'react';
import { chaveSemana } from '../../../domain/demandaSemanal.js';
import {
  atualizarGrupoMaquina, gravarDemanda, limparDemanda, listarCadastroMaquinas, listarDemanda,
  removerSemanaDemanda,
} from '../../../lib/api.js';

/** A lista do servidor com a chave (038-26) que a tela usa para casar. */
const comChave = (lista) => lista.map((d) => ({ ...d, chave: chaveSemana(d) }));

export function useDemanda(grupoInicial) {
  const [cadastro, setCadastro] = useState(null);      // { maquinas, grupos }
  const [grupoId, setGrupoId] = useState(grupoInicial);
  const [semanas, setSemanas] = useState(null);        // as gravadas, do banco
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarCadastroMaquinas()
      .then((c) => {
        setCadastro(c);
        setGrupoId((atual) => atual || c.grupos?.[0]?.id || null);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    if (!grupoId) return;
    setSemanas(null);
    listarDemanda(grupoId)
      .then((lista) => setSemanas(comChave(lista)))
      .catch((e) => setErro(e.message));
  }, [grupoId]);

  const grupo = cadastro?.grupos?.find((g) => g.id === grupoId) || null;

  /** Maquinas ATIVAS do grupo: sao elas que somam tempo disponivel. */
  const maquinasDoGrupo = (cadastro?.maquinas || [])
    .filter((m) => m.grupo_id === grupoId && m.ativa).length;

  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try { await fn(); } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  /** Grava e MESCLA: semana que nao veio na lista fica como esta'. */
  const gravarSemanas = (lista) => aplicar(async () => {
    setSemanas(comChave(await gravarDemanda(grupoId, lista)));
  });

  // Os quatro numeros sobem juntos: sao UMA decisao (o tempo disponivel do
  // grupo), e salvar um de cada vez deixaria a conta pela metade entre
  // dois cliques. Campo vazio apaga — e' como se diz "nao sei".
  const salvarTempo = (valores) => aplicar(async () => {
    const atualizado = await atualizarGrupoMaquina(grupoId, valores);
    setCadastro((c) => ({
      ...c,
      grupos: c.grupos.map((g) => (g.id === grupoId ? { ...g, ...atualizado } : g)),
    }));
  });

  const apagarSemana = (s) => aplicar(async () => {
    setSemanas(comChave(await removerSemanaDemanda(grupoId, s)));
  });

  const apagarTudo = () => aplicar(async () => {
    await limparDemanda(grupoId);
    setSemanas([]);
  });

  return {
    cadastro, grupo, grupoId, escolherGrupo: setGrupoId, maquinasDoGrupo,
    semanas, erro, ocupado,
    gravarSemanas, salvarTempo, apagarSemana, apagarTudo,
  };
}
