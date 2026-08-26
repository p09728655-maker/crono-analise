/**
 * Quem esta' usando este aparelho.
 *
 * Entrar e sair NAO acontecem mais aqui: o navegador fala direto com o
 * Supabase Auth (/auth/v1/token), que e' quem guarda senha e sessao. Este
 * endpoint so' responde "quem e' o dono deste token" a partir do perfil —
 * e' o que o menu do PC mostra e o que carimba autoria nos estudos.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from './_lib/http.js';
import { hashDoToken } from './_lib/senha.js';

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'DELETE']);
  const auth = await autenticar(req);

  if (req.method === 'GET') {
    // Tablet pareado nao e' uma pessoa: o menu nao tem o que mostrar.
    const usuario = auth.papel === 'coletor' ? null : auth.usuario;
    return json(res, 200, { usuario });
  }

  if (req.method === 'POST') {
    // So' bundle antigo em cache chega aqui. O 410 diz o que fazer, porque
    // quem le esta' diante da tela de entrada, nao do codigo.
    await lerCorpo(req);
    throw new ErroHttp(410,
      'O login mudou de lugar. Recarregue a pagina (Ctrl+F5) para carregar a versao nova do app.');
  }

  // Bundle antigo saindo: encerra a sessao propria enquanto a tabela ainda
  // existir. O caminho novo sai direto no Supabase, sem passar por aqui.
  const bruto = req.headers?.['x-sessao'];
  const token = Array.isArray(bruto) ? bruto[0] : bruto;
  if (token && typeof token === 'string' && token.length <= 200) {
    try {
      await sql`DELETE FROM sessoes WHERE token_hash = ${hashDoToken(token)}`;
    } catch { /* tabela ja' caiu: nao ha' sessao antiga para encerrar */ }
  }
  return json(res, 200, { acao: 'saiu' });
});
