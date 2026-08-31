import { chromium } from 'playwright';
import { semearSessao } from '/home/user/crono-analise/test/e2e/_sessao.mjs';
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const nav = await chromium.launch({ executablePath: EXEC });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1200 } });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const dia = (d, h, m = 0) => new Date(2026, 7, d, h, m).toISOString();
const mk = (id, maq, d, h, pecas, paradas = []) => ({
  id, maquina: maq, peca: 'Lateral', iniciado_em: dia(d, h), finalizado_em: dia(d, h, 30),
  duracao_ms: 1800000, pecas, salvo_em: dia(d, h, 30), arquivada: false, paradas,
});
const lista = [
  mk('a1', 'Furadeira 03', 30, 7, 350),
  mk('a2', 'Furadeira 03', 31, 7, 350, [{ motivo: 'setup', duracaoMs: 600000 }]),
  mk('a3', 'Fresadora 01', 31, 13, 250),
  mk('a4', 'Fresadora 01', 30, 13, 260),
];
await p.route('**/api/maquinas**', (r) => r.fulfill({ json: {
  maquinas: [
    { id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
    { id: 'm2', nome: 'Fresadora 01', ativa: true, grupo_id: 'g4', grupo_codigo: '0004', grupo_nome: 'FRESADORA' },
  ],
  grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA' }, { id: 'g4', codigo: '0004', nome: 'FRESADORA' }],
} }));
await p.route('**/api/conferencias**', (r) => r.fulfill({ json: { conferencias: lista } }));
await p.route('**/api/motivos**', (r) => r.fulfill({ json: { motivos: [] } }));
await p.goto(`${BASE}/analise/conferencias`);
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => document.body.innerText));
await nav.close();
