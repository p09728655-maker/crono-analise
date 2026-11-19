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
/* O TEMPO-ALVO pela ESTEIRA, com a caixa do cadastro. A MEDIDA DA CAIXA e'
   a ABERTA (300 mm, a do comeco da linha); a LARGURA (v2.119.0, .gs v5.73) e'
   a FECHADA (200), a do video — como na seladora (825 × 440 na Mesa Cabeceira
   Sleep). A caixa do video vem da largura; a medida fica so' na conta do alvo:
   (300 + 500) mm a 6 m/min = 8 s de esteira; ÷ 85%. */
const ALVOS = {
  estado: 'ok',
  // ref.largura: o servidor do app viu a chave `largura` na resposta do painel (.gs v5.73)
  ref: { metodo: 'esteira', eficiencia: 85, metaUep: 2761, minDia: 527, sUep: 11.45, largura: true },
  produtos: [{ rot: 'Rack Sirius 1.6', uep: 1, alvoMs: 9412, esteiraMs: 8000, medida: 300, vel: 6, entre: 500, largura: 200 }],
};
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(hoje).split('-').map(Number);
const dois = (n) => String(n).padStart(2, '0');
const HOJE_8H = `${anoSp}-${dois(mesSp)}-${dois(diaSp)}T08:00`;

const enviados = [];
async function simularServidor(pagina, alvos = ALVOS) {
  await pagina.route('**/api/sync**', (rota) => {
    const lote = rota.request().postDataJSON().conferencias || [];
    enviados.push(...lote);
    return rota.fulfill({ json: { recebidos: lote.length, novos: lote.length, atualizados: 0, clientIds: lote.map((c) => c.clientId) } });
  });
  await pagina.route('**/api/maquinas**', (rota) => (/[?&]alvo=1/.test(rota.request().url())
    ? rota.fulfill({ json: alvos })
    : /demanda=1/.test(rota.request().url())
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
// A caixa ja' vem da LARGURA da caixa fechada (200), nao da MEDIDA DA CAIXA (300, a aberta).
checar(await linhaB.getByRole('spinbutton', { name: /Comprimento da caixa/ }).inputValue() === '200'
  && /\(largura da caixa fechada, do cadastro\)/.test(await linhaB.innerText()),
'a caixa do video vem da largura da caixa fechada do cadastro (200 mm), nao da medida aberta (300)');
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
  checar(/caixa a caixa: \d+ caixas nas duas linhas, de \d\.\d\d a \d\.\d\d s/.test(n.texto),
    'caixas limpas: o tempo de A ate B e o caixa a caixa, e a tela diz quantas caixas e a faixa');
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
// De volta a' caixa do CADASTRO, sem a digitada: a largura da fechada (200 mm,
// v2.119.0). O entre-pecas da leitura: 800 − 200 = 600 mm (com a aberta, 500).
await linhaB.getByRole('spinbutton', { name: /Comprimento da caixa/ }).fill('250');
await linhaB.getByRole('button', { name: 'voltar ao cadastro (200 mm)' }).click();
checar(/\(largura da caixa fechada, do cadastro\)/.test(await linhaB.innerText()),
  'voltar ao cadastro: a caixa passa a ser a largura da fechada, e o quadro diz');

/* ---------------------------------------------------- a leitura inteira */
await irPara(p, 0);
await auto.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
await auto.getByText(/A leitura marcou/).waitFor({ timeout: 120000 });
{
  const bloco = p.locator('[aria-label="Esteira medida pelas linhas A e B"]');
  const n = await numerosDaEsteira(bloco);
  checar(Math.abs(n.vel - 6) <= 0.3 && Math.abs(n.entre - 600) <= 40,
    `a leitura do video todo mede a mesma esteira: ${n.vel} m/min e entre-pecas ${n.entre} mm (com a largura da fechada, 200 mm)`);
  // O cadastro vai ao lado do CAIXA + VAO (300 + 500 = 800), nao do entre-pecas (revisao da v2.119.0):
  // o ENTRE_PECAS do cadastro e' o vao com a caixa ABERTA.
  checar(/cadastro: 800 mm/.test(n.texto) && !/cadastro: 500 mm/.test(n.texto) && /caixa de 200 mm/.test(n.texto),
    `o quadro compara o caixa + vao com o do cadastro (800), nao o entre-pecas (500) (${n.texto.slice(0, 160)})`);
}
if (FOTOS) await p.screenshot({ path: `${FOTOS}/video-esteira-leitura.png` });

/* ------------------- salvar: a esteira vai com a medicao (v2.115.0) */
// O que a leitura mediu (100 mm em ~1,0 s, uma caixa a cada 8 s) e a caixa
// (a largura do cadastro, 200 mm, trocada para 250 na revisao) sobem com a
// medicao, para a folha do Takt Time.
await irPara(p, 39);
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('f');
const revisar = p.locator('[aria-label="Revisar a medição"]');
await revisar.waitFor({ timeout: 6000 });
{
  // A REVISAO mostra o que vai (v2.115.1): a mesma frase da folha, e a caixa
  // do entre-pecas para acertar antes de salvar.
  const bloco = revisar.locator('[aria-label="Esteira que vai com a medição"]');
  const t = (await bloco.innerText().catch(() => '')).replace(/\s+/g, ' ');
  // A mesma folga da leitura (± 0,3 m/min): o navegador nao entrega sempre os mesmos quadros.
  checar(/velocidade (5\.[789]|6\.[0123]) m\/min · caixa \+ vão \d+ mm .*entre-peças ≈ \d+ mm \(caixa de 200 mm\).*caixa a caixa/.test(t),
    `revisar: a esteira que vai com a medicao, a mesma frase da folha (${t.slice(0, 160)})`);
  // A caixa veio da LARGURA da fechada (v2.119.0): o campo diz de onde, e o
  // aviso da caixa aberta (v2.115.1) nao existe mais — nem o de "sem largura".
  checar(/\(largura da caixa fechada, do cadastro\)/.test(t) && !/Confira a caixa|caixa aberta|Sem a largura|Sem a caixa/.test(t),
    'revisar: a caixa e a largura da fechada, sem aviso');

  const campo = bloco.getByRole('spinbutton', { name: /Comprimento da caixa para o entre-peças/ });
  await campo.fill('250');
  const t2 = (await bloco.innerText()).replace(/\s+/g, ' ');
  checar(/\(caixa de 250 mm\)/.test(t2), 'revisar: trocar a caixa ali refaz o entre-pecas na hora');
  checar(!/\(largura da caixa fechada, do cadastro\)/.test(t2), 'revisar: digitada a caixa, o campo deixa de dizer que e a do cadastro');
}
await revisar.getByRole('button', { name: 'Salvar medição' }).click();
await p.locator('[aria-label="Medição salva"]').waitFor({ timeout: 6000 });
{
  const e = enviados.at(-1)?.esteira;
  checar(e?.distanciaMm === 100 && e?.metodo === 'caixa' && e?.caixas >= 3 && e?.caixaMm === 250
    && Math.abs(e?.atrasoMs - 1000) <= 60 && Math.abs(e?.intervaloMs - 8000) <= 200,
  `a esteira sobe com a medicao salva: distancia, tempo de A ate B, caixa a caixa, intervalo e a caixa (${JSON.stringify(e)})`);
}

/* --------- produto SEM a largura no cadastro: o quadro pede, nunca a aberta */
// O .gs v5.73 manda `largura: null` (codigo sem MEDIDA_EXT_LARGURA): o campo
// fica vazio e diz o que falta; a MEDIDA DA CAIXA (300, a aberta) nao entra no
// lugar. Sem a caixa a esteira NAO vai com a medicao (revisao da v2.119.0): a
// leitura nao se confere pela propria caixa. A revisao mostra o campo e o
// aviso; digitar a caixa traz a esteira de volta.
{
  const ctx2 = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: FUSO });
  const p2 = await ctx2.newPage();
  await semearSessao(p2);
  p2.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(p2, { ...ALVOS, produtos: [{ ...ALVOS.produtos[0], largura: null }] });
  await p2.goto(`${BASE}/analise/embalagem/video`);
  const prep2 = p2.getByRole('region', { name: 'Preparar a medição por vídeo' });
  await prep2.waitFor({ timeout: 8000 });
  await p2.locator('input[type="file"]').setInputFiles(VIDEO);
  await prep2.getByText(/de vídeo/).waitFor({ timeout: 8000 });
  await p2.locator('input[aria-label="Data e hora em que a filmagem começou"]').fill(HOJE_8H);
  await p2.locator('select[aria-label="Produto embalado"]').selectOption('Rack Sirius 1.6');
  await p2.getByRole('button', { name: 'Começar a marcar' }).click();
  const auto2 = p2.getByRole('region', { name: 'Marcação automática' });
  await auto2.waitFor({ timeout: 4000 });
  await irPara(p2, 4);
  // Contexto novo: desenha A e B de novo (as mesmas da leitura do 1o passe).
  await auto2.getByRole('button', { name: 'Desenhar o retângulo' }).click();
  await arrastar(p2, { x: 0.455, y: 0.40 }, { x: 0.485, y: 0.60 });
  const linhaB2 = p2.locator('[aria-label="Linha B: velocidade e entre-peças"]');
  await linhaB2.getByRole('button', { name: 'Desenhar a linha B' }).click();
  await arrastar(p2, { x: 0.61, y: 0.40 }, { x: 0.64, y: 0.60 });
  const campo2 = linhaB2.getByRole('spinbutton', { name: /Comprimento da caixa/ });
  await campo2.waitFor({ timeout: 4000 });
  await linhaB2.getByRole('spinbutton', { name: /Distância real de A até B/ }).fill('100');
  await linhaB2.getByRole('spinbutton', { name: /Distância real de A até B/ }).press('Tab');
  {
    const t = (await linhaB2.innerText()).replace(/\s+/g, ' ');
    checar(await campo2.inputValue() === '' && /Sem a largura da caixa fechada deste produto no cadastro do painel/.test(t)
      && !/voltar ao cadastro/.test(t),
    `sem a largura no cadastro: a caixa fica vazia e o quadro diz por que (nunca a aberta, 300 mm) (${t.slice(-160)})`);
  }
  await irPara(p2, 0);
  await auto2.getByRole('button', { name: 'Marcar volumes automaticamente' }).click();
  await auto2.getByText(/A leitura marcou/).waitFor({ timeout: 120000 });
  {
    const t = (await p2.locator('[aria-label="Esteira medida pelas linhas A e B"]').innerText()).replace(/\s+/g, ' ');
    checar(/Sem a caixa, a esteira não vai com a medição/.test(t),
      'sem a caixa: o quadro da leitura diz que a esteira nao vai com a medicao');
  }
  await irPara(p2, 39);
  await p2.evaluate(() => document.activeElement?.blur());
  await p2.keyboard.press('f');
  const revisar2 = p2.locator('[aria-label="Revisar a medição"]');
  await revisar2.waitFor({ timeout: 6000 });
  const bloco2 = revisar2.locator('[aria-label="Esteira que vai com a medição"]');
  const textoBloco2 = async () => (await bloco2.innerText().catch(() => '')).replace(/\s+/g, ' ');
  {
    const t = await textoBloco2();
    checar(/falta a caixa/.test(t) && /Sem a caixa, a esteira não vai com a medição/.test(t)
      && /Sem a largura da caixa fechada deste produto no cadastro do painel/.test(t) && !/velocidade [\d.]+ m\/min/.test(t),
    `revisar sem caixa: o campo e o aviso aparecem, sem a frase da esteira (${t.slice(0, 200)})`);
  }
  const campoRev2 = bloco2.getByRole('spinbutton', { name: /Comprimento da caixa para o entre-peças/ });
  await campoRev2.fill('200');
  {
    const t = await textoBloco2();
    checar(/\(caixa de 200 mm\)/.test(t) && !/Sem a caixa/.test(t), 'revisar: digitada a caixa, a esteira volta e o aviso sai');
  }
  await campoRev2.fill('');
  checar(/Sem a caixa, a esteira não vai com a medição/.test(await textoBloco2()), 'revisar: apagada a caixa, o aviso volta');
  const antes = enviados.length;
  await revisar2.getByRole('button', { name: 'Salvar medição' }).click();
  await p2.locator('[aria-label="Medição salva"]').waitFor({ timeout: 6000 });
  {
    const novos = enviados.slice(antes);
    checar(novos.length >= 1 && novos.every((c) => c.esteira == null),
      `salvar sem a caixa: a medicao sobe sem a esteira (${JSON.stringify(novos.map((c) => c.esteira))})`);
  }
  await ctx2.close();
}

checar(!erros.length, `sem erro no console da pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
