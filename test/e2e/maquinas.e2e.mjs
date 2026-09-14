/**
 * Cadastro de maquinas — grupos codificados e a impressao dedicada.
 *
 * O que este teste guarda:
 *  - a tela vive em Ferramentas > Maquinas e mostra grupos com CODIGO;
 *  - a lista de maquinas sai agrupada ("0002 · FURADEIRA") e a desativada
 *    e' visivel como tal;
 *  - o documento de impressao existe, com cabecalho proprio, TODAS as
 *    maquinas (desativadas incluidas) e o grupo ainda sem maquina.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/maquinas.e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PAGINA = `${BASE}/test/e2e/harness-lista/index.html?modo=analise`;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto(PAGINA);
await p.getByText('Sleep Base').first().waitFor({ timeout: 8000 });

/* --------------------------------------- a tela vive em Ferramentas */
const item = p.getByRole('button', { name: 'Máquinas' }).first();
checar(await item.count() === 1, 'PC: "Máquinas" vive em Ferramentas, no menu lateral');
await item.click();

const dialogo = p.locator('[aria-label="Cadastro de máquinas"][role=dialog]');
await dialogo.waitFor({ timeout: 4000 });
await p.waitForFunction(
  () => /SECCIONADORA/.test(document.querySelector('[role=dialog]')?.innerText || ''),
  { timeout: 4000 },
);
const texto = await dialogo.innerText();
checar(/0001/.test(texto) && /SECCIONADORA/.test(texto) && /0002/.test(texto),
  'o bloco de grupos mostra os codigos do ERP (0001, 0002)');
checar(/0002 · FURADEIRA/.test(texto) && /Furadeira 12/.test(texto),
  'a lista de maquinas sai agrupada sob o cabecalho do grupo');
checar(/Desativada/.test(texto), 'maquina desativada aparece marcada, nao some');
checar(await dialogo.getByRole('button', { name: 'Imprimir' }).count() === 1,
  'a tela tem o botao Imprimir');

/* ============================================================
   A COLUNA DE GRUPOS: filtra a lista e da contexto ao cadastro.

   Com o cadastro cheio (o do print do usuario), a tela antiga era um
   scroll unico com o campo de cadastrar no FIM. O que se prova aqui e'
   que escolher o grupo passou a fazer as duas coisas que importam:
   encurtar a lista e dizer onde a proxima maquina vai nascer.
   ============================================================ */
const grupoFuradeira = dialogo.getByRole('button', { name: /FURADEIRA/ }).first();
await grupoFuradeira.click();
await p.waitForTimeout(150);
const soFuradeiras = await dialogo.innerText();
checar(/FURADEIRA 11/.test(soFuradeiras) && !/FRESADORA 01/.test(soFuradeiras),
  'escolher o grupo mostra so as maquinas dele');
checar(/em\s+0002 · FURADEIRA/.test(soFuradeiras),
  'com o grupo aberto, o cadastro diz onde a maquina vai nascer — sem lista suspensa');
checar(await dialogo.locator('select').count() === 0,
  'e o seletor de grupo nem aparece: ele so existe em "Todas"');

await dialogo.getByLabel('Nome da nova máquina').fill('FURADEIRA 21');
await dialogo.getByRole('button', { name: '+ Cadastrar' }).click();
await p.waitForTimeout(250);
const enviado = await p.evaluate(() => window.__posts.filter((x) => /maquinas/.test(x.url)).pop());
checar(enviado?.corpo?.nome === 'FURADEIRA 21' && enviado?.corpo?.grupoId === 'g2',
  'a maquina sobe ja no grupo aberto (grupoId g2), sem ninguem escolher nada');
checar(/FURADEIRA 21/.test(await dialogo.innerText()), 'e aparece na lista do grupo');

/* "Sem grupo" NAO e' grupo: mandar o id falso dele para a API daria erro
   de validacao no lugar de cadastrar a maquina sem grupo. */
await dialogo.getByRole('button', { name: /Sem grupo/ }).click();
await p.waitForTimeout(150);
checar(/ESQUADREJADEIRA/.test(await dialogo.innerText()) && !/FURADEIRA 11/.test(await dialogo.innerText()),
  '"Sem grupo" lista as maquinas que nao tem grupo nenhum');
await dialogo.getByLabel('Nome da nova máquina').fill('LIXADEIRA');
await dialogo.getByRole('button', { name: '+ Cadastrar' }).click();
await p.waitForTimeout(250);
const semGrupo = await p.evaluate(() => window.__posts.filter((x) => /maquinas/.test(x.url)).pop());
checar(semGrupo?.corpo?.nome === 'LIXADEIRA' && semGrupo?.corpo?.grupoId === null,
  'cadastrar em "Sem grupo" manda grupoId nulo — nao o id do filtro');

/* ---- a busca, que so aparece quando a lista justifica ---- */
await dialogo.getByRole('button', { name: /^Todas/ }).click();
await p.waitForTimeout(150);
const busca = dialogo.getByLabel('Buscar máquina');
checar(await busca.count() === 1, 'com o cadastro cheio, a busca aparece');
await busca.fill('fresadora');
await p.waitForTimeout(150);
const buscado = await dialogo.innerText();
checar(/FRESADORA 01/.test(buscado) && !/FURADEIRA 11/.test(buscado),
  'a busca acha pelo nome, ignorando caixa');
await busca.fill('');
await p.waitForTimeout(150);

/* ---- excluir pede confirmacao: a lista ficou densa ---- */
await dialogo.getByRole('button', { name: 'Excluir FURADEIRA 11' }).click();
await p.waitForTimeout(150);
checar(/Excluir do cadastro\?/.test(await dialogo.innerText()),
  'excluir pergunta antes — clique errado numa lista densa apagaria cadastro');
await dialogo.getByRole('button', { name: 'Cancelar' }).first().click();
await p.waitForTimeout(150);
checar(/FURADEIRA 11/.test(await dialogo.innerText()), 'e cancelar nao apaga nada');

if (process.env.FOTO) await dialogo.screenshot({ path: process.env.FOTO });

/* ------------------------------------------- o documento de impressao */
const impresso = await p.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
checar(/Cadastro de Máquinas/.test(impresso), 'o papel e um documento proprio, com titulo');
checar(/0002/.test(impresso) && /Furadeira 16/.test(impresso) && /Desativada/.test(impresso),
  'o papel lista todas as maquinas com grupo e situacao — desativada incluida');
checar(/sem máquinas cadastradas/.test(impresso) && /SECCIONADORA/.test(impresso),
  'grupo ainda sem maquina tambem sai no papel');
checar(await p.evaluate(() => {
  const doc = document.querySelector('.somente-impressao');
  return doc && getComputedStyle(doc).display === 'none';
}), 'na tela o documento fica invisivel — ele so existe para o papel');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await b.close();
process.exit(falhas ? 1 : 0);
