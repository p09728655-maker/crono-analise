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

/* Tres semanas da planilha do PCP, com o rodape que vem colado junto e a
   coluna INICIO — e' ela que casa a medicao com a linha certa: a semana
   da fabrica desloca por feriado e o rotulo S corre a frente do ISO. */
const COLAGEM = `Nº PLANILHA\tSEMANA\tINÍCIO\tLOTE 1\tLOTE 2\tLOTE 3\tLOTE 4\tLOTE 5\tTOTAL SEMANA\tMÉDIA / LOTE
001-26\tS01\t05/01/2026\t25.000\t27.750\t34.900\t28.650\t11.950\t128.250\t25.650
010-26\tS11\t13/03/2026\t11.450\t14.550\t18.600\t13.600\t6.550\t64.750\t12.950
017-26\tS18\t07/05/2026\t20.050\t23.300\t27.626\t37.150\t26.460\t134.586\t26.917

TOTAL ACUMULADO\t3.855.110
MÉDIA SEMANAL\t107.086`;

/* A MESMA planilha sem a coluna de data: o caminho antigo, que ainda
   funciona e precisa avisar que vai casar pelo numero da semana. */
const COLAGEM_SEM_DATA = `SEMANA\tTOTAL SEMANA
S01\t128.250
S11\t64.750`;

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
// O que o PATCH de grupo recebeu por ultimo, e o grupo como o servidor o
// devolveria depois: e' assim que a tela repinta a conta do tempo.
let ultimoPatch = null;
let grupoFuradeira = {
  id: 'g2', codigo: '0002', nome: 'FURADEIRA',
  horas_semana: null, dias_semana: null, setups_dia: null, setup_min: null,
};
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
      // MESCLA, como o servidor (ON CONFLICT por ano+numero): a semana
      // digitada depois da colagem nao pode apagar as coladas — e o mock
      // que substituisse a lista provaria o oposto do que a API faz.
      const porChave = new Map(gravadas.map((g) => [`${g.ano}-${g.numero}`, g]));
      corpo.semanas.forEach((s, i) => {
        const chave = `${s.ano}-${s.numero}`;
        porChave.set(chave, { id: porChave.get(chave)?.id || `d${gravadas.length + i}`, grupo_id: 'g2', ...s });
      });
      gravadas = [...porChave.values()].sort((a, b) => (a.ano - b.ano) || (a.numero - b.numero));
    }
    if (req.method() === 'DELETE') gravadas = [];
    return rota.fulfill({ json: { demandas: gravadas } });
  }
  if (req.method() === 'PATCH') {
    ultimoPatch = JSON.parse(req.postData() || '{}');
    horasSemana = ultimoPatch.horasSemana;
    // Campo PRESENTE no corpo vale, inclusive null — e' assim que se apaga.
    // Com `??` o mock manteria o valor antigo onde a API grava NULL.
    const campo = (chave, atual) => (chave in ultimoPatch ? ultimoPatch[chave] : atual);
    grupoFuradeira = {
      ...grupoFuradeira,
      horas_semana: campo('horasSemana', grupoFuradeira.horas_semana),
      dias_semana: campo('diasSemana', grupoFuradeira.dias_semana),
      setups_dia: campo('setupsDia', grupoFuradeira.setups_dia),
      setup_min: campo('setupMin', grupoFuradeira.setup_min),
    };
    return rota.fulfill({ json: { grupo: grupoFuradeira } });
  }
  return rota.fulfill({
    json: {
      grupos: [
        grupoFuradeira,
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
await p.waitForTimeout(150);
checar(/Setup não informado/.test(await texto()),
  'com a jornada e sem o setup, a tela diz que o veredito sairia otimista');
// A conta aparece ANTES de salvar, com o que foi digitado.
checar(/132/.test(await texto()) && /3 máq\. × 44 h/.test(await texto()),
  'a conta da jornada aparece na tela a cada tecla: 3 maq x 44 h = 132');

/* O setup: 5 trocas por dia, 5 dias, 20 min — 8,3 h por maquina. E' o
   tempo que a medicao nao pega, e a tela precisa mostrar o que ele come. */
await janela.getByPlaceholder('ex.: 5').first().fill('5');    // dias de producao
await janela.getByPlaceholder('ex.: 5').nth(1).fill('5');     // setups por dia
await janela.getByPlaceholder('ex.: 20').fill('20');
await p.waitForTimeout(150);
const conta = await texto();
checar(/8,3\u00a0h\/máq/.test(conta), '5/dia x 5 dias x 20 min = 8,3 h de setup por maquina');
// 3 x 44 = 132; setup por maquina 8,3 x 3 = 24,9; produtivas 132 − 24,9 = 107,1 (derivados)
checar(/− 24,9/.test(conta) && /107,1/.test(conta),
  'a conta mostra jornada 132, setup −24,9 e 107,1 produtivas — derivados, e fecham');
checar(!/Setup não informado/.test(conta), 'informado o setup, a ressalva some');

await janela.getByRole('button', { name: 'Salvar tempo disponível' }).click();
await p.waitForTimeout(300);
checar(horasSemana === 44, 'as horas do grupo sobem para o cadastro de maquinas');
checar(ultimoPatch && ultimoPatch.setupsDia === 5 && ultimoPatch.setupMin === 20 && ultimoPatch.diasSemana === 5,
  'setups por dia, minutos e dias sobem no MESMO PATCH — e uma decisao, nao quatro');

/**
 * SALVO, O MAIOR QUADRO DA JANELA RECOLHE.
 *
 * Jornada e setup se cadastram uma vez por grupo e ficam meses iguais,
 * mas o quadro ocupava 463px dos 1625 da janela — 28% da rolagem para
 * quem veio colar a planilha da semana. Recolher nao pode virar esconder:
 * a conta continua legivel em uma linha.
 */
await p.waitForTimeout(200);
checar(await janela.getByPlaceholder('ex.: 44').count() === 0,
  'salvo o tempo disponivel, o quadro recolhe sozinho');
const recolhido = await texto();
checar(/107,1 horas-máquina produtivas/.test(recolhido) && /3 máq\. × 44 h/.test(recolhido),
  'recolhido, ele ainda diz a conta inteira: 107,1 produtivas de 3 maq x 44 h');
checar(!/Setup não informado/.test(recolhido),
  'com o setup informado, a ressalva segue fora — recolhido ou nao');
await janela.getByRole('button', { name: 'Editar' }).click();
checar(await janela.getByPlaceholder('ex.: 44').count() === 1,
  '"Editar" abre o quadro de volta, com os campos');
await janela.getByRole('button', { name: 'Recolher' }).click();

/* ------------------------------------------- colagem da planilha do PCP */
await janela.locator('textarea').fill(COLAGEM_SEM_DATA);
await p.waitForTimeout(200);
checar(/Nenhuma coluna chamada INÍCIO/.test(await texto()),
  'colagem sem a coluna de data avisa que o casamento vai cair no numero da semana');

await janela.locator('textarea').fill(COLAGEM);
await p.waitForTimeout(200);
const previa = await texto();
checar(/3 semana\(s\) reconhecida\(s\): 001-26 a 018-26/.test(previa),
  'a previa diz quantas semanas leu e de qual a qual');
checar(/05\/01/.test(previa) && /07\/05/.test(previa),
  'a previa mostra a DATA de cada semana — e onde se percebe a coluna INICIO errada');
checar(!/coluna chamada INÍCIO/.test(previa),
  'com a data no lugar, o aviso some');
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
checar(JSON.stringify(enviados[0].semanas[0])
  === JSON.stringify({ ano: 2026, numero: 1, pecas: 128250, inicio: '2026-01-05' }),
  'a semana sobe como ano, numero, pecas e a data de inicio — nao como texto');

/* ------------------------------------------- uma semana digitada a mao */
/**
 * O quadro nasce RECOLHIDO: a demanda entra por colagem, e digitar uma
 * semana e' o caminho da reprogramada. Aberto, ele ocupava 190px acima da
 * caixa de colagem — empurrando o caminho principal para fora da tela.
 */
checar(await janela.getByLabel('Semana', { exact: true }).count() === 0,
  'o quadro de digitar semana comeca recolhido — colar e o caminho principal');
await janela.getByRole('button', { name: 'Digitar uma semana à mão' }).click();

// O RASCUNHO SOBREVIVE AO RECOLHER: o estado mora no quadro e ele nao
// desmonta. Recolher que apagasse o que foi digitado seria perder
// trabalho por causa de um clique de arrumacao.
await janela.getByLabel('Semana', { exact: true }).fill('S39');
await janela.getByRole('button', { name: 'Recolher' }).click();
checar(await janela.getByLabel('Semana', { exact: true }).count() === 0, 'recolhe de novo');
await janela.getByRole('button', { name: 'Voltar ao que eu digitava' }).click();
checar(await janela.getByLabel('Semana', { exact: true }).inputValue() === 'S39',
  'e o que estava digitado continua la depois de recolher e abrir');

await janela.getByLabel('Semana', { exact: true }).fill('S40');
await janela.getByLabel('Início', { exact: true }).fill('22/09/2026');
await janela.getByLabel('Peças', { exact: true }).fill('90.500');
await p.waitForTimeout(150);
checar(/040-26 · 22\/09 a 28\/09\/2026 · 90\.500 peças/.test(await texto()),
  'a semana digitada mostra chave, periodo e pecas antes de gravar');
await janela.getByRole('button', { name: 'Incluir semana' }).click();
await p.waitForTimeout(300);
checar(enviados.length === 2 && JSON.stringify(enviados[1].semanas)
  === JSON.stringify([{ ano: 2026, numero: 40, pecas: 90500, inicio: '2026-09-22' }]),
  'a semana manual sobe pela mesma rota, com data — sem data nao ha botao');
checar(/040-26/.test(await texto()) && /22\/09 a 28\/09/.test(await texto()),
  'e aparece na tabela gravada com o periodo');

/* ------------------------------------- o quadro gravado, com o exigido */
const gravado = await texto();
checar(/018-26/.test(gravado) && /134\.586/.test(gravado),
  'o programa gravado aparece na tela');
checar(/07\/05 a 13\/05/.test(gravado),
  'cada semana gravada mostra o PERIODO que cobre — o unico jeito de conferir contra a planilha');
// 134.586 / (35,67 h produtivas x 3 maquinas) = 1.258 pc/h por maquina; takt 2,9 s.
// Sem o setup seriam 1.020 — a diferenca e' exatamente o que a troca de peca come.
checar(/1\.258 pç\/h/.test(gravado),
  'o ritmo exigido por maquina sai da demanda dividida pelas horas PRODUTIVAS');
checar(/2\.9s/.test(gravado), 'e o takt por maquina, em segundos por peca');
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
checar(/cadastrada sem data de início/.test(q),
  'programa sem data casa pelo NUMERO da semana — e o quadro diz que foi assim');
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
checar(/Semana cadastrada sem data de início/.test(papel.texto),
  'a folha impressa leva a ressalva de casamento por numero — nao so a tela');
checar(!papel.estoura, 'o quadro do programa nao empurra a folha para fora do A4');

checar(erros2.length === 0, `sem erro de pagina no veredito (${erros2.join(' | ') || 'nenhum'})`);

/* ==================================================================
   3) O PROGRAMA COM DATA: a medicao cai na linha cujo PERIODO a contem.

   E' o erro que este teste tranca. Na planilha real a linha rotulada
   "S37" e' a 034-26, que rodou de 31/08 a 04/09 — a semana ISO 37
   comeca em 07/09. Uma medicao de 09/09 casada por NUMERO pegava o
   programa da semana anterior; casada por DATA pega a 035-26 (S38), que
   comecou na terca 08/09 porque 07/09 foi feriado.
   ================================================================== */
const ctx3 = await navegador.newContext({ viewport: { width: 1440, height: 1200 } });
const p3 = await ctx3.newPage();
await semearSessao(p3);
const erros3 = [];
p3.on('pageerror', (e) => erros3.push(e.message));

await p3.route('**/api/maquinas**', (rota) => (/demanda=1/.test(rota.request().url())
  ? rota.fulfill({
    json: {
      demandas: [
        { id: 'd1', grupo_id: 'g2', ano: 2026, numero: 37, pecas: 93200, inicio: '2026-08-31' },
        { id: 'd2', grupo_id: 'g2', ano: 2026, numero: 38, pecas: 121900, inicio: '2026-09-08' },
      ],
    },
  })
  : rota.fulfill({
    json: {
      // Setup PLANEJADO cadastrado: 5/dia x 5 dias x 20 min = 8,3 h por maquina.
      grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA', horas_semana: 44, dias_semana: 5, setups_dia: 5, setup_min: 20 }],
      maquinas: [
        { id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm2', nome: 'Furadeira 16', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm3', nome: 'Furadeira 21', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      ],
    },
  })));

/* 1 h, 700 pecas, 12 min de TROCA/SETUP marcados — e nenhuma outra parada.
   Com o setup planejado, esses 12 min saem do relogio (700 pc em 48 min =
   875 pc/h) e a tela nao pode dizer "sem parada marcada" nem mostrar
   875 como contraste de 875. */
await p3.route('**/api/conferencias**', (rota) => rota.fulfill({
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

await p3.goto(`${BASE}/analise/conferencias`);
const quadro3 = p3.locator('[aria-label="Programa da semana"]');
await quadro3.waitFor({ timeout: 10000 });
await quadro3.getByText(/O programa da semana/).waitFor({ timeout: 10000 });
const q3 = await quadro3.innerText();

checar(/121\.900 peças programadas/.test(q3),
  'a medicao de 09/09 pega o programa que COMECOU em 08/09, nao o rotulado com a semana 37');
checar(/período de 08\/09 a 14\/09\/2026/.test(q3),
  'o quadro mostra o PERIODO da planilha — e' + "' o que da para conferir contra o Excel");
checar(!/cadastrada sem data de início/.test(q3),
  'com data no programa, nao ha ressalva de casamento por numero');
// 3 x 44 = 132 h; setup 8,3 x 3 = 24,9 h; produtivas 107,1 h — os TRES exibidos, a conta fecha.
checar(/107,1 horas-máquina produtivas/.test(q3) && /132 h de jornada − 24,9 h de setup/.test(q3),
  'a conta das horas na tela fecha: 132 − 24,9 = 107,1');
checar(/a única parada marcada foi troca\/setup, já contada no setup planejado/.test(q3),
  'so setup marcado: a tela nao diz "sem parada marcada" nem contrasta 875 com 875');
checar(/As medições marcaram 12 min de troca\/setup/.test(q3),
  'e a nota diz quanto setup medido saiu do relogio');
const papel3 = await p3.evaluate(() => document.querySelector('.somente-impressao')?.innerText || '');
checar(/exceto 12 min de troca\/setup marcados nas medições/.test(papel3),
  'o papel leva a mesma nota do relogio recalculado');
checar(/só troca\/setup marcado, já no planejado/.test(papel3) && !/875 pç\/h com a máquina rodando/.test(papel3),
  'e o cartao do papel nao apresenta 875 como contraste de 875');
const opcoes = await quadro3.locator('select option').allInnerTexts();
checar(opcoes.some((o) => /038-26 · 08\/09 a 14\/09/.test(o)),
  'o seletor de semana diz de que dias fala cada opcao');

/**
 * A VOLTA PARA O AUTOMATICO — a ida e a volta, na mesma tela.
 *
 * Escolher uma semana na mao gravava a escolha ate' trocar de grupo: quem
 * conferiu a semana passada ficava presa nela, e o relatorio seguia
 * comparando a medicao de hoje com o programa de outra semana, sem nada
 * dizendo que a escolha era manual. O dominio ja' separava os dois casos
 * (`escolhaAutomatica`); faltava a tela oferecer o caminho de volta.
 */
checar(opcoes.some((o) => /Automática · pela data da medição/.test(o)),
  'o seletor traz a opcao em branco: a volta para a escolha automatica');
checar(await quadro3.locator('select').inputValue() === '',
  'sem escolha manual o seletor mostra a automatica — diz de ONDE veio a semana');

await quadro3.locator('select').selectOption('037-26');
await p3.waitForTimeout(300);
checar(/93\.200 peças programadas/.test(await quadro3.innerText()),
  'escolhida na mao, o quadro passa a comparar com a semana escolhida');

await quadro3.locator('select').selectOption('');
await p3.waitForTimeout(300);
const devolvido = await quadro3.innerText();
checar(/121\.900 peças programadas/.test(devolvido),
  'em branco devolve o quadro a semana da MEDICAO — 09/09 volta para a 038-26');
checar(await quadro3.locator('select').inputValue() === '',
  'e o seletor volta a mostrar automatica: a escolha manual deixou de existir');

/**
 * TIRAR O PROGRAMA DA FOLHA SEM APAGAR O PROGRAMA.
 *
 * Medindo a maquina, a folha e' da MEDICAO: o veredito sai de uma amostra
 * que ainda esta' assentando, e "o grupo nao atende" impresso ao lado de
 * meia medicao e' uma afirmacao que ninguem quis fazer. Ate' aqui a unica
 * saida era APAGAR a programacao do grupo para imprimir e recolar a
 * planilha depois — destruir cadastro para resolver impressao.
 */
const papelCom = await p3.evaluate(() => document.querySelector('.somente-impressao')?.innerText || '');
checar(/O programa da semana/.test(papelCom),
  'por padrao o programa sai na folha, como sempre saiu');

await quadro3.getByRole('checkbox', { name: 'Sair na impressão' }).uncheck();
await p3.waitForTimeout(300);
const papelSem = await p3.evaluate(() => document.querySelector('.somente-impressao')?.innerText || '');
checar(!/O programa da semana/.test(papelSem),
  'desmarcada, a folha sai sem o quadro do programa');
checar(/pç\/h/.test(papelSem),
  'e a folha continua trazendo os numeros da medicao — so o programa saiu');
// O PROGRAMA CONTINUA NO BANCO: e' o ponto inteiro desta opcao.
const telaSem = await quadro3.innerText();
checar(/121\.900 peças programadas/.test(telaSem),
  'na TELA o programa continua inteiro — tirar do papel nao apaga a programacao');
checar(/não sai na folha impressa/.test(telaSem),
  'e o quadro avisa que esta fora do papel — folha sem veredito nao pode surpreender');
checar(await p3.evaluate(() => localStorage.getItem('ritmo.programa-na-impressao')) === '0',
  'a escolha fica gravada no navegador');

await quadro3.getByRole('checkbox', { name: 'Sair na impressão' }).check();
await p3.waitForTimeout(300);
checar(/O programa da semana/.test(await p3.evaluate(() => document.querySelector('.somente-impressao')?.innerText || '')),
  'marcada de novo, o programa volta para a folha');

/* ---- o dia descoberto tem saida na mesma tela ---- */
// 07/09 e' feriado e fica fora da janela de sete dias da semana que
// comecou em 31/08 — de proposito. O preco so' e' justo se der para
// escolher a semana ali mesmo, sem sair do relatorio.
await p3.route('**/api/conferencias**', (rota) => rota.fulfill({
  json: {
    conferencias: [{
      id: 'c2', maquina: 'Furadeira 03', peca: 'Princesa Fundo',
      iniciado_em: '2026-09-07T07:00:00-03:00', finalizado_em: '2026-09-07T08:00:00-03:00',
      salvo_em: '2026-09-07T08:00:00-03:00',
      duracao_ms: 3600000, pecas: 700, ciclos_por_peca: 1, arquivada: false, paradas: [],
    }],
    outras: 0,
  },
}));
await p3.reload();
await quadro3.waitFor({ timeout: 10000 });
await quadro3.getByText(/Sem programa para o período/).waitFor({ timeout: 10000 });
const descoberto = await quadro3.innerText();
checar(/Sem programa para o período desta medição/.test(descoberto),
  'o dia fora de toda janela diz que falta programa, em vez de usar a semana anterior');
checar(await quadro3.locator('select').count() === 1,
  'e oferece o seletor de semana ali mesmo — a saida que o texto promete');
await quadro3.locator('select').selectOption('037-26');
await p3.waitForTimeout(300);
checar(/93\.200 peças programadas/.test(await quadro3.innerText()),
  'escolhendo a semana na mao, o veredito sai sem sair do relatorio');
checar(erros3.length === 0, `sem erro de pagina no casamento por data (${erros3.join(' | ') || 'nenhum'})`);

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
