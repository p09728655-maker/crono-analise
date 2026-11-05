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

async function simularServidor(pagina, {
  conferencias = [], marcas = null, relogio = null, aoSincronizar, demandas = DEMANDAS, aoAlterar,
  planilha = null, cadastro = CADASTRO,
} = {}) {
  // `planilha`: o estado da leitura da planilha do PCP que o servidor manda
  // junto do programa da embalagem (ver api/_lib/programaEmbalagem.js).
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
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
async function fundoDoGraficoNaFolha(pagina) {
  const antes = pagina.viewportSize();
  await pagina.setViewportSize({ width: 1032, height: 703 });
  await pagina.emulateMedia({ media: 'print' });
  const fundo = await pagina.evaluate(() => {
    const folha = document.querySelector('body > .somente-impressao');
    const figura = folha.querySelector('svg[aria-label^="Intervalo entre"]').closest('figure');
    return Math.round(figura.getBoundingClientRect().bottom - folha.getBoundingClientRect().top);
  });
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

const cartaoTakt = t.locator('[aria-label="Takt da semana"]');
await cartaoTakt.getByText('72.0').waitFor({ timeout: 8000 });
checar(/s por volume/.test(await cartaoTakt.innerText()), 'takt da semana em SEGUNDOS antes de medir: 72.0 s por volume');
checar(await t.getByText('EMBALAGEM 01').count() > 0, 'a maquina da embalagem ja vem escolhida');
checar(await t.locator('input[aria-label="Hora inicial"]').count() === 0, 'sem formulario de horarios');
checar(await t.getByRole('radio', { name: '2 ciclos' }).count() === 0, 'sem campo de furacao');

await t.locator('input[aria-label="Produto embalado"]').fill('Rack Sirius 1.6');
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
checar(/ÚLTIMO/i.test(painelTempo) && /POR VOLUME/i.test(painelTempo) && /TAKT/i.test(painelTempo)
  && painelTempo.includes('72.0'), 'cronometro rodando mostra ULTIMO, POR VOLUME e TAKT 72.0');
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
checar(/dentro do takt de 72.0 s, com 2% de folga/.test(textoJanela), 'veredito pelo relogio entre toques: 70.8 s dentro do takt de 72.0 s');
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
    checar(/Takt da semana: 72\.0 s/.test(legenda)
      && await folha.locator('svg[aria-label^="Intervalo entre"] text', { hasText: /^Takt/ }).count() === 0,
    'folha: o valor do takt esta na legenda, nao numa faixa ao lado do grafico');
    checar(sobra <= 30, `folha: as barras chegam ate perto da borda direita (sobram ${sobra} px; eram ~100)`);
  }
  if (FOTOS) writeFileSync(`${FOTOS}/pc-folha.pdf`, pdf);
  const fundo = await fundoDoGraficoNaFolha(p);
  checar(fundo <= 703, `folha deitada: o grafico cabe na 1a pagina (termina em ${fundo} de 703 px)`);
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
  const cartao = s.locator('[aria-label="Takt da semana"]');
  await cartao.getByText(/57\.6/).waitFor({ timeout: 8000 });
  const texto = (await cartao.innerText()).replace(/\s+/g, ' ');
  checar(/57\.6 s por volume — takt da semana de \d{2}\/\d{2} · 4 de 5 dias programados/.test(texto),
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
  const cartao2 = s2.locator('[aria-label="Takt da semana"]');
  await cartao2.getByText(/Faltam/).waitFor({ timeout: 8000 });
  checar(/Takt: Faltam os dias de produção da semana do grupo EMBALAGEM no cadastro\./.test(await cartao2.innerText()),
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
  checar(await s.locator('[aria-label="Takt da semana"]').count() === 0,
    'sem programa: o cartao do takt nao aparece no tablet');
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
    salva('salva-hoje', 'Rack Sirius 1.6', new Date().toISOString()),
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
  await s.goto(`${BASE}/coleta/embalagem`);
  await s.locator('[aria-label="Takt da semana"]').getByText('72.0').waitFor({ timeout: 8000 });

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
  const texto = (await resultado.innerText()).replace(/\s+/g, ' ');
  checar(/No período, saiu um volume a cada 18\.2 s, paradas dentro — dentro do takt de 72\.0 s/.test(texto),
    `o veredito do PC no tablet, contra o takt desta semana (${texto.slice(0, 120)})`);
  checar(/POR VOLUME COM A LINHA RODANDO 12\.7 ?s/i.test(texto) && /POR VOLUME SEM AS LACUNAS 10\.0 ?s/i.test(texto),
    'as camadas: rodando 12.7 s e sem as lacunas 10.0 s');
  checar(/VOLUMES\/HORA 180/i.test(texto), 'volumes/hora 180 — o mesmo numero da linha da lista');
  checar(/12 volumes deixaram de ser embalados nesta medição/.test(texto) && /teriam saído 24/.test(texto),
    'o total que deixou de ser embalado: 12 (6 paradas + 3 lacunas + 3 fora), 24 no passo da linha');
  checar(/Volume 12 40\.0 s \+30\.0 s/.test(texto), 'a lacuna no volume 12: 40.0 s, 30.0 s alem do normal');
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
  checar(/TAKT DA SEMANA 36\.0 ?s/i.test(textoPassada) && !/72\.0/.test(textoPassada),
    `medicao da semana passada: o takt e o daquela semana (36.0 s), nao o de hoje (${textoPassada.slice(0, 160)})`);

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
  await s.locator('[aria-label="Takt da semana"]').getByText('72.0').waitFor({ timeout: 8000 });
  await s.getByRole('button', { name: /Ver o resultado/ }).first().tap();
  const resultado = s.locator('[aria-label="Resultado da medição salva"]');
  // Espera o takt carregar (o cartao ganha "semana ... · por volume"), seja
  // ele qual for: o valor e' conferido abaixo, nao esperado.
  await resultado.getByText(/· por volume/).first().waitFor({ timeout: 8000 });
  const texto = (await resultado.innerText()).replace(/\s+/g, ' ');
  checar(/TAKT DA SEMANA 36\.0 ?s/i.test(texto) && !/72\.0/.test(texto),
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
  checar(/sem rede/i.test(texto2) && !/não cobre a semana/.test(texto2) && !/sem programa para comparar/.test(texto2),
    `sem rede: o resultado diz que falta rede, nao que falta programa (${texto2.slice(0, 220)})`);
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

await navegador.close();

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
