/**
 * Conferencia rapida — horarios + cronometro ao vivo, sem cadastro.
 *
 * Roda contra o app REAL, com a API fora do ar DE PROPOSITO: a promessa da
 * tela e' funcionar sem servidor, entao o teste cobre exatamente isso —
 * o atalho aparece mesmo com a lista em erro, e os dois fluxos (horarios
 * digitados e cronometro ao vivo) fecham sem uma requisicao sequer.
 *
 * Cobre tambem as PARADAS do periodo — setup marcado no formulario e
 * parada cronometrada ao vivo —, porque e' delas que sai a diferenca entre
 * o ritmo da maquina e o que o posto entregou no turno.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/rapida.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

const ritmo = async () => parseInt((await p.locator('[aria-label="Ritmo do período"]').innerText()), 10);

/* ------------------------------------------ atalho independe do servidor */
await p.goto(`${BASE}/coleta`);
const atalho = p.getByRole('button', { name: /Conferência rápida/ });
await atalho.waitFor({ timeout: 8000 });
checar(true, 'atalho visivel na lista de coleta mesmo com a API fora');

await atalho.tap();
await p.waitForFunction(() => location.pathname === '/coleta/rapida', { timeout: 8000 });
checar(true, 'atalho leva para /coleta/rapida');

/* -------------------- caminho principal: hora inicial, hora final, pecas */
await p.locator('input[aria-label="Hora inicial"]').fill('07:00');
await p.locator('input[aria-label="Hora final"]').fill('07:10');
await p.locator('input[aria-label="Peças no período"]').fill('150');

const painelHoras = p.locator('[aria-label="Resultado dos horários"]');
await painelHoras.waitFor({ timeout: 4000 });
checar(await ritmo() === 900, 'exemplo real: 7:00 as 7:10 com 150 pecas da 900 pc/h');
const textoHoras = await painelHoras.innerText();
checar(textoHoras.includes('10 min'), 'periodo formatado como 10 min');
checar(textoHoras.includes('4.0'), 'ciclo medio 4.0 s/pc');

/* ------------------------------- salvar com maquina e nome da peca */
await p.locator('input[aria-label="Nome da máquina"]').fill('Furadeira 03');
await p.locator('input[aria-label="Nome da peça"]').fill('Lateral Mesa Sleep');
await p.getByRole('button', { name: 'SALVAR CONFERÊNCIA' }).tap();
await p.getByRole('button', { name: /SALVA NESTE APARELHO/ }).waitFor({ timeout: 4000 });
checar(true, 'salvar vira "salva" e trava contra toque duplo');

const salvas = p.locator('[aria-label="Conferências salvas neste aparelho"]');
let textoSalvas = await salvas.innerText();
checar(
  textoSalvas.includes('Furadeira 03') && textoSalvas.includes('Lateral Mesa Sleep') && textoSalvas.includes('900'),
  'conferencia salva aparece na lista com maquina, peca e ritmo',
);

/* ------------------------------ proxima peca na mesma maquina, emendada */
await p.getByRole('button', { name: /COMEÇAR OUTRA PEÇA/ }).tap();
checar(await p.locator('input[aria-label="Hora inicial"]').inputValue() === '07:10',
  'outra peca: hora inicial emenda na hora final da anterior');
checar(await p.locator('input[aria-label="Nome da peça"]').inputValue() === '',
  'outra peca: campo da peca limpa para a proxima');
checar(await p.locator('input[aria-label="Nome da máquina"]').inputValue() === 'Furadeira 03',
  'outra peca: maquina fica — trocar de peca nao e trocar de posto');

await p.reload();
await salvas.waitFor({ timeout: 8000 });
textoSalvas = await salvas.innerText();
checar(textoSalvas.includes('Lateral Mesa Sleep') && textoSalvas.includes('07:00–07:10'),
  'salva sobrevive ao recarregar, com os horarios');

// Virada de meia-noite: turno da noite tambem confere ritmo.
await p.locator('input[aria-label="Hora inicial"]').fill('23:50');
await p.locator('input[aria-label="Hora final"]').fill('00:10');
await p.locator('input[aria-label="Peças no período"]').fill('150');
checar(await ritmo() === 450, 'virada de meia-noite: 23:50 as 00:10 = 20 min -> 450 pc/h');

// Botao "Agora" carimba a hora da passada sem digitar.
await p.getByRole('button', { name: 'Agora' }).first().tap();
const agora = await p.locator('input[aria-label="Hora inicial"]').inputValue();
checar(/^\d{2}:\d{2}$/.test(agora), `"Agora" carimba a hora atual no campo (${agora})`);

/* ------------------------------------------ paradas dentro do periodo */
await p.locator('input[aria-label="Hora inicial"]').fill('07:00');
await p.locator('input[aria-label="Hora final"]').fill('07:30');
await p.locator('input[aria-label="Peças no período"]').fill('100');
checar(await ritmo() === 200, '30 min com 100 pecas dao 200 pc/h antes de marcar parada');

await p.getByRole('button', { name: '+ SETUP / TROCA' }).tap();
const minutosSetup = p.locator('input[aria-label="Minutos parada — Setup / Troca"]');
await minutosSetup.fill('10');
checar(await ritmo() === 300, 'setup de 10 min: sobram 20 min rodando -> 300 pc/h');

const comParada = await painelHoras.innerText();
checar(/rodando/i.test(comParada), 'a tela diz que o numero grande e o da maquina rodando');
checar(comParada.includes('200'), 'o ritmo do periodo inteiro continua visivel ao lado');
checar(comParada.includes('10 min'), 'o tempo parado aparece no resultado');

// Parada maior que o periodo: avisa, nao some com a conta nem divide por zero.
await minutosSetup.fill('40');
await painelHoras.waitFor({ state: 'detached', timeout: 4000 });
checar(true, 'parada maior que o periodo troca o resultado por um aviso');

await minutosSetup.fill('10');
await painelHoras.waitFor({ timeout: 4000 });
await p.getByRole('button', { name: 'Remover parada Setup / Troca' }).tap();
checar(await ritmo() === 200, 'remover a parada devolve o ritmo do periodo inteiro');

/* ------------------------------------------- alternativa: cronometro vivo */
await p.getByRole('button', { name: /CRONOMETRAR AO VIVO/ }).tap();
await p.waitForTimeout(1000);

const contar = p.locator('[aria-label="Contar uma peça"]');
for (let i = 0; i < 3; i++) {
  await contar.tap();
  // Guarda de repique recusa toques com menos de 200ms de intervalo.
  await p.waitForTimeout(260);
}
checar((await contar.innerText()).includes('3'), 'tres toques contam tres pecas');

// Repique: dois pointerdown SINCRONOS — impossivel passar 200ms entre eles.
// Tap duplo via automatizador tem latencia variavel e deixaria o teste
// intermitente justo no que ele quer provar.
await p.evaluate(() => {
  const botao = document.querySelector('[aria-label="Contar uma peça"]');
  const toque = () => new PointerEvent('pointerdown', { bubbles: true });
  botao.dispatchEvent(toque()); // conta: ja se passaram 260ms do anterior
  botao.dispatchEvent(toque()); // repique imediato — nao pode contar
});
await p.waitForTimeout(100);
checar((await contar.innerText()).includes('4'), 'toque em repique (<200ms) nao conta peca');

// Cronometrando, nada pode rolar: o analista esta de maos ocupadas.
checar(await p.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
  'ao vivo tudo cabe na viewport do celular, sem rolagem');

/* ---------------------------------- parada cronometrada durante o ao vivo */
await p.getByRole('button', { name: 'Parou' }).tap();
await p.locator('[aria-label="Por que a máquina parou"]').waitFor({ timeout: 4000 });
await p.getByRole('button', { name: 'Setup / Troca' }).tap();

const paradaViva = p.locator('[aria-label="Encerrar a parada e voltar a produzir"]');
await paradaViva.waitFor({ timeout: 4000 });
checar(true, 'escolher o motivo comeca a parada e a tela vira o botao de voltar');
checar(await contar.count() === 0, 'maquina parada nao oferece contar peca');

await p.waitForTimeout(1200);
await paradaViva.tap();
await contar.waitFor({ timeout: 4000 });
checar((await contar.innerText()).includes('4'), 'voltar a produzir devolve a contagem intacta');

await p.getByRole('button', { name: /Encerrar/ }).tap();
const inputPecas = p.locator('input[aria-label="Peças no período"]');
await inputPecas.waitFor({ timeout: 4000 });
checar(await inputPecas.inputValue() === '4', 'resultado abre com as pecas contadas');

const ritmoContado = await ritmo();
checar(ritmoContado > 0, `ritmo calculado na hora (${ritmoContado} pc/h)`);

const painelResultado = p.locator('[aria-label="Resultado da conferência"]');
checar((await painelResultado.innerText()).includes('Setup / Troca'),
  'a parada cronometrada ao vivo chega ao resultado, com o motivo escolhido');

/* --------------------------- quem leu o contador da maquina digita o total */
await inputPecas.fill('150');
const ritmoEditado = await ritmo();
checar(ritmoEditado > ritmoContado, `editar as pecas recalcula o ritmo (${ritmoEditado} pc/h)`);
// Mesmo periodo, so' mudou a quantidade: a proporcao tem de ser 150/4.
checar(Math.abs(ritmoEditado / ritmoContado - 150 / 4) < 0.5, 'ritmo proporcional a quantidade digitada');

/* ------------------------------- salvar tambem no resultado do cronometro */
await p.locator('input[aria-label="Nome da peça"]').fill('Porta Ripada');
await p.getByRole('button', { name: 'SALVAR CONFERÊNCIA' }).tap();
await p.getByRole('button', { name: /SALVA NESTE APARELHO/ }).waitFor({ timeout: 4000 });

/* ----------------------------------------------------------- reinicio */
await p.getByRole('button', { name: /Nova conferência/ }).tap();
await p.getByRole('button', { name: /CRONOMETRAR AO VIVO/ }).waitFor({ timeout: 4000 });
checar(true, 'nova conferencia volta ao inicio');

textoSalvas = await salvas.innerText();
checar(textoSalvas.indexOf('Porta Ripada') < textoSalvas.indexOf('Lateral Mesa Sleep'),
  'cronometro tambem salva, e a mais recente fica no topo');

/* ------------------------------------------------------------- remover */
await p.getByRole('button', { name: 'Remover conferência Porta Ripada' }).tap();
textoSalvas = await salvas.innerText();
checar(!textoSalvas.includes('Porta Ripada') && textoSalvas.includes('Lateral Mesa Sleep'),
  'remover tira so a conferencia escolhida');

await p.reload();
await salvas.waitFor({ timeout: 8000 });
checar(!(await salvas.innerText()).includes('Porta Ripada'), 'remocao tambem sobrevive ao recarregar');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
