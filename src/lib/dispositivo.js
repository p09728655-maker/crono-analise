import { useEffect, useState } from 'react';

/**
 * Decide qual experiencia abrir por padrao.
 *
 * Coleta e analise sao tarefas diferentes, em posturas diferentes: a coleta
 * acontece de pe' na maquina, a analise sentado no escritorio. Por isso as
 * duas telas sao separadas.
 *
 * O que NAO fazemos: bloquear a analise no celular. Se o analista quiser
 * conferir um numero no chao de fabrica, ele consegue — so' nao e' o padrao.
 * Bloqueio criaria beco sem saida; padrao inteligente, nao.
 */
const LARGURA_DESKTOP = 1024;

export function ehDesktop() {
  if (typeof window === 'undefined') return true;
  const largura = window.innerWidth >= LARGURA_DESKTOP;
  const temMouse = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return largura && temMouse;
}

/** Rota atual, derivada do pathname. */
export function useRota() {
  const [rota, setRota] = useState(() => lerRota());

  useEffect(() => {
    const aoVoltar = () => setRota(lerRota());
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, []);

  const navegar = (caminho) => {
    window.history.pushState({}, '', caminho);
    setRota(lerRota());
  };

  return [rota, navegar];
}

function lerRota() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  if (p.startsWith('/coleta')) return { modo: 'coleta', caminho: p };
  if (p.startsWith('/analise')) return { modo: 'analise', caminho: p };
  // Raiz: manda para a experiencia que faz sentido no aparelho.
  return { modo: ehDesktop() ? 'analise' : 'coleta', caminho: p, padrao: true };
}
