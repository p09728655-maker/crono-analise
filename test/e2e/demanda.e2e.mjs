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
/* A demanda entra pela MESMA rota do cadastro (?demanda=1): o plano Hobby
   da Vercel aceita 12 funcoes por deploy e o projeto ja' esta' nas 12. O
   mock precisa separar os dois assuntos pela query, como o servidor faz. */
let gravadas = [];
let urlDaGravacao = '';
const enviados = [];
await p.route('**/api/maquinas**', async (rota) => {
  const req = rota.request();
  if (/demanda=1/.test(req.url())) {
    if (req.method() === 'POST') {
      const corpo = JSON.parse(req.postData() || '{}');
      enviados.push(corpo);
      urlDaGravacao = req.url();
      gravadas = corpo.semanas.map((s, i) => ({ id: `d${i}`, grupo_id: 'g2', ...s }));
    }
    if (req.method() === 'DELETE') gravadas = [];
    return rota.fulfill({ json: { demandas: gravadas } });
  }
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
checar(/\/api\/maquinas\?demanda=1/.test(urlDaGravacao),
  'a gravacao vai pela rota dentro de /api/maquinas — o projeto nao pode ganhar uma 13a funcao');
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

/* ==================================================================
   O VEREDITO no relatorio: o programa da semana x o que o grupo entrega.

   Cenario montado para cair no caso que mais importa — o grupo NAO
   atende, mas atenderia sem as paradas. E' a diferenca entre comprar
   maquina e organizar o setup, e o quadro tem de dizer qual dos dois.
   ================================================================== */
const ctx2 = await navegador.newContext({ viewport: { width: 1440, height: 1200 } });
const p2 = await ctx2.newPage();
await semearSessao(p2);
const erros2 = [];
p2.on('pageerror', (e) => erros2.push(e.message));

await p2.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
  ? rota.fulfill({
    json: {
      demandas: [
        { id: 'd1', grupo_id: 'g2', ano: 2026, numero: 36, pecas: 83864 },
        { id: 'd2', grupo_id: 'g2', ano: 2026, numero: 37, pecas: 100637 },
      ],
    },
  })
  : rota.fulfill({
  json: {
    grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA', horas_semana: 44 }],
    maquinas: [
      { id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      { id: 'm2', nome: 'Furadeira 16', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      { id: 'm3', nome: 'Furadeira 21', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
    ],
  },
})));

/* Uma hora de relogio, 700 pecas, 12 min parados: 700 pc/h no relogio e
   875 pc/h com a maquina rodando. 09/09/2026 e' quarta da semana 37. */
await p2.route('**/api/conferencias**', (rota) => rota.fulfill({
  json: {
    conferencias: [{
      id: 'c1', maquina: 'Furadeira 03', peca: 'Princesa Fundo',
      iniciado_em: '2026-09-09T07:00:00-03:00', finalizado_em: '2026-09-09T08:00:00-03:00',
      salvo_em: '2026-09-09T08:00:00-03:00',
      duracao_ms: 3600000, pecas: 700, ciclos_por_peca: 1, arquivada: false,
      paradas: [{ motivo: 'setup', duracao_ms: 720000 }],
    }],
    outras: 0,
  },
}));

await p2.goto(`${BASE}/analise/conferencias`);
const quadro = p2.locator('[aria-label="Programa da semana"]');
await quadro.waitFor({ timeout: 10000 });
/* Espera o quadro SAIR do estado de carga. Sem isto o teste lia o quadro
   no intervalo entre abrir a tela e a demanda chegar — e passava ou falhava
   pela velocidade da maquina, nao pelo que o codigo faz. */
await quadro.getByText(/O programa da semana/).waitFor({ timeout: 10000 });
const q = await quadro.innerText();

checar(/semana 037-26/.test(q),
  'escolhe sozinho a semana da medicao (09/09/2026 e a semana 37), nao a ultima cadastrada');
checar(/100\.637 peças programadas/.test(q), 'mostra a demanda da semana');
checar(/132 horas-máquina/.test(q), '3 maquinas x 44 h = 132 horas-maquina');
// 100.637 / 132 = 762 pc/h por maquina
checar(/762/.test(q), 'o exigido por maquina sai da demanda dividida pelas horas-maquina');
// 700 pecas em 1 h de relogio
checar(/700/.test(q), 'o entregue e o ritmo de RELOGIO, com a parada dentro');
// 700 pecas em 48 min rodando = 875 pc/h
checar(/875 pç\/h com a máquina rodando/.test(q),
  'o ritmo de maquina rodando aparece como referencia, nao como veredito');
checar(/não atende o programa/.test(q), 'o veredito e o que o relogio entrega: 700 < 762');
checar(/Falta 8% de ritmo/.test(q), 'diz quanto falta em cada maquina');
// 100.637 / (44 x 700) = 3,27 maquinas; sem parada, 100.637 / (44 x 875) = 2,61
checar(/3,3/.test(q), 'quantas maquinas o programa pede ao ritmo medido');
checar(/2,6/.test(q), 'e quantas pediria sem as paradas');
checar(/Antes de falar em máquina nova/.test(q),
  'com a folga cabendo nas maquinas que existem, manda tratar a parada — nao comprar maquina');
if (process.env.FOTO2) await quadro.screenshot({ path: process.env.FOTO2 });

/* ---- trocar a semana a mao: o veredito acompanha ---- */
await quadro.locator('select').selectOption('036-26');
await p2.waitForTimeout(300);
const q36 = await quadro.innerText();
checar(/83\.864 peças programadas/.test(q36), 'trocar a semana troca a demanda comparada');
// 83.864 / 132 = 635 pc/h exigidos — 700 medidos passam
checar(/atende o programa/.test(q36) && !/não atende/.test(q36),
  'na semana fraca o mesmo posto ATENDE — e e por isso que o takt nao pode ser fixo');

/* ---- o papel diz o mesmo que a tela ---- */
const papel = await p2.evaluate(() => {
  const folha = document.querySelector('.somente-impressao');
  return { texto: folha?.innerText || '', estoura: folha ? folha.scrollWidth > document.documentElement.clientWidth + 1 : false };
});
checar(/O programa da semana 036-26/.test(papel.texto),
  'a folha impressa traz o programa da semana ESCOLHIDA na tela');
checar(/635 pç\/h/.test(papel.texto) && /700 pç\/h/.test(papel.texto),
  'com os mesmos numeros da tela: exigido e entregue');
checar(/ATENDE o programa/.test(papel.texto), 'e o mesmo veredito');
checar(!papel.estoura, 'o quadro do programa nao empurra a folha para fora do A4');

checar(erros2.length === 0, `sem erro de pagina no veredito (${erros2.join(' | ') || 'nenhum'})`);

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
