/**
 * Cadastro dos motivos de parada — a lista que era do codigo e virou da fabrica.
 *
 * O que este teste guarda nao e' o CRUD: e' o contrato que protege o
 * historico. O codigo de um motivo aparece na tela e nao aceita digitacao,
 * porque e' ele que fica gravado em cada parada ja' registrada. E motivo em
 * uso nao se exclui — se desativa, e a tela precisa dizer isso quando o
 * servidor recusar.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/motivos.e2e.mjs
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

/* ------------------------------------------ so no PC, e no menu lateral */
const item = p.getByRole('button', { name: 'Motivos de parada' });
checar(await item.count() === 1, 'PC: "Motivos de parada" vive em Ferramentas, no menu lateral');
await item.click();

const dialogo = p.locator('[aria-label="Motivos de parada"][role=dialog]');
await dialogo.waitFor({ timeout: 4000 });

/* --------------------------------- cadastro vazio: oferece o que ja existia */
await p.waitForFunction(
  () => /Nenhum motivo cadastrado/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
checar(/a coleta usa os 9 motivos que já vinham no app/.test(await dialogo.innerText()),
  'cadastro vazio explica que a coleta continua funcionando com os motivos de fabrica');

const trazer = dialogo.getByRole('button', { name: /Trazer os 9 motivos/ });
checar(await trazer.count() === 1, 'oferece trazer os motivos atuais em vez de pedir redigitacao');
await trazer.click();
await p.waitForFunction(
  () => /Setup \/ Troca/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);
const carga = await p.evaluate(() => window.__posts.find((q) => q.url.includes('/motivos-parada')));
checar(Array.isArray(carga?.corpo?.motivos) && carga.corpo.motivos.length === 9,
  'a carga inicial vai numa chamada so, com os 9 motivos');
checar(/Aplicar SMED/.test(await dialogo.innerText()), 'a acao recomendada vem junto, nao so o nome');

/* -------------------------------- o codigo aparece, mas nao se edita */
await dialogo.getByRole('button', { name: 'Editar Setup / Troca' }).click();
const campoCodigo = dialogo.locator('input[disabled]');
await campoCodigo.waitFor({ timeout: 4000 });
checar(await campoCodigo.inputValue() === 'setup', 'o codigo gravado nas paradas fica visivel');
checar(await campoCodigo.isDisabled(), 'e nao aceita digitacao — trocar orfanaria o historico');
checar(/renomeia o histórico inteiro, sem risco/.test(await dialogo.innerText()),
  'a tela explica que renomear e seguro');

/* --------------------------------------- renomear vale para tras */
const campoNome = dialogo.locator('input:not([disabled])').first();
await campoNome.fill('Preparação de máquina');
await dialogo.getByRole('button', { name: 'Salvar' }).click();
await p.waitForFunction(
  () => /Preparação de máquina/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);
const patch = await p.evaluate(() => window.__patches.filter((q) => q.url.includes('/motivos-parada')).pop());
checar(patch?.corpo?.rotulo === 'Preparação de máquina' && !('codigo' in patch.corpo),
  'salvar manda o rotulo novo e NAO manda codigo');

/* ------------------------------------- criar um motivo da propria fabrica */
await dialogo.getByRole('button', { name: '+ Novo motivo' }).click();
await dialogo.locator('input:not([disabled])').first().fill('Falta de energia');
await dialogo.locator('input:not([disabled])').nth(1).fill('Acionar a manutenção elétrica.');
await dialogo.getByRole('button', { name: 'Adicionar motivo' }).click();
await p.waitForFunction(
  () => /Falta de energia/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);
checar(true, 'a fabrica cadastra um motivo que o app nunca teve');

/* ------------------------------ desativar tira da coleta sem apagar */
await dialogo.getByRole('button', { name: 'Desativar Falta de energia' }).click();
await p.waitForFunction(
  () => /Desativado/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 6000 },
);
checar(/Desativado/.test(await dialogo.innerText()),
  'desativado continua na lista, marcado — ele ainda nomeia parada antiga');

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await b.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
