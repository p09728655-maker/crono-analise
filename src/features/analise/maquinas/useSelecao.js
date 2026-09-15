/**
 * O QUE ESTA' SENDO OLHADO e o que esta' ARMADO.
 *
 * Grupo escolhido e busca dizem o que aparece; `excluindo` e
 * `excluindoGrupo` dizem qual botao vermelho esta' pronto na tela. Os
 * quatro moram juntos porque as regras que os desarmam cruzam a tela
 * inteira — a busca fica no painel da direita e arma/desarma a exclusao de
 * grupo, que fica na coluna da esquerda.
 */
import { useEffect, useState } from 'react';
import { TODAS, SEM_GRUPO } from './grupos.js';

export function useSelecao({ grupos, maquinas, ocupado, aoFechar }) {
  /**
   * O GRUPO ESCOLHIDO na coluna da esquerda manda em tudo: filtra a lista
   * e ja' entra como grupo da proxima maquina cadastrada. E' o que tira a
   * lista suspensa do caminho — cadastrar oito furadeiras deixa de ser oito
   * idas ao seletor.
   */
  const [escolhido, setEscolhido] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const [excluindo, setExcluindo] = useState(null);         // id da maquina a confirmar
  const [excluindoGrupo, setExcluindoGrupo] = useState(false);

  /**
   * Trocar de grupo ou mexer na busca DESARMA a confirmacao de exclusao.
   *
   * Sem isto ela ficava presa: armar "Excluir" numa maquina, passear por
   * outro grupo e voltar mostrava o botao vermelho pronto, sem ninguem ter
   * pedido de novo.
   */
  useEffect(() => { setExcluindo(null); setExcluindoGrupo(false); }, [escolhido, busca]);

  /**
   * ESC desarma a confirmacao; sem nada armado, fecha a janela.
   *
   * A confirmacao deixa um botao vermelho pronto na tela: precisa existir
   * um jeito de sair dela que nao seja mirar o "Cancelar" com o mouse.
   */
  useEffect(() => {
    const aoTeclar = (ev) => {
      if (ev.key !== 'Escape') return;
      if (excluindo || excluindoGrupo) {
        setExcluindo(null);
        setExcluindoGrupo(false);
        return;
      }
      if (!ocupado) aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [excluindo, excluindoGrupo, ocupado, aoFechar]);

  /**
   * Grupo escolhido que sumiu do cadastro (excluido em outro PC) volta para
   * "Todas". Sem isto a tela escrevia "em Sem grupo" e mandava o id morto
   * para a API, que respondia 404 — rotulo e efeito discordando.
   */
  useEffect(() => {
    if (escolhido === TODAS || escolhido === SEM_GRUPO) return;
    if (maquinas != null && !grupos.some((g) => g.id === escolhido)) setEscolhido(TODAS);
  }, [escolhido, grupos, maquinas]);

  return {
    escolhido, setEscolhido, busca, setBusca,
    excluindo, setExcluindo, excluindoGrupo, setExcluindoGrupo,
  };
}
