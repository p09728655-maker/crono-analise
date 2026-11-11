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
/* O tempo-alvo do painel (v2.106.0): o Rack com 10,0 s (0,40 UEP × 25 s),
   bem abaixo do que o video mede (12,9 s), para o "▲ alvo" aparecer.
   Quem nao escolhe produto (o teste do setup) fica sem alvo, como antes. */
const ALVOS = {
  estado: 'ok',
  ref: { metaUep: 2761, setupDia: 0, minDia: 527, minProd: 527, sUep: 25 },
  produtos: [{ rot: 'Rack Sirius 1.6', uep: 0.4, alvoMs: 10000 }],
};
const dois = (n) => String(n).padStart(2, '0');
// Sem segundos: e' o formato que o campo aceita digitado (com 00 s o navegador omite).
const HOJE_8H = `${anoSp}-${dois(mesSp)}-${dois(diaSp)}T08:00`;

/**
 * O /sync simulado faz o que o de verdade faz: a medicao POR VIDEO com um
 * client_id ja' visto SUBSTITUI a anterior (v2.99.2) e a resposta diz
 * quantas eram novas e quantas foram substituidas. `banco` guarda o que
 * ficou, por client_id. `falha`: 'recusa' (400, nada grava), 'perdida'
 * (grava, mas a resposta e' 504) ou 'mexida' (409: a que chegou antes foi
 * mexida no PC). `arquivadas` recebe o id de cada PATCH de arquivar.
 */
const MEXIDA_ID = '00000000-0000-0000-0000-00000000c0b9';
async function simularServidor(pagina, {
  enviados, conferencias = [], recusarSync = false, cadastro = CADASTRO, falha = null, banco = new Map(), arquivadas = [],
}) {
  await pagina.route('**/api/maquinas**', (rota) => {
    const url = rota.request().url();
    if (/[?&]alvo=1/.test(url)) return rota.fulfill({ json: ALVOS });
    return /demanda=1/.test(url)
      ? rota.fulfill({ json: { demandas: DEMANDAS } })
      : rota.fulfill({ json: cadastro });
  });
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: MOTIVOS } }));
  await pagina.route('**/api/conferencias**', (rota) => {
    if (rota.request().method() === 'PATCH') {
      const id = new URL(rota.request().url()).searchParams.get('id');
      if (rota.request().postDataJSON()?.arquivada === true) arquivadas.push(id);
      return rota.fulfill({ json: { conferencia: { id, arquivada: true } } });
    }
    return rota.fulfill({ json: { conferencias, outras: 0 } });
  });
  await pagina.route('**/api/sync**', (rota) => {
    const corpo = rota.request().postDataJSON();
    enviados.push(...(corpo.conferencias || []));
    if (falha?.proxima === 'mexida') {
      falha.proxima = null;
      return rota.fulfill({
        status: 409,
        json: {
          erro: 'Esta medição já chegou ao sistema numa tentativa anterior e foi mexida no PC depois (produto, paradas, análise ou arquivo), então salvar de novo não a substitui',
          detalhes: { motivo: 'mexida-no-pc', conferenciaId: MEXIDA_ID },
        },
      });
    }
    if (recusarSync || falha?.proxima === 'recusa') {
      if (falha) falha.proxima = null;
      return rota.fulfill({ status: 400, json: { erro: 'Campo "conferencias[0].peca" invalido' } });
    }
    const lote = corpo.conferencias || [];
    const clientIds = lote.map((c) => c.clientId);
    let novos = 0;
    let atualizados = 0;
    for (const c of lote) {
      if (!banco.has(c.clientId)) { novos += 1; banco.set(c.clientId, c); } else if (c.origem === 'video') { atualizados += 1; banco.set(c.clientId, c); }
    }
    if (falha?.proxima === 'perdida') {
      falha.proxima = null;
      return rota.fulfill({ status: 504, body: 'An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT' });
    }
    return rota.fulfill({ json: { recebidos: clientIds.length, novos, atualizados, clientIds } });
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
await preparar.getByText(/Tempo-alvo do produto: 10\.0 s por volume/).waitFor({ timeout: 4000 });
checar(/Tempo-alvo = 0,40 UEP × 25,00 s por UEP = 10,0 s por volume\. Os 25,00 s por UEP: \(527 min de jornada\) × 60 ÷ 2\.761 UEP por dia/
  .test((await preparar.innerText()).replace(/\s+/g, ' ')), 'preparar: o tempo-alvo do produto e a conta dele por extenso');
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
// ⌫ e Enter SEGURADOS (repeticao do teclado) nao fazem nada a mais — num
// ponto LIVRE do video: dentro da parada o Enter ja' seria recusado por ela.
await irPara(p, 112);
await p.evaluate(() => {
  for (const key of ['Backspace', 'Backspace', 'Enter']) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true, bubbles: true }));
  }
});
checar(/VOLUMES 8/i.test((await marcas.innerText()).replace(/\s+/g, ' ')), 'tecla segurada: a repeticao nao apaga nem marca volume');
const numeros = (await marcas.innerText()).replace(/\s+/g, ' ');
checar(/VOLUMES 8/i.test(numeros) && /POR VOL ▲ ALVO 12.9 s/i.test(numeros) && /TEMPO-ALVO 10.0 s/i.test(numeros) && /PARADO 15 s/i.test(numeros),
  `os numeros enquanto marca: 8 volumes, 12.9 s por volume (90 s / 7) acima do alvo de 10.0 s, 15 s parado (${numeros.slice(0, 200)})`);
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-marcar.png` });

/* --------------------------------------- o F5 nao leva a marcacao */
await p.reload();
await preparar.waitFor({ timeout: 8000 });
await p.locator('input[type="file"]').setInputFiles(VIDEO);
const continuar = p.getByRole('button', { name: 'Continuar de onde parou' });
await continuar.waitFor({ timeout: 8000 });
checar(/marcação em andamento deste vídeo \(8 volumes/.test(await preparar.innerText()), 'F5: o PC guardou a marcacao (8 volumes)');
// Com o video ja' aberto: antes disso o botao fica travado por outro motivo.
await preparar.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
await p.waitForFunction(() => !document.querySelector('button[disabled]')?.innerText.includes('Continuar'), { timeout: 8000 });
checar(await p.getByRole('button', { name: 'Começar a marcar' }).isDisabled()
  && /Continue ou descarte a marcação guardada deste vídeo antes de começar outra/.test(await preparar.innerText()),
'com marcacao guardada na tela, "Começar a marcar" fica travado: continuar ou descartar antes');
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
checar(/Este vídeo já foi salvo neste PC em .* \(8 volumes\)\. Salvar de novo o mesmo trecho cria outra medição/.test(await preparar.innerText()),
  'o mesmo video de novo: avisa que ja foi salvo e que salvar o mesmo trecho duplica');
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
  for (const s of [2, 4, 6, 20]) await teclaEm(q, s, 'Enter');
  await teclaEm(q, 7, 'p');
  await q.getByRole('dialog', { name: 'Por que a linha parou' }).getByRole('button', { name: 'Setup / Troca' }).click();
  // Encerrar RECUSADO (o volume de 0:20 fica depois dele): a parada continua
  // aberta — nao fecha calada num ponto que ninguem escolheu.
  await teclaEm(q, 8, 'f');
  checar(/volume marcado depois do Encerrar/.test(await q.getByRole('alert').innerText())
    && /PARADA · Setup \/ Troca desde 0:07.0/.test(await q.locator('[aria-label="Vídeo"]').innerText()),
  'Encerrar recusado com a parada aberta: diz por que e a parada continua aberta');
  await q.getByRole('button', { name: 'Remover o volume 3 (0:20.0)' }).click();
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
  // Recusa CERTA (400): nada gravou, e o rascunho nao diz que talvez sim.
  await q.reload();
  await q.locator('input[type="file"]').setInputFiles(VIDEO);
  await q.getByRole('button', { name: 'Continuar de onde parou' }).waitFor({ timeout: 8000 });
  checar(!/pode já estar no servidor/.test(await q.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
    'depois de uma recusa certa (400), o rascunho nao avisa que a medicao pode estar no servidor');
  await c2.close();
}

/* ---- a resposta se perdeu: salvar de novo SUBSTITUI, nunca duplica ---- */
{
  /* O caso da revisao de 31/10: salva com 3 volumes -> 504 (gravou); tira um
     volume, salva -> 504 (gravou de novo); F5; salva -> ok. O banco tem de
     ficar com UMA medicao, a de 2 volumes. */
  const c3 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const r = await c3.newPage();
  await semearSessao(r);
  r.on('pageerror', (e) => erros.push(e.message));
  const env3 = [];
  const banco3 = new Map();
  const falha = { proxima: 'perdida' };
  await simularServidor(r, { enviados: env3, falha, banco: banco3 });
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
  checar(/^Não deu para confirmar se salvou: o servidor demorou demais para responder\. Salve de novo — se a tentativa anterior chegou, esta a substitui, sem duplicar\.$/
    .test(await rev.getByRole('alert').innerText()),
  `resposta perdida (504): diz que nao se sabe e que salvar de novo substitui (${await rev.getByRole('alert').innerText()})`);
  // O analista corrige mesmo assim: tira um volume e salva — e a resposta se perde de novo.
  await rev.getByRole('button', { name: 'Voltar a marcar' }).click();
  await r.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await r.evaluate(() => document.activeElement?.blur());
  await r.keyboard.press('Backspace');
  await teclaEm(r, 9, 'f');
  await rev.waitFor({ timeout: 4000 });
  falha.proxima = 'perdida';
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  await rev.getByRole('alert').filter({ hasText: /Não deu para confirmar/ }).waitFor({ timeout: 4000 });
  // F5 com o envio sem resposta: o rascunho avisa que pode estar no servidor.
  await r.reload();
  await r.locator('input[type="file"]').setInputFiles(VIDEO);
  const continuar3 = r.getByRole('button', { name: 'Continuar de onde parou' });
  await continuar3.waitFor({ timeout: 8000 });
  checar(/Ela pode já estar no servidor: uma tentativa de salvar ficou sem resposta\. Continue e salve — a versão nova substitui/
    .test(await r.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
  'F5 depois do envio sem resposta: o rascunho avisa que pode ja estar no servidor e que salvar substitui');
  await r.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Continuar de onde') && !b.disabled), { timeout: 8000 });
  await continuar3.click();
  await r.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await r.evaluate(() => document.activeElement?.blur());
  await teclaEm(r, 9, 'f');
  await rev.waitFor({ timeout: 4000 });
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  const tela = r.locator('[aria-label="Medição salva"]');
  await tela.waitFor({ timeout: 4000 });
  checar(/✓ Medição salva: 2 volumes/.test(await tela.innerText()) && /substituiu a versão que uma tentativa anterior tinha gravado/.test(await tela.innerText()),
    'salvo: 2 volumes, e diz que substituiu a versao da tentativa anterior');
  // Largada em 2 s e volumes em 4, 6 e 8: 3 volumes; o Desfazer deixou 2.
  checar(env3.length === 3 && new Set(env3.map((c) => c.clientId)).size === 1 && env3[0].pecas === 3,
    'as 3 tentativas foram com o MESMO client_id (a 1a com 3 volumes)');
  checar(banco3.size === 1 && [...banco3.values()][0].pecas === 2,
    `o banco fica com UMA medicao, a ultima (2 volumes) (${banco3.size} medicao(oes), ${[...banco3.values()].map((c) => c.pecas).join(',')} volumes)`);
  checar(await tela.getByRole('button', { name: /como medição nova/ }).count() === 0, 'nao existe mais "salvar como medicao nova"');

  // Descartar uma marcacao que pode ter chegado: o aviso de "ja salvo" fica.
  // (O mesmo arquivo do disco: o rascunho e' pelo nome, tamanho e DATA, e
  // arquivo montado de buffer ganha data nova a cada escolha.)
  await tela.getByRole('button', { name: 'Marcar outro vídeo' }).click();
  await r.locator('input[type="file"]').setInputFiles(VIDEO);
  await r.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  // Filmagem de 40 dias atras: a lista nao a mostra, e o aviso tem de saber.
  const antiga3 = new Date(Date.now() - 40 * 86400000);
  await r.locator('input[aria-label="Data e hora em que a filmagem começou"]')
    .fill(`${antiga3.getFullYear()}-${dois(antiga3.getMonth() + 1)}-${dois(antiga3.getDate())}T08:00`);
  await r.getByRole('button', { name: 'Começar a marcar' }).click();
  await r.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await r.evaluate(() => document.activeElement?.blur());
  for (const s of [2, 4, 6]) await teclaEm(r, s, 'Enter');
  await teclaEm(r, 7, 'f');
  await rev.waitFor({ timeout: 4000 });
  falha.proxima = 'perdida';
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  await rev.getByRole('alert').filter({ hasText: /Não deu para confirmar/ }).waitFor({ timeout: 4000 });
  await r.reload();
  await r.locator('input[type="file"]').setInputFiles(VIDEO);
  await r.getByRole('button', { name: 'Descartar e começar de novo' }).click();
  checar(/Uma marcação deste vídeo \(2 volumes\) foi descartada neste PC .* depois de uma tentativa de salvar sem resposta: ela pode ter chegado\. Confira no relatório Ritmo por máquina/
    .test(await r.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
  'descartar depois de um envio sem resposta: avisa que ela pode ter chegado e onde conferir (filmagem antiga: no relatorio, nao na lista)');
  await c3.close();
}

/* ---- a que chegou foi mexida no PC: arquivar ela e salvar esta, ou descartar ---- */
{
  const c7 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const m = await c7.newPage();
  await semearSessao(m);
  m.on('pageerror', (e) => erros.push(e.message));
  const env7 = [];
  const arquivadas = [];
  const falha = { proxima: 'mexida' };
  await simularServidor(m, { enviados: env7, falha, arquivadas });
  const marcarTres = async () => {
    await m.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
    await m.getByRole('button', { name: 'Começar a marcar' }).click();
    await m.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
    await m.evaluate(() => document.activeElement?.blur());
    for (const sg of [2, 4, 6]) await teclaEm(m, sg, 'Enter');
    await teclaEm(m, 7, 'f');
  };
  await m.goto(`${BASE}/analise/embalagem/video`);
  await m.locator('input[type="file"]').setInputFiles(VIDEO);
  await m.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  await marcarTres();
  const rev = m.locator('[aria-label="Revisar a medição"]');
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  const caixa = rev.getByRole('alert').filter({ hasText: /foi mexida no PC depois/ });
  await caixa.waitFor({ timeout: 4000 });
  checar(/volume e marca não se corrigem no PC/.test(await caixa.innerText())
    && await rev.getByRole('button', { name: 'Salvar medição' }).count() === 0
    && await caixa.getByRole('button', { name: 'Arquivar a que chegou e salvar esta' }).count() === 1,
  '409 de mexida no PC: diz por que, tira o "Salvar" (daria o mesmo 409) e oferece arquivar a que chegou e salvar esta');
  // F5: o rascunho lembra, e nao promete mais que salvar substitui.
  await m.reload();
  await m.locator('input[type="file"]').setInputFiles(VIDEO);
  await m.getByRole('button', { name: 'Continuar de onde parou' }).waitFor({ timeout: 8000 });
  const prep = await m.locator('[aria-label="Preparar a medição por vídeo"]').innerText();
  checar(/Uma versão dela já está no sistema e foi mexida no PC depois: salvar de novo não a substitui/.test(prep)
    && !/a versão nova substitui/.test(prep),
  'F5 depois do 409 de mexida: o rascunho diz que salvar nao substitui (e nao promete o contrario)');
  await m.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Continuar de onde') && !b.disabled), { timeout: 8000 });
  await m.getByRole('button', { name: 'Continuar de onde parou' }).click();
  await m.locator('[aria-label="Marcas da medição"]').waitFor({ timeout: 4000 });
  await m.evaluate(() => document.activeElement?.blur());
  await teclaEm(m, 7, 'f');
  await rev.getByRole('button', { name: 'Arquivar a que chegou e salvar esta' }).click();
  await m.getByText(/✓ Medição salva: 2 volumes/).waitFor({ timeout: 4000 });
  checar(JSON.stringify(arquivadas) === JSON.stringify([MEXIDA_ID]) && env7.length === 2 && env7[1].clientId !== env7[0].clientId,
    'arquivar e salvar: arquiva a que chegou (pelo id do 409) e salva esta com outro client_id');

  // A que chegou serve: descartar esta, e o video fica avisando.
  await m.getByRole('button', { name: 'Marcar outro vídeo' }).click();
  await m.locator('input[type="file"]').setInputFiles(VIDEO);
  await m.getByText(/2 min de vídeo/).waitFor({ timeout: 8000 });
  await marcarTres();
  falha.proxima = 'mexida';
  await rev.getByRole('button', { name: 'Salvar medição' }).click();
  await rev.getByRole('button', { name: 'Descartar esta marcação' }).click();
  await m.locator('[aria-label="Preparar a medição por vídeo"]').waitFor({ timeout: 4000 });
  checar(/Uma marcação deste vídeo foi descartada neste PC em .*, e uma versão dela já está no sistema: confira na lista da Embalagem Takt Time/
    .test(await m.locator('[aria-label="Preparar a medição por vídeo"]').innerText())
    && await m.getByRole('button', { name: 'Continuar de onde parou' }).count() === 0,
  'descartar depois do 409 de mexida: a marcacao sai e o video avisa que uma versao ja esta no sistema');
  await c7.close();
}

/* ---- a marcacao da v2.99.0 (vaga unica) entra na lista de rascunhos ---- */
{
  const c6 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
  const y = await c6.newPage();
  await semearSessao(y);
  y.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(y, { enviados: [] });
  await y.goto(`${BASE}/analise/embalagem/video`);
  await y.locator('[aria-label="Preparar a medição por vídeo"]').waitFor({ timeout: 8000 });
  await y.evaluate(() => {
    localStorage.setItem('ritmopatrimar.video.rascunho', JSON.stringify({
      arquivo: 'antigo.mp4|123|456', nome: 'antigo.mp4', clientId: '00000000-0000-4000-8000-000000000099',
      campos: { maquinaId: '00000000-0000-0000-0000-0000000000a1', produto: 'Rack Sirius 1.6', inicio: '2026-10-28T08:00' },
      marcacao: { largadaMs: 1000, toques: [{ ms: 3000, ordem: 1 }, { ms: 5000, ordem: 2 }], paradas: [], aberta: null, ordem: 2 },
      observacao: '', atualizadoEm: '2026-10-28T12:00:00.000Z',
    }));
  });
  await y.reload();
  await y.locator('[aria-label="Preparar a medição por vídeo"]').waitFor({ timeout: 8000 });
  const guardado = await y.evaluate(() => ({
    antiga: localStorage.getItem('ritmopatrimar.video.rascunho'),
    mapa: Object.keys(JSON.parse(localStorage.getItem('ritmopatrimar.video.rascunhos') || '{}')),
  }));
  checar(guardado.antiga === null && guardado.mapa.includes('antigo.mp4|123|456')
    && /Marcações em andamento neste PC: antigo\.mp4 \(2 volumes/.test(await y.locator('[aria-label="Preparar a medição por vídeo"]').innerText()),
  'a marcacao guardada pela v2.99.0 passa para a lista nova e a vaga antiga e apagada');
  await c6.close();
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
     producao: o takt sai (72 s, sem setup nas horas), mas o setup NAO e'
     planejado — a lista e o volume a volume nao descontam o setup do trecho.
     A previa descontava e a lista nao (revisao de 30/10). Com os dias (5),
     o setup e' planejado e a previa desconta, como a lista. */
  for (const { dias, esperado, rotulo } of [
    { dias: null, esperado: '40.0', rotulo: 'setup sem planejamento no takt: a previa nao desconta o setup' },
    { dias: 5, esperado: '20.0', rotulo: 'setup planejado (5 dias): a previa desconta o setup do trecho, como a lista' },
  ]) {
    const c5 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: FUSO });
    const w = await c5.newPage();
    await semearSessao(w);
    w.on('pageerror', (e) => erros.push(e.message));
    await simularServidor(w, {
      enviados: [],
      cadastro: { ...CADASTRO, grupos: [{ ...GRUPO, setups_dia: 1, setup_min: '30', dias_semana: dias }] },
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
    // (100 - 20) / 2 = 40.0 s com o setup dentro; descontando os 40 s de setup, (80 - 40) / 2 = 20.0 s.
    checar(new RegExp(`POR VOLUME ${esperado.replace('.', '\\.')} s`, 'i').test(painel), `${rotulo} (${painel.slice(0, 80)})`);
    await c5.close();
  }
}

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
