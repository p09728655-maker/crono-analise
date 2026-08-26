import { useCallback, useEffect, useState } from 'react';

/**
 * Roteamento por URL.
 *
 * Antes, so' o modo (coleta/analise) vivia na URL e o resto — qual estudo
 * estava aberto, qual operacao — vivia em memoria. O custo disso aparecia
 * no uso: o botao Voltar do navegador nao funcionava, recarregar jogava o
 * usuario para o inicio, e nao dava para guardar o link de um estudo. Num
 * app instalado, onde Voltar e' o gesto natural, isso e' pior ainda.
 *
 * Agora o caminho descreve o estado inteiro:
 *
 *   /                                    raiz — decide pelo aparelho
 *   /coleta                              lista (celular)
 *   /coleta/rapida                       conferencia rapida, sem cadastro
 *   /coleta/estudo/<id>                  operacoes do estudo
 *   /coleta/estudo/<id>/operacao/<opId>  cronometro no posto
 *   /analise                             lista (PC)
 *   /analise/estudo/<id>                 painel de analise
 *   /analise/conferencias                relatorio das conferencias por maquina
 *
 * Voltar, avancar, recarregar e link direto passam a funcionar de graca,
 * porque quem guarda o estado e' o historico do navegador.
 */

const LARGURA_DESKTOP = 1024;

/**
 * Decide a experiencia inicial.
 *
 * Exige tela larga E ponteiro preciso: tablet grande com toque continua indo
 * para a coleta, que e' onde ele costuma ser usado. A escolha e' so' o
 * padrao — as duas rotas seguem acessiveis de qualquer aparelho.
 */
export function ehDesktop() {
  if (typeof window === 'undefined') return true;
  const largura = window.innerWidth >= LARGURA_DESKTOP;
  const temMouse = window.matchMedia?.('(pointer: fine)').matches ?? false;
  return largura && temMouse;
}

const RE_ESTUDO = /^\/(coleta|analise)\/estudo\/([0-9a-f-]{36})(?:\/operacao\/([0-9a-f-]{36}))?\/?$/i;

export function analisarCaminho(caminho) {
  // Corta query e ancora antes de casar: a rota e' o CAMINHO. Sem isto um
  // link com "?editar=1" (ou um utm colado pelo usuario) nao casaria com
  // nada e cairia no padrao — o app voltava para a lista sozinho.
  const semQuery = String(caminho || '/').split(/[?#]/)[0];
  const p = semQuery.replace(/\/+$/, '') || '/';

  const m = RE_ESTUDO.exec(p);
  if (m) {
    return {
      modo: m[1].toLowerCase(),
      estudoId: m[2],
      operacaoId: m[3] || null,
      tela: m[3] ? 'coleta' : 'estudo',
    };
  }

  // Conferencia rapida: cronometro avulso, sem estudo — nao carrega nada.
  if (/^\/coleta\/rapida\/?$/i.test(p)) return { modo: 'coleta', tela: 'rapida', estudoId: null, operacaoId: null };

  if (/^\/coleta\/?$/i.test(p)) return { modo: 'coleta', tela: 'lista', estudoId: null, operacaoId: null };
  if (/^\/analise\/conferencias\/?$/i.test(p)) return { modo: 'analise', tela: 'conferencias', estudoId: null, operacaoId: null };

  if (/^\/analise\/?$/i.test(p)) return { modo: 'analise', tela: 'lista', estudoId: null, operacaoId: null };

  // Raiz (ou caminho desconhecido): manda para a experiencia do aparelho.
  return {
    modo: ehDesktop() ? 'analise' : 'coleta',
    tela: 'lista',
    estudoId: null,
    operacaoId: null,
    padrao: true,
  };
}

export function useRota() {
  const [rota, setRota] = useState(() => analisarCaminho(window.location.pathname));

  useEffect(() => {
    const aoNavegar = () => setRota(analisarCaminho(window.location.pathname));
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
  }, []);

  const navegar = useCallback((caminho, { substituir = false } = {}) => {
    // Compara com caminho + query: ir de /x para /x?editar=1 e' navegacao,
    // nao repeticao.
    if (caminho === `${window.location.pathname}${window.location.search}`) return;
    if (substituir) window.history.replaceState({}, '', caminho);
    else window.history.pushState({}, '', caminho);
    setRota(analisarCaminho(caminho));
  }, []);

  const voltar = useCallback(() => window.history.back(), []);

  return [rota, navegar, voltar];
}

/** Monta caminhos num lugar so', para nao espalhar string pelo codigo. */
export const caminhos = {
  lista: (modo) => `/${modo}`,
  rapida: () => '/coleta/rapida',
  conferencias: () => '/analise/conferencias',
  estudo: (modo, estudoId) => `/${modo}/estudo/${estudoId}`,
  coletar: (estudoId, operacaoId) => `/coleta/estudo/${estudoId}/operacao/${operacaoId}`,
};
