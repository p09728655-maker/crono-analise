/**
 * Sessao semeada para os testes que carregam o APP REAL (nao os harness).
 *
 * O app agora tem porta de entrada: PC pede e-mail e senha, tablet pede
 * pareamento. Estes testes mockam a API inteira via page.route, entao a
 * "sessao" so' precisa existir no localStorage com validade folgada — o
 * token nunca chega a um servidor de verdade.
 *
 * Chamar ANTES do primeiro goto: addInitScript roda a cada navegacao.
 */
export function semearSessao(pagina) {
  return pagina.addInitScript(() => {
    localStorage.setItem('ritmopatrimar.auth', JSON.stringify({
      access: 'token-e2e', refresh: 'refresh-e2e', exp: 9_999_999_999,
    }));
  });
}
