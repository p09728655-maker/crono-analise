/**
 * "Esqueci minha senha" — o pedido do link, filtrado pelo servidor.
 *
 * POR QUE NAO FALA DIRETO COM O GOTRUE, como entrar e sair fazem.
 * O /recover do Supabase manda link para QUALQUER conta que exista, e neste
 * sistema existe um tipo de conta que nao pode entrar: o analista cadastrado
 * SEM senha, criado so' para ser escolhido na lista de estudos (api/usuarios.js
 * chama isso de identidade que nao abre login). Se o navegador chamasse o
 * /recover, essa pessoa criaria a propria senha pelo link e entraria com o
 * papel dela, sem ninguem autorizar — a decisao "esta pessoa nao entra"
 * viraria letra morta. O filtro precisa acontecer onde da' para consultar o
 * banco, e isso e' aqui.
 *
 * PELA MESMA RAZAO FICAM DE FORA o inativo — desativar tem de encerrar o
 * acesso, nao adia-lo ate' o proximo e-mail — e o tablet: conta de papel
 * 'coletor' tem e-mail inventado (@dispositivo.ritmopatrimar.app) e se
 * recupera pareando de novo no PC (api/dispositivos.js).
 *
 * A RESPOSTA E' SEMPRE A MESMA — e-mail cadastrado ou nao, com senha ou sem,
 * envio bem-sucedido ou falho. Responder diferente entregaria de graca quem
 * tem acesso ao sistema, que e' a mesma razao da mensagem unica de credencial
 * errada na tela de entrada. O preco e' que falha de SMTP nao chega a quem
 * clicou: por isso a tela ja' diz, junto da confirmacao, o que fazer se o
 * e-mail nao vier — e a falha fica no log do servidor para o administrador.
 *
 * PUBLICO de proposito: quem esqueceu a senha nao tem sessao para autenticar.
 * Quem limita a frequencia e' o proprio GoTrue.
 */
import { sql } from './_lib/db.js';
import { handler, json, lerCorpo, permitir } from './_lib/http.js';
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

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const corpo = await lerCorpo(req);
  const email = texto(corpo.email, 'email', { max: 200 });
  const destino = texto(corpo.destino, 'destino', { max: 300 });

  if (email) {
    const [conta] = await podeReceberLink(email);
    if (conta) await enviarLink(email, destino);
  }

  return json(res, 200, { ok: true });
});
