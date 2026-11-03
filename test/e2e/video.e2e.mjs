/**
 * CRONOMETRAR POR VIDEO (v2.99.0) — do arquivo de video a' medicao na
 * Embalagem Takt Time.
 *
 * O servidor e' simulado; o video e' de verdade (test/fixtures/
 * embalagem-120s.webm, 2 min, gerado com ffmpeg). O que se prova: a data
 * da filmagem decide o takt; as teclas marcam pelo TEMPO DO VIDEO (o teste
 * leva o video a cada ponto e aperta a tecla); a parada sai das marcas
 * seguintes como no tablet; o que o tablet nao deixa fazer e' recusado com
 * o porque; a medicao que sobe e' a do tablet com origem 'video'; a
 * marcacao sobrevive ao F5; e video que o navegador nao abre diz por que.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/video.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;
const VIDEO = fileURLToPath(new URL('../fixtures/embalagem-120s.webm', import.meta.url));
// WebM sem a duracao no cabecalho (gravado com -live 1), como sai de gravador de tela.
const SEM_DURACAO = fileURLToPath(new URL('../fixtures/sem-duracao-30s.webm', import.meta.url));
const FUSO = 'America/Sao_Paulo';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const GRUPO = {
  id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM',
  horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5,
};
const MAQUINA = { id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true, grupo_id: GRUPO.id };
const CADASTRO = {
  maquinas: [MAQUINA], grupos: [GRUPO],
  produtos: [{ id: 'p1', nome: 'Rack Sirius 1.6', codigo: null, grupo_id: GRUPO.id, ativo: true }],
};
const MOTIVOS = [
  { id: 'm1', codigo: 'setup', rotulo: 'Setup / Troca', acao: null, ordem: 0, ativo: true, grupos: [] },
  { id: 'm2', codigo: 'falta_de_caixa', rotulo: 'Falta de caixa', acao: null, ordem: 1, ativo: true, grupos: [GRUPO.id] },
];
// A semana de HOJE em Sao Paulo: 2.200 volumes em 44 h -> takt 72,0 s.
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(hoje).split('-').map(Number);
const segunda = new Date(Date.UTC(anoSp, mesSp - 1, diaSp));
segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
const DEMANDAS = [{
  ano: segunda.getUTCFullYear(), numero: 1, pecas: 2200, inicio: segunda.toISOString().slice(0, 10),
  atualizado_em: hoje.toISOString(),
}];
const dois = (n) => String(n).padStart(2, '0');
// Sem segundos: e' o formato que o campo aceita digitado (com 00 s o navegador omite).
const HOJE_8H = `${anoSp}-${dois(mesSp)}-${dois(diaSp)}T08:00`;

/**
 * O /sync simulado faz o que o de verdade faz: o client_id ja' visto e'
 * IGNORADO (ON CONFLICT) e a resposta diz quantos eram novos. `falha`:
 * 'recusa' (400, nada grava) ou 'perdida' (grava, mas a resposta e' 504).
 */
async function simularServidor(pagina, {
  enviados, conferencias = [], recusarSync = false, cadastro = CADASTRO, falha = null,
}) {
  const vistos = new Set();
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas: DEMANDAS } })
    : rota.fulfill({ json: cadastro })));
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: MOTIVOS } }));
  await pagina.route('**/api/conferencias**', (rota) => rota.fulfill({ json: { conferencias, outras: 0 } }));
  await pagina.route('**/api/sync**', (rota) => {
    const corpo = rota.request().postDataJSON();
    enviados.push(...(corpo.conferencias || []));
    if (recusarSync || falha?.proxima === 'recusa') {
      if (falha) falha.proxima = null;
      return rota.fulfill({ status: 400, json: { erro: 'Campo "conferencias[0].peca" invalido' } });
    }
    const clientIds = (corpo.conferencias || []).map((c) => c.clientId);
    const novos = clientIds.filter((id) => !vistos.has(id)).length;
    clientIds.forEach((id) => vistos.add(id));
    if (falha?.proxima === 'perdida') {
      falha.proxima = null;
      return rota.fulfill({ status: 504, body: 'An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT' });
    }
    return rota.fulfill({ json: { recebidos: clientIds.length, novos, clientIds } });
  });
}

/** Leva o video a `s` segundos e espera ele chegar la'. */
async function irPara(p, s) {
  await p.evaluate(async (seg) => {
    const v = document.querySelector('video');
    if (Math.abs(v.currentTime - seg) < 0.01) return;
    const chegou = new Promise((r) => { v.addEventListener('seeked', r, { once: true }); });
    v.currentTime = seg;
    await chegou;
  }, s);
}
/** Leva o video ao ponto e aperta a tecla — como o analista, que pausa e marca. */
async function teclaEm(p, s, tecla) {
  await irPara(p, s);
  await p.keyboard.press(tecla);
}

const navegador = await chromium.launch({ executablePath: EXEC });
const erros = [];
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: FUSO });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => erros.push(e.message));
const enviados = [];
await simularServidor(p, {
  enviados,
  conferencias: [{
    id: '00000000-0000-0000-0000-00000000c0b1', maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6', origem: 'video',
    iniciado_em: new Date(Date.now() - 3600000).toISOString(), finalizado_em: new Date().toISOString(),
    duracao_ms: 300000, pecas: 4, com_marcas: true, paradas: [], observacao: '', arquivada: false,
    salvo_em: new Date().toISOString(),
  }],
});

/* ---------------------- a entrada: Embalagem Takt Time -> por video */
await p.goto(`${BASE}/analise/embalagem`);
const tabela = p.locator('[aria-label="Medições da embalagem"]');
await tabela.locator('table').waitFor({ timeout: 8000 });
checar(await tabela.getByText('por vídeo').count() === 1, 'PC: a medicao feita por video tem o selo "por vídeo" na lista');
await p.getByRole('button', { name: 'Cronometrar por vídeo' }).click();
await p.waitForFunction(() => location.pathname === '/analise/embalagem/video', { timeout: 8000 });
checar(true, '"Cronometrar por vídeo" leva a /analise/embalagem/video');

/* ---------------------------------------------------------- preparar */
const preparar = p.getByRole('region', { name: 'Preparar a medição por vídeo' });
await preparar.waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Começar a marcar' }).isDisabled(), 'sem video, nao da para comecar');
await p.locator('input[type="file"]').setInputFiles(VIDEO);
await preparar.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
const inicio = p.locator('input[aria-label="Data e hora em que a filmagem começou"]');
checar(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(await inicio.inputValue()),
  `o inicio da filmagem vem sugerido pelo arquivo (${await inicio.inputValue()})`);
await inicio.fill(HOJE_8H);
await preparar.getByText(/72\.0 s por volume/).waitFor({ timeout: 4000 });
checar(true, 'a data da filmagem decide o takt: 72.0 s por volume, o da semana');
await p.locator('select[aria-label="Produto embalado"]').selectOption('Rack Sirius 1.6');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-preparar.png` });
await p.getByRole('button', { name: 'Começar a marcar' }).click();
await p.getByRole('region', { name: 'Marcas da medição' }).or(p.locator('[aria-label="Marcas da medição"]')).first().waitFor({ timeout: 4000 });

/* ------------------------------------------------------------- marcar */
const marcas = p.locator('[aria-label="Marcas da medição"]');
const aviso = p.getByRole('alert');
await p.evaluate(() => document.activeElement?.blur());
await teclaEm(p, 10, 'Enter'); // largada
checar(/Largada \(não conta volume\)/.test(await marcas.innerText()), 'Enter a 1a vez: a largada, que nao conta volume');
await teclaEm(p, 5, 'Enter');
checar(/Antes da largada \(0:10.0\)/.test(await aviso.innerText()), 'volume antes da largada: recusado, com o ponto da largada');
for (const s of [20, 30, 40]) await teclaEm(p, s, 'Enter');
await teclaEm(p, 45, 'p');
const janela = p.getByRole('dialog', { name: 'Por que a linha parou' });
await janela.waitFor({ timeout: 4000 });
checar(/Parou em 0:45.0/.test(await janela.innerText()), 'P: pergunta o motivo, no ponto do video');
await janela.getByRole('button', { name: 'Falta de caixa' }).click();
await teclaEm(p, 50, 'Enter');
checar(/linha está parada/.test(await aviso.innerText()), 'volume com a linha parada: recusado, como no tablet');
await teclaEm(p, 60, 'p'); // Voltou
for (const s of [70, 80, 90, 100, 110]) await teclaEm(p, s, 'Enter');
// Voltando o video: volume marcado fora de ordem entra no lugar dele...
await teclaEm(p, 35, 'Enter');
{
  const lista = await marcas.innerText();
  const ordem = ['0:30.0', '0:35.0', '0:40.0'].map((t) => lista.indexOf(t));
  checar(ordem.every((i) => i >= 0) && ordem[0] < ordem[1] && ordem[1] < ordem[2] && /0:35.0\s*Volume 3/.test(lista),
    'volume marcado voltando o video entra na ordem do video (vira o volume 3)');
}
// ... e o Desfazer tira o ULTIMO MARCADO, nao o ultimo no video.
await p.keyboard.press('Backspace');
checar(!(await marcas.innerText()).includes('0:35.0') && (await marcas.innerText()).includes('1:50.0'),
  'Desfazer tira o ultimo marcado (o de 0:35), nao o ultimo no video');
await teclaEm(p, 52, 'Enter');
checar(/dentro de uma parada \(0:45.0 a 1:00.0\)/.test(await aviso.innerText()), 'volume dentro de parada ja fechada: recusado');
// ⌫ e Enter SEGURADOS (repeticao do teclado) nao fazem nada a mais.
await p.evaluate(() => {
  for (const key of ['Backspace', 'Backspace', 'Enter']) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true, bubbles: true }));
  }
});
checar(/VOLUMES 8/i.test((await marcas.innerText()).replace(/\s+/g, ' ')), 'tecla segurada: a repeticao nao apaga nem marca volume');
const numeros = (await marcas.innerText()).replace(/\s+/g, ' ');
checar(/VOLUMES 8/i.test(numeros) && /POR VOLUME 12.9 s/i.test(numeros) && /PARADO 15 s/i.test(numeros),
  `os numeros enquanto marca: 8 volumes, 12.9 s por volume (90 s / 7), 15 s parado (${numeros.slice(0, 160)})`);
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-marcar.png` });

/* --------------------------------------- o F5 nao leva a marcacao */
await p.reload();
await preparar.waitFor({ timeout: 8000 });
await p.locator('input[type="file"]').setInputFiles(VIDEO);
const continuar = p.getByRole('button', { name: 'Continuar de onde parou' });
await continuar.waitFor({ timeout: 8000 });
checar(/marcação em andamento deste vídeo \(8 volumes/.test(await preparar.innerText()), 'F5: o PC guardou a marcacao (8 volumes)');
await p.waitForFunction(() => !document.querySelector('button[disabled]')?.innerText.includes('Continuar'), { timeout: 8000 });
await continuar.click();
await marcas.waitFor({ timeout: 4000 });
checar(/VOLUMES 8/i.test((await marcas.innerText()).replace(/\s+/g, ' ')), 'continuar: as 8 marcas voltam');
await p.evaluate(() => document.activeElement?.blur());

/* ---------------------------------------------------- encerrar, salvar */
await teclaEm(p, 115, 'f');
const revisar = p.locator('[aria-label="Revisar a medição"]');
await revisar.waitFor({ timeout: 4000 });
const resumo = (await revisar.innerText()).replace(/\s+/g, ' ');
checar(/Rack Sirius 1\.6 · EMBALAGEM 01/.test(resumo) && /por vídeo/.test(resumo), 'revisar: produto, maquina e "por vídeo"');
checar(/08:00:10–08:01:55/.test(resumo), `revisar: o periodo e o da filmagem, da largada ao Encerrar (${resumo.slice(0, 120)})`);
checar(await revisar.locator('svg[aria-label^="Intervalo entre"]').count() === 1, 'revisar: o grafico do volume a volume, antes de salvar');
await revisar.locator('textarea').fill('Faltou caixa às 8h');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-revisar.png`, fullPage: true });
await revisar.getByRole('button', { name: 'Salvar medição' }).click();
await p.getByText(/Medição salva: 8 volumes de Rack Sirius 1\.6/).waitFor({ timeout: 4000 });
const c = enviados.at(-1);
checar(c?.origem === 'video' && /^[0-9a-f-]{36}$/.test(c?.clientId || ''), 'sobe pelo sync com origem "video" e um client_id');
checar(JSON.stringify(c?.marcasMs) === JSON.stringify([10000, 20000, 30000, 45000, 55000, 65000, 75000, 85000]),
  `marcas no relogio da linha rodando: a parada de 15 s sai das seguintes (${JSON.stringify(c?.marcasMs)})`);
checar(c?.duracaoMs === 105000 && c?.pecas === 8 && c?.marcasRelogioMs === 90000 && c?.marcasSetupMs === 0,
  'periodo de 105 s, 8 volumes, 90 s entre o 1o e o ultimo, sem setup');
checar(JSON.stringify(c?.paradas) === JSON.stringify([{ motivo: 'falta_de_caixa', duracaoMs: 15000 }]), 'a parada vai com motivo e duracao');
const fimEsperado = new Date(`${HOJE_8H}:00-03:00`).getTime() + 115000;
checar(new Date(c?.salvoEm).getTime() === fimEsperado, `salvoEm = inicio da filmagem + Encerrar (${c?.salvoEm})`);
checar(c?.peca === 'Rack Sirius 1.6' && c?.maquina === 'EMBALAGEM 01' && c?.observacao === 'Faltou caixa às 8h',
  'produto, maquina e observacao');
// Salva, o rascunho some: escolher o video de novo nao oferece continuar.
await p.getByRole('button', { name: 'Marcar outro vídeo' }).click();
await p.locator('input[type="file"]').setInputFiles(VIDEO);
await preparar.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Continuar de onde parou' }).count() === 0, 'salva a medicao, o rascunho some');
checar(/Este vídeo já foi salvo neste PC em .* \(8 volumes\)\. Salvar de novo cria outra medição/.test(await preparar.innerText()),
  'o mesmo video de novo: avisa que ja foi salvo e que salvar duplica');
// Outro arquivo: o inicio sugerido e' o DELE, nao o do anterior.
const inicioAntes = await inicio.inputValue();
const { readFileSync } = await import('node:fs');
await p.locator('input[type="file"]').setInputFiles({ name: 'outro.webm', mimeType: 'video/webm', buffer: readFileSync(VIDEO) });
await p.waitForFunction((antes) => {
  const v = document.querySelector('input[aria-label="Data e hora em que a filmagem começou"]').value;
  return v && v !== antes;
}, inicioAntes, { timeout: 8000 });
checar((await inicio.inputValue()) !== inicioAntes, `trocar o arquivo troca o inicio sugerido (${inicioAntes} -> ${await inicio.inputValue()})`);
await ctx.close();

/* ------------------------------------------- recusa do servidor e video ruim */
{
  const c2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const q = await c2.newPage();
  await semearSessao(q);
  q.on('pageerror', (e) => erros.push(e.message));
  const env2 = [];
  await simularServidor(q, { enviados: env2, recusarSync: true });
  await q.goto(`${BASE}/analise/embalagem/video`);
  await q.locator('input[type="file"]').setInputFiles({ name: 'filmagem.mp4', mimeType: 'video/mp4', buffer: Buffer.from('isto nao e video') });
  await q.getByText(/não abre no navegador/).waitFor({ timeout: 8000 });
  checar(/HEVC/.test(await q.getByRole('alert').first().innerText()) && await q.getByRole('button', { name: 'Começar a marcar' }).isDisabled(),
    'video que nao abre: diz por que (HEVC) e como regravar, e nao deixa comecar');
  await q.locator('input[type="file"]').setInputFiles(VIDEO);
  await q.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  // Filmagem antiga: avisa antes que nao vai aparecer na lista de 30 dias.
  const antiga = new Date(Date.now() - 40 * 86400000);
  await q.locator('input[aria-label="Data e hora em que a filmagem começou"]')
    .fill(`${antiga.getFullYear()}-${dois(antiga.getMonth() + 1)}-${dois(antiga.getDate())}T08:00`);
  checar(/Filmagem de mais de 30 dias atrás: salva, ela não aparece na lista/.test(await q.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
    'filmagem de mais de 30 dias: avisa que nao vai aparecer na lista da Embalagem');
  await q.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
  await q.getByRole('button', { name: 'Começar a marcar' }).click();
  await q.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await q.evaluate(() => document.activeElement?.blur());
  for (const s of [2, 4, 6]) await teclaEm(q, s, 'Enter');
  await teclaEm(q, 7, 'p');
  await q.getByRole('dialog', { name: 'Por que a linha parou' }).getByRole('button', { name: 'Setup / Troca' }).click();
  // Encerrar com a parada aberta: fecha a parada ali, como o tablet.
  await teclaEm(q, 8, 'f');
  const rev = q.locator('[aria-label="Revisar a medição"]');
  await rev.waitFor({ timeout: 4000 });
  checar(/PARADO \(MARCADO\)\s*1 s/i.test(await rev.innerText()), 'Encerrar com a parada aberta: fecha a parada no Encerrar, como o tablet (1 s)');
  checar(/da largada ao Encerrar, paradas dentro/.test(await rev.innerText()), 'revisar: o volumes/hora diz de que tempo sai');
  // Voltar a marcar continua de onde parou: o video nao recomeca do zero.
  await rev.getByRole('button', { name: 'Voltar a marcar' }).click();
  await q.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  checar(/^0:08\.0/.test(await q.locator('[aria-label="Tempo do vídeo"]').innerText()),
    `voltar a marcar: o video continua no ponto do Encerrar (${await q.locator('[aria-label="Tempo do vídeo"]').innerText()})`);
  await q.evaluate(() => document.activeElement?.blur());
  await teclaEm(q, 10, 'f');
  await rev.waitFor({ timeout: 4000 });
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  await rev.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/Não salvou: Campo "conferencias\[0\]\.peca" invalido$/.test(await rev.getByRole('alert').innerText())
    && await rev.getByRole('button', { name: 'Salvar medição' }).isEnabled(),
  'servidor recusou: o motivo aparece na revisao, e da para tentar de novo');
  await c2.close();
}

/* ---- a resposta se perdeu: o reenvio corrigido nao finge que gravou ---- */
{
  const c3 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const r = await c3.newPage();
  await semearSessao(r);
  r.on('pageerror', (e) => erros.push(e.message));
  const env3 = [];
  const falha = { proxima: 'perdida' };
  await simularServidor(r, { enviados: env3, falha });
  await r.goto(`${BASE}/analise/embalagem/video`);
  await r.locator('input[type="file"]').setInputFiles(VIDEO);
  await r.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  await r.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
  await r.getByRole('button', { name: 'Começar a marcar' }).click();
  await r.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await r.evaluate(() => document.activeElement?.blur());
  for (const s of [2, 4, 6, 8]) await teclaEm(r, s, 'Enter');
  await teclaEm(r, 9, 'f');
  const rev = r.locator('[aria-label="Revisar a medição"]');
  await rev.waitFor({ timeout: 4000 });
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  await rev.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/pode ter chegado ao servidor: tente salvar de novo antes de mudar/.test(await rev.getByRole('alert').innerText()),
    'resposta perdida (504): avisa que pode ter gravado e pede para salvar de novo antes de mudar');
  // O analista corrige mesmo assim: tira um volume e salva.
  await rev.getByRole('button', { name: 'Voltar a marcar' }).click();
  await r.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await r.evaluate(() => document.activeElement?.blur());
  await r.keyboard.press('Backspace');
  await teclaEm(r, 9, 'f');
  await rev.waitFor({ timeout: 4000 });
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  const tela = r.locator('[aria-label="Medição salva"]');
  await tela.waitFor({ timeout: 4000 });
  checar(/já estava no servidor/.test(await tela.innerText()) && /não entrou/.test(await tela.innerText()) && !/✓ Medição salva/.test(await tela.innerText()),
    'reenvio corrigido com o mesmo client_id: diz que a versao anterior e que esta no servidor, nao "salva"');
  await tela.getByRole('button', { name: 'Salvar esta versão como medição nova' }).click();
  // Largada em 2 s e volumes em 4, 6 e 8: 3 volumes; o Desfazer deixou 2.
  await tela.getByText(/✓ Medição salva: 2 volumes/).waitFor({ timeout: 4000 });
  checar(env3[0].pecas === 3 && env3.at(-1).clientId !== env3[0].clientId && env3.at(-1).pecas === 2,
    'salvar como nova: outro client_id, com a versao corrigida (2 volumes, era 3)');
  await c3.close();
}

/* ------- rascunho de maquina que saiu do cadastro; video sem duracao ------- */
{
  const c4 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const u = await c4.newPage();
  await semearSessao(u);
  u.on('pageerror', (e) => erros.push(e.message));
  const env4 = [];
  await simularServidor(u, { enviados: env4 });
  await u.goto(`${BASE}/analise/embalagem/video`);
  await u.locator('input[type="file"]').setInputFiles(VIDEO);
  await u.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  await u.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
  await u.getByRole('button', { name: 'Começar a marcar' }).click();
  await u.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await u.evaluate(() => document.activeElement?.blur());
  for (const s of [2, 4, 6]) await teclaEm(u, s, 'Enter');
  // A EMBALAGEM 01 sai do cadastro; entra a 02. F5 e continuar.
  await u.unrouteAll({ behavior: 'ignoreErrors' });
  await simularServidor(u, {
    enviados: env4,
    cadastro: { ...CADASTRO, maquinas: [{ ...MAQUINA, ativa: false }, { ...MAQUINA, id: '00000000-0000-0000-0000-0000000000a2', nome: 'EMBALAGEM 02' }] },
  });
  await u.reload();
  await u.locator('input[type="file"]').setInputFiles(VIDEO);
  const continuar = u.getByRole('button', { name: 'Continuar de onde parou' });
  await continuar.waitFor({ timeout: 8000 });
  checar(/Continuar usa o que foi guardado com ela: EMBALAGEM 01/.test(await u.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
    'o aviso do rascunho diz com que maquina, produto e inicio ele continua');
  await u.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Continuar de onde') && !b.disabled), { timeout: 8000 });
  await continuar.click();
  const alerta = u.getByRole('alert').filter({ hasText: /não está mais ativa/ });
  await alerta.waitFor({ timeout: 4000 });
  checar(/EMBALAGEM 01/.test(await alerta.innerText()) && await u.getByRole('button', { name: 'Continuar a marcação' }).isDisabled(),
    'maquina do rascunho fora do cadastro: diz qual e pede outra, sem trocar calado');
  await u.locator('select[aria-label="Máquina da embalagem"]').selectOption({ label: 'EMBALAGEM 02' });
  await u.getByRole('button', { name: 'Continuar a marcação' }).click();
  await u.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  // Largada em 2 s, volumes em 4 e 6.
  checar(/VOLUMES 2/i.test((await u.locator('[aria-label="Marcas da medição"]').innerText()).replace(/\s+/g, ' ')),
    'escolhida a maquina, as marcas guardadas continuam (largada e 2 volumes)');
  await u.evaluate(() => document.activeElement?.blur());
  await teclaEm(u, 8, 'f');
  await u.locator('[aria-label="Revisar a medição"]').getByRole('button', { name: 'Salvar medição' }).click();
  await u.getByText(/✓ Medição salva: 2 volumes/).waitFor({ timeout: 4000 });
  checar(env4.at(-1).maquina === 'EMBALAGEM 02', 'salva com a maquina escolhida');

  // Video sem duracao (WebM de gravador de tela): marca-se igual.
  await u.getByRole('button', { name: 'Marcar outro vídeo' }).click();
  await u.locator('input[type="file"]').setInputFiles(SEM_DURACAO);
  await u.getByText(/não informa a duração/).waitFor({ timeout: 8000 });
  const inicioU = u.locator('input[aria-label="Data e hora em que a filmagem começou"]');
  checar(await inicioU.inputValue() === '', 'sem duracao: sem sugestao de inicio (o campo pede)');
  await inicioU.fill(HOJE_8H);
  checar(await u.getByRole('button', { name: 'Começar a marcar' }).isEnabled(), 'sem duracao: da para comecar');
  await u.getByRole('button', { name: 'Começar a marcar' }).click();
  await u.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  checar(await u.locator('input[aria-label="Posição no vídeo"]').count() === 0, 'sem duracao: sem a barra de posicao');
  await c4.close();
}

/* ---- setup: a previa usa o MESMO criterio da lista (o do takt), nao so' o cadastro ---- */
{
  /* Grupo com setup no cadastro (1 por dia, 30 min) mas sem os dias de
     producao: o takt nao sai e o setup NAO e' planejado — a lista e o volume
     a volume nao descontam o setup do trecho. A previa descontava (60 s,
     "dentro do takt") e a lista mostrava 120 s (revisao de 30/10). */
  const c5 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const w = await c5.newPage();
  await semearSessao(w);
  w.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(w, {
    enviados: [],
    cadastro: { ...CADASTRO, grupos: [{ ...GRUPO, setups_dia: 1, setup_min: '30', dias_semana: null }] },
  });
  await w.goto(`${BASE}/analise/embalagem/video`);
  await w.locator('input[type="file"]').setInputFiles(VIDEO);
  await w.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  await w.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
  await w.getByRole('button', { name: 'Começar a marcar' }).click();
  await w.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await w.evaluate(() => document.activeElement?.blur());
  for (const sg of [1, 20, 40]) await teclaEm(w, sg, 'Enter');
  await teclaEm(w, 50, 'p');
  await w.getByRole('dialog', { name: 'Por que a linha parou' }).getByRole('button', { name: 'Setup / Troca' }).click();
  await teclaEm(w, 90, 'p');
  await teclaEm(w, 100, 'Enter');
  const painel = (await w.locator('[aria-label="Marcas da medição"]').innerText()).replace(/\s+/g, ' ');
  // (100 - 20) / 2 = 40.0 s com o setup dentro; descontando os 40 s de setup daria 20.0 s.
  checar(/POR VOLUME 40\.0 s/i.test(painel), `setup sem planejamento no takt: a previa nao desconta o setup (${painel.slice(0, 60)})`);
  await c5.close();
}

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
