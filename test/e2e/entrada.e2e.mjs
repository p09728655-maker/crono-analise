/**
 * As portas de entrada do app — PC e tablet.
 *
 * PC sem sessao cai na tela de entrar; e-mail e senha viram sessao via
 * Supabase (mockado aqui) e o app abre. Tablet sem pareamento cai na tela
 * de preparar; o codigo vira credencial de aparelho e a coleta abre.
 * Nada disso passa pela API real: o que se testa e' o FLUXO das telas.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/entrada.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

const TOKENS = {
  access_token: 'tok-e2e', refresh_token: 'ref-e2e',
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
};

async function mocarApi(p) {
  await p.route('**/api/sessao**', (r) => r.fulfill({
    json: { usuario: { id: 'u1', nome: 'Oderli', papel: 'admin' } },
  }));
  await p.route('**/api/estudos**', (r) => r.fulfill({ json: { estudos: [] } }));
  await p.route('**/api/usuarios**', (r) => r.fulfill({ json: { usuarios: [] } }));
  await p.route('**/api/motivos-parada**', (r) => r.fulfill({ json: { motivos: [] } }));
  await p.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));
}

/* ----------------------------------------------------- PC: entrar e sair */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await mocarApi(p);
  let pedidoDeLogin = null;
  await p.route('**/auth/v1/token**', async (r) => {
    pedidoDeLogin = r.request().postDataJSON();
    await r.fulfill({ json: TOKENS });
  });

  await p.goto(`${BASE}/analise`);
  await p.waitForSelector('form[aria-label="Entrar no sistema"]', { timeout: 8000 });
  checar(true, 'PC sem sessao: a tela de entrada aparece antes de qualquer dado');

  await p.fill('input[type="email"]', 'ppcp@patrimarmoveis.com.br');
  await p.fill('input[type="password"]', 'senha-de-teste');
  await p.click('button[type="submit"]');
  await p.waitForSelector('nav[aria-label="Navegação"]', { timeout: 8000 });
  checar(true, 'PC: entrar abre o app');
  checar(pedidoDeLogin?.email === 'ppcp@patrimarmoveis.com.br',
    'PC: o login foi para o Supabase com o e-mail digitado');
  checar(pedidoDeLogin?.password === 'senha-de-teste', 'PC: e com a senha digitada');

  const sessao = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.auth')));
  checar(sessao?.access === 'tok-e2e', 'PC: a sessao guardada e a que o Supabase emitiu');

  await ctx.close();
}

/* --------------------------------------------- PC: senha errada tem nome */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await mocarApi(p);
  await p.route('**/auth/v1/token**', (r) => r.fulfill({
    status: 400, json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
  }));

  await p.goto(`${BASE}/analise`);
  await p.waitForSelector('form[aria-label="Entrar no sistema"]', { timeout: 8000 });
  await p.fill('input[type="email"]', 'alguem@x.br');
  await p.fill('input[type="password"]', 'senha-errada');
  await p.click('button[type="submit"]');
  await p.waitForSelector('[role="alert"]', { timeout: 8000 });
  const erro = await p.locator('[role="alert"]').innerText();
  checar(/E-mail ou senha/.test(erro), `PC: recusa vira mensagem clara ("${erro}")`);
  checar(await p.locator('form[aria-label="Entrar no sistema"]').count() === 1,
    'PC: continua na tela de entrada, pronto para tentar de novo');
  await ctx.close();
}

/* ------------------------------------------------- tablet: parear uma vez */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await mocarApi(p);
  let pareamento = null;
  await p.route('**/api/dispositivos', async (r) => {
    pareamento = r.request().postDataJSON();
    await r.fulfill({
      status: 201,
      json: { dispositivo: { id: 'd1', nome: 'Tablet' }, email: 'coletor-1@dispositivo.x', senha: 'segredo-do-aparelho' },
    });
  });
  await p.route('**/auth/v1/token**', (r) => r.fulfill({ json: TOKENS }));

  await p.goto(`${BASE}/coleta`);
  await p.waitForSelector('form[aria-label="Preparar este aparelho"]', { timeout: 8000 });
  checar(true, 'tablet sem pareamento: a tela de preparar aparece');

  const botao = p.locator('button[type="submit"]');
  checar(await botao.isDisabled(), 'tablet: sem codigo completo o botao nem arma');

  await p.fill('input[autocomplete="one-time-code"]', 'abc234');
  await p.fill('input[placeholder*="Tablet"]', 'Tablet furadeiras');
  await botao.click();
  await p.waitForSelector('h1, h2', { timeout: 8000 });
  checar(pareamento?.codigo === 'ABC234', 'tablet: o codigo sobe em MAIUSCULAS, como o PC mostra');
  checar(pareamento?.nome === 'Tablet furadeiras', 'tablet: o nome do aparelho vai junto');

  const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.aparelho')));
  checar(guardado?.email === 'coletor-1@dispositivo.x', 'tablet: a credencial do aparelho fica guardada');

  // Recarregar NAO pede pareamento de novo: e' uma vez por aparelho.
  await p.goto(`${BASE}/coleta`);
  await p.waitForTimeout(600);
  checar(await p.locator('form[aria-label="Preparar este aparelho"]').count() === 0,
    'tablet: recarregar nao pede o codigo de novo');

  await ctx.close();
}

await b.close();
if (falhas) { console.error(`\n${falhas} checagem(ns) falharam`); process.exit(1); }
console.log('\nTodas as checagens de entrada passaram');
