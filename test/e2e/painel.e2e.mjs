/**
 * PAINEL DE GESTAO A VISTA — o monitor do chao de fabrica.
 *
 * O que este teste prova, com a API mockada: a rota abre num aparelho SEM
 * MOUSE (o caso real da TV de parede, que a regra de aparelho mandaria
 * para a coleta), as maquinas saem agrupadas pelo grupo do cadastro, cada
 * cartao carrega a IDADE da propria medicao, a medicao velha e' marcada em
 * vez de se apresentar como o ritmo de agora, e a maquina que ninguem
 * mediu aparece em vez de sumir.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/painel.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
/**
 * TV DE PAREDE: tela grande e NENHUM ponteiro. `hasTouch` sem mouse e' o
 * que faz `ehDesktop()` devolver false — e e' exatamente a combinacao que
 * mandaria o painel para a coleta se a rota nao tivesse modo proprio.
 */
const ctx = await navegador.newContext({
  viewport: { width: 1920, height: 1080 }, hasTouch: true, isMobile: false,
});
const p = await ctx.newPage();
await semearSessao(p);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

const atras = (dias) => new Date(Date.now() - (dias * 86400000)).toISOString();
const medicao = (id, maquina, dias, pecas, paradas = []) => ({
  id, maquina, peca: 'Princesa Fundo',
  iniciado_em: atras(dias), finalizado_em: atras(dias), salvo_em: atras(dias),
  duracao_ms: 3600000, pecas, ciclos_por_peca: 1, arquivada: false, paradas,
});

await p.route('**/api/conferencias**', (rota) => rota.fulfill({
  json: {
    conferencias: [
      // Recente e rapida.
      medicao('p1', 'FURADEIRA 16', 0, 900),
      // Recente e lenta, com parada: e' a que exige atencao no grupo.
      medicao('p2', 'FURADEIRA 12', 0, 400, [{ motivo: 'manutencao', duracao_ms: 900000 }]),
      // Medida ha' cinco dias: o numero e' de outra semana.
      medicao('p3', 'FURADEIRA 04', 5, 700),
      // Outro grupo — nao se compara com furadeira.
      medicao('p4', 'CNC SCM', 0, 181),
    ],
    outras: 0,
  },
}));
await p.route('**/api/maquinas**', (rota) => rota.fulfill({
  json: {
    grupos: [
      { id: 'g2', codigo: '0002', nome: 'FURADEIRA' },
      { id: 'g6', codigo: '0006', nome: 'CNC' },
    ],
    maquinas: [
      { id: 'm1', nome: 'FURADEIRA 16', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      { id: 'm2', nome: 'FURADEIRA 12', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      { id: 'm3', nome: 'FURADEIRA 04', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      // NUNCA MEDIDA: e' a pendencia que o painel existe para revelar.
      { id: 'm4', nome: 'FURADEIRA 21', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      // Desativada: nao e' pendencia, nao entra.
      { id: 'm5', nome: 'FURADEIRA 99', ativa: false, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      { id: 'm6', nome: 'CNC SCM', ativa: true, grupo_id: 'g6', grupo_codigo: '0006', grupo_nome: 'CNC' },
    ],
  },
}));

await p.goto(`${BASE}/painel`);
await p.getByText('Ritmo por máquina').first().waitFor({ timeout: 10000 });
checar(await p.evaluate(() => location.pathname) === '/painel',
  'TV sem mouse ABRE o painel — nao cai na coleta pela regra de aparelho');

const tela = await p.locator('body').innerText();

/* ---- o periodo declarado, porque painel de parede se le como "agora" ---- */
checar(/Últimos 7 dias/.test(tela),
  'o topo diz de que periodo o painel fala — parede sugere agora por natureza');

/* ---- agrupado pelo cadastro, sem comparar grupos ---- */
const grupos = await p.locator('h2').allInnerTexts();
checar(grupos[0].includes('FURADEIRA') && grupos.some((g) => g.includes('CNC')),
  'as maquinas saem agrupadas pelo grupo do cadastro');
checar(grupos.length === 2, 'um bloco por grupo — CNC a 181 nao entra na lista das furadeiras');

/* ---- dentro do grupo, o que exige atencao primeiro ---- */
const cartoes = await p.locator('[style*="grid-template-columns"] > div').allInnerTexts();
const ordem = cartoes.map((c) => c.split('\n')[0]);
checar(ordem[0] === 'FURADEIRA 21',
  'a maquina que ninguem mediu vem PRIMEIRO — nem se sabe se ela esta bem');
checar(ordem[1] === 'FURADEIRA 04',
  'depois a de numero velho: ela tambem nao afirma o presente');
checar(ordem[2] === 'FURADEIRA 12' && ordem[3] === 'FURADEIRA 16',
  'e entre as atuais, o menor ritmo primeiro — e onde a capacidade se perde');

/* ---- a maquina esquecida aparece, em vez de sumir ---- */
checar(/FURADEIRA 21/.test(tela) && /Sem medição nos últimos 7 dias/.test(tela),
  'posto do cadastro sem medicao aparece e diz que ninguem o mediu');
checar(!/FURADEIRA 99/.test(tela),
  'maquina DESATIVADA nao entra: nao e pendencia de medicao');

/* ---- numero velho nao se apresenta como agora ---- */
checar(/há 5 dias/.test(tela),
  'cada cartao carrega a idade da propria medicao');
checar(/número de 2\+ dias atrás/.test(tela),
  'e a medicao velha e MARCADA — 700 pç/h de cinco dias atras nao e o ritmo de agora');
checar(/4 máquina\(s\) sem número atual|2 de 4 sem número atual/.test(tela),
  'o topo e o grupo dizem quantas maquinas o painel nao consegue afirmar');

/* ---- o ritmo que decide, com o potencial ao lado ---- */
// FURADEIRA 12: 400 pecas em 1 h de relogio = 400 pc/h; 15 min parados
// deixam 45 min rodando -> 533 pc/h, 75% do tempo.
checar(/400/.test(tela) && /533 pç\/h rodando/.test(tela) && /75% do tempo/.test(tela),
  'a manchete e o ritmo de RELOGIO, com o rodando ao lado como potencial');
checar(/maior parada: /.test(tela),
  'e o maior motivo de parada, que e o que se trata primeiro');

/* ---- tela de parede: nada de clicar ---- */
checar(await p.locator('button').count() === 0,
  'painel de parede nao tem botao nenhum — ninguem chega perto para apertar');

/* ======== o painel tem de ser ACHAVEL: ele nasceu so por URL digitada ==== */
/**
 * A primeira versao criou a tela e nenhuma porta para ela — existia e era
 * invisivel. O item vive em FERRAMENTAS, ao lado de Demanda semanal, que
 * e' onde se procura esse tipo de coisa.
 */
{
  const ctx2 = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx2.newPage();
  await semearSessao(p2);
  await p2.route('**/api/conferencias**', (rota) => rota.fulfill({
    json: { conferencias: [medicao('x1', 'FURADEIRA 16', 0, 700)], outras: 0 },
  }));
  await p2.route('**/api/maquinas**', (rota) => rota.fulfill({ json: { grupos: [], maquinas: [] } }));

  await p2.goto(`${BASE}/analise/conferencias`);
  const item = p2.getByRole('button', { name: 'Painel de parede' });
  await item.waitFor({ timeout: 10000 });
  checar(true, 'o relatorio oferece "Painel de parede" em Ferramentas — nao so por URL digitada');

  /**
   * ABA NOVA de proposito: o painel nao tem botao nenhum, entao aberto
   * nesta mesma aba prenderia quem clicou, sem volta.
   */
  const [aba] = await Promise.all([ctx2.waitForEvent('page'), item.click()]);
  await aba.waitForLoadState('domcontentloaded');
  checar(new URL(aba.url()).pathname === '/painel',
    'e abre o painel em ABA NOVA — a tela de parede nao tem volta');
  checar(await p2.evaluate(() => location.pathname) === '/analise/conferencias',
    'o relatorio fica onde estava: quem clicou nao perde o que estava vendo');
  await ctx2.close();
}

checar(erros.length === 0, `sem erro de pagina (${erros.join(' | ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
