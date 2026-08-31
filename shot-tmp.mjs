import { chromium } from 'playwright';
import { semearSessao } from './test/e2e/_sessao.mjs';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await semearSessao(p);
const hoje = new Date();
const em = (h, m, dur, pc, maq, peca, paradas = []) => {
  const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m);
  return { id: `${maq}-${h}${m}`, maquina: maq, peca, iniciado_em: ini.toISOString(),
    finalizado_em: new Date(ini.getTime() + dur).toISOString(), duracao_ms: dur, pecas: pc,
    ciclos_por_peca: 1, salvo_em: ini.toISOString(), arquivada: false, paradas };
};
const lista = [
  em(7, 0, 1800000, 350, 'FURADEIRA 16', 'Sleep base', [{ motivo: 'setup', duracaoMs: 300000 }]),
  em(7, 40, 1800000, 340, 'FURADEIRA 16', 'Sleep base'),
  em(13, 0, 1800000, 250, 'FURADEIRA 16', 'Sleep base'),
  em(9, 0, 1800000, 200, 'FRESADORA 01', 'Tampo'),
];
await p.route('**/api/maquinas**', (r) => r.fulfill({ json: { maquinas: [
  { id: 'm1', nome: 'FURADEIRA 16', ativa: true, grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
  { id: 'm2', nome: 'FRESADORA 01', ativa: true, grupo_codigo: '0004', grupo_nome: 'FRESADORA' },
], grupos: [] } }));
await p.route('**/api/motivos-parada**', (r) => r.fulfill({ json: { motivos: [] } }));
await p.route('**/api/conferencias**', (r) => r.fulfill({ json: { conferencias: lista, outras: 0 } }));
await p.goto('http://localhost:5173/analise/conferencias');
await p.getByText('FURADEIRA 16').first().waitFor({ timeout: 10000 });
await p.waitForTimeout(500);
await p.locator('nav').screenshot({ path: '/tmp/claude-0/-home-user-crono-analise/7dbb3d4f-c7bc-5d02-b552-ae55ee128398/scratchpad/lateral.png' });
await p.locator('[aria-label="Ritmo por hora do dia"]').screenshot({ path: '/tmp/claude-0/-home-user-crono-analise/7dbb3d4f-c7bc-5d02-b552-ae55ee128398/scratchpad/curva.png' });
await p.locator('[aria-label="Resumo do período"]').screenshot({ path: '/tmp/claude-0/-home-user-crono-analise/7dbb3d4f-c7bc-5d02-b552-ae55ee128398/scratchpad/kpis.png' });
console.log('ANALISE:', (await p.locator('[aria-label="Análise do período"]').innerText()).split('\n').filter((l) => /rodou|Ao longo|Às /.test(l)).join(' || '));
await nav.close();
