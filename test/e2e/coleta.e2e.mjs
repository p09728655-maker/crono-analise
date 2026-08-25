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
  await p.locator('button[aria-label="Iniciar cronometragem"]').click();

  const esperados = [900, 1200, 700];
  for (const ms of esperados) {
    await p.waitForTimeout(ms);
    await p.locator('button[aria-label="Registrar fim do ciclo"]').click();
  }
  await p.waitForTimeout(150);

  let ciclos = await p.evaluate(() => window.__registrados.map((r) => r.duracaoMs));
  checar(ciclos.length === 3, `registrou 3 ciclos (${ciclos.join(', ')} ms)`);

  /**
   * O que interessa aqui e' AUSENCIA DE DERIVA, nao exatidao absoluta.
   *
   * O clique do Playwright leva algumas dezenas de ms para ser despachado, e
   * essa latencia entra em toda medicao. Comparar contra o valor exato torna
   * o teste instavel sem dizer nada sobre o cronometro.
   *
   * A falha que importa e' deriva acumulada — o defeito classico de somar
   * setInterval em vez de comparar instantes. Se houvesse deriva, o desvio
   * cresceria a cada ciclo. Offset constante e' latencia; offset crescente
   * e' bug.
   */
  const desvios = ciclos.map((real, i) => real - esperados[i]);
  const espalhamento = Math.max(...desvios) - Math.min(...desvios);
  checar(espalhamento <= 90,
    `sem deriva acumulada: desvios ${desvios.map((d) => `${d > 0 ? '+' : ''}${Math.round(d)}`).join(', ')}ms, espalhamento ${Math.round(espalhamento)}ms`);
  checar(desvios.every((d) => d >= -20 && d <= 220),
    'nenhum ciclo fora da faixa de latencia esperada');

  // Repique de luva: dois toques colados valem um ciclo so'.
  const antes = ciclos.length;
  const botao = p.locator('button[aria-label="Registrar fim do ciclo"]');
  await p.waitForTimeout(600);
  await botao.click();
  await botao.click({ delay: 0 });
  await p.waitForTimeout(200);
  ciclos = await p.evaluate(() => window.__registrados.map((r) => r.duracaoMs));
  checar(ciclos.length - antes === 1, 'repique bloqueado: 2 toques viram 1 ciclo');

  const naFila = await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ritmoprod', 1);
    r.onsuccess = (e) => {
      const req = e.target.result.transaction('fila', 'readonly').objectStore('fila').count();
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(-1);
    };
    r.onerror = () => res(-1);
  }));
  checar(naFila === ciclos.length, `${naFila} ciclos gravados no IndexedDB antes de qualquer rede`);
  checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros.join(' ; ')}` : ''}`);
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
