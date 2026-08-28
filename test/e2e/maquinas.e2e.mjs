/**
 * Cadastro de maquinas — grupos codificados e a impressao dedicada.
 *
 * O que este teste guarda:
 *  - a tela vive em Ferramentas > Maquinas e mostra grupos com CODIGO;
 *  - a lista de maquinas sai agrupada ("0002 · FURADEIRA") e a desativada
 *    e' visivel como tal;
 *  - o documento de impressao existe, com cabecalho proprio, TODAS as
 *    maquinas (desativadas incluidas) e o grupo ainda sem maquina.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/maquinas.e2e.mjs
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

/* --------------------------------------- a tela vive em Ferramentas */
const item = p.getByRole('button', { name: 'Máquinas' }).first();
checar(await item.count() === 1, 'PC: "Máquinas" vive em Ferramentas, no menu lateral');
await item.click();

const dialogo = p.locator('[aria-label="Cadastro de máquinas"][role=dialog]');
await dialogo.waitFor({ timeout: 4000 });
await p.waitForFunction(
  () => /SECCIONADORA/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
const texto = await dialogo.innerText();
checar(/0001/.test(texto) && /SECCIONADORA/.test(texto) && /0002/.test(texto),
  'o bloco de grupos mostra os codigos do ERP (0001, 0002)');
checar(/0002 · FURADEIRA/.test(texto) && /Furadeira 12/.test(texto),
  'a lista de maquinas sai agrupada sob o cabecalho do grupo');
checar(/Desativada/.test(texto), 'maquina desativada aparece marcada, nao some');
checar(await dialogo.getByRole('button', { name: 'Imprimir' }).count() === 1,
  'a tela tem o botao Imprimir');

/* ------------------------------------------- o documento de impressao */
const impresso = await p.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
checar(/Cadastro de Máquinas/.test(impresso), 'o papel e um documento proprio, com titulo');
checar(/0002/.test(impresso) && /Furadeira 16/.test(impresso) && /Desativada/.test(impresso),
  'o papel lista todas as maquinas com grupo e situacao — desativada incluida');
checar(/sem máquinas cadastradas/.test(impresso) && /SECCIONADORA/.test(impresso),
  'grupo ainda sem maquina tambem sai no papel');
checar(await p.evaluate(() => {
  const doc = document.querySelector('.somente-impressao');
  return doc && getComputedStyle(doc).display === 'none';
}), 'na tela o documento fica invisivel — ele so existe para o papel');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await b.close();
process.exit(falhas ? 1 : 0);
