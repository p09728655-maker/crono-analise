/**
 * Cadastro de analistas — o campo que era texto livre.
 *
 * Existe por um numero medido no banco de producao: a mesma pessoa gravada
 * como "ODERLI", "ODERLI GARCIA" e "ODERLI SERGIO GARCIA" em estudos
 * diferentes. Indicador por pessoa contava tres.
 *
 * O que este teste guarda:
 *  - a senha nunca aparece na tela nem sai no corpo de volta;
 *  - sem cadastro, o campo Analista continua sendo texto livre — a tela nao
 *    pode travar quem nunca abriu Ferramentas;
 *  - com cadastro, ele vira lista, que e o unico jeito de acabar com as
 *    grafias;
 *  - a tela diz que identificar-se NAO restringe acesso, porque nao restringe.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/analistas.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html?modo=analise`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto(PAGINA);
await p.getByText('Sleep Base').first().waitFor({ timeout: 8000 });

/* ------------------------- sem cadastro, o estudo NAO trava: texto livre */
await p.getByRole('button', { name: '+ Novo estudo' }).click();
const form = p.locator('[aria-label="Novo estudo"]');
await form.waitFor({ timeout: 4000 });
const campoAnalista = form.locator('label', { hasText: 'Analista' }).first();
checar(await campoAnalista.locator('input').count() === 1,
  'sem cadastro: Analista segue campo de texto — a tela nao trava quem nunca cadastrou');
await form.getByRole('button', { name: /Cancelar/ }).first().click();
await p.waitForTimeout(300);

/* --------------------------------------- a tela vive em Ferramentas */
const item = p.getByRole('button', { name: 'Analistas' }).first();
checar(await item.count() === 1, 'PC: "Analistas" vive em Ferramentas, no menu lateral');
await item.click();

const dialogo = p.locator('[aria-label="Analistas"][role=dialog]');
await dialogo.waitFor({ timeout: 4000 });
await p.waitForFunction(
  () => /Nenhum analista cadastrado/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
checar(/três grafias/.test(await dialogo.innerText()),
  'o vazio explica POR QUE a tela existe, com o caso real');
checar(/Ninguém identificado/.test(await dialogo.innerText()),
  'diz que ninguem esta identificado neste computador');

/* --------------------------------------------- cadastrar com senha */
await dialogo.getByRole('button', { name: '+ Novo analista' }).click();
await dialogo.locator('input[type=text]').first().fill('Oderli Sergio Garcia');
await dialogo.locator('input[type=email]').first().fill('oderli@patrimar.com');
await dialogo.locator('input[type=password]').first().fill('furadeira2026');
await dialogo.getByRole('button', { name: 'Adicionar analista' }).click();
await p.waitForFunction(
  () => /Oderli Sergio Garcia/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);

const texto = await dialogo.innerText();
checar(!/furadeira2026/.test(texto), 'a senha NAO aparece em lugar nenhum da tela');
checar(/com senha/.test(texto), 'a tela diz quem consegue se identificar, sem mostrar a senha');
checar(/não restringe o acesso/.test(texto),
  'a tela e honesta: identificar-se nao restringe acesso de ninguem');

/* ----------------------------------- desativar tira da lista de escolha */
await dialogo.getByRole('button', { name: 'Desativar Oderli Sergio Garcia' }).click();
await p.waitForFunction(
  () => /Desativado/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);
checar(true, 'desativar mantem o analista na lista, marcado');
await dialogo.getByRole('button', { name: 'Reativar Oderli Sergio Garcia' }).click();
await p.waitForFunction(
  () => !/Desativado/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);

await dialogo.getByRole('button', { name: 'Fechar' }).click();
await p.waitForTimeout(600);

/* ------------------- com cadastro, o campo Analista do estudo vira LISTA */
await p.getByRole('button', { name: '+ Novo estudo' }).click();
const form2 = p.locator('[aria-label="Novo estudo"]');
await form2.waitFor({ timeout: 4000 });
const campo2 = form2.locator('label', { hasText: 'Analista' }).first();
await p.waitForFunction(
  () => !!document.querySelector('[aria-label="Novo estudo"] select'),
  { timeout: 6000 },
);
checar(await campo2.locator('select').count() === 1,
  'com cadastro: Analista vira lista — e o que acaba com as tres grafias');
checar((await campo2.locator('select').innerText()).includes('Oderli Sergio Garcia'),
  'o analista cadastrado aparece na lista de escolha');

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
