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
  await p.waitForSelector('[aria-label="Análise"]', { timeout: 10000 });
  await p.waitForTimeout(400);

  // A resposta fica FORA da secao escolhida: some-la ao examinar a
  // evidencia seria perder a conclusao justo na hora de conferi-la.
  const respostaVisivel = async () => (await p.locator('text=/peças\\/hora/').count()) > 0;
  const secao = (nome) => p.locator('[aria-label="Análise"] button', { hasText: nome });
  checar(await respostaVisivel(), 'resposta visivel na secao inicial');

  await secao('Operações').click();
  await p.waitForTimeout(300);
  checar(new URL(p.url()).searchParams.get('aba') === 'operacoes', 'secao ativa vai para a URL');
  checar(await respostaVisivel(), 'resposta continua visivel ao trocar de secao');
  checar(await p.locator('.somente-tela >> text=GARGALO').count() > 0, 'gargalo identificado na tabela');
  checar(await p.locator('text=/amostra suficiente/i').count() > 0, 'avisa amostra insuficiente antes de mostrar numeros');
  // Volta ao Yamazumi para as verificacoes do grafico.
  await secao('Yamazumi').click();
  await p.waitForTimeout(300);
  checar(await p.locator('text=/TAKT/').count() > 0, 'linha de Takt rotulada');
  checar(await p.locator('text=Tempo normal').count() > 0, 'legenda presente (identidade nunca so por cor)');
  /**
   * A carta de controle SAIU da tela (ago/2026). Ela pedia leitura de CEP —
   * limites, sigma, ponto fora de controle — e o analista nao a usava para
   * decidir nada: quem responde "este ciclo saiu do padrao" e' o aviso de
   * ciclo atipico durante a coleta, e quem responde "este posto e' estavel"
   * e' o CV%, que continua na tabela e no papel. Este teste guarda a
   * ausencia: secao fora, e a analise segue completa sem ela.
   */
  const secoes = await p.locator('[aria-label="Análise"]').innerText();
  checar(!/Carta de controle/i.test(secoes), 'a carta de controle nao aparece mais na navegacao');
  checar(/Yamazumi/.test(secoes) && /Opera/.test(secoes) && /Paradas/.test(secoes),
    `as secoes que restam sao as que se usam (${secoes.replace(/\s+/g, ' ').trim()})`);

  /* ------------------------------------------------- capacidade e operadores */
  /**
   * O painel dizia quanto a linha produz, nunca se isso basta. As duas
   * metades da pergunta agora ficam lado a lado — e o dimensionamento traz
   * a formula escrita, porque este e' o numero que vai a' reuniao pedir ou
   * devolver gente, e quem defende precisa mostrar a conta.
   */
  await p.locator('[aria-label="Análise"] button', { hasText: 'Yamazumi' }).click();
  await p.waitForTimeout(300);
  /* Tres numeros com o nome do que sao. O "Real (gargalo)" era conta (a
     capacidade pelo tempo padrao), nao medicao — e a medicao da linha e'
     o terceiro. Este harness responde o MESMO corpo para toda URL: as
     medicoes e o cadastro chegam fora do formato, e o painel segue de pe'
     dizendo que nao ha' medicao e como medir. */
  const capacidade = await p.locator('[aria-label="Capacidade: exigido, tempo padrão e medido"]').innerText();
  checar(/Exigido \(takt\)/i.test(capacidade) && /Capacidade pelo tempo padrão/i.test(capacidade)
    && /Medido na linha/i.test(capacidade),
    'capacidade mostra os tres numeros com o nome certo');
  checar(!/Real \(gargalo\)/i.test(capacidade), 'o "Real (gargalo)" saiu: era conta, nao medicao');
  checar(/300/.test(capacidade), 'exigido sai do Takt (12 s -> 300 pc/h)');
  checar(/222/.test(capacidade), 'capacidade pelo tempo padrao sai do gargalo');
  /* Atingimento e deficit com a capacidade CHEIA (222,7/h): o 222 do
     cartao e' so' exibicao. Arredondar antes de dividir trocava o veredito
     na embalagem (revisao de 20/10). */
  checar(/74,2%/.test(capacidade), 'atingimento e o quociente dos dois, com uma casa (222,7 / 300 = 74,2%)');
  /* O deficit escrito sai dos dois numeros escritos (222 e 300), para a
     conta fechar na tela: -78, e nao o -77,3 do valor cheio. */
  checar(/-78\b/.test(capacidade) && !/-77/.test(capacidade),
    'deficit em pecas por hora, com sinal, derivado dos numeros mostrados (222 - 300)');
  checar(/base: capacidade pelo tempo padrão/.test(capacidade),
    'sem medicao, atingimento e deficit dizem que a base e a capacidade pelo tempo padrao');
  checar(/nenhuma medição/.test(capacidade) && /Ritmo por máquina/.test(capacidade),
    'resposta sem medicoes: diz que nao ha medicao e onde medir');
  checar(/“Furadeira 03” não é uma máquina do cadastro/.test(capacidade),
    'posto fora do cadastro: diz que a medicao grava a maquina e nao vai casar');
  /* O numero do topo tem o MESMO nome do cartao do quadro: "Capacidade da
     linha" fazia a conta do gargalo passar por medicao do chao. */
  const topo = await p.locator('[aria-label="Resultado do estudo"]').innerText();
  checar(/Capacidade pelo tempo padrão/i.test(topo) && !/Capacidade da linha/i.test(topo),
    `o topo se chama "Capacidade pelo tempo padrão", como o cartao (${topo.split('\n')[0]})`);

  await p.locator('[aria-label="Análise"] button', { hasText: 'Operadores' }).click();
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
  await p.locator('[aria-label="Análise"] button', { hasText: 'Operadores' }).click();
  await p.waitForTimeout(300);
  checar(await p.locator('#operadores-hoje').inputValue() === '2',
    'o numero informado fica guardado neste computador');
  checar(!/Faltam 2 operadores/.test(await p.locator('.somente-impressao').innerText()),
    'e nao vaza para o documento impresso');

  /* ----------------------------------------------------------- sugestoes */
  await p.locator('[aria-label="Análise"] button', { hasText: 'Sugest' }).click();
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
  await p.locator('[aria-label="Análise"] button', { hasText: 'Paradas' }).click();
  await p.waitForTimeout(300);
  const painelParadas = await p.locator('.somente-tela').innerText();
  checar(/19 min/.test(painelParadas), 'soma o tempo parado do estudo inteiro (12 + 4 + 3 min)');
  checar(/3 parada\(s\)/.test(painelParadas), 'conta as ocorrencias');
  checar(painelParadas.indexOf('Falta de material') < painelParadas.indexOf('Setup / Troca'),
    'motivos em ordem de Pareto — a maior perda primeiro');
  checar(/kanban/i.test(painelParadas), 'cada motivo vem com a acao que ele pede');
  checar(/% do tempo observado/.test(painelParadas), 'declara a base do percentual');
  checar(/não entra/i.test(painelParadas), 'diz que o tempo parado nao infla o tempo observado');
  /**
   * O CUSTO EM PECA — so' o do GARGALO.
   *
   * Minuto parado nao move reuniao de producao; peca que deixou de sair,
   * sim. Mas so' a parada do posto que MANDA no ritmo tira peca do fim da
   * linha: parada em operacao folgada e' absorvida pela folga dela. Somar as
   * paradas de todas as operacoes e multiplicar pela capacidade da linha
   * dava 6 vezes o valor real (auditoria de 31/08).
   */
  // 3 min de parada no gargalo (Trocar broca, 222 pc/h) = 11 pecas. Antes
  // da auditoria a conta somava os 19 min de TODAS as operacoes e dizia 70.
  checar(/11 peças deixaram de sair da linha/.test(painelParadas),
    'o custo em peca sai do tempo parado do GARGALO, nao da soma de todas as operacoes');
  checar(/é o posto que manda no ritmo/.test(painelParadas),
    'a conta e do GARGALO, nao a soma das paradas de todas as operacoes');
  checar(/absorvida\s+pela folga delas/.test(painelParadas),
    'a tela explica por que parada em operacao folgada nao entra na conta');
  checar(/peças do posto/i.test(painelParadas),
    'e cada operacao mostra o custo dela, na capacidade dela, na tabela');

  /* ----------------------------------------------------------- tendencia */
  // Um quadro por operacao com dados, cada um com a propria reta e a
  // leitura em palavras — nunca so' a cor.
  await p.locator('[aria-label="Análise"] button', { hasText: 'Tendência' }).click();
  await p.waitForTimeout(400);
  const secaoTendencia = p.locator('[aria-label="Tendência ao longo da coleta"]');
  checar(await secaoTendencia.count() === 1, 'secao Tendencia presente');
  checar(await secaoTendencia.locator('svg[aria-label^="Tendência de"]').count() === 4,
    'um quadro de tendencia por operacao com ciclos');
  const textoTendencia = await secaoTendencia.innerText();
  checar(/Estável|Ciclos subindo|Ciclos caindo|Sem direção/.test(textoTendencia),
    'cada quadro diz em palavras o que a curva mostra');
  checar(/1º ciclo/.test(textoTendencia) && /14º/.test(textoTendencia),
    'o eixo diz de qual ciclo a qual ciclo a curva vai');
  // Contra a CELULA do grid (o cartao, com 12px de padding de cada lado),
  // nao contra o div de onde a largura foi medida — essa razao daria 1 por
  // construcao e nao pegaria o letterbox.
  const larguraMini = await p.evaluate(() => {
    const svg = document.querySelector('[aria-label="Tendência ao longo da coleta"] svg');
    const cartao = svg?.parentElement?.parentElement;
    if (!svg || !cartao) return 0;
    return svg.getBoundingClientRect().width / (cartao.getBoundingClientRect().width - 24);
  });
  checar(larguraMini > 0.95, `quadro de tendencia ocupa ${(larguraMini * 100).toFixed(0)}% da largura da celula`);

  // Tabela de operacoes mostra o parado por operacao.
  await p.locator('[aria-label="Análise"] button', { hasText: 'Operações' }).click();
  await p.waitForTimeout(300);
  checar(/16 min/.test(await p.locator('.somente-tela table').first().innerText()),
    'a tabela de operacoes tambem mostra o parado de cada uma');

  // O grafico precisa preencher o container, nao ficar centralizado num vazio.
  await p.locator('[aria-label="Análise"] button', { hasText: 'Yamazumi' }).click();
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
  // Recarregar preserva a vista — e' para isso que a secao vive na URL.
  await p.locator('[aria-label="Análise"] button', { hasText: 'Operações' }).click();
  await p.waitForTimeout(300);
  await p.reload();
  await p.waitForTimeout(800);
  const apos = await p.locator('[aria-label="Análise"] [aria-current="page"]').innerText();
  checar(/Opera/.test(apos), `recarregar mantem a secao (${apos.split('\n')[0]})`);

  checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
}

/* ------------------------------------------------------------- impressao */
{
  // Largura util do A4 retrato com margem de 12mm: ~703px a 96dpi.
  const p = await (await navegador.newContext({ viewport: { width: 703, height: 1200 } })).newPage();
  await p.goto(PAGINA);
  // O relatorio impresso NAO depende da secao aberta: ele traz tudo, sempre.
  await p.waitForSelector('[aria-label="Análise"]');
  await p.waitForTimeout(400);
  checar(await p.locator('[aria-label="Análise com IA"]').count() === 1,
    'secao Analise com IA presente no painel');

  // O papel leva as paradas mesmo com outra secao aberta: o relatorio traz tudo.
  const folha = await p.locator('.somente-impressao').innerText();
  checar(/Paradas registradas na coleta/.test(folha), 'folha impressa tem a secao de paradas');
  checar(/Falta de material/.test(folha) && /kanban/i.test(folha),
    'folha traz motivo e acao recomendada');
  checar(/Ação recomendada/.test(folha), 'a coluna de acao esta na folha');
  // A tendencia vai no papel com a leitura em palavras e a legenda da reta.
  checar(/Tendência ao longo da coleta/.test(folha), 'folha impressa tem a tendencia por operacao');
  checar(await p.locator('.somente-impressao svg[aria-label^="Tendência de"]').count() === 4,
    'um quadro de tendencia por operacao na folha');
  checar(/Reta sobre os ciclos/.test(folha), 'a legenda explica como a reta e lida');

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
  checar(/Medido na linha/i.test(await p.locator('.somente-impressao').innerText()),
    'a folha traz o medido na linha, mesmo sem medicao');
}

/* ----------------------------------------------------- medicao da linha */
/**
 * A MEDICAO REAL DA LINHA no estudo: as medicoes de ritmo do mesmo posto e
 * do mesmo produto entram como o terceiro numero, e o atingimento passa a
 * ser do medido. Cada cenario faz o harness responder conforme a URL
 * (estudo, cadastro, medicoes). Numeros feitos na mao no harness.
 */
async function abrirCenario(cenario, largura = 1440) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 1000 } });
  const p = await ctx.newPage();
  // O Resumo executivo chama window.print: contar basta, a caixa travaria.
  await p.addInitScript(() => { window.__impressoes = 0; window.print = () => { window.__impressoes += 1; }; });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon/i.test(msg.text()) && !/404/.test(msg.text())) erros.push(msg.text());
  });
  await p.goto(`${PAGINA}?cenario=${cenario}`);
  await p.waitForSelector('[aria-label="Capacidade: exigido, tempo padrão e medido"]', { timeout: 10000 });
  // A medicao chega depois do estudo: espera o cartao sair do "buscando".
  await p.waitForFunction(() => !/buscando as medições/.test(
    document.querySelector('[aria-label="Capacidade: exigido, tempo padrão e medido"]')?.innerText || '',
  ), null, { timeout: 8000 });
  const bloco = await p.locator('[aria-label="Capacidade: exigido, tempo padrão e medido"]').innerText();
  return { ctx, p, erros, bloco };
}

/** Texto do cartao de um rotulo: do rotulo ate' o proximo cartao. */
const cartao = async (p, rotulo) => p.locator('[aria-label="Capacidade: exigido, tempo padrão e medido"] div', {
  has: p.locator(`span:text-is("${rotulo}")`),
}).last().innerText();

{
  const { ctx, p, erros, bloco } = await abrirCenario('furadeira');
  const medido = await cartao(p, 'Medido na linha');
  checar(/180/.test(medido) && /pç\/h/.test(medido),
    `furadeira: medido no relogio, so do posto e do produto (180 pç/h): ${medido.replace(/\s+/g, ' ')}`);
  checar(/3 medições/.test(medido) && /no relógio, paradas dentro/.test(medido),
    'diz quantas medicoes e que as paradas estao dentro');
  checar(/com a linha rodando: 196 pç\/h/.test(medido), 'e o ritmo rodando como diagnostico');
  checar(!/999/.test(medido), 'arquivada, velha, outro produto e outra maquina ficam de fora');
  checar(/Exigido \(takt\)[\s\S]*300/i.test(bloco) && /Capacidade pelo tempo padrão[\s\S]*222/i.test(bloco),
    'exigido e capacidade pelo tempo padrao continuam la');
  checar(/60%/.test(await cartao(p, 'Atingimento')), 'atingimento passa a ser do medido: 180 / 300 = 60%');
  checar(/-120/.test(await cartao(p, 'Déficit')), 'deficit do medido: 180 - 300 = -120 pç/h');
  checar((bloco.match(/base: medido na linha/g) || []).length === 2,
    'atingimento e deficit dizem que a base e o medido');
  checar(/a linha entrega 80,9% do que o tempo padrão permite/.test(bloco),
    'a perda entre o tempo padrao e o chao: 180 / 222,7 = 80,9%');
  const largo = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  checar(!largo, 'sem rolagem horizontal com o bloco novo');

  // O papel: a Folha leva os tres numeros, a base e a perda.
  await p.setViewportSize({ width: 703, height: 1200 });
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(300);
  const folha = await p.locator('.somente-impressao').innerText();
  checar(/Exigido \(takt\)/i.test(folha) && /Capacidade pelo tempo padrão/i.test(folha) && /Medido na linha/i.test(folha),
    'folha impressa: exigido, tempo padrao e medido no resumo');
  checar(/Base do atingimento e do déficit: medido na linha/.test(folha) && /80,9% do que o tempo padrão permite/.test(folha),
    'folha diz a base do atingimento e a perda para o tempo padrao');
  checar(/180 pç\/h \(3 medições/.test(folha), 'folha traz o medido com as medicoes');
  checar(!(await p.evaluate(() => document.querySelector('.somente-impressao').scrollWidth > document.documentElement.clientWidth + 1)),
    'folha com o medido cabe na largura util do A4');

  // O Resumo executivo: um cartao a mais, na mesma ordem da tela.
  await p.emulateMedia({ media: 'screen' });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.getByRole('button', { name: 'Resumo executivo' }).click();
  await p.waitForFunction(() => window.__impressoes > 0, null, { timeout: 5000 });
  await p.setViewportSize({ width: 703, height: 1200 });
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(300);
  const resumo = await p.locator('.somente-impressao').innerText();
  checar(/Resumo Executivo/i.test(resumo) && /Medido na linha/i.test(resumo) && /180/.test(resumo),
    'resumo executivo traz o medido na linha');
  checar(/base: medido na linha/.test(resumo) && /60%/.test(resumo), 'e o atingimento pelo medido');
  checar(!(await p.evaluate(() => document.querySelector('.somente-impressao').scrollWidth > document.documentElement.clientWidth + 1)),
    'resumo com cinco cartoes cabe na largura util do A4');
  checar(erros.length === 0, `furadeira: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  const { ctx, p, erros, bloco } = await abrirCenario('furadeira-curta');
  const medido = await cartao(p, 'Medido na linha');
  checar(/189/.test(medido) && /amostra curta \(2 de 3 medições\)/.test(medido) && /não entra no atingimento/.test(medido),
    `amostra curta: mostra o numero com a ressalva (${medido.replace(/\s+/g, ' ')})`);
  checar(/74,2%/.test(await cartao(p, 'Atingimento')) && /base: capacidade pelo tempo padrão/.test(bloco),
    'e o atingimento fica na capacidade pelo tempo padrao');
  checar(/^Do tempo padrão\s*—/i.test(await cartao(p, 'Do tempo padrão')),
    'sem medido usavel, o percentual do tempo padrao fica vazio, no lugar');
  checar(/abaixo do ritmo exigido pelo tempo padrão · a medição ainda não confirma: amostra curta \(2 de 3 medições\)/
    .test(await cartao(p, 'Atingimento')), 'o atingimento diz que a medicao ainda nao confirma, e por que');
  checar(erros.length === 0, `amostra curta: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  const { ctx, p, erros } = await abrirCenario('sem-medicao');
  const medido = await cartao(p, 'Medido na linha');
  checar(/nenhuma medição de Painel MDF 18mm em Furadeira 03 nos últimos 30 dias/.test(medido),
    'sem medicao: diz de que produto e posto nao ha medicao');
  checar(/no tablet, Ritmo por máquina/.test(medido), 'e como medir (Ritmo por maquina, na furadeira)');
  checar(/1 medição do posto com outro produto/.test(medido), 'e aponta a medicao do posto com outro nome de produto');
  checar(erros.length === 0, `sem medicao: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  // A carga das medicoes falha (500): o painel continua de pe'.
  const { ctx, p, erros, bloco } = await abrirCenario('medicao-falha');
  checar(/não deu para buscar a medição agora/.test(await cartao(p, 'Medido na linha')),
    'medicao fora do ar: o cartao diz que nao deu, sem derrubar o painel');
  checar(await p.locator('text=/peças\\/hora/').count() > 0 && /74,2%/.test(bloco),
    'e o resto da analise segue com a capacidade pelo tempo padrao');
  checar(erros.length === 0, `medicao fora do ar: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  const { ctx, p, erros, bloco } = await abrirCenario('embalagem');
  const medido = await cartao(p, 'Medido na linha');
  checar(/23\s*produtos\/h/.test(medido),
    `embalagem: 46 volumes/h de um rack de 2 volumes = 23 produtos/h (${medido.replace(/\s+/g, ' ')})`);
  checar(/contados 46 vol\/h ÷ 2 volumes por produto/.test(medido), 'e mostra a conversao');
  checar(/Exigido \(takt\)\s*25/i.test(bloco) && /Capacidade pelo tempo padrão\s*31,3/i.test(bloco),
    'exigido 25 (takt 144 s) e tempo padrao 31,3 (TP 115 s): uma casa abaixo de 100/h');
  checar(/92%/.test(await cartao(p, 'Atingimento')) && /-2/.test(await cartao(p, 'Déficit')),
    'atingimento do medido: 23 / 25 = 92%, deficit -2');
  checar(/a linha entrega 73,5% do que o tempo padrão permite/.test(bloco), 'perda para o tempo padrao: 23 / 31,3 = 73,5%');
  /* A embalagem mede o PRODUTO: todo numero por hora do quadro diz
     produtos/h — nao "pç/h" num cartao e "produtos/h" no outro. */
  checar(!/pç\/h/.test(bloco) && (bloco.match(/produtos\/h/g) || []).length >= 4,
    `embalagem: exigido, tempo padrao, medido e deficit em produtos/h, nenhum pç/h (${(bloco.match(/produtos\/h/g) || []).length})`);
  checar(/takt de 144.0 s por produto/.test(await cartao(p, 'Exigido (takt)')), 'o takt e por produto');
  const topoEmb = await p.locator('[aria-label="Resultado do estudo"]').innerText();
  // O topo escreve o mesmo 31,3 do quadro, nao o 31 inteiro.
  checar(/Capacidade pelo tempo padrão[\s\S]*31,3[\s\S]*produtos\/hora/i.test(topoEmb) && /s por produto/.test(topoEmb)
    && !/peças\/hora|por peça/.test(topoEmb),
    `embalagem: o topo diz produtos/hora e por produto (${topoEmb.replace(/\s+/g, ' ').slice(0, 120)})`);
  await p.emulateMedia({ media: 'print' });
  const folhaEmb = await p.locator('.somente-impressao').innerText();
  checar(/A capacidade pelo tempo padrão é\s+limitada por esta operação — 31,3 produtos\/hora/.test(folhaEmb)
    && !/capacidade da linha/i.test(folhaEmb),
    'folha: o paragrafo do gargalo diz "capacidade pelo tempo padrao" em produtos/hora');
  checar(/Exigido \(takt\)\s*25\s*produtos\/h/i.test(folhaEmb) && /Déficit\s*-2\s*produtos\/h/i.test(folhaEmb),
    'folha: exigido e deficit em produtos/h');
  await p.emulateMedia({ media: 'screen' });

  await p.getByRole('button', { name: 'Resumo executivo' }).click();
  await p.waitForFunction(() => window.__impressoes > 0, null, { timeout: 5000 });
  const resumo = await p.locator('.somente-impressao').innerText();
  checar(/A falta está\s+no chão/.test(resumo),
    'resumo: tempo padrao sobra e medido falta — a falta e do chao, nao do gargalo do estudo');
  checar(/23\s*produtos\/h/.test(resumo), 'resumo leva o medido em produtos/h');
  checar(/25\s*produtos\/h/.test(resumo) && /Takt de 144.0 s por produto/.test(resumo) && /-2 produtos\/h de déficit/.test(resumo),
    'resumo: exigido, takt e deficit tambem por produto');
  checar(erros.length === 0, `embalagem: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  const { ctx, p, erros, bloco } = await abrirCenario('embalagem-sem-volumes');
  const medido = await cartao(p, 'Medido na linha');
  checar(/46\s*vol\/h/.test(medido),
    `sem volumes no cadastro: mostra o que mediu, em volumes (${medido.replace(/\s+/g, ' ')})`);
  checar(/informe os volumes do produto em Produtos/.test(medido), 'e pede os volumes no cadastro de produtos');
  checar(/125,2%/.test(await cartao(p, 'Atingimento')) && /base: capacidade pelo tempo padrão/.test(bloco),
    'volume nao vira produto: o atingimento fica no tempo padrao (31,3 / 25 = 125,2%)');
  /* Pelo tempo padrao a linha ATENDERIA — e o medido (46 vol/h = 23
     produtos/h, abaixo dos 25) mostra o contrario. A tela nao pode dizer
     "a linha entrega o ritmo" (revisao de 20/10). */
  const ating = await cartao(p, 'Atingimento');
  checar(/pelo tempo padrão atenderia/.test(ating) && /a medição ainda não confirma: faltam os volumes do produto/.test(ating),
    `sem medido utilizavel: "pelo tempo padrao atenderia", e por que a medicao nao confirma (${ating.replace(/\s+/g, ' ')})`);
  checar(!/a linha entrega o ritmo/.test(bloco), 'e nunca "a linha entrega o ritmo"');
  await p.getByRole('button', { name: 'Resumo executivo' }).click();
  await p.waitForFunction(() => window.__impressoes > 0, null, { timeout: 5000 });
  const resumoSv = await p.locator('.somente-impressao').innerText();
  checar(!/A linha atende/.test(resumoSv) && /Pelo tempo padrão, a linha atenderia o ritmo da demanda — a medição ainda não confirma: faltam os volumes/.test(resumoSv),
    'resumo: "pelo tempo padrao atenderia", nunca "a linha atende"');
  // A Folha diz o mesmo, com as mesmas palavras.
  await p.getByRole('button', { name: 'Imprimir relatório' }).click();
  await p.waitForFunction(() => window.__impressoes > 1, null, { timeout: 5000 });
  const folhaSv = await p.locator('.somente-impressao').innerText();
  checar(/Veredito: Pelo tempo padrão, a linha atenderia o ritmo da demanda — a medição ainda não confirma/.test(folhaSv)
    && !/A linha atende/.test(folhaSv), 'folha: o mesmo veredito, sem afirmar o que ninguem mediu');
  checar(erros.length === 0, `embalagem sem volumes: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  /* O SETUP: o grupo tem setup planejado (5 x 5 x 12 min). O estudo nao
     guarda de onde veio o takt — do programa (que ja' desconta o setup) ou
     digitado —, entao o setup marcado FICA no relogio (180 pecas por hora,
     o erro pessimista) e o numero sem ele (180 em 55 min = 196/h) vai ao
     lado, dizendo quando vale. Tirar sempre contava zero vez com o takt
     digitado. */
  const { ctx, p, erros } = await abrirCenario('furadeira-setup');
  const medido = await cartao(p, 'Medido na linha');
  checar(/^Medido na linha\s*180\s*pç\/h/i.test(medido)
    && /com o setup marcado \(5 min\) dentro do relógio; sem ele, 196 pç\/h/.test(medido)
    && /veio do programa da semana/.test(medido),
    `setup planejado: o setup fica no relogio e o numero sem ele vai ao lado (${medido.replace(/\s+/g, ' ')})`);
  checar(/60%/.test(await cartao(p, 'Atingimento')), 'atingimento com o setup no relogio: 180 / 300 = 60%');
  await p.emulateMedia({ media: 'print' });
  checar(/com o setup marcado \(5 min\) dentro do relógio; sem ele, 196/.test(await p.locator('.somente-impressao').innerText()),
    'a folha tambem diz que o setup ficou no relogio, e o numero sem ele');
  checar(erros.length === 0, `setup planejado: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  // As tres medicoes do posto e produto estao ARQUIVADAS.
  const { ctx, p, erros } = await abrirCenario('arquivadas');
  const medido = await cartao(p, 'Medido na linha');
  checar(/3 medições de Painel MDF 18mm em Furadeira 03 dos últimos 30 dias estão arquivadas/.test(medido)
    && /restaure no relatório Ritmo por máquina, em Arquivadas/.test(medido),
    `arquivadas: diz quantas e onde restaurar (${medido.replace(/\s+/g, ' ')})`);
  checar(!/nenhuma medição/.test(medido) && !/para medir/.test(medido),
    'e nao manda medir de novo o que esta guardado no banco');
  checar(/a medição ainda não confirma: as 3 medições do posto com este produto estão arquivadas/.test(await cartao(p, 'Atingimento')),
    'o atingimento diz por que a medicao nao confirma');
  checar(erros.length === 0, `arquivadas: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  // A lista do servidor veio no teto (1000 linhas, de todas as maquinas).
  const { ctx, p, erros } = await abrirCenario('teto');
  const medido = await cartao(p, 'Medido na linha');
  checar(/180\s*pç\/h/.test(medido) && /teto de 1000 medições/.test(medido) && /podem ter ficado de fora/.test(medido),
    'lista no teto: o cartao avisa que medicao antiga pode ter ficado de fora');
  checar(erros.length === 0, `teto: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  // A primeira busca das medicoes falha; "Tentar de novo" busca outra vez.
  const { ctx, p, erros } = await abrirCenario('medicao-volta');
  checar(/não deu para buscar a medição agora/.test(await cartao(p, 'Medido na linha')),
    'tentar de novo: a primeira busca falhou');
  const botao = p.locator('[aria-label="Capacidade: exigido, tempo padrão e medido"] button', { hasText: 'Tentar de novo' });
  checar(await botao.count() === 1, 'o cartao do medido com erro tem o botao "Tentar de novo"');
  await botao.click();
  await p.waitForFunction(() => /180/.test(
    document.querySelector('[aria-label="Capacidade: exigido, tempo padrão e medido"]')?.innerText || '',
  ), null, { timeout: 5000 }).catch(() => {});
  const depois = await cartao(p, 'Medido na linha');
  checar(/180\s*pç\/h/.test(depois) && !/não deu para buscar/.test(depois),
    `e a segunda busca traz a medicao (${depois.replace(/\s+/g, ' ').slice(0, 80)})`);
  checar(/60%/.test(await cartao(p, 'Atingimento')), 'e o atingimento passa para o medido');
  checar(erros.length === 0, `tentar de novo: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  // Produto DESATIVADO no cadastro: os volumes continuam valendo.
  const { ctx, p, erros } = await abrirCenario('embalagem-desativado');
  const medido = await cartao(p, 'Medido na linha');
  checar(/23\s*produtos\/h/.test(medido) && /÷ 2 volumes por produto/.test(medido),
    `produto desativado: os volumes vem do cadastro mesmo assim (${medido.replace(/\s+/g, ' ')})`);
  checar(erros.length === 0, `produto desativado: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  /* A FRACAO: takt de 146 s = 24,66 produtos/h; medido 24,3. No inteiro,
     24 contra 24 dava "100%, Superavit 0, a linha atende". */
  const { ctx, p, erros } = await abrirCenario('embalagem-fracao');
  const ating = await cartao(p, 'Atingimento');
  checar(/98,6%/.test(ating) && /abaixo do ritmo exigido/.test(ating) && !/100%/.test(ating),
    `atingimento com os valores cheios: 24,3 / 24,66 = 98,6%, abaixo (${ating.replace(/\s+/g, ' ')})`);
  const def = await cartao(p, 'Déficit');
  // 24,3 - 24,6 escritos no quadro: -0,3, a conta que o PPCP refaz de olho.
  checar(/^Déficit\s*-0,3/i.test(def), `e deficit de 0,3 produto por hora, nunca superavit 0 (${def.replace(/\s+/g, ' ')})`);
  await p.getByRole('button', { name: 'Resumo executivo' }).click();
  await p.waitForFunction(() => window.__impressoes > 0, null, { timeout: 5000 });
  const resumo = await p.locator('.somente-impressao').innerText();
  checar(/A linha não atende o ritmo da demanda, medida na linha/.test(resumo) && !/A linha atende/.test(resumo),
    'resumo: nao atende, medida na linha');
  checar(erros.length === 0, `fracao: sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

{
  /* LAYOUT: tres colunas iguais de 1024 a 1440 px — o auto-fit quebrava em
     2 + 1 em 1024 e deixava um cartao sozinho na linha de baixo. No
     celular, um embaixo do outro. */
  for (const largura of [1024, 1366, 1440, 390]) {
    const { ctx, p } = await abrirCenario('embalagem', largura);
    const g = await p.evaluate(() => {
      const cartoes = [...document.querySelectorAll('[aria-label="Capacidade: exigido, tempo padrão e medido"] .grade-capacidade > div')];
      const fileiras = new Map();
      for (const c of cartoes) {
        const t = Math.round(c.getBoundingClientRect().top);
        fileiras.set(t, (fileiras.get(t) || 0) + 1);
      }
      const larguras = new Set(cartoes.map((c) => Math.round(c.getBoundingClientRect().width)));
      return { porFileira: [...fileiras.values()], larguras: larguras.size };
    });
    const esperado = largura < 900 ? '1,1,1,1,1,1' : '3,3';
    checar(g.porFileira.join(',') === esperado && g.larguras === 1,
      `${largura} px: cartoes por fileira ${g.porFileira.join('+')} (esperado ${esperado.replace(/,/g, '+')}), todos da mesma largura`);
    await ctx.close();
  }
}

await navegador.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
