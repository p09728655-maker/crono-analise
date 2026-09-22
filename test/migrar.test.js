/**
 * QUANDO O BUILD MIGRA O BANCO — e quando nao migra.
 *
 * O erro que este teste guarda nao e' de SQL: e' de ambiente. A migracao
 * pode falhar de tres jeitos silenciosos e todos ja' custaram producao ou
 * quase custaram:
 *   1. nao rodar quando devia (o buraco da v2.88.0: deploy publicado,
 *      schema nao aplicado, tela de Maquinas quebrada por dias);
 *   2. rodar quando NAO devia (preview de um PR mexendo no schema de
 *      producao, que divide o mesmo banco);
 *   3. o passo sumir do `npm run build` num refactor e ninguem notar ate'
 *      a proxima migracao esquecida.
 *
 * Os tres sao decididos por variavel de ambiente e por uma linha do
 * package.json — nada que o SQL prove. Por isso este arquivo existe.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decidir } from '../scripts/migrar.mjs';

const URL_QUALQUER = 'postgres://alguem@host:6543/postgres';

describe('decidir', () => {
  it('build de producao na Vercel aplica', () => {
    const d = decidir({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_QUALQUER });
    expect(d.aplicar).toBe(true);
    expect(d.url).toBe(URL_QUALQUER);
  });

  /**
   * O caso 1: e' este que precisa DERRUBAR o build. Publicar codigo novo
   * sem poder migrar e' exatamente o desfecho que a automacao existe para
   * impedir — e sem DATABASE_URL o app nao funciona de qualquer forma.
   */
  it('producao sem DATABASE_URL e erro, nao "pula em silencio"', () => {
    const d = decidir({ VERCEL: '1', VERCEL_ENV: 'production' });
    expect(d.aplicar).toBe(false);
    expect(d.erro).toMatch(/DATABASE_URL/);
  });

  /**
   * O caso 2. Preview e producao dividem o banco: migrar no preview
   * deixaria um PR ainda nao revisado mudar o schema de producao.
   */
  it('preview nao migra, e o motivo explica o preview quebrado', () => {
    const d = decidir({ VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: URL_QUALQUER });
    expect(d.aplicar).toBe(false);
    expect(d.erro).toBeUndefined();          // nao derruba o build do preview
    expect(d.motivo).toMatch(/mesmo banco/);
  });

  it('build local nao migra so por ter DATABASE_URL no terminal', () => {
    const d = decidir({ DATABASE_URL: URL_QUALQUER });
    expect(d.aplicar).toBe(false);
    expect(d.motivo).toMatch(/MIGRAR=1/);
  });

  it('MIGRAR=1 aplica de proposito fora da Vercel', () => {
    const d = decidir({ MIGRAR: '1', DATABASE_URL: URL_QUALQUER });
    expect(d.aplicar).toBe(true);
  });

  it('MIGRAR=1 sem banco e erro, nao no-op', () => {
    expect(decidir({ MIGRAR: '1' }).erro).toMatch(/DATABASE_URL/);
  });

  // A valvula de escape: publicar sem migrar, quando alguem decidir isso
  // conscientemente. Tem de ser explicita — o padrao e sempre migrar.
  it('MIGRAR=0 desliga ate no build de producao', () => {
    const d = decidir({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_QUALQUER, MIGRAR: '0' });
    expect(d.aplicar).toBe(false);
    expect(d.erro).toBeUndefined();
  });

  /**
   * ALAVANCA DE SEGURANCA NAO PODE FALHAR ABERTA.
   *
   * Quem escreve MIGRAR=false quer desligar. Se isso cair no caminho
   * padrao, a unica alavanca que o README oferece para publicar sem
   * encostar no banco migra assim mesmo — e o operador so' descobre pelo
   * estrago. Valor desconhecido derruba o build dizendo o que aceitar.
   */
  it.each(['false', 'off', 'no', 'nao', 'sim', 'true'])('MIGRAR=%s nao migra em silencio', (valor) => {
    const d = decidir({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_QUALQUER, MIGRAR: valor });
    expect(d.aplicar).toBe(false);
    expect(d.erro).toMatch(/nao e' 0 nem 1/);
  });

  // Espaco sobrando e' erro de digitacao, nao outra intencao.
  it.each(['0 ', ' 0', ' 0 '])('MIGRAR=%s ainda desliga', (valor) => {
    expect(decidir({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_QUALQUER, MIGRAR: valor }).aplicar)
      .toBe(false);
  });

  // Variavel vazia e' variavel nao definida: mantem o padrao, nao desliga.
  it('MIGRAR vazio cai no comportamento padrao', () => {
    expect(decidir({ VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: URL_QUALQUER, MIGRAR: '' }).aplicar)
      .toBe(true);
  });
});

/**
 * A CAIXA-PRETA PRECISA NASCER COM O BANCO.
 *
 * `erros_api` existia em producao e NAO existia em db/schema.sql — aplicada
 * um dia por migracao avulsa e nunca escrita no arquivo. E' a mesma
 * divergencia que quebrou a tela de Maquinas, na direcao contraria. Agora
 * que o build migra por este arquivo e so' por ele, banco recriado sem esta
 * tabela apagaria justamente o diagnostico que revelou a v2.88.0 — e o
 * `catch {}` de registrarErro engoliria a falha sem uma linha de aviso.
 */
describe('o schema cria o que a API escreve', () => {
  const schema = readFileSync(fileURLToPath(new URL('../db/schema.sql', import.meta.url)), 'utf8');
  const http = readFileSync(fileURLToPath(new URL('../api/_lib/http.js', import.meta.url)), 'utf8');

  it('db/schema.sql cria erros_api', () => {
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS erros_api/);
  });

  it('as colunas que a API insere existem no schema', () => {
    const insercao = /INSERT INTO erros_api \(([^)]+)\)/.exec(http);
    expect(insercao, 'api/_lib/http.js deveria inserir em erros_api').toBeTruthy();

    const criacao = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS erros_api'));
    const corpo = criacao.slice(0, criacao.indexOf(');'));
    for (const coluna of insercao[1].split(',').map((c) => c.trim())) {
      expect(corpo, `erros_api.${coluna}`).toMatch(new RegExp(`^\\s*${coluna}\\s`, 'm'));
    }
  });

  // Tabela de diagnostico do servidor nao e' dado de app: a porta anonima
  // fica fechada como no resto do schema.
  it('erros_api nasce com RLS ligada', () => {
    expect(schema).toMatch(/ALTER TABLE erros_api ENABLE ROW LEVEL SECURITY/);
  });
});

/**
 * O caso 3. A Vercel roda `npm run build` (vercel.json) e mais nada: se o
 * passo sair dessa linha, a migracao para de existir sem quebrar teste
 * nenhum — e o proximo PR que mexer no banco repete a v2.88.0.
 */
describe('o build chama a migracao', () => {
  const raiz = new URL('../', import.meta.url);
  const ler = (nome) => JSON.parse(readFileSync(fileURLToPath(new URL(nome, raiz)), 'utf8'));

  it('npm run build termina rodando scripts/migrar.mjs', () => {
    expect(ler('package.json').scripts.build).toContain('scripts/migrar.mjs');
  });

  // Compilar ANTES de migrar: codigo que nem compila nao pode ter mexido
  // no banco de producao.
  it('compila antes de migrar', () => {
    const build = ler('package.json').scripts.build;
    expect(build.indexOf('vite build')).toBeLessThan(build.indexOf('scripts/migrar.mjs'));
  });

  it('a Vercel usa esse mesmo npm run build', () => {
    expect(ler('vercel.json').buildCommand).toBe('npm run build');
  });
});
