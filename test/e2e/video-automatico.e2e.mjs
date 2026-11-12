/**
 * MARCACAO AUTOMATICA DO VIDEO (v2.105.0) — do retangulo desenhado a'
 * medicao salva.
 *
 * O servidor e' simulado; o video e' de verdade e SINTETICO
 * (test/fixtures/caixas-60s.webm, gerado com ffmpeg: fundo verde e uma
 * caixa parda em horarios conhecidos — nenhuma imagem da fabrica). A caixa:
 * ja' presente de 0 a 2 s; entra em 4, 15, 26, 40 e 52 s (7 s cada); e um
 * "vulto" de 1 s em 36 s, que nao e' volume.
 *
 * O que se prova: o retangulo e' desenhado com o mouse sobre o video (com a
 * faixa preta do enquadramento); retangulo pequeno e retangulo sem caixa
 * sao recusados com o porque; a leitura acha as entradas nos horarios
 * certos, ignora o vulto e a caixa que ja' estava; a primeira entrada vira
 * a largada, como o primeiro Enter; as teclas ficam travadas durante a
 * leitura; a conferencia conta o que o analista mexeu; o retangulo fica
 * guardado para a maquina e a conferencia sobrevive ao F5; e a medicao
 * salva e' a de sempre, com origem 'video'.
 *
 * Uso: npm run dev -- --port 5199 e depois node test/e2e/video-automatico.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;
const VIDEO = fileURLToPath(new URL('../fixtures/caixas-60s.webm', import.meta.url));
const FUSO = 'America/Sao_Paulo';
// A caixa do video: x 300–500 e y 150–300 de 640x360.
const CAIXA = {
  x: 300 / 640, y: 150 / 360, largura: 200 / 640, altura: 150 / 360,
};
const ENTRADAS = [4, 15, 26, 40, 52];

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
];
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(hoje).split('-').map(Number);
const segunda = new Date(Date.UTC(anoSp, mesSp - 1, diaSp));
segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
const DEMANDAS = [{
  ano: segunda.getUTCFullYear(), numero: 1, pecas: 2200, inicio: segunda.toISOString().slice(0, 10),
  atualizado_em: hoje.toISOString(),
}];
const dois = (n) => String(n).padStart(2, '0');
const HOJE_8H = `${anoSp}-${dois(mesSp)}-${dois(diaSp)}T08:00`;

async function simularServidor(pagina, enviados) {
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas: DEMANDAS } })
    : rota.fulfill({ json: CADASTRO })));
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: MOTIVOS } }));
  await pagina.route('**/api/conferencias**', (rota) => rota.fulfill({ json: { conferencias: [], outras: 0 } }));
  await pagina.route('**/api/sync**', (rota) => {
    const corpo = rota.request().postDataJSON();
    enviados.push(...(corpo.conferencias || []));
    const ids = (corpo.conferencias || []).map((c) => c.clientId);
    return rota.fulfill({ json: { recebidos: ids.length, novos: ids.length, atualizados: 0, clientIds: ids } });
  });
}

/** Leva o video principal a `s` segundos e espera ele chegar la'. */
async function irPara(p, s) {
  await p.evaluate(async (seg) => {
    const v = document.querySelector('video');
    if (Math.abs(v.currentTime - seg) < 0.01) return;
    const chegou = new Promise((r) => { v.addEventListener('seeked', r, { once: true }); });
    v.currentTime = seg;
    await chegou;
  }, s);
}

/**
 * Arrasta o mouse sobre o video de `a` a `b` (em fracao da IMAGEM), com a
 * mesma conta de faixa preta que a tela faz — independente dela, para a
 * conta da tela ser posta a' prova.
 */
async function arrastar(p, a, b) {
  const g = await p.evaluate(() => {
    const v = document.querySelector('video');
    const r = v.getBoundingClientRect();
    return {
      left: r.left, top: r.top, w: r.width, h: r.height, vw: v.videoWidth, vh: v.videoHeight,
    };
  });
  const escala = Math.min(g.w / g.vw, g.h / g.vh);
  const iw = g.vw * escala;
  const ih = g.vh * escala;
  const ox = g.left + (g.w - iw) / 2;
  const oy = g.top + (g.h - ih) / 2;
  const tela = (f) => ({ x: ox + f.x * iw, y: oy + f.y * ih });
  const de = tela(a);
  const ate = tela(b);
  await p.mouse.move(de.x, de.y);
  await p.mouse.down();
  await p.mouse.move((de.x + ate.x) / 2, (de.y + ate.y) / 2, { steps: 4 });
  await p.mouse.move(ate.x, ate.y, { steps: 4 });
  await p.mouse.up();
}

/** Os tempos (s) de uma lista de marcas: "0:15.2 Volume 1 ..." -> [15.2, ...]. */
function tempos(texto, rotulo) {
  return [...texto.matchAll(new RegExp(`(\\d+):(\\d{2})\\.(\\d)\\s*${rotulo}`, 'g'))]
    .map((m) => Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10);
}

const navegador = await chromium.launch({ executablePath: EXEC });
const erros = [];
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: FUSO });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => erros.push(e.message));
const enviados = [];
await simularServidor(p, enviados);

/* ---------------------------------------------------------- preparar */
await p.goto(`${BASE}/analise/embalagem/video`);
const preparar = p.getByRole('region', { name: 'Preparar a medição por vídeo' });
await preparar.waitFor({ timeout: 8000 });
await p.locator('input[type="file"]').setInputFiles(VIDEO);
await preparar.getByText(/1 min de vídeo/).waitFor({ timeout: 8000 });
await p.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
await p.locator('select[aria-label="Produto embalado"]').selectOption('Rack Sirius 1.6');
await p.getByRole('button', { name: 'Começar a marcar' }).click();
const auto = p.getByRole('region', { name: 'Marcação automática' });
await auto.waitFor({ timeout: 4000 });
const marcas = p.locator('[aria-label="Marcas da medição"]');

/* ------------------------------------------------------- o retangulo */
checar(/Desenhe um retângulo sobre o tapete verde/.test(await auto.innerText()),
  'sem retangulo: a tela diz o que desenhar e onde');
await irPara(p, 6); // um ponto com caixa, para ver onde desenhar
await auto.getByRole('button', { name: 'Desenhar o retângulo' }).click();
checar(/Clique e arraste sobre o vídeo/.test(await auto.innerText()), 'Desenhar: a instrucao aparece no lugar');
// Pequeno demais: recusado com o porque.
await arrastar(p, { x: 0.6, y: 0.6 }, { x: 0.605, y: 0.61 });
checar(/pequeno demais/.test(await p.getByRole('alert').first().innerText()), 'retangulo minusculo: recusado com o porque');
// Sobre o fundo, sem caixa: aceito, mas a leitura recusa — o retangulo nao separa caixa de esteira.
await arrastar(p, { x: 0.05, y: 0.1 }, { x: 0.25, y: 0.4 });
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).waitFor({ timeout: 4000 });
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
await auto.getByRole('alert').waitFor({ timeout: 90000 });
{
  const erro = await auto.getByRole('alert').innerText();
  checar(/não mostrou diferença entre caixa e esteira vazia/.test(erro) && /volte o vídeo para antes/.test(erro)
    && /redesenhe/.test(erro), 'retangulo sem caixa: a leitura recusa e diz as duas causas (trecho sem caixa ou retangulo fora)');
}
checar(!/Volume 1/.test(await marcas.innerText()), 'leitura recusada nao poe marca nenhuma');

// Agora sobre a caixa, arrastando de baixo para cima (qualquer direcao vale).
await auto.getByRole('button', { name: 'Redesenhar o retângulo' }).click();
await arrastar(
  p,
  { x: CAIXA.x + CAIXA.largura * 0.85, y: CAIXA.y + CAIXA.altura * 0.85 },
  { x: CAIXA.x + CAIXA.largura * 0.15, y: CAIXA.y + CAIXA.altura * 0.15 },
);
const guardado = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.video.retangulos') || '{}'));
const r = guardado[MAQUINA.id];
checar(r && Math.abs(r.x - (CAIXA.x + CAIXA.largura * 0.15)) < 0.01 && Math.abs(r.y - (CAIXA.y + CAIXA.altura * 0.15)) < 0.01,
  `o retangulo e' guardado em fracao da imagem, para a maquina (${JSON.stringify(r)})`);
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-auto-retangulo.png` });

/* ---------------------------------------------------------- a leitura */
await irPara(p, 0);
// Redesenhar tira o erro da leitura anterior: o botao volta a ser o de marcar.
checar(!(await auto.getByRole('alert').count()), 'redesenhar o retangulo tira o erro da leitura anterior');
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
await auto.getByText(/Lendo o vídeo/).waitFor({ timeout: 8000 });
checar(true, 'Marcar: a leitura comeca e mostra o andamento');
// Teclas travadas durante a leitura: Enter nao marca nada.
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('Enter');
checar(!/Largada/.test(await marcas.innerText()), 'durante a leitura o Enter nao marca (as teclas ficam travadas)');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-auto-lendo.png` });
await auto.getByText(/A leitura marcou/).waitFor({ timeout: 120000 });
const lista = await marcas.innerText();
const largada = tempos(lista, 'Largada');
const volumes = tempos(lista, 'Volume \\d+');
checar(largada.length === 1 && Math.abs(largada[0] - ENTRADAS[0]) < 0.4,
  `a primeira caixa que entra vira a largada, como o primeiro Enter (${largada})`);
checar(volumes.length === 4 && volumes.every((t, i) => Math.abs(t - ENTRADAS[i + 1]) < 0.4),
  `um volume por caixa, na entrada dela: ${volumes.join(', ')} (esperado ${ENTRADAS.slice(1).join(', ')})`);
const texto = await auto.innerText();
checar(/A leitura marcou 4 volumes, mais a largada/.test(texto), 'o resumo diz quantos volumes marcou');
checar(/já estava embaixo do filme no começo/.test(texto), 'a caixa que ja\' estava no comeco nao vira marca, e a tela diz por que');
checar(/Passagens curtas ignoradas[\s\S]*0:3[56]\.\d/.test(texto), 'o vulto de 1 s em ~0:36 e\' ignorado, e a tela mostra onde');
checar(/das 5 marcas que ela pôs, 5 ficaram/.test(texto), 'conferencia: 5 de 5 marcas mantidas antes de mexer');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-auto-pronto.png` });

/* ------------------------- lista esvaziada: a marcacao automatica sai */
await p.evaluate(() => document.activeElement?.blur());
for (let i = 0; i < 5; i++) await p.keyboard.press('Backspace');
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).waitFor({ timeout: 4000 });
// Espera a tela assentar: o botao aparece um render antes de o efeito sobre
// a marcacao limpar o resumo, e ler o cartao uma vez so' caia nesse meio
// (falha intermitente, vista na revisao da v2.108.0).
const limpou = await p.waitForFunction(() => {
  const texto = document.querySelector('section[aria-label="Marcação automática"]')?.innerText || '';
  return !/A leitura marcou/.test(texto) && !/Conferência/.test(texto);
}, null, { timeout: 4000 }).then(() => true, () => false);
checar(limpou, 'desfeita a lista inteira (⌫), o resumo e a conferencia saem e o botao de marcar volta');
await irPara(p, 0);
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
await auto.getByText(/A leitura marcou 4 volumes/).waitFor({ timeout: 120000 });
// As marcas gravadas no fim sao as DESTA leitura, nao as da primeira: duas
// leituras do mesmo video diferem em decimos (o quadro lido a 8x nao e'
// sempre o mesmo). Comparar com a primeira dava falha intermitente de ~0,25 s.
const listaGravada = await marcas.innerText();
const largadaGravada = tempos(listaGravada, 'Largada')[0];
const volumesGravados = tempos(listaGravada, 'Volume \\d+');

/* --------------------------------------------- a conferencia do analista */
// Apaga um volume e acrescenta outro com o Enter de sempre.
await marcas.getByRole('button', { name: /Remover o volume 2/ }).click();
await irPara(p, 59);
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('Enter');
checar(/das 5 marcas que ela pôs, 4 ficaram, 1 foi apagada e 1 foi acrescentada/.test(await auto.innerText()),
  'conferencia conta o que o analista mexeu: 4 ficaram, 1 apagada, 1 acrescentada');

/* ------------------------------------------------------------- o F5 */
await p.reload();
await preparar.waitFor({ timeout: 8000 });
await p.locator('input[type="file"]').setInputFiles(VIDEO);
await p.getByRole('button', { name: 'Continuar de onde parou' }).click({ timeout: 8000 });
await auto.waitFor({ timeout: 4000 });
checar(/das 5 marcas que ela pôs, 4 ficaram, 1 foi apagada e 1 foi acrescentada/.test(await auto.innerText()),
  'F5: a conferencia volta com a marcacao guardada');
checar(/Passagens curtas ignoradas[\s\S]*0:3[56]\.\d/.test(await auto.innerText()),
  'F5: o que a leitura apontou para conferir volta junto (passagem curta ignorada)');
await p.waitForFunction(() => document.querySelector('[aria-hidden="true"][style*="dashed"]'), null, { timeout: 4000 })
  .then(() => checar(true, 'F5: o retangulo da maquina volta desenhado sobre o video'))
  .catch(() => checar(false, 'F5: o retangulo da maquina volta desenhado sobre o video'));

/* -------------------------------------------------- encerrar e salvar */
await irPara(p, 59.5);
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('f');
const revisar = p.getByRole('region', { name: 'Revisar a medição' });
await revisar.waitFor({ timeout: 4000 });
checar(/Conferência da marcação automática: das 5 marcas que ela pôs, 4 ficaram/.test(await revisar.innerText()),
  'Revisar: a conferencia da marcacao automatica aparece antes de salvar');
await revisar.getByRole('button', { name: 'Salvar medição' }).click();
await p.getByText(/Medição salva/).waitFor({ timeout: 8000 });
const enviada = enviados[enviados.length - 1];
checar(enviada?.origem === 'video' && enviada?.pecas === 4 && enviada?.marcasMs?.length === 4,
  `a medicao salva e' a de sempre, com origem video (${enviada?.pecas} volumes, ${enviada?.marcasMs?.length} marcas)`);
{
  // Os NUMEROS gravados, nao so' as quantidades: tirado o volume 2 e
  // acrescentado o de 59 s, as marcas sao os volumes menos a largada, e o
  // periodo vai da largada ao Encerrar (59,5 s). Tolerancia de 0,2 s: a
  // lista mostra decimos.
  const L = largadaGravada;
  const esperadas = [volumesGravados[0], volumesGravados[2], volumesGravados[3], 59].map((t) => (t - L) * 1000);
  const perto = (a, b) => Math.abs(a - b) <= 200;
  checar(enviada?.marcasMs?.every((ms, i) => perto(ms, esperadas[i])),
    `marcas gravadas ${JSON.stringify(enviada?.marcasMs)} ≈ ${JSON.stringify(esperadas.map(Math.round))}`);
  checar(perto(enviada?.duracaoMs, (59.5 - L) * 1000),
    `periodo gravado ${enviada?.duracaoMs} ms ≈ largada ao Encerrar (${Math.round((59.5 - L) * 1000)} ms)`);
}

checar(!erros.length, `sem erro no console da pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
