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
const XLSX = new URL('../fixtures/template-tempos-preenchido.xlsx', import.meta.url).pathname;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

/* Na COLETA nao se importa nada — o botao nem aparece no chao de fabrica. */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-importar/index.html?modo=coleta`);
  await p.waitForSelector('li', { timeout: 8000 });
  checar(await p.getByRole('button', { name: 'Importar', exact: true }).count() === 0,
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
  await p.getByRole('button', { name: 'Importar', exact: true }).waitFor({ timeout: 8000 });

  await p.getByRole('button', { name: 'Importar', exact: true }).click();
  const dialogo = p.locator('[aria-label="Importar estudo"]');
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
    const caixa = document.querySelector('[aria-label="Importar estudo"] > div');
    const estourados = [...caixa.querySelectorAll('*')]
      .filter((el) => !['INPUT', 'TEXTAREA'].includes(el.tagName)
        && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto').length;
    return { doc: document.documentElement.scrollWidth, tela: window.innerWidth, estourados };
  });
  checar(larguras.doc <= larguras.tela, `${modo}: sem rolagem horizontal (${larguras.doc}/${larguras.tela}px)`);
  checar(larguras.estourados === 0, `${modo}: nada estourado dentro do modal (${larguras.estourados})`);

  const nomeImp = dialogo.locator('label', { hasText: 'Nome do estudo' }).locator('input');
  checar(await nomeImp.inputValue() === 'MESA CABECEIRA SLEEP BRANCO',
    `${modo}: nome vem so com o produto, sem a maquina grudada`);
  const recursoImp = dialogo.locator('label', { hasText: 'Recurso / Posto' }).locator('input');
  checar(await recursoImp.inputValue() === 'FUR16', `${modo}: maquina do roteiro sugerida (FUR16)`);
  await recursoImp.fill('FUR03');
  await dialogo.locator('label', { hasText: 'Setor' }).locator('input').fill('Usinagem');

  // Mesmas informacoes do cadastro manual: Ritmo/Demanda com jornada 8,8h.
  const horasImp = dialogo.locator('label', { hasText: 'Horas disponíveis' }).locator('input');
  checar(await horasImp.inputValue() === '8.8', `${modo}: jornada padrao 8,8h ja preenchida`);
  await dialogo.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  checar(await dialogo.locator('text=01:06').count() === 1, `${modo}: takt 480pc/8,8h = 01:06`);
  checar(await dialogo.locator('text=8h48min').count() === 1, `${modo}: 8,8h viram 8h48min`);

  await dialogo.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForFunction(() => window.__posts.length > 0, { timeout: 8000 });
  await dialogo.waitFor({ state: 'detached', timeout: 8000 });

  const post = await p.evaluate(() => window.__posts[0]);
  checar(post.corpo.produto === 'MESA CABECEIRA SLEEP BRANCO', `${modo}: produto vem do PDF`);
  checar(post.corpo.recurso === 'FUR03', `${modo}: maquina escolhida vence a do roteiro (${post.corpo.recurso})`);
  checar(post.corpo.setor === 'Usinagem', `${modo}: setor vai junto na importacao`);
  checar(post.corpo.taktTimeMs === 66000, `${modo}: takt calculado no POST (${post.corpo.taktTimeMs})`);
  checar(post.corpo.operacoes.length === 6, `${modo}: 6 operacoes aninhadas no POST`);
  checar(post.corpo.operacoes.map((o) => o.ciclosPorPeca).join(',') === '1,2,1,1,1,1',
    `${modo}: ciclos por peca [${post.corpo.operacoes.map((o) => o.ciclosPorPeca)}]`);
  checar(post.corpo.operacoes[1].descricao.includes('cód. 778.002.001'),
    `${modo}: proveniencia do ERP gravada na operacao`);
  checar(await p.evaluate(() => window.__aberto) === null,
    `${modo}: importar no PC fica na lista, nao cai na analise vazia`);

  /* ------------------- template de tempos (.xlsx) da embalagem, preenchido */
  await p.getByRole('button', { name: 'Importar', exact: true }).click();
  const dialogoXlsx = p.locator('[aria-label="Importar estudo"]');
  await p.setInputFiles('input[type=file]', XLSX);
  await dialogoXlsx.locator('text=CAIXA, TAMPO, ISOMANTA').first().waitFor({ timeout: 8000 });
  checar(true, `${modo}: template xlsx reconhecido`);

  const linhasXlsx = dialogoXlsx.locator('tbody tr');
  checar(await linhasXlsx.count() === 2, `${modo}: 2 operacoes da embalagem na conferencia`);
  checar(/4/.test(await linhasXlsx.nth(0).locator('td').nth(2).innerText()),
    `${modo}: 4 ciclos preenchidos na CAIXA`);
  checar(await dialogoXlsx.locator('text=OPERACAO INEXISTENTE').count() === 1,
    `${modo}: parada de operacao desconhecida vira aviso, nao some`);

  const nomeXlsx = dialogoXlsx.locator('label', { hasText: 'Nome do estudo' }).locator('input');
  checar(await nomeXlsx.inputValue() === 'Embalagem — linha 1',
    `${modo}: nome do estudo vem da aba Config`);
  await dialogoXlsx.locator('label', { hasText: 'Setor' }).locator('input').fill('Embalagem');

  const postsAntes = await p.evaluate(() => window.__posts.length);
  await dialogoXlsx.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForFunction((n) => window.__posts.length >= n + 2, postsAntes, { timeout: 8000 });
  await dialogoXlsx.waitFor({ state: 'detached', timeout: 8000 });

  const postsXlsx = await p.evaluate(() => window.__posts);
  const postEstudo = postsXlsx[postsAntes];
  checar(postEstudo.corpo.operacoes.length === 2, `${modo}: 2 operacoes aninhadas no POST do template`);
  checar(postEstudo.corpo.operacoes.every((o) => o.frPct === 100), `${modo}: FR 100 vindo do template`);
  checar(postEstudo.corpo.setor === 'Embalagem', `${modo}: setor Embalagem no POST`);
  const postSync = postsXlsx.find((q) => q.url.includes('/sync'));
  checar(Boolean(postSync), `${modo}: ciclos preenchidos disparam sincronizacao`);
  checar(postSync?.corpo.observacoes.length === 7,
    `${modo}: 7 ciclos da planilha entram pela fila (4+3)`);
  checar(postSync?.corpo.paradas.length === 1 && postSync.corpo.paradas[0].motivo === 'Falta de material',
    `${modo}: parada valida importada junto`);
  checar(postSync?.corpo.observacoes.every((o) => o.duracaoMs > 0 && o.operacaoId),
    `${modo}: cada ciclo importado leva operacaoId e duracao`);

  checar(errosConsole.length === 0,
    `${modo}: sem erro de pagina (${errosConsole.join('; ') || 'nenhum'})`);
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
