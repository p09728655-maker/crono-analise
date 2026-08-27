/**
 * Pareamento do tablet — identidade por APARELHO, sem senha por pessoa.
 *
 * O tablet do chao de fabrica e' operado de luva, em pe, diante da
 * furadeira: nao da' para pedir login por turno. Mas com a seguranca
 * morando no banco (RLS), todo cliente precisa de identidade. A saida e'
 * parear o aparelho UMA vez:
 *
 *   1. O administrador, no PC, pede um codigo (6 letras, vale 15 minutos,
 *      uso unico).
 *   2. O tablet digita o codigo e recebe uma conta propria de COLETOR —
 *      uma linha real no Supabase Auth + um perfil com papel 'coletor'.
 *   3. O aparelho guarda a credencial e entra sozinho dali em diante.
 *      Revogar = desativar o coletor na tela de Analistas.
 *
 * Por que codigo, e nao o registro anonimo do Supabase: anonimo e' aberto
 * ao mundo — qualquer pessoa na internet ganharia o direito de coletar.
 * O codigo mantem o cadastro fechado: so' entra aparelho que o
 * administrador pareou, e cada um pode ser revogado sozinho.
 *
 * O codigo vive HASHEADO em `configuracoes` (chave 'pareamento'), um por
 * empresa: pedir outro invalida o anterior.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql } from './_lib/db.js';
import { autenticar, exigirPapel } from './_lib/auth.js';
import { ErroHttp, erroValidacao, handler, json, lerCorpo, permitir } from './_lib/http.js';
import { texto } from './_lib/validar.js';
import { criarContaAuth } from './_lib/contas.js';

const CHAVE = 'pareamento';
const MINUTOS = 15;

// Sem I, L, O, 0 e 1: no chao de fabrica o codigo e' lido de uma tela e
// digitado noutra, e essas cinco se confundem.
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const gerarCodigo = () =>
  Array.from(randomBytes(6), (b) => LETRAS[b % LETRAS.length]).join('');

const hash = (codigo) => createHash('sha256').update(codigo.toUpperCase()).digest();

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const corpo = await lerCorpo(req);

  /* --------------------------------------------- o tablet troca o codigo */
  // Este ramo NAO exige autenticacao — e' justamente o aparelho que ainda
  // nao tem credencial nenhuma. O codigo e' a autorizacao.
  if (corpo.codigo != null) {
    const codigo = texto(corpo.codigo, 'codigo', { obrigatorio: true, max: 12 });
    const nome = texto(corpo.nome, 'nome', { max: 60 }) || 'Tablet';

    const pendentes = await sql`
      SELECT empresa_id, valor FROM configuracoes WHERE chave = ${CHAVE}`;

    const tentativa = hash(codigo);
    let pareando = null;
    for (const linha of pendentes) {
      let guardado;
      try { guardado = JSON.parse(linha.valor); } catch { continue; }
      const esperado = Buffer.from(guardado.hash || '', 'hex');
      if (esperado.length === tentativa.length && timingSafeEqual(esperado, tentativa)
          && new Date(guardado.expira) > new Date()) {
        pareando = linha.empresa_id;
      }
    }
    if (!pareando) {
      throw new ErroHttp(401,
        'Codigo invalido ou vencido. Peca um novo na tela de Analistas do PC.');
    }

    // Credencial do aparelho: e-mail sintetico + senha aleatoria. Ela mora
    // no proprio tablet — e' uma credencial DE DISPOSITIVO, com papel que
    // so' coleta, revogavel na tela de Analistas.
    const senha = randomBytes(24).toString('base64url');
    const email = `coletor-${randomUUID().slice(0, 8)}@dispositivo.ritmopatrimar.app`;

    const usuario = await sql.begin(async (tx) => {
      // Uso unico: o codigo morre ANTES de a conta nascer.
      await tx`DELETE FROM configuracoes WHERE empresa_id = ${pareando} AND chave = ${CHAVE}`;
      const contaId = await criarContaAuth(tx, { email, senha });
      const [linha] = await tx`
        INSERT INTO usuarios (id, empresa_id, nome, email, papel)
        VALUES (${contaId}, ${pareando}, ${nome}, ${email}, 'coletor')
        RETURNING id, nome`;
      return linha;
    });

    return json(res, 201, { dispositivo: usuario, email, senha });
  }

  /* ------------------------------------------------- o admin pede codigo */
  const auth = await autenticar(req);
  exigirPapel(auth, ['admin'], 'So o administrador pareia tablets');
  if (corpo.acao !== 'codigo') {
    throw erroValidacao('Informe {"acao":"codigo"} para gerar um codigo de pareamento');
  }

  const codigo = gerarCodigo();
  const expira = new Date(Date.now() + MINUTOS * 60_000).toISOString();
  await sql`
    INSERT INTO configuracoes (empresa_id, chave, valor)
    VALUES (${auth.empresaId}, ${CHAVE},
            ${JSON.stringify({ hash: hash(codigo).toString('hex'), expira })})
    ON CONFLICT (empresa_id, chave)
    DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`;

  return json(res, 200, { codigo, expiraEm: expira, minutos: MINUTOS });
});
