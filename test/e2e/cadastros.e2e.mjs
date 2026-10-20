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
 * ganha o destaque. Campo, selo, destaque e dica so' existem nos grupos de
 * EMBALAGEM: na furadeira nada disso aparece e nada de volumes e' enviado.
 *
 * ALTURA: num notebook (1366x657 de area util, e 1280x600) com muitos
 * produtos e grupos, o rodape (Fechar, alerta) nao pode cair por cima da
 * lista — clicar Desativar no ultimo produto ja' fechou o cadastro.
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
    // Da furadeira COM numero gravado (veio da embalagem por engano e
    // mudou de grupo): fora da embalagem o selo nao aparece.
    { id: 'p5', nome: 'Tampo Mesa', codigo: null, grupo_id: FUR.id, ativo: true, volumes: 3 },
  ],
};
const MOTIVOS = [
  { id: 'm1', codigo: 'setup', rotulo: 'Setup / Troca', acao: null, ordem: 0, ativo: true, grupos: [] },
  { id: 'm2', codigo: 'falta_de_caixa', rotulo: 'Falta de caixa', acao: null, ordem: 1, ativo: true, grupos: [EMB.id] },
  { id: 'm3', codigo: 'troca_de_broca', rotulo: 'Troca de broca', acao: null, ordem: 2, ativo: true, grupos: [FUR.id] },
];

async function simularServidor(pagina, escritas, cadastro = CADASTRO) {
  await pagina.route('**/api/maquinas**', (rota) => {
    const url = rota.request().url();
    if (/demanda=1/.test(url)) return rota.fulfill({ json: { demandas: [] } });
    if (/produtos=1/.test(url)) {
      const corpo = rota.request().postDataJSON();
      escritas.push({ rota: 'produtos', metodo: rota.request().method(), url, corpo });
      return rota.fulfill({ status: 201, json: { produto: { id: 'p9', ativo: true, grupo_id: corpo?.grupoId, ...corpo } } });
    }
    return rota.fulfill({ json: cadastro });
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
// A dica diz o que o sistema faz com o numero — e sem ele.
const dicaEmb = await cadastro.innerText();
checar(/takt do programa e a medição da linha entram no estudo por produto/.test(dicaEmb)
  && /Em branco, o takt não entra sozinho e a medição fica em volumes/.test(dicaEmb),
  'PC: a dica da embalagem diz que, com volumes, takt e medicao viram produto; sem, nada converte');

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

// Mudar de grupo na EDICAO: o campo segue o grupo escolhido no formulario.
// Indo para a furadeira, ele some e o PATCH nao leva volumes.
await cadastro.getByRole('button', { name: 'Editar Mesa Cabeceira Sleep' }).click();
const mover = cadastro.getByRole('form', { name: 'Editar Mesa Cabeceira Sleep' });
checar(await mover.locator('input[aria-label="Volumes do produto"]').count() === 1,
  'PC: editar produto da embalagem mostra o campo Volumes');
await mover.locator('select[aria-label="Grupo do produto"]').selectOption(FUR.id);
checar(await mover.locator('input[aria-label="Volumes do produto"]').count() === 0,
  'PC: trocar o grupo da edicao para a furadeira esconde o campo');
const antesMover = escritas.length;
await mover.getByRole('button', { name: 'Salvar' }).click();
for (let i = 0; i < 20 && escritas.length === antesMover; i++) await p.waitForTimeout(100);
const patchMover = escritas[antesMover];
checar(patchMover?.metodo === 'PATCH' && patchMover.corpo?.grupoId === FUR.id && !('volumes' in (patchMover.corpo || {})),
  'PC: mover para a furadeira manda o PATCH SEM volumes');

// Numero digitado na embalagem e o grupo trocado antes de cadastrar: o
// produto da furadeira nao leva os volumes que ficaram no campo.
await cadastro.locator('input[aria-label="Volumes do produto"]').first().fill('4');

// Na furadeira nao ha' o que converter: nem campo, nem selo, nem destaque.
await cadastro.getByRole('button', { name: /FURADEIRA/ }).click();
await cadastro.getByText('Lateral Mesa', { exact: true }).waitFor({ timeout: 4000 });
checar(await cadastro.getByText('volumes não informados', { exact: true }).count() === 0,
  'PC: produto da furadeira sem volumes NAO ganha o destaque');
checar(await cadastro.locator('input[aria-label="Volumes do produto"]').count() === 0,
  'PC: na furadeira o cadastro nao tem o campo Volumes');
const textoFur = await cadastro.innerText();
checar(!/3 volumes/.test(textoFur) && /Tampo Mesa/.test(textoFur),
  'PC: produto da furadeira com numero gravado NAO mostra o selo de volumes');
checar(!/Volumes =/.test(textoFur), 'PC: na furadeira a dica de volumes nao aparece');
if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-produtos-furadeira.png` });

await cadastro.locator('input[aria-label="Nome do produto"]').first().fill('Lateral Nova');
const antesFur = escritas.length;
await cadastro.getByRole('button', { name: 'Cadastrar' }).click();
for (let i = 0; i < 20 && escritas.length === antesFur; i++) await p.waitForTimeout(100);
const postFur = escritas[antesFur];
checar(postFur?.metodo === 'POST' && postFur.corpo?.grupoId === FUR.id && postFur.corpo?.nome === 'Lateral Nova'
  && !('volumes' in postFur.corpo), 'PC: cadastrar na furadeira manda o POST SEM volumes (nem o 4 que ficou digitado)');

await cadastro.getByRole('button', { name: 'Editar Lateral Mesa' }).click();
const edicaoFur = cadastro.getByRole('form', { name: 'Editar Lateral Mesa' });
checar(await edicaoFur.locator('input[aria-label="Volumes do produto"]').count() === 0,
  'PC: editar produto da furadeira nao mostra o campo Volumes');
await edicaoFur.locator('input[aria-label="Nome do produto"]').fill('Lateral Mesa 2');
const antesEdFur = escritas.length;
await edicaoFur.getByRole('button', { name: 'Salvar' }).click();
for (let i = 0; i < 20 && escritas.length === antesEdFur; i++) await p.waitForTimeout(100);
const patchFur = escritas[antesEdFur];
checar(patchFur?.metodo === 'PATCH' && /id=p3/.test(patchFur.url) && patchFur.corpo?.nome === 'Lateral Mesa 2'
  && !('volumes' in patchFur.corpo), 'PC: editar produto da furadeira manda o PATCH SEM volumes');
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

/* ============================================ ALTURA DO NOTEBOOK
   O painel de produtos e' mais alto que o de maquinas (volumes, dica). Com
   a lista de altura fixa, em 1366x657 o Fechar e o alerta ficavam POR
   CIMA das ultimas linhas: o clique em "Desativar" do ultimo produto caia
   no Fechar e o cadastro fechava sem mandar nada. O que se prova: com 14
   produtos e 10 grupos, a lista rolada ate' o fim deixa o ultimo botao
   livre — com e sem o alerta na tela — e o clique de verdade manda o PATCH. */
const EXTRAS = ['SECCIONADORA', 'BORDEADEIRA', 'FRESADORA', 'LIXADEIRA', 'PINTURA', 'MONTAGEM', 'PRENSA', 'SERRA']
  .map((nome, i) => ({ id: `00000000-0000-0000-0000-00000000010${i}`, codigo: `00${10 + i}`, nome, horas_semana: null }));
const NOME_LONGO = 'Rack Sirius 1.6 com Painel Encanto Off White 5';
const CHEIO = {
  maquinas: CADASTRO.maquinas,
  grupos: [FUR, EMB, ...EXTRAS],
  produtos: Array.from({ length: 14 }, (_, i) => ({
    id: `q${i + 1}`,
    nome: i === 2 ? NOME_LONGO : `Produto ${String(i + 1).padStart(2, '0')}`,
    codigo: i === 2 ? '12345678' : (i % 3 ? `C${i + 1}` : null),
    grupo_id: EMB.id, ativo: true, volumes: i === 2 || i % 2 ? null : 2,
  })),
};
const ULTIMO = 'Produto 14';

// Rola, ate' o fim, a caixa que rola em volta do botao — como a roda do mouse.
const rolarAteOFim = (botao) => botao.evaluate((el) => {
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (a.scrollHeight > a.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(a).overflowY)) {
      a.scrollTop = a.scrollHeight;
      return;
    }
  }
});
const caixaDe = (loc) => loc.boundingBox().then((b) => b && { topo: b.y, base: b.y + b.height });

for (const [largura, altura] of [[1366, 657], [1280, 600]]) {
  const tela = `${largura}x${altura}`;
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura } });
  const pg = await ctx.newPage();
  await semearSessao(pg);
  pg.on('pageerror', (e) => erros.push(e.message));
  const esc = [];
  await simularServidor(pg, esc, CHEIO);
  await pg.goto(`${BASE}/analise/embalagem`);
  await pg.getByRole('button', { name: 'Produtos da embalagem' }).click();
  const dlg = pg.getByRole('dialog', { name: 'Cadastro de produtos' });
  await dlg.getByText(ULTIMO, { exact: true }).waitFor({ timeout: 8000 });
  const fechar = dlg.getByRole('button', { name: 'Fechar' });

  // O nome longo, com codigo e o selo na mesma linha: quebra, nao corta.
  const nomeLongo = dlg.getByText(NOME_LONGO, { exact: true });
  const cortado = await nomeLongo.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  checar(!cortado, `${tela}: o nome longo ao lado do selo aparece inteiro (quebra linha, sem reticencias)`);

  const desativarUltimo = async (rotulo) => {
    const botao = dlg.getByRole('button', { name: `Desativar ${ULTIMO}` });
    await rolarAteOFim(botao);
    const b = await botao.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    const noPonto = await pg.evaluate(([px, py]) => document.elementFromPoint(px, py)?.getAttribute('aria-label') || '', [x, y]);
    checar(noPonto === `Desativar ${ULTIMO}`, `${tela}${rotulo}: com a lista no fim, nada cobre o Desativar do ultimo produto (no ponto: "${noPonto}")`);
    // E nenhum outro botao que aparece na tela esta' coberto: o que se ve'
    // e' o que se clica, em qualquer linha (nao so' na ultima).
    const cobertos = await dlg.evaluate((d) => [...d.querySelectorAll('button[aria-label^="Desativar "]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cy = r.top + r.height / 2;
        return cy > 0 && cy < innerHeight && document.elementFromPoint(r.left + r.width / 2, cy) !== el
          // fora da area visivel da lista (rolou para cima) nao conta
          && !(() => { const l = el.closest('[style*="overflow"]').getBoundingClientRect(); return cy < l.top || cy > l.bottom; })();
      }).map((el) => el.getAttribute('aria-label')));
    checar(cobertos.length === 0, `${tela}${rotulo}: nenhum Desativar visivel esta' coberto${cobertos.length ? `: ${cobertos.join(', ')}` : ''}`);
    const antes = esc.length;
    await pg.mouse.click(x, y);
    for (let i = 0; i < 20 && esc.length === antes; i++) await pg.waitForTimeout(100);
    const patch = esc[antes];
    checar(patch?.metodo === 'PATCH' && /id=q14/.test(patch.url) && patch.corpo?.ativo === false
      && await dlg.count() === 1, `${tela}${rotulo}: o clique manda o PATCH de desativar e o cadastro continua aberto`);
  };

  const lista = await caixaDe(dlg.getByRole('button', { name: `Desativar ${ULTIMO}` }).locator('xpath=ancestor::div[contains(@style, "overflow")][1]'));
  const grupos = await caixaDe(dlg.getByRole('navigation', { name: 'Grupos de máquina' }).locator('xpath=..'));
  const rodape = await caixaDe(fechar);
  checar(lista.base <= rodape.topo && grupos.base <= rodape.topo,
    `${tela}: lista (ate' ${Math.round(lista.base)}) e grupos (ate' ${Math.round(grupos.base)}) terminam antes do Fechar (${Math.round(rodape.topo)})`);
  await desativarUltimo('');

  // Com o ALERTA na tela (digitacao errada), o rodape cresce: a lista encolhe.
  await dlg.locator('input[aria-label="Nome do produto"]').first().fill('Rack X');
  await dlg.locator('input[aria-label="Volumes do produto"]').first().fill('2 caixas');
  await dlg.getByRole('button', { name: 'Cadastrar' }).click();
  const alerta = dlg.getByRole('alert');
  await alerta.waitFor({ timeout: 4000 });
  const listaComAlerta = await caixaDe(dlg.getByRole('button', { name: `Desativar ${ULTIMO}` }).locator('xpath=ancestor::div[contains(@style, "overflow")][1]'));
  const caixaAlerta = await caixaDe(alerta);
  checar(listaComAlerta.base <= caixaAlerta.topo,
    `${tela}: com o alerta, a lista termina (${Math.round(listaComAlerta.base)}) antes dele (${Math.round(caixaAlerta.topo)})`);
  if (FOTOS) await pg.screenshot({ path: `${FOTOS}/pc-produtos-${tela}-alerta.png` });
  await desativarUltimo(' com alerta');
  await ctx.close();
}

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
