/**
 * Entrar e sair — identificacao do analista no PC.
 *
 * Leia api/_lib/senha.js antes de confiar nisto para qualquer coisa: NAO e'
 * controle de acesso. O token de servico abre a API sozinho, com ou sem
 * sessao, porque o tablet precisa entrar sem senha. O que a sessao responde
 * e' "quem esta usando este computador", e e' isso que carimba autoria nos
 * estudos.
 */
import { sql } from './_lib/db.js';
import { autenticar, usuarioDaSessao } from './_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from './_lib/http.js';
import { texto } from './_lib/validar.js';
import { HORAS_DE_SESSAO, conferirSenha, hashDoToken, novoTokenSessao } from './_lib/senha.js';

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'DELETE']);
  const { empresaId } = await autenticar(req);

  // Quem sou eu. Sem sessao devolve null — nao e' erro: o app funciona
  // inteiro sem ninguem identificado, como sempre funcionou.
  if (req.method === 'GET') {
    return json(res, 200, { usuario: await usuarioDaSessao(req, empresaId) });
  }

  if (req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const email = texto(corpo.email, 'email', { obrigatorio: true, max: 200 });
    const senha = String(corpo.senha ?? '');

    const [usuario] = await sql`
      SELECT id, nome, email, papel, ativo, senha_hash, senha_salt
        FROM usuarios
       WHERE empresa_id = ${empresaId} AND lower(email) = lower(${email})`;

    /**
     * Uma mensagem so' para os tres casos: e-mail que nao existe, senha
     * errada e usuario desativado. Distinguir entregaria de graca quais
     * e-mails existem no sistema.
     *
     * A senha e' conferida mesmo quando o usuario nao existe, com hash
     * descartavel, para a resposta demorar o mesmo tanto nos dois casos.
     */
    const confere = usuario
      ? await conferirSenha(senha, usuario.senha_hash, usuario.senha_salt)
      : await conferirSenha(senha, 'a'.repeat(128), 'sal-que-nao-existe');

    if (!usuario || !usuario.ativo || !confere) {
      throw new ErroHttp(401, 'E-mail ou senha nao confere');
    }

    const token = novoTokenSessao();
    await sql`
      INSERT INTO sessoes (usuario_id, token_hash, expira_em)
      VALUES (${usuario.id}, ${hashDoToken(token)},
              now() + ${`${HORAS_DE_SESSAO} hours`}::interval)`;
    await sql`UPDATE usuarios SET ultimo_acesso_em = now() WHERE id = ${usuario.id}`;

    // Faxina barata: a sessao vencida de ontem nao precisa de rotina propria.
    await sql`DELETE FROM sessoes WHERE expira_em < now()`;

    return json(res, 200, {
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    });
  }

  const bruto = req.headers?.['x-sessao'];
  const token = Array.isArray(bruto) ? bruto[0] : bruto;
  if (token) await sql`DELETE FROM sessoes WHERE token_hash = ${hashDoToken(token)}`;
  return json(res, 200, { acao: 'saiu' });
});
