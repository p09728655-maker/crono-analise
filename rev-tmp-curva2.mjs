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
// UMA maquina, tres medicoes: 7h (dia 30 e 31) e 13h (dia 31).
// SEM nome de peca de proposito: e' o caso que testa a folha impressa.
const lista = [
  { id: 'a1', maquina: 'Furadeira 03', peca: 'Lateral', iniciado_em: dia(30, 7), finalizado_em: dia(30, 7, 30),
    duracao_ms: 1800000, pecas: 350, salvo_em: dia(30, 7, 30), arquivada: false, paradas: [] },
  { id: 'a2', maquina: 'Furadeira 03', peca: 'Lateral', iniciado_em: dia(31, 7), finalizado_em: dia(31, 7, 30),
    duracao_ms: 1800000, pecas: 350, salvo_em: dia(31, 7, 30), arquivada: false, paradas: [] },
  { id: 'a3', maquina: 'Furadeira 03', peca: 'Lateral', iniciado_em: dia(31, 13), finalizado_em: dia(31, 13, 30),
    duracao_ms: 1800000, pecas: 250, salvo_em: dia(31, 13, 30), arquivada: false,
    paradas: [{ motivo: 'setup', duracaoMs: 600000 }] },
];

await p.route('**/api/maquinas**', (r) => r.fulfill({ json: {
  maquinas: [{ id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' }],
  grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA' }],
} }));
await p.route('**/api/conferencias**', (r) => r.fulfill({ json: { conferencias: lista } }));
await p.route('**/api/motivos**', (r) => r.fulfill({ json: { motivos: [] } }));

await p.goto(`${BASE}/analise/conferencias`);
await p.waitForTimeout(2500);

const corpo = await p.evaluate(() => document.body.innerText);
console.log('--------- TELA ---------');
console.log(corpo.slice(0, 4000));
const folha = await p.evaluate(() => document.querySelector('.somente-impressao')?.innerText || '(sem folha)');
console.log('--------- FOLHA ---------');
console.log(folha);
await nav.close();
