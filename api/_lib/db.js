/**
 * Conexao com o Postgres (Supabase).
 *
 * Usa o pooler do Supabase (Supavisor) em modo transaction, porta 6543.
 * Funcao serverless sobe e morre a cada requisicao: conectar direto na porta
 * 5432 esgotaria o limite de conexoes do banco em qualquer pico de uso.
 *
 * prepare:false e' obrigatorio no modo transaction — o pooler nao mantem a
 * sessao entre statements, entao prepared statements nomeados quebram.
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
  // Sem URL o driver cai no padrao dele — localhost:5432 — e toda consulta
  // morre com ECONNREFUSED, um erro que nao diz absolutamente nada sobre a
  // causa. Quem le esta' com o app quebrado em producao: o aviso precisa
  // nomear a variavel. api/_lib/http.js traduz o ECONNREFUSED em 503 com
  // instrucao, e /api/status responde sem autenticacao justamente para
  // este caso.
  console.error(
    '[ritmopatrimar] DATABASE_URL nao configurada — nenhuma consulta vai funcionar. '
    + 'Configure a variavel na Vercel (Production E Preview) e publique um deploy novo.',
  );
} else if (!url.includes('6543') && url.includes('supabase')) {
  console.warn(
    '[ritmopatrimar] DATABASE_URL parece apontar para a conexao direta do Supabase. ' +
    'Em serverless use a Transaction Pooler (porta 6543).',
  );
}

// Postgres local (teste/dev) nao tem TLS; qualquer host remoto exige.
const local = /localhost|127\.0\.0\.1|\/tmp/.test(url || '');

export const sql = postgres(url, {
  prepare: false,
  max: 1,               // uma conexao por instancia da funcao
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: local ? false : 'require',
});

/**
 * Executa `fn` DENTRO da RLS, como o usuario do token.
 *
 * A conexao chega como `postgres`, que ignora RLS por atributo de papel
 * (rolbypassrls). Estas duas set_config, locais a' transacao, trocam o
 * papel corrente para `authenticated` e entregam as claims verificadas do
 * JWT — e' exatamente o que o PostgREST faz. A partir dai' auth.uid()
 * responde, as politicas sao avaliadas de verdade, e um WHERE esquecido em
 * qualquer consulta deixa de expor dado de outra empresa: o banco barra.
 *
 * Tudo roda numa transacao so' — o que tambem da', de graca, atomicidade
 * por requisicao. No COMMIT o papel volta sozinho (escopo `true` = local).
 */
export const comRls = (claims, fn) => sql.begin(async (tx) => {
  await tx`SELECT set_config('role', 'authenticated', true),
                  set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
  return fn(tx);
});
