/**
 * Toda tela precisa ter saida.
 *
 * Este teste existe porque uma regressao criou um beco sem saida: o botao de
 * voltar do detalhe do estudo saiu junto com uma refatoracao de navegacao, e
 * era possivel entrar no estudo e nao conseguir voltar. Nao quebra teste
 * nenhum, nao aparece no console — so' quem usa descobre.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/saidas.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });

const TELAS = [
  { nome: 'detalhe do estudo (coleta)', url: `${BASE}/test/e2e/harness-detalhe/index.html`, largura: 420, toque: true },
  { nome: 'painel de analise (PC)', url: `${BASE}/test/e2e/harness-analise/index.html`, largura: 1440, toque: false },
];

for (const tela of TELAS) {
  const ctx = await b.newContext({ viewport: { width: tela.largura, height: 800 }, hasTouch: tela.toque });
  const p = await ctx.newPage();
  await p.goto(tela.url);
  await p.waitForTimeout(1000);

  const saida = p.locator('[aria-label="Voltar para a lista de estudos"]');
  const existe = await saida.count() > 0;
  checar(existe, `${tela.nome}: tem saida para a lista`);

  if (existe) {
    const r = await saida.first().boundingBox();
    // Alvo confortavel: no celular o dedo, no PC o mouse.
    const minimo = tela.toque ? 32 : 30;
    checar(r && r.height >= minimo, `${tela.nome}: saida com ${Math.round(r?.height || 0)}px de altura`);
    checar(r && r.y < 120, `${tela.nome}: saida visivel sem rolar (topo em ${Math.round(r?.y || 0)}px)`);
  }
  await ctx.close();
}

/* A tela de coleta tem saida propria, com rotulo distinto. */
{
  const ctx = await b.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/test/e2e/harness/index.html`);
  await p.waitForTimeout(800);
  const volta = await p.locator('[aria-label="Voltar para a lista de operacoes"]').count();
  const encerra = await p.locator('button', { hasText: 'Encerrar' }).count();
  checar(volta > 0 || encerra > 0, 'coleta no posto: tem saida (voltar ou encerrar)');
  await ctx.close();
}

await b.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
