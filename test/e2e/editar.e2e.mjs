/**
 * Editar um estudo — nome, produto e posto.
 *
 * Um erro de digitacao na criacao ("EMBALGEM 01") ficava para sempre: os
 * ajustes so' cobriam setor, analista, tolerancia, meta e Takt. Recriar o
 * estudo custaria os ciclos ja cronometrados, entao nao havia saida.
 *
 * Roda contra o app REAL com a API simulada: o que este teste prova e' a
 * cadeia inteira — botao na lista, rota com ?editar=1 (que o roteador
 * precisa aceitar), dialogo abrindo ja preenchido e o PATCH certo saindo.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/editar.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ID = 'b17e849c-da3f-4d8c-a262-81e8748c589b';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const lista = {
  estudos: [{
    id: ID, nome: 'EMBALGEM 01', recurso: 'EMBALAGEM', produto: '',
    analista: 'ODERLI GARCIA', setor: '', total_operacoes: 4, total_observacoes: 0,
  }],
};
const estudo = {
  estudo: {
    id: ID, nome: 'EMBALGEM 01', setor: '', recurso: 'EMBALAGEM', produto: null,
    analista: 'ODERLI GARCIA', data_estudo: '2026-08-26', tolerancia_pct: '15',
    meta_obs: 10, takt_time_ms: null, status: 'coletando',
  },
  operacoes: [{
    id: 'op1', estudo_id: ID, nome: 'CAIXA, TAMPO, ISOMANTA', fr_pct: '100',
    ciclos_por_peca: 1, ordem: 0, tempos: [12500, 11800, 13200], observacoes: [], paradas: [],
  }],
};

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
await semearSessao(p);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

const patches = [];
await p.route('**/api/estudos**', (r) => {
  const req = r.request();
  if (req.method() === 'PATCH') {
    patches.push(JSON.parse(req.postData()));
    return r.fulfill({ json: { estudo: estudo.estudo } });
  }
  if (req.url().includes('id=')) return r.fulfill({ json: estudo });
  return r.fulfill({ json: req.url().includes('arquivados=1') ? { estudos: [] } : lista });
});
await p.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));

// A lista mora em /analise/estudos: /analise e' o Inicio.
await p.goto(`${BASE}/analise/estudos`);
await p.getByText('EMBALGEM 01').first().waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Editar', exact: true }).count() === 1,
  'lista oferece Editar na linha do estudo');

await p.getByRole('button', { name: 'Editar', exact: true }).click();
await p.waitForFunction(() => location.search.includes('editar=1'), { timeout: 8000 });
checar(await p.evaluate(() => location.pathname) === `/analise/estudo/${ID}`,
  'a rota com ?editar=1 nao derruba o app para a lista');

const dialogo = p.locator('[aria-label="Ajustes do estudo"]');
await dialogo.waitFor({ timeout: 8000 });
checar(true, 'edicao abre direto, sem procurar botao dentro do painel');

const campoNome = dialogo.locator('label', { hasText: 'Nome do estudo' }).locator('input');
checar(await campoNome.inputValue() === 'EMBALGEM 01', 'nome atual ja vem preenchido');

// Nome vazio nao pode passar: estudo sem nome some da lista.
await campoNome.fill('');
await dialogo.getByRole('button', { name: /Salvar/ }).click();
await p.waitForTimeout(300);
checar(await dialogo.count() === 1 && patches.length === 0,
  'nome vazio e recusado antes de chamar o servidor');

await campoNome.fill('EMBALAGEM 01');
await dialogo.locator('label', { hasText: 'Produto' }).locator('input').fill('Mesa Cabeceira');
await dialogo.locator('label', { hasText: 'Recurso / Posto' }).locator('input').fill('Embalagem — bancada 2');
await dialogo.getByRole('button', { name: /Salvar/ }).click();
await p.waitForFunction(() => true, { timeout: 2000 });
await p.waitForTimeout(600);

checar(patches.length === 1, 'salvar dispara um PATCH');
checar(patches[0]?.nome === 'EMBALAGEM 01', `nome corrigido vai no PATCH (${patches[0]?.nome})`);
checar(patches[0]?.produto === 'Mesa Cabeceira', 'produto corrigido vai no PATCH');
checar(patches[0]?.recurso === 'Embalagem — bancada 2', 'posto corrigido vai no PATCH');
checar(patches[0]?.analista === 'ODERLI GARCIA', 'campos nao tocados sao preservados');

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

/* ----------- o posto puxa a lista de produtos e, a um clique, o takt do programa */
/**
 * Estudo antigo de furadeira, sem takt. O grupo 0002 tem produtos e o
 * programa desta semana: 6.600 pecas para 6 maquinas em 44 h = 144 s por
 * peca por maquina. Aqui o programa NUNCA entra sozinho: o estudo ja' tem
 * um takt (ou nenhum) e so' muda quando o analista pede.
 */
{
  const ID2 = 'c27e849c-da3f-4d8c-a262-81e8748c589c';
  const furadeira = {
    id: ID2, nome: 'Furação lateral', setor: 'Usinagem', recurso: 'FURADEIRA 04', produto: 'lateral sleep',
    analista: 'ODERLI GARCIA', data_estudo: '2026-10-19', tolerancia_pct: '15',
    meta_obs: 12, takt_time_ms: null, status: 'coletando',
  };
  const GRUPO = { id: 'g2', codigo: '0002', nome: 'FURADEIRA', horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5 };
  const EMBALAGEM = { id: 'g5', codigo: '0005', nome: 'EMBALAGEM', horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5 };
  const maquinas = ['FURADEIRA 04', 'FURADEIRA 07', 'FURADEIRA 11', 'FURADEIRA 12', 'FURADEIRA 14', 'FURADEIRA 15']
    .map((nome, i) => ({ id: `m${i + 1}`, nome, ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' }))
    .concat([
      { id: 'm9', nome: 'EMBALADORA 01', ativa: true, grupo_id: 'g5', grupo_codigo: '0005', grupo_nome: 'EMBALAGEM' },
      // Maquina do cadastro SEM grupo: trocar para ela tambem e' trocar de grupo.
      { id: 'm10', nome: 'ESQUADREJADEIRA', ativa: true, grupo_id: null },
    ]);
  const produtos = [
    { id: 'p1', nome: 'LATERAL SLEEP', codigo: '1001', grupo_id: 'g2', ativo: true },
    { id: 'p2', nome: 'FUNDO SLEEP', codigo: '1002', grupo_id: 'g2', ativo: true },
    { id: 'p3', nome: 'RACK SIRIUS 1.6', codigo: '2001', grupo_id: 'g5', ativo: true },
  ];
  // A segunda pelo dia de SAO PAULO, como o app casa a semana: em UTC o
  // teste falhava no domingo a noite.
  const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(new Date()).split('-').map(Number);
  const segunda = new Date(Date.UTC(anoSp, mesSp - 1, diaSp));
  segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
  const demandas = [{ ano: segunda.getUTCFullYear(), numero: 43, pecas: 6600, inicio: segunda.toISOString().slice(0, 10) }];

  const c2 = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const q = await c2.newPage();
  await semearSessao(q);
  const erros2 = [];
  q.on('pageerror', (e) => erros2.push(e.message));
  const patches2 = [];
  await q.route('**/api/estudos**', (r) => {
    const req = r.request();
    if (req.method() === 'PATCH') {
      patches2.push(JSON.parse(req.postData()));
      return r.fulfill({ json: { estudo: furadeira } });
    }
    if (req.url().includes('id=')) return r.fulfill({ json: { estudo: furadeira, operacoes: estudo.operacoes } });
    return r.fulfill({ json: { estudos: [] } });
  });
  await q.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));
  await q.route('**/api/maquinas**', (r) => (/demanda=1/.test(r.request().url())
    ? r.fulfill({ json: { demandas } })
    : r.fulfill({ json: { maquinas, grupos: [GRUPO, EMBALAGEM], produtos } })));

  await q.goto(`${BASE}/analise/estudo/${ID2}?editar=1`);
  const dlg = q.locator('[aria-label="Ajustes do estudo"]');
  await dlg.waitFor({ timeout: 8000 });

  const usar = dlg.getByRole('button', { name: /Usar o takt do programa da semana \d{3}-\d{2}: 144\.0 s por peça/ });
  await usar.waitFor({ timeout: 8000 });
  checar(true, 'ajustes: o takt do programa e oferecido em segundos, como o campo');
  const campoTakt = dlg.locator('label', { hasText: 'Takt Time (segundos por peça)' }).locator('input');
  checar(await campoTakt.inputValue() === '', 'ajustes: o programa nao entra sozinho no estudo');

  /* Produto antigo digitado ("lateral sleep") nao some: aparece como texto,
     com o caminho de volta para a lista do cadastro. */
  const produtoTexto = dlg.locator('label', { hasText: 'Produto / Referência' }).locator('input');
  checar(await produtoTexto.inputValue() === 'lateral sleep', 'ajustes: produto antigo digitado continua a mostra');
  await dlg.getByRole('button', { name: '▾ escolher do cadastro' }).last().click();
  await dlg.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('LATERAL SLEEP');

  await usar.click();
  checar(await campoTakt.inputValue() === '144.0', `ajustes: um clique escreve o takt do programa (${await campoTakt.inputValue()})`);
  await dlg.getByRole('button', { name: /Salvar/ }).click();
  await q.waitForTimeout(600);
  checar(patches2[0]?.taktTimeMs === 144000, `ajustes: PATCH leva o takt do programa (${patches2[0]?.taktTimeMs})`);
  checar(patches2[0]?.produto === 'LATERAL SLEEP', `ajustes: PATCH leva o produto do cadastro (${patches2[0]?.produto})`);
  const abrirEditar = async () => {
    await q.goto(`${BASE}/analise/estudo/${ID2}?editar=1`);
    await dlg.waitFor({ timeout: 8000 });
    await dlg.getByRole('combobox', { name: 'Produto / Referência' }).waitFor({ timeout: 8000 });
  };
  const salvar = async () => {
    const antes = patches2.length;
    await dlg.getByRole('button', { name: /Salvar/ }).click();
    await q.waitForFunction(() => true);
    for (let i = 0; i < 20 && patches2.length === antes; i += 1) await q.waitForTimeout(100);
    return patches2[patches2.length - 1];
  };
  const posto = dlg.getByRole('combobox', { name: 'Recurso / Posto' });
  furadeira.produto = 'LATERAL SLEEP';

  const salvarBloqueado = async () => {
    const antes = patches2.length;
    await dlg.getByRole('button', { name: /Salvar/ }).click();
    await q.waitForTimeout(500);
    return patches2.length === antes && await dlg.count() === 1;
  };

  /* Nada muda sozinho: trocar o posto para outro grupo deixa o produto da
     furadeira a vista, a tela avisa e o Salvar nao grava a combinacao. */
  await abrirEditar();
  await posto.selectOption('EMBALADORA 01');
  await dlg.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/LATERAL SLEEP é produto do 0002 · FURADEIRA, e o posto EMBALADORA 01 é do 0005 · EMBALAGEM/
    .test(await dlg.getByRole('alert').innerText()), 'ajustes: produto de outro grupo — a tela avisa na hora');
  checar(await salvarBloqueado(), 'ajustes: o Salvar nao grava produto da furadeira no posto da embalagem');
  await dlg.getByRole('button', { name: '▾ escolher do cadastro' }).last().click();
  await dlg.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('RACK SIRIUS 1.6');
  let patch = await salvar();
  checar(patch?.recurso === 'EMBALADORA 01' && patch?.produto === 'RACK SIRIUS 1.6',
    `ajustes: com o produto do posto, grava (${patch?.produto})`);

  /* Ida e volta por "Outra máquina…" ou pela seta: o produto nunca sai. */
  await abrirEditar();
  await posto.selectOption('__outra');
  await dlg.locator('input[aria-label="Recurso / Posto"]').pressSequentially('FURADEIRA 04');
  await q.waitForTimeout(300);
  patch = await salvar();
  checar(patch?.produto === 'LATERAL SLEEP', `ajustes: ida e volta pelo texto do posto mantem o produto (${patch?.produto})`);
  await abrirEditar();
  await posto.selectOption('EMBALADORA 01');
  await q.waitForTimeout(200);
  await posto.selectOption('FURADEIRA 04');
  await q.waitForTimeout(200);
  patch = await salvar();
  checar(patch?.produto === 'LATERAL SLEEP', `ajustes: ida e volta por outro grupo mantem o produto (${patch?.produto})`);

  /* O takt que o botao escreveu e' do grupo em que foi clicado: com o
     posto em outro grupo (embalagem, maquina sem grupo, posto digitado), a
     tela avisa e nao grava esse numero. Digitar o takt resolve. */
  const usarPrograma = dlg.getByRole('button', { name: /Usar o takt do programa da semana .*144\.0 s por peça/ });
  for (const [destino, digitado] of [['EMBALADORA 01', false], ['ESQUADREJADEIRA', false], ['SERRA 02', true]]) {
    await abrirEditar();
    await usarPrograma.dblclick();
    if (digitado) {
      await posto.selectOption('__outra');
      await dlg.locator('input[aria-label="Recurso / Posto"]').pressSequentially(destino);
    } else {
      await posto.selectOption(destino);
    }
    await dlg.getByText(/Este takt \(144\.0 s\) veio do programa do 0002 · FURADEIRA/).waitFor({ timeout: 4000 });
    checar(await campoTakt.inputValue() === '144.0', `ajustes (${destino}): nada muda sozinho no campo do takt`);
    checar(await salvarBloqueado(), `ajustes (${destino}): o takt da furadeira nao e gravado`);
  }
  await campoTakt.fill('150');
  checar(await dlg.getByText(/Este takt .* veio do programa/).count() === 0, 'ajustes: digitar o takt desfaz o aviso');
  // O produto da furadeira no SERRA 02 tambem conflita: escolhe outro.
  await dlg.locator('input[aria-label="Produto / Referência"]').fill('Produto da serra');
  patch = await salvar();
  checar(patch?.recurso === 'SERRA 02' && patch?.taktTimeMs === 150000,
    `ajustes: com o takt digitado, grava (${patch?.taktTimeMs})`);

  /* "Outro produto…" escolhido num posto nao vale para o grupo seguinte. */
  await abrirEditar();
  await dlg.getByRole('combobox', { name: 'Produto / Referência' }).selectOption('__outro');
  await dlg.locator('input[aria-label="Produto / Referência"]').waitFor({ timeout: 4000 });
  await posto.selectOption('EMBALADORA 01');
  const listaEmb = dlg.getByRole('combobox', { name: 'Produto / Referência' });
  await listaEmb.waitFor({ timeout: 4000 });
  checar((await listaEmb.locator('option').allInnerTexts()).includes('RACK SIRIUS 1.6 · 2001'),
    'ajustes: o texto livre do posto anterior nao vaza — a embalagem mostra a lista dela');

  checar(erros2.length === 0, `ajustes com programa: sem erro de pagina (${erros2.join('; ') || 'nenhum'})`);
  await c2.close();

  /* Sem rede, com o programa guardado no aparelho: o botao diz que e' o
     guardado — um clique gravaria o numero velho sem saber. */
  const c4 = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const w = await c4.newPage();
  await semearSessao(w);
  await w.addInitScript((d) => localStorage.setItem('ritmopatrimar.demanda.g2', JSON.stringify(d)),
    [{ ...demandas[0], pecas: 3300 }]);
  await w.route('**/api/estudos**', (rt) => (rt.request().url().includes('id=')
    ? rt.fulfill({ json: { estudo: furadeira, operacoes: estudo.operacoes } })
    : rt.fulfill({ json: { estudos: [] } })));
  await w.route('**/api/config**', (rt) => rt.fulfill({ json: { chaveIa: { configurada: false } } }));
  await w.route('**/api/maquinas**', (rt) => (/demanda=1/.test(rt.request().url())
    ? rt.abort()
    : rt.fulfill({ json: { maquinas, grupos: [GRUPO, EMBALAGEM], produtos } })));
  await w.goto(`${BASE}/analise/estudo/${ID2}?editar=1`);
  const d4 = w.locator('[aria-label="Ajustes do estudo"]');
  await d4.getByRole('button', { name: /Usar o takt do programa da semana .*288\.0 s por peça/ }).waitFor({ timeout: 8000 });
  checar(await d4.getByText('Programa guardado neste aparelho: sem rede para conferir se o PCP colou outro.').count() === 1,
    'ajustes sem rede: o botao do programa diz que o numero e o guardado no aparelho');
  await c4.close();

  /* O cadastro do SERVIDOR diferente do guardado no aparelho (a maquina foi
     movida de grupo): o analista so' veio corrigir o nome, e o produto
     gravado nao pode sumir sozinho. */
  const c3 = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const r = await c3.newPage();
  await semearSessao(r);
  const cache = { maquinas, grupos: [GRUPO, EMBALAGEM], produtos };
  await r.addInitScript((c) => localStorage.setItem('ritmopatrimar.maquinas', JSON.stringify(c)), cache);
  const movida = maquinas.map((m) => (m.nome === 'FURADEIRA 04'
    ? { ...m, grupo_id: 'g5', grupo_codigo: '0005', grupo_nome: 'EMBALAGEM' } : m));
  const patches3 = [];
  await r.route('**/api/estudos**', (rt) => {
    const req = rt.request();
    if (req.method() === 'PATCH') { patches3.push(JSON.parse(req.postData())); return rt.fulfill({ json: { estudo: furadeira } }); }
    if (req.url().includes('id=')) return rt.fulfill({ json: { estudo: furadeira, operacoes: estudo.operacoes } });
    return rt.fulfill({ json: { estudos: [] } });
  });
  await r.route('**/api/config**', (rt) => rt.fulfill({ json: { chaveIa: { configurada: false } } }));
  await r.route('**/api/maquinas**', async (rt) => {
    if (/demanda=1/.test(rt.request().url())) return rt.fulfill({ json: { demandas } });
    await new Promise((ok) => setTimeout(ok, 800));
    return rt.fulfill({ json: { maquinas: movida, grupos: [GRUPO, EMBALAGEM], produtos } });
  });
  await r.goto(`${BASE}/analise/estudo/${ID2}?editar=1`);
  const d3 = r.locator('[aria-label="Ajustes do estudo"]');
  await d3.waitFor({ timeout: 8000 });
  await r.waitForTimeout(1500);
  await d3.locator('label', { hasText: 'Nome do estudo' }).locator('input').fill('Furação lateral (corrigido)');
  await d3.getByRole('button', { name: /Salvar/ }).click();
  for (let i = 0; i < 20 && !patches3.length; i += 1) await r.waitForTimeout(100);
  checar(patches3[0]?.produto === 'LATERAL SLEEP',
    `ajustes: cadastro do servidor diferente do aparelho nao apaga o produto gravado (${patches3[0]?.produto})`);
  await c3.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
