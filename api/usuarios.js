/**
 * Cadastro de analistas.
 *
 * Existe por um motivo concreto e medido: os estudos gravavam o analista em
 * texto livre, e a mesma pessoa apareceu como "ODERLI", "ODERLI GARCIA" e
 * "ODERLI SERGIO GARCIA". Qualquer indicador por pessoa contava o Oderli
 * como tres. Com o cadastro, o nome passa a ser escolhido de uma lista.
 *
 * A senha e' OPCIONAL. Analista que so' precisa ser escolhido num estudo
 * nao precisa entrar no sistema — e criar senha para quem nao vai usar so'
 * produz senha anotada em post-it. Quem tem senha consegue se identificar no
 * PC; ver api/_lib/senha.js para o que essa identificacao e' e o que ela
 * nao e'.
 *
 * EXCLUIR x DESATIVAR segue a mesma regra dos motivos de parada: quem ja'
 * assinou estudo nao se exclui, se desativa. Some da lista de escolha e
 * continua nomeando o que ja' mediu.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir } from './_lib/http.js';
import { texto, uuid } from './_lib/validar.js';
import { guardarSenha } from './_lib/senha.js';

const PAPEIS = ['admin', 'analista', 'leitor'];
const MIN_SENHA = 8;

function papelValido(valor) {
  const p = texto(valor, 'papel', { max: 20 });
  if (p == null) return null;
  if (!PAPEIS.includes(p)) throw erroValidacao(`Campo "papel" deve ser um de: ${PAPEIS.join(', ')}`);
  return p;
}

/**
 * E-mail normalizado.
 *
 * Guardado como veio, comparado em minusculas — e' o que o indice funcional
 * `usuarios_email_unq` ja' fazia. Opcional: analista que nunca vai entrar no
 * sistema nao precisa de e-mail.
 */
function email(valor) {
  const e = texto(valor, 'email', { max: 200 });
  if (e == null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw erroValidacao('E-mail invalido');
  return e;
}

function senhaValida(valor) {
  const s = String(valor ?? '');
  if (!s) return null;
  if (s.length < MIN_SENHA) {
    throw erroValidacao(`A senha precisa de pelo menos ${MIN_SENHA} caracteres`);
  }
  return s;
}

/** A senha NUNCA volta para o navegador — nem o hash, nem o sal. */
const listar = (empresaId) => sql`
  SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_acesso_em,
         (u.senha_hash IS NOT NULL) AS tem_senha,
         (SELECT count(*)::int FROM estudos e WHERE e.analista_id = u.id) AS estudos
    FROM usuarios u
   WHERE u.empresa_id = ${empresaId}
   ORDER BY u.ativo DESC, u.nome`;

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const { empresaId } = await autenticar(req);
  const id = req.query?.id;

  if (req.method === 'GET') {
    return json(res, 200, { usuarios: await listar(empresaId) });
  }

  if (req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const nome = texto(corpo.nome, 'nome', { obrigatorio: true, max: 200 });
    const mail = email(corpo.email);
    const papel = papelValido(corpo.papel) || 'analista';
    const senha = senhaValida(corpo.senha);

    if (mail) {
      const [existe] = await sql`
        SELECT nome FROM usuarios WHERE lower(email) = lower(${mail})`;
      if (existe) throw new ErroHttp(409, `Este e-mail ja e de "${existe.nome}"`);
    }

    const cred = senha ? await guardarSenha(senha) : { hash: null, salt: null };
    const [usuario] = await sql`
      INSERT INTO usuarios (empresa_id, nome, email, papel, senha_hash, senha_salt)
      VALUES (${empresaId}, ${nome}, ${mail}, ${papel}, ${cred.hash}, ${cred.salt})
      RETURNING id, nome, email, papel, ativo`;
    return json(res, 201, { usuario });
  }

  const usuarioId = uuid(id, 'id');
  const [atual] = await sql`
    SELECT id, nome FROM usuarios WHERE id = ${usuarioId} AND empresa_id = ${empresaId}`;
  if (!atual) throw naoEncontrado('Analista nao encontrado');

  if (req.method === 'PATCH') {
    const corpo = await lerCorpo(req);
    const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (!tem('nome') && !tem('email') && !tem('papel') && !tem('ativo') && !tem('senha')) {
      throw erroValidacao('Nada a atualizar: informe "nome", "email", "papel", "ativo" ou "senha"');
    }

    if (tem('nome')) {
      const nome = texto(corpo.nome, 'nome', { obrigatorio: true, max: 200 });
      await sql`UPDATE usuarios SET nome = ${nome} WHERE id = ${usuarioId}`;
    }
    if (tem('email')) {
      const mail = email(corpo.email);
      if (mail) {
        const [outro] = await sql`
          SELECT nome FROM usuarios WHERE lower(email) = lower(${mail}) AND id <> ${usuarioId}`;
        if (outro) throw new ErroHttp(409, `Este e-mail ja e de "${outro.nome}"`);
      }
      await sql`UPDATE usuarios SET email = ${mail} WHERE id = ${usuarioId}`;
    }
    if (tem('papel')) {
      await sql`UPDATE usuarios SET papel = ${papelValido(corpo.papel) || 'analista'} WHERE id = ${usuarioId}`;
    }
    if (tem('ativo')) {
      const ativo = Boolean(corpo.ativo);
      await sql`UPDATE usuarios SET ativo = ${ativo} WHERE id = ${usuarioId}`;
      // Desativar precisa derrubar a sessao aberta, senao a pessoa continua
      // identificada ate o token vencer sozinho.
      if (!ativo) await sql`DELETE FROM sessoes WHERE usuario_id = ${usuarioId}`;
    }
    if (tem('senha')) {
      const senha = senhaValida(corpo.senha);
      const cred = senha ? await guardarSenha(senha) : { hash: null, salt: null };
      await sql`
        UPDATE usuarios SET senha_hash = ${cred.hash}, senha_salt = ${cred.salt}
         WHERE id = ${usuarioId}`;
      // Trocar ou remover senha invalida o que estava aberto — e' o que se
      // espera de quem troca a senha justamente por desconfiar dela.
      await sql`DELETE FROM sessoes WHERE usuario_id = ${usuarioId}`;
    }

    const [usuario] = await sql`
      SELECT id, nome, email, papel, ativo, (senha_hash IS NOT NULL) AS tem_senha
        FROM usuarios WHERE id = ${usuarioId}`;
    return json(res, 200, { usuario });
  }

  // Quem ja assinou estudo nao se exclui: o vinculo viraria nulo e o estudo
  // ficaria orfao de autor, com o nome antigo so no texto.
  const [{ n }] = await sql`
    SELECT count(*)::int AS n FROM estudos WHERE analista_id = ${usuarioId}`;
  if (n > 0) {
    throw erroValidacao(
      `"${atual.nome}" ja e o analista de ${n} estudo(s). Desative em vez de excluir: `
      + 'ele some da lista de escolha e os estudos continuam com o nome certo.',
    );
  }

  await sql`DELETE FROM usuarios WHERE id = ${usuarioId} AND empresa_id = ${empresaId}`;
  return json(res, 200, { acao: 'excluido' });
});
