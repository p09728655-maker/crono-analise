/**
 * Teste de navegacao.
 *
 * Cobre o que o usuario reclamou e o que estava de fato quebrado: o botao
 * Voltar do navegador nao funcionava, recarregar perdia o lugar, e nao dava
 * para abrir um estudo por link direto. Tudo isso vinha de a navegacao viver
 * em memoria em vez de na URL.
 *
 * Uso: npm run dev  (porta 5199) e depois node test/e2e/navegacao.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';
import { analisarCaminho, caminhos } from '../../src/lib/dispositivo.js';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const ID_A = 'b17e849c-da3f-4d8c-a262-81e8748c589b';
const ID_B = 'c27e849c-da3f-4d8c-a262-81e8748c589b';

/* --------------------------------------------- analise de caminho (puro) */
globalThis.window = { innerWidth: 1440, matchMedia: () => ({ matches: true }) };

let r = analisarCaminho(`/analise/estudo/${ID_A}`);
checar(r.modo === 'analise' && r.tela === 'estudo' && r.estudoId === ID_A, 'rota de estudo em analise');

r = analisarCaminho(`/coleta/estudo/${ID_A}/operacao/${ID_B}`);
checar(r.tela === 'coleta' && r.estudoId === ID_A && r.operacaoId === ID_B, 'rota de coleta com operacao');

r = analisarCaminho('/coleta');
checar(r.modo === 'coleta' && r.tela === 'lista', 'rota de lista em coleta');

r = analisarCaminho('/');
checar(r.tela === 'lista' && r.padrao === true, 'raiz cai no padrao do aparelho');

r = analisarCaminho('/analise/estudo/nao-e-uuid');
checar(r.tela === 'lista', 'id invalido nao vira tela de estudo');

r = analisarCaminho('/analise/');
checar(r.modo === 'analise' && r.tela === 'lista', 'barra final nao quebra a rota');

checar(caminhos.estudo('analise', ID_A) === `/analise/estudo/${ID_A}`, 'monta caminho de estudo');
checar(caminhos.coletar(ID_A, ID_B) === `/coleta/estudo/${ID_A}/operacao/${ID_B}`, 'monta caminho de coleta');

delete globalThis.window;

/* ------------------------------------------------ navegacao no navegador */
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await semearSessao(p);

// A API nao esta no ar no harness. O endpoint responde formatos diferentes
// para lista e para detalhe, e o mock precisa respeitar isso — misturar os
// dois foi o que revelou a falta de limite de erro.
const ESTUDO = {
  id: ID_A, nome: 'Furação lateral', recurso: 'Furadeira 03', produto: 'MDF',
  analista: 'Maurício', tolerancia_pct: '15.00', meta_obs: 12, takt_time_ms: null,
  data_estudo: '2026-08-25', status: 'coletando',
  total_operacoes: 1, total_observacoes: 14, atualizado_em: '2026-08-25T12:00:00Z',
};

await p.route('**/api/estudos*', (rota) => {
  const detalhe = new URL(rota.request().url()).searchParams.has('id');
  rota.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(detalhe
      ? { estudo: ESTUDO, operacoes: [{
          id: ID_B, estudo_id: ID_A, nome: 'Furar lateral', fr_pct: '100.00', ordem: 0,
          tempos: [9800, 10100, 9900], observacoes: [], paradas: [],
        }] }
      : { estudos: [ESTUDO] }),
  });
});

await p.goto('http://localhost:5199/analise');
await p.waitForSelector('text=Furação lateral', { timeout: 10000 });
checar(true, 'lista carregou em /analise');

// O NOME do estudo e' a porta da analise: o botao "Analisar" da linha saiu
// quando a area de Proximas acoes passou a oferecer o mesmo destino.
await p.locator('button', { hasText: 'Furação lateral' }).first().click();
await p.waitForTimeout(500);
checar(p.url().includes(`/analise/estudo/${ID_A}`), `URL virou ${new URL(p.url()).pathname}`);

// O que estava quebrado: Voltar do navegador.
await p.goBack();
await p.waitForTimeout(400);
checar(new URL(p.url()).pathname === '/analise', 'Voltar do navegador retorna a lista');

await p.goForward();
await p.waitForTimeout(400);
checar(p.url().includes('/estudo/'), 'Avancar do navegador reabre o estudo');

// Recarregar mantem o lugar.
await p.reload();
await p.waitForTimeout(600);
checar(p.url().includes(`/analise/estudo/${ID_A}`), 'recarregar mantem o estudo aberto');

// Link direto.
await p.goto(`http://localhost:5199/analise/estudo/${ID_A}`);
await p.waitForTimeout(600);
// A trilha separada virou acao de voltar dentro da barra de topo.
const voltar = await p.locator('[aria-label="Voltar para a lista de estudos"]').count();
checar(voltar > 0, 'link direto abre o estudo com saida para a lista no cabecalho');

await b.close();
console.log(falhas ? `\n${falhas} verificacao(oes) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
