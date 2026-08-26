/**
 * Chave da IA — alcancavel a partir da LISTA.
 *
 * A chave nasceu dentro do painel de analise, onde e' usada. So' que ali
 * ela fica atras de um estudo aberto: com a lista vazia — todos arquivados,
 * por exemplo — nao havia como chegar nela. Configuracao do app nao pode
 * depender de um dado que talvez nao exista. Este teste prova justamente o
 * caso dificil: lista VAZIA e a chave ainda assim configuravel.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/chaveia.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

/* --------------- o caso que motivou a mudanca: lista sem estudo nenhum */
await p.goto(`${PAGINA}?modo=analise&vazio=1`);
await p.getByText('Nenhum estudo cadastrado').waitFor({ timeout: 8000 });

const botao = p.getByRole('button', { name: 'Chave da IA' });
checar(await botao.count() === 1, 'lista VAZIA: botao "Chave da IA" alcancavel mesmo assim');

await botao.click();
const dialogo = p.locator('[aria-label="Chave da IA"]');
await dialogo.waitFor({ timeout: 4000 });
const campo = dialogo.locator('input[type=password]');
await campo.waitFor({ timeout: 4000 });
checar(true, 'modal abre direto no campo da chave');
checar(/console\.anthropic\.com/.test(await dialogo.innerText()), 'diz onde gerar a chave');
checar(/não aparece de volta depois de salva/i.test(await dialogo.innerText()),
  'avisa que a chave nao volta para o navegador');

/* ---------------------------------------- salvar manda para o servidor */
await campo.fill('sk-ant-teste1234567890abcdef');
await dialogo.getByRole('button', { name: 'Salvar chave' }).click();
await p.waitForFunction(() => window.__posts.some((q) => q.url.includes('/config')), { timeout: 8000 });
const post = await p.evaluate(() => window.__posts.find((q) => q.url.includes('/config')));
checar(post.corpo.chaveIa === 'sk-ant-teste1234567890abcdef', 'a chave digitada vai no POST /config');

// Depois de salva, some o formulario e sobra o resumo — nunca a chave inteira.
await dialogo.getByText(/•••cdef/).waitFor({ timeout: 4000 });
checar(true, 'depois de salvar, mostra so os 4 ultimos caracteres');
checar(await dialogo.locator('input[type=password]').count() === 0,
  'formulario recolhe quando ja ha chave');
checar(!(await dialogo.innerText()).includes('sk-ant-teste'),
  'a chave inteira nunca reaparece na tela');

await dialogo.getByRole('button', { name: 'Trocar chave' }).click();
checar(await dialogo.locator('input[type=password]').count() === 1, '"Trocar chave" reabre o campo');

await dialogo.getByRole('button', { name: 'Fechar' }).click();
await dialogo.waitFor({ state: 'detached', timeout: 4000 });
checar(true, 'modal fecha');

/* -------------------------- na coleta nao aparece: e trabalho de escritorio */
const movel = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const pm = await movel.newPage();
await pm.goto(`${PAGINA}?modo=coleta`);
await pm.getByText('Furação lateral').first().waitFor({ timeout: 8000 });
checar(await pm.getByRole('button', { name: 'Chave da IA' }).count() === 0,
  'coleta: sem botao de chave — no posto so se cronometra');
await movel.close();

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await b.close();
process.exit(falhas ? 1 : 0);
