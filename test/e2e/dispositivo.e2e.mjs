/**
 * Celular e tablet SO abrem a coleta.
 *
 * Analise e' trabalho de PC. No aparelho de toque nao ha abas de modo, e um
 * link /analise (favorito antigo, link compartilhado) cai na coleta
 * equivalente em vez de abrir o painel errado no chao de fabrica.
 *
 * Roda contra o app REAL (nao harness): a politica vive no App.jsx.
 * A API nao esta no ar — a tela mostra erro de carga, mas URL e cabecalho
 * ja dizem tudo o que este teste precisa.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/dispositivo.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const UUID = 'b17e849c-da3f-4d8c-a262-81e8748c589b';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* ------------------------------------------------ celular: so coleta */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();

  await p.goto(`${BASE}/analise`);
  await p.waitForFunction(() => location.pathname === '/coleta', { timeout: 8000 });
  checar(true, 'celular: /analise redireciona para /coleta');

  checar(await p.locator('[aria-label="Modo de uso"]').count() === 0,
    'celular: sem abas Coleta/Análise — coleta e o unico modo');

  await p.goto(`${BASE}/analise/estudo/${UUID}`);
  await p.waitForFunction((id) => location.pathname === `/coleta/estudo/${id}`, UUID, { timeout: 8000 });
  checar(true, 'celular: link de estudo em analise cai no estudo em coleta');
  await ctx.close();
}

/* --------------------------------------------------- PC: os dois modos */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/analise`);
  await p.waitForTimeout(800);
  checar(await p.evaluate(() => location.pathname) === '/analise', 'PC: /analise permanece analise');
  // A navegacao do PC virou menu lateral: mais espaco para o conteudo e
  // lugar para busca, produtos e relatorios — que nao cabiam numa barra.
  checar(await p.locator('nav[aria-label="Navegação"]').count() === 1, 'PC: menu lateral presente');
  checar(await p.getByRole('button', { name: /Ir para a Coleta/ }).count() === 1,
    'PC: caminho para a coleta continua a um clique');
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
