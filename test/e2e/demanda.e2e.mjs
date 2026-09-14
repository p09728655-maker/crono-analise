/**
 * DEMANDA SEMANAL — a tela que recebe o programa de producao do PCP.
 *
 * O que este teste prova, com a API mockada: a colagem da planilha REAL
 * (cabecalho, cinco lotes, rodape de totalizadores) vira semanas na
 * previa, o que sobe para o servidor e' o TOTAL SEMANA de cada linha, e o
 * quadro gravado mostra o ritmo exigido por maquina quando o grupo tem
 * horas e maquinas — e nao mostra quando falta alguma das duas.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/demanda.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

/* Tres semanas da planilha do PCP, com o rodape que vem colado junto. */
const COLAGEM = `SEMANA\tLOTE 1\tLOTE 2\tLOTE 3\tLOTE 4\tLOTE 5\tTOTAL SEMANA\tMÉDIA / LOTE
001-26\t25.000\t27.750\t34.900\t28.650\t11.950\t128.250\t25.650
011-26\t11.450\t14.550\t18.600\t13.600\t6.550\t64.750\t12.950
018-26\t20.050\t23.300\t27.626\t37.150\t26.460\t134.586\t26.917

TOTAL ACUMULADO\t3.855.110
MÉDIA SEMANAL\t107.086`;

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
await semearSessao(p);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

/* ------------------------------------------------ cadastro e medicoes */
// Grupo 0002 FURADEIRA com tres maquinas ativas e uma inativa: a inativa
// NAO pode contar no tempo disponivel.
let horasSemana = null;
await p.route('**/api/maquinas**', async (rota) => {
  const req = rota.request();
  if (req.method() === 'PATCH') {
    horasSemana = JSON.parse(req.postData() || '{}').horasSemana;
    return rota.fulfill({ json: { grupo: { id: 'g2', codigo: '0002', nome: 'FURADEIRA', horas_semana: horasSemana } } });
  }
  return rota.fulfill({
    json: {
      grupos: [
        { id: 'g2', codigo: '0002', nome: 'FURADEIRA', horas_semana: horasSemana },
        { id: 'g1', codigo: '0001', nome: 'SECCIONADORA', horas_semana: null },
      ],
      maquinas: [
        { id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm2', nome: 'Furadeira 16', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm3', nome: 'Furadeira 21', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm4', nome: 'Furadeira 07', ativa: false, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      ],
    },
  });
});

await p.route('**/api/conferencias**', (rota) => rota.fulfill({ json: { conferencias: [], outras: 0 } }));

/* A demanda: o servidor guarda o que a tela mandou e devolve a lista. */
let gravadas = [];
const enviados = [];
await p.route('**/api/demanda**', async (rota) => {
  const req = rota.request();
  if (req.method() === 'POST') {
    const corpo = JSON.parse(req.postData() || '{}');
    enviados.push(corpo);
    gravadas = corpo.semanas.map((s, i) => ({ id: `d${i}`, grupo_id: 'g2', ...s }));
  }
  if (req.method() === 'DELETE') gravadas = [];
  return rota.fulfill({ json: { demandas: gravadas } });
});

await p.goto(`${BASE}/analise/conferencias`);

/* ---------------------------------------------- a tela abre pela lateral */
await p.getByRole('button', { name: 'Demanda semanal' }).click();
const janela = p.locator('[aria-label="Demanda semanal"]');
await janela.waitFor({ timeout: 8000 });
checar(true, 'a lateral do relatorio abre a demanda semanal');

const texto = async () => janela.innerText();
checar(/3 máquina\(s\) ativa\(s\)/.test(await texto()),
  'conta so as maquinas ATIVAS do grupo — a inativa nao soma tempo disponivel');
checar(/Sem as horas não há takt/.test(await texto()),
  'sem horas informadas a tela diz que nao ha takt, em vez de assumir 44 h');

/* -------------------------------------------- horas: o tempo disponivel */
await janela.getByPlaceholder('ex.: 44').fill('44');
await janela.getByRole('button', { name: 'Salvar horas' }).click();
await p.waitForTimeout(300);
checar(horasSemana === 44, 'as horas do grupo sobem para o cadastro de maquinas');
checar(/132 horas-máquina/.test(await texto()),
  '3 maquinas x 44 h = 132 horas-maquina na semana');

/* ------------------------------------------- colagem da planilha do PCP */
await janela.locator('textarea').fill(COLAGEM);
await p.waitForTimeout(200);
const previa = await texto();
checar(/3 semana\(s\) reconhecida\(s\): 001-26 a 018-26/.test(previa),
  'a previa diz quantas semanas leu e de qual a qual');
checar(/128\.250/.test(previa) && /64\.750/.test(previa),
  'a previa mostra o TOTAL SEMANA de cada linha');
checar(!/3\.855\.110/.test(previa),
  'o TOTAL ACUMULADO do rodape nao entra como semana');
checar(!/25\.650/.test(previa),
  'a MEDIA POR LOTE nao e confundida com o total da semana');

await janela.getByRole('button', { name: /Gravar 3 semana/ }).click();
await p.waitForTimeout(400);

checar(enviados.length === 1 && enviados[0].semanas.length === 3,
  'sobe uma gravacao so, com as tres semanas');
checar(JSON.stringify(enviados[0].semanas[0]) === JSON.stringify({ ano: 2026, numero: 1, pecas: 128250 }),
  'a semana sobe como ano, numero e pecas — nao como texto');

/* ------------------------------------- o quadro gravado, com o exigido */
const gravado = await texto();
checar(/018-26/.test(gravado) && /134\.586/.test(gravado),
  'o programa gravado aparece na tela');
// 134.586 / (44 h x 3 maquinas) = 1.020 pc/h por maquina; takt 3,5 s
checar(/1\.020 pç\/h/.test(gravado),
  'o ritmo exigido por maquina sai da demanda dividida pelas horas-maquina');
checar(/3\.5s/.test(gravado), 'e o takt por maquina, em segundos por peca');
// 134.586 / 64.750 = 2,08x
checar(/2\.08x|2,08x/.test(gravado),
  'a tela mostra a variacao entre a menor e a maior semana — e o que impede um takt fixo');

checar(await janela.locator('textarea').inputValue() === '',
  'depois de gravar, a caixa de colagem fica limpa para a proxima');

checar(erros.length === 0, `sem erro de pagina (${erros.join(' | ') || 'nenhum'})`);
if (process.env.FOTO) await janela.screenshot({ path: process.env.FOTO });

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
