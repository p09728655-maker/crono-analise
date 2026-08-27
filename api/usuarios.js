/**
 * Cadastro de analistas.
 *
 * Existe por um motivo concreto e medido: os estudos gravavam o analista em
 * texto livre, e a mesma pessoa apareceu como "ODERLI", "ODERLI GARCIA" e
 * "ODERLI SERGIO GARCIA". Qualquer indicador por pessoa contava o Oderli
 * como tres. Com o cadastro, o nome passa a ser escolhido de uma lista.
 *
 * Cada linha daqui e' um PERFIL de uma conta no Supabase Auth: mesmo id,
 * uma para uma. A senha vive la' (auth.users), nunca aqui — este arquivo
 * escreve as duas tabelas na mesma transacao via api/_lib/contas.js.
 *
 * A senha e' OPCIONAL. Analista que so' precisa ser escolhido num estudo
 * nao entra no sistema — e criar senha para quem nao vai usar so' produz
 * senha anotada em post-it. Quem tem senha entra no PC com e-mail e senha.
 *
 * EXCLUIR x DESATIVAR segue a mesma regra dos motivos de parada: quem ja'
 * assinou estudo nao se exclui, se desativa. Some da lista de escolha e
 * continua nomeando o que ja' mediu.
 *
 * Este endpoint roda como servico (fora da RLS) de proposito: ele escreve
 * no schema auth, que nenhum papel de usuario alcanca. A barreira aqui e'
 * exigirPapel — e as politicas de RLS guardam as mesmas regras para
 * qualquer outro caminho ate' a tabela.
 */
import { sql } from './_lib/db.js';
import { autenticar, exigirPapel } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, naoEncontrado, permitir, proibido } from './_lib/http.js';
import { texto, uuid } from './_lib/validar.js';
import {
  apagarContaAuth, atualizarEmailAuth, criarContaAuth, definirSenhaAuth, derrubarSessoesAuth,
} from './_lib/contas.js';

// 'coletor' existe mas nao se cadastra aqui: e' o papel do TABLET pareado,
// criado em api/dispositivos.js. Pessoa tem um destes tres.
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
 * sistema nao precisa de e-mail. SEM e-mail nao ha' login possivel, entao
 * senha exige e-mail.
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

/** A senha NUNCA volta para o navegador — ela nem mora nesta tabela. */
const listar = (db, empresaId) => db`
  SELECT u.id, u.nome, u.email, u.papel, u.ativo, u.ultimo_acesso_em,
         (a.encrypted_password IS NOT NULL AND a.encrypted_password <> '') AS tem_senha,
         (SELECT count(*)::int FROM estudos e WHERE e.analista_id = u.id) AS estudos
    FROM usuarios u
    LEFT JOIN auth.users a ON a.id = u.id
   WHERE u.empresa_id = ${empresaId}
   ORDER BY u.ativo DESC, u.nome`;

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'PATCH', 'DELETE']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  const id = req.query?.id;

  if (req.method === 'GET') {
    return json(res, 200, { usuarios: await listar(sql, empresaId) });
  }

  if (req.method === 'POST') {
    exigirPapel(auth, ['admin'], 'So o administrador cadastra analistas');
    const corpo = await lerCorpo(req);
    const nome = texto(corpo.nome, 'nome', { obrigatorio: true, max: 200 });
    const mail = email(corpo.email);
    const papel = papelValido(corpo.papel) || 'analista';
    const senha = senhaValida(corpo.senha);
    if (senha && !mail) {
      throw erroValidacao('Senha exige e-mail: e com ele que a pessoa entra no sistema');
    }

    if (mail) {
      const [existe] = await sql`
        SELECT nome FROM usuarios WHERE lower(email) = lower(${mail})`;
      if (existe) throw new ErroHttp(409, `Este e-mail ja e de "${existe.nome}"`);
    }

    const usuario = await sql.begin(async (tx) => {
      const contaId = await criarContaAuth(tx, { email: mail, senha });
      const [linha] = await tx`
        INSERT INTO usuarios (id, empresa_id, nome, email, papel)
        VALUES (${contaId}, ${empresaId}, ${nome}, ${mail}, ${papel})
        RETURNING id, nome, email, papel, ativo`;
      return { ...linha, tem_senha: Boolean(senha) };
    });
    return json(res, 201, { usuario });
  }

  const usuarioId = uuid(id, 'id');
  const [atual] = await sql`
    SELECT id, nome, papel FROM usuarios WHERE id = ${usuarioId} AND empresa_id = ${empresaId}`;
  if (!atual) throw naoEncontrado('Analista nao encontrado');

  if (req.method === 'PATCH') {
    const corpo = await lerCorpo(req);
    const tem = (chave) => Object.prototype.hasOwnProperty.call(corpo, chave);
    if (!tem('nome') && !tem('email') && !tem('papel') && !tem('ativo') && !tem('senha')) {
      throw erroValidacao('Nada a atualizar: informe "nome", "email", "papel", "ativo" ou "senha"');
    }

    // Cada um mexe no proprio perfil; papel e ativo sao decisao de admin —
    // senao qualquer um se promoveria. Mesma regra das politicas de RLS.
    const proprio = auth.usuario?.id === usuarioId;
    if (auth.modo === 'usuario' && auth.papel !== 'admin') {
      if (!proprio) throw proibido('So o administrador altera o cadastro dos outros');
      if (tem('papel') || tem('ativo')) throw proibido('Papel e ativacao sao decisao do administrador');
    }

    await sql.begin(async (tx) => {
      if (tem('nome')) {
        const nome = texto(corpo.nome, 'nome', { obrigatorio: true, max: 200 });
        await tx`UPDATE usuarios SET nome = ${nome} WHERE id = ${usuarioId}`;
      }
      if (tem('email')) {
        const mail = email(corpo.email);
        if (mail) {
          const [outro] = await tx`
            SELECT nome FROM usuarios WHERE lower(email) = lower(${mail}) AND id <> ${usuarioId}`;
          if (outro) throw new ErroHttp(409, `Este e-mail ja e de "${outro.nome}"`);
        }
        await tx`UPDATE usuarios SET email = ${mail} WHERE id = ${usuarioId}`;
        await atualizarEmailAuth(tx, usuarioId, mail);
      }
      if (tem('papel')) {
        await tx`UPDATE usuarios SET papel = ${papelValido(corpo.papel) || 'analista'} WHERE id = ${usuarioId}`;
      }
      if (tem('ativo')) {
        const ativo = Boolean(corpo.ativo);
        await tx`UPDATE usuarios SET ativo = ${ativo} WHERE id = ${usuarioId}`;
        // Desativar derruba a sessao aberta, senao a pessoa (ou o tablet)
        // continua entrando ate o token de acesso vencer sozinho.
        if (!ativo) await derrubarSessoesAuth(tx, usuarioId);
      }
      if (tem('senha')) {
        const senha = senhaValida(corpo.senha);
        if (senha) {
          const [comMail] = await tx`SELECT email FROM usuarios WHERE id = ${usuarioId}`;
          if (!comMail?.email) {
            throw erroValidacao('Senha exige e-mail: e com ele que a pessoa entra no sistema');
          }
        }
        // Trocar ou remover senha derruba o que estava aberto — e' o que se
        // espera de quem troca a senha justamente por desconfiar dela.
        await definirSenhaAuth(tx, usuarioId, senha);
      }
    });

    const [usuario] = await sql`
      SELECT u.id, u.nome, u.email, u.papel, u.ativo,
             (a.encrypted_password IS NOT NULL AND a.encrypted_password <> '') AS tem_senha
        FROM usuarios u LEFT JOIN auth.users a ON a.id = u.id
       WHERE u.id = ${usuarioId}`;
    return json(res, 200, { usuario });
  }

  exigirPapel(auth, ['admin'], 'So o administrador exclui analistas');

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

  await sql.begin(async (tx) => {
    await tx`DELETE FROM usuarios WHERE id = ${usuarioId} AND empresa_id = ${empresaId}`;
    await apagarContaAuth(tx, usuarioId);
  });
  return json(res, 200, { acao: 'excluido' });
});
