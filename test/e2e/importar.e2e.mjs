/**
 * Importacao do roteiro do ERP, de ponta a ponta com o PDF REAL.
 *
 * O que este teste prova e' a cadeia inteira no navegador de verdade:
 * escolher o arquivo -> extrair o texto (DecompressionStream) -> interpretar
 * -> conferir na tela -> criar o estudo com as operacoes aninhadas. Qualquer
 * elo pode quebrar sozinho sem aparecer em teste de unidade.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/importar.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PDF = new URL('../fixtures/roteiro-mesa-cabeceira-sleep.pdf', import.meta.url).pathname;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* Na COLETA nao se importa nada — o botao nem aparece no chao de fabrica. */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-importar/index.html?modo=coleta`);
  await p.waitForSelector('li', { timeout: 8000 });
  checar(await p.locator('text=Importar roteiro').count() === 0,
    'coleta: botao de importar NAO existe (tarefa de escritorio)');
  await ctx.close();
}

for (const modo of ['analise']) {
  const ctx = await b.newContext({
    viewport: modo === 'analise' ? { width: 1440, height: 900 } : { width: 400, height: 860 },
    hasTouch: modo === 'coleta',
  });
  const p = await ctx.newPage();
  const errosConsole = [];
  p.on('pageerror', (e) => errosConsole.push(e.message));

  await p.goto(`${BASE}/test/e2e/harness-importar/index.html?modo=${modo}`);
  await p.waitForSelector('text=Importar roteiro', { timeout: 8000 });

  await p.click('text=Importar roteiro');
  const dialogo = p.locator('[aria-label="Importar roteiro do ERP"]');
  checar(await dialogo.count() === 1, `${modo}: modal de importacao abre`);

  await p.setInputFiles('input[type=file]', PDF);
  await dialogo.locator('text=MESA CABECEIRA SLEEP BRANCO').first()
    .waitFor({ timeout: 8000 });

  const linhas = dialogo.locator('tbody tr');
  checar(await linhas.count() === 6, `${modo}: 6 pecas na conferencia`);

  const lateral = dialogo.locator('tr', { hasText: 'LAT DIR/ESQ' });
  checar(/MDP 2 BCO/.test(await lateral.innerText()),
    `${modo}: descricao cortada pelo ERP foi emendada`);
  checar((await lateral.locator('td').nth(1).innerText()).trim() === '2',
    `${modo}: lateral entra com 2 ciclos por peca`);

  checar(await dialogo.locator('text=Já existe estudo deste produto').count() === 1,
    `${modo}: avisa que o produto ja tem estudo (grafia diferente)`);
  checar(/VOL 1\/1/.test(await dialogo.innerText()),
    `${modo}: pecas sem processo aparecem, nao somem`);

  // Nada pode estourar a largura — nem a pagina, nem DENTRO do modal
  // (o pano de fundo corta estouro horizontal e esconde o problema).
  const larguras = await p.evaluate(() => {
    const caixa = document.querySelector('[aria-label="Importar roteiro do ERP"] > div');
    const estourados = [...caixa.querySelectorAll('*')]
      .filter((el) => !['INPUT', 'TEXTAREA'].includes(el.tagName)
        && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto').length;
    return { doc: document.documentElement.scrollWidth, tela: window.innerWidth, estourados };
  });
  checar(larguras.doc <= larguras.tela, `${modo}: sem rolagem horizontal (${larguras.doc}/${larguras.tela}px)`);
  checar(larguras.estourados === 0, `${modo}: nada estourado dentro do modal (${larguras.estourados})`);

  await dialogo.locator('label', { hasText: 'Setor' }).locator('input').fill('Usinagem');

  // Mesmas informacoes do cadastro manual: Ritmo/Demanda com jornada 8,8h.
  const horasImp = dialogo.locator('label', { hasText: 'Horas disponíveis' }).locator('input');
  checar(await horasImp.inputValue() === '8.8', `${modo}: jornada padrao 8,8h ja preenchida`);
  await dialogo.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  checar(await dialogo.locator('text=01:06').count() === 1, `${modo}: takt 480pc/8,8h = 01:06`);
  checar(await dialogo.locator('text=8h48min').count() === 1, `${modo}: 8,8h viram 8h48min`);

  await dialogo.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForFunction(() => window.__aberto !== null, { timeout: 8000 });

  const post = await p.evaluate(() => window.__posts[0]);
  checar(post.corpo.produto === 'MESA CABECEIRA SLEEP BRANCO', `${modo}: produto vem do PDF`);
  checar(post.corpo.recurso === 'FUR16', `${modo}: recurso e' a maquina do roteiro`);
  checar(post.corpo.setor === 'Usinagem', `${modo}: setor vai junto na importacao`);
  checar(post.corpo.taktTimeMs === 66000, `${modo}: takt calculado no POST (${post.corpo.taktTimeMs})`);
  checar(post.corpo.operacoes.length === 6, `${modo}: 6 operacoes aninhadas no POST`);
  checar(post.corpo.operacoes.map((o) => o.ciclosPorPeca).join(',') === '1,2,1,1,1,1',
    `${modo}: ciclos por peca [${post.corpo.operacoes.map((o) => o.ciclosPorPeca)}]`);
  checar(post.corpo.operacoes[1].descricao.includes('cód. 778.002.001'),
    `${modo}: proveniencia do ERP gravada na operacao`);
  checar(await p.evaluate(() => window.__aberto) === 'novo-1',
    `${modo}: abre o estudo recem-criado`);

  checar(errosConsole.length === 0,
    `${modo}: sem erro de pagina (${errosConsole.join('; ') || 'nenhum'})`);
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
