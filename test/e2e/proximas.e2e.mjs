/**
 * Proximas acoes — a area abaixo da tabela, no PC.
 *
 * Cobre o que a tela promete: mostrar primeiro o estudo que ninguem mediu,
 * levar a' coleta que ja' existe (nao a uma tela nova) e sumir por completo
 * quando nao ha nada a fazer. Cobre tambem o tablet, que NAO deve ganhar a
 * area: la a tela ja' e' so' a lista de coleta.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/proximas.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* ------------------------------------------------------ PC, com estudos */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise&comconcluido=1`);
  await p.waitForSelector('text=PRÓXIMAS AÇÕES', { timeout: 8000 });

  const secao = p.locator('section[aria-label="Próximas ações"]');
  checar(await secao.count() === 1, 'a area aparece quando ha estudos');

  const cartoes = secao.locator('> div > div');
  checar(await cartoes.count() > 0, 'a area lista pelo menos um estudo');

  // O estudo sem nenhum ciclo vem primeiro — e' quem esta' esperando.
  const primeiro = cartoes.first();
  checar(
    (await primeiro.innerText()).includes('AGUARDANDO MEDIÇÃO'),
    'a pendencia sem ciclo vem antes da medicao em andamento',
  );
  checar(
    (await primeiro.innerText()).includes('Estudo sem produto'),
    'o cartao nomeia o estudo que esta parado',
  );

  // O botao leva a' rota de coleta que ja' existia — nao a uma tela nova.
  await primeiro.locator('button', { hasText: 'Iniciar medição' }).click();
  checar(await p.evaluate(() => window.__medindo) === 'e5', 'Iniciar medição manda o estudo para a coleta');

  // Medicao em andamento e concluido tambem aparecem, com a acao propria.
  const texto = await secao.innerText();
  checar(texto.includes('MEDIÇÃO EM ANDAMENTO'), 'estudo com ciclos aparece como em andamento');
  checar(texto.includes('Continuar medição'), 'estudo em andamento oferece continuar');

  // O destino da analise existe UMA vez por estudo: no nome, na tabela.
  // O botao "Analisar" da linha saiu para nao repetir, ao lado, o mesmo
  // alvo que os cartoes ja oferecem.
  const linhas = p.locator('table tbody tr');
  checar(
    await linhas.locator('button', { hasText: /^Analisar$/ }).count() === 0,
    'a linha da tabela nao repete o botao Analisar',
  );
  await linhas.first().locator('button', { hasText: 'Furação lateral' }).click();
  checar(await p.evaluate(() => window.__aberto) === 'e1', 'o nome do estudo abre a analise');

  // Pendencias tambem viram indicador na Visao geral.
  const painel = p.locator('aside[aria-label="Visão geral"]');
  checar((await painel.innerText()).includes('Pendências'), 'a Visao geral mostra pendencias de medicao');

  // Nada empurra a pagina para os lados.
  const vazando = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  checar(!vazando, 'a area nao cria rolagem horizontal no PC');

  await ctx.close();
}

/* ------------------------------------------------- PC, sem estudo nenhum */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise&vazio=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });

  checar(
    await p.locator('section[aria-label="Próximas ações"]').count() === 0,
    'sem estudos, a area some — o estado vazio continua sozinho na tela',
  );
  checar(
    await p.locator('button', { hasText: '+ Novo estudo' }).count() > 0,
    'o estado vazio segue chamando para criar o primeiro estudo',
  );

  await ctx.close();
}

/* ------------------------------------------------------------ no tablet */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=coleta`);
  await p.waitForSelector('h2', { timeout: 8000 });

  checar(
    await p.locator('section[aria-label="Próximas ações"]').count() === 0,
    'o tablet nao ganha a area: la a tela inteira ja e a fila de coleta',
  );

  const vazando = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  checar(!vazando, 'o tablet segue sem rolagem horizontal');

  await ctx.close();
}

await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
