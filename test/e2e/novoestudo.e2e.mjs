/**
 * Dashboard vazio e formulario "Novo estudo" em etapas.
 *
 * O redesign trocou o cartao perdido no centro por uma area estruturada
 * (cartao + faixa explicativa) e transformou o Takt de campo digitavel em
 * RESULTADO calculado de quantidade x horas. Este teste prova as duas
 * coisas no navegador — inclusive que 480 pecas em 5,6h viram 00:42 e que
 * o POST leva taktTimeMs = 42000.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/novoestudo.e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* ------------------------------------------ dashboard vazio no PC */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });

  checar(true, 'PC vazio: cartao central "Nenhum estudo cadastrado"');
  for (const bloco of ['Cronometre os ciclos', 'Calcule o tempo padrão', 'Dimensione o posto']) {
    checar(await p.locator(`text=${bloco}`).count() === 1, `PC vazio: bloco "${bloco}"`);
  }

  // Abre o formulario pelo botao do cartao.
  await p.click('text=+ Novo estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });

  for (const etapa of ['Identificação', 'Coleta', 'Ritmo / Demanda']) {
    checar(await form.locator(`text=${etapa}`).count() >= 1, `form: etapa "${etapa}" no indicador`);
  }

  // Takt e' resultado: comeca vazio e calcula com quantidade x horas.
  checar(await form.locator('text=--:--').count() === 1, 'form: Takt vazio mostra --:--');

  await form.locator('label', { hasText: 'Nome do estudo' }).locator('input').fill('Furação lateral — Linha 2');
  await form.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  await form.locator('label', { hasText: 'Horas disponíveis' }).locator('input').fill('5.6');

  checar(await form.locator('text=00:42').count() === 1, 'form: 480 pçs / 5,6h => Takt 00:42');
  checar(await form.locator('text=5h36min').count() === 1, 'form: 5,6 horas viram 5h36min');
  checar(await form.locator('text=480 peças').count() === 1, 'form: demanda diária ecoada');

  // Foco no campo de quantidade destaca a etapa 3 no indicador.
  const etapa3 = form.locator('[aria-current="step"]');
  checar(/Ritmo/.test(await etapa3.innerText()), 'form: etapa ativa segue o foco (Ritmo / Demanda)');

  await form.locator('button', { hasText: 'Criar e iniciar coleta' }).click();
  await p.waitForFunction(() => window.__aberto !== null, { timeout: 4000 });

  const post = await p.evaluate(() => window.__posts[0]);
  checar(post.corpo.nome === 'Furação lateral — Linha 2', 'POST: nome do estudo');
  checar(post.corpo.taktTimeMs === 42000, `POST: taktTimeMs calculado = ${post.corpo.taktTimeMs}`);
  await ctx.close();
}

/* -------------------------------- o mesmo formulario cabe no celular */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=coleta&vazio=1`);
  await p.waitForSelector('text=+ Criar primeiro estudo', { timeout: 8000 });
  await p.click('text=+ Criar primeiro estudo');
  await p.locator('[aria-label="Novo estudo"]').waitFor({ timeout: 4000 });

  // O pano de fundo do modal CORTA estouro horizontal, entao olhar so o
  // documento nao basta: o proprio form precisa caber em si mesmo.
  const larguras = await p.evaluate(() => {
    const form = document.querySelector('[aria-label="Novo estudo"] form') || document.querySelector('form');
    const estourados = [...document.querySelectorAll('form *')]
      .filter((el) => !['INPUT', 'TEXTAREA'].includes(el.tagName)
        && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto').length;
    return { doc: document.documentElement.scrollWidth, tela: window.innerWidth,
             form: form.scrollWidth, formVisivel: form.clientWidth, estourados };
  });
  checar(larguras.doc <= larguras.tela, `celular: pagina sem rolagem horizontal (${larguras.doc}/${larguras.tela}px)`);
  checar(larguras.form <= larguras.formVisivel, `celular: form nao estoura a si mesmo (${larguras.form}/${larguras.formVisivel}px)`);
  checar(larguras.estourados === 0, `celular: nenhum elemento interno estourado (${larguras.estourados})`);

  await p.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  await p.locator('label', { hasText: 'Horas disponíveis' }).locator('input').fill('5.6');
  checar(await p.locator('text=00:42').count() === 1, 'celular: Takt calcula igual');
  await ctx.close();
}

/* --------------------------- a lista cheia continua funcionando */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise`);
  await p.waitForSelector('section h2', { timeout: 8000 });
  checar(await p.locator('text=Nenhum estudo cadastrado').count() === 0,
    'lista cheia: estado vazio nao vaza para quem tem estudo');

  // Historico de versoes: o numero no cabecalho abre o modal, e o que o
  // usuario le como "atual" precisa ser a versao publicada de fato.
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  const chip = p.locator(`text=v${version}`).first();
  checar(await chip.count() === 1, `versao v${version} visivel no cabecalho`);
  await chip.click();
  const historico = p.locator('[aria-label="Histórico de versões"]');
  checar(await historico.count() === 1, 'chip abre o historico de versoes');
  const primeira = await historico.locator('ol > li').first().innerText();
  checar(primeira.includes(`v${version}`) && /atual/i.test(primeira),
    'entrada mais recente e marcada como atual');
  checar(await historico.locator('ol > li').count() >= 6,
    `historico conta a evolucao (${await historico.locator('ol > li').count()} versoes)`);
  await historico.locator('button', { hasText: 'Fechar' }).click();
  checar(await p.locator('[aria-label="Histórico de versões"]').count() === 0,
    'historico fecha');
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
