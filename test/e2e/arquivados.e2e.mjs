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
  checar(await p.getByRole('button', { name: /arquivados/i }).count() === 0,
    'sem arquivados: o item nem aparece');
  await ctx.close();
}

/* ------------------------- lista vazia + arquivados: o vazio conta a verdade */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise&vazio=1&arq=1`);
  await p.getByText('Nenhum estudo cadastrado').waitFor({ timeout: 8000 });
  const texto = await p.locator('body').innerText();
  checar(/Estudos arquivados/.test(texto) && /\b1\b/.test(texto),
    'lista vazia com arquivados: menu lateral mostra a contagem');
  checar(/restaurar um dos 1 que saíram da lista/i.test(texto),
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
  // PC: item no menu lateral. Celular: botao no topo.
  const botao = p.getByRole('button', { name: /arquivados/i });
  await botao.waitFor({ timeout: 8000 });
  checar(true, `${modo}: acesso aos arquivados presente`);

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
  // Cada contexto restaura para SI: o PC devolve o estudo a' analise (sem
  // reabrir a coleta do tablet); o tablet devolve ao proprio tablet.
  const destino = modo === 'analise' ? 'concluido' : 'coletando';
  checar(patch.corpo.status === destino, `${modo}: PATCH pede status ${destino}`);
  checar(patch.url.includes('id=a1'), `${modo}: PATCH aponta o estudo certo`);

  // Voltou para a lista, e o botao de arquivados sumiu (nao ha mais nenhum).
  await p.getByText('MESA CABECEIRA SLEEP BRANCO').first().waitFor({ timeout: 8000 });
  checar(true, `${modo}: estudo restaurado aparece na lista`);
  await p.waitForFunction(
    () => ![...document.querySelectorAll('button')].some((b) => /arquivados/i.test(b.textContent)),
    { timeout: 8000 },
  );
  checar(true, `${modo}: sem mais arquivados, o acesso some sozinho`);

  checar(erros.length === 0, `${modo}: sem erro de pagina (${erros.join('; ') || 'nenhum'})`);
  await ctx.close();
}

/* ------------------------- excluir de vez: o caminho do estudo de teste */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${PAGINA}?modo=analise&arq=1`);
  await p.getByRole('button', { name: /arquivados/i }).click();
  const dialogo = p.locator('[aria-label="Estudos arquivados"]');
  await dialogo.waitFor({ timeout: 4000 });

  await dialogo.getByRole('button', { name: /Excluir de vez/ }).click();
  const texto = await dialogo.innerText();
  checar(/Apagar 89 ciclo\(s\) para sempre\?/.test(texto),
    'excluir de vez pede confirmacao dizendo QUANTOS ciclos morrem');
  checar((await p.evaluate(() => window.__deletes.length)) === 0,
    'antes de confirmar, nada foi apagado');

  await dialogo.getByRole('button', { name: 'Apagar tudo' }).click();
  await p.waitForFunction(() => window.__deletes.length > 0, { timeout: 8000 });
  const apagado = await p.evaluate(() => window.__deletes[0]);
  checar(/definitivo=1/.test(apagado), 'a exclusao vai com ?definitivo=1 — o servidor sabe que e para valer');
  checar(/id=a1/.test(apagado), 'aponta o estudo certo');
  checar(erros.length === 0, `excluir de vez: sem erro de pagina (${erros.join('; ') || 'nenhum'})`);
  await ctx.close();
}

/* --------------- concluido: so no PC, com o caminho de volta ao tablet */
{
  // PC: o estudo concluido aparece, com o botao de devolver ao tablet.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?modo=analise&comconcluido=1`);
  await p.getByText('Estudo pronto').first().waitFor({ timeout: 8000 });
  checar(true, 'PC: estudo concluido aparece na lista de analise');
  const linha = p.locator('tr', { hasText: 'Estudo pronto' });
  checar(await linha.getByRole('button', { name: 'Enviar ao tablet' }).count() === 1,
    'PC: estudo concluido oferece "Enviar ao tablet"');
  await linha.getByRole('button', { name: 'Enviar ao tablet' }).click();
  await p.waitForFunction(() => window.__patches.length > 0, { timeout: 8000 });
  const patch = await p.evaluate(() => window.__patches[0]);
  checar(patch.corpo.status === 'coletando' && patch.url.includes('id=e9'),
    'PC: "Enviar ao tablet" poe o estudo de volta em coleta');
  await ctx.close();

  // Tablet: o mesmo estudo concluido NAO aparece.
  const ctx2 = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.goto(`${PAGINA}?modo=coleta&comconcluido=1`);
  await p2.getByText('Furação lateral').first().waitFor({ timeout: 8000 });
  checar(await p2.getByText('Estudo pronto').count() === 0,
    'tablet: estudo concluido NAO aparece na coleta');
  await ctx2.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
