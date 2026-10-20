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
  const maquinas = ['FURADEIRA 04', 'FURADEIRA 07', 'FURADEIRA 11', 'FURADEIRA 12', 'FURADEIRA 14', 'FURADEIRA 15']
    .map((nome, i) => ({ id: `m${i + 1}`, nome, ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' }));
  const produtos = [
    { id: 'p1', nome: 'LATERAL SLEEP', codigo: '1001', grupo_id: 'g2', ativo: true },
    { id: 'p2', nome: 'FUNDO SLEEP', codigo: '1002', grupo_id: 'g2', ativo: true },
  ];
  const hoje = new Date();
  const segunda = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
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
    : r.fulfill({ json: { maquinas, grupos: [GRUPO], produtos } })));

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
  checar(erros2.length === 0, `ajustes com programa: sem erro de pagina (${erros2.join('; ') || 'nenhum'})`);
  await c2.close();
}

await b.close();
process.exit(falhas ? 1 : 0);
