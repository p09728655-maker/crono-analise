/**
 * Contas no Supabase Auth (auth.users), por SQL.
 *
 * auth.users e' a fonte oficial de identidade: cada linha de public.usuarios
 * tem o MESMO id de uma linha daqui. Este modulo e' o unico lugar que
 * escreve no schema auth, e escreve o minimo que o GoTrue precisa para
 * autenticar a conta — formato verificado na pratica: conta criada assim
 * entra pelo /auth/v1/token normalmente.
 *
 * A senha vira bcrypt via pgcrypto DENTRO do banco (extensions.crypt), o
 * formato que o GoTrue confere. Ela nunca e' guardada em claro e nunca
 * volta em consulta nenhuma.
 *
 * Conta SEM senha e' deliberada: e' o analista que so' precisa ser
 * escolhido na lista de estudos. encrypted_password vazio nao confere com
 * senha nenhuma, entao a conta existe como identidade e nao abre login.
 */
import { randomUUID } from 'node:crypto';

const INSTANCIA = '00000000-0000-0000-0000-000000000000';

/** Cria a conta e devolve o id — que vira o proprio id em public.usuarios. */
export async function criarContaAuth(db, { email, senha }) {
  const id = randomUUID();
  await db`
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      is_sso_user, is_anonymous
    ) VALUES (
      ${INSTANCIA}, ${id}, 'authenticated', 'authenticated', ${email},
      CASE WHEN ${senha ?? null}::text IS NULL THEN ''
           ELSE extensions.crypt((${senha ?? null})::text, extensions.gen_salt('bf')) END,
      CASE WHEN ${email ?? null}::text IS NULL THEN NULL ELSE now() END, now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      '', '', '', '',
      false, false
    )`;
  if (email) {
    await db`
      INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${id}, ${id}, 'email',
        jsonb_build_object('sub', ${id}::text, 'email', ${email}::text, 'email_verified', true),
        now(), now(), now()
      )`;
  }
  return id;
}

/**
 * Troca (ou remove, com null) a senha da conta.
 *
 * Derruba as sessoes abertas junto: quem troca a senha esta' desconfiando
 * dela. O token de acesso que ja' saiu vale ate' vencer — no maximo uma
 * hora — porque e' verificado por assinatura, sem consulta ao servidor.
 */
export async function definirSenhaAuth(db, id, senha) {
  await db`
    UPDATE auth.users
       SET encrypted_password = CASE WHEN ${senha ?? null}::text IS NULL THEN ''
             ELSE extensions.crypt((${senha ?? null})::text, extensions.gen_salt('bf')) END,
           updated_at = now()
     WHERE id = ${id}`;
  await derrubarSessoesAuth(db, id);
}

export async function atualizarEmailAuth(db, id, email) {
  await db`
    UPDATE auth.users
       SET email = ${email},
           email_confirmed_at = CASE WHEN ${email ?? null}::text IS NULL THEN NULL
             ELSE coalesce(email_confirmed_at, now()) END,
           updated_at = now()
     WHERE id = ${id}`;
  await db`DELETE FROM auth.identities WHERE user_id = ${id} AND provider = 'email'`;
  if (email) {
    await db`
      INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        ${randomUUID()}, ${id}, ${id}, 'email',
        jsonb_build_object('sub', ${id}::text, 'email', ${email}::text, 'email_verified', true),
        now(), now(), now()
      )`;
  }
}

/** Refresh tokens caem em cascata com a sessao. */
export async function derrubarSessoesAuth(db, id) {
  await db`DELETE FROM auth.sessions WHERE user_id = ${id}`;
}

/** Some a conta inteira — so' para quem nunca assinou nada (o chamador confere). */
export async function apagarContaAuth(db, id) {
  await db`DELETE FROM auth.identities WHERE user_id = ${id}`;
  await db`DELETE FROM auth.users WHERE id = ${id}`;
}
