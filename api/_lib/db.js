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
  console.error('[ritmoprod] DATABASE_URL nao configurada.');
} else if (!url.includes('6543') && url.includes('supabase')) {
  console.warn(
    '[ritmoprod] DATABASE_URL parece apontar para a conexao direta do Supabase. ' +
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
