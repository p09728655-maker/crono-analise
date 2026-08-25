/**
 * Diagnostico de configuracao.
 *
 * Existe porque a falha mais comum de um app serverless nao esta no codigo:
 * esta em variavel de ambiente ausente, ou salva mas nao publicada num deploy
 * novo. Sem este endpoint, descobrir isso vira tentativa e erro no painel.
 *
 * NAO exige autenticacao — de proposito. Se o API_TOKEN e' justamente o que
 * esta faltando, um diagnostico autenticado seria inutil.
 *
 * Nao devolve NENHUM valor: apenas se cada variavel existe, e se o banco
 * responde. Nada de host, senha, trecho de string ou mensagem crua do
 * Postgres — erro de banco costuma vazar host e usuario.
 */
import { handler, json, permitir } from './_lib/http.js';

export default handler(async (req, res) => {
  permitir(req, ['GET']);

  const variaveis = {
    API_TOKEN: Boolean(process.env.API_TOKEN),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    EMPRESA_ID: Boolean(process.env.EMPRESA_ID),
  };

  let banco = 'nao testado';
  let empresas = null;

  if (variaveis.DATABASE_URL) {
    try {
      const { sql } = await import('./_lib/db.js');
      const [linha] = await sql`SELECT count(*)::int AS n FROM empresas`;
      banco = 'ok';
      empresas = linha.n;
    } catch (err) {
      // Mensagem generica: o erro cru do Postgres carrega host e usuario.
      console.error('[ritmopatrimar] falha ao conectar no banco:', err.message);
      banco = 'falha na conexao';
    }
  }

  const pendencias = [];
  if (!variaveis.API_TOKEN) {
    pendencias.push('Configure API_TOKEN nas variaveis de ambiente da Vercel.');
  }
  if (!variaveis.DATABASE_URL) {
    pendencias.push('Configure DATABASE_URL com a Transaction Pooler do Supabase (porta 6543).');
  }
  if (variaveis.DATABASE_URL && banco === 'falha na conexao') {
    pendencias.push('DATABASE_URL existe mas a conexao falhou: confira a senha e se a porta e 6543.');
  }
  if (banco === 'ok' && empresas === 0) {
    pendencias.push("Nenhuma empresa no banco. Rode: INSERT INTO empresas (nome) VALUES ('Patrimar Moveis');");
  }

  const pronto = pendencias.length === 0;

  return json(res, 200, {
    pronto,
    variaveis,
    banco,
    empresas,
    pendencias,
    // Lembrete do erro mais comum: salvar variavel nao afeta deploy existente.
    lembrete: pronto
      ? null
      : 'Depois de salvar variaveis na Vercel e obrigatorio publicar um deploy novo — variavel nao entra em deploy que ja existe.',
  });
});
