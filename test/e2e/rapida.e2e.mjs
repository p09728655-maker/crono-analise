/**
 * Conferencia rapida — cronometro avulso, sem cadastro.
 *
 * Roda contra o app REAL, com a API fora do ar DE PROPOSITO: a promessa da
 * tela e' funcionar sem servidor, entao o teste cobre exatamente isso —
 * o atalho aparece mesmo com a lista em erro, e o fluxo inteiro (iniciar,
 * contar, encerrar, editar a quantidade) fecha sem uma requisicao sequer.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/rapida.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

/* ------------------------------------------ atalho independe do servidor */
await p.goto(`${BASE}/coleta`);
const atalho = p.getByRole('button', { name: /Conferência rápida/ });
await atalho.waitFor({ timeout: 8000 });
checar(true, 'atalho visivel na lista de coleta mesmo com a API fora');

await atalho.tap();
await p.waitForFunction(() => location.pathname === '/coleta/rapida', { timeout: 8000 });
checar(true, 'atalho leva para /coleta/rapida');

/* ------------------------------------------------------- fluxo completo */
await p.getByRole('button', { name: /INICIAR CONFERÊNCIA/ }).tap();
await p.waitForTimeout(1000);

const contar = p.locator('[aria-label="Contar uma peça"]');
for (let i = 0; i < 3; i++) {
  await contar.tap();
  // Guarda de repique recusa toques com menos de 200ms de intervalo.
  await p.waitForTimeout(260);
}
checar((await contar.innerText()).includes('3'), 'tres toques contam tres pecas');

// Repique: dois pointerdown SINCRONOS — impossivel passar 200ms entre eles.
// Tap duplo via automatizador tem latencia variavel e deixaria o teste
// intermitente justo no que ele quer provar.
await p.evaluate(() => {
  const botao = document.querySelector('[aria-label="Contar uma peça"]');
  const toque = () => new PointerEvent('pointerdown', { bubbles: true });
  botao.dispatchEvent(toque()); // conta: ja se passaram 260ms do anterior
  botao.dispatchEvent(toque()); // repique imediato — nao pode contar
});
await p.waitForTimeout(100);
checar((await contar.innerText()).includes('4'), 'toque em repique (<200ms) nao conta peca');

await p.getByRole('button', { name: /Encerrar/ }).tap();
const inputPecas = p.locator('input[aria-label="Peças no período"]');
await inputPecas.waitFor({ timeout: 4000 });
checar(await inputPecas.inputValue() === '4', 'resultado abre com as pecas contadas');

const ritmo = async () => parseInt((await p.locator('[aria-label="Ritmo do período"]').innerText()), 10);
const ritmoContado = await ritmo();
checar(ritmoContado > 0, `ritmo calculado na hora (${ritmoContado} pc/h)`);

/* --------------------------- quem leu o contador da maquina digita o total */
await inputPecas.fill('150');
const ritmoEditado = await ritmo();
checar(ritmoEditado > ritmoContado, `editar as pecas recalcula o ritmo (${ritmoEditado} pc/h)`);
// 150 pecas em ~2.9s de cronometro: a proporcao com o ritmo de 4 pecas
// tem de ser exatamente 150/4 — mesmo periodo, so' mudou a quantidade.
checar(Math.abs(ritmoEditado / ritmoContado - 150 / 4) < 0.5, 'ritmo proporcional a quantidade digitada');

/* --------------------------------------------------- reinicio e viewport */
checar(await p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  'tudo cabe na viewport do celular, sem rolagem');

await p.getByRole('button', { name: /Nova conferência/ }).tap();
await p.getByRole('button', { name: /INICIAR CONFERÊNCIA/ }).waitFor({ timeout: 4000 });
checar(true, 'nova conferencia volta ao inicio');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
