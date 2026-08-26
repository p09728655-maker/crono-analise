/**
 * Estudos arquivados — ver e restaurar.
 *
 * Arquivar sempre preservou o dado, mas o estudo sumia da lista sem lugar
 * nenhum onde reve-lo: quem arquivou por engano ficava sem saida dentro do
 * app. Este teste cobre a volta do caminho, nos dois modos, e prova o que
 * mais importa: o botao NAO aparece quando nao ha nada arquivado (senao
 * vira ruido permanente no topo).
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/arquivados.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* ---------------------------------- sem arquivados: botao nao existe */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise`);
  await p.getByText('Furação lateral').first().waitFor({ timeout: 8000 });
  checar(await p.getByRole('button', { name: /Arquivados/ }).count() === 0,
    'sem arquivados: o botao nem aparece');
  await ctx.close();
}

/* ------------------------- lista vazia + arquivados: o vazio conta a verdade */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise&vazio=1&arq=1`);
  await p.getByText('Nenhum estudo cadastrado').waitFor({ timeout: 8000 });
  const texto = await p.locator('body').innerText();
  checar(/Arquivados 1/.test(texto), 'lista vazia com arquivados: botao mostra a contagem');
  checar(/restaurar um que saiu da lista/i.test(texto),
    'estado vazio aponta os arquivados em vez de dizer que nao ha nada');
  checar(/Nenhum ciclo foi perdido/i.test(texto), 'estado vazio garante que nada se perdeu');
  await ctx.close();
}

/* -------------------------------------- restaurar devolve para a lista */
for (const modo of ['analise', 'coleta']) {
  const ctx = await b.newContext({
    viewport: modo === 'analise' ? { width: 1440, height: 900 } : { width: 400, height: 860 },
    hasTouch: modo === 'coleta',
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));

  await p.goto(`${PAGINA}?modo=${modo}&arq=1`);
  const botao = p.getByRole('button', { name: /Arquivados/ });
  await botao.waitFor({ timeout: 8000 });
  checar(true, `${modo}: botao "Arquivados" presente`);

  await botao.click();
  const dialogo = p.locator('[aria-label="Estudos arquivados"]');
  await dialogo.waitFor({ timeout: 4000 });
  const textoDialogo = await dialogo.innerText();
  checar(/MESA CABECEIRA SLEEP BRANCO/.test(textoDialogo), `${modo}: estudo arquivado listado`);
  checar(/89 ciclo/.test(textoDialogo), `${modo}: contagem de ciclos preservada aparece`);
  checar(/não apaga nada/i.test(textoDialogo), `${modo}: explica que arquivar nao apaga`);

  await dialogo.getByRole('button', { name: 'Restaurar' }).click();
  await p.waitForFunction(() => window.__patches.length > 0, { timeout: 8000 });
  const patch = await p.evaluate(() => window.__patches[0]);
  checar(patch.corpo.status === 'coletando', `${modo}: PATCH pede status coletando`);
  checar(patch.url.includes('id=a1'), `${modo}: PATCH aponta o estudo certo`);

  // Voltou para a lista, e o botao de arquivados sumiu (nao ha mais nenhum).
  await p.getByText('MESA CABECEIRA SLEEP BRANCO').first().waitFor({ timeout: 8000 });
  checar(true, `${modo}: estudo restaurado aparece na lista`);
  await p.waitForFunction(
    () => ![...document.querySelectorAll('button')].some((b) => /Arquivados/.test(b.textContent)),
    { timeout: 8000 },
  );
  checar(true, `${modo}: sem mais arquivados, o botao some sozinho`);

  checar(erros.length === 0, `${modo}: sem erro de pagina (${erros.join('; ') || 'nenhum'})`);
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
