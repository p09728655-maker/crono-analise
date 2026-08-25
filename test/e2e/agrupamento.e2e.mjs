/**
 * Agrupamento por produto na lista de estudos.
 *
 * Antes a lista vinha plana e misturava produtos diferentes numa tela so'.
 * O campo `produto` e' texto livre, entao o teste usa de proposito tres
 * grafias do mesmo produto — se o agrupamento normalizasse mal, apareceriam
 * tres grupos onde deve haver um.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/agrupamento.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

for (const modo of ['analise', 'coleta']) {
  const ctx = await b.newContext({
    viewport: modo === 'analise' ? { width: 1440, height: 900 } : { width: 400, height: 860 },
    hasTouch: modo === 'coleta',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=${modo}`);
  await p.waitForSelector('h2', { timeout: 8000 });
  await p.waitForTimeout(400);

  const titulos = await p.locator('section h2').allInnerTexts();
  checar(titulos.length === 3, `${modo}: 3 grupos (${titulos.join(' | ')})`);
  checar(titulos.filter((t) => /sleep base/i.test(t)).length === 1,
    `${modo}: as tres grafias de "Sleep Base" viraram UM grupo`);
  checar(/sem produto/i.test(titulos[titulos.length - 1]),
    `${modo}: "sem produto" fica por ultimo, nao lidera a tela`);

  // Grupo maior primeiro: Sleep Base tem 3 estudos, Painel tem 1.
  checar(/sleep base/i.test(titulos[0]), `${modo}: grupo maior aparece primeiro`);

  const filtros = p.locator('[aria-label="Filtrar por produto"] button');
  checar(await filtros.count() === 4, `${modo}: filtro com Todos + 3 produtos`);

  await filtros.nth(1).click();
  await p.waitForTimeout(300);
  const aposFiltro = await p.locator('section h2').allInnerTexts();
  checar(aposFiltro.length === 1, `${modo}: filtrar reduz para 1 grupo (${aposFiltro[0]})`);

  await filtros.first().click();
  await p.waitForTimeout(300);
  checar((await p.locator('section h2').count()) === 3, `${modo}: "Todos" restaura os grupos`);

  await ctx.close();
}

await b.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
