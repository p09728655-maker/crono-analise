/**
 * MOTIVOS E PRODUTOS POR GRUPO — do cadastro no PC ao que o tablet oferece.
 *
 * O servidor e' simulado: o que se prova e' a regra de oferta na tela. A
 * embalagem ve' os produtos e os motivos dela (e os que valem para todos),
 * nunca os da furadeira; o PC cadastra produto no grupo certo e diz para
 * quem cada motivo vale, com o setup sempre para todos.
 *
 * VOLUMES (quantas caixas o produto leva na embalagem): o PC grava o numero
 * no cadastro e na edicao, vazio vai como null (nunca 1), texto que nao e'
 * numero nao sai do navegador, e o produto ativo da embalagem sem o numero
 * ganha o destaque — o da furadeira, nao.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/cadastros.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const EMB = { id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM', horas_semana: null };
const FUR = { id: '00000000-0000-0000-0000-0000000000f1', codigo: '0002', nome: 'FURADEIRA', horas_semana: null };
const CADASTRO = {
  maquinas: [
    { id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true, grupo_id: EMB.id, grupo_codigo: EMB.codigo, grupo_nome: EMB.nome },
    { id: '00000000-0000-0000-0000-0000000000a2', nome: 'FURADEIRA 03', ativa: true, grupo_id: FUR.id, grupo_codigo: FUR.codigo, grupo_nome: FUR.nome },
  ],
  grupos: [FUR, EMB],
  produtos: [
    { id: 'p1', nome: 'Rack Sirius 1.6', codigo: '12345', grupo_id: EMB.id, ativo: true, volumes: 2 },
    { id: 'p2', nome: 'Rack Antigo', codigo: null, grupo_id: EMB.id, ativo: false, volumes: null },
    { id: 'p3', nome: 'Lateral Mesa', codigo: null, grupo_id: FUR.id, ativo: true, volumes: null },
    // Sem a chave `volumes`: o cadastro de um servidor que ainda nao a tem
    // (ou o cache velho do tablet) — tem de valer como "nao informado".
    { id: 'p4', nome: 'Mesa Cabeceira Sleep', codigo: null, grupo_id: EMB.id, ativo: true },
  ],
};
const MOTIVOS = [
  { id: 'm1', codigo: 'setup', rotulo: 'Setup / Troca', acao: null, ordem: 0, ativo: true, grupos: [] },
  { id: 'm2', codigo: 'falta_de_caixa', rotulo: 'Falta de caixa', acao: null, ordem: 1, ativo: true, grupos: [EMB.id] },
  { id: 'm3', codigo: 'troca_de_broca', rotulo: 'Troca de broca', acao: null, ordem: 2, ativo: true, grupos: [FUR.id] },
];

async function simularServidor(pagina, escritas) {
  await pagina.route('**/api/maquinas**', (rota) => {
    const url = rota.request().url();
    if (/demanda=1/.test(url)) return rota.fulfill({ json: { demandas: [] } });
    if (/produtos=1/.test(url)) {
      const corpo = rota.request().postDataJSON();
      escritas.push({ rota: 'produtos', metodo: rota.request().method(), url, corpo });
      return rota.fulfill({ status: 201, json: { produto: { id: 'p9', ativo: true, grupo_id: corpo?.grupoId, ...corpo } } });
    }
    return rota.fulfill({ json: CADASTRO });
  });
  await pagina.route('**/api/motivos-parada**', (rota) => {
    if (rota.request().method() === 'GET') return rota.fulfill({ json: { motivos: MOTIVOS } });
    escritas.push({ rota: 'motivos', metodo: rota.request().method(), url: rota.request().url(), corpo: rota.request().postDataJSON() });
    return rota.fulfill({ json: { motivo: MOTIVOS[2] } });
  });
  await pagina.route('**/api/conferencias**', (rota) => rota.fulfill({ json: { conferencias: [], outras: 0 } }));
  await pagina.route('**/api/sync**', (rota) => rota.fulfill({ json: { recebidos: 0, novos: 0, clientIds: [] } }));
}

const opcoes = (select) => select.locator('option').allInnerTexts();
const navegador = await chromium.launch({ executablePath: EXEC });

/* ================================================================ TABLET */
const tablet = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const t = await tablet.newPage();
await semearSessao(t);
const erros = [];
t.on('pageerror', (e) => erros.push(e.message));
await simularServidor(t, []);

await t.goto(`${BASE}/coleta/embalagem`);
const produto = t.locator('select[aria-label="Produto embalado"]');
await produto.waitFor({ timeout: 8000 });
const listaEmb = await opcoes(produto);
checar(listaEmb.includes('Rack Sirius 1.6 · 12345'), 'embalagem: o produto do grupo aparece, com o codigo do ERP');
checar(!listaEmb.some((o) => /Lateral Mesa/.test(o)), 'embalagem: produto da furadeira NAO aparece');
checar(!listaEmb.some((o) => /Rack Antigo/.test(o)), 'embalagem: produto desativado NAO aparece');
await produto.selectOption('Rack Sirius 1.6');
checar(await produto.inputValue() === 'Rack Sirius 1.6', 'escolher grava o nome do produto');
await produto.selectOption('__outro');
const livre = t.locator('input[aria-label="Produto embalado"]');
await livre.fill('Produto novo');
checar(await livre.inputValue() === 'Produto novo', '"Outro produto…" abre o texto livre');
checar(await t.getByRole('button', { name: /escolher do cadastro/ }).count() === 1, 'e da para voltar a lista');

await t.getByRole('button', { name: /INICIAR/ }).click();
// Parou so' vale depois da largada: antes dela nao ha' periodo. A espera
// passa a guarda de repique, que conta do INICIAR.
await t.getByRole('button', { name: /Largada/ }).waitFor({ timeout: 4000 });
await t.waitForTimeout(260);
await t.getByRole('button', { name: /Largada/ }).dispatchEvent('pointerdown');
await t.getByRole('button', { name: 'Parou' }).click();
const folha = t.locator('[aria-label="Por que a máquina parou"]');
await folha.waitFor({ timeout: 4000 });
const motivosEmb = await folha.innerText();
if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-motivos-embalagem.png` });
checar(/Falta de caixa/.test(motivosEmb) && /Setup \/ Troca/.test(motivosEmb),
  'embalagem: motivos da embalagem e os de todos (setup)');
checar(!/Troca de broca/.test(motivosEmb), 'embalagem: motivo so da furadeira NAO aparece');
await tablet.close();

/* Ritmo da maquina: a lista acompanha a MAQUINA escolhida. */
const ritmo = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const r = await ritmo.newPage();
await semearSessao(r);
r.on('pageerror', (e) => erros.push(e.message));
await simularServidor(r, []);
await r.goto(`${BASE}/coleta/rapida`);
const maquina = r.locator('select[aria-label="Máquina"]');
await maquina.waitFor({ timeout: 8000 });
checar(await r.locator('input[aria-label="Nome da peça"]').count() === 1, 'ritmo sem maquina: a peca e texto livre, como sempre');
await maquina.selectOption('FURADEIRA 03');
const peca = r.locator('select[aria-label="Nome da peça"]');
await peca.waitFor({ timeout: 4000 });
const listaFur = await opcoes(peca);
checar(listaFur.includes('Lateral Mesa') && !listaFur.some((o) => /Rack/.test(o)),
  'ritmo na furadeira: so os produtos da furadeira');
await ritmo.close();

/* ==================================================================== PC */
const pc = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await pc.newPage();
await semearSessao(p);
p.on('pageerror', (e) => erros.push(e.message));
const escritas = [];
await simularServidor(p, escritas);

await p.goto(`${BASE}/analise/embalagem`);
await p.getByRole('button', { name: 'Produtos da embalagem' }).click();
const cadastro = p.getByRole('dialog', { name: 'Cadastro de produtos' });
await cadastro.waitFor({ timeout: 8000 });
checar(await cadastro.locator('button[aria-current="true"]').innerText().then((x) => /EMBALAGEM/.test(x)),
  'PC: o cadastro abre no grupo da embalagem');
checar(/Rack Sirius 1\.6/.test(await cadastro.innerText()) && !/Lateral Mesa/.test(await cadastro.innerText()),
  'PC: a lista mostra so os produtos do grupo aberto');
await cadastro.locator('input[aria-label="Nome do produto"]').first().fill('Armário Encanto');
await cadastro.locator('input[aria-label="Código do produto no ERP"]').first().fill('A-77');
await cadastro.getByRole('button', { name: 'Cadastrar' }).click();
for (let i = 0; i < 20 && !escritas.some((e) => e.rota === 'produtos'); i++) await p.waitForTimeout(100);
const novo = escritas.find((e) => e.rota === 'produtos');
checar(novo?.metodo === 'POST' && novo.corpo?.nome === 'Armário Encanto' && novo.corpo?.codigo === 'A-77'
  && novo.corpo?.grupoId === EMB.id, 'PC: cadastrar manda nome, codigo e o grupo da embalagem');
checar(novo && 'volumes' in novo.corpo && novo.corpo.volumes === null,
  'PC: volumes em branco vai como null (nao informado), nunca 1');

/* VOLUMES na lista: o selo do numero, e o destaque so' para o produto
   ativo da embalagem que nao tem o numero. */
const linhaDe = (nome) => cadastro.locator('div').filter({ has: p.getByText(nome, { exact: true }) }).last();
checar(/2 volumes/.test(await linhaDe('Rack Sirius 1.6').innerText()), 'PC: a linha mostra o selo "2 volumes"');
checar(/volumes não informados/.test(await linhaDe('Mesa Cabeceira Sleep').innerText()),
  'PC: produto ativo da embalagem sem volumes ganha o destaque (mesmo sem a chave no cadastro)');
checar(!/volumes não informados/.test(await linhaDe('Rack Antigo').innerText()),
  'PC: produto desativado nao ganha o destaque');
checar(await cadastro.getByText('volumes não informados', { exact: true }).count() === 1,
  'PC: um destaque so, o do produto que falta');

// Texto que nao e' numero: erro na tela e NADA sai para o servidor.
const antes = escritas.length;
await cadastro.locator('input[aria-label="Nome do produto"]').first().fill('Rack Pinus');
await cadastro.locator('input[aria-label="Volumes do produto"]').first().fill('2 caixas');
await cadastro.getByRole('button', { name: 'Cadastrar' }).click();
await cadastro.getByRole('alert').waitFor({ timeout: 4000 });
checar(/não é um número inteiro/.test(await cadastro.getByRole('alert').innerText()) && escritas.length === antes,
  'PC: "2 caixas" em volumes da erro na tela e nao envia nada');

// Numero valido: vai no POST como numero.
await cadastro.locator('input[aria-label="Volumes do produto"]').first().fill('3');
await cadastro.getByRole('button', { name: 'Cadastrar' }).click();
for (let i = 0; i < 20 && escritas.length === antes; i++) await p.waitForTimeout(100);
const comVolumes = escritas[antes];
checar(comVolumes?.metodo === 'POST' && comVolumes.corpo?.nome === 'Rack Pinus' && comVolumes.corpo?.volumes === 3,
  'PC: cadastrar com 3 volumes manda volumes: 3');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-produtos.png` });

// EDITAR: o campo abre com o numero gravado; trocar manda o PATCH.
await cadastro.getByRole('button', { name: 'Editar Rack Sirius 1.6' }).click();
const edicao = cadastro.getByRole('form', { name: 'Editar Rack Sirius 1.6' });
const campoEdicao = edicao.locator('input[aria-label="Volumes do produto"]');
checar(await campoEdicao.inputValue() === '2', 'PC: editar abre com os volumes gravados (2)');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-produtos-editar.png` });
await campoEdicao.fill('1');
const antesPatch = escritas.length;
await edicao.getByRole('button', { name: 'Salvar' }).click();
for (let i = 0; i < 20 && escritas.length === antesPatch; i++) await p.waitForTimeout(100);
const patchProduto = escritas[antesPatch];
checar(patchProduto?.metodo === 'PATCH' && /id=p1/.test(patchProduto.url) && patchProduto.corpo?.volumes === 1
  && patchProduto.corpo?.nome === 'Rack Sirius 1.6', 'PC: salvar a edicao manda o PATCH com volumes: 1');

// Esvaziar o campo na edicao APAGA (null), nao vira 1.
await cadastro.getByRole('button', { name: 'Editar Rack Sirius 1.6' }).click();
await cadastro.getByRole('form', { name: 'Editar Rack Sirius 1.6' }).locator('input[aria-label="Volumes do produto"]').fill('');
const antesApagar = escritas.length;
await cadastro.getByRole('form', { name: 'Editar Rack Sirius 1.6' }).getByRole('button', { name: 'Salvar' }).click();
for (let i = 0; i < 20 && escritas.length === antesApagar; i++) await p.waitForTimeout(100);
checar(escritas[antesApagar]?.metodo === 'PATCH' && escritas[antesApagar].corpo?.volumes === null,
  'PC: esvaziar os volumes na edicao manda null (apaga)');

// Na furadeira nao ha' o que converter: nada de destaque.
await cadastro.getByRole('button', { name: /FURADEIRA/ }).click();
await cadastro.getByText('Lateral Mesa', { exact: true }).waitFor({ timeout: 4000 });
checar(await cadastro.getByText('volumes não informados', { exact: true }).count() === 0,
  'PC: produto da furadeira sem volumes NAO ganha o destaque');
await cadastro.getByRole('button', { name: 'Fechar' }).click();

await p.getByRole('button', { name: 'Motivos de parada' }).click();
const motivos = p.getByRole('dialog', { name: 'Motivos de parada' });
await motivos.getByText('Falta de caixa', { exact: true }).waitFor({ timeout: 8000 });
const textoMotivos = await motivos.innerText();
checar(/Só EMBALAGEM/.test(textoMotivos) && /Todas as máquinas/.test(textoMotivos),
  'PC: cada motivo diz para quem vale');
await motivos.getByRole('button', { name: 'Editar Setup / Troca' }).click();
checar(/vale sempre para todos os grupos/i.test(await motivos.innerText())
  && await motivos.locator('input[type="checkbox"]').count() === 0, 'PC: o setup nao se restringe');
await motivos.getByRole('button', { name: 'Cancelar' }).click();
await motivos.getByRole('button', { name: 'Editar Troca de broca' }).click();
const caixas = motivos.locator('input[type="checkbox"]');
checar(await caixas.count() === 2, 'PC: um quadradinho por grupo');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-motivos.png`, fullPage: true });
await motivos.getByLabel(/0005 · EMBALAGEM/).check();
await motivos.getByRole('button', { name: 'Salvar' }).click();
for (let i = 0; i < 20 && !escritas.some((e) => e.rota === 'motivos'); i++) await p.waitForTimeout(100);
const patch = escritas.find((e) => e.rota === 'motivos');
checar(patch?.metodo === 'PATCH' && JSON.stringify([...(patch.corpo?.grupos || [])].sort()) === JSON.stringify([EMB.id, FUR.id].sort()),
  'PC: salvar manda os grupos marcados');

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
