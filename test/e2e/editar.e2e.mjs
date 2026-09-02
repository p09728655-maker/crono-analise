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

await b.close();
process.exit(falhas ? 1 : 0);
