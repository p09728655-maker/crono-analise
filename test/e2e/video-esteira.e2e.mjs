/**
 * A ESTEIRA PELAS LINHAS A E B (v2.113.0) — velocidade e entre-pecas
 * medidos no video, do desenho da linha B a' leitura inteira.
 *
 * O video e' SINTETICO (test/fixtures/esteira-ab-40s.webm — nenhuma imagem
 * da fabrica): fundo verde 640x360 e uma caixa parda de 200x100 px ANDANDO
 * para a direita a 100 px/s, uma a cada 8 s (caixa + vao = 800 px). Gerado:
 *   ffmpeg -f lavfi -i "color=c=0x1e3d33:s=640x360:r=25:d=40" \
 *     -f lavfi -i "color=c=0x9b7a4f:s=200x100:r=25:d=40" \
 *     -filter_complex "[0][1]overlay=x='mod(t*100\,800)-200':y=130:eval=frame:shortest=1" \
 *     -c:v libvpx -crf 30 -b:v 50k -g 250 -an test/fixtures/esteira-ab-40s.webm
 * Com A em x~300 e B em x~400 (100 px), digitando 100 mm (1 px = 1 mm) e a
 * caixa de 200 mm: 1,0 s de A ate' B, 6,0 m/min, caixa + vao 800 mm e
 * entre-pecas 600 mm.
 *
 * O que se prova: a linha B se desenha (com a lupa) e fica guardada com a
 * maquina, com a distancia — a caixa NAO (e' do produto); o leitor mostra o
 * que a B ve' (ao vivo); o teste e a leitura inteira dao a velocidade, a
 * caixa + vao e o entre-pecas certos; trocar a distancia refaz a conta sem
 * ler de novo; redesenhar uma linha apaga a distancia; a B longe demais
 * (a caixa se confunde com a seguinte) e' recusada, sem numero; tirar a B
 * apaga o teste velho.
 *
 * Uso: npm run dev -- --port 5199 e depois node test/e2e/video-esteira.e2e.mjs
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;
const VIDEO = fileURLToPath(new URL('../fixtures/esteira-ab-40s.webm', import.meta.url));
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
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(hoje).split('-').map(Number);
const dois = (n) => String(n).padStart(2, '0');
const HOJE_8H = `${anoSp}-${dois(mesSp)}-${dois(diaSp)}T08:00`;

async function simularServidor(pagina) {
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas: [] } })
    : rota.fulfill({ json: CADASTRO })));
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: [] } }));
  await pagina.route('**/api/conferencias**', (rota) => rota.fulfill({ json: { conferencias: [], outras: 0 } }));
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

/** Arrasta o mouse sobre o video de `a` a `b` (em fracao da IMAGEM, com a faixa preta do enquadramento). */
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

/** Os tres numeros do bloco da esteira: velocidade (m/min), entre-pecas e caixa + vao (mm). */
async function numerosDaEsteira(bloco) {
  const t = (await bloco.innerText()).replace(/\s+/g, ' ');
  return {
    vel: Number(t.match(/VELOCIDADE ([\d.]+) m\/min/i)?.[1]),
    entre: Number(t.match(/ENTRE-PEÇAS ≈ (-?\d+) mm/i)?.[1]),
    passo: Number(t.match(/CAIXA \+ VÃO (\d+) mm/i)?.[1]),
    texto: t,
  };
}

const navegador = await chromium.launch({ executablePath: EXEC });
const erros = [];
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: FUSO });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => erros.push(e.message));
await simularServidor(p);

await p.goto(`${BASE}/analise/embalagem/video`);
const preparar = p.getByRole('region', { name: 'Preparar a medição por vídeo' });
await preparar.waitFor({ timeout: 8000 });
await p.locator('input[type="file"]').setInputFiles(VIDEO);
await preparar.getByText(/de vídeo/).waitFor({ timeout: 8000 });
await p.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
await p.locator('select[aria-label="Produto embalado"]').selectOption('Rack Sirius 1.6');
await p.getByRole('button', { name: 'Começar a marcar' }).click();
const auto = p.getByRole('region', { name: 'Marcação automática' });
await auto.waitFor({ timeout: 4000 });

/* -------------------------------------------- A e B, no caminho da caixa */
// A caixa anda na faixa y 130–230 (de 360). A: faixa vertical em x ~300; B: em x ~400.
await irPara(p, 4); // caixa entre x 200 e 400: as duas linhas sobre ela
await auto.getByRole('button', { name: 'Desenhar o retângulo' }).click();
await arrastar(p, { x: 0.455, y: 0.40 }, { x: 0.485, y: 0.60 });
const linhaB = p.locator('[aria-label="Linha B: velocidade e entre-peças"]');
await linhaB.waitFor({ timeout: 4000 });
checar(/Uma segunda faixa, B/.test(await linhaB.innerText()), 'sem a linha B, a tela diz o que ela mede e como');
await linhaB.getByRole('button', { name: 'Desenhar a linha B' }).click();
checar(/Linha B: clique e arraste/.test(await auto.innerText()), 'desenhar a B: a instrucao da linha B aparece no lugar');
{
  // A lupa: o video ampliado em volta do ponteiro, para cravar a linha no centro da fita.
  const box = await p.locator('[aria-label="Desenhar o retângulo: clique e arraste sobre o vídeo"]').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  checar(await p.getByLabel('Lupa: o vídeo ampliado em volta do ponteiro').count() === 1, 'desenhando, a lupa aparece');
}
await arrastar(p, { x: 0.61, y: 0.40 }, { x: 0.64, y: 0.60 });
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).waitFor({ timeout: 4000 });
{
  const g = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.video.retangulos') || '{}'));
  const r = g['00000000-0000-0000-0000-0000000000a1'];
  checar(r?.b && Math.abs(r.b.x - 0.61) < 0.01 && Math.abs(r.x - 0.455) < 0.01,
    `A e B ficam guardadas com a maquina, em fracao da imagem (${JSON.stringify(r && { x: r.x, b: r.b })})`);
}
await p.waitForFunction(() => /^B · \d+% papelão$/.test(document.querySelector('[data-leitura-linha-b]')?.textContent || ''), null, { timeout: 4000 })
  .then(() => checar(true, 'o que a B ve aparece ao vivo sobre ela ("B · N% papelão")'))
  .catch(() => checar(false, 'o que a B ve aparece ao vivo sobre ela ("B · N% papelão")'));
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).fill('100');
await linhaB.getByRole('spinbutton', { name: /Comprimento da caixa/ }).fill('200');
await linhaB.getByRole('spinbutton', { name: /Comprimento da caixa/ }).press('Tab');
{
  const g = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.video.retangulos') || '{}'));
  const r = g['00000000-0000-0000-0000-0000000000a1'];
  checar(r?.distanciaMm === 100 && r?.caixaMm === undefined,
    `a distancia fica guardada com a maquina; a caixa nao, ela e do produto (${r?.distanciaMm} · ${r?.caixaMm})`);
}

/* ------------------------------------------------------------ o teste */
await irPara(p, 0);
await auto.getByRole('button', { name: 'Testar o retângulo (2 min)' }).click();
await auto.getByText(/O retângulo pegou \d+ caixas?/).waitFor({ timeout: 90000 });
const blocoTeste = p.locator('[aria-label="Esteira medida pelas linhas A e B"]');
await blocoTeste.waitFor({ timeout: 4000 });
{
  const n = await numerosDaEsteira(blocoTeste);
  checar(Math.abs(n.vel - 6) <= 0.3 && Math.abs(n.passo - 800) <= 40 && Math.abs(n.entre - 600) <= 40,
    `o teste mede a esteira: ${n.vel} m/min (6,0), caixa + vao ${n.passo} mm (800), entre-pecas ${n.entre} mm (600)${Number.isFinite(n.vel) ? "" : ` — TELA: ${n.texto}`}`);
  checar(/A ponta da caixa leva [01]\.\d s de A até B \(100 mm\)/.test(n.texto), 'diz o tempo de A ate B e a distancia usada');
}
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-esteira-teste.png` });
// Trocar a distancia refaz a conta, sem ler de novo: o dobro da distancia, o dobro da velocidade.
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).fill('200');
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).press('Tab');
{
  const n = await numerosDaEsteira(blocoTeste);
  checar(Math.abs(n.vel - 12) <= 0.6, `trocar a distancia (200 mm) refaz a conta na hora: ${n.vel} m/min (12,0)`);
}

/* ------------------- redesenhar uma linha apaga a distancia (revisao) */
// A vai para x ~100 px (o cenario da revisao: A em ~100 e B em ~600).
await irPara(p, 2);
await auto.getByRole('button', { name: 'Redesenhar o retângulo' }).click();
await arrastar(p, { x: 0.14, y: 0.40 }, { x: 0.17, y: 0.60 });
{
  const g = await p.evaluate(() => JSON.parse(localStorage.getItem('ritmopatrimar.video.retangulos') || '{}'));
  const r = g['00000000-0000-0000-0000-0000000000a1'];
  checar(r?.b && r?.distanciaMm === undefined && /a distância de A até B foi apagada/.test(await p.getByRole('alert').first().innerText()),
    'redesenhar a A mantem a B mas apaga a distancia, e diz por que (mover uma linha muda a distancia)');
}

/* ------------- a B longe demais: a caixa se confunde com a seguinte */
// B em x ~600 (de 640): 500 px da A em ~100, 5 s com uma caixa a cada 8 s
// — a copia da caixa anterior aparece 3 s ANTES. Antes da revisao, a tela
// dava 10 m/min "com 100%"; agora recusa, sem numero.
await linhaB.getByRole('button', { name: 'Redesenhar a linha B' }).click();
await arrastar(p, { x: 0.925, y: 0.40 }, { x: 0.955, y: 0.60 });
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).fill('500');
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).press('Enter');
await irPara(p, 0);
await auto.getByRole('button', { name: /Testar/ }).click();
await auto.getByText(/O retângulo pegou \d+ caixas?/).waitFor({ timeout: 90000 });
{
  const bloco = p.locator('[aria-label="Esteira medida pelas linhas A e B"]');
  const t = (await bloco.innerText()).replace(/\s+/g, ' ');
  checar(/A caixa apareceu na B antes da A/.test(t) && !/m\/min/.test(t.replace(/cadastro: [\d.]+ m\/min/g, '')),
    `B longe demais: recusada, sem velocidade (${t.slice(0, 110)}…)`);
}

/* ---------------------------------------- tirar a B e desenhar de novo */
await linhaB.getByRole('button', { name: 'Tirar a linha B' }).click();
checar(!(await blocoTeste.count()) && (await linhaB.getByRole('button', { name: 'Desenhar a linha B' }).count()) === 1,
  'tirar a B apaga o resultado do teste velho e volta ao "Desenhar a linha B"');
// A e B de volta a x ~300 e ~400 (100 px), para a leitura inteira.
await irPara(p, 4);
await auto.getByRole('button', { name: 'Redesenhar o retângulo' }).click();
await arrastar(p, { x: 0.455, y: 0.40 }, { x: 0.485, y: 0.60 });
await linhaB.getByRole('button', { name: 'Desenhar a linha B' }).click();
await arrastar(p, { x: 0.61, y: 0.40 }, { x: 0.64, y: 0.60 });
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).fill('100');
await linhaB.getByRole('spinbutton', { name: /Distância real de A até B/ }).press('Tab');

/* ---------------------------------------------------- a leitura inteira */
await irPara(p, 0);
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
await auto.getByText(/A leitura marcou/).waitFor({ timeout: 120000 });
{
  const bloco = p.locator('[aria-label="Esteira medida pelas linhas A e B"]');
  const n = await numerosDaEsteira(bloco);
  checar(Math.abs(n.vel - 6) <= 0.3 && Math.abs(n.entre - 600) <= 40,
    `a leitura do video todo mede a mesma esteira: ${n.vel} m/min e entre-pecas ${n.entre} mm`);
}
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-esteira-leitura.png` });

checar(!erros.length, `sem erro no console da pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
