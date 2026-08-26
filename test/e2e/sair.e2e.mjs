/**
 * SAIR DO SISTEMA — o botao que so' existe no tablet.
 *
 * No PC fechar o app e' o X do navegador. No tablet ele roda instalado, em
 * tela cheia, e nao havia por onde sair ao fim do turno. O que este teste
 * garante nao e' o botao existir: e' a fila offline ser DITA antes de sair.
 * Registro que ainda nao subiu esta' salvo no aparelho, mas so' chega ao PC
 * quando alguem abrir o app de novo — quem fecha precisa saber disso.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/sair.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 800, height: 1100 }, hasTouch: true });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

/* ------------------------------------------ no PC o botao nao pode existir */
await p.goto(`${PAGINA}?modo=analise`);
await p.getByText('Sleep Base').first().waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Sair do sistema' }).count() === 0,
  'no PC (analise) nao ha botao de sair — quem fecha e o navegador');

/* -------------------------------------- tablet com a fila vazia: sai limpo */
await p.goto(`${PAGINA}?sair=1`);
await p.getByText('Sleep Base').first().waitFor({ timeout: 8000 });
const botao = p.getByRole('button', { name: 'Sair do sistema' });
checar(await botao.count() === 1, 'no tablet o botao Sair aparece no cabecalho');

await botao.click();
const dialogo = p.locator('[aria-label="Sair do sistema"][role=dialog]');
await dialogo.waitFor({ timeout: 4000 });
await p.waitForFunction(
  () => !/Conferindo se há registro/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
checar(/Tudo sincronizado/.test(await dialogo.innerText()),
  'fila vazia: a confirmacao diz que nao ha nada esperando envio');
checar(await dialogo.getByRole('button', { name: 'Enviar agora' }).count() === 0,
  'sem pendencia nao existe botao Enviar agora');

await dialogo.getByRole('button', { name: 'Continuar no app' }).click();
checar(await p.locator('[role=dialog]').count() === 0, 'Continuar no app fecha a confirmacao');
checar(await p.evaluate(() => window.__saiu) === false, 'cancelar nao encerra o sistema');

/* ------------------------- tablet com registro na fila: precisa AVISAR */
await p.evaluate(async () => {
  for (let i = 0; i < 3; i++) {
    await window.__enfileirar({
      tipo: 'observacao', clientId: crypto.randomUUID(),
      operacaoId: '11111111-1111-1111-1111-111111111111',
      duracaoMs: 9000, rodada: 1, coletadoEm: new Date(2026, 0, 1).toISOString(),
    });
  }
});

await p.getByRole('button', { name: 'Sair do sistema' }).click();
const d2 = p.locator('[aria-label="Sair do sistema"][role=dialog]');
await d2.waitFor({ timeout: 4000 });
await p.waitForFunction(
  () => /registro\(s\) ainda não enviados/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
const texto = await d2.innerText();
checar(/3 registro\(s\) ainda não enviados/.test(texto), 'a confirmacao conta os registros da fila');
checar(/não se perdem ao sair/.test(texto), 'diz que o dado nao se perde — senao o aviso vira susto');

const sairAssim = d2.getByRole('button', { name: 'Sair mesmo assim' });
checar(await sairAssim.count() === 1, 'com pendencia o botao muda para "Sair mesmo assim"');
await sairAssim.click();
checar(await p.evaluate(() => window.__saiu) === true, 'confirmar encerra o sistema');

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
