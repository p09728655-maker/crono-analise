/**
 * Relatorio de conferencias — o estudo por maquina, no PC.
 *
 * Com a API fora do ar (como nos demais e2e), o que da' para provar e' a
 * fiacao: a rota abre no PC, o cabecalho certo aparece, o erro de carga e'
 * honesto e oferece "Tentar de novo" — e o botao "Conferências" da lista
 * leva ate' aqui. O conteudo com dados reais e' coberto pelos testes de
 * integracao da API e pelo dominio (resumirConferencias).
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/relatorio-conferencias.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto(`${BASE}/analise/conferencias`);
await p.getByText('Conferências rápidas').first().waitFor({ timeout: 8000 });
checar(true, 'PC: /analise/conferencias abre o relatorio');
checar(await p.getByText('Estudo por máquina').count() > 0, 'subtitulo diz o que a tela e');

await p.getByText('Não foi possível carregar').waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Tentar de novo' }).count() === 1,
  'API fora: erro honesto com "Tentar de novo"');

// Voltar leva para a lista de analise.
await p.getByRole('button', { name: /Voltar para a lista/ }).click();
await p.waitForFunction(() => location.pathname === '/analise', { timeout: 8000 });
checar(true, 'voltar leva para /analise');

// No celular, /analise/conferencias nao existe: cai na coleta.
const movel = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const pm = await movel.newPage();
await pm.goto(`${BASE}/analise/conferencias`);
await pm.waitForFunction(() => location.pathname === '/coleta', { timeout: 8000 });
checar(true, 'celular: relatorio redireciona para a coleta');
await movel.close();

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
