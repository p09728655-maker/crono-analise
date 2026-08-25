/**
 * Teste de navegador do painel de analise e do relatorio impresso.
 *
 * Cobre o que ja' pegou bugs reais aqui: grafico letterboxed por viewBox de
 * proporcao fixa, rotulo de valor riscado pela linha de Takt (ordem de
 * pintura), e o relatorio estourando a largura util do A4.
 *
 * Uso:
 *   npm run dev
 *   node test/e2e/analise.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-analise/index.html`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });

/* ------------------------------------------------------------------ tela */
{
  const p = await (await navegador.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  // Ignora o 404 de /favicon.ico que o Chromium pede sozinho ao harness.
  p.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/i.test(m.text()) && !/404/.test(m.text())) erros.push(m.text());
  });

  await p.goto(PAGINA);
  await p.waitForSelector('[role="tablist"]', { timeout: 10000 });
  await p.waitForTimeout(400);

  // A resposta fica FORA das abas: some-la ao examinar a evidencia seria
  // perder a conclusao justo na hora de conferi-la.
  const respostaVisivel = async () => (await p.locator('text=/peças\\/hora/').count()) > 0;
  checar(await respostaVisivel(), 'resposta visivel na aba inicial');

  await p.locator('[role="tab"]', { hasText: 'Operações' }).click();
  await p.waitForTimeout(300);
  checar(new URL(p.url()).searchParams.get('aba') === 'operacoes', 'aba ativa vai para a URL');
  checar(await respostaVisivel(), 'resposta continua visivel ao trocar de aba');
  checar(await p.locator('.somente-tela >> text=GARGALO').count() > 0, 'gargalo identificado na tabela');
  checar(await p.locator('text=/amostra suficiente/i').count() > 0, 'avisa amostra insuficiente antes de mostrar numeros');
  // Volta ao Yamazumi para as verificacoes do grafico.
  await p.locator('[role="tab"]', { hasText: 'Yamazumi' }).click();
  await p.waitForTimeout(300);
  checar(await p.locator('text=/TAKT/').count() > 0, 'linha de Takt rotulada');
  checar(await p.locator('text=Tempo normal').count() > 0, 'legenda presente (identidade nunca so por cor)');
  // A carta abre na primeira operacao (14 ciclos), onde o aviso NAO deve
  // aparecer. Selecionamos a de 6 ciclos para checar o aviso de fato.
  await p.locator('[role="tab"]', { hasText: 'Carta de controle' }).click();
  await p.waitForTimeout(300);
  checar(await p.locator('text=/Leitura limitada/').count() === 0,
    'nao alarma sem motivo: operacao com 14 ciclos nao mostra aviso de limite');
  await p.locator('.somente-tela button', { hasText: 'Conferir furo' }).first().click();
  await p.waitForTimeout(300);
  checar(await p.locator('text=/Leitura limitada/').count() > 0,
    'avisa o limite matematico da carta ao selecionar operacao com 6 ciclos');

  // O grafico precisa preencher o container, nao ficar centralizado num vazio.
  await p.locator('[role="tab"]', { hasText: 'Yamazumi' }).click();
  await p.waitForTimeout(400);
  const preenche = await p.evaluate(() => {
    const svg = document.querySelector('.somente-tela figure svg');
    const cont = svg?.parentElement;
    if (!svg || !cont) return 0;
    return svg.getBoundingClientRect().width / cont.getBoundingClientRect().width;
  });
  checar(preenche > 0.9, `Yamazumi ocupa ${(preenche * 100).toFixed(0)}% da largura disponivel`);

  const overflow = await p.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth);
  checar(!overflow, 'sem rolagem horizontal');
  // Recarregar preserva a vista — e' para isso que a aba vive na URL.
  await p.locator('[role="tab"]', { hasText: 'Operações' }).click();
  await p.waitForTimeout(300);
  await p.reload();
  await p.waitForTimeout(800);
  const abaApos = await p.locator('[role="tab"][aria-selected="true"]').innerText();
  checar(/Opera/.test(abaApos), `recarregar mantem a aba (${abaApos.split('\n')[0]})`);

  checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
}

/* ------------------------------------------------------------- impressao */
{
  // Largura util do A4 retrato com margem de 12mm: ~703px a 96dpi.
  const p = await (await navegador.newContext({ viewport: { width: 703, height: 1200 } })).newPage();
  await p.goto(PAGINA);
  // O relatorio impresso NAO depende de aba: ele traz tudo, sempre.
  await p.waitForSelector('[role="tablist"]');
  await p.waitForTimeout(400);
  checar(await p.locator('[aria-label="Análise com IA"]').count() === 1,
    'secao Analise com IA presente no painel');
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(600);

  const m = await p.evaluate(() => {
    const tela = document.querySelector('.somente-tela');
    const rel = document.querySelector('.somente-impressao');
    const vis = (el) => (el ? getComputedStyle(el).display !== 'none' : null);
    return {
      telaOculta: vis(tela) === false,
      relatorioVisivel: vis(rel) === true,
      estoura: rel.scrollWidth > document.documentElement.clientWidth + 1,
      temAssinatura: /Analista respons/.test(rel.innerText),
      semNievel: !/Nievel/.test(rel.innerText),
      temLegenda: /Legenda/.test(rel.innerText) && /Tempo Observado/.test(rel.innerText)
        && /Fator de Ritmo/.test(rel.innerText),
    };
  });

  checar(m.telaOculta, 'interface some na impressao');
  checar(m.relatorioVisivel, 'relatorio aparece na impressao');
  checar(!m.estoura, 'relatorio cabe na largura util do A4');
  checar(m.temAssinatura, 'bloco de assinaturas presente');
  checar(m.semNievel, 'Nievel saiu do relatorio — nao cobra mais ciclo de ninguem');
  checar(m.temLegenda, 'legenda por extenso das abreviacoes (Obs., FR, TO...)');
}

await navegador.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
