/**
 * Memoria da ultima versao que ESTE aparelho ja' viu.
 *
 * O deploy troca o app por baixo do usuario, sem aviso — a tela so'
 * "amanhece diferente". A faixa de atualizacao responde a pergunta que
 * isso provoca ("o que mudou?") no momento em que ela surge, uma vez,
 * e aponta para o historico completo.
 *
 * Vive no localStorage porque a pergunta e' por aparelho, nao por conta:
 * o mesmo analista no tablet da fabrica e no PC do escritorio ve o aviso
 * em cada um, que e' onde cada tela mudou.
 */
const CHAVE = 'ritmopatrimar.versaoVista';

/**
 * Decide o que fazer ao abrir o app. Pura, para ser testavel:
 *  - 'primeira': nunca viu versao nenhuma — grava em silencio, sem faixa.
 *    Pode ser usuario novo, e saudar recem-chegado com "atualizamos!" e'
 *    falar de um passado que ele nao viveu.
 *  - 'igual':    mesma versao de sempre — nada a dizer.
 *  - 'nova':     a versao mudou desde a ultima visita — mostra a faixa.
 */
export function estadoDaVersao(vista, atual) {
  if (!atual) return 'igual';
  if (!vista) return 'primeira';
  return vista === atual ? 'igual' : 'nova';
}

export function versaoVista() {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}

export function marcarVersaoVista(versao) {
  // Sem storage (modo privado, permissao negada) o aviso apareceria a cada
  // visita — pior que nao aparecer. O estadoDaVersao devolve 'primeira'
  // nesse caso, entao a faixa nunca surge e nada quebra.
  try { localStorage.setItem(CHAVE, versao); } catch { /* segue sem memoria */ }
}
