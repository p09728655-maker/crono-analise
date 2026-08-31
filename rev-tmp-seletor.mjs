import { chromium } from 'playwright';
import { semearSessao } from '/home/user/crono-analise/test/e2e/_sessao.mjs';
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ID = 'b17e849c-da3f-4d8c-a262-81e8748c589b';
const lista = { estudos: [{ id: ID, nome: 'EMBALGEM 01', recurso: 'EMBALAGEM', produto: '',
  analista: 'ODERLI GARCIA', setor: '', total_operacoes: 4, total_observacoes: 0 }] };
const estudo = { estudo: { id: ID, nome: 'EMBALGEM 01', setor: '', recurso: 'EMBALAGEM', produto: null,
  analista: 'ODERLI GARCIA', data_estudo: '2026-08-26', tolerancia_pct: '15', meta_obs: 10,
  takt_time_ms: null, status: 'coletando' },
  operacoes: [{ id: 'op1', estudo_id: ID, nome: 'CAIXA', fr_pct: '100', ciclos_por_peca: 1, ordem: 0,
    tempos: [12500], observacoes: [], paradas: [] }] };
const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const patches = [];
await p.route('**/api/maquinas**', (r) => r.fulfill({ json: {
  maquinas: [
    { id: 'm1', nome: 'FURADEIRA 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
    { id: 'm2', nome: 'FRESADORA 01', ativa: true, grupo_id: 'g4', grupo_codigo: '0004', grupo_nome: 'FRESADORA' },
  ], grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA' }, { id: 'g4', codigo: '0004', nome: 'FRESADORA' }],
} }));
await p.route('**/api/estudos**', (r) => {
  const req = r.request();
  if (req.method() === 'PATCH') { patches.push(JSON.parse(req.postData())); return r.fulfill({ json: { estudo: estudo.estudo } }); }
  if (req.url().includes('id=')) return r.fulfill({ json: estudo });
  return r.fulfill({ json: req.url().includes('arquivados=1') ? { estudos: [] } : lista });
});
await p.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));
await p.goto(`${BASE}/analise/estudo/${ID}?editar=1`);
await p.waitForTimeout(2000);
const dlg = p.locator('[role=dialog]').first();
const html = await dlg.evaluate((e) => e.innerHTML).catch(() => '(sem dialogo)');
// O que aparece no campo Recurso / Posto?
const campo = dlg.locator('label', { hasText: 'Recurso / Posto' });
console.log('--- campo Recurso/Posto ---');
console.log(await campo.evaluate((e) => e.outerHTML).catch((x) => 'ERRO ' + x.message));
console.log('inputs:', await campo.locator('input').count(), 'selects:', await campo.locator('select').count());
if (await campo.locator('input').count()) console.log('valor no input:', await campo.locator('input').inputValue());
if (await campo.locator('select').count()) console.log('valor no select:', await campo.locator('select').inputValue());

// AGORA: o usuario clica "escolher do cadastro" e depois se arrepende. O valor antigo volta?
const link = campo.locator('button', { hasText: 'escolher do cadastro' });
console.log('link escolher do cadastro:', await link.count());
if (await link.count()) {
  await link.click();
  await p.waitForTimeout(300);
  console.log('apos clicar: inputs', await campo.locator('input').count(), 'selects', await campo.locator('select').count());
  if (await campo.locator('select').count()) console.log('select value:', JSON.stringify(await campo.locator('select').inputValue()));
}
await b.close();
