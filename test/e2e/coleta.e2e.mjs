/**
 * Teste de navegador da tela de coleta.
 *
 * Cobre o que teste unitario nao alcanca: precisao real do cronometro sob
 * o agendador do navegador, bloqueio de repique de toque, gravacao no
 * IndexedDB e — o que ja' pegou um bug de verdade — se todos os elementos
 * cabem na viewport sem rolagem, nos tamanhos de tela usados na fabrica.
 *
 * Uso:
 *   npm run dev            # em outro terminal, porta 5199
 *   node test/e2e/coleta.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness/index.html`;

const TELAS = [
  { nome: 'celular-pequeno', width: 360, height: 640 },
  { nome: 'celular-grande', width: 420, height: 860 },
  { nome: 'tablet', width: 768, height: 1024 },
];

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });

/* ---------------------------------------------------- precisao e gravacao */
{
  const ctx = await navegador.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));

  await p.goto(PAGINA);

  /**
   * Deriva do cronometro, medida sem o relogio do automatizador.
   *
   * Cada ciclo carrega `coletadoEm`, gravado no instante exato em que o
   * ciclo foi cortado — antes de qualquer escrita em disco. O intervalo
   * entre dois `coletadoEm` consecutivos e' portanto o tempo REAL daquele
   * ciclo, e a duracao reportada tem de bater com ele.
   *
   * Marcar o tempo DEPOIS da gravacao no IndexedDB nao serve: sob carga a
   * escrita atrasa o marco em dezenas de ms e o teste acusa erro do
   * cronometro onde ha' lentidao de disco. Medido: 2ms de erro em maquina
   * ociosa contra 96ms marcando depois da escrita.
   *
   * Comparar com um valor esperado nao serve aqui: o despacho de clique do
   * Playwright custa dezenas de ms e varia com a carga da maquina — o teste
   * acusaria erro do cronometro onde ha' ruido do automatizador. Ja com dois
   * marcos internos, a latencia sai da conta.
   *
   * E' esta a propriedade que separa um cronometro correto de um que soma
   * setInterval: o segundo acumularia diferenca a cada ciclo.
   */
  await p.locator('button[aria-label="Iniciar cronometragem"]').click();

  for (const ms of [700, 900, 1200, 700]) {
    await p.waitForTimeout(ms);
    await p.locator('button[aria-label="Registrar fim do ciclo"]').click();
  }
  // enfileirar() e' assincrono: sem esta folga o ultimo ciclo nao entrou ainda.
  await p.waitForTimeout(250);

  const reg = await p.evaluate(() => window.__registrados.map((r) => ({
    d: r.duracaoMs, t: new Date(r.coletadoEm).getTime(),
  })));
  checar(reg.length === 4, `registrou 4 ciclos (${reg.map((r) => Math.round(r.d)).join(', ')} ms)`);

  const erros_ = [];
  for (let i = 1; i < reg.length; i++) {
    const intervaloReal = reg[i].t - reg[i - 1].t;
    erros_.push(reg[i].d - intervaloReal);
  }
  const pior = Math.max(...erros_.map(Math.abs));
  checar(pior < 25,
    `cronometro bate com o intervalo real entre registros (erro maximo ${pior.toFixed(1)}ms)`);

  // Deriva apareceria como erro CRESCENTE. Constante e' so' arredondamento.
  const crescente = erros_.every((e, i) => i === 0 || Math.abs(e) > Math.abs(erros_[i - 1]) + 5);
  checar(!crescente, `sem deriva acumulada (erros: ${erros_.map((e) => e.toFixed(1)).join(', ')}ms)`);

  // Repique de luva: dois toques colados valem um ciclo so'.
  const antes = await p.evaluate(() => window.__registrados.length);
  const botao = p.locator('button[aria-label="Registrar fim do ciclo"]');
  await p.waitForTimeout(600);
  await botao.click();
  await botao.click({ delay: 0 });
  await p.waitForTimeout(200);
  const depois = await p.evaluate(() => window.__registrados.length);
  checar(depois - antes === 1, 'repique bloqueado: 2 toques viram 1 ciclo');

  const naFila = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ritmoprod', 1);
    r.onsuccess = (e) => {
      const req = e.target.result.transaction('fila', 'readonly').objectStore('fila').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(-1);
    };
    r.onerror = () => res(-1);
  }));
  const totalRegistrado = await p.evaluate(() => window.__registrados.length);
  checar(naFila === totalRegistrado, `${naFila} ciclos gravados no IndexedDB antes de qualquer rede`);

  /**
   * DESFAZER TIRA DA FILA TAMBEM.
   *
   * O ciclo entra na fila no instante em que se registra — e' o que garante
   * que nada se perde se o aparelho morrer. Mas o desfazer so' mexia na
   * TELA: o analista via 4 ciclos e o servidor recebia 5, e o ciclo atipico
   * que ele acabou de descartar entrava na media do estudo, la' no PC.
   */
  const contarFila = () => p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ritmoprod', 1);
    r.onsuccess = (e) => {
      const req = e.target.result.transaction('fila', 'readonly').objectStore('fila').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(-1);
    };
    r.onerror = () => res(-1);
  }));
  await p.getByRole('button', { name: /Desfazer/i }).first().click();
  await p.waitForTimeout(500);
  checar(await contarFila() === naFila - 1,
    'desfazer tira o ciclo da FILA, nao so da tela — o descartado nao sobe para o PC');
  checar(/nao vai para o PC/i.test(await p.locator('body').innerText()),
    'e a tela diz que ele nao vai subir');
  checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
  await ctx.close();
}

/* --------------------------------------------------------- meta batida */
/**
 * Chegar em 10/10 e nao saber que chegou: a meta so' existia como fracao
 * pequena no topo, no meio de outros tres numeros, e o analista seguia
 * cronometrando "mais um pouco" sem precisar.
 */
{
  const ctx = await navegador.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${PAGINA}?meta=3`);
  await p.locator('button[aria-label="Iniciar cronometragem"]').click();
  for (let i = 0; i < 3; i++) {
    await p.waitForTimeout(420);
    await p.locator('button[aria-label="Registrar fim do ciclo"]').click();
  }
  await p.waitForTimeout(300);

  const faixaMeta = p.locator('[role="status"]').filter({ hasText: 'Meta atingida' });
  checar(await faixaMeta.count() === 1, 'ao bater a meta a tela avisa que ja da para encerrar');
  const textoMeta = await faixaMeta.innerText();
  checar(/3\/3/.test(textoMeta), 'a faixa mostra a contagem que fechou a meta');
  checar(/Rodada/.test(textoMeta), 'e aponta a outra rodada para quem quiser medir mais');

  // A tela do posto nao pode ganhar rolagem por causa do aviso.
  checar(!(await p.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight)),
    'com a faixa da meta a tela continua sem rolagem no celular pequeno');

  // Dispensar tira o aviso do caminho sem encerrar nada.
  await faixaMeta.getByRole('button', { name: 'Dispensar aviso' }).click();
  checar(await faixaMeta.count() === 0, 'o × dispensa o aviso sem encerrar a coleta');
  checar(await p.evaluate(() => window.__saiu !== true), 'dispensar nao encerra');

  // Outra rodada: a meta volta a valer, e o aviso reaparece.
  await p.locator('button', { hasText: 'Rodada' }).click();
  await p.waitForTimeout(200);
  checar(await faixaMeta.count() === 1, 'nova rodada faz o aviso da meta valer de novo');

  await faixaMeta.getByRole('button', { name: 'Encerrar' }).click();
  checar(await p.evaluate(() => window.__saiu === true), 'o botao Encerrar da faixa encerra a coleta');
  await ctx.close();
}

/* -------------------------------------------------------------- layout */
for (const t of TELAS) {
  const ctx = await navegador.newContext({ viewport: { width: t.width, height: t.height }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(PAGINA);
  await p.locator('button[aria-label="Iniciar cronometragem"]').click();
  for (const ms of [800, 900, 850, 1500]) {
    await p.waitForTimeout(ms);
    await p.locator('button[aria-label="Registrar fim do ciclo"]').click();
  }
  await p.waitForTimeout(200);

  const m = await p.evaluate(() => {
    const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    return {
      rolagem: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      janela: window.innerHeight,
      chips: rect('[aria-label="Ultimos ciclos"]')?.bottom,
      barra: rect('[aria-label="Acoes da coleta"]')?.bottom,
      botao: rect('button[aria-label="Registrar fim do ciclo"]')?.height,
    };
  });

  checar(!m.rolagem, `${t.nome}: sem rolagem vertical`);
  checar(m.chips <= m.janela + 1, `${t.nome}: ultimos ciclos visiveis`);
  checar(m.barra <= m.janela + 1, `${t.nome}: barra de acoes visivel`);
  // Alvo minimo para uso com luva.
  checar(m.botao >= 260, `${t.nome}: botao de registro com ${Math.round(m.botao)}px`);
  await ctx.close();
}

await navegador.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
