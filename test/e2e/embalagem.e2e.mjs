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

async function simularServidor(pagina, {
  conferencias = [], marcas = null, relogio = null, aoSincronizar, demandas = DEMANDAS, aoAlterar,
} = {}) {
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas } })
    : rota.fulfill({ json: CADASTRO })));
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
      return rota.fulfill({ json: { conferencia: { id: url.searchParams.get('id'), marcas_ms: marcas, marcas_relogio_ms: relogio } } });
    }
    return rota.fulfill({ json: { conferencias, outras: 0 } });
  });
  await pagina.route('**/api/sync**', async (rota) => {
    const corpo = rota.request().postDataJSON();
    aoSincronizar?.(corpo);
    const clientIds = [...(corpo.conferencias || []), ...(corpo.observacoes || [])].map((x) => x.clientId);
    return rota.fulfill({ json: { recebidos: clientIds.length, novos: clientIds.length, clientIds } });
  });
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
// volume a volume NO LUGAR da lista, com a largura toda — nem janela por
// cima, nem espremido ao lado dela.
const lista = p.getByRole('region', { name: 'Medições da embalagem' });
const janela = p.getByRole('region', { name: /Volume a volume/ });
const botaoVoltar = janela.getByRole('button', { name: 'Voltar à lista' });
// O rotulo sai em caixa alta (CSS): o cartao e' o pai dele.
const cartao = p.getByText('A analisar', { exact: true }).locator('..');
await lista.waitFor({ timeout: 8000 });
checar(await janela.count() === 0, 'a tela chega na lista: nenhuma medicao abre sozinha');
checar(/A analisar\s*2\s*de 2 medições volume a volume em 30 dias/i.test(await cartao.innerText()),
  `cartao "A analisar": 2 de 2 em 30 dias — a de um toque so' nao conta (${(await cartao.innerText()).replace(/\n/g, ' | ')})`);

await lista.getByRole('button', { name: 'Rack Sirius 1.6' }).click();
// Relogio entre o 1o e o ultimo toque: 920 s / 13 = 70,8 s por volume,
// paradas dentro; takt 72 s. Sem a lacuna: 60 s.
await janela.getByText(/No período, saiu um volume a cada 70.8 s, paradas dentro/).waitFor({ timeout: 8000 });
checar(await lista.count() === 0 && await cartao.count() === 0, 'aberta a medicao, a lista e os cartoes saem da tela');
checar(await p.getByRole('dialog').count() === 0, 'o detalhe abre na propria pagina, sem janela por cima');
{
  const cj = await janela.boundingBox();
  checar(cj.width > 1000, `o detalhe ocupa a largura toda da area de conteudo (${Math.round(cj.width)} px)`);
}
const textoJanela = await janela.innerText();
checar(/dentro do takt de 72.0 s, com 2% de folga/.test(textoJanela), 'veredito pelo relogio entre toques: 70.8 s dentro do takt de 72.0 s');
// O valor logo depois do rotulo do proprio cartao — nao um 70.8 qualquer
// mais adiante (manchete, rotulo do grafico).
checar(/POR VOLUME COM A LINHA RODANDO\s*70\.8 s/i.test(textoJanela) && /SEM AS LACUNAS\s*60\.0 s/i.test(textoJanela),
  'as camadas: rodando 70.8 s, sem as lacunas 60.0 s');
checar(/1 lacuna — intervalo maior que o dobro do normal \(60.0 s\)/.test(textoJanela), 'aponta a lacuna contra o normal de 60.0 s');
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
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-folha.png`, fullPage: true });
await p.emulateMedia({ media: 'screen' });

const voltarALista = async () => {
  await botaoVoltar.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
};
await voltarALista();
checar(await lista.isVisible() && await cartao.isVisible(), 'Voltar à lista devolve a lista e os cartoes');
// A linha inteira abre, nao so' o nome do produto.
await lista.getByRole('row').filter({ hasText: 'Rack Sirius 1.6' }).first().getByRole('cell').first().click();
await janela.waitFor({ timeout: 4000 });
checar(await lista.count() === 0, 'clicar na linha, fora do nome, tambem abre a medicao');
await voltarALista();

// Lista rolada: abrir leva ao topo do detalhe, e voltar devolve a lista no
// mesmo ponto, com o foco no produto de onde se saiu.
{
  await p.setViewportSize({ width: 1440, height: 400 });
  const botao = lista.getByRole('button', { name: 'Toucador Magic New' });
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await botao.scrollIntoViewIfNeeded();
  const yLista = await p.evaluate(() => window.scrollY);
  await botao.click();
  await janela.getByRole('heading', { name: 'Toucador Magic New' }).waitFor({ timeout: 4000 });
  const yDetalhe = await p.evaluate(() => window.scrollY);
  await voltarALista();
  const yVolta = await p.evaluate(() => window.scrollY);
  const foco = await p.evaluate(() => document.activeElement?.textContent);
  checar(yLista > 0, `pre-condicao: a lista estava rolada (${yLista} px)`);
  checar(yDetalhe === 0, `abrir com a lista rolada leva ao topo do detalhe (scrollY ${yDetalhe})`);
  checar(yVolta === yLista, `voltar devolve a lista na mesma rolagem (${yLista} -> ${yVolta})`);
  checar(foco === 'Toucador Magic New', `o foco volta ao produto de onde saiu (${foco})`);
  await p.setViewportSize({ width: 1440, height: 1000 });
}

/* ANALISE DO PCP: lida a medicao, salvar grava e volta para a lista; a
   linha ganha o selo e o cartao "A analisar" desce. */
{
  const salvar = janela.getByRole('button', { name: 'Salvar análise e voltar' });
  const nota = janela.getByRole('textbox', { name: 'Análise do PCP' });
  const linhaDe = (nome) => lista.getByRole('row').filter({ hasText: nome }).first();
  // Como o PCP faz: com uma aberta, volta a' lista e abre a outra.
  const abrirMedicao = async (nome, { esperar = nota } = {}) => {
    if (await janela.count()) await voltarALista();
    await lista.getByRole('button', { name: nome }).click();
    await janela.getByRole('heading', { name: nome }).waitFor({ timeout: 4000 });
    await esperar.waitFor({ timeout: 8000 });
  };

  await abrirMedicao('Toucador Magic New');
  // No topo, ao lado de Imprimir e Voltar: a' vista com a pagina no alto,
  // sem rolar nada. O fundo do painel fica abaixo da dobra.
  {
    const bs = await salvar.boundingBox();
    const bv = await botaoVoltar.boundingBox();
    checar(bs && bs.y >= 0 && bs.y + bs.height <= 1000 && Math.abs(bs.y - bv.y) < 4,
      `"Salvar análise e voltar" no topo, junto de Voltar à lista, a' vista (y ${Math.round(bs?.y)} px)`);
  }
  // Rolado ate' o campo da nota, o topo gruda: os botoes seguem a' vista.
  await nota.scrollIntoViewIfNeeded();
  {
    const y = await p.evaluate(() => window.scrollY);
    const bs = await salvar.boundingBox();
    checar(bs && bs.y >= -1 && bs.y + bs.height <= 1000,
      `rolado ate a nota (scrollY ${y}), Salvar continua a vista no topo (y ${Math.round(bs?.y)} px)`);
  }
  await nota.fill('  Lacunas por falta de caixa  ');

  // Recusado: o aviso aparece no topo, junto do botao, e a tela NAO volta.
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
  checar(await janela.count() === 1, 'recusado, o painel continua aberto — voltar seria dizer que salvou');
  checar(await nota.inputValue() === '  Lacunas por falta de caixa  ', 'recusado, a nota digitada continua no campo');

  // A nota e' DA MEDICAO: outra abre com o campo vazio, e voltar a' lista
  // nao apaga o que foi digitado.
  await abrirMedicao('Rack Sirius 1.6');
  checar(await nota.inputValue() === '' && await janela.getByRole('alert').count() === 0,
    'outra medicao abre com o campo vazio e sem a recusa da anterior');
  await nota.fill('nota do rack');
  await voltarALista();
  checar(/Nota digitada, ainda não salva/.test(await linhaDe('Rack Sirius 1.6').innerText()),
    'de volta a lista, a linha avisa que tem nota digitada e nao salva');
  checar(/Análise não salva — abra para ver o motivo/.test(await linhaDe('Toucador Magic New').innerText()),
    'e a recusada avisa que a analise nao foi salva');
  await abrirMedicao('Toucador Magic New');
  checar(await nota.inputValue() === '  Lacunas por falta de caixa  ',
    'reaberta, a nota digitada continua no campo — mesmo depois de escrever na outra');
  checar(/Não deu para salvar/.test(await janela.innerText()), 'reaberta, a recusa dela continua no painel');
  await abrirMedicao('Rack Sirius 1.6');
  checar(await nota.inputValue() === 'nota do rack', 'e a da outra tambem');
  await abrirMedicao('Toucador Magic New');

  // Enquanto salva, Voltar e o campo ficam travados: de volta a' lista no
  // meio, ninguem veria uma recusa.
  recusarAnalise = false;
  atrasoAnalise = 800;
  await salvar.click();
  await janela.getByRole('button', { name: 'Salvando…' }).waitFor({ timeout: 2000 });
  checar(await botaoVoltar.isDisabled() && await nota.isDisabled(),
    'salvando: Voltar à lista e o campo da nota travados');
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  atrasoAnalise = 0;
  const pedido = pedidosAnalise.at(-1);
  checar(pedido?.id === medicao2.id && pedido.corpo.analisada === true
    && pedido.corpo.analiseNota === 'Lacunas por falta de caixa',
  `salvar manda analisada + a nota aparada, da medicao aberta (${JSON.stringify(pedido?.corpo)})`);
  checar(await lista.isVisible(), 'salvo, a tela volta para a lista');
  checar(/✓ Analisada · Mauricio PCP/.test(await linhaDe('Toucador Magic New').innerText()),
    'a linha ganha o selo "✓ Analisada" com quem salvou');
  checar(!/Analisada/.test(await linhaDe('Rack Sirius 1.6').innerText()), 'a outra medicao continua sem selo');
  checar(/A analisar\s*1/i.test(await cartao.innerText()), 'o cartao "A analisar" desce para 1 sem recarregar');
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-analisada-lista.png` });

  // Aberta de novo: quem, quando e a nota; Reabrir volta a "a analisar",
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
  checar(await janela.count() === 1, 'reabrir deixa o painel aberto');
  checar(await nota.inputValue() === 'Lacunas por falta de caixa', 'reaberta, a nota volta ao campo para corrigir');
  checar(!/Análise do PCP \(/.test(await p.locator('body > .somente-impressao').innerText()),
    'reaberta, a folha A4 deixa de dizer que foi analisada');
  await voltarALista();
  checar(/A analisar\s*2/i.test(await cartao.innerText()), 'reaberta, volta a contar no "A analisar"');

  // Reabrir recusado: a analise continua salva, e a linha nao pode dizer
  // "nao salva" ao lado do selo.
  await abrirMedicao('Rack Sirius 1.6');
  await salvar.click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  // Analisada nao tem campo de nota: espera o botao, nao o campo.
  const reabrir = janela.getByRole('button', { name: 'Reabrir análise' });
  await abrirMedicao('Rack Sirius 1.6', { esperar: reabrir });
  recusarAnalise = true;
  await reabrir.click();
  await janela.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/Não deu para reabrir: Seu papel nao permite/.test(await janela.getByRole('alert').innerText()),
    'reabrir recusado: o motivo aparece no painel');
  await voltarALista();
  const textoRack = await linhaDe('Rack Sirius 1.6').innerText();
  checar(/✓ Analisada/.test(textoRack) && /Não reabriu — abra para ver o motivo/.test(textoRack)
    && !/Análise não salva/.test(textoRack),
  'reabrir recusado: a linha segue analisada e diz que nao reabriu, nao que a analise nao foi salva');
  recusarAnalise = false;
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-a-analisar.png` });
}

checar(errosPc.length === 0, `PC sem erro de pagina${errosPc.length ? `: ${errosPc[0]}` : ''}`);

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

await navegador.close();

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
