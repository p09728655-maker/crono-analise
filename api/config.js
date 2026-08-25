/**
 * Configuracao da empresa — hoje, a chave da API de IA.
 *
 * A chave e' digitada UMA vez no painel e fica no servidor (tabela
 * configuracoes). O navegador nunca a le de volta: o GET devolve apenas
 * "configurada ou nao" e os 4 ultimos caracteres, para o usuario
 * reconhecer qual chave esta salva. E' o mesmo principio do proxy de IA —
 * chave em localStorage do chao de fabrica ja' vazou uma vez, nao repete.
 *
 * ANTHROPIC_API_KEY no ambiente, quando existir, tem precedencia: e' a
 * configuracao do administrador, e o app nao a sobrescreve.
 */
import { sql } from './_lib/db.js';
import { autenticar } from './_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from './_lib/http.js';

export const CHAVE_IA = 'anthropic_api_key';
const RE_CHAVE = /^sk-ant-[A-Za-z0-9_-]{10,250}$/;

const resumir = (chave) => `•••${chave.slice(-4)}`;

export default handler(async (req, res) => {
  permitir(req, ['GET', 'POST', 'DELETE']);
  const { empresaId } = await autenticar(req);

  if (req.method === 'GET') {
    if (process.env.ANTHROPIC_API_KEY) {
      return json(res, 200, {
        chaveIa: { configurada: true, origem: 'ambiente', resumo: resumir(process.env.ANTHROPIC_API_KEY) },
      });
    }
    const [linha] = await sql`
      SELECT valor FROM configuracoes WHERE empresa_id = ${empresaId} AND chave = ${CHAVE_IA}`;
    return json(res, 200, {
      chaveIa: linha
        ? { configurada: true, origem: 'banco', resumo: resumir(linha.valor) }
        : { configurada: false, origem: null, resumo: null },
    });
  }

  if (req.method === 'POST') {
    const corpo = await lerCorpo(req);
    const chave = String(corpo.chaveIa || '').trim();
    if (!RE_CHAVE.test(chave)) {
      throw new ErroHttp(400,
        'A chave deve começar com "sk-ant-". Copie-a exatamente como aparece no console da Anthropic.');
    }
    await sql`
      INSERT INTO configuracoes (empresa_id, chave, valor)
      VALUES (${empresaId}, ${CHAVE_IA}, ${chave})
      ON CONFLICT (empresa_id, chave)
      DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`;
    return json(res, 200, { chaveIa: { configurada: true, origem: 'banco', resumo: resumir(chave) } });
  }

  await sql`DELETE FROM configuracoes WHERE empresa_id = ${empresaId} AND chave = ${CHAVE_IA}`;
  const ambiente = Boolean(process.env.ANTHROPIC_API_KEY);
  return json(res, 200, {
    chaveIa: { configurada: ambiente, origem: ambiente ? 'ambiente' : null, resumo: null },
  });
});
