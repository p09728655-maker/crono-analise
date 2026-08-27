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

  /**
   * Impressao do token: tamanho e as pontas.
   *
   * O servidor NAO enxerga o VITE_API_TOKEN — ele e' embutido no bundle do
   * navegador. Entao quando os dois nao batem, o status nao tinha como
   * apontar onde estava a diferenca, e "Token invalido" virava adivinhacao.
   *
   * Com tamanho e as pontas da' para comparar de olho com o que foi colado
   * na Vercel e ver truncamento na hora. Nao ha' perda de sigilo: o mesmo
   * valor ja' vive publico no bundle por causa do prefixo VITE_.
   */
  const token = process.env.API_TOKEN || '';
  const impressaoToken = token
    ? {
        tamanho: token.length,
        pontas: `${token.slice(0, 4)}…${token.slice(-4)}`,
        // 64 hex e o que `crypto.randomBytes(32).toString('hex')` produz.
        tamanhoEsperado: token.length === 64,
      }
    : null;

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

  /**
   * Autoteste da autenticacao Supabase, DESTE servidor.
   *
   * A verificacao de token funciona sem rede (chave embutida), mas a
   * rotacao de chave depende de o servidor alcancar o JWKS. Quando o login
   * falhar em producao, e' AQUI que se olha primeiro — o resultado diz se o
   * problema e' a rede da funcao, sem adivinhar por mensagens de 500.
   */
  let jwks = 'nao testado';
  try {
    const { buscarJwks } = await import('./_lib/jwt.js');
    jwks = `ok — ${await buscarJwks()} chave(s) publicada(s)`;
  } catch (err) {
    jwks = `falha na busca (a chave embutida segue valendo): ${err?.constructor?.name}`;
    console.error('[ritmopatrimar] JWKS inalcancavel:', err.message);
  }

  const pendencias = [];
  if (!variaveis.API_TOKEN) {
    pendencias.push('Configure API_TOKEN nas variaveis de ambiente da Vercel.');
  } else if (token.length !== 64) {
    pendencias.push(
      `API_TOKEN tem ${token.length} caracteres; o esperado sao 64. `
      + 'Provavelmente foi truncado ao copiar.',
    );
  }
  if (variaveis.API_TOKEN) {
    pendencias.push(
      'Se o app disser "Token invalido", o VITE_API_TOKEN nao bate com o '
      + `API_TOKEN. Compare com a impressao acima (${token.length} caracteres, `
      + `${token.slice(0, 4)}…${token.slice(-4)}) e publique um deploy novo depois de corrigir.`,
    );
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
    apiToken: impressaoToken,
    banco,
    empresas,
    supabaseAuth: { jwks, node: process.version },
    pendencias,
    // Lembrete do erro mais comum: salvar variavel nao afeta deploy existente.
    lembrete: pronto
      ? null
      : 'Depois de salvar variaveis na Vercel e obrigatorio publicar um deploy novo — variavel nao entra em deploy que ja existe.',
  });
});
