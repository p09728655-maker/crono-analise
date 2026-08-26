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
  /**
   * A carta de controle SAIU da tela (ago/2026). Ela pedia leitura de CEP —
   * limites, sigma, ponto fora de controle — e o analista nao a usava para
   * decidir nada: quem responde "este ciclo saiu do padrao" e' o aviso de
   * ciclo atipico durante a coleta, e quem responde "este posto e' estavel"
   * e' o CV%, que continua na tabela e no papel. Este teste guarda a
   * ausencia: aba fora, e a analise segue completa sem ela.
   */
  const abas = await p.locator('[role="tablist"]').innerText();
  checar(!/Carta de controle/i.test(abas), 'a carta de controle nao aparece mais nas abas');
  checar(/Yamazumi/.test(abas) && /Opera/.test(abas) && /Paradas/.test(abas),
    `as abas que restam sao as que se usam (${abas.replace(/\s+/g, ' ').trim()})`);

  /* ------------------------------------------------- capacidade e operadores */
  /**
   * O painel dizia quanto a linha produz, nunca se isso basta. As duas
   * metades da pergunta agora ficam lado a lado — e o dimensionamento traz
   * a formula escrita, porque este e' o numero que vai a' reuniao pedir ou
   * devolver gente, e quem defende precisa mostrar a conta.
   */
  await p.locator('[role="tab"]', { hasText: 'Yamazumi' }).click();
  await p.waitForTimeout(300);
  const capacidade = await p.locator('[aria-label="Capacidade esperada e real"]').innerText();
  checar(/Esperado \(Takt\)/i.test(capacidade) && /Real \(gargalo\)/i.test(capacidade),
    'capacidade mostra o exigido e o entregue lado a lado');
  checar(/300/.test(capacidade), 'esperado sai do Takt (12 s -> 300 pc/h)');
  checar(/222/.test(capacidade), 'real sai do gargalo');
  checar(/74%/.test(capacidade), 'atingimento e o quociente dos dois');
  checar(/-78/.test(capacidade), 'deficit em pecas por hora, com sinal');

  await p.locator('[role="tab"]', { hasText: 'Operadores' }).click();
  await p.waitForTimeout(300);
  const operadores = p.locator('[aria-label="Dimensionamento de operadores"]');
  const textoOper = await operadores.innerText();
  checar(/Σ TP ÷ Takt Time/.test(textoOper), 'a formula fica escrita na tela');
  checar(/40\.2 s ÷ 12\.0 s/.test(textoOper), 'a conta aparece com os numeros do estudo');
  checar(/3\.35/.test(textoOper) && /= 4/.test(textoOper), 'exato e arredondado, os dois');

  await p.locator('#operadores-hoje').fill('7');
  await p.waitForTimeout(300);
  checar(/Sobram 3 operadores/.test(await operadores.innerText()),
    'com o time atual, diz quanto sobra');
  await p.locator('#operadores-hoje').fill('2');
  await p.waitForTimeout(300);
  checar(/Faltam 2 operadores/.test(await operadores.innerText()),
    'e quanto falta');

  // O e-se do analista sobrevive ao recarregar, mas nao sai no relatorio.
  await p.reload();
  await p.waitForTimeout(900);
  await p.locator('[role="tab"]', { hasText: 'Operadores' }).click();
  await p.waitForTimeout(300);
  checar(await p.locator('#operadores-hoje').inputValue() === '2',
    'o numero informado fica guardado neste computador');
  checar(!/Faltam 2 operadores/.test(await p.locator('.somente-impressao').innerText()),
    'e nao vaza para o documento impresso');

  /* ----------------------------------------------------------- sugestoes */
  await p.locator('[role="tab"]', { hasText: 'Sugest' }).click();
  await p.waitForTimeout(300);
  const sugestoes = await p.locator('[aria-label="Sugestões de melhoria"]').innerText();
  checar(/Gargalo acima do Takt/.test(sugestoes), 'aponta o gargalo acima do Takt');
  checar(/Ação:/.test(sugestoes), 'toda sugestao traz a acao junto');
  checar(/Balancear a linha/.test(sugestoes), 'a acao e concreta, nao "melhorar o processo"');
  checar(!/coletar mais|amostra pequena/i.test(sugestoes),
    'nenhuma sugestao manda coletar mais ciclos');
  checar(sugestoes.indexOf('Gargalo acima do Takt') < sugestoes.indexOf('Parada:'),
    'o gargalo abre a lista: e o unico achado que trava a linha inteira');

  /* ------------------------------------------------------------ paradas */
  /**
   * A coleta registrava a parada com motivo e descontava do ciclo, mas
   * nenhuma tela mostrava: o dado morria no banco. Perda medida que ninguem
   * le nao vira melhoria.
   */
  await p.locator('[role="tab"]', { hasText: 'Paradas' }).click();
  await p.waitForTimeout(300);
  const painelParadas = await p.locator('.somente-tela').innerText();
  checar(/19 min/.test(painelParadas), 'soma o tempo parado do estudo inteiro (12 + 4 + 3 min)');
  checar(/3 parada\(s\)/.test(painelParadas), 'conta as ocorrencias');
  checar(painelParadas.indexOf('Falta de material') < painelParadas.indexOf('Setup / Troca'),
    'motivos em ordem de Pareto — a maior perda primeiro');
  checar(/kanban/i.test(painelParadas), 'cada motivo vem com a acao que ele pede');
  checar(/% do tempo observado/.test(painelParadas), 'declara a base do percentual');
  checar(/não entra/i.test(painelParadas), 'diz que o tempo parado nao infla o tempo observado');

  // Tabela de operacoes mostra o parado por operacao.
  await p.locator('[role="tab"]', { hasText: 'Operações' }).click();
  await p.waitForTimeout(300);
  checar(/16 min/.test(await p.locator('.somente-tela table').first().innerText()),
    'a tabela de operacoes tambem mostra o parado de cada uma');

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

  // O papel leva as paradas mesmo com outra aba aberta: o relatorio traz tudo.
  const folha = await p.locator('.somente-impressao').innerText();
  checar(/Paradas registradas na coleta/.test(folha), 'folha impressa tem a secao de paradas');
  checar(/Falta de material/.test(folha) && /kanban/i.test(folha),
    'folha traz motivo e acao recomendada');
  checar(/Ação recomendada/.test(folha), 'a coluna de acao esta na folha');

  /* ------------------------------------------------ tela que nao treme */
  /**
   * O detalhe da operacao aparecia SO' no hover, no meio do fluxo: passar
   * o mouse crescia a pagina, a barra de rolagem surgia, a viewport
   * estreitava, o grafico se remedia — e a barra saia de baixo do cursor,
   * escondendo o detalhe e recomecando tudo. Na tela: tremor.
   *
   * O detalhe agora ocupa lugar fixo. Este teste guarda a propriedade que
   * importa: passar o mouse NAO muda a altura da pagina.
   */
  {
    const grafico = p.locator('svg[aria-label*="Yamazumi"]').first();
    const alturaAntes = await p.evaluate(() => document.documentElement.scrollHeight);
    const caixa = await grafico.locator('rect[rx="4"]').first().boundingBox();
    if (caixa) {
      await p.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
      await p.waitForTimeout(250);
    }
    const alturaHover = await p.evaluate(() => document.documentElement.scrollHeight);
    checar(alturaAntes === alturaHover,
      `hover no grafico nao muda a altura da pagina (${alturaAntes} -> ${alturaHover})`);

    await p.mouse.move(5, 5);
    await p.waitForTimeout(250);
    const alturaFora = await p.evaluate(() => document.documentElement.scrollHeight);
    checar(alturaAntes === alturaFora, 'tirar o mouse tambem nao muda a altura');
  }
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
