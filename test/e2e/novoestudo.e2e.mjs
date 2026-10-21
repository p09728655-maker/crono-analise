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

  /* ---------------- hierarquia da primeira tela ---------------- */
  /**
   * A tela inicial precisa responder em segundos: onde estou, o que faco,
   * quais estudos existem e qual e' o fluxo. O que este teste guarda e' a
   * ORDEM — nao a aparencia: identidade, acao principal, estudos,
   * ferramentas. E que a acao principal seja unica no menu.
   */
  {
    const ordem = await p.evaluate(() => {
      const alvo = document.querySelector('nav[aria-label="Navegação"]');
      // innerText devolve o texto RENDERIZADO: os rotulos de grupo saem em
      // maiusculas por CSS. Comparar sem caixa evita testar a folha de
      // estilo em vez da ordem.
      const texto = alvo.innerText.toUpperCase();
      const pos = (t) => texto.indexOf(t.toUpperCase());
      const vermelhos = [...alvo.querySelectorAll('button')].filter((b) => {
        const c = getComputedStyle(b).backgroundColor;
        return c.startsWith('rgb(') && c.includes('219, 33, 38');
      }).map((b) => b.textContent.trim());
      return {
        identidade: pos('RitmoPatrimar'),
        acao: pos('+ Novo estudo'),
        estudos: pos('Estudos de tempo'),
        ferramentas: pos('Ferramentas'),
        coleta: pos('Ir para a Coleta'),
        vermelhos,
      };
    });
    checar(ordem.identidade < ordem.acao, 'menu: identidade antes da acao principal');
    checar(ordem.acao < ordem.estudos, 'menu: "+ Novo estudo" antes da lista de estudos');
    checar(ordem.estudos < ordem.ferramentas, 'menu: estudos antes das ferramentas');
    checar(ordem.ferramentas < ordem.coleta, 'menu: "Ir para a Coleta" por ultimo, sem disputar');
    checar(ordem.vermelhos.length === 1 && /Novo estudo/.test(ordem.vermelhos[0]),
      `menu: so a acao principal e vermelha (${ordem.vermelhos.join(', ') || 'nenhuma'})`);

    // A busca deixou de ocupar o topo — e continua existindo.
    const buscaDepoisDaAcao = await p.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação"]');
      const busca = nav.querySelector('input[type=search]');
      const botao = [...nav.querySelectorAll('button')].find((b) => /Novo estudo/.test(b.textContent));
      return busca.getBoundingClientRect().top > botao.getBoundingClientRect().top;
    });
    checar(buscaDepoisDaAcao, 'menu: busca existe, mas abaixo do fluxo principal');

    // O fluxo aparece numerado e na ordem certa.
    const corpo = await p.locator('main').innerText();
    checar(/DEPOIS DE CRIAR, O CAMINHO É ESTE/i.test(corpo), 'centro: o fluxo se apresenta como sequencia');
    checar(corpo.indexOf('Coleta') < corpo.indexOf('Análise')
      && corpo.indexOf('Análise') < corpo.indexOf('Capacidade'),
      'centro: Coleta -> Analise -> Capacidade nesta ordem');
  }
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

  // Takt e' resultado: sem quantidade ainda nao ha ritmo, mas a jornada
  // padrao de 8,8h ja vem preenchida.
  checar(await form.locator('text=--:--').count() === 1, 'form: Takt vazio mostra --:--');
  checar(await form.locator('label', { hasText: 'Horas disponíveis' }).locator('input').inputValue() === '8.8',
    'form: jornada padrao 8,8h ja preenchida');

  await form.locator('label', { hasText: 'Nome do estudo' }).locator('input').fill('Furação lateral — Linha 2');
  await form.locator('label', { hasText: 'Setor' }).locator('input').fill('Usinagem');
  await form.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  await form.locator('label', { hasText: 'Horas disponíveis' }).locator('input').fill('5.6');

  checar(await form.locator('text=00:42').count() === 1, 'form: 480 pçs / 5,6h => Takt 00:42');
  checar(await form.locator('text=5h36min').count() === 1, 'form: 5,6 horas viram 5h36min');
  checar(await form.locator('text=480 peças').count() === 1, 'form: demanda diária ecoada');

  // Foco no campo de quantidade destaca a etapa 3 no indicador.
  const etapa3 = form.locator('[aria-current="step"]');
  checar(/Ritmo/.test(await etapa3.innerText()), 'form: etapa ativa segue o foco (Ritmo / Demanda)');

  await form.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForFunction(() => window.__posts.length > 0, { timeout: 4000 });
  await p.locator('[aria-label="Novo estudo"]').waitFor({ state: 'detached', timeout: 4000 });

  const post = await p.evaluate(() => window.__posts[0]);
  checar(post.corpo.nome === 'Furação lateral — Linha 2', 'POST: nome do estudo');
  checar(post.corpo.setor === 'Usinagem', `POST: setor cadastrado (${post.corpo.setor})`);
  checar(post.corpo.taktTimeMs === 42000, `POST: taktTimeMs calculado = ${post.corpo.taktTimeMs}`);
  // A origem anda com o takt: e' ela que diz a analise o que fazer com o setup.
  checar(post.corpo.taktOrigem === 'manual', `POST: a conta digitada vai como origem manual (${post.corpo.taktOrigem})`);
  checar(await p.evaluate(() => window.__aberto) === null,
    'PC: criar NAO cai na analise vazia — fica na lista');
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

/* ------------- o posto puxa o produto e o takt do grupo (programa da semana) */
/**
 * Harness com ?programa=1: a FURADEIRA (0002) tem produtos cadastrados e
 * programa desta semana — 6.600 pecas para seis maquinas ativas em 44 h,
 * takt de 02:24 por peca por maquina. A FRESADORA (0004) nao tem programa.
 */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
  await p.click('text=+ Novo estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });
  const painel = form.locator('aside[aria-label="Ritmo / Demanda"]');

  checar(await painel.getByText('Escolha o posto para trazer o takt do programa da semana.').count() === 1,
    'programa: antes do posto, o painel diz como o takt vem do programa');
  checar(await form.locator('input[list="produtos-conhecidos"]').count() === 1,
    'programa: sem posto, o produto segue texto livre');

  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  const produto = form.getByRole('combobox', { name: 'Produto / Referência' });
  await produto.waitFor({ timeout: 4000 });
  const opcoes = await produto.locator('option').allInnerTexts();
  checar(opcoes.includes('LATERAL SLEEP · 1001') && opcoes.includes('Outro produto…'),
    `programa: o produto vira a lista do cadastro do grupo (${opcoes.join(' | ')})`);

  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  // O painel usa espaco inseparavel entre o numero e a unidade.
  const lerPainel = async () => (await painel.innerText()).replace(/\u00a0/g, ' ');
  const texto = await lerPainel();
  checar(/0002 · FURADEIRA · semana \d{3}-\d{2}/.test(texto), 'programa: o painel diz o grupo e a semana');
  checar(texto.includes('02:24'), 'programa: takt do programa = 44 h / (6.600 / 6) = 02:24 por peca');
  checar(texto.includes('6.600 peças') && texto.includes('44h00min'), 'programa: a conta aparece (demanda e horas)');
  checar(texto.includes('144.0 s por peça') && texto.includes('Por máquina: 44h00min de jornada, sem setup planejado.'),
    'programa: o takt tambem em segundos, e a jornada diz se ha setup descontado');
  checar(/DEMANDA POR MÁQUINA\s+1\.100 peças/i.test(texto) && /TEMPO POR MÁQUINA\s+44h00min/i.test(texto),
    'programa: os dois cartoes sao de UMA maquina (1.100 pecas em 44h00min = 144 s)');
  checar(/6\.600 peças na semana, divididas entre as 6 máquinas ativas do grupo/.test(texto),
    'programa: o takt e de uma maquina, e o painel diz quantas sao e de quanto e a semana');
  checar(await painel.locator('input').count() === 0, 'programa: sem campos para digitar — o takt nao e chute');

  await produto.selectOption('LATERAL SLEEP');
  await form.getByLabel('Nome do estudo').fill('Furação lateral — programa');
  await form.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForFunction(() => window.__posts.length > 0, { timeout: 4000 });
  const post = await p.evaluate(() => window.__posts[0]);
  checar(post.corpo.taktTimeMs === 144000, `programa: POST leva o takt do programa (${post.corpo.taktTimeMs})`);
  checar(post.corpo.taktOrigem === 'programa', `programa: e a origem 'programa' (${post.corpo.taktOrigem})`);
  checar(post.corpo.produto === 'LATERAL SLEEP', `programa: POST leva o produto do cadastro (${post.corpo.produto})`);
  checar(post.corpo.recurso === 'FURADEIRA 04', 'programa: POST leva o posto');

  /* Simular e voltar: a conta digitada continua possivel, dita como
     simulacao, e o programa volta com um clique. */
  await p.waitForSelector('[aria-label="Novo estudo"]', { state: 'detached', timeout: 4000 });
  await p.evaluate(() => { window.__posts = []; });
  await p.click('text=+ Novo estudo');
  await form.waitFor({ timeout: 4000 });
  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  await painel.getByRole('button', { name: 'Simular outra demanda' }).click();
  await painel.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  await painel.locator('label', { hasText: 'Horas disponíveis' }).locator('input').fill('5.6');
  const simulado = await lerPainel();
  checar(simulado.includes('00:42') && /É a conta acima que o estudo grava\. O programa da semana \d{3}-\d{2} pede 144\.0 s por peça\./.test(simulado),
    'simular: a conta digitada vale, e o painel lembra o que o programa pede');
  await painel.getByRole('button', { name: /Usar o takt do programa/ }).click();
  checar(await painel.getByText('Do programa da semana').count() === 1, 'simular: um clique volta ao programa');

  /* Posto de grupo sem programa: a conta digitada de sempre, com o motivo. */
  await form.getByLabel('Recurso / Posto').selectOption('FRESADORA 01');
  await painel.getByText(/0004 · FRESADORA não tem programa da semana: digite a demanda\./).waitFor({ timeout: 4000 });
  checar(true, 'sem programa: o painel diz por que a demanda e digitada');
  checar(await painel.locator('label', { hasText: 'Quantidade por dia' }).count() === 1,
    'sem programa: os campos da conta voltam');
  checar(await form.locator('input[list="produtos-conhecidos"]').count() === 1,
    'sem produto cadastrado no grupo: o produto segue texto livre');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  /* Quantidade digitada ANTES do posto: o programa nao passa por cima. */
  await p.click('text=+ Novo estudo');
  await form.waitFor({ timeout: 4000 });
  await painel.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('480');
  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await painel.getByRole('button', { name: /Usar o takt do programa/ }).waitFor({ timeout: 4000 });
  checar(await painel.locator('label', { hasText: 'Quantidade por dia' }).locator('input').inputValue() === '480',
    'digitado antes: o programa nao apaga o que o analista digitou — so oferece');

  checar(erros.length === 0, `programa: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* ---------------- trocar de posto no meio: nada do grupo anterior fica */
/**
 * Os caminhos que o revisor quebrou na primeira versao, cada um como um
 * analista faria: clicar no programa da furadeira e trocar para a
 * embalagem; escolher produto da furadeira e trocar de grupo; apagar a
 * quantidade para corrigir; e o instante em que o programa do grupo novo
 * ainda nao chegou.
 */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
  const form = p.locator('[aria-label="Novo estudo"]');
  const painel = form.locator('aside[aria-label="Ritmo / Demanda"]');
  const posto = form.getByLabel('Recurso / Posto');
  const abrir = async () => {
    await p.evaluate(() => { window.__posts = []; });
    await p.click('text=+ Novo estudo');
    await form.waitFor({ timeout: 4000 });
    await form.getByLabel('Nome do estudo').fill('Troca de posto');
  };
  const criar = async () => {
    await form.locator('button', { hasText: 'Criar estudo' }).click();
    await p.waitForFunction(() => window.__posts.length > 0, { timeout: 4000 });
    await form.waitFor({ state: 'detached', timeout: 4000 });
    return (await p.evaluate(() => window.__posts[0])).corpo;
  };

  const lerPainel = async () => (await painel.innerText()).replace(/\u00a0/g, ' ');

  /* 1. "Usar o takt do programa" na furadeira NAO vale na embalagem — e la',
     sem produto escolhido, nao ha' takt por produto: a tela pede o produto. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  await painel.getByRole('button', { name: 'Simular outra demanda' }).click();
  await painel.getByRole('button', { name: /Usar o takt do programa/ }).click();
  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  await posto.selectOption('EMBALADORA 01');
  await painel.getByText(/é em volumes\. Escolha o produto: com os volumes dele no cadastro, o takt entra por produto/)
    .waitFor({ timeout: 4000 });
  checar(await painel.getByText('Do programa da semana').count() === 0
    && await painel.getByRole('button', { name: /Usar o takt do programa/ }).count() === 0,
  'troca: o clique da furadeira nao vale na embalagem, e sem produto nao ha takt por volume oferecido');
  let corpo = await criar();
  checar(corpo.taktTimeMs === null, `troca: sem produto, nada de takt por volume (${corpo.taktTimeMs})`);
  checar(corpo.taktOrigem === null, `troca: sem takt, sem origem (${corpo.taktOrigem})`);

  /* 2. Na embalagem, com o produto de 2 volumes no cadastro, o takt entra
     sozinho POR PRODUTO: 72 s por volume x 2 = 144 s (02:24). */
  await abrir();
  await posto.selectOption('EMBALADORA 01');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('RACK SIRIUS 1.6');
  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  const emb = await lerPainel();
  checar(/0005 · EMBALAGEM · semana/.test(emb) && emb.includes('02:24') && /s\/produto/.test(emb)
    && emb.includes('Programa em volumes: 72.0 s por volume × 2 volumes de RACK SIRIUS 1.6 = 144.0 s por produto.')
    && emb.includes('2.200 volumes'),
  'embalagem: com os volumes do produto, o takt entra por produto e a conta aparece');
  corpo = await criar();
  checar(corpo.taktTimeMs === 144000, `embalagem: POST com o takt por produto (${corpo.taktTimeMs})`);
  checar(corpo.taktOrigem === 'programa', `embalagem: o takt por produto e' do programa (${corpo.taktOrigem})`);

  /* 2b. Produto da embalagem SEM volumes no cadastro: nao vira 1 — a tela
     pede os volumes, e nada de takt do programa. */
  await abrir();
  await posto.selectOption('EMBALADORA 01');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('RACK SEM VOLUME');
  await painel.getByText(/Informe em Produtos quantos volumes tem RACK SEM VOLUME para o takt entrar por produto/)
    .waitFor({ timeout: 4000 });
  checar(await painel.getByText('Do programa da semana').count() === 0,
    'embalagem sem volumes: o takt do programa nao entra (vazio nunca vira 1)');
  corpo = await criar();
  checar(corpo.taktTimeMs === null, `embalagem sem volumes: nada de takt (${corpo.taktTimeMs})`);

  /* 3. Produto do cadastro da furadeira nao vai para o posto da embalagem —
     nem pelo caminho "Outro produto…" -> "escolher do cadastro". Nada muda
     sozinho: o produto continua a vista, a tela avisa e o Criar nao grava. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  const produto = form.getByRole('combobox', { name: 'Produto / Referência' });
  await produto.selectOption('__outro');
  await form.getByRole('button', { name: '▾ escolher do cadastro' }).last().click();
  await produto.selectOption('LATERAL SLEEP');
  await posto.selectOption('EMBALADORA 01');
  const aviso = form.getByRole('alert');
  await aviso.waitFor({ timeout: 4000 });
  checar(/LATERAL SLEEP é produto do 0002 · FURADEIRA, e o posto EMBALADORA 01 é do 0005 · EMBALAGEM/.test(await aviso.innerText()),
    'produto de outro grupo: a tela avisa na hora, nomeando os dois grupos');
  checar(await form.locator('input[aria-label="Produto / Referência"]').inputValue() === 'LATERAL SLEEP',
    'produto de outro grupo: nada muda sozinho — o produto continua a vista');
  await form.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForTimeout(500);
  checar(await p.evaluate(() => window.__posts.length) === 0 && await form.count() === 1,
    'produto de outro grupo: o Criar nao grava a combinacao errada');
  await form.getByRole('button', { name: '▾ escolher do cadastro' }).last().click();
  await produto.selectOption('RACK SIRIUS 1.6');
  checar(await form.getByRole('alert').count() === 0, 'produto do posto escolhido: o aviso some');
  corpo = await criar();
  checar(corpo.produto === 'RACK SIRIUS 1.6' && corpo.recurso === 'EMBALADORA 01',
    `produto: grava o produto do grupo do posto (${corpo.produto} @ ${corpo.recurso})`);

  /* 4. Produto digitado a mao continua: e' do analista. */
  await abrir();
  await form.locator('input[list="produtos-conhecidos"]').fill('Mesa nova');
  await posto.selectOption('FURADEIRA 04');
  await posto.selectOption('EMBALADORA 01');
  await p.waitForTimeout(200);
  checar(await form.getByLabel('Produto / Referência').inputValue() === 'Mesa nova',
    'produto digitado a mao sobrevive a troca de posto');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  /* 5. Apagar a quantidade para corrigir nao entrega o painel ao programa. */
  await abrir();
  const qtd = painel.locator('label', { hasText: 'Quantidade por dia' }).locator('input');
  await qtd.fill('48');
  await posto.selectOption('FURADEIRA 04');
  await painel.getByRole('button', { name: /Usar o takt do programa/ }).waitFor({ timeout: 4000 });
  await qtd.fill('');
  await p.waitForTimeout(200);
  checar(await qtd.count() === 1, 'corrigir: com a quantidade apagada, o campo continua la');
  await qtd.fill('480');
  corpo = await criar();
  checar(corpo.taktTimeMs === 66000, `corrigir: grava a conta do analista, 480 em 8,8 h = 66 s (${corpo.taktTimeMs})`);
  checar(corpo.taktOrigem === 'manual', `corrigir: e a origem manual (${corpo.taktOrigem})`);

  /* 6. No instante da troca, o programa da furadeira nao vale para a fresadora. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await painel.getByText('Do programa da semana').waitFor({ timeout: 4000 });
  await posto.selectOption('FRESADORA 01');
  await painel.getByText('Buscando o programa da semana de 0004 · FRESADORA…').waitFor({ timeout: 1000 });
  checar(await painel.getByText('Do programa da semana').count() === 0,
    'troca: enquanto o programa da fresadora nao chega, nao aparece o da furadeira');
  await painel.getByText('0004 · FRESADORA não tem programa da semana: digite a demanda.').waitFor({ timeout: 4000 });
  checar(true, 'troca: chegou o programa (vazio) da fresadora, e o painel diz isso');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  /* 7. Passar por "Outra máquina…" e redigitar o MESMO posto nao apaga o
     produto: no meio da digitacao o posto nao existe, e isso nao e' troca. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('LATERAL SLEEP');
  await posto.selectOption('__outra');
  await form.locator('input[aria-label="Recurso / Posto"]').pressSequentially('FURADEIRA 04');
  await p.waitForTimeout(300);
  corpo = await criar();
  checar(corpo.produto === 'LATERAL SLEEP' && corpo.recurso === 'FURADEIRA 04',
    `ida e volta: "Outra máquina…" e o mesmo posto digitado mantem o produto (${corpo.produto})`);

  /* 7b. Maquina do cadastro SEM grupo: o produto da furadeira nao combina
     com ela — avisa. Voltar para a furadeira: o aviso some e grava. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('LATERAL SLEEP');
  await posto.selectOption('ESQUADREJADEIRA');
  await form.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/o posto ESQUADREJADEIRA não é desse grupo/.test(await form.getByRole('alert').innerText()),
    'maquina sem grupo: o produto da furadeira gera aviso');
  await posto.selectOption('FURADEIRA 04');
  await p.waitForTimeout(200);
  checar(await form.getByRole('alert').count() === 0, 'de volta a furadeira: o aviso some');
  corpo = await criar();
  checar(corpo.produto === 'LATERAL SLEEP', `ida e volta por maquina sem grupo: o produto fica (${corpo.produto})`);

  /* 7c. Posto FORA do cadastro digitado ("Outra máquina…" SERRA 02) com
     produto da furadeira: avisa e nao grava — era o caminho que escapava. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('LATERAL SLEEP');
  await posto.selectOption('__outra');
  await form.locator('input[aria-label="Recurso / Posto"]').pressSequentially('SERRA 02');
  await form.getByRole('alert').waitFor({ timeout: 4000 });
  await form.locator('button', { hasText: 'Criar estudo' }).click();
  await p.waitForTimeout(500);
  checar(await p.evaluate(() => window.__posts.length) === 0,
    'posto fora do cadastro com produto da furadeira: o Criar nao grava');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  /* 7d. Na embalagem, a conta digitada fala em PRODUTO do comeco ao fim
     (o estudo da embalagem mede o produto), com ou sem programa. */
  await abrir();
  await posto.selectOption('EMBALADORA 01');
  await painel.locator('label', { hasText: 'Quantidade por dia' }).locator('input').fill('300');
  const conta = (await painel.innerText()).replace(/\u00a0/g, ' ');
  checar(/Produtos que precisam sair/.test(conta) && /s\/produto/.test(conta) && /300 produtos/.test(conta)
    && !/peça/.test(conta), 'embalagem: a conta digitada fala em produto, sem misturar peca');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  /* 8. "Outro produto…" escolhido na furadeira nao vale para a embalagem:
     la' o campo volta a ser a lista do cadastro do grupo novo. */
  await abrir();
  await posto.selectOption('FURADEIRA 04');
  await form.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('__outro');
  await form.locator('input[aria-label="Produto / Referência"]').waitFor({ timeout: 4000 });
  await posto.selectOption('EMBALADORA 01');
  const listaEmb = form.getByRole('combobox', { name: 'Produto / Referência' });
  await listaEmb.waitFor({ timeout: 4000 });
  checar((await listaEmb.locator('option').allInnerTexts()).includes('RACK SIRIUS 1.6 · 2001'),
    'troca: o texto livre do posto anterior nao vaza — a embalagem mostra a lista dela');
  await form.locator('button', { hasText: 'Cancelar' }).click();

  checar(erros.length === 0, `troca: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* ------------- sem rede: o painel diz que o programa e' o guardado */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  // Programa guardado de uma abertura anterior: o da semana de HOJE (dia de
  // Sao Paulo), com 3.300 pecas.
  await p.addInitScript(() => {
    const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date()).split('-').map(Number);
    const seg = new Date(Date.UTC(a, m - 1, d));
    seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7));
    const semPassada = new Date(seg); semPassada.setUTCDate(seg.getUTCDate() - 7);
    const linha = (dt, pecas, numero) => ({ ano: dt.getUTCFullYear(), numero, pecas, inicio: dt.toISOString().slice(0, 10) });
    localStorage.setItem('ritmopatrimar.demanda.g2', JSON.stringify([linha(seg, 3300, 43)]));
    // A fresadora so' tem guardada a semana PASSADA.
    localStorage.setItem('ritmopatrimar.demanda.g4', JSON.stringify([linha(semPassada, 3300, 42)]));
  });
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1&semrede=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
  await p.click('text=+ Novo estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });
  const painel = form.locator('aside[aria-label="Ritmo / Demanda"]');
  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await painel.getByText(/Programa guardado neste aparelho: sem rede para conferir se o PCP colou outro\./).waitFor({ timeout: 4000 });
  checar(true, 'sem rede: o programa guardado aparece COMO guardado, nao como o atual');
  checar((await painel.innerText()).includes('04:48'), 'sem rede: o takt e o do programa guardado (3.300 pecas -> 04:48)');
  await form.getByLabel('Recurso / Posto').selectOption('FRESADORA 01');
  await painel.getByText('Sem rede: o programa desta semana não chegou a este aparelho. Digite a demanda.').waitFor({ timeout: 4000 });
  checar(true, 'sem rede, guardado so da semana passada: o aviso culpa a rede, nao o programa');
  await ctx.close();
}

/* ---------- o cadastro chega com o analista digitando: nada se perde */
{
  /* O caso real: sem cadastro no aparelho, o posto e' digitado (texto
     livre) e o analista ja' esta' no produto quando o cadastro chega. O
     posto vira o da FURADEIRA, com lista de produtos — e o campo do produto
     nao pode ser trocado por outro no meio da digitacao. */
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1&cadastrodevagar=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
  await p.click('text=+ Novo estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });
  await form.locator('input[aria-label="Recurso / Posto"]').fill('FURADEIRA 04');
  const produto = form.locator('input[aria-label="Produto / Referência"]');
  await produto.click();
  await produto.pressSequentially('LAT');
  // O cadastro chega: o posto vira a lista, e o produto ganha a do grupo.
  await form.getByRole('combobox', { name: 'Recurso / Posto' }).waitFor({ timeout: 4000 });
  checar(await form.getByRole('button', { name: '▾ escolher do cadastro' }).count() >= 1,
    'digitando: o cadastro chegou e o grupo do posto tem lista de produtos');
  await p.keyboard.type('ERAL X');
  checar(await produto.inputValue() === 'LATERAL X',
    `digitando: o campo do produto nao foi trocado no meio da digitacao (${await produto.inputValue()})`);
  await ctx.close();
}

/* ------- virada da semana com a tela aberta: busca o programa de novo */
{
  /* Domingo 23:58 em Sao Paulo, formulario aberto na FURADEIRA. A semana
     seguinte so' existe no servidor a partir da segunda 00h (o PCP colou
     com a tela aberta). Quatro minutos depois, o painel ja' e' o da semana
     nova — sem ninguem reabrir. */
  const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(new Date()).split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  dia.setUTCDate(dia.getUTCDate() + ((7 - dia.getUTCDay()) % 7)); // o proximo domingo
  const domingo2358Sp = dia.getTime() + (23 * 60 + 58) * 60000 + 3 * 3600000;
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.clock.install({ time: domingo2358Sp });
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1&virada=1`);
  await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
  await p.click('text=+ Novo estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });
  const painel = form.locator('aside[aria-label="Ritmo / Demanda"]');
  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await painel.getByText('02:24').waitFor({ timeout: 4000 });
  checar(true, 'virada: domingo 23:58, o takt e o da semana que acaba (6.600 -> 02:24)');
  await p.clock.fastForward(4 * 60000);
  await painel.getByText('01:48').waitFor({ timeout: 6000 });
  checar(true, 'virada: segunda 00:02, o painel busca de novo e mostra a semana colada depois (8.800 -> 01:48)');
  await ctx.close();
}

/* ---------------- as ressalvas e os avisos, ligados na tela de verdade */
{
  const abrirEm = async (query, initScript) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    if (initScript) await p.addInitScript(initScript);
    await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=analise&vazio=1&programa=1${query}`);
    await p.waitForSelector('text=Nenhum estudo cadastrado', { timeout: 8000 });
    await p.click('text=+ Novo estudo');
    const form = p.locator('[aria-label="Novo estudo"]');
    await form.waitFor({ timeout: 4000 });
    return { ctx, p, form, painel: form.locator('aside[aria-label="Ritmo / Demanda"]') };
  };

  // Programa sem data de INICIO: casa pelo numero, com o risco e a acao.
  let t = await abrirEm('&semdata=1');
  await t.form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await t.painel.getByText(/Semana casada pelo número: .*feriado.*coluna INÍCIO/).waitFor({ timeout: 4000 });
  checar(true, 'sem data de inicio: o painel avisa que a semana foi casada pelo numero, com o risco e o que fazer');
  await t.ctx.close();

  // Programa guardado e a busca ainda em curso: "conferindo", depois o do servidor.
  t = await abrirEm('&demandadevagar=1', () => {
    const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
      .format(new Date()).split('-').map(Number);
    const seg = new Date(Date.UTC(a, m - 1, d));
    seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7));
    localStorage.setItem('ritmopatrimar.demanda.g2', JSON.stringify([
      { ano: seg.getUTCFullYear(), numero: 43, pecas: 3300, inicio: seg.toISOString().slice(0, 10) }]));
  });
  await t.form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await t.painel.getByText('Programa guardado neste aparelho, conferindo com o servidor…').waitFor({ timeout: 4000 });
  checar((await t.painel.innerText()).includes('04:48'), 'conferindo: enquanto a busca corre, o guardado aparece COMO guardado');
  await t.painel.getByText('02:24').waitFor({ timeout: 6000 });
  checar(await t.painel.getByText(/conferindo com o servidor/).count() === 0,
    'conferindo: a resposta do servidor troca o numero e tira a ressalva');
  await t.ctx.close();

  // Cadastro que nao chegou (sem rede, sem cache): o aviso diz isso.
  t = await abrirEm('&cadastrofalha=1');
  await t.form.locator('input[aria-label="Recurso / Posto"]').fill('FURADEIRA 04');
  await t.painel.getByText('O cadastro de máquinas não chegou a este aparelho: digite a demanda.').waitFor({ timeout: 4000 });
  checar(true, 'cadastro que falhou: o aviso culpa a falta do cadastro, nao o posto');
  await t.ctx.close();

  // Cadastro que chegou VAZIO: o posto esta' fora do cadastro — nao e' rede.
  t = await abrirEm('&cadastrovazio=1');
  await t.form.locator('input[aria-label="Recurso / Posto"]').fill('FURADEIRA 04');
  await t.painel.getByText('Posto fora do cadastro de máquinas: digite a demanda.').waitFor({ timeout: 4000 });
  checar(true, 'cadastro vazio: o aviso diz que o posto esta fora do cadastro, sem culpar a rede');
  await t.ctx.close();
}

/* -------- no celular, o painel do programa cabe sem rolagem horizontal */
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness-lista/index.html?modo=coleta&vazio=1&programa=1`);
  await p.waitForSelector('text=+ Criar primeiro estudo', { timeout: 8000 });
  await p.click('text=+ Criar primeiro estudo');
  const form = p.locator('[aria-label="Novo estudo"]');
  await form.waitFor({ timeout: 4000 });
  await form.getByLabel('Recurso / Posto').selectOption('FURADEIRA 04');
  await form.locator('aside[aria-label="Ritmo / Demanda"]').getByText('Do programa da semana').waitFor({ timeout: 4000 });
  const larguras = await p.evaluate(() => {
    const f = document.querySelector('[aria-label="Novo estudo"] form') || document.querySelector('form');
    const estourados = [...document.querySelectorAll('form *')]
      .filter((el) => !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
        && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto').length;
    return { doc: document.documentElement.scrollWidth, tela: window.innerWidth, estourados,
             form: f.scrollWidth, formVisivel: f.clientWidth };
  });
  checar(larguras.doc <= larguras.tela && larguras.form <= larguras.formVisivel && larguras.estourados === 0,
    `celular: painel do programa sem estouro (${larguras.doc}/${larguras.tela}px, ${larguras.estourados} estourados)`);
  const alvo = await form.getByRole('button', { name: 'Simular outra demanda' }).boundingBox();
  checar(alvo && alvo.height >= 64, `celular: "Simular" tem o alvo de dedo do projeto, 64 px (${Math.round(alvo?.height || 0)}px)`);
  await ctx.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
