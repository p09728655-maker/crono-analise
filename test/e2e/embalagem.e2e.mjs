/**
 * EMBALAGEM TAKT TIME — do toque no tablet a' leitura volume a volume no PC.
 *
 * O servidor e' simulado aqui: o que se prova e' o caminho do dado pela
 * tela — o takt da semana aparece em segundos antes de medir, cada toque
 * vira uma marca que sobe pelo sync, e o PC le essas marcas contra o takt
 * da semana da medicao, com a lacuna apontada.
 *
 * Programa da embalagem: 2.200 VOLUMES na semana, 44 h, uma linha, sem
 * setup -> takt = 44 x 3600 / 2200 = 72,0 s por volume.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/embalagem.e2e.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const GRUPO = {
  id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM',
  horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5,
};
const MAQUINA = { id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true, grupo_id: GRUPO.id };
const CADASTRO = { maquinas: [MAQUINA], grupos: [GRUPO] };

// A semana de HOJE, para o takt casar pela data qualquer que seja o dia do
// teste — pelo dia de SAO PAULO, como o app: em UTC, falhava domingo a noite.
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
  .format(hoje).split('-').map(Number);
const segunda = new Date(Date.UTC(anoSp, mesSp - 1, diaSp));
segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
const DEMANDAS = [{
  ano: segunda.getUTCFullYear(), numero: 1, pecas: 2200, inicio: segunda.toISOString().slice(0, 10),
  atualizado_em: hoje.toISOString(),
}];

// Demora da LISTA de medicoes (ms): para o Voltar que chega antes dela.
let atrasoLista = 0;
// Atraso das marcas de UMA medicao (o painel em "Carregando os toques…").
let atrasoMarcas = 0;

/* OS TEMPOS-ALVO DO PAINEL (v2.106.0, GET /api/maquinas?alvo=1): a regua do
   veredito. Os produtos do teste com o alvo IGUAL ao takt do programa (72,0
   s = 2,48 UEP × 29,036 s, e 527 × 60 ÷ 1.089 = 29,036 — a regua fecha, como
   o painel manda), para os numeros do veredito continuarem os de
   antes — o que muda e' a regua escrita. O 'Produto sem UEP' prova o "sem
   alvo, sem cor". */
const ALVOS = {
  estado: 'ok',
  ref: {
    metaUep: 1089, metaOrigem: 'planilha', setupsDia: 0, setupMin: 0, setupOrigem: 'planilha', setupDia: 0, minDia: 527, minProd: 527, sUep: 29.036,
  },
  produtos: ['Rack Sirius 1.6', 'Toucador Magic New', 'Painel Sirius 1.4', 'Produto rapido']
    .map((rot) => ({ rot, uep: 2.48, alvoMs: 72000 }))
    .concat([{ rot: 'Produto sem UEP', uep: null, alvoMs: null }]),
};
const rotaDosAlvos = (rota, alvos = ALVOS) => (/[?&]alvo=1/.test(rota.request().url())
  ? rota.fulfill({ json: alvos }) : null);

async function simularServidor(pagina, {
  conferencias = [], marcas = null, relogio = null, aoSincronizar, demandas = DEMANDAS, aoAlterar,
  planilha = null, cadastro = CADASTRO, alvos = ALVOS,
} = {}) {
  // `planilha`: o estado da leitura da planilha do PCP que o servidor manda
  // junto do programa da embalagem (ver api/_lib/programaEmbalagem.js).
  await pagina.route('**/api/maquinas**', (rota) => rotaDosAlvos(rota, alvos) || (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas, ...(planilha ? { planilha } : {}) } })
    : rota.fulfill({ json: cadastro })));
  await pagina.route('**/api/conferencias**', async (rota) => {
    const url = new URL(rota.request().url());
    // PATCH de UMA medicao (a analise do PCP): quem testa decide a resposta
    // e quanto ela demora (`atraso`, em ms).
    if (rota.request().method() === 'PATCH') {
      const { atraso = 0, ...resposta } = aoAlterar
        ? aoAlterar(url.searchParams.get('id'), rota.request().postDataJSON())
        : { status: 405, json: { erro: 'PATCH nao simulado' } };
      if (atraso) await new Promise((r) => { setTimeout(r, atraso); });
      return rota.fulfill(resposta);
    }
    if (url.searchParams.get('id')) {
      if (atrasoMarcas) await new Promise((r) => { setTimeout(r, atrasoMarcas); });
      // Uma marca por volume, como o banco exige (cardinality = pecas): a
      // de um toque so' recebe uma.
      const id = url.searchParams.get('id');
      const pecas = Number(conferencias.find((c) => c.id === id)?.pecas) || marcas?.length;
      const destas = marcas ? marcas.slice(0, pecas) : marcas;
      return rota.fulfill({ json: { conferencia: { id, marcas_ms: destas, marcas_relogio_ms: relogio } } });
    }
    if (atrasoLista) await new Promise((r) => { setTimeout(r, atrasoLista); });
    return rota.fulfill({ json: { conferencias, outras: 0 } });
  });
  await pagina.route('**/api/sync**', async (rota) => {
    const corpo = rota.request().postDataJSON();
    aoSincronizar?.(corpo);
    const clientIds = [...(corpo.conferencias || []), ...(corpo.observacoes || [])].map((x) => x.clientId);
    return rota.fulfill({ json: { recebidos: clientIds.length, novos: clientIds.length, clientIds } });
  });
}

/**
 * O GRAFICO NA 1a PAGINA da folha deitada (v2.98.2). A tela vira a area
 * util do A4 deitado (273 x 186 mm = 1032 x 703 px) com a midia de
 * impressao, e mede onde o grafico termina a partir do topo da folha:
 * passando de 703 px, ele iria inteiro para a 2a pagina.
 */
async function fundoDoGraficoNaFolha(pagina, oQue = 'grafico') {
  const antes = pagina.viewportSize();
  await pagina.setViewportSize({ width: 1032, height: 703 });
  await pagina.emulateMedia({ media: 'print' });
  // Sem a barra de rolagem: com ela a folha media 1017 px, e o papel tem
  // 1032 — o texto quebrava mais cedo que na impressao (revisao de 05/11).
  // O scrollbar-gutter: stable do index.html guardava a calha da barra mesmo
  // com overflow hidden: a folha media 1017 px (revisao de 11/11).
  const semRolagem = await pagina.addStyleTag({ content: 'html { overflow: hidden !important; scrollbar-gutter: auto !important; }' });
  const fundo = await pagina.evaluate((oQue) => {
    const folha = document.querySelector('body > .somente-impressao');
    const alvo = oQue === 'conta' ? folha.querySelector('[data-conta-semana]')
      : oQue === 'alvo' ? folha.querySelector('[data-conta-alvo]')
        : folha.querySelector('svg[aria-label^="Intervalo entre"]').closest('figure');
    return alvo ? Math.round(alvo.getBoundingClientRect().bottom - folha.getBoundingClientRect().top) : null;
  }, oQue);
  await semRolagem.evaluate((e) => e.remove());
  await pagina.emulateMedia({ media: 'screen' });
  await pagina.setViewportSize(antes);
  return fundo;
}

const navegador = await chromium.launch({ executablePath: EXEC });

/* ================================================================ TABLET */
const tablet = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const t = await tablet.newPage();
await semearSessao(t);
const errosTablet = [];
t.on('pageerror', (e) => errosTablet.push(e.message));
const enviados = [];
await simularServidor(t, { aoSincronizar: (c) => enviados.push(...(c.conferencias || [])) });

await t.goto(`${BASE}/coleta`);
const atalho = t.getByRole('button', { name: /Embalagem Takt Time/ });
await atalho.waitFor({ timeout: 8000 });
checar(true, 'tablet: atalho proprio "Embalagem Takt Time" na lista de coleta');
await atalho.tap();
await t.waitForFunction(() => location.pathname === '/coleta/embalagem', { timeout: 8000 });
checar(true, 'atalho leva para /coleta/embalagem');

/* v2.106.0: o cartao antes de medir e' o do TEMPO-ALVO do produto; sem
   produto, ele pede o produto, e o takt da semana fica numa linha, como a
   carga — sem julgar. */
const cartaoTakt = t.locator('[aria-label="Tempo-alvo do produto"]');
await cartaoTakt.getByText(/takt 72\.0 s/).waitFor({ timeout: 8000 });
checar(/Carga da semana de \d{2}\/\d{2}: takt 72\.0 s por volume/.test(await cartaoTakt.innerText())
  && /escolha o produto da lista/.test(await cartaoTakt.innerText()),
  'antes do produto: o cartao pede o produto, e o takt da semana vai como carga (72.0 s por volume)');
checar(await t.getByText('EMBALAGEM 01').count() > 0, 'a maquina da embalagem ja vem escolhida');
checar(await t.locator('input[aria-label="Hora inicial"]').count() === 0, 'sem formulario de horarios');
checar(await t.getByRole('radio', { name: '2 ciclos' }).count() === 0, 'sem campo de furacao');

await t.locator('input[aria-label="Produto embalado"]').fill('Rack Sirius 1.6');
await cartaoTakt.getByText('TEMPO-ALVO DO PRODUTO').waitFor({ timeout: 4000 });
checar(/72\.0\s*s por volume\s*Tempo-alvo = 2\.48 UEP × 29\.04 s por UEP = 72\.0 s por volume\. Os 29\.04 s por UEP: \(527 min de jornada\) × 60 ÷ 1089 UEP por dia/.test(await cartaoTakt.innerText()),
  `com o produto: o tempo-alvo dele em segundos, e de onde sai (${(await cartaoTakt.innerText()).replace(/\n/g, ' | ')})`);
await t.getByRole('button', { name: /INICIAR/ }).click();
/* ARMADO: o INICIAR nao abre o relogio. Quem abre e' a LARGADA, o toque
   dado quando um volume fecha — e ela nao conta volume. */
const largada = t.getByRole('button', { name: /Largada/ });
await largada.waitFor({ timeout: 4000 });
checar(/TOQUE QUANDO FECHAR UM VOLUME/.test(await largada.innerText()), 'armado: o alvo pede a largada no fechamento de um volume');
await t.waitForTimeout(600);
const painelArmado = await t.locator('[aria-label="Tempo decorrido"]').innerText();
checar(painelArmado.includes('00:00.0'), `armado: o relogio NAO corre antes da largada (${painelArmado.split('\n')[1]})`);
checar(await t.getByRole('button', { name: 'Parou' }).isDisabled(), 'armado: Parou desabilitado — ainda nao ha periodo');
checar(await t.getByRole('button', { name: /Cancelar/ }).count() === 1, 'armado: Encerrar vira Cancelar');
// O produto da medicao no topo do painel, ja' armado: quem passa pela
// linha ve' o que esta' sendo medido.
checar(painelArmado.split('\n')[0].trim() === 'Rack Sirius 1.6', `armado: o produto no topo do painel (${painelArmado.split('\n')[0]})`);

// Cancelar antes da largada volta ao comeco, sem resultado de zero volumes.
await t.getByRole('button', { name: /Cancelar/ }).click();
await t.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
checar(await t.locator('[aria-label="Resultado da conferência"]').count() === 0, 'cancelar antes da largada volta ao comeco, sem resultado');

/* O QUIQUE DA LUVA: o INICIAR e' onClick, e a largada ocupa o meio da tela
   seguinte. Um segundo contato logo depois do INICIAR nao abre o relogio. */
await t.evaluate(async () => {
  [...document.querySelectorAll('button')].find((b) => /INICIAR/.test(b.innerText)).click();
  await new Promise((r) => { setTimeout(r, 40); });
  document.querySelector('button[aria-label^="Largada"]')
    .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await t.waitForTimeout(500);
checar((await t.locator('[aria-label="Tempo decorrido"]').innerText()).includes('00:00.0')
  && await largada.count() === 1, 'o quique logo depois do INICIAR nao da a largada: relogio em 00:00.0');
// Espera armada de proposito: se o relogio contasse do INICIAR, a 1a marca
// sairia com estes 1,5 s a mais.
await t.waitForTimeout(1500);
await largada.dispatchEvent('pointerdown');
const alvo = t.getByRole('button', { name: 'Contar um volume' });
await alvo.waitFor({ timeout: 4000 });
// O quique da luva logo depois da largada nao vira o volume 1.
await alvo.dispatchEvent('pointerdown');
checar(/TOQUE A CADA VOLUME/.test(await alvo.innerText()), 'depois da largada o alvo diz TOQUE A CADA VOLUME');
checar((await alvo.innerText()).trim().startsWith('0'), 'a largada nao conta volume, nem o quique logo depois dela');
await t.waitForTimeout(600);
checar(!(await t.locator('[aria-label="Tempo decorrido"]').innerText()).includes('00:00.0'), 'depois da largada o relogio corre');
await t.waitForTimeout(260);

for (let i = 0; i < 12; i++) {
  await alvo.dispatchEvent('pointerdown');
  await t.waitForTimeout(260);
}
const painelTempo = await t.locator('[aria-label="Tempo decorrido"]').innerText();
checar(/ÚLTIMO/i.test(painelTempo) && /POR VOLUME/i.test(painelTempo) && /TEMPO-ALVO/i.test(painelTempo)
  && painelTempo.includes('72.0'), 'cronometro rodando mostra ULTIMO, POR VOLUME e TEMPO-ALVO 72.0');
checar(painelTempo.split('\n')[0].trim() === 'Rack Sirius 1.6', `cronometro rodando mostra o produto no topo (${painelTempo.split('\n')[0]})`);
/* v2.98.0: volumes/hora ao vivo (volumes ÷ relogio desde a largada) e o
   painel do mesmo tamanho do alvo — o alvo tomava dois tercos da tela. */
let volHoraAoVivo = null;
{
  // O rotulo diz de que tempo sai: o PERIODO, paradas dentro (v2.98.2).
  const m = /VOL\/H PERÍODO\s*(\d+)/i.exec(painelTempo);
  volHoraAoVivo = m ? Number(m[1]) : null;
  checar(volHoraAoVivo > 0, `cronometro rodando mostra VOL/H PERÍODO ao vivo (${m?.[1]})`);
  // v2.98.1: medido ate' o ULTIMO toque, nao ate' o relogio de agora — sem
  // toque, o numero nao se mexe (nao e' velocimetro).
  await t.waitForTimeout(900);
  const parado = /VOL\/H PERÍODO\s*(\d+)/i.exec(await t.locator('[aria-label="Tempo decorrido"]').innerText());
  checar(parado?.[1] === m?.[1], `sem toque, VOL/HORA fica parado (${m?.[1]} -> ${parado?.[1]})`);
  const barra = await t.getByRole('button', { name: /Desfazer/ }).boundingBox();
  checar(barra.height >= 84, `Desfazer, Parou e Encerrar maiores na embalagem (${Math.round(barra.height)} px)`);
  const painel = await t.locator('[aria-label="Tempo decorrido"]').boundingBox();
  const caixaAlvo = await alvo.boundingBox();
  checar(painel.height >= caixaAlvo.height * 0.9,
    `o painel dos numeros tem ao menos a altura do alvo de toque (${Math.round(painel.height)} x ${Math.round(caixaAlvo.height)} px)`);
}
if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-rodando.png` });

await t.getByRole('button', { name: /Encerrar/ }).click();
const resumo = t.locator('[aria-label="Resultado da conferência"]');
await resumo.waitFor({ timeout: 4000 });
const textoResumo = await resumo.innerText();
checar(/volumes\/hora/i.test(textoResumo), 'resultado em volumes/hora — nao pecas/hora');
checar(/POR VOLUME/i.test(textoResumo) && /LACUNAS/i.test(textoResumo), 'resultado traz tempo por volume e lacunas');
checar(await resumo.locator('select').count() === 0, 'resultado mostra a maquina, sem seletor que nao faz nada');
checar(/PRODUTO/.test(textoResumo), 'o campo e PRODUTO, nao peca');
checar(/Embalagem Takt Time, no PC/.test(await t.locator('main, body').first().innerText())
  && !/relatório Ritmo por máquina/.test(await t.locator('body').innerText()),
  'o aviso de salvar manda para a Embalagem Takt Time — nao para o relatorio de ritmo');
if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-resultado.png`, fullPage: true });

await t.getByRole('button', { name: /salvar conferência/i }).click();
for (let i = 0; i < 40 && !enviados.length; i++) await t.waitForTimeout(150);
const enviado = enviados[0];
checar(Boolean(enviado), 'salvar manda a medicao pelo sync');
checar(enviado?.maquina === 'EMBALAGEM 01' && enviado?.peca === 'Rack Sirius 1.6', 'com maquina e produto');
checar(Array.isArray(enviado?.marcasMs) && enviado.marcasMs.length === 12 && enviado.pecas === 12,
  'os 12 toques sobem como 12 marcas, uma por volume');
checar(enviado?.marcasMs?.every((m, i, a) => i === 0 || m >= a[i - 1]), 'marcas em ordem');
// O relogio abriu na largada: o 1o volume veio ~860 ms depois dela (600 +
// 260), e nao no instante zero — a largada nao vira marca.
checar(enviado?.marcasMs?.[0] >= 800 && enviado?.marcasMs?.[0] < 1800,
  `a 1a marca conta da largada, nao do INICIAR (${enviado?.marcasMs?.[0]} ms)`);
checar(enviado?.marcasRelogioMs === enviado?.marcasMs?.at(-1) - enviado?.marcasMs?.[0],
  'sem parada, o relogio entre toques e o proprio trecho das marcas');
{
  // O VOL/H PERÍODO de antes do Encerrar e' a conta exata: 12 volumes x
  // 3.600.000 ÷ o relogio da largada ao ultimo toque — que, sem parada, e'
  // a ultima marca que subiu pelo sync.
  const esperado = Math.round((12 * 3600000) / enviado?.marcasMs?.at(-1));
  checar(volHoraAoVivo === esperado,
    `VOL/H PERÍODO ao vivo = 12 volumes ÷ tempo ate o ultimo toque (${volHoraAoVivo}, esperado ${esperado})`);
}
/* ------------------- o RELOGIO das marcas: parada descontada e desfazer */
await t.getByRole('button', { name: /Nova conferência/ }).click();
await t.getByRole('button', { name: /INICIAR/ }).click();
await largada.waitFor({ timeout: 4000 });
await t.waitForTimeout(300);
const painelRearmado = await t.locator('[aria-label="Tempo decorrido"]').innerText();
checar(painelRearmado.includes('00:00.0'),
  `armado depois de uma medicao: o relogio mostra 00:00.0, nao o fim da anterior (${painelRearmado.split('\n')[1]})`);
await largada.dispatchEvent('pointerdown');
await alvo.waitFor({ timeout: 4000 });
await t.waitForTimeout(260);
const marcarSetup = async (ms) => {
  await t.getByRole('button', { name: 'Parou' }).click();
  await t.locator('[aria-label="Por que a máquina parou"]').waitFor({ timeout: 4000 });
  await t.waitForTimeout(350); // a lista ignora os primeiros 0,3 s
  await t.getByRole('button', { name: 'Setup / Troca' }).click();
  const v = t.locator('[aria-label="Encerrar a parada e voltar a produzir"]');
  await v.waitFor({ timeout: 4000 });
  await t.waitForTimeout(ms);
  await v.dispatchEvent('pointerdown');
  await t.waitForTimeout(200);
};
// A TROCA ANTES do primeiro volume: fora do trecho entre toques.
await marcarSetup(1200);
for (let i = 0; i < 3; i++) { await alvo.dispatchEvent('pointerdown'); await t.waitForTimeout(260); }
// Setup de ~1,5 s ENTRE toques: tem de SAIR do intervalo seguinte.
await t.getByRole('button', { name: 'Parou' }).click();
await t.locator('[aria-label="Por que a máquina parou"]').waitFor({ timeout: 4000 });
await t.waitForTimeout(350); // a lista ignora os primeiros 0,3 s
await t.getByRole('button', { name: 'Setup / Troca' }).click();
const voltar = t.locator('[aria-label="Encerrar a parada e voltar a produzir"]');
await voltar.waitFor({ timeout: 4000 });
await t.waitForTimeout(1500);
await voltar.dispatchEvent('pointerdown');
await t.waitForTimeout(300);
await alvo.dispatchEvent('pointerdown'); // 4o volume: ~300 ms rodando depois da parada
await t.waitForTimeout(260);
await alvo.dispatchEvent('pointerdown'); // 5o — que vai ser desfeito
await t.getByRole('button', { name: /Desfazer/ }).click();
await t.waitForTimeout(260);
await alvo.dispatchEvent('pointerdown'); // o 5o de verdade
await t.getByRole('button', { name: /Encerrar/ }).click();
await resumo.waitFor({ timeout: 4000 });
enviados.length = 0;
await t.getByRole('button', { name: /salvar conferência/i }).click();
for (let i = 0; i < 40 && !enviados.length; i++) await t.waitForTimeout(150);
const comParada = enviados[0];
const iv = (comParada?.marcasMs || []).slice(1).map((m, i) => m - comParada.marcasMs[i]);
checar(comParada?.marcasMs?.length === 5 && comParada.pecas === 5, 'desfazer tira a marca junto com a contagem: 5 e 5');
checar(iv[2] > 0 && iv[2] < 1000, `parada marcada sai do intervalo seguinte (${iv[2]} ms, nao ~1.800)`);
checar(iv[3] > 400, `apos desfazer, o intervalo conta da marca anterior (${iv[3]} ms)`);
checar(comParada?.marcasMs?.[4] <= comParada?.duracaoMs, 'nenhuma marca passa do fim do periodo');
const paradaNoRelogio = comParada?.marcasRelogioMs - (comParada?.marcasMs?.[4] - comParada?.marcasMs?.[0]);
checar(paradaNoRelogio >= 1400 && paradaNoRelogio < 2500,
  `o relogio entre toques traz a parada dentro (${paradaNoRelogio} ms a mais que o trecho rodando)`);
checar(comParada?.marcasSetupMs >= 1400 && comParada?.marcasSetupMs < 2500,
  `so o setup ENTRE toques conta no trecho (${comParada?.marcasSetupMs} ms; a troca antes do 1o volume fica fora)`);

/* ------------- contagem corrigida a mao: o aviso aparece e as marcas nao sobem */
await t.getByRole('button', { name: /Nova conferência/ }).click();
await t.getByRole('button', { name: /INICIAR/ }).click();
await largada.waitFor({ timeout: 4000 });
await t.waitForTimeout(260);
await largada.dispatchEvent('pointerdown');
await alvo.waitFor({ timeout: 4000 });
await t.waitForTimeout(260);
for (let i = 0; i < 4; i++) { await alvo.dispatchEvent('pointerdown'); await t.waitForTimeout(260); }
await t.getByRole('button', { name: /Encerrar/ }).click();
await t.locator('input[aria-label="Volumes no período"]').fill('20');
checar(await t.getByText(/A contagem foi corrigida à mão/).count() === 1, 'contagem corrigida: o aviso aparece na hora');
enviados.length = 0;
await t.getByRole('button', { name: /salvar conferência/i }).click();
for (let i = 0; i < 40 && !enviados.length; i++) await t.waitForTimeout(150);
checar(enviados[0]?.pecas === 20 && enviados[0]?.marcasMs === null && enviados[0]?.marcasRelogioMs === null,
  'contagem corrigida: 20 volumes, marcas e relogio nao sobem');

checar(errosTablet.length === 0, `tablet sem erro de pagina${errosTablet.length ? `: ${errosTablet[0]}` : ''}`);
await tablet.close();

/* ==================================================================== PC */
const pc = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await pc.newPage();
await semearSessao(p);
const errosPc = [];
p.on('pageerror', (e) => errosPc.push(e.message));

// Doze volumes a cada 60 s e uma lacuna de 200 s no meio (13 intervalos).
const intervalosS = [60, 60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60];
const marcas = [30000];
for (const s of intervalosS) marcas.push(marcas[marcas.length - 1] + s * 1000);
const medicao = {
  id: '00000000-0000-0000-0000-00000000c0f1', maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6',
  iniciado_em: new Date(hoje.getTime() - 1000000).toISOString(), finalizado_em: hoje.toISOString(),
  // A ultima marca cai aos 950 s: o periodo tem de conte-la, como o servidor exige.
  duracao_ms: 1000000, pecas: marcas.length, ciclos_por_peca: 1, furacao_passante: false,
  salvo_em: hoje.toISOString(), arquivada: false, com_marcas: true, paradas: [],
  observacao: 'Faltou caixa às 9h10',
  // A lista ja' traz o relogio entre toques (v2.106.0): e' dele que sai o
  // "ultima medicao" da lista de tempos-alvo, sem abrir uma a uma.
  marcas_relogio_ms: marcas.at(-1) - marcas[0],
};
// Uma segunda, mais antiga: para trocar de medicao e salvar a analise.
const medicao2 = {
  ...medicao, id: '00000000-0000-0000-0000-00000000c0f2', peca: 'Toucador Magic New', observacao: '',
  iniciado_em: new Date(hoje.getTime() - 9000000).toISOString(),
  finalizado_em: new Date(hoje.getTime() - 8000000).toISOString(),
  salvo_em: new Date(hoje.getTime() - 8000000).toISOString(),
};
/* O PATCH da analise: grava o pedido e responde como a API — recusando
   enquanto `recusarAnalise` estiver ligado, para provar que a recusa
   aparece e o painel nao fecha. */
const pedidosAnalise = [];
let recusarAnalise = false;
let atrasoAnalise = 0;
const aoAlterar = (id, corpo) => {
  pedidosAnalise.push({ id, corpo });
  if (recusarAnalise) {
    return { atraso: atrasoAnalise, status: 403, json: { erro: 'Seu papel nao permite esta operacao' } };
  }
  return {
    atraso: atrasoAnalise,
    json: {
      conferencia: corpo.analisada
        ? { id, analisada_em: new Date().toISOString(), analisada_por: 'Mauricio PCP', analise_nota: corpo.analiseNota }
        : { id, analisada_em: null, analisada_por: null, analise_nota: 'Lacunas por falta de caixa' },
    },
  };
};
// Uma de UM toque: tocada, mas sem intervalo — o detalhe nao tem leitura
// nem botao de analise, entao ela nao pode contar em "A analisar".
const medicao3 = {
  ...medicao2, id: '00000000-0000-0000-0000-00000000c0f3', peca: 'Painel Sirius 1.4', pecas: 1,
  iniciado_em: new Date(hoje.getTime() - 12000000).toISOString(),
  finalizado_em: new Date(hoje.getTime() - 11000000).toISOString(),
  salvo_em: new Date(hoje.getTime() - 11000000).toISOString(),
};
// Sem parada marcada: o relogio entre toques e' o proprio trecho, 920 s.
await simularServidor(p, {
  conferencias: [medicao, medicao2, medicao3], marcas, relogio: marcas.at(-1) - marcas[0], aoAlterar,
});

await p.goto(`${BASE}/analise`);
await p.getByRole('button', { name: /^Abrir$/ }).first().waitFor({ timeout: 8000 });
checar(await p.getByText('Embalagem Takt Time').count() > 0, 'PC: Embalagem Takt Time na tela inicial');
await p.getByRole('button', { name: /Embalagem Takt Time/ }).first().click();
await p.waitForFunction(() => location.pathname === '/analise/embalagem', { timeout: 8000 });
checar(true, 'menu leva para /analise/embalagem');

await p.getByText('Takt desta semana · EMBALAGEM').waitFor({ timeout: 8000 });
checar(await p.getByText('72.0 s').count() > 0, 'takt desta semana em segundos: 72.0 s');
/* A SEMANA PELA DATA (v2.104.1, pedido do PCP: "039-26" ao lado do takt
   confundia). O programa daqui e' colado, com INICIO: o cartao diz o dia
   em que a semana comeca, nao o codigo do PCP. */
{
  const kpiTakt = (await p.getByText('Takt desta semana · EMBALAGEM').locator('..').innerText()).replace(/\s+/g, ' ');
  checar(/por volume · semana de \d{2}\/\d{2}/.test(kpiTakt) && !/\d{3}-\d{2}/.test(kpiTakt),
    `takt desta semana: a semana pela data, sem o codigo do PCP (${kpiTakt})`);
}
checar(await p.getByText('Faltou caixa às 9h10').count() > 0, 'a observacao do analista aparece na tabela');

// A tela chega na LISTA: nada abre sozinho. Clicar no produto abre o
// volume a volume AO LADO da lista, que continua a vista — nem janela por
// cima, nem no lugar dela.
const lista = p.getByRole('region', { name: 'Medições da embalagem' });
const janela = p.getByRole('region', { name: /Volume a volume/ });
const botaoFechar = janela.getByRole('button', { name: 'Fechar', exact: true });
// O rotulo sai em caixa alta (CSS): o cartao e' o pai dele.
const cartao = p.getByText('A analisar', { exact: true }).locator('..');
const verVista = async (nome) => {
  await lista.getByRole('button', { name: new RegExp(`^${nome} \\(`) }).click();
};
await lista.waitFor({ timeout: 8000 });
checar(await janela.count() === 0, 'a tela chega na lista: nenhuma medicao abre sozinha');
checar(/A analisar\s*2\s*de 2 medições volume a volume em 30 dias/i.test(await cartao.innerText()),
  `cartao "A analisar": 2 de 2 em 30 dias — a de um toque so' nao conta (${(await cartao.innerText()).replace(/\n/g, ' | ')})`);
checar(await lista.getByRole('button', { name: 'Não analisadas (2)' }).count() === 1
  && await lista.getByRole('button', { name: 'Analisadas (0)', exact: true }).count() === 1
  && await lista.getByRole('button', { name: 'Sem intervalos (1)' }).count() === 1
  && await lista.getByRole('row').filter({ hasText: 'Painel Sirius 1.4' }).count() === 0,
'a fila conta o mesmo que o cartao (2); a de um toque fica em "Sem intervalos", fora da fila');

/* O TEMPO-ALVO DE CADA PRODUTO (v2.106.0): recolhido acima da lista, com a
   regua no titulo; aberto, os medidos com a ultima medicao ao lado do alvo
   (70,8 s contra 72,0 s: 2% dentro) e a de um toque so' fora dos medidos. */
{
  const alvoBloco = p.locator('details[aria-label="Tempo-alvo de cada produto"]');
  const resumo = (await alvoBloco.locator('summary').innerText()).replace(/\s+/g, ' ');
  checar(/a UEP do produto × 29\.04 s por UEP · 2 medidos, com o medido ao lado/.test(resumo) && !/acima do alvo/.test(resumo),
    `tempos-alvo: recolhido, a regua e os 2 medidos no titulo, nenhum acima (${resumo})`);
  checar(!(await alvoBloco.locator('table').isVisible()), 'tempos-alvo: a tabela fica recolhida ate\' abrir');
  await alvoBloco.locator('summary').click();
  const txt = (await alvoBloco.innerText()).replace(/\s+/g, ' ');
  checar(/Tempo-alvo do produto = a UEP dele × 29\.04 s por UEP\. Os 29\.04 s por UEP: \(527 min de jornada\) × 60 ÷ 1089 UEP por dia/.test(txt),
    'tempos-alvo: a conta da regua por extenso');
  const linhaRack = alvoBloco.getByRole('row').filter({ hasText: 'Rack Sirius 1.6' });
  const rack = (await linhaRack.innerText()).replace(/\s+/g, ' ');
  checar(/2\.48 72\.0 s 70\.8 s ✓ 2% dentro 1 · última \d{2}\/\d{2}/.test(rack),
    `tempos-alvo: Rack com UEP, alvo, ultima medicao e a diferenca (${rack})`);
  checar(await alvoBloco.getByRole('row').filter({ hasText: 'Painel Sirius 1.4' }).count() === 0
    && await alvoBloco.getByRole('row').filter({ hasText: 'Produto sem UEP' }).count() === 0,
  'tempos-alvo: a de um toque so\' nao vira medido; os sem medicao ficam no botao');
  await alvoBloco.getByRole('button', { name: /Mostrar também os 3 sem medição/ }).click();
  const semUep = (await alvoBloco.getByRole('row').filter({ hasText: 'Produto sem UEP' }).innerText()).replace(/\s+/g, ' ');
  checar(/— sem UEP — —/.test(semUep), `tempos-alvo: produto sem UEP diz "sem UEP", sem alvo nem diferenca (${semUep})`);
  await alvoBloco.locator('summary').click();
}

await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
// Relogio entre o 1o e o ultimo toque: 920 s / 13 = 70,8 s por volume,
// paradas dentro; takt 72 s. Sem a lacuna: 60 s.
await janela.getByText(/No período, saiu um volume a cada 70.8 s, paradas dentro/).waitFor({ timeout: 8000 });
checar(await p.getByRole('dialog').count() === 0, 'o detalhe abre na propria pagina, sem janela por cima');
{
  const bl = await lista.boundingBox();
  const bj = await janela.boundingBox();
  checar(await lista.isVisible() && await cartao.isVisible() && bj.x >= bl.x + bl.width - 1 && Math.abs(bj.y - bl.y) < 60,
    `aberta a medicao, a lista e os cartoes continuam a vista, e o detalhe fica ao lado (lista x ${Math.round(bl.x)}+${Math.round(bl.width)}, detalhe x ${Math.round(bj.x)})`);
  checar(/Rack Sirius 1\.6/.test(await lista.locator('table').getByRole('button', { pressed: true }).innerText()),
    'na lista, a linha aberta fica marcada');
}
const textoJanela = await janela.innerText();
checar(/dentro do tempo-alvo do produto, 72.0 s, com 2% de folga/.test(textoJanela), 'veredito pelo relogio entre toques: 70.8 s dentro do tempo-alvo de 72.0 s');
/* COMO CHEGAMOS NO TEMPO-ALVO, por extenso, embaixo do veredito; e o takt
   como carga, sem julgar (v2.106.0). */
checar(/Tempo-alvo = 2\.48 UEP × 29\.04 s por UEP = 72\.0 s por volume\. Os 29\.04 s por UEP: \(527 min de jornada\) × 60 ÷ 1089 UEP por dia, a média da linha sem hora extra\./.test(textoJanela.replace(/\s+/g, ' ')),
  'PC: a conta do tempo-alvo por extenso, embaixo do veredito');
checar(/Takt da semana: 72\.0 s por volume — a carga da semana, igual para todo volume; não julga o produto\./.test(textoJanela),
  'PC: o takt da semana fica como carga, sem julgar');
// O valor logo depois do rotulo do proprio cartao — nao um 70.8 qualquer
// mais adiante (manchete, rotulo do grafico).
checar(/POR VOLUME COM A LINHA RODANDO\s*70\.8 s/i.test(textoJanela) && /SEM AS LACUNAS\s*60\.0 s/i.test(textoJanela),
  'as camadas: rodando 70.8 s, sem as lacunas 60.0 s');
checar(/1 lacuna — intervalo maior que o dobro do normal \(60.0 s\)/.test(textoJanela), 'aponta a lacuna contra o normal de 60.0 s');
// Volumes/hora: 14 volumes / 1.000 s de medicao = 50,4 -> 50, o mesmo da
// coluna da lista; e o cartao vem depois de Lacunas.
{
  // Cartao a cartao, na ordem da tela: Lacunas (1, 2min20s alem do normal)
  // e logo depois Volumes/hora.
  const linhaLista = await lista.getByRole('row').filter({ hasText: 'Rack Sirius 1.6' }).first().innerText();
  // v2.99.5: o cartao Lacunas diz os volumes que ela roubou — 200 s numa
  // linha de 60 s: 140 s alem do normal / 60 s = 2,3 -> 2.
  checar(/LACUNAS\s*1\s*2min20s além do normal · ≈2 volumes não embalados\s*VOLUMES\/HORA\s*50\s*na medição inteira, com as paradas/i.test(textoJanela),
    'o cartao Lacunas diz os 2 volumes nao embalados, e Volumes/hora (50) vem logo depois');
  // v2.99.6: o total num passo so' (60 s): 1.000 s / 60 = 16,7 -> lacunas 2
  // (140 s / 60) + antes/depois 0 ((1.000 - 920 - 60) / 60 = 0,3) = 2; 14 + 2 = 16.
  checar(/2\s*volumes\s*deixaram de ser embalados nesta medição/.test(textoJanela)
    && /teriam saído 16 no mesmo tempo: 14% a mais/.test(textoJanela),
    'o bloco: 2 volumes deixaram de ser embalados, teriam saido 16');
  checar(/DE ONDE VEIO\s*Lacunas[^\n]*\n?[\s\S]*?≈2/i.test(textoJanela) && !/Paradas marcadas\s*\d+ s no cronômetro/.test(textoJanela),
    'de onde veio: so as lacunas (sem parada marcada)');
  // As tres camadas do tempo por volume em sequencia, a terceira em cartao.
  checar(/POR VOLUME COM A LINHA RODANDO\s*70\.8 s[\s\S]*?POR VOLUME SEM AS LACUNAS\s*60\.0 s\s*o passo da linha/i.test(textoJanela),
    'o "sem as lacunas" e um cartao, logo depois do "com a linha rodando"');
  checar(/\b50\s*14 volumes/.test(linhaLista), `a lista diz os mesmos 50 volumes/hora (${linhaLista.replace(/\n/g, ' | ')})`);
}
checar(/Faltou caixa às 9h10/.test(textoJanela), 'a observacao aparece junto da lacuna');
checar(await janela.locator('svg[role="img"]').count() === 1, 'grafico volume a volume desenhado');
checar(/Onde a linha parou sem parada marcada/.test(textoJanela) && textoJanela.includes('200.0 s'),
  'lista a lacuna de 200.0 s');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-volume-a-volume.png`, fullPage: true });

// O PDF sai com nome proprio: o "Salvar como PDF" usa o titulo da pagina.
await p.evaluate(() => {
  window.print = () => { window.tituloImpresso = document.title; window.dispatchEvent(new Event('afterprint')); };
});
const tituloAntes = await p.title();
await janela.getByRole('button', { name: 'Imprimir' }).click();
const tituloImpresso = await p.evaluate(() => window.tituloImpresso);
checar(/^Takt Time - Rack Sirius 1\.6 - EMBALAGEM 01 - \d{2}-\d{2}-\d{4} \d{2}h\d{2}$/.test(tituloImpresso || ''),
  `o PDF sai com takt time e o produto no nome (${tituloImpresso})`);
checar(await p.title() === tituloAntes, 'depois de imprimir, a aba volta ao nome do sistema');
checar(await p.locator('body > .somente-impressao h1').innerText().then((t) => /Takt Time — Rack Sirius 1.6/.test(t)),
  'a folha impressa tem o mesmo titulo do arquivo');

await p.emulateMedia({ media: 'print' });
const folha = p.locator('body > .somente-impressao');
checar(await folha.isVisible(), 'impressao: a folha A4 da medicao aparece');
checar(!(await p.locator('#raiz').isVisible()), 'impressao: o resto do app some do papel');
{
  const textoFolha = await folha.innerText();
  checar(/LACUNAS\s*1\s*2min20s além do normal · ≈2 volumes não embalados\s*VOLUMES\/HORA\s*50(?!\d)/i.test(textoFolha),
    'impressao: lacunas com os volumes nao embalados, e volumes/hora (50) depois');
  checar(/DEIXARAM DE SER EMBALADOS\s*2 · teriam saído 16/i.test(textoFolha) && /DE ONDE VEIO\s*paradas 0 · lacunas 2/i.test(textoFolha),
    'impressao: o total e de onde veio na identificacao');
  checar(!/mesmo da lista/.test(textoFolha), 'impressao: o papel nao fala de uma lista que ele nao tem');
}
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-folha.png`, fullPage: true });
await p.emulateMedia({ media: 'screen' });

/* DEITADA (v2.98.0): a folha do volume a volume sai em A4 paisagem, com o
   grafico na largura dela. O tamanho vem do PDF que o Chromium gera, com o
   @page da pagina — o mesmo do "Salvar como PDF". */
const tamanhoDoPdf = async () => {
  // Com a midia emulada em 'screen' (como o resto do teste deixa), o PDF
  // ignoraria o @media print — e com ele o @page — e sairia em Carta.
  await p.emulateMedia({ media: 'print' });
  const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  await p.emulateMedia({ media: 'screen' });
  const caixa = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
  return { pdf, largura: Math.round(Number(caixa?.[1])), altura: Math.round(Number(caixa?.[2])) };
};
{
  const { pdf, largura, altura } = await tamanhoDoPdf();
  checar(largura === 842 && altura === 595, `impressao: a folha da medicao sai em A4 deitado (${largura} x ${altura} pt)`);
  checar(await folha.locator('svg[aria-label^="Intervalo entre"]').getAttribute('width') === '1000',
    'impressao: o grafico ocupa a folha deitada (1000 px de largura, eram 700)');
  /* SEM CALHA (v2.100.2): o valor do takt mora na legenda, e as barras
     chegam perto da borda direita — a faixa de 100 px de rotulos saiu. */
  {
    // `has` e' relativo a' figura: o seletor vai sem a folha na frente.
    const figura = folha.locator('figure', { has: p.locator('svg[aria-label^="Intervalo entre"]') });
    const legenda = await figura.innerText();
    const sobra = await folha.locator('svg[aria-label^="Intervalo entre"]').evaluate((g) => {
      const caixa = g.getBoundingClientRect();
      const barras = [...g.querySelectorAll('rect[fill]')].filter((r) => r.getAttribute('fill') !== 'transparent');
      return Math.round(caixa.right - Math.max(...barras.map((r) => r.getBoundingClientRect().right)));
    });
    // Sem parada entre os toques, periodo = rodando: a linha do periodo nao
    // e' desenhada por cima da pontilhada (revisao de 05/11). O caso com
    // parada, em que ela aparece, esta' no bloco do pior caso.
    checar(!/No período, com as paradas/.test(legenda)
      && await folha.locator('svg[aria-label^="Intervalo entre"] line[data-linha="periodo"]').count() === 0,
    'folha sem parada: periodo = rodando, sem a linha do periodo repetindo a pontilhada');
    /* O TAKT SE VE' (v2.101.1): 3 px e tracos longos; o rodando, fino e
       cinza. Antes os dois tinham 2 px e, com takt e rodando quase iguais,
       viravam um borrao. */
    const linhas = await folha.locator('svg[aria-label^="Intervalo entre"] line[data-linha]').evaluateAll((ls) => Object.fromEntries(
      ls.map((l) => [l.dataset.linha, Number(l.getAttribute('stroke-width'))]),
    ));
    checar(linhas.alvo === 3 && linhas.media < linhas.alvo,
      `folha: o tempo-alvo e a linha mais forte do grafico, o rodando fica abaixo dela (${JSON.stringify(linhas)})`);
    checar(/Tempo-alvo do produto: 72\.0 s/.test(legenda)
      && await folha.locator('svg[aria-label^="Intervalo entre"] text', { hasText: /^Tempo-alvo/ }).count() === 0,
    'folha: o valor do tempo-alvo esta na legenda, nao numa faixa ao lado do grafico');
    checar(sobra <= 30, `folha: as barras chegam ate perto da borda direita (sobram ${sobra} px; eram ~100)`);
    /* O TEMPO DA SEMANA na folha (v2.101.0): a conta do takt por extenso.
       Grupo de 44 h, sem setup, semana inteira: 44 x 3600 / 2200 = 72,0 s. */
    const conta = (await folha.innerText()).replace(/\s+/g, ' ');
    checar(/Tempo da semana de \d{2}\/\d{2} — Por máquina: 44h00min de jornada, sem setup planejado\. 2\.200 volumes na semana → takt 72\.0 s por volume\./.test(conta),
      `folha: o tempo da semana e a conta do takt (${(/Tempo da semana.*?por volume\./.exec(conta) || ['nao achou'])[0]})`);
    checar(/Tempo-alvo do produto ?72\.0 s ?2\.48 UEP × 29\.04 s · takt da semana 72\.0 s/.test(conta),
      `folha: o cartao do tempo-alvo diz de onde ele sai, e o takt da semana como carga (${(/Tempo-alvo do produto.{0,60}/.exec(conta) || ['nao achou'])[0]})`);
    checar(/Tempo-alvo = 2\.48 UEP × 29\.04 s por UEP = 72\.0 s por volume\. Os 29\.04 s por UEP: \(527 min de jornada\) × 60 ÷ 1089 UEP por dia/.test(conta),
      'folha: a conta do tempo-alvo por extenso, depois do grafico');
    // A letra da folha cresceu (v2.101.0): o valor dos campos passa de 10,5 px.
    const letra = await folha.evaluate((f) => parseFloat(getComputedStyle(f).fontSize));
    checar(letra >= 12, `folha: letra maior (base ${letra} px; era 10.5)`);
  }
  if (FOTOS) writeFileSync(`${FOTOS}/pc-folha.pdf`, pdf);
  const fundo = await fundoDoGraficoNaFolha(p);
  checar(fundo <= 703, `folha deitada: o grafico cabe na 1a pagina (termina em ${fundo} de 703 px)`);
  /* No caso comum (nome curto), a CONTA do tempo da semana tambem fica na
     1a pagina: o grafico deixa o espaco dela quando ainda tem a altura
     preferida (v2.101.2; com a altura toda para as barras, ela ia para a 2a). */
  const fundoConta = await fundoDoGraficoNaFolha(p, 'conta');
  checar(fundoConta != null && fundoConta <= 703, `folha deitada: a conta do tempo da semana fica na 1a pagina (termina em ${fundoConta} de 703 px)`);
}

const fechar = async () => {
  await botaoFechar.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
};
await fechar();
checar(await lista.isVisible() && await cartao.isVisible(), 'Fechar tira o detalhe e a lista volta a largura toda');
{
  // Fechado o volume a volume, o @page dele vai junto: o resto segue em pe'.
  const { largura, altura } = await tamanhoDoPdf();
  checar(largura === 595 && altura === 842, `impressao: sem a medicao aberta, a pagina volta ao A4 em pe (${largura} x ${altura} pt)`);
}
// A linha inteira abre, nao so' o nome do produto; clicar de novo fecha.
{
  // A primeira celula e' a da caixa de juntar: o clique nela marca, nao abre.
  const linhaRack = lista.getByRole('row').filter({ hasText: 'Rack Sirius 1.6' }).first();
  await linhaRack.getByRole('cell').first().click();
  await p.waitForTimeout(300);
  checar(await janela.count() === 0, 'clicar na celula da caixa de juntar nao abre a medicao');
  const marcou = linhaRack.getByRole('checkbox');
  checar(await marcou.isChecked(), 'o clique na celula da caixa marca a medicao');
  await marcou.uncheck();
  const celula = linhaRack.getByRole('cell').nth(1);
  await celula.click();
  await janela.waitFor({ timeout: 4000 });
  checar(await lista.isVisible(), 'clicar na linha, fora do nome, tambem abre a medicao ao lado');
  await celula.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  checar(await janela.count() === 0, 'clicar de novo na linha aberta fecha o detalhe');
}

// Com a pagina rolada, abrir ao lado nao a mexe (o detalhe rola por
// dentro), e fechar devolve o foco ao produto de onde se saiu.
{
  await p.setViewportSize({ width: 1440, height: 520 });
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const y0 = await p.evaluate(() => window.scrollY);
  await lista.getByRole('button', { name: 'Toucador Magic New' }).click();
  await janela.getByText(/No período, saiu um volume/).waitFor({ timeout: 4000 });
  await p.waitForTimeout(600);
  const y1 = await p.evaluate(() => window.scrollY);
  await fechar();
  const foco = await p.evaluate(() => document.activeElement?.textContent);
  checar(y0 > 0, `pre-condicao: a pagina estava rolada (${y0} px)`);
  checar(Math.abs(y1 - y0) <= 40, `abrir ao lado nao rola a pagina (${y0} -> ${y1})`);
  checar(foco === 'Toucador Magic New', `fechar devolve o foco ao produto de onde saiu (${foco})`);
  await p.setViewportSize({ width: 1440, height: 1000 });
}

// O Voltar do navegador (e o botao lateral do mouse) fecha o painel, como
// o botao da tela — nao sai da tela levando as notas. Avancar reabre.
// Trocar de medicao com o painel aberto nao empilha: o Voltar fecha.
{
  await lista.getByRole('button', { name: 'Toucador Magic New' }).click();
  await janela.getByRole('heading', { name: 'Toucador Magic New' }).waitFor({ timeout: 4000 });
  await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 4000 });
  await p.goBack();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  const caminho = new URL(p.url()).pathname;
  checar(caminho === '/analise/embalagem' && await lista.isVisible(),
    `trocada a medicao, o Voltar do navegador fecha o painel e fica na lista (${caminho})`);
  await p.goForward();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 4000 });
  checar(await janela.count() === 1, 'Avancar do navegador reabre a medicao');
  // Recarregada (F5) com a medicao aberta, ela reabre — a entrada do
  // historico e' dela, e o Voltar seguinte fecha, sem entrada morta.
  await p.reload();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 8000 });
  checar(await lista.isVisible(), 'F5 com a medicao aberta: ela reabre ao lado da lista');
  await p.goBack();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  checar(new URL(p.url()).pathname === '/analise/embalagem' && await lista.isVisible(),
    'depois do F5, o Voltar do navegador fecha a medicao e fica na lista');
  // F5 com a lista lenta e Voltar ANTES de ela chegar: vale a entrada de
  // agora (a lista), nao a de quando a tela montou (a medicao).
  await p.goForward();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 4000 });
  atrasoLista = 1500;
  await p.reload();
  await p.goBack();
  await lista.waitFor({ timeout: 8000 });
  await p.waitForTimeout(300);
  atrasoLista = 0;
  checar(await janela.count() === 0 && new URL(p.url()).pathname === '/analise/embalagem',
    'F5 e Voltar antes de a lista chegar: a lista aparece, a medicao nao reabre sozinha');
  // Sem nota digitada nem analise salvando, recarregar nao pergunta nada.
  checar(!(await p.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  })), 'sem nada pendente, recarregar ou fechar a aba nao pergunta');
}

/* DUPLO CLIQUE: o segundo clique nao vale. Em Salvar ele nao pode
   analisar de novo; na linha, o segundo fecharia o que o primeiro abriu. */
{
  const salvarTopo = janela.getByRole('button', { name: 'Salvar análise e fechar' });
  const nPedidos = pedidosAnalise.length;
  await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
  await salvarTopo.waitFor({ timeout: 8000 });
  await salvarTopo.dispatchEvent('click', { detail: 2 });
  await botaoFechar.dispatchEvent('click', { detail: 2 });
  await p.waitForTimeout(300);
  checar(pedidosAnalise.length === nPedidos && await janela.count() === 1,
    'o 2o clique de um duplo clique em Salvar ou Fechar nao vale: nada salvo, a medicao segue aberta');
  const bv = await botaoFechar.boundingBox();
  await p.mouse.dblclick(bv.x + bv.width / 2, bv.y + bv.height / 2);
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  await p.waitForTimeout(300);
  checar(await lista.isVisible() && await janela.count() === 0 && await p.getByRole('dialog').count() === 0,
    'duplo clique em Fechar: fecha, e o 2o clique nao reabre medicao nem abre cadastro');
  await lista.getByRole('row').filter({ hasText: 'Rack Sirius 1.6' }).first().getByRole('cell').first()
    .dispatchEvent('click', { detail: 2 });
  await p.waitForTimeout(300);
  checar(await janela.count() === 0, 'na lista, o 2o clique de um duplo clique nao abre a linha');
  await p.getByRole('button', { name: 'Motivos de parada' }).dispatchEvent('click', { detail: 2 });
  await p.getByRole('button', { name: 'Produtos da embalagem' }).dispatchEvent('click', { detail: 2 });
  await p.waitForTimeout(300);
  checar(await p.getByRole('dialog').count() === 0, 'o 2o clique de um duplo clique nao abre os cadastros');
}

/* ANALISE DO PCP: lida a medicao, salvar grava, fecha o painel e a
   medicao SAI da lista — vai para Analisadas, com o selo. */
{
  const salvar = janela.getByRole('button', { name: 'Salvar análise e fechar' });
  const nota = janela.getByRole('textbox', { name: 'Análise do PCP' });
  const linhaDe = (nome) => lista.getByRole('row').filter({ hasText: nome }).first();
  // Como o PCP faz: com uma aberta, clica na outra (troca ao lado).
  const abrirMedicao = async (nome, { esperar = nota } = {}) => {
    if (!(await janela.getByRole('heading', { name: nome }).count())) {
      await lista.getByRole('button', { name: nome }).click();
    }
    await janela.getByRole('heading', { name: nome }).waitFor({ timeout: 4000 });
    await esperar.waitFor({ timeout: 8000 });
  };

  await abrirMedicao('Toucador Magic New');
  // No topo, ao lado de Imprimir e Fechar: a' vista sem rolar nada.
  {
    const bs = await salvar.boundingBox();
    const bv = await botaoFechar.boundingBox();
    checar(bs && bs.y >= 0 && bs.y + bs.height <= 1000 && Math.abs(bs.y - bv.y) < 4,
      `"Salvar análise e fechar" no topo, junto de Fechar, a' vista (y ${Math.round(bs?.y)} px)`);
  }
  // Rolado ate' o campo da nota, o topo gruda: os botoes seguem a' vista.
  await nota.scrollIntoViewIfNeeded();
  {
    const bs = await salvar.boundingBox();
    checar(bs && bs.y >= -1 && bs.y + bs.height <= 1000,
      `rolado ate a nota, Salvar continua a vista no topo (y ${Math.round(bs?.y)} px)`);
  }
  await nota.fill('  Lacunas por falta de caixa  ');

  // Recusado: o aviso aparece no topo, junto do botao, e o painel NAO fecha.
  recusarAnalise = true;
  await salvar.click();
  const aviso = janela.getByRole('alert');
  await aviso.waitFor({ timeout: 4000 });
  checar(/Não deu para salvar: Seu papel nao permite/.test(await aviso.innerText()),
    'recusa do servidor aparece no painel');
  {
    const ba = await aviso.boundingBox();
    const bs = await salvar.boundingBox();
    checar(ba.y > bs.y && ba.y - (bs.y + bs.height) < 60, 'a recusa aparece logo abaixo do botao clicado');
  }
  checar(await janela.count() === 1 && await linhaDe('Toucador Magic New').count() === 1,
    'recusado, o painel continua aberto e a medicao continua na lista');
  checar(await nota.inputValue() === '  Lacunas por falta de caixa  ', 'recusado, a nota digitada continua no campo');

  // A nota e' DA MEDICAO: outra abre com o campo vazio, e fechar nao apaga
  // o que foi digitado.
  await abrirMedicao('Rack Sirius 1.6');
  checar(await nota.inputValue() === '' && await janela.getByRole('alert').count() === 0,
    'outra medicao abre com o campo vazio e sem a recusa da anterior');
  await nota.fill('nota do rack');
  await fechar();
  checar(/Nota digitada, ainda não salva/.test(await linhaDe('Rack Sirius 1.6').innerText()),
    'fechado o painel, a linha avisa que tem nota digitada e nao salva');
  checar(/Análise não salva — abra para ver o motivo/.test(await linhaDe('Toucador Magic New').innerText()),
    'e a recusada avisa que a analise nao foi salva');
  await abrirMedicao('Toucador Magic New');
  checar(await nota.inputValue() === '  Lacunas por falta de caixa  ',
    'reaberta, a nota digitada continua no campo — mesmo depois de escrever na outra');
  checar(/Não deu para salvar/.test(await janela.innerText()), 'reaberta, a recusa dela continua no painel');
  await abrirMedicao('Rack Sirius 1.6');
  checar(await nota.inputValue() === 'nota do rack', 'e a da outra tambem');
  await abrirMedicao('Toucador Magic New');

  // Enquanto salva, Fechar e o campo ficam travados: fechado no meio,
  // ninguem veria uma recusa.
  recusarAnalise = false;
  atrasoAnalise = 1500;
  await salvar.click();
  await janela.getByRole('button', { name: 'Salvando…' }).waitFor({ timeout: 2000 });
  checar(await botaoFechar.isDisabled() && await nota.isDisabled(),
    'salvando: Fechar e o campo da nota travados');
  // Clicar na linha aberta enquanto salva nao fecha: mesma razao.
  await lista.getByRole('button', { name: 'Toucador Magic New' }).click();
  await p.waitForTimeout(100);
  checar(await janela.count() === 1, 'salvando: clicar na linha aberta nao fecha o painel');
  // Sair agora pergunta pelo envio, e nao chama de "nao salva" a nota que
  // esta' indo junto com ele: so' a do Rack (digitada e deixada) conta.
  {
    let pergunta = '';
    p.once('dialog', (d) => { pergunta = d.message(); d.dismiss(); });
    await p.getByRole('button', { name: 'Início' }).click();
    await p.waitForTimeout(100);
    checar(/indo para o servidor/.test(pergunta) && /Há 1 nota digitada e não salva/.test(pergunta),
      `salvando: sair pergunta pelo envio e conta so' a nota do Rack, nao a que vai no envio (${pergunta.split('\n').join(' | ')})`);
  }
  // O Voltar do navegador tambem nao fecha: a recusa precisaria de onde aparecer.
  await p.goBack();
  await p.waitForTimeout(100);
  checar(await janela.count() === 1 && new URL(p.url()).pathname === '/analise/embalagem',
    'salvando: o Voltar do navegador nao fecha a medicao');
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  atrasoAnalise = 0;
  const pedido = pedidosAnalise.at(-1);
  checar(pedido?.id === medicao2.id && pedido.corpo.analisada === true
    && pedido.corpo.analiseNota === 'Lacunas por falta de caixa',
  `salvar manda analisada + a nota aparada, da medicao aberta (${JSON.stringify(pedido?.corpo)})`);
  checar(await linhaDe('Toucador Magic New').count() === 0 && await linhaDe('Rack Sirius 1.6').count() === 1,
    'salvo, o painel fecha e a medicao analisada SAI da lista; a outra fica');
  {
    const foco = await p.evaluate(() => document.activeElement?.textContent);
    checar(foco === 'Rack Sirius 1.6', `salvo, o foco vai a' outra medicao da fila (${foco})`);
  }
  checar(/A analisar\s*1/i.test(await cartao.innerText())
    && await lista.getByRole('button', { name: 'Não analisadas (1)' }).count() === 1
    && await lista.getByRole('button', { name: 'Analisadas (1)', exact: true }).count() === 1,
  'o cartao "A analisar" e a fila descem juntos para 1, sem recarregar');
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-analisada-lista.png` });

  // O Avancar reabre a salva: a lista vai para Analisadas, com a linha marcada.
  await p.goForward();
  await janela.getByRole('heading', { name: 'Toucador Magic New' }).waitFor({ timeout: 4000 });
  checar(await lista.getByRole('button', { name: 'Analisadas (1)', exact: true, pressed: true }).count() === 1
    && /Toucador Magic New/.test(await lista.locator('table').getByRole('button', { pressed: true }).innerText()),
  'Avancar reabre a analisada com a lista em Analisadas e a linha marcada ao lado');
  await fechar();

  // Em Analisadas: o selo com quem salvou; a nao analisada nao aparece.
  await verVista('Analisadas');
  checar(/✓ Analisada · Mauricio PCP/.test(await linhaDe('Toucador Magic New').innerText())
    && await linhaDe('Rack Sirius 1.6').count() === 0,
  'em Analisadas, a medicao salva aparece com o selo e quem salvou; a nao analisada, nao');

  // Aberta de novo: quem, quando e a nota; Reabrir volta para a fila,
  // deixa o painel aberto e devolve a nota ao campo.
  await abrirMedicao('Toucador Magic New', { esperar: janela.getByText(/No período, saiu um volume/) });
  const textoAberta = await janela.innerText();
  checar(/✓ Analisada · Mauricio PCP · em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(textoAberta)
    && /Lacunas por falta de caixa/.test(textoAberta),
  'aberta de novo, o painel mostra quem analisou, quando e a nota');
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-analisada-painel.png` });
  // A folha A4 leva a analise: quem, quando e a nota.
  checar(/Análise do PCP \(Mauricio PCP, \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\): Lacunas por falta de caixa/
    .test(await p.locator('body > .somente-impressao').innerText()),
  'a folha A4 leva a analise do PCP com quem, quando e a nota');
  await janela.getByRole('button', { name: 'Reabrir análise' }).click();
  await salvar.waitFor({ timeout: 4000 });
  checar(pedidosAnalise.at(-1)?.corpo.analisada === false, 'reabrir manda analisada: false');
  checar(await janela.count() === 1
    && await lista.getByRole('button', { name: /^Não analisadas/, pressed: true }).count() === 1
    && /Toucador Magic New/.test(await lista.locator('table').getByRole('button', { pressed: true }).innerText()),
  'reabrir deixa o painel aberto, e a lista volta para a fila com a linha marcada');
  checar(await nota.inputValue() === 'Lacunas por falta de caixa', 'reaberta, a nota volta ao campo para corrigir');
  checar(!/Análise do PCP \(/.test(await p.locator('body > .somente-impressao').innerText()),
    'reaberta, a folha A4 deixa de dizer que foi analisada');
  await fechar();
  await verVista('Não analisadas');
  checar(/A analisar\s*2/i.test(await cartao.innerText()) && await linhaDe('Toucador Magic New').count() === 1,
    'reaberta, volta para a lista e a contar no "A analisar"');

  // Reabrir recusado: a analise continua salva, e a linha (em Analisadas)
  // nao pode dizer "nao salva" ao lado do selo.
  await abrirMedicao('Rack Sirius 1.6');
  await salvar.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  await verVista('Analisadas');
  // Analisada nao tem campo de nota: espera o botao, nao o campo.
  const reabrir = janela.getByRole('button', { name: 'Reabrir análise' });
  await abrirMedicao('Rack Sirius 1.6', { esperar: reabrir });
  recusarAnalise = true;
  await reabrir.click();
  await janela.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/Não deu para reabrir: Seu papel nao permite/.test(await janela.getByRole('alert').innerText()),
    'reabrir recusado: o motivo aparece no painel');
  await fechar();
  const textoRack = await linhaDe('Rack Sirius 1.6').innerText();
  checar(/✓ Analisada/.test(textoRack) && /Não reabriu — abra para ver o motivo/.test(textoRack)
    && !/Análise não salva/.test(textoRack),
  'reabrir recusado: a linha segue em Analisadas e diz que nao reabriu, nao que a analise nao foi salva');
  recusarAnalise = false;

  // A trava e' da medicao que salva, nao da tela: com a do Toucador indo
  // para o servidor, a do Rack abre e fecha pela linha normalmente.
  await abrirMedicao('Rack Sirius 1.6', { esperar: reabrir });
  await reabrir.click();
  await salvar.waitFor({ timeout: 4000 });
  await fechar();
  atrasoAnalise = 4000;
  await abrirMedicao('Toucador Magic New');
  await salvar.click();
  await janela.getByRole('button', { name: 'Salvando…' }).waitFor({ timeout: 2000 });
  await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 4000 });
  await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  checar(await janela.count() === 0, 'com outra analise salvando, clicar na linha aberta (de outra medicao) fecha o painel');
  // O Voltar do navegador tambem: so' a medicao que salva fica presa.
  await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
  await janela.getByRole('heading', { name: 'Rack Sirius 1.6' }).waitFor({ timeout: 4000 });
  await p.goBack();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  checar(new URL(p.url()).pathname === '/analise/embalagem' && await linhaDe('Toucador Magic New').count() === 1,
    'com outra analise salvando, o Voltar do navegador fecha a medicao aberta (de outra), e fica na tela');
  await linhaDe('Toucador Magic New').waitFor({ state: 'detached', timeout: 8000 });
  atrasoAnalise = 0;
  checar(await janela.count() === 0 && await linhaDe('Rack Sirius 1.6').count() === 1,
    'a analise que terminou depois nao reabre nem fecha nada: so\' tira a dela da fila');
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-a-analisar.png` });

  // Salvar a ultima da fila: o foco vai ao botao Analisadas, e a fila
  // vazia diz onde estao as outras.
  await abrirMedicao('Rack Sirius 1.6');
  await salvar.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  {
    const foco = await p.evaluate(() => document.activeElement?.textContent);
    checar(foco === 'Analisadas (2)'
      && /Nada para analisar nos últimos 30 dias\. As lidas estão em Analisadas\. As medidas por horários, com a contagem corrigida à mão ou com um toque só estão em Sem intervalos\./
        .test(await lista.innerText()),
    `salva a ultima da fila: o foco vai a "Analisadas" e a fila vazia diz onde estao as outras (${foco})`);
  }

  // "Sem intervalos": a de um toque abre so' com Fechar — nao ha' o que
  // analisar —, e a dica da vista diz isso.
  await verVista('Sem intervalos');
  checar(/não têm análise do PCP/.test(await lista.innerText()) && !/salve a análise/.test(await lista.innerText()),
    'em "Sem intervalos", a dica diz que elas nao tem analise do PCP');
  await lista.getByRole('button', { name: 'Painel Sirius 1.4' }).click();
  await janela.getByRole('heading', { name: 'Painel Sirius 1.4' }).waitFor({ timeout: 4000 });
  // A carga terminou (com "Carregando" tambem nao ha' botao: nao provaria nada).
  await janela.getByText(/não tem toques suficientes/).waitFor({ timeout: 4000 });
  checar(await janela.getByRole('button', { name: /Salvar análise|Reabrir análise/ }).count() === 0
    && await botaoFechar.count() === 1,
  'a de um toque abre sem botao de analise, so\' com Fechar');
  // Trocada a vista com o painel aberto, fechar poe o foco no botao da
  // vista na tela (a linha da aberta nao esta' nela), nao no corpo.
  await verVista('Analisadas');
  await fechar();
  checar(await p.evaluate(() => document.activeElement?.dataset?.vista) === 'analisadas',
    'trocada a vista com o painel aberto, fechar poe o foco no botao da vista na tela');

  // Sair da tela pela lateral com nota digitada e nao salva: pergunta antes.
  await abrirMedicao('Rack Sirius 1.6', { esperar: reabrir });
  await reabrir.click();
  await salvar.waitFor({ timeout: 4000 });
  await nota.fill('nota que ninguem salvou');
  await fechar();
  let pergunta = null;
  p.once('dialog', (d) => { pergunta = d.message(); d.dismiss(); });
  await p.getByRole('button', { name: 'Início' }).click();
  await p.waitForTimeout(200);
  checar(/Há 1 nota digitada e não salva/.test(pergunta || '')
    && new URL(p.url()).pathname === '/analise/embalagem'
    && /Nota digitada, ainda não salva/.test(await linhaDe('Rack Sirius 1.6').innerText()),
  `sair com nota nao salva pergunta antes; cancelar fica na tela com a nota (${(pergunta || '').split('\n')[0]})`);
  checar(await p.evaluate(() => {
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  }), 'com nota nao salva, recarregar ou fechar a aba tambem pergunta');
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Início' }).click();
  await p.waitForFunction(() => location.pathname === '/analise', { timeout: 4000 });
  checar(true, 'confirmando, sai da tela');
}

checar(errosPc.length === 0, `PC sem erro de pagina${errosPc.length ? `: ${errosPc[0]}` : ''}`);

/* ------- tela estreita (< 1280 px): o painel vem ABAIXO da lista */
{
  /* Lista LONGA e marcas que demoram (400 ms): e' o caso de verdade. Com a
     lista curta a pagina encolhe ao fechar e a rolagem volta sozinha; com
     as marcas instantaneas a leitura chega durante a primeira rolagem — e
     os dois defeitos passavam sem teste. */
  const ctx = await navegador.newContext({ viewport: { width: 1200, height: 800 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  const muitas = Array.from({ length: 15 }, (_, i) => ({
    ...medicao,
    id: `00000000-0000-0000-0000-0000000d${String(i).padStart(4, '0')}`,
    peca: `Produto ${String(i + 1).padStart(2, '0')}`,
    observacao: '',
    iniciado_em: new Date(hoje.getTime() - ((i + 1) * 2000000)).toISOString(),
    finalizado_em: new Date(hoje.getTime() - ((i + 1) * 2000000) + 1000000).toISOString(),
  }));
  await simularServidor(s, { conferencias: muitas, marcas, relogio: marcas.at(-1) - marcas[0] });
  atrasoMarcas = 400;
  await s.goto(`${BASE}/analise/embalagem`);
  const listaE = s.getByRole('region', { name: 'Medições da embalagem' });
  const janelaE = s.getByRole('region', { name: /Volume a volume/ });
  await listaE.waitFor({ timeout: 8000 });
  await listaE.getByRole('button', { name: 'Produto 01' }).click();
  await janelaE.getByText(/No período, saiu um volume/).waitFor({ timeout: 8000 });
  await s.waitForTimeout(1200);
  {
    const bl = await listaE.boundingBox();
    const bj = await janelaE.boundingBox();
    checar(bj.y > bl.y + bl.height - 1 && bj.y >= -1 && bj.y < 80,
      `estreita, com a leitura demorando: o painel vem abaixo da lista e chega ao alto da tela (topo em ${Math.round(bj.y)} px)`);
  }
  await janelaE.getByRole('button', { name: 'Fechar', exact: true }).click();
  await janelaE.waitFor({ state: 'detached', timeout: 4000 });
  await s.waitForTimeout(300);
  const linha = await s.evaluate(() => {
    const r = document.activeElement?.getBoundingClientRect();
    return r ? { texto: document.activeElement.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom) } : null;
  });
  checar(linha?.texto === 'Produto 01' && linha.top >= 0 && linha.bottom <= 800,
    `estreita, lista longa: fechar traz a' vista a linha que recebe o foco (${JSON.stringify(linha)})`);

  // TROCA com o painel aberto e meio a' vista (topo a ~620 px): no primeiro
  // quadro a carga ainda era a da anterior, a pagina era medida alta, e o
  // painel parava no meio com "Carregando". Tem de chegar ao alto tambem.
  await listaE.getByRole('button', { name: 'Produto 01' }).click();
  await janelaE.getByText(/No período, saiu um volume/).waitFor({ timeout: 8000 });
  await s.waitForTimeout(1200);
  await s.evaluate(() => {
    const painel = document.querySelector('[aria-label$="da medição"]');
    window.scrollBy(0, painel.getBoundingClientRect().top - 620);
  });
  await s.waitForTimeout(200);
  const outra = await s.evaluate(() => [...document.querySelectorAll('[data-medicao]')]
    .filter((b) => b.textContent !== 'Produto 01')
    .filter((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; })
    .map((b) => b.textContent)
    .at(-1));
  await listaE.getByRole('button', { name: outra }).click();
  await janelaE.getByRole('heading', { name: outra }).waitFor({ timeout: 4000 });
  await janelaE.getByText(/No período, saiu um volume/).waitFor({ timeout: 8000 });
  await s.waitForTimeout(1200);
  {
    const bj = await janelaE.boundingBox();
    checar(Boolean(outra) && bj.y >= -1 && bj.y < 80,
      `estreita, trocando de medicao com o painel meio a' vista: o painel novo chega ao alto (${outra}, topo em ${Math.round(bj.y)} px)`);
  }
  atrasoMarcas = 0;
  checar(erros.length === 0, `tela estreita sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* ------- programa lido da planilha do PCP: a tela diz de onde e de quando */
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  // A semana da planilha traz os DIAS programados: 4 (Finados, por
  // exemplo). 2.200 volumes em 4 de 5 dias de 44 h -> 35,2 h -> 57,6 s.
  await simularServidor(s, {
    conferencias: [medicao], marcas, relogio: marcas.at(-1) - marcas[0],
    demandas: [{ ...DEMANDAS[0], dias: 4 }],
    planilha: {
      estado: 'ok', ativa: true, grupoId: GRUPO.id, lidaEm: new Date(Date.now() - 300000).toISOString(),
      semanas: 5, linhas: 312, ignoradas: { semData: 0, semQuantidade: 2, duplicadas: 0 }, mudaram: 0,
      conflitos: [{ inicio: '2026-11-16', colada: { ano: 2026, numero: 47, inicio: '2026-09-07' } }],
    },
  });
  const diaDaSegunda = `${String(segunda.getUTCDate()).padStart(2, '0')}/${String(segunda.getUTCMonth() + 1).padStart(2, '0')}`;
  await s.goto(`${BASE}/analise/embalagem`);
  const kpi = s.getByText('Takt desta semana · EMBALAGEM').locator('..');
  await kpi.waitFor({ timeout: 8000 });
  const textoKpi = (await kpi.innerText()).replace(/\n/g, ' | ');
  checar(new RegExp(`57\\.6 s[\\s\\S]*por volume · semana de ${diaDaSegunda} · 4 de 5 dias programados · da planilha do PCP, lida hoje às \\d{2}:\\d{2}`).test(await kpi.innerText()),
    `planilha lida: takt pelas horas dos 4 dias (57.6 s), semana pela data, de onde e quando (${textoKpi})`);
  checar(await s.getByRole('alert').count() === 0, 'planilha lida: nenhum aviso de falha');

  // O programa da semana do grupo: sem colar, sem digitar, sem apagar — e
  // com a origem, a idade e o que ficou de fora.
  await s.goto(`${BASE}/analise/conferencias`);
  await s.getByRole('button', { name: 'Demanda semanal' }).click();
  const demanda = s.locator('[aria-label="Demanda semanal"]');
  const origem = demanda.locator('[aria-label="Origem do programa"]');
  await origem.waitFor({ timeout: 8000 });
  const textoOrigem = await origem.innerText();
  checar(/Última leitura hoje às \d{2}:\d{2}: 312 linhas lidas, 5 semanas gravadas/.test(textoOrigem)
    && /2 linhas ficaram de fora: 2 sem quantidade/.test(textoOrigem)
    && /A semana de 16\/11 da planilha não entrou: o número dela já é o da semana colada 047-26, de 07\/09, que foi mantida\. Para a da planilha entrar, apague a colada/.test(textoOrigem.replace(/\s+/g, ' ')),
  `Programa da semana: diz que vem da planilha, quando foi lida e o que ficou de fora (${textoOrigem.replace(/\n/g, ' | ')})`);
  await demanda.locator('table').waitFor({ timeout: 8000 });
  const linhaDaSemana = await demanda.locator('tbody tr').first().innerText();
  checar(/4 de 5/.test(linhaDaSemana) && /57\.6s/.test(linhaDaSemana),
    `Programa da semana: a linha diz 4 de 5 dias e o takt e' o mesmo da tela (${linhaDaSemana.replace(/\s+/g, ' ')})`);
  checar(await demanda.locator('textarea').count() === 0
    && await demanda.getByRole('button', { name: 'Apagar' }).count() === 0
    && await demanda.getByRole('button', { name: 'Apagar o programa deste grupo' }).count() === 0,
  'grupo da planilha: sem colagem, sem semana digitada, sem apagar');
  checar(erros.length === 0, `planilha lida: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  await simularServidor(s, {
    conferencias: [medicao], marcas, relogio: marcas.at(-1) - marcas[0],
    planilha: {
      estado: 'erro', ativa: true, grupoId: GRUPO.id, lidaEm: null, tentadaEm: new Date().toISOString(),
      mensagem: 'A planilha não está compartilhada com a conta de serviço: compartilhe com ritmo@x.iam.gserviceaccount.com (leitor)',
    },
  });
  await s.goto(`${BASE}/analise/embalagem`);
  const alerta = s.getByRole('alert');
  await alerta.waitFor({ timeout: 8000 });
  const kpi = s.getByText('Takt desta semana · EMBALAGEM').locator('..');
  checar(/Não deu para ler a planilha do PCP: A planilha não está compartilhada .*\(leitor\)\. Continua valendo o programa guardado, e a leitura tenta de novo em 1 minuto\. Semana que ainda não foi lida fica sem takt até a leitura voltar/
    .test(await alerta.innerText()) && /72\.0 s/.test(await kpi.innerText()) && !/da planilha do PCP, lida/.test(await kpi.innerText()),
  'planilha nao lida: o aviso diz o motivo e o que acontece, e o takt e\' o do programa guardado');
  // Colar NAO volta com a leitura falhando: o codigo de semana do PCP cairia
  // por cima de outra semana. Apagar fica so' na semana colada (sem dias).
  await s.goto(`${BASE}/analise/conferencias`);
  await s.getByRole('button', { name: 'Demanda semanal' }).click();
  const demanda = s.locator('[aria-label="Demanda semanal"]');
  await demanda.locator('[aria-label="Origem do programa"]').getByRole('alert').waitFor({ timeout: 8000 });
  await demanda.locator('table').waitFor({ timeout: 8000 });
  // Aqui o programa e' so' colado (nenhuma semana lida ainda): apagar tudo
  // nao leva historia da planilha, e o servidor aceita.
  checar(await demanda.locator('textarea').count() === 0
    && await demanda.getByRole('button', { name: 'Apagar', exact: true }).count() === 1
    && await demanda.getByRole('button', { name: 'Apagar o programa deste grupo' }).count() === 1,
  'planilha nao lida: sem colagem; a semana colada tem Apagar');
  await ctx.close();
}

/* ------- semana da planilha sem os dias de producao: o campo vem aberto */
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  await simularServidor(s, {
    conferencias: [medicao], marcas, relogio: marcas.at(-1) - marcas[0],
    // A lida desta semana e uma colada antiga (semana inteira, sem dias).
    demandas: [
      { ...DEMANDAS[0], dias: 4 },
      { ...DEMANDAS[0], numero: 2, inicio: new Date(segunda.getTime() - (14 * 86400000)).toISOString().slice(0, 10) },
    ],
    cadastro: { ...CADASTRO, grupos: [{ ...GRUPO, dias_semana: null }] },
    planilha: {
      estado: 'ok', ativa: true, grupoId: GRUPO.id, lidaEm: new Date().toISOString(),
      semanas: 1, linhas: 10, ignoradas: { semData: 0, semQuantidade: 0, duplicadas: 0 }, mudaram: 0, conflitos: [],
    },
  });
  await s.goto(`${BASE}/analise/conferencias`);
  await s.getByRole('button', { name: 'Demanda semanal' }).click();
  const demanda = s.locator('[aria-label="Demanda semanal"]');
  await demanda.locator('table').waitFor({ timeout: 8000 });
  const resumo = (await demanda.getByText(/semanas? inteiras?/).first().innerText().catch(() => ''));
  checar(await demanda.getByText('Dias de produção').count() > 0,
    'sem os dias de producao: o Tempo disponivel vem aberto, com o campo a vista');
  checar(/Nas semanas lidas da planilha, o takt também precisa dos dias de produção/.test(await demanda.innerText()),
    'sem os dias de producao: o programa gravado diz o que falta');
  checar(/^1 semana inteira, a 002-26, com 2\.200 volumes \(fora 1 da planilha, que sem os dias de produção do grupo não se sabe se é inteira\)/.test(resumo.replace(/\s+/g, ' '))
    && !/só em parte/.test(resumo),
  `sem os dias de producao: o resumo diz por que a semana da planilha ficou de fora (${resumo.replace(/\s+/g, ' ')})`);
  await ctx.close();
}

/* ------- tablet com a semana da planilha: diz os dias, ou o que falta */
{
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(s, { demandas: [{ ...DEMANDAS[0], dias: 4 }] });
  await s.goto(`${BASE}/coleta/embalagem`);
  // v2.106.0: o takt vai na linha da CARGA do cartao do tempo-alvo.
  const cartao = s.locator('[aria-label="Tempo-alvo do produto"]');
  await cartao.getByText(/57\.6/).waitFor({ timeout: 8000 });
  const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
  checar(/Carga da semana de \d{2}\/\d{2}: takt 57\.6 s por volume · 4 de 5 dias programados — não julga o produto/.test(texto),
    `tablet: o takt da semana da planilha diz de quantos dias ele e' (${texto})`);
  await ctx.close();

  // Sem os dias de producao no cadastro, a semana da planilha nao tem takt:
  // nao se presume 5 dias, como nao se presumem 44 h.
  const ctx2 = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const s2 = await ctx2.newPage();
  await semearSessao(s2);
  await simularServidor(s2, {
    demandas: [{ ...DEMANDAS[0], dias: 4 }],
    cadastro: { ...CADASTRO, grupos: [{ ...GRUPO, dias_semana: null }] },
  });
  await s2.goto(`${BASE}/coleta/embalagem`);
  const cartao2 = s2.locator('[aria-label="Tempo-alvo do produto"]');
  await cartao2.getByText(/Faltam/).waitFor({ timeout: 8000 });
  checar(/Takt da semana: Faltam os dias de produção da semana do grupo EMBALAGEM no cadastro\./.test(await cartao2.innerText()),
    'tablet: sem os dias de producao no cadastro, diz o que falta em vez de presumir 5');
  checar(erros.length === 0, `tablet com planilha: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx2.close();
}

/* ---------------- sem programa colado: o tablet so' nao mostra o takt */
{
  /* Programa nao colado e' assunto do PCP: no tablet ninguem tem o que
     fazer com o aviso, e o PC continua avisando. A medicao segue igual. */
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(s, { demandas: [] });
  // O programa (vazio) precisa ter chegado: antes disso o cartao diz
  // "buscando", e o teste passaria sem provar nada.
  const programaChegou = s.waitForResponse(/demanda=1/, { timeout: 8000 });
  await s.goto(`${BASE}/coleta/embalagem`);
  await programaChegou;
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 8000 });
  await s.waitForTimeout(300);
  // v2.106.0: o cartao e' o do TEMPO-ALVO (nao depende do programa); sem
  // programa, ele so' nao traz a linha da carga.
  checar(!/Carga da semana|Takt da semana/.test(await s.locator('[aria-label="Tempo-alvo do produto"]').innerText()),
    'sem programa: o cartao do tempo-alvo nao traz a linha do takt no tablet');
  checar(await s.getByText(/colou/).count() === 0, 'sem programa: nenhum aviso de programa nao colado');
  checar(!(await s.getByRole('button', { name: /INICIAR/ }).isDisabled()), 'sem programa: a medicao comeca normalmente');
  checar(erros.length === 0, `sem programa: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* ---------- DEITADO: a barra de baixo sempre na tela (v2.98.2) ---------- */
// Os spans do painel que saem pela borda dele: numero fatiado pelo overflow.
const fatiadosNoPainel = (pagina) => pagina.evaluate(() => {
  const painel = document.querySelector('[aria-label="Tempo decorrido"]').getBoundingClientRect();
  return [...document.querySelectorAll('[aria-label="Tempo decorrido"] span')]
    .filter((el) => el.getClientRects().length)
    .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > painel.bottom + 0.5 || r.top < painel.top - 0.5; })
    .map((el) => el.innerText);
});
// Linhas que o produto ocupa no painel (0 = escondido) e se o nome saiu inteiro.
const linhasDoProduto = (pagina) => pagina.evaluate(() => {
  const el = document.querySelector('.takt-produto');
  if (!el.getClientRects().length) return { linhas: 0, inteiro: false };
  return {
    linhas: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
    inteiro: el.scrollHeight <= el.clientHeight + 1,
  };
});
// Nome real de 2 linhas: o que mais empurra o painel baixo (revisao de 03/11).
const NOME_LONGO = 'RACK SIRIUS 1.6 C/ PAINEL OFF WHITE/FREIJO 2 VOLUMES';
{
  /* Na v2.98.0 o painel crescia pela largura da tela, e deitado ele nao
     cabia: Desfazer, Parou e Encerrar saiam por baixo de uma tela que nao
     rola, e a medicao so' fechava girando o tablet. Deitado, painel e alvo
     ficam lado a lado. Com o produto no topo (v2.99.3), o painel baixo o
     poe numa linha so' — 740x290 e 667x325 cortavam os numeros de baixo
     com o nome em duas. */
  for (const nome of ['', NOME_LONGO]) {
    for (const [largura, altura] of [[1024, 552], [640, 360], [740, 300], [740, 290], [667, 325]]) {
      const tela = `deitado ${largura}x${altura}${nome ? ', nome longo' : ''}`;
      const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, hasTouch: true });
      const s = await ctx.newPage();
      await semearSessao(s);
      await simularServidor(s, {});
      await s.goto(`${BASE}/coleta/embalagem`);
      if (nome) await s.locator('input[aria-label="Produto embalado"]').fill(nome);
      await s.getByRole('button', { name: /INICIAR/ }).click();
      const largadaD = s.getByRole('button', { name: /Largada/ });
      await largadaD.waitFor({ timeout: 4000 });
      await s.waitForTimeout(300);
      await largadaD.dispatchEvent('pointerdown');
      const alvoD = s.getByRole('button', { name: 'Contar um volume' });
      await alvoD.waitFor({ timeout: 4000 });
      for (let i = 0; i < 3; i++) { await s.waitForTimeout(260); await alvoD.dispatchEvent('pointerdown'); }
      const encerrarD = await s.getByRole('button', { name: /Encerrar/ }).boundingBox();
      const painelD = await s.locator('[aria-label="Tempo decorrido"]').boundingBox();
      const caixaD = await alvoD.boundingBox();
      checar(encerrarD.y + encerrarD.height <= altura,
        `${tela}: Encerrar dentro da tela (termina em ${Math.round(encerrarD.y + encerrarD.height)} de ${altura})`);
      checar(caixaD.x >= painelD.x + painelD.width && caixaD.height >= 120,
        `${tela}: numeros a esquerda, alvo a direita, com ${Math.round(caixaD.height)} px de altura`);
      // Painel baixo: o que nao cabe some inteiro (TEMPO, depois o relogio);
      // nenhum numero fica fatiado pelo overflow do painel.
      const fatiados = await fatiadosNoPainel(s);
      checar(fatiados.length === 0, `${tela}: nada cortado no painel${fatiados.length ? ` (${fatiados.join(', ')})` : ''}`);
      const produtoD = await linhasDoProduto(s);
      if (!nome) {
        // Sem produto escolhido, o painel diz isso — nao fica um vazio mudo.
        checar(await s.locator('[aria-label="Tempo decorrido"]').getByText('Produto não informado').isVisible(),
          `${tela}: sem produto, o painel diz "Produto não informado"`);
      } else if (altura >= 552) {
        checar(produtoD.linhas === 2 && produtoD.inteiro, `${tela}: o nome inteiro, em duas linhas (${produtoD.linhas})`);
      } else {
        checar(produtoD.linhas === 1, `${tela}: painel baixo, o nome numa linha so' (${produtoD.linhas})`);
      }
      await ctx.close();
    }
  }
}

/* ---- navegador sem dvh e sem container query: a tela nao desmonta ---- */
{
  /* Chrome < 108 nao entende dvh, < 105 nao entende cq: o estilo inline
     com eles e' descartado. Simulado apagando esses valores do inline,
     como o navegador faria — as classes reserva tem de assumir. As regras
     @container nao valem sem container, e o @supports not (container-type)
     passa a valer: simulado reescrevendo-o como @media all. Nessas telas,
     sem o produto, nada cortava; com ele, tem de continuar assim. */
  for (const [largura, altura] of [[800, 1280], [1024, 552], [844, 390], [915, 412]]) {
    const ctx = await navegador.newContext({ viewport: { width: largura, height: altura }, hasTouch: true });
    const s = await ctx.newPage();
    await semearSessao(s);
    await simularServidor(s, {});
    await s.goto(`${BASE}/coleta/embalagem`);
    await s.locator('input[aria-label="Produto embalado"]').fill(NOME_LONGO);
    await s.getByRole('button', { name: /INICIAR/ }).click();
    const largadaV = s.getByRole('button', { name: /Largada/ });
    await largadaV.waitFor({ timeout: 4000 });
    await s.waitForTimeout(300);
    await largadaV.dispatchEvent('pointerdown');
    const alvoV = s.getByRole('button', { name: 'Contar um volume' });
    await alvoV.waitFor({ timeout: 4000 });
    for (let i = 0; i < 3; i++) { await s.waitForTimeout(260); await alvoV.dispatchEvent('pointerdown'); }
    await s.evaluate(() => {
      document.querySelectorAll('[style]').forEach((el) => {
        if (/dvh/.test(el.style.height)) el.style.removeProperty('height');
        if (/cq[hw]/.test(el.style.fontSize)) el.style.removeProperty('font-size');
        if (el.style.containerType) el.style.removeProperty('container-type');
      });
      document.querySelectorAll('style').forEach((st) => {
        if (/@supports not \(container-type: size\)/.test(st.textContent)) {
          st.textContent = st.textContent.replace(/@supports not \(container-type: size\)/g, '@media all');
        }
      });
    });
    await s.waitForTimeout(100);
    const caixaV = await alvoV.boundingBox();
    const encerrarV = await s.getByRole('button', { name: /Encerrar/ }).boundingBox();
    const fonte = await s.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.takt-grande')).fontSize));
    checar(caixaV.height >= 150 && encerrarV.y + encerrarV.height <= altura && fonte >= 26,
      `sem dvh e sem cq ${largura}x${altura}: alvo de ${Math.round(caixaV.height)} px, Encerrar na tela, numero grande com ${fonte} px`);
    const fatiadosV = await fatiadosNoPainel(s);
    checar(fatiadosV.length === 0,
      `sem dvh e sem cq ${largura}x${altura}: nada cortado no painel com o nome longo${fatiadosV.length ? ` (${fatiadosV.join(', ')})` : ''}`);
    // Em pe' e alto, o produto aparece (uma linha); na tela baixa, sai.
    const produtoV = await linhasDoProduto(s);
    const esperado = altura > 600 && altura >= largura * 1.25 ? 1 : 0;
    checar(produtoV.linhas === esperado, `sem dvh e sem cq ${largura}x${altura}: produto em ${esperado} linha(s) (${produtoV.linhas})`);
    await ctx.close();
  }
}

/* ------ o RESULTADO de uma medicao salva, no proprio tablet (v2.100.0) */
{
  /* Pedido com foto do tablet: a lista de salvas so' tinha volumes/hora, e
     o resultado so' existia no PC. As contas sao as do teste de unidade
     (leitura-salva.test.js), de mao: 12 toques, dez intervalos de 10 s e
     uma lacuna de 40 s, 60 s de parada no cronometro, medicao de 240 s.
     A da SEMANA PASSADA tem os mesmos toques e outro programa (4.400
     volumes -> takt 36,0 s): o resultado usa o takt da semana DA medicao,
     nao o de hoje (72,0 s), como o PC. */
  const MARCAS = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 150000];
  const passada = new Date(segunda.getTime() - 7 * 86400000);
  const salva = (id, peca, salvoEm) => ({
    id, salvoEm, maquina: 'EMBALAGEM 01', peca, horaInicial: null, horaFinal: null,
    duracaoMs: 240000, pecas: 12, ciclosPorPeca: 1, furacaoPassante: false, observacao: null,
    paradas: [{ motivo: 'falta-material', duracaoMs: 60000 }],
    marcasMs: MARCAS, marcasRelogioMs: 200000, marcasSetupMs: 0,
    pecasPorHora: 240, pecasPorHoraBruto: 180, paradaMs: 60000, produtivoMs: 180000, cicloMedioMs: 15000,
    enviada: true,
  });
  const SALVAS = [
    /* A de hoje tem, alem da parada de 60 s do cronometro, uma de 30 s
       anotada depois, no resultado: o quadro dos motivos soma 90 s, e o De
       onde veio (o relogio entre os toques) fica nos 60 s. O motivo da de
       60 s e' do CADASTRO DA EMPRESA (falta_caixa), nao dos de fabrica. */
    {
      ...salva('salva-hoje', 'Rack Sirius 1.6', new Date().toISOString()),
      paradas: [{ motivo: 'falta_caixa', duracaoMs: 60000 }, { motivo: 'outro', duracaoMs: 30000 }],
      paradaMs: 90000, produtivoMs: 150000, pecasPorHora: 288,
    },
    // Quarta da semana passada, meio da tarde em Sao Paulo.
    salva('salva-passada', 'Painel Antigo', new Date(passada.getTime() + 2 * 86400000 + 18 * 3600000).toISOString()),
    // SEM PARADA: a linha dela nao leva o "período" embaixo, e e' ela que
    // prova o alinhamento — com todas as linhas com parada, a coluna antiga
    // (sem largura fixa) tambem saia igual (achado da revisao).
    {
      ...salva('salva-sem-parada', 'Livreiro Encanto', new Date(Date.now() - 3600000).toISOString()),
      paradas: [], paradaMs: 0, marcasRelogioMs: 140000, produtivoMs: 240000, pecasPorHora: 180,
    },
  ];
  const ctx = await navegador.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true });
  const s = await ctx.newPage();
  await semearSessao(s);
  // Semeia UMA vez: o F5 e a remocao abaixo precisam do que ficou no aparelho.
  await s.addInitScript((lista) => {
    if (localStorage.getItem('e2e-salvas-semeadas')) return;
    localStorage.setItem('ritmopatrimar.conferencias', JSON.stringify(lista));
    localStorage.setItem('e2e-salvas-semeadas', '1');
  }, SALVAS);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(s, {
    demandas: [...DEMANDAS, {
      ano: passada.getUTCFullYear(), numero: 2, pecas: 4400, inicio: passada.toISOString().slice(0, 10),
      atualizado_em: new Date().toISOString(),
    }],
  });
  // O cadastro de motivos da empresa: "Falta de caixa" nao existe nos de fabrica.
  await s.route('**/api/motivos-parada**', (rota) => rota.fulfill({
    json: {
      motivos: [
        { codigo: 'setup', rotulo: 'Setup / Troca', acao: 'SMED', grupos: [], ativo: true },
        { codigo: 'falta_caixa', rotulo: 'Falta de caixa', acao: 'Abastecer antes da troca de turno', grupos: [], ativo: true },
        { codigo: 'outro', rotulo: 'Outro', acao: 'Detalhar', grupos: [], ativo: true },
      ],
    },
  }));
  await s.goto(`${BASE}/coleta/embalagem`);
  await s.locator('[aria-label="Tempo-alvo do produto"]').getByText(/takt 72\.0/).waitFor({ timeout: 8000 });

  const linhas = s.locator('button[aria-label^="Ver o resultado"]');
  checar(await linhas.count() === 3, 'resultado salvo: cada medicao salva e um botao "Ver o resultado"');
  const nomes = await linhas.evaluateAll((bs) => bs.map((b) => b.querySelector('div > div').innerText.trim()));
  checar(nomes[0] === 'Rack Sirius 1.6', `uma maquina so: o nome dela nao se repete na linha (${nomes[0]})`);
  // ALINHAR (pedido com foto): a coluna de volumes/hora tem a mesma borda em
  // toda linha — com e sem o "período" embaixo.
  const colunas = await linhas.evaluateAll((bs) => bs.map((b) => {
    const r = b.children[1].getBoundingClientRect();
    return `${Math.round(r.left)}-${Math.round(r.right)}`;
  }));
  const comPeriodo = await linhas.evaluateAll((bs) => bs.map((b) => /período/.test(b.children[1].innerText)));
  checar(comPeriodo.includes(true) && comPeriodo.includes(false),
    `o teste do alinhamento tem linha com e sem "período" (${comPeriodo.join(', ')})`);
  checar(new Set(colunas).size === 1, `a coluna de volumes/hora se alinha em todas as linhas (${colunas.join(', ')})`);

  await linhas.first().tap();
  const resultado = s.locator('[aria-label="Resultado da medição salva"]');
  await resultado.waitFor({ timeout: 4000 });
  // O nome vem do cadastro, que chega do servidor: espera por ele.
  await resultado.getByText('Falta de caixa').waitFor({ timeout: 4000 }).catch(() => {});
  const texto = (await resultado.innerText()).replace(/\s+/g, ' ');
  checar(/No período, saiu um volume a cada 18\.2 s, paradas dentro — dentro do tempo-alvo do produto, 72\.0 s/.test(texto),
    `o veredito do PC no tablet, contra o tempo-alvo do produto (${texto.slice(0, 120)})`);
  checar(/Tempo-alvo = 2\.48 UEP × 29\.04 s por UEP = 72\.0 s por volume\. Os 29\.04 s por UEP/.test(texto),
    'tablet: a conta do tempo-alvo por extenso, no resultado salvo');
  checar(/POR VOLUME COM A LINHA RODANDO 12\.7 ?s/i.test(texto) && /POR VOLUME SEM AS LACUNAS 10\.0 ?s/i.test(texto),
    'as camadas: rodando 12.7 s e sem as lacunas 10.0 s');
  checar(/VOLUMES\/HORA 180/i.test(texto), 'volumes/hora 180 — o mesmo numero da linha da lista');
  checar(/12 volumes deixaram de ser embalados nesta medição/.test(texto) && /teriam saído 24/.test(texto),
    'o total que deixou de ser embalado: 12 (6 paradas + 3 lacunas + 3 fora), 24 no passo da linha');
  checar(/Volume 12 40\.0 s \+30\.0 s/.test(texto), 'a lacuna no volume 12: 40.0 s, 30.0 s alem do normal');
  /* POR QUE A LINHA PAROU (v2.104.0), como no PC. Conta de mao: 60 + 30 =
     90 s; 60/90 = 67%, 30/90 = 33%. O De onde veio e' o relogio entre os
     toques: 200 s - 140 s = 60 s — outro numero, e a frase diz por que. A
     copia do tablet nao recebe parada do PC: "no resultado deste tablet". */
  checar(/Por que a linha parou — paradas marcadas, por motivo 1min30s em 2 paradas na medição inteira, o maior motivo primeiro: as marcadas no cronômetro e as anotadas depois, no resultado deste tablet, também as de fora dos toques\./i.test(texto)
    && !/aqui no PC|ou no PC\)/.test(texto),
  `tablet: de que paradas sai o quadro, sem prometer as do PC (${(/Por que a linha parou.{0,260}/i.exec(texto) || ['nao achou'])[0]})`);
  checar(/Falta de caixa 1min00s 1 parada · 67% do parado/.test(texto) && /Outro 30\.0s 1 parada · 33% do parado/.test(texto),
    'tablet: o motivo com o nome do cadastro da empresa (Falta de caixa), o tempo e o % de cada um');
  checar(/O "Paradas marcadas" do De onde veio dá 1min00s: ele conta só o que o cronômetro tirou entre o 1º e o último volume\./.test(texto),
    'tablet: o De onde veio da 1min00s (so entre os toques), e a frase diz por que');
  checar(await resultado.locator('svg[aria-label^="Intervalo entre volumes"]').count() === 1, 'o grafico volume a volume aparece');
  checar(await s.getByRole('button', { name: /INICIAR/ }).count() === 0, 'com o resultado aberto, o INICIAR sai da tela');
  checar(await s.getByText('Resultado salvo neste aparelho').count() === 1, 'o cabecalho diz que e o resultado salvo');

  // O Voltar do tablet (seta do Android) fecha o resultado, nao sai da tela.
  await s.goBack();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
  checar(new URL(s.url()).pathname === '/coleta/embalagem' && await resultado.count() === 0,
    'o Voltar do aparelho fecha o resultado e fica na Embalagem Takt Time');

  // A da semana passada, com o takt DAQUELA semana.
  await linhas.nth(1).tap();
  await resultado.waitFor({ timeout: 4000 });
  const textoPassada = (await resultado.innerText()).replace(/\s+/g, ' ');
  checar(/Takt da semana:? 36\.0 ?s/i.test(textoPassada) && !/takt da semana:? 72\.0/i.test(textoPassada),
    `medicao da semana passada: o takt (a carga) e o daquela semana (36.0 s), nao o de hoje (${textoPassada.slice(0, 160)})`);

  // F5 com o resultado aberto reabre o mesmo; o botao do pe' volta a' lista
  // sem deixar entrada morta no historico.
  await s.reload();
  await resultado.waitFor({ timeout: 8000 });
  checar(/Painel Antigo/.test(await resultado.innerText()), 'F5 com o resultado aberto reabre a mesma medicao');
  await s.getByRole('button', { name: /Voltar às medições salvas/ }).last().tap();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
  checar(await s.evaluate(() => !window.history.state?.embalagemSalva), 'o botao do pe fecha e desfaz a entrada do historico');

  // A seta do cabecalho, com o resultado aberto, volta a' lista — nao sai da tela.
  await linhas.first().tap();
  await resultado.waitFor({ timeout: 4000 });
  await s.getByRole('button', { name: 'Voltar às medições salvas' }).first().tap();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
  checar(new URL(s.url()).pathname === '/coleta/embalagem', 'a seta do cabecalho, com o resultado aberto, volta a lista');

  // Sem parada marcada, o quadro dos motivos nao aparece.
  await linhas.filter({ hasText: 'Livreiro Encanto' }).tap();
  await resultado.waitFor({ timeout: 4000 });
  checar(!/Por que a linha parou/i.test(await resultado.innerText()), 'tablet: sem parada marcada, sem o quadro dos motivos');
  await s.goBack();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });

  // O ESPACO (teclado bluetooth) com o resultado aberto nao arma medicao:
  // o INICIAR nem esta' na tela (achado da revisao).
  await linhas.first().tap();
  await resultado.waitFor({ timeout: 4000 });
  await s.keyboard.press('Space');
  await s.waitForTimeout(400);
  checar(await resultado.count() === 1 && await s.getByRole('button', { name: /Largada/ }).count() === 0,
    'Espaco com o resultado aberto nao arma medicao');
  await s.goBack();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
  checar(await s.getByRole('button', { name: /Largada/ }).count() === 0, 'de volta a lista, nada armado pelo Espaco');

  // A medicao aberta que sai do aparelho (removida, e a tela recarregada):
  // a tela fica na lista e a entrada do historico deixa de ser dela.
  await linhas.first().tap();
  await resultado.waitFor({ timeout: 4000 });
  await s.evaluate(() => {
    const lista = JSON.parse(localStorage.getItem('ritmopatrimar.conferencias'));
    localStorage.setItem('ritmopatrimar.conferencias', JSON.stringify(lista.filter((c) => c.id !== 'salva-hoje')));
  });
  await s.reload();
  await s.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 8000 });
  await s.waitForTimeout(300);
  checar(await resultado.count() === 0 && await s.evaluate(() => !window.history.state?.embalagemSalva),
    'medicao removida: F5 fica na lista, sem entrada morta no historico');

  checar(erros.length === 0, `resultado salvo: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* --- resultado salvo: o takt e' o do grupo DA MEDICAO; e sem rede, a falta e' de rede */
{
  /* Duas linhas de embalagem em grupos diferentes (achado da revisao): a
     do topo (EMBALAGEM 01) e' do programa de 2.200 volumes (72,0 s); a
     medicao salva e' da EMBALAGEM 02, cujo grupo programa 4.400 (36,0 s).
     O PC le' contra 36,0 (grupoDe da medicao); o tablet tem de ler igual. */
  const G2 = { ...GRUPO, id: '00000000-0000-0000-0000-0000000000e2', codigo: '0006', nome: 'EMBALAGEM 2' };
  const M2 = { id: '00000000-0000-0000-0000-0000000000a2', nome: 'EMBALAGEM 02', ativa: true, grupo_id: G2.id };
  const MARCAS = [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 150000];
  const daLinha2 = {
    id: 'salva-linha-2', salvoEm: new Date().toISOString(), maquina: 'EMBALAGEM 02', peca: 'Buffet Prism',
    horaInicial: null, horaFinal: null, duracaoMs: 240000, pecas: 12, ciclosPorPeca: 1, furacaoPassante: false,
    observacao: null, paradas: [{ motivo: 'falta-material', duracaoMs: 60000 }],
    marcasMs: MARCAS, marcasRelogioMs: 200000, marcasSetupMs: 0,
    pecasPorHora: 240, pecasPorHoraBruto: 180, paradaMs: 60000, produtivoMs: 180000, cicloMedioMs: 15000, enviada: true,
  };
  const ctx = await navegador.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true });
  const s = await ctx.newPage();
  await semearSessao(s);
  await s.addInitScript((r) => { localStorage.setItem('ritmopatrimar.conferencias', JSON.stringify([r])); }, daLinha2);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(s, { cadastro: { maquinas: [MAQUINA, M2], grupos: [GRUPO, G2] } });
  // O programa POR GRUPO (a rota de cima responde o mesmo a todos). A
  // ultima rota registrada responde primeiro; o resto segue para a de cima.
  await s.route('**/api/maquinas**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.searchParams.get('demanda') !== '1') return rota.fallback();
    const demandas = url.searchParams.get('grupo') === G2.id ? [{ ...DEMANDAS[0], pecas: 4400 }] : DEMANDAS;
    return rota.fulfill({ json: { demandas } });
  });
  await s.goto(`${BASE}/coleta/embalagem`);
  await s.locator('[aria-label="Tempo-alvo do produto"]').getByText(/takt 72\.0/).waitFor({ timeout: 8000 });
  await s.getByRole('button', { name: /Ver o resultado/ }).first().tap();
  const resultado = s.locator('[aria-label="Resultado da medição salva"]');
  // Espera o takt carregar (a linha da CARGA, v2.106.0), seja ele qual for:
  // o valor e' conferido abaixo, nao esperado.
  await resultado.getByText(/Takt da semana: \d/).first().waitFor({ timeout: 8000 });
  const texto = (await resultado.innerText()).replace(/\s+/g, ' ');
  checar(/Takt da semana: 36\.0 s/i.test(texto) && !/takt da semana:? 72\.0/i.test(texto),
    `duas linhas: o resultado da EMBALAGEM 02 usa o takt do grupo dela (36.0 s), nao o da maquina do topo (${texto.slice(0, 140)})`);
  checar(/EMBALAGEM 02/.test(texto), 'duas maquinas: o resultado diz de qual maquina e a medicao');
  checar(erros.length === 0, `duas linhas: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();

  /* SEM REDE, com o programa guardado so' da semana passada: o resultado
     de hoje diz que falta rede — nao que o PCP deixou a semana sem
     programa, que e' o que "nao cobre a semana" diria. */
  const passada = new Date(segunda.getTime() - 7 * 86400000);
  const ctx2 = await navegador.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true });
  const s2 = await ctx2.newPage();
  await semearSessao(s2);
  await s2.addInitScript(({ r, grupoId, programa }) => {
    localStorage.setItem('ritmopatrimar.conferencias', JSON.stringify([r]));
    localStorage.setItem(`ritmopatrimar.demanda.${grupoId}`, JSON.stringify(programa));
  }, {
    r: { ...daLinha2, maquina: 'EMBALAGEM 01' },
    grupoId: GRUPO.id,
    programa: [{ ...DEMANDAS[0], inicio: passada.toISOString().slice(0, 10), numero: 2 }],
  });
  await simularServidor(s2);
  await s2.route('**/api/maquinas**', (rota) => (new URL(rota.request().url()).searchParams.get('demanda') === '1'
    ? rota.abort()
    : rota.fallback()));
  await s2.goto(`${BASE}/coleta/embalagem`);
  await s2.getByRole('button', { name: /Ver o resultado/ }).first().waitFor({ timeout: 8000 });
  await s2.waitForTimeout(500);
  await s2.getByRole('button', { name: /Ver o resultado/ }).first().tap();
  const res2 = s2.locator('[aria-label="Resultado da medição salva"]');
  await res2.waitFor({ timeout: 4000 });
  const texto2 = (await res2.innerText()).replace(/\s+/g, ' ');
  // v2.106.0: o takt nao julga mais — sem ele, a linha da carga so' nao
  // aparece; o que nao pode e' culpar o PCP ("nao cobre a semana"). O
  // veredito diz por que nao ha' alvo (o produto, aqui, e' de texto livre).
  checar(!/não cobre a semana/.test(texto2) && !/sem programa para comparar/.test(texto2)
    && /Sem tempo-alvo para comparar: o produto não é um da lista do painel/.test(texto2),
  `sem rede: nada culpa o PCP, e o veredito diz por que nao ha' alvo (${texto2.slice(0, 220)})`);
  await ctx2.close();
}

/* ------- Ritmo por maquina: a EMBALAGEM fala em VOLUMES (v2.100.2) */
{
  /* Pedido do PCP com print: o cartao da EMBALAGEM 01 dizia "peças por
     hora" e o quadro do programa "8.500 peças", "209 pç/h". Na embalagem o
     programa e o ritmo sao em volumes — "peças" convidava a colar produtos.
     Uma medicao de hoje: 2 h, 400 volumes, sem parada -> 200 vol/h. */
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 2 * 3600000);
  await simularServidor(s, {
    // Como a API real devolve: a maquina com o codigo e o nome do grupo — e'
    // por eles que o relatorio sabe o grupo de cada cartao (useConferencias).
    cadastro: { maquinas: [{ ...MAQUINA, grupo_codigo: GRUPO.codigo, grupo_nome: GRUPO.nome }], grupos: [GRUPO] },
    conferencias: [{
      id: 'r1', maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6',
      iniciado_em: inicio.toISOString(), finalizado_em: fim.toISOString(), salvo_em: fim.toISOString(),
      duracao_ms: 2 * 3600000, pecas: 400, ciclos_por_peca: 1, arquivada: false, paradas: [], com_marcas: false,
    }],
  });
  await s.goto(`${BASE}/analise/conferencias`);
  const cartoes = s.locator('[aria-label="Resumo por máquina"]');
  await cartoes.waitFor({ timeout: 10000 });
  const textoCartao = (await cartoes.innerText()).replace(/\s+/g, ' ');
  checar(/200 volumes por hora/.test(textoCartao) && /400 volumes/.test(textoCartao) && !/peças/.test(textoCartao),
    `Ritmo por maquina: o cartao da EMBALAGEM 01 fala em volumes (${textoCartao.slice(0, 120)})`);
  // Os numeros do topo somam maquinas: so' a embalagem na tela, volumes.
  const textoKpis = (await s.locator('[aria-label="Resumo do período"]').innerText()).replace(/\s+/g, ' ');
  checar(/200 vol\/h/.test(textoKpis) && /volumes por minuto/.test(textoKpis) && /400 volumes/.test(textoKpis)
    && !/pç|peças/.test(textoKpis),
    `Ritmo por maquina: so a embalagem na tela, o topo fala em volumes (${textoKpis.slice(0, 140)})`);
  const quadro = s.locator('[aria-label="Programa da semana"]');
  await quadro.getByText(/O programa da semana/).waitFor({ timeout: 10000 });
  const textoQuadro = (await quadro.innerText()).replace(/\s+/g, ' ');
  checar(/2\.200 volumes programados/.test(textoQuadro) && /divididos entre/.test(textoQuadro)
    && /vol\/h/.test(textoQuadro) && /por volume/.test(textoQuadro) && !/pç\//.test(textoQuadro) && !/peças/.test(textoQuadro),
    `Ritmo por maquina: o programa da EMBALAGEM em volumes (${textoQuadro.slice(0, 160)})`);
  // A DEMANDA SEMANAL do grupo EMBALAGEM pede VOLUMES, nao pecas.
  await s.getByRole('button', { name: 'Demanda semanal' }).click();
  const janela = s.locator('[aria-label="Demanda semanal"]');
  await janela.waitFor({ timeout: 8000 });
  await janela.getByRole('button', { name: /Digitar uma semana/ }).click();
  checar(await janela.locator('input[aria-label="Volumes"]').count() === 1
    && await janela.locator('input[aria-label="Peças"]').count() === 0,
  'Demanda semanal da embalagem: o campo pede Volumes');
  await janela.getByRole('button', { name: 'Fechar' }).last().click();
  // A FOLHA acompanha: identificacao e tabela em volumes.
  // Lida como os outros e2e do relatorio leem a folha: o texto do bloco
  // .somente-impressao (celulas coladas, sem espaco entre elas).
  const folhaRitmo = await s.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/Total de volumes\s*400/i.test(folhaRitmo) && /Volumes\/hora/.test(folhaRitmo) && !/pç\/h|Peças\/hora/i.test(folhaRitmo),
    `folha do Ritmo por maquina so da embalagem: em volumes (${folhaRitmo.slice(0, 200)})`);
  checar(erros.length === 0, `Ritmo por maquina da embalagem: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}
{
  /* POSTOS MISTURADOS: furadeira e embalagem na mesma tela. O topo soma as
     duas e nao e' de uma coisa so' — fica em pecas; cada cartao fala na
     unidade do grupo dele. */
  const FURA = { id: '00000000-0000-0000-0000-0000000000f1', codigo: '0002', nome: 'FURADEIRA', horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5 };
  const M_FURA = { id: '00000000-0000-0000-0000-0000000000f2', nome: 'FURADEIRA 03', ativa: true, grupo_id: FURA.id, grupo_codigo: '0002', grupo_nome: 'FURADEIRA' };
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const fim = new Date();
  const ini = new Date(fim.getTime() - 3600000).toISOString();
  const med = (id, maquina, pecas) => ({
    id, maquina, peca: 'X', iniciado_em: ini, finalizado_em: fim.toISOString(), salvo_em: fim.toISOString(),
    duracao_ms: 3600000, pecas, ciclos_por_peca: 1, arquivada: false, paradas: [], com_marcas: false,
  });
  await simularServidor(s, {
    cadastro: {
      maquinas: [{ ...MAQUINA, grupo_codigo: GRUPO.codigo, grupo_nome: GRUPO.nome }, M_FURA],
      grupos: [GRUPO, FURA],
    },
    conferencias: [med('m1', 'EMBALAGEM 01', 200), med('m2', 'FURADEIRA 03', 700)],
  });
  await s.goto(`${BASE}/analise/conferencias`);
  const cartoes = s.locator('[aria-label="Resumo por máquina"]');
  await cartoes.waitFor({ timeout: 10000 });
  const topo = (await s.locator('[aria-label="Resumo do período"]').innerText()).replace(/\s+/g, ' ');
  const textoCartoes = (await cartoes.innerText()).replace(/\s+/g, ' ');
  checar(/pç\/h/.test(topo) && /900 peças/.test(topo) && !/vol\/h|volumes/.test(topo),
    `misturado: o topo soma postos diferentes e fica em pecas (${topo.slice(0, 160)})`);
  checar(/200 volumes por hora/.test(textoCartoes) && /700 peças por hora/.test(textoCartoes),
    `misturado: cada cartao na unidade do seu grupo (${textoCartoes.slice(0, 160)})`);
  await ctx.close();
}
{
  /* TEMPO PARADO com parada que nao e' troca/setup: o cartao dizia "7 min"
     e, embaixo, "nenhuma parada marcada" (achado no print de 05/11). */
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const fim = new Date();
  await simularServidor(s, {
    cadastro: { maquinas: [{ ...MAQUINA, grupo_codigo: GRUPO.codigo, grupo_nome: GRUPO.nome }], grupos: [GRUPO] },
    conferencias: [{
      id: 'r2', maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6',
      iniciado_em: new Date(fim.getTime() - 3600000).toISOString(), finalizado_em: fim.toISOString(),
      salvo_em: fim.toISOString(), duracao_ms: 3600000, pecas: 150, ciclos_por_peca: 1, arquivada: false,
      paradas: [{ motivo: 'falta-material', duracao_ms: 420000 }], com_marcas: false,
    }],
  });
  await s.goto(`${BASE}/analise/conferencias`);
  const kpis = s.locator('[aria-label="Resumo do período"]');
  await kpis.waitFor({ timeout: 10000 });
  const texto = (await kpis.innerText()).replace(/\s+/g, ' ');
  checar(/TEMPO PARADO 7 min nenhuma em troca\/setup/i.test(texto) && !/nenhuma parada marcada/.test(texto),
    `TEMPO PARADO com parada marcada nao diz "nenhuma parada marcada" (${texto.slice(0, 200)})`);
  const custo = (await s.locator('[aria-label="Comparativo com e sem parada"]').innerText()).replace(/\s+/g, ' ');
  // Numero e unidade sao elementos vizinhos: o innerText os cola ("150volumes").
  checar(/150\s*volumes/.test(custo) && /vol\/h/.test(custo) && !/peças|pç/.test(custo),
    `"O que a parada custou" so da embalagem: em volumes (${custo.slice(0, 160)})`);
  await ctx.close();
}

/* ---- A FOLHA NO PIOR CASO (revisoes de 05/11): nome em duas linhas, parada,
   setup, semana de 4 de 5 dias e observacao. Com a letra maior da v2.101.0
   e altura FIXA, o grafico ia para a 2a pagina (739, depois 709 px de 703);
   agora a altura e' medida. Duas variantes: a semana digitada com 10 min
   parados e a da PLANILHA ("semana de 02/11 · ...", cartao em 3 linhas)
   com 1 h parada — o periodo passa do topo do eixo e ganha a marca "↑".
   Conta de mao do tempo: 44 h x 4/5 = 35h12min; setup 5/dia x 4 dias x
   15 min = 5h00min; 30h12min x 3600 / 2200 = 49,4 s. */
for (const v of [
  { nome: 'semana digitada, 10 min parados', semana: { diasProducao: 4 }, paradaMs: 600000 },
  { nome: 'semana da planilha, 1 h parada', semana: { dias: 4 }, paradaMs: 3600000 },
  /* NOME CURTO (terceira revisao de 05/11): aqui ha' espaco, e o grafico
     levava tudo — a conta do tempo ia para a 2a pagina. Agora o espaco
     dela fica reservado enquanto o grafico tiver a altura preferida. */
  { nome: 'nome curto, sem tempo-alvo: conta na 1a pagina', semana: { diasProducao: 4 }, paradaMs: 600000, peca: 'RACK', contaNa1a: true, semAlvo: true },
  /* COM TEMPO-ALVO (revisao de 11/11): a conta do ALVO vem antes e e' ela
     que fica na 1a pagina; a do takt so' quando couber junto. */
  { nome: 'nome curto, com tempo-alvo', semana: { diasProducao: 4 }, paradaMs: 600000, peca: 'RACK' },
]) {
  const G = { ...GRUPO, setups_dia: 5, setup_min: '15' };
  const intervalos = [60, 60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60, 60, 300, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
  const marcas = [30000];
  for (const x of intervalos) marcas.push(marcas.at(-1) + x * 1000);
  const fim = new Date();
  const duracao = marcas.at(-1) - marcas[0] + v.paradaMs + 120000;
  const MED = {
    id: '00000000-0000-0000-0000-00000000c0f1', maquina: 'EMBALAGEM 01',
    peca: v.peca || 'RACK SIRIUS 1.6 C/ PAINEL OFF WHITE/FREIJO 2 VOLUMES COM PORTA DE VIDRO',
    iniciado_em: new Date(fim.getTime() - duracao).toISOString(), finalizado_em: fim.toISOString(), salvo_em: fim.toISOString(),
    duracao_ms: duracao, pecas: marcas.length, ciclos_por_peca: 1, furacao_passante: false, arquivada: false, com_marcas: true,
    paradas: [{ motivo: 'falta-material', duracao_ms: v.paradaMs }], observacao: 'Faltou caixa às 9h10',
  };
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  await simularServidor(s, {
    cadastro: { maquinas: [MAQUINA], grupos: [G] },
    demandas: [{ ...DEMANDAS[0], ...v.semana }],
    conferencias: [MED],
    marcas,
    relogio: marcas.at(-1) - marcas[0] + v.paradaMs,
    // O PIOR CASO COM TEMPO-ALVO (revisao de 11/11): o produto tem alvo, e a
    // conta dele entra na folha antes da do takt.
    alvos: v.semAlvo ? ALVOS : { ...ALVOS, produtos: [...ALVOS.produtos, { rot: MED.peca, uep: 2.48, alvoMs: 72000 }] },
  });
  await s.goto(`${BASE}/analise/embalagem`);
  await s.getByRole('region', { name: 'Medições da embalagem' }).getByRole('button', { name: /RACK/ }).first().click();
  await s.getByRole('region', { name: /Volume a volume/ }).getByText(/No período/).first().waitFor({ timeout: 10000 });
  await s.waitForTimeout(300);
  const fundo = await fundoDoGraficoNaFolha(s);
  checar(fundo <= 703, `folha no pior caso (${v.nome}, setup, 4 de 5 dias): o grafico cabe na 1a pagina (termina em ${fundo} de 703 px)`);
  {
    const fundoAlvo = await fundoDoGraficoNaFolha(s, 'alvo');
    const fundoConta = await fundoDoGraficoNaFolha(s, 'conta');
    console.log(`     [${v.nome}] grafico ${fundo} · conta do alvo ${fundoAlvo} · conta da semana ${fundoConta}`);
    if (!v.semAlvo) {
      checar(fundoAlvo != null && fundoAlvo <= 703,
        `folha (${v.nome}): a conta do TEMPO-ALVO fica na 1a pagina (termina em ${fundoAlvo} de 703 px)`);
    } else {
      checar(fundoAlvo == null, `folha (${v.nome}): produto fora da lista do painel, sem a conta do alvo`);
    }
    if (v.contaNa1a) {
      checar(fundoConta != null && fundoConta <= 703,
        `folha (${v.nome}): a conta do tempo da semana tambem fica na 1a pagina (termina em ${fundoConta} de 703 px)`);
    }
  }
  const texto = (await s.locator('body > .somente-impressao').innerText()).replace(/\s+/g, ' ');
  checar(/Por máquina: 35h12min de jornada \(4 de 5 dias programados\) − 5h00min de setup planejado = 30h12min\. 2\.200 volumes na semana → takt 49\.4 s por volume\./.test(texto),
    `folha (${v.nome}): a conta do tempo com setup e feriado fecha (${(/Tempo da semana.*?por volume\./.exec(texto) || ['nao achou'])[0]})`);
  /* A LINHA DO PERIODO (v2.101.0, pedido do PCP: "21,7 acima da
     necessidade"): com parada, o periodo passa do rodando — e do takt. */
  const figuraFolha = s.locator('body > .somente-impressao figure');
  const legendaFolha = (await figuraFolha.innerText()).replace(/\s+/g, ' ');
  checar(/No período, com as paradas: \d+\.\d s/.test(legendaFolha)
    && await figuraFolha.locator('svg line[data-linha="periodo"]').count() === 1,
  `folha (${v.nome}): a linha do periodo esta no grafico e na legenda`);
  if (v.paradaMs >= 3600000) {
    // Acima do topo: a linha encosta no topo, e o valor vai escrito nela.
    checar(/acima do topo do gráfico/.test(legendaFolha)
      && await figuraFolha.locator('svg text', { hasText: /^↑ \d+\.\d s no período$/ }).count() === 1,
    `folha (${v.nome}): o periodo acima do topo leva a marca "↑ ... s no período" e o aviso na legenda`);
  }
  await ctx.close();
}

/* ---- DIAS DE PRODUCAO da semana digitada e EDITAR o programa gravado (v2.101.0) */
{
  /* Pedido do PCP com print: a semana de Finados tem 4 dias e o takt dela
     usava a jornada inteira; a 038-26 aparecia ate' 09/11, o dia em que a
     039-26 comeca ("duplicando"); e alterar uma semana era apagar e
     digitar de novo. Conta de mao (grupo de 44 h, 5 dias, sem setup):
     2.200 volumes na semana inteira -> 44 x 3600 / 2200 = 72,0 s;
     em 4 de 5 dias -> 35,2 x 3600 / 2200 = 57,6 s. */
  const proxima = new Date(segunda.getTime() + 7 * 86400000);
  let lista = [
    { ...DEMANDAS[0], numero: 38, inicio: new Date(segunda.getTime() + 86400000).toISOString().slice(0, 10) },
    { ...DEMANDAS[0], numero: 39, pecas: 3000, inicio: proxima.toISOString().slice(0, 10) },
  ];
  let pedido = null;
  let pedidoFura = null;
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const s = await ctx.newPage();
  await semearSessao(s);
  const erros = [];
  s.on('pageerror', (e) => erros.push(e.message));
  // Um segundo grupo, a FURADEIRA, com a mesma 038-26 e outro programa:
  // trocar de grupo no meio da edicao nao pode levar os numeros junto.
  const FURA = { ...GRUPO, id: '00000000-0000-0000-0000-0000000000f9', codigo: '0002', nome: 'FURADEIRA' };
  await simularServidor(s, {
    cadastro: {
      maquinas: [{ ...MAQUINA, grupo_codigo: GRUPO.codigo, grupo_nome: GRUPO.nome },
        { id: '00000000-0000-0000-0000-0000000000f8', nome: 'FURADEIRA 16', ativa: true, grupo_id: FURA.id }],
      grupos: [GRUPO, FURA],
    },
  });
  // O programa com POST: a semana gravada volta na lista, como a API faz.
  await s.route('**/api/maquinas**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.searchParams.get('demanda') !== '1') return rota.fallback();
    if (url.searchParams.get('grupo') === FURA.id) {
      if (rota.request().method() === 'POST') pedidoFura = rota.request().postDataJSON();
      return rota.fulfill({ json: { demandas: [{ ...lista[0], pecas: 120000 }] } });
    }
    if (rota.request().method() === 'POST') {
      pedido = rota.request().postDataJSON();
      const [nova] = pedido.semanas;
      lista = lista.map((d) => (d.numero === nova.numero ? { ...d, ...nova } : d));
      return rota.fulfill({ status: 201, json: { demandas: lista } });
    }
    return rota.fulfill({ json: { demandas: lista } });
  });
  await s.goto(`${BASE}/analise/conferencias`);
  await s.getByRole('button', { name: 'Demanda semanal' }).click();
  const janela = s.locator('[aria-label="Demanda semanal"]');
  await janela.getByText('Programa gravado').waitFor({ timeout: 8000 });
  const ddmm = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const linha38 = janela.locator('tr', { hasText: '038-26' });
  const fim38 = new Date(proxima.getTime() - 86400000);
  checar((await linha38.innerText()).includes(`a ${ddmm(fim38)}`) && !(await linha38.innerText()).includes(`a ${ddmm(proxima)}`),
    `a 038-26 termina na vespera da 039-26 (${ddmm(fim38)}), sem o dia ${ddmm(proxima)} nas duas`);
  checar(/72\.0s/.test(await linha38.innerText()), 'antes de editar: semana inteira, takt 72.0 s');

  await linha38.getByRole('button', { name: 'Editar' }).click();
  const semana = janela.locator('input[aria-label="Semana"]');
  await semana.waitFor({ timeout: 4000 });
  checar(await semana.inputValue() === '038-26' && await semana.isDisabled(),
    'Editar traz a semana para o formulario, com a semana travada');
  checar(await janela.locator('input[aria-label="Volumes"]').inputValue() === '2.200',
    'Editar traz os volumes gravados');
  await janela.locator('input[aria-label="Dias de produção"]').fill('4');
  checar(/4 de 5 dias de produção/.test(await janela.innerText()), 'a previa diz 4 de 5 dias de producao');
  await janela.getByRole('button', { name: 'Salvar alteração' }).click();
  for (let i = 0; i < 40 && !pedido; i++) await s.waitForTimeout(100);
  checar(pedido?.semanas?.length === 1 && pedido.semanas[0].numero === 38 && pedido.semanas[0].diasProducao === 4
    && pedido.semanas[0].pecas === 2200,
  `salvar alteracao manda a 038-26 com 4 dias (${JSON.stringify(pedido?.semanas)})`);
  await janela.locator('tr', { hasText: '038-26' }).getByText('57.6s').waitFor({ timeout: 4000 });
  checar(/4 de 5/.test(await janela.locator('tr', { hasText: '038-26' }).innerText()),
    'depois de salvar: 038-26 com 4 de 5 dias e takt 57.6 s');
  // Vazio de novo = a semana inteira: o pedido manda null, e nao omite.
  pedido = null;
  await janela.locator('tr', { hasText: '038-26' }).getByRole('button', { name: 'Editar' }).click();
  // O formulario carrega a semana depois do clique: espera os 4 gravados
  // aparecerem antes de apaga-los.
  await s.waitForFunction(() => document.querySelector('input[aria-label="Dias de produção"]')?.value === '4', null, { timeout: 4000 });
  checar(true, 'Editar traz os dias gravados (4)');
  await janela.locator('input[aria-label="Dias de produção"]').fill('');
  await janela.getByRole('button', { name: 'Salvar alteração' }).click();
  for (let i = 0; i < 40 && !pedido; i++) await s.waitForTimeout(100);
  checar(pedido?.semanas?.[0] && 'diasProducao' in pedido.semanas[0] && pedido.semanas[0].diasProducao === null,
    'apagar os dias manda diasProducao null (volta a semana inteira)');
  /* TROCAR DE GRUPO NO MEIO DA EDICAO (revisao de 05/11): o formulario
     recomeca fechado e vazio. Antes, os 2.200 e os 4 dias da embalagem
     ficavam nos campos, e "Substituir semana" os gravava na furadeira. */
  await janela.locator('tr', { hasText: '038-26' }).getByRole('button', { name: 'Editar' }).click();
  await s.waitForFunction(() => document.querySelector('input[aria-label="Volumes"]')?.value === '2.200', null, { timeout: 4000 });
  await janela.locator('select').first().selectOption(FURA.id);
  await janela.locator('tr', { hasText: '120.000' }).waitFor({ timeout: 8000 });
  await s.waitForTimeout(300);
  checar(!/Alterar a semana/i.test(await janela.innerText()), 'trocar de grupo larga a edicao');
  // Aberto na furadeira, o formulario esta' VAZIO — nao so' fechado.
  await janela.getByRole('button', { name: /Digitar uma semana/ }).click();
  const campos = await janela.locator('input[aria-label="Semana"], input[aria-label="Peças"], input[aria-label="Dias de produção"]')
    .evaluateAll((xs) => xs.map((x) => x.value));
  checar(campos.length === 3 && campos.every((v) => v === '') && pedidoFura === null,
    `trocar de grupo na edicao recomeca o formulario vazio, sem levar os numeros (${JSON.stringify(campos)})`);
  checar(erros.length === 0, `editar semana: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();

  /* O TABLET usa os mesmos dias: a semana digitada com 4 dias da' 57,6 s. */
  const ctx2 = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const t2 = await ctx2.newPage();
  await semearSessao(t2);
  await simularServidor(t2, { demandas: [{ ...DEMANDAS[0], diasProducao: 4 }] });
  await t2.goto(`${BASE}/coleta/embalagem`);
  const cartao = t2.locator('[aria-label="Tempo-alvo do produto"]');
  await cartao.getByText(/57\.6/).waitFor({ timeout: 8000 });
  checar(/4 de 5 dias programados/.test(await cartao.innerText()),
    `tablet: a semana digitada com 4 dias da 57.6 s e diz os dias (${(await cartao.innerText()).replace(/\s+/g, ' ')})`);
  await ctx2.close();
}

/* ====== v2.106.0: PRODUTO SEM UEP NO PAINEL — sem tempo-alvo e SEM COR no
   andon, com o motivo; nunca o takt no lugar (decisao do PPCP, 11/11). O
   takt aqui e' de 1,0 s: se ele pintasse, os volumes a ~1,5 s sairiam
   vermelhos. */
{
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const u = await ctx.newPage();
  await semearSessao(u);
  const erros = [];
  u.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(u, { demandas: [{ ...DEMANDAS[0], pecas: 158400 }] });
  await u.goto(`${BASE}/coleta/embalagem`);
  const cartaoU = u.locator('[aria-label="Tempo-alvo do produto"]');
  await cartaoU.getByText(/takt 1\.0/).waitFor({ timeout: 8000 });
  await u.locator('input[aria-label="Produto embalado"]').fill('Produto sem UEP');
  await cartaoU.getByText(/sem UEP não há tempo-alvo/).waitFor({ timeout: 4000 });
  checar(true, 'sem UEP: o cartao diz que nao ha tempo-alvo, e por que');
  await u.getByRole('button', { name: /INICIAR/ }).click();
  const largadaU = u.getByRole('button', { name: /Largada/ });
  await largadaU.waitFor({ timeout: 4000 });
  await u.waitForTimeout(600); // o quique logo depois do INICIAR nao da' a largada
  await largadaU.dispatchEvent('pointerdown');
  const alvoU = u.getByRole('button', { name: 'Contar um volume' });
  await alvoU.waitFor({ timeout: 4000 });
  for (let i = 0; i < 3; i++) { await u.waitForTimeout(1500); await alvoU.dispatchEvent('pointerdown'); }
  const painelU = u.locator('[aria-label="Tempo decorrido"]');
  const textoU = (await painelU.innerText()).replace(/\s+/g, ' ');
  checar(await painelU.locator('[data-tom]').count() === 0 && !/▲|✓/.test(textoU) && /POR VOLUME 1\.\d\s*s/i.test(textoU),
    `sem UEP: o quadro do tempo por volume mostra o numero e fica SEM COR, nem pelo takt (${textoU.slice(0, 120)})`);
  checar(erros.length === 0, `sem UEP: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* ====== v2.102.0: a PARADA comeca no Parou, o VOLTAR nao perde a medicao,
   o QUADRO do tempo por volume fica vermelho ate' chegar no takt da semana. */
{
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const v = await ctx.newPage();
  await semearSessao(v);
  const erros = [];
  v.on('pageerror', (e) => erros.push(e.message));
  const subiram = [];
  // Takt de 1,0 s (44 h x 3600 / 158.400 volumes) e, desde a v2.106.0, o
  // TEMPO-ALVO do produto de 2,0 s — DIFERENTE do takt, para provar que e'
  // o alvo que pinta o quadro (revisao de 11/11): entre 1 e 2 s por volume,
  // o takt pintaria vermelho e o alvo pinta verde.
  await simularServidor(v, {
    demandas: [{ ...DEMANDAS[0], pecas: 158400 }],
    aoSincronizar: (c) => subiram.push(...(c.conferencias || [])),
    alvos: { ...ALVOS, produtos: [...ALVOS.produtos, { rot: 'Painel Teste', uep: 0.07, alvoMs: 2000 }] },
  });
  await v.goto(`${BASE}/coleta`);
  await v.getByRole('button', { name: /Embalagem Takt Time/ }).tap();
  await v.waitForFunction(() => location.pathname === '/coleta/embalagem', { timeout: 8000 });
  await v.locator('[aria-label="Tempo-alvo do produto"]').getByText(/takt 1\.0/).waitFor({ timeout: 8000 });
  await v.locator('input[aria-label="Produto embalado"]').fill('Painel Teste');
  await v.locator('[aria-label="Tempo-alvo do produto"]').getByText('TEMPO-ALVO DO PRODUTO').waitFor({ timeout: 4000 });
  await v.getByRole('button', { name: /INICIAR/ }).click();
  const largadaV = v.getByRole('button', { name: /Largada/ });
  await largadaV.waitFor({ timeout: 4000 });
  await v.waitForTimeout(260);
  await largadaV.dispatchEvent('pointerdown');
  const alvoV = v.getByRole('button', { name: 'Contar um volume' });
  await alvoV.waitFor({ timeout: 4000 });
  const painelV = v.locator('[aria-label="Tempo decorrido"]');
  const quadro = painelV.locator('[data-tom]');

  /* ---- o quadro do takt e o do tempo por volume */
  checar(/TEMPO-ALVO/i.test(await painelV.innerText()) && /carga da semana: takt 1\.0 s — não julga o produto/i.test(await painelV.innerText()),
    'rodando: o quadro grande e\' o TEMPO-ALVO; o takt da semana vai numa linha, como carga');
  checar(await quadro.count() === 0, 'antes do 2o volume nao ha tempo por volume: o quadro nao tem cor');
  // ~1,5 s por volume: acima do TAKT (1,0 s), dentro do TEMPO-ALVO (2,0 s).
  for (let i = 0; i < 3; i++) { await v.waitForTimeout(1500); await alvoV.dispatchEvent('pointerdown'); }
  const fundoEntre = await quadro.evaluate((e) => getComputedStyle(e).backgroundColor);
  checar(await quadro.getAttribute('data-tom') === 'noTakt' && fundoEntre === 'rgb(21, 128, 61)'
    && /POR VOLUME ✓ ALVO/i.test(await quadro.innerText()),
  `1,5 s por volume: acima do takt (1,0 s) mas dentro do tempo-alvo (2,0 s) — VERDE, e' o alvo que pinta (${fundoEntre})`);
  // Devagar: mais 3 volumes a ~3,5 s; a media do periodo passa do alvo.
  for (let i = 0; i < 3; i++) { await v.waitForTimeout(3500); await alvoV.dispatchEvent('pointerdown'); }
  const fundoAcima = await quadro.evaluate((e) => getComputedStyle(e).backgroundColor);
  checar(await quadro.getAttribute('data-tom') === 'foraDoTakt' && fundoAcima === 'rgb(185, 28, 28)',
    `acima do tempo-alvo o quadro do tempo por volume fica VERMELHO (${fundoAcima})`);
  checar(/POR VOL ▲ ALVO/i.test(await quadro.innerText()), 'e a seta escrita no rotulo continua: a cor nao vai sozinha');
  // Depressa, ate' o tempo por volume chegar no takt.
  for (let i = 0; i < 30 && await quadro.getAttribute('data-tom') === 'foraDoTakt'; i++) {
    await v.waitForTimeout(260);
    await alvoV.dispatchEvent('pointerdown');
  }
  const fundoNoTakt = await quadro.evaluate((e) => getComputedStyle(e).backgroundColor);
  checar(await quadro.getAttribute('data-tom') === 'noTakt' && fundoNoTakt === 'rgb(21, 128, 61)'
    && /POR VOLUME ✓ ALVO/i.test(await quadro.innerText()),
    `chegou no tempo-alvo: o quadro sai do vermelho e fica verde, com o ✓ (${fundoNoTakt})`);

  /* ---- PAROU: a parada conta do toque, e o motivo vem depois */
  const folhaV = v.locator('[aria-label="Por que a máquina parou"]');
  const voltarV = v.locator('[aria-label="Encerrar a parada e voltar a produzir"]');
  await v.waitForTimeout(260);
  await v.getByRole('button', { name: 'Parou' }).click();
  await folhaV.waitFor({ timeout: 4000 });
  checar(/A parada já está contando/.test(await folhaV.innerText()), 'Parou: a lista abre com a parada ja contando');
  await v.waitForTimeout(1500); // lendo a lista: este tempo E' parada
  await folhaV.getByRole('button', { name: 'Motivo na volta' }).click();
  await folhaV.waitFor({ state: 'detached', timeout: 4000 });
  checar(/MOTIVO NA VOLTA/.test(await voltarV.innerText()) && await alvoV.count() === 0,
    'sem motivo, a parada segue contando, bloqueia o volume e avisa que pergunta na volta');
  await v.waitForTimeout(500);
  await voltarV.dispatchEvent('pointerdown');
  await folhaV.waitFor({ timeout: 4000 });
  const textoVolta = await folhaV.innerText();
  checar(/Parada de 00:0\d\.\d/.test(textoVolta) && await folhaV.getByRole('button', { name: 'Motivo na volta' }).count() === 0,
    `Voltou sem motivo: a parada fecha e a lista pede o motivo, sem adiar de novo (${textoVolta.split('\n')[1]})`);
  // Do Parou ao Voltou: 1,5 s com a lista aberta + 0,5 s e os cliques. A
  // lista aberta CONTA (antes, a parada so' comecava no motivo).
  const segundosParada = Number(/Parada de 00:(\d\d\.\d)/.exec(textoVolta)?.[1]);
  checar(segundosParada >= 2 && segundosParada < 2.8,
    `a parada conta do toque no Parou, com a lista aberta dentro (${segundosParada} s)`);
  await v.waitForTimeout(800); // escolher o motivo NAO e' parada
  await folhaV.getByRole('button', { name: 'Falta de material' }).click();
  await alvoV.waitFor({ timeout: 4000 });
  checar(true, 'escolhido o motivo, volta a contar volume');

  // NAO PAROU: o Parou tocado sem querer se desfaz, sem deixar parada.
  await v.getByRole('button', { name: 'Parou' }).click();
  await folhaV.waitFor({ timeout: 4000 });
  // O quique da luva logo depois de abrir nao escolhe nada (guarda de 0,3 s).
  await folhaV.getByRole('button', { name: 'Não parou' }).click();
  await v.waitForTimeout(100);
  checar(await folhaV.count() === 1, 'toque na lista logo ao abrir (quique da luva) e ignorado');
  await v.waitForTimeout(300);
  await folhaV.getByRole('button', { name: 'Não parou' }).click();
  await alvoV.waitFor({ timeout: 4000 });
  checar(true, '"Não parou" desfaz o Parou tocado sem querer');

  /* ---- o VOLTAR cronometrando nao perde a medicao */
  const sairV = v.getByRole('dialog', { name: 'Sair da medição' });
  const contagem = (await alvoV.innerText()).trim().split('\n')[0];
  await v.goBack();
  await sairV.waitFor({ timeout: 4000 });
  checar(new URL(v.url()).pathname === '/coleta/embalagem' && (await alvoV.innerText()).trim().split('\n')[0] === contagem,
    `o Voltar do aparelho cronometrando nao sai da tela: a medicao segue, com os ${contagem} volumes`);
  await sairV.getByRole('button', { name: 'CONTINUAR MEDINDO' }).click();
  await sairV.waitFor({ state: 'detached', timeout: 4000 });
  await v.goBack();
  await sairV.waitFor({ timeout: 4000 });
  checar(new URL(v.url()).pathname === '/coleta/embalagem', 'um segundo Voltar sem querer tambem nao sai');
  await sairV.getByRole('button', { name: 'CONTINUAR MEDINDO' }).click();
  await v.getByRole('button', { name: 'Voltar para a lista' }).click();
  await sairV.waitFor({ timeout: 4000 });
  checar(/cronômetro está rodando/.test(await sairV.innerText()), 'a seta do topo cronometrando tambem pergunta antes de sair');
  await sairV.getByRole('button', { name: 'CONTINUAR MEDINDO' }).click();
  await sairV.waitFor({ state: 'detached', timeout: 4000 });

  /* ---- ENCERRAR com a parada ainda sem motivo: pergunta antes do resultado */
  await v.waitForTimeout(260);
  await alvoV.dispatchEvent('pointerdown');
  await v.getByRole('button', { name: 'Parou' }).click();
  await folhaV.waitFor({ timeout: 4000 });
  await v.waitForTimeout(350);
  await folhaV.getByRole('button', { name: 'Motivo na volta' }).click();
  await v.waitForTimeout(1200);
  // O alvo da parada tambem diz "Encerrar a parada": o da barra e' o ■.
  await v.getByRole('button', { name: '■ Encerrar' }).click();
  await folhaV.waitFor({ timeout: 4000 });
  checar(/ver o resultado/.test(await folhaV.innerText()), 'Encerrar com parada sem motivo pede o motivo antes do resultado');
  // Voltar com a lista pedindo o motivo do Encerrar: o relogio ja' parou.
  await v.goBack();
  await sairV.waitFor({ timeout: 4000 });
  checar(/não foi salva/.test(await sairV.innerText()) && !/rodando/.test(await sairV.innerText()),
    'encerrado, pedindo o motivo: o aviso de sair nao diz que o cronometro esta rodando');
  await sairV.getByRole('button', { name: 'FICAR NO RESULTADO' }).click();
  await sairV.waitFor({ state: 'detached', timeout: 4000 });
  await v.waitForTimeout(350); // a lista abriu no Encerrar ha' pouco: guarda de 0,3 s
  await folhaV.getByRole('button', { name: 'Setup / Troca' }).click();
  const resumoV = v.locator('[aria-label="Resultado da conferência"]');
  await resumoV.waitFor({ timeout: 4000 });
  checar(/TEMPO-ALVO/i.test(await resumoV.innerText()) && /Carga da semana: takt 1\.0 s por volume/.test(await resumoV.innerText()),
    'resultado: o quadro e\' o TEMPO-ALVO, e o takt vai como a carga da semana');

  /* ---- resultado ainda nao salvo: o Voltar tambem pergunta */
  await v.goBack();
  await sairV.waitFor({ timeout: 4000 });
  checar(/não foi salva/.test(await sairV.innerText()) && await resumoV.count() === 1,
    'resultado nao salvo: o Voltar pergunta e o resultado fica na tela');
  await sairV.getByRole('button', { name: 'FICAR NO RESULTADO' }).click();
  await v.getByRole('button', { name: /salvar conferência/i }).click();
  for (let i = 0; i < 40 && !subiram.length; i++) await v.waitForTimeout(150);
  const paradasSalvas = subiram[0]?.paradas || [];
  const falta = paradasSalvas.find((p) => p.motivo === 'falta_material');
  // Os 0,8 s da escolha na volta ficam FORA. A lista de paradas guarda o
  // minuto com duas casas (0,6 s de passo): 2,0 a 2,4 s vira 1.800 ou
  // 2.400 ms; com a escolha dentro (2,8 s ou mais), seriam 3.000.
  checar(falta?.duracaoMs >= 1800 && falta.duracaoMs <= 2400,
    `a parada vai ate' o Voltou, sem o tempo de escolher o motivo (${falta?.duracaoMs} ms)`);
  checar(paradasSalvas.length === 2 && paradasSalvas.some((p) => p.motivo === 'setup' && p.duracaoMs >= 1200),
    `"Não parou" nao deixa parada; a do Encerrar entra com o motivo escolhido (${JSON.stringify(paradasSalvas)})`);
  await v.waitForFunction(() => !window.history.state?.medicaoEmAndamento, { timeout: 4000 });
  await v.goBack();
  await v.waitForFunction(() => location.pathname === '/coleta', { timeout: 4000 });
  checar(true, 'salva, o Voltar sai da tela de primeira — sem Voltar morto no historico');

  /* ---- SAIR E DESCARTAR: vai para a lista, e o historico fica limpo */
  await v.getByRole('button', { name: /Embalagem Takt Time/ }).tap();
  await v.getByRole('button', { name: /INICIAR/ }).click();
  await largadaV.waitFor({ timeout: 4000 });
  await v.getByRole('button', { name: 'Voltar para a lista' }).click();
  await sairV.waitFor({ timeout: 4000 });
  await sairV.getByRole('button', { name: 'Sair e descartar' }).click();
  await v.waitForFunction(() => location.pathname === '/coleta', { timeout: 4000 });
  await v.goBack();
  await v.getByRole('button', { name: /INICIAR/ }).waitFor({ timeout: 4000 });
  checar(await sairV.count() === 0 && await largadaV.count() === 0,
    'sair e descartar: o Voltar da lista reabre a tela vazia, sem medicao nem pergunta');
  await v.goBack();
  await v.waitForFunction(() => location.pathname === '/coleta', { timeout: 4000 });
  checar(true, 'e o Voltar seguinte ja sai: a guarda nao ficou no historico');
  checar(erros.length === 0, `parada e Voltar: sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
  await ctx.close();
}

/* O TOQUE NO VOLTOU SEM MOTIVO, DEITADO (revisao de 05/11): a lista abre no
   pointerdown, debaixo do dedo, e o click do MESMO toque caia num motivo —
   o tablet gravava "Problema de qualidade" sem ninguem escolher. Aqui o
   dedo fica 0,4 s no VOLTOU (passa a guarda de tempo da lista): so' a regra
   "vale o toque que comecou no botao" segura. */
{
  const ctx = await navegador.newContext({ viewport: { width: 1024, height: 552 }, hasTouch: true });
  const d = await ctx.newPage();
  await semearSessao(d);
  await d.addInitScript(() => {
    window.__cliques = [];
    document.addEventListener('click', (e) => window.__cliques.push(e.target.closest('button')?.innerText || ''), true);
  });
  await simularServidor(d);
  await d.goto(`${BASE}/coleta/embalagem`);
  await d.getByRole('button', { name: /INICIAR/ }).click({ timeout: 8000 });
  const larg = d.getByRole('button', { name: /Largada/ });
  await larg.waitFor({ timeout: 4000 });
  await d.waitForTimeout(260);
  await larg.dispatchEvent('pointerdown');
  await d.getByRole('button', { name: 'Contar um volume' }).waitFor({ timeout: 4000 });
  const folha = d.locator('[aria-label="Por que a máquina parou"]');
  await d.getByRole('button', { name: 'Parou' }).click();
  await folha.waitFor({ timeout: 4000 });
  await d.waitForTimeout(350);
  await folha.getByRole('button', { name: 'Motivo na volta' }).click();
  await folha.waitFor({ state: 'detached', timeout: 4000 });
  await d.waitForTimeout(1200);
  const caixa = await d.locator('[aria-label="Encerrar a parada e voltar a produzir"]').boundingBox();
  const cdp = await ctx.newCDPSession(d);
  const ponto = [{ x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 }];
  await d.evaluate(() => { window.__cliques = []; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto });
  await d.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await d.waitForTimeout(400);
  const cliques = await d.evaluate(() => window.__cliques);
  checar(await folha.count() === 1 && /escolha o motivo/.test(await folha.innerText()),
    `deitado, o toque no VOLTOU abre a lista e NAO escolhe motivo sozinho (o click caiu em ${JSON.stringify(cliques)})`);
  await ctx.close();
}

await navegador.close();

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
