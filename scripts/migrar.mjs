#!/usr/bin/env node
/**
 * APLICA db/schema.sql NO BUILD — antes de a versao nova ir ao ar.
 *
 * O buraco que este arquivo fecha: o deploy e' automatico (merge na main
 * publica na Vercel) e a migracao era manual (`psql -f db/schema.sql` na
 * mao). Quando um PR mexia no banco e ninguem rodava o psql, a producao
 * subia com codigo novo contra banco velho e QUEBRAVA para o usuario — nao
 * para quem desenvolveu. Aconteceu na v2.88.0: a tela de Maquinas inteira
 * respondeu "Erro interno (PostgresError:42703)" por dias porque
 * `nominal_ciclos_min` estava na consulta e nao no banco.
 *
 * Disciplina nao resolve isso; ordem de execucao resolve. O build passa a
 * ser: `vite build` e' compilado PRIMEIRO, a migracao roda DEPOIS, e o
 * deploy so' acontece se as duas derem certo. Se a migracao falhar, o
 * build falha, nada e' publicado e a producao FICA NA VERSAO ANTERIOR, que
 * funciona — em vez de ir ao ar uma versao que nao tem banco embaixo.
 *
 * ONDE RODA — so' no build de PRODUCAO da Vercel:
 *  - Preview NAO migra. Preview e producao dividem o mesmo banco (a mesma
 *    DATABASE_URL cobre os dois), entao migrar no preview deixaria um PR
 *    ainda nao revisado mudar o schema de producao. Um DROP de branch
 *    errada nao tem volta. O custo aceito e' o inverso: o preview de um PR
 *    que mexe no banco quebra igual quebrou a producao — e o log do build
 *    diz por que, em vez de deixar adivinhar.
 *  - Build local NAO migra. Quem quiser migrar da maquina roda com
 *    MIGRAR=1, de proposito, para nao aplicar schema em producao so' por
 *    ter DATABASE_URL exportada no terminal.
 *
 * COMO RODA — o arquivo inteiro como UMA transacao:
 *  - `.simple()` manda tudo num comando so'; o Postgres embrulha um comando
 *    multi-statement em transacao implicita. Ou o schema inteiro entra, ou
 *    nada entra. O psql na mao nao da' isso (cada statement fecha sozinho)
 *    e podia deixar o banco meio migrado.
 *  - O lock consultivo serializa builds simultaneos. Dois deploys ao mesmo
 *    tempo rodando DDL idempotente na mesma tabela nao da' erro previsivel:
 *    da' "tuple concurrently updated". O segundo espera e depois nao acha
 *    nada para fazer.
 *
 * Nao e' uma funcao serverless: mora fora de api/, entao nao conta no teto
 * de 12 do plano Hobby (ver test/limite-funcoes.test.js).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const SCHEMA = fileURLToPath(new URL('../db/schema.sql', import.meta.url));

/**
 * Chave do lock consultivo. Numero arbitrario e fixo: o que importa e' que
 * todo build use o MESMO, para um esperar o outro.
 */
const LOCK = 2088072103;

/**
 * Decide, so' pelo ambiente, se este build migra. Separado da execucao
 * porque e' a parte que erra em silencio — e a unica que da' para testar
 * sem banco.
 */
export function decidir(env = process.env) {
  const url = env.DATABASE_URL;

  if (env.MIGRAR === '0') {
    return { aplicar: false, motivo: 'MIGRAR=0: migracao desligada neste build.' };
  }
  if (env.MIGRAR === '1') {
    return url
      ? { aplicar: true, url, motivo: 'MIGRAR=1: aplicando por pedido explicito.' }
      : { aplicar: false, erro: 'MIGRAR=1 sem DATABASE_URL: nao ha banco para migrar.' };
  }
  if (!env.VERCEL) {
    return {
      aplicar: false,
      motivo: 'Build fora da Vercel: nao migra. Use MIGRAR=1 para aplicar de proposito.',
    };
  }
  if (env.VERCEL_ENV !== 'production') {
    return {
      aplicar: false,
      motivo: `Build de ${env.VERCEL_ENV || 'preview'}: nao migra, porque preview e producao `
        + 'dividem o mesmo banco. Se esta versao mexe no schema, o preview vai acusar coluna '
        + 'ou tabela ausente ate a producao publicar.',
    };
  }
  if (!url) {
    return {
      aplicar: false,
      /**
       * DUAS causas possiveis, e a segunda nao e' obvia: na Vercel a
       * variavel existe para Production mas pode nao chegar ao BUILD
       * (variavel "sensitive" ou de escopo so' de runtime). Quem le o log
       * do build precisa das duas — checar so' a primeira e concluir
       * "mas ela esta la" e' o caminho para uma hora perdida.
       */
      erro: 'Build de producao sem DATABASE_URL: o schema nao pode ser aplicado e a versao '
        + 'nova nao teria banco embaixo, entao o deploy foi abortado. Ou a variavel nao existe '
        + 'para Production na Vercel, ou existe e nao chega ao passo de build. Corrija e publique '
        + 'de novo; para publicar sem migrar de proposito, MIGRAR=0.',
    };
  }
  return { aplicar: true, url, motivo: 'Build de producao: aplicando db/schema.sql.' };
}

/** TLS: Postgres local (teste) nao tem; host remoto exige. Igual api/_lib/db.js. */
const ehLocal = (url) => /localhost|127\.0\.0\.1|\/tmp|\/var\/run/.test(url || '');

/**
 * Aplica o arquivo. Devolve quanto tempo levou; lanca se o banco recusar.
 */
export async function aplicar(url, caminho = SCHEMA) {
  const schema = readFileSync(caminho, 'utf8');
  const sql = postgres(url, {
    prepare: false,
    max: 1,
    connect_timeout: 30,
    // DDL de 900 linhas nao e' consulta de tela: o teto precisa caber a
    // espera pelo lock quando outro build esta na frente.
    idle_timeout: 120,
    ssl: ehLocal(url) ? false : 'require',
    /**
     * "... already exists, skipping" e' o normal de um arquivo idempotente:
     * dezenas de linhas por build, nenhuma informacao. Calar TODAS, porem,
     * calaria junto o recado que o proprio schema manda — ha' um RAISE
     * NOTICE em db/schema.sql avisando que a FK de usuarios ficou adiada
     * por haver usuario sem conta no auth.users. Esse precisa aparecer.
     */
    onnotice: (aviso) => {
      const texto = aviso?.message || '';
      if (/, skipping$/.test(texto)) return;
      console.log(`[migrar] aviso do banco: ${texto}`);
    },
  });
  const comecou = Date.now();
  try {
    await sql.unsafe(`SELECT pg_advisory_xact_lock(${LOCK});\n${schema}`).simple();
    return Date.now() - comecou;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function principal() {
  const decisao = decidir();

  if (decisao.erro) {
    console.error(`[migrar] ${decisao.erro}`);
    process.exit(1);
  }
  if (!decisao.aplicar) {
    console.log(`[migrar] ${decisao.motivo}`);
    return;
  }

  console.log(`[migrar] ${decisao.motivo}`);
  try {
    const ms = await aplicar(decisao.url);
    console.log(`[migrar] schema aplicado em ${ms}ms — banco e codigo na mesma versao.`);
  } catch (err) {
    /**
     * A migracao falhou: o build TEM de falhar junto.
     *
     * Publicar assim mesmo e' o bug que este arquivo existe para impedir —
     * a versao nova iria ao ar contra um banco que nao a suporta, e a
     * conta chegaria como tela quebrada no chao de fabrica.
     */
    console.error('[migrar] FALHOU ao aplicar db/schema.sql — o deploy foi abortado de proposito.');
    console.error(`[migrar] ${err.code ? `${err.code}: ` : ''}${err.message}`);
    if (err.position) console.error(`[migrar] posicao ${err.position} no arquivo.`);
    console.error('[migrar] A producao continua na versao anterior, que funciona. '
      + 'Corrija db/schema.sql (ou aplique na mao) e publique de novo.');
    process.exit(1);
  }
}

// So' roda quando chamado como programa; importado (teste), so' exporta.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await principal();
}
