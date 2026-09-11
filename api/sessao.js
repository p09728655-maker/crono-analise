/**
 * Quem esta' usando este aparelho — e quem esqueceu a senha.
 *
 * Entrar e sair NAO acontecem mais aqui: o navegador fala direto com o
 * Supabase Auth (/auth/v1/token), que e' quem guarda senha e sessao. Este
 * endpoint responde "quem e' o dono deste token" a partir do perfil — e' o
 * que o menu do PC mostra e o que carimba autoria nos estudos.
 *
 * POR QUE A RECUPERACAO DE SENHA MORA AQUI, e nao em api/recuperar-senha.js,
 * que seria o nome obvio. O plano Hobby da Vercel aceita 12 funcoes
 * serverless por deploy, e o projeto ja' estava exatamente nas 12: o arquivo
 * separado virava a 13a e o deploy inteiro falhava — nao so' o endpoint
 * novo, o app todo parava de publicar. Juntar aqui e' a escolha certa entre
 * as ruins: 'a sessao' e' o assunto de quem esta' tentando entrar, e
 * recuperar senha e' exatamente isso. Se um dia o projeto for para o plano
 * Pro, vale separar de novo.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from './_lib/http.js';
import { hashDoToken } from './_lib/senha.js';
import { CHAVE_PUBLICAVEL, URL_SUPABASE } from './_lib/supabase.js';
import { texto } from './_lib/validar.js';

/**
 * Quem pode receber link: existe, esta ativo, e' pessoa e JA' TEM senha.
 *
 * A senha e' conferida em auth.users porque e' la' que ela mora — public
 * nao guarda credencial nenhuma. Vazio e' o que `criarContaAuth` grava para
 * conta sem senha, e nao confere com senha alguma.
 */
const podeReceberLink = (email) => sql`
  SELECT u.id
    FROM usuarios u
    JOIN auth.users a ON a.id = u.id
   WHERE lower(u.email) = lower(${email})
     AND u.ativo
     AND u.papel <> 'coletor'
     AND a.encrypted_password IS NOT NULL
     AND a.encrypted_password <> ''`;

/**
 * O `destino` vem do navegador porque a mesma instalacao atende endereco de
 * producao e de pre-visualizacao. Nao e' porta de redirecionamento aberto: o
 * GoTrue so' aceita URL que esteja na lista de autorizadas do projeto e
 * ignora o resto, caindo na Site URL.
 */
async function enviarLink(email, destino) {
  const caminho = destino
    ? `/auth/v1/recover?redirect_to=${encodeURIComponent(destino)}`
    : '/auth/v1/recover';
  const resposta = await fetch(`${URL_SUPABASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CHAVE_PUBLICAVEL },
    body: JSON.stringify({ email }),
  });
  if (!resposta.ok) {
    // Sem servidor de e-mail configurado no projeto, e' aqui que aparece.
    // Nao vira erro para quem clicou (ver o cabecalho), mas nao pode sumir.
    console.error('[ritmopatrimar] recuperacao de senha nao enviada:', resposta.status);
  }
}

/**
 * O pedido do link. PUBLICO — quem esqueceu a senha nao tem sessao para
 * autenticar; por isso ele e' resolvido ANTES do autenticar() la' embaixo.
 */
async function pedirRecuperacao(res, corpo) {
  const email = texto(corpo.email, 'email', { max: 200 });
  const destino = texto(corpo.destino, 'destino', { max: 300 });

  if (email) {
    const [conta] = await podeReceberLink(email);
    if (conta) await enviarLink(email, destino);
  }

  return json(res, 200, { ok: true });
}

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'DELETE']);

  // Antes de autenticar: este e' o unico caminho daqui que atende quem NAO
  // tem sessao. Exigir token seria exigir justamente o que a pessoa perdeu.
  if (req.method === 'POST') {
    const corpo = await lerCorpo(req);
    if (corpo?.acao === 'recuperar-senha') return pedirRecuperacao(res, corpo);
    // So' bundle antigo em cache chega aqui. O 410 diz o que fazer, porque
    // quem le esta' diante da tela de entrada, nao do codigo.
    throw new ErroHttp(410,
      'O login mudou de lugar. Recarregue a pagina (Ctrl+F5) para carregar a versao nova do app.');
  }

  const auth = await autenticar(req);

  if (req.method === 'GET') {
    // Tablet pareado nao e' uma pessoa: o menu nao tem o que mostrar.
    const usuario = auth.papel === 'coletor' ? null : auth.usuario;
    return json(res, 200, { usuario });
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
