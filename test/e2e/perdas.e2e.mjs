/**
 * PERDAS DA EMBALAGEM (v2.110.0) — o relatorio de onde a linha deixa de
 * produzir, do botao na Embalagem Takt Time aos numeros.
 *
 * O servidor e' simulado. As medicoes sao as do teste de dominio
 * (test/perdas-embalagem.test.js), com as contas feitas a' mao:
 *  - RACK FLIP 2.2, em duas medicoes (uma com o codigo, outra digitada):
 *    10 intervalos de 20 s com 60 s de parada marcada (40 s "outro", 20 s
 *    "troca de plastico"), e 10 de 20 s mais uma lacuna de 100 s (80 s
 *    alem do normal);
 *  - MESA SLEEP: 10 intervalos de 9 s com 10 s de parada "outro";
 *  - uma medicao do TABLET no mesmo trecho da mesa (menos volumes): conta
 *    uma vez so'.
 * Total: 660 s medidos, 150 s sem produzir (22.7%), periodo 21.3 s por
 * volume (660/31), rodando 16.5 s ((200+220+90)/31). Programa da semana:
 * 9.000 volumes em 44 h -> no ritmo medido 53 h (hora extra), no normal 41 h
 * (sem hora extra): as perdas custam ~12 h.
 *
 * Uso: npm run dev -- --port 5199 e depois node test/e2e/perdas.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;
const FUSO = 'America/Sao_Paulo';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const GRUPO = {
  id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM',
  horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5,
};
const MAQUINA = { id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true, grupo_id: GRUPO.id };
const CADASTRO = { maquinas: [MAQUINA], grupos: [GRUPO], produtos: [] };
const MOTIVOS = [
  { id: 'm1', codigo: 'outro', rotulo: 'Outro', acao: null, ordem: 0, ativo: true, grupos: [] },
  { id: 'm2', codigo: 'troca_plastico', rotulo: 'Troca Plástico', acao: null, ordem: 1, ativo: true, grupos: [] },
];
const hoje = new Date();
const [anoSp, mesSp, diaSp] = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(hoje).split('-').map(Number);
const segunda = new Date(Date.UTC(anoSp, mesSp - 1, diaSp));
segunda.setUTCDate(segunda.getUTCDate() - ((segunda.getUTCDay() + 6) % 7));
const DEMANDAS = [{
  ano: segunda.getUTCFullYear(), numero: 1, pecas: 9000, inicio: segunda.toISOString().slice(0, 10),
  atualizado_em: hoje.toISOString(),
}];

const s = (seg) => seg * 1000;
const marcasDe = (intervalos, inicio = 30) => {
  const m = [s(inicio)];
  for (const i of intervalos) m.push(m[m.length - 1] + s(i));
  return m;
};
const medicao = (over) => ({
  maquina: 'EMBALAGEM 01', pecas: (over.marcas_ms || []).length, duracao_ms: 600000, origem: 'tablet',
  paradas: [], salvo_em: over.iniciado_em, ...over,
});
const MEDICOES = [
  medicao({
    id: 'r1', peca: '501083 · RACK FLIP 2.2', iniciado_em: '2026-11-10T13:00:00Z', finalizado_em: '2026-11-10T13:10:00Z',
    marcas_ms: marcasDe(Array(10).fill(20)), marcas_relogio_ms: s(260),
    paradas: [{ motivo: 'outro', duracaoMs: s(40) }, { motivo: 'troca_plastico', duracaoMs: s(20) }],
  }),
  medicao({
    id: 'r2', peca: 'Rack Flip 2.2', iniciado_em: '2026-11-11T13:00:00Z', finalizado_em: '2026-11-11T13:10:00Z',
    marcas_ms: marcasDe([...Array(10).fill(20), 100]), marcas_relogio_ms: s(300),
  }),
  medicao({
    id: 'm1', peca: 'MESA SLEEP', origem: 'video', iniciado_em: '2026-11-11T17:00:00Z', finalizado_em: '2026-11-11T17:10:00Z',
    marcas_ms: marcasDe(Array(10).fill(9)), marcas_relogio_ms: s(100), paradas: [{ motivo: 'outro', duracaoMs: s(10) }],
  }),
  // O tablet no mesmo trecho do video da mesa: conta uma vez so'.
  medicao({
    id: 't1', peca: 'MESA SLEEP', iniciado_em: '2026-11-11T17:02:00Z', finalizado_em: '2026-11-11T17:06:00Z',
    marcas_ms: marcasDe(Array(5).fill(9)), marcas_relogio_ms: s(45),
  }),
];

const pedidos = [];
async function simularServidor(pagina) {
  await pagina.route('**/api/maquinas**', (rota) => {
    const url = rota.request().url();
    // Os tempos-alvo do painel, no formato de sempre (sem produtos: o relatorio nao usa).
    if (/[?&]alvo=1/.test(url)) {
      return rota.fulfill({
        json: { estado: 'ok', ref: { metaUep: 1265, setupDia: 0, minDia: 527, minProd: 527, sUep: 24.996 }, produtos: [] },
      });
    }
    return /demanda=1/.test(url) ? rota.fulfill({ json: { demandas: DEMANDAS } }) : rota.fulfill({ json: CADASTRO });
  });
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: MOTIVOS } }));
  await pagina.route('**/api/conferencias**', (rota) => {
    const url = new URL(rota.request().url());
    if (url.searchParams.get('marcas') === '1') {
      pedidos.push(url.search);
      return rota.fulfill({ json: { conferencias: MEDICOES, dias: Number(url.searchParams.get('dias')) } });
    }
    return rota.fulfill({ json: { conferencias: [], outras: 0 } });
  });
}

const navegador = await chromium.launch({ executablePath: EXEC });
const erros = [];
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: FUSO });
const p = await ctx.newPage();
await semearSessao(p);
p.on('pageerror', (e) => erros.push(e.message));
await simularServidor(p);

/* ------------------------------ o caminho: Embalagem Takt Time -> Perdas */
await p.goto(`${BASE}/analise/embalagem`);
await p.getByRole('button', { name: 'Perdas da embalagem' }).click({ timeout: 8000 });
await p.waitForURL(/\/analise\/embalagem\/perdas$/, { timeout: 4000 });
checar(true, 'Embalagem Takt Time: o botao "Perdas da embalagem" abre o relatorio');
const resumo = p.getByRole('region', { name: 'Resumo das perdas' });
await resumo.waitFor({ timeout: 8000 });
checar(pedidos.length >= 1 && /grupo=00000000-0000-0000-0000-0000000000e1/.test(pedidos[0]) && /dias=30/.test(pedidos[0]),
  `pede as medicoes do GRUPO da embalagem, com marcas, dos ultimos 30 dias (${pedidos[0]})`);

/* -------------------------------------------------------------- o topo */
const textoResumo = (await resumo.innerText()).replace(/\s+/g, ' ');
checar(/SEM PRODUZIR 22\.7%/i.test(textoResumo), `sem produzir: 150 s de 660 s = 22.7% (${textoResumo.slice(0, 160)})`);
checar(/POR VOLUME NO PERÍODO 21\.3 s/i.test(textoResumo) && /POR VOLUME RODANDO 16\.5 s/i.test(textoResumo),
  'por volume: 21.3 s no periodo (660/31) e 16.5 s rodando ((200+220+90)/31)');
checar(/PARADAS NÃO MARCADAS 1 min[\s\S]*1 lacuna entre/i.test(textoResumo), 'paradas nao marcadas: a lacuna de 80 s (no singular)');
const base = await p.getByLabel('Base do relatório').innerText();
checar(/3 medições/.test(base) && /contada\(s\) uma vez só/.test(base),
  `o tablet no mesmo trecho do video conta uma vez so (${base})`);

/* ----------------------------------------------------------- hora extra */
const hora = p.getByRole('region', { name: 'Hora extra da semana' });
const textoHora = (await hora.innerText()).replace(/\s+/g, ' ');
checar(/9\.000 volumes/.test(textoHora) && /44 h/.test(textoHora), `hora extra: o programa (9.000) e as 44 h da linha (${textoHora.slice(0, 200)})`);
checar(/Hora extra estimada 9 h/.test(textoHora) && /Hora extra sem as perdas nenhuma/.test(textoHora),
  'no ritmo medido falta ~9 h (53 h para 44 h); no normal nao falta: a hora extra vem das perdas');
checar(/O que as perdas custam 12 h/.test(textoHora), 'o que as perdas custam: ~12 h (53 h - 41 h)');

/* ---------------------------------------------------------- os motivos */
const motivos = p.getByRole('region', { name: 'Paradas por motivo' });
const textoMotivos = (await motivos.innerText()).replace(/\s+/g, ' ');
checar(/71\.4% do tempo parado está em “Outro”/.test(textoMotivos),
  `o "Outro" apontado: 50 s de 70 s sem motivo (${textoMotivos.slice(0, 200)})`);
checar(textoMotivos.indexOf('Outro') < textoMotivos.indexOf('Troca Plástico') && /2×/.test(textoMotivos),
  'os motivos, o maior primeiro, com quantas vezes');

/* ---------------------------------------------------------- os produtos */
const tabela = p.getByRole('region', { name: 'Perdas por produto' });
const linhas = await tabela.locator('tbody tr').allInnerTexts();
checar(linhas.length === 2 && /^RACK FLIP 2\.2/.test(linhas[0]) && /^MESA SLEEP/.test(linhas[1]),
  `o rack com e sem codigo vira um produto so, e vem primeiro (mais tempo parado): ${linhas.map((l) => l.split('\t')[0]).join(' | ')}`);
checar(/\t2\t/.test(linhas[0]) && /7\s*$/.test(linhas[0]), `rack: 2 medicoes, 140 s parado = 7 volumes no normal de 20 s (${linhas[0].replace(/\t/g, ' | ')})`);
if (FOTOS) await p.screenshot({ path: `${FOTOS}/perdas.png`, fullPage: true });

/* --------------------------------------------------------- o periodo */
await p.locator('select').first().selectOption('7');
await p.waitForFunction(() => document.querySelector('[aria-label="Base do relatório"]')?.innerText.includes('últimos 7 dias'), null, { timeout: 4000 })
  .then(() => checar(/dias=7/.test(pedidos[pedidos.length - 1]), 'trocar o periodo pede de novo, com os 7 dias'))
  .catch(() => checar(false, 'trocar o periodo pede de novo, com os 7 dias'));

/* ------------------------------------------------ o menu lateral (Inicio) */
await p.goto(`${BASE}/analise`);
await p.getByRole('button', { name: 'Perdas da embalagem' }).first().click({ timeout: 8000 });
await p.waitForURL(/\/analise\/embalagem\/perdas$/, { timeout: 4000 })
  .then(() => checar(true, 'o Inicio tambem leva ao relatorio, pelo menu da Embalagem'))
  .catch(() => checar(false, 'o Inicio tambem leva ao relatorio, pelo menu da Embalagem'));

checar(!erros.length, `sem erro no console da pagina${erros.length ? `: ${erros.join(' | ')}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
