/**
 * JUNCAO DE MEDICOES — marcar na lista, juntar, ler, imprimir e salvar a
 * analise das tres de uma vez, na Embalagem Takt Time do PC.
 *
 * As tres medicoes sao as REAIS de Penteadeira Princesa (28/10/2026,
 * EMBALAGEM 01): marcas, relogio, duracao e paradas como estao no banco,
 * deslocadas para hoje (a lista mostra 30 dias, e a junção pede a mesma
 * semana). Os numeros esperados foram feitos a mao em test/juncao.test.js:
 * 138 volumes, 42 min, 36 roubados (5 + 22 + 9), 197 volumes/hora,
 * 17.9 s no periodo, 14.4 s rodando, lacunas no volume 9 da primeira e no
 * 41 da segunda.
 *
 * Uso: npm run dev e depois E2E_BASE=http://localhost:5173 node test/e2e/juncao.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;
const FUSO = 'America/Sao_Paulo';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const GRUPO = {
  id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM',
  horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5,
};
const MAQUINA = { id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true, grupo_id: GRUPO.id };

/* Hoje, a partir das 07:00 de Sao Paulo (as 10:00 UTC) — ou ontem, se o
   teste roda antes disso: a junção pede a mesma semana, e a medicao nao
   pode estar no futuro. */
const agora = new Date();
const [a, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora).split('-').map(Number);
let t0 = Date.UTC(a, m - 1, d, 10, 11, 55, 381);
if (t0 + 3600000 > agora.getTime()) t0 -= 86400000;
const em = (ms) => new Date(t0 + ms).toISOString();
const parada = (ms) => ({ motivo: 'outro', duracaoMs: ms, observacao: null });
const base = {
  maquina: 'EMBALAGEM 01', peca: 'Penteadeira Princesa', ciclos_por_peca: 1, furacao_passante: false,
  arquivada: false, com_marcas: true, observacao: '', analisada_em: null, analisada_por: null, analise_nota: null,
};
const M1 = {
  ...base, id: '00000000-0000-0000-0000-0000000000b1', pecas: 60, duracao_ms: 916596,
  iniciado_em: em(0), finalizado_em: em(916596), salvo_em: em(916596),
  paradas: [parada(23400), parada(48000)], observacao: 'Troca de operador no meio',
  // Ja' analisada sozinha: a junção avisa que salvar substitui esta nota.
  analisada_em: em(3600000), analisada_por: 'Ana PCP', analise_nota: 'Faltou caixa 9h10 — falar c/ João',
};
const M2 = {
  ...base, id: '00000000-0000-0000-0000-0000000000b2', pecas: 60, duracao_ms: 1193938,
  iniciado_em: em(926556), finalizado_em: em(2120494), salvo_em: em(2120494),
  paradas: [parada(95400), parada(3600), parada(18000), parada(200400)],
};
const M3 = {
  ...base, id: '00000000-0000-0000-0000-0000000000b3', pecas: 18, duracao_ms: 406489,
  iniciado_em: em(2412105), finalizado_em: em(2818594), salvo_em: em(2818594),
  paradas: [parada(31800), parada(52200), parada(50400)],
};
// Outro produto: marcado junto, a junção trava e diz por que.
const BUFFET = {
  ...base, id: '00000000-0000-0000-0000-0000000000b4', peca: 'Buffet Flip 1.8 Caixa 2/2', pecas: 12, duracao_ms: 140000,
  iniciado_em: em(3000000), finalizado_em: em(3140000), salvo_em: em(3140000), paradas: [],
};
const TOQUES = {
  [M1.id]: {
    marcas_relogio_ms: 900990, marcas_setup_ms: 0,
    marcas_ms: [12703, 25446, 38829, 57158, 72486, 94820, 105668, 117316, 146809, 167797, 174689, 185372, 200058, 212038, 225186, 237052, 251175, 262289, 272657, 285294, 297016, 312398, 323355, 333735, 344705, 355099, 368965, 383689, 397383, 410192, 421353, 434340, 446580, 458087, 472109, 489476, 512447, 525551, 537808, 551137, 563017, 578087, 590492, 605175, 616366, 627889, 642574, 670275, 680624, 695760, 709481, 729172, 738346, 752253, 768446, 789348, 801947, 817443, 828030, 842609],
  },
  [M2.id]: {
    marcas_relogio_ms: 1179980, marcas_setup_ms: 0,
    marcas_ms: [12370, 28879, 43552, 55364, 69285, 88503, 100440, 120232, 130374, 144985, 155893, 171586, 188657, 205570, 220108, 236132, 254750, 271091, 297549, 301826, 315714, 329967, 340824, 352743, 366601, 380670, 401328, 422263, 432539, 446566, 457367, 469667, 480072, 495123, 506348, 520287, 531308, 544983, 557210, 571022, 604036, 624265, 634413, 646918, 665386, 679063, 693611, 711966, 724730, 741276, 754786, 770942, 784053, 795920, 805629, 819341, 832192, 843020, 858048, 875416],
  },
  [M3.id]: {
    marcas_relogio_ms: 337943, marcas_setup_ms: 0,
    marcas_ms: [13894, 25189, 36937, 56217, 69459, 84243, 100932, 112073, 125488, 139837, 153979, 171819, 188241, 205226, 218486, 235440, 247331, 267325],
  },
  [BUFFET.id]: {
    marcas_relogio_ms: 121000, marcas_setup_ms: 0,
    marcas_ms: Array.from({ length: 12 }, (_, i) => 5000 + i * 11000),
  },
};
const hm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });

// O PATCH da analise em lote: grava o pedido e responde como a API.
const pedidos = [];
let recusar = false;
async function simularServidor(pagina) {
  await pagina.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
    ? rota.fulfill({ json: { demandas: [] } })
    : rota.fulfill({ json: { maquinas: [MAQUINA], grupos: [GRUPO] } })));
  await pagina.route('**/api/conferencias**', async (rota) => {
    const url = new URL(rota.request().url());
    if (rota.request().method() === 'PATCH') {
      const corpo = rota.request().postDataJSON();
      pedidos.push({ id: url.searchParams.get('id'), corpo });
      if (recusar) return rota.fulfill({ status: 403, json: { erro: 'Seu papel nao permite esta operacao' } });
      const analisada = { analisada_em: new Date().toISOString(), analisada_por: 'Mauricio PCP', analise_nota: corpo.analiseNota };
      return rota.fulfill({
        json: { atualizadas: corpo.ids.length, conferencias: corpo.ids.map((id) => ({ id, ...analisada })) },
      });
    }
    const id = url.searchParams.get('id');
    if (id) return rota.fulfill({ json: { conferencia: { id, ...TOQUES[id] } } });
    return rota.fulfill({ json: { conferencias: [BUFFET, M3, M2, M1], outras: 0 } });
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
const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: FUSO });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
await semearSessao(p);
await simularServidor(p);

await p.goto(`${BASE}/analise`);
await p.getByRole('button', { name: /Embalagem Takt Time/ }).first().click();
await p.waitForFunction(() => location.pathname === '/analise/embalagem', { timeout: 8000 });
const lista = p.getByRole('region', { name: 'Medições da embalagem' });
await lista.waitFor({ timeout: 8000 });
const barra = p.getByRole('region', { name: 'Medições marcadas para juntar' });
const caixa = (c) => lista.getByRole('row').filter({ has: p.locator(`[data-medicao="${c.id}"]`) }).getByRole('checkbox');
const juntar = barra.getByRole('button', { name: /^Juntar/ });

checar(await lista.getByRole('checkbox').count() === 3, 'cada medicao da fila tem a caixa de juntar');
checar(await barra.count() === 0, 'sem nada marcado, nao ha barra');

// Uma so': a barra aparece, mas o Juntar trava e diz por que.
await caixa(M3).check();
checar(/1 medição marcada/.test(await barra.innerText()) && /Marque duas medições ou mais para juntar\./.test(await barra.innerText()),
  'uma marcada: a barra diz que falta mais uma');
checar(await juntar.isDisabled(), 'uma marcada: Juntar travado');

// Outro produto: trava com o motivo escrito.
await caixa(BUFFET).check();
checar(/produtos diferentes\./.test(await barra.innerText()) && await juntar.isDisabled(),
  'produto diferente: Juntar travado, com o motivo escrito');
await caixa(BUFFET).uncheck();

await caixa(M2).check();
// A marca vale entre as vistas: a 07:11, ja' analisada, entra pela outra aba.
await lista.getByRole('button', { name: 'Analisadas (1)' }).click();
await caixa(M1).check();
const textoBarra = await barra.innerText();
checar(/3 medições marcadas · Penteadeira Princesa · EMBALAGEM 01/.test(textoBarra),
  `tres do mesmo produto: a barra diz quais (${textoBarra.replace(/\n/g, ' | ')})`);
checar(/138 volumes em 42 min medidos/.test(textoBarra), 'a barra soma volumes e tempo: 138 volumes em 42 min');
checar(!(await juntar.isDisabled()) && /Juntar as 3/.test(await juntar.innerText()), 'Juntar as 3 liberado');

await juntar.click();
const janela = p.getByRole('region', { name: /Volume a volume — junção de 3 medições/ });
await janela.getByText(/as paradas roubaram 36 volumes/).first().waitFor({ timeout: 8000 });
const texto = await janela.innerText();

// O QUE AS PARADAS ROUBARAM, primeiro.
checar(/36\s*volumes\s*roubados pelas paradas nos 42 min medidos/.test(texto), 'o bloco abre com os 36 volumes roubados nos 42 min');
checar(/Saíram 138\. No passo da linha rodando, teriam saído 174 no mesmo tempo: 26% a mais\./.test(texto),
  'saíram 138, teriam saído 174: 26% a mais');
checar(/5 roubados[\s\S]*22 roubados[\s\S]*9 roubados/.test(texto), 'por medicao, na ordem: 5, 22 e 9 roubados');
// Os cartoes da junção.
checar(/VOLUMES\s*138\s*135 intervalos medidos, nas 3 medições/i.test(texto), 'volumes: 138, em 135 intervalos nas 3 medições');
checar(/POR VOLUME NO PERÍODO\s*17\.9 s\s*com as paradas, do 1º ao último toque de cada medição/i.test(texto),
  'por volume no periodo: 17.9 s, de cada medicao');
checar(/POR VOLUME COM A LINHA RODANDO\s*14\.4 s/i.test(texto), 'rodando: 14.4 s');
checar(/LACUNAS\s*2\s/i.test(texto), 'lacunas: 2, contra o normal da junção');
checar(/VOLUMES\/HORA\s*197\s*nas 3 medições inteiras, com as paradas/i.test(texto), 'volumes/hora: 197, ponderado pelo tempo');
// A tabela das medicoes, com a junção na ultima linha.
checar(/Junção\s*138\s*42 min\s*9 min\s*36\s*17\.9 s\s*14\.4 s\s*14\.2 s\s*197/.test(texto), 'tabela: a linha da junção soma tudo');
// O passo que a leitura compara aparece na tabela: 13.8, 14.3 e 14.9 s sem as lacunas.
checar(/14\.1 s\s*13\.8 s\s*236/.test(texto) && /14\.6 s\s*14\.3 s\s*181/.test(texto) && /14\.9 s\s*14\.9 s\s*159/.test(texto),
  'tabela: o passo sem as lacunas de cada medicao, o mesmo da frase');
checar(/236[\s\S]*181[\s\S]*159/.test(texto), 'tabela: cada medicao com o proprio volumes/hora (236, 181, 159)');
// A leitura.
checar(/Nas 3 medições, as paradas roubaram 36 volumes: saíram 138, e no passo da linha rodando teriam saído 174\./.test(texto),
  'manchete: o que as paradas roubaram (sem takt, nao ha veredito)');
checar(/O passo é o mesmo nas 3 \(de 13\.8 a 14\.9 s sem as lacunas\)/.test(texto), 'o passo e o mesmo nas 3, sem as lacunas');
// A 07:11 ja' tinha analise: o aviso fica colado ao botao, e a nota antiga aparece.
checar(new RegExp(`A das ${hm(M1.iniciado_em)} já foi analisada: salvar a junção substitui a análise dela`).test(texto),
  'junção com medicao ja analisada: avisa que salvar substitui a analise dela');
checar(/Faltou caixa 9h10 — falar c\/ João/.test(texto) && /Ana PCP/.test(texto), 'a nota antiga aparece, com quem analisou');
checar(/Troca de operador no meio/.test(texto), 'a observacao da medicao aparece, com a hora dela');
// As lacunas dizem a medicao e o volume dentro dela.
checar(new RegExp(`${hm(M1.iniciado_em)}–${hm(M1.finalizado_em)}\\s*9\\s*29\\.5 s`).test(texto)
  && new RegExp(`${hm(M2.iniciado_em)}–${hm(M2.finalizado_em)}\\s*41\\s*33\\.0 s`).test(texto),
'lacunas: volume 9 da primeira, volume 41 da segunda');
// O grafico separa as medicoes, com a hora de cada uma em cima.
const grafico = janela.locator('svg[role="img"]').first();
checar(/em 3 medições/.test(await grafico.getAttribute('aria-label')), 'o grafico diz que sao 3 medições');
checar((await grafico.locator('text').allTextContents())
  .filter((t) => [hm(M1.iniciado_em), hm(M2.iniciado_em), hm(M3.iniciado_em)].includes(t)).length === 3,
'o grafico escreve a hora de cada medicao em cima dela');
// A lista foi para a fila (onde estao as que faltam): as 2 dali ficam marcadas como abertas.
checar(await lista.locator('[data-medicao][aria-pressed="true"]').count() === 2, 'na lista, as da junção ficam marcadas como abertas');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/juncao-painel.png`, fullPage: true });

// HISTORICO: Voltar fecha, Avancar reabre, F5 reabre.
await p.goBack();
await janela.waitFor({ state: 'detached', timeout: 4000 });
checar(true, 'Voltar do navegador fecha a junção');
await p.goForward();
await janela.getByText(/as paradas roubaram 36 volumes/).first().waitFor({ timeout: 4000 });
checar(true, 'Avançar reabre a junção');
await p.reload();
await janela.getByText(/as paradas roubaram 36 volumes/).first().waitFor({ timeout: 8000 });
checar(true, 'F5 reabre a mesma junção');
checar(/3 medições marcadas/.test(await barra.innerText()), 'reaberta pelo F5, a junção volta com as 3 marcadas');

// IMPRESSAO.
await p.evaluate(() => {
  window.print = () => { window.tituloImpresso = document.title; window.dispatchEvent(new Event('afterprint')); };
});
await janela.getByRole('button', { name: 'Imprimir' }).click();
const titulo = await p.evaluate(() => window.tituloImpresso);
checar(/^Takt Time - Penteadeira Princesa - EMBALAGEM 01 - \d{2}-\d{2}-\d{4} \d{2}h\d{2} - 3 medições$/.test(titulo || ''),
  `o PDF diz que e' a junção das 3 (${titulo})`);
await p.emulateMedia({ media: 'print' });
const folha = await p.locator('body > .somente-impressao').innerText();
checar(/Takt Time — Penteadeira Princesa · EMBALAGEM 01 · junção de 3 medições/.test(folha), 'folha: titulo da junção');
checar(/ROUBADOS PELAS PARADAS\s*36 · teriam saído 174/i.test(folha), 'folha: os roubados na identificacao');
checar(/AS 3 MEDIÇÕES/i.test(folha) && /Junção\s*138\s*42 min\s*9 min\s*36/.test(folha), 'folha: a tabela das 3 medicoes');
checar(/Nas 3 medições, as paradas roubaram 36 volumes/.test(folha), 'folha: a mesma manchete da tela');
checar(/Junção = medições do mesmo produto/.test(folha), 'folha: a regra da junção na nota');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/juncao-folha.png`, fullPage: true });
await p.emulateMedia({ media: 'screen' });

// SAIR COM NOTA NAO SALVA: a junção nao e' linha da lista, e ainda assim pergunta.
const nota = janela.getByRole('textbox', { name: 'Análise do PCP' });
await nota.fill('Passo estável; perda nas paradas. Classificar o motivo.');
let aviso = '';
p.once('dialog', (dlg) => { aviso = dlg.message(); dlg.dismiss(); });
await p.getByRole('button', { name: 'Voltar para a lista de estudos' }).click();
await p.waitForTimeout(300);
checar(/1 nota digitada e não salva/.test(aviso), `sair com a nota da junção digitada pergunta antes (${aviso.split('\n')[0]})`);

// Fechada sem salvar, a nota da junção fica avisada nas linhas dela, e
// juntar de novo devolve o que foi digitado.
await janela.getByRole('button', { name: 'Fechar', exact: true }).click();
await janela.waitFor({ state: 'detached', timeout: 4000 });
checar(await lista.getByText(/Nota de junção digitada, ainda não salva/).count() === 2,
  'fechada sem salvar: as linhas da junção avisam a nota nao salva');
await juntar.click();
await janela.getByText(/as paradas roubaram 36 volumes/).first().waitFor({ timeout: 4000 });
checar(await nota.inputValue() === 'Passo estável; perda nas paradas. Classificar o motivo.', 'juntar de novo devolve a nota digitada');

// RECUSA: aparece no painel, e nada sai da lista.
recusar = true;
const salvar = janela.getByRole('button', { name: 'Salvar análise das 3 e fechar' });
await salvar.click();
await janela.getByRole('alert').waitFor({ timeout: 4000 });
checar(/Não deu para salvar: Seu papel nao permite/.test(await janela.getByRole('alert').innerText()),
  'recusado: o motivo aparece colado ao botao, e o painel continua aberto');
checar(await lista.getByRole('button', { name: 'Não analisadas (3)' }).count() === 1, 'recusado: nada sai da fila');

// SALVA: um pedido so', com os 3 ids e a nota com a junção no comeco.
recusar = false;
pedidos.length = 0;
await salvar.click();
await janela.waitFor({ state: 'detached', timeout: 4000 });
const pedido = pedidos[0];
checar(pedidos.length === 1 && pedido.id === null, 'salvar a junção e um PATCH so, em lote');
checar(JSON.stringify(pedido?.corpo.ids) === JSON.stringify([M1.id, M2.id, M3.id]) && pedido?.corpo.analisada === true,
  'o lote leva os 3 ids, na ordem das medicoes');
const faixa = `${hm(M1.iniciado_em)}–${hm(M3.finalizado_em)}`;
checar(pedido?.corpo.analiseNota === `Junção de 3 medições (${faixa}): Passo estável; perda nas paradas. Classificar o motivo.`,
  `a nota leva "Junção de 3 medições (${faixa})" no comeco`);
checar(await lista.getByRole('button', { name: 'Não analisadas (1)' }).count() === 1
  && await lista.getByRole('button', { name: 'Analisadas (3)' }).count() === 1,
'salvo: as 3 saem da fila de uma vez e vao para Analisadas');
checar(await barra.count() === 0, 'salvo: as marcas se vao');

// JUNTAR DE NOVO PARA REIMPRIMIR: as 3 em Analisadas, ja' com a nota da junção.
await lista.getByRole('button', { name: 'Analisadas (3)' }).click();
for (const c of [M1, M2, M3]) await caixa(c).check();
await juntar.click();
await janela.getByText(/As 3 analisadas/).waitFor({ timeout: 4000 });
checar(await janela.getByRole('button', { name: /Salvar análise/ }).count() === 0, 'junção ja analisada: sem botao de salvar');
checar(/Junção de 3 medições \(/.test(await janela.innerText()), 'junção ja analisada: a nota da junção aparece');
await p.emulateMedia({ media: 'print' });
checar(/Análise do PCP \(Mauricio PCP, [^)]*\): Junção de 3 medições/.test(await p.locator('body > .somente-impressao').innerText()),
  'a folha da junção reimpressa leva a analise salva');
await p.emulateMedia({ media: 'screen' });
{
  // O pior caso: junção, com a analise salva e a observacao de uma delas.
  const fundo = await fundoDoGraficoNaFolha(p);
  checar(fundo <= 703, `folha deitada da junção: o grafico cabe na 1a pagina (termina em ${fundo} de 703 px)`);
}
await janela.getByRole('button', { name: 'Fechar', exact: true }).click();
await barra.getByRole('button', { name: 'Desmarcar' }).click();

// UMA MEDICAO SO' tambem mostra o que as paradas roubaram.
await lista.locator(`[data-medicao="${M2.id}"]`).click();
const uma = p.getByRole('region', { name: /Volume a volume da medição/ });
await uma.getByText(/roubados pelas paradas nesta medição/).waitFor({ timeout: 4000 });
const textoUma = await uma.innerText();
checar(/22\s*volumes\s*roubados pelas paradas nesta medição/.test(textoUma), 'uma medicao: 22 volumes roubados (07:27)');
checar(/Saíram 60\. No passo da linha rodando, teriam saído 82 no mesmo tempo: 37% a mais\./.test(textoUma), 'uma medicao: teriam saído 82');
checar(/Junção de 3 medições/.test(textoUma), 'a nota salva diz que ela foi analisada junto com as outras');
await uma.getByRole('button', { name: 'Fechar', exact: true }).click();
await lista.getByRole('button', { name: 'Não analisadas (1)' }).click();
await lista.locator(`[data-medicao="${BUFFET.id}"]`).click();
await uma.getByText(/Leitura da medição/).waitFor({ timeout: 4000 });
checar(!/roubados pelas paradas/.test(await uma.innerText()), 'sem parada marcada, nao ha bloco de roubados');

checar(erros.length === 0, `sem erro de pagina (${erros.join(' | ')})`);
await navegador.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
