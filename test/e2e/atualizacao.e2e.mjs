/**
 * Aviso de atualizacao — a faixa que explica por que a tela amanheceu
 * diferente.
 *
 * Cobre a politica inteira contra o app real, com a API fora do ar (a
 * faixa nao depende de rede):
 *  1. primeira visita: nenhuma faixa, versao gravada em silencio;
 *  2. versao antiga gravada: faixa aparece, "Ver novidades" abre o
 *     historico e marca como vista;
 *  3. dispensar pelo × tambem marca — recarregar nao traz a faixa de volta.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/atualizacao.e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAVE = 'ritmopatrimar.versaoVista';
const VERSAO = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

const faixa = () => p.locator('[aria-label="Aviso de atualização"]');

/* -------------------------------------------- 1. primeira visita: silencio */
await p.goto(`${BASE}/coleta`);
await p.getByRole('button', { name: /Conferência rápida/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'primeira visita nao mostra faixa');
checar(
  await p.evaluate((k) => localStorage.getItem(k), CHAVE) === VERSAO,
  `primeira visita grava a versao em silencio (${VERSAO})`,
);

/* --------------------------------- 2. versao antiga: faixa + ver novidades */
await p.evaluate((k) => localStorage.setItem(k, '2.0.0'), CHAVE);
await p.reload();
await faixa().waitFor({ timeout: 8000 });
checar((await faixa().innerText()).includes(`v${VERSAO}`), 'faixa anuncia a versao que chegou');

await p.getByRole('button', { name: 'Ver novidades' }).tap();
await p.locator('[aria-label="Histórico de versões"]').waitFor({ timeout: 4000 });
checar(true, '"Ver novidades" abre o historico de versoes');
checar(await faixa().count() === 0, 'abrir as novidades ja recolhe a faixa');
await p.getByRole('button', { name: 'Fechar histórico' }).tap();

await p.reload();
await p.getByRole('button', { name: /Conferência rápida/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'vista uma vez, a faixa nao volta ao recarregar');

/* ------------------------------------------------- 3. dispensar pelo × */
await p.evaluate((k) => localStorage.setItem(k, '2.0.0'), CHAVE);
await p.reload();
await faixa().waitFor({ timeout: 8000 });
await p.getByRole('button', { name: 'Dispensar aviso de atualização' }).tap();
checar(await faixa().count() === 0, 'dispensar pelo × recolhe a faixa');

await p.reload();
await p.getByRole('button', { name: /Conferência rápida/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'dispensada tambem conta como vista apos recarregar');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
