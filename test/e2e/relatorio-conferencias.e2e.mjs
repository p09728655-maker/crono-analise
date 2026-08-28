/**
 * Relatorio de conferencias — o estudo por maquina, no PC.
 *
 * Com a API fora do ar (como nos demais e2e), o que da' para provar e' a
 * fiacao: a rota abre no PC, o cabecalho certo aparece, o erro de carga e'
 * honesto e oferece "Tentar de novo" — e o botao "Conferências" da lista
 * leva ate' aqui. O conteudo com dados reais e' coberto pelos testes de
 * integracao da API e pelo dominio (resumirConferencias).
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/relatorio-conferencias.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await semearSessao(p);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto(`${BASE}/analise/conferencias`);
await p.getByText('Furadeiras').first().waitFor({ timeout: 8000 });
checar(true, 'PC: /analise/conferencias abre o relatorio');
// O subtitulo precisa dizer PARA QUE serve: era a duvida do usuario —
// onde fica a parte das furadeiras e onde fica a da embalagem.
checar(await p.getByText(/Ritmo por máquina/).count() > 0,
  'subtitulo diz o que a tela mede — e o titulo, de qual posto');

await p.getByText('Não foi possível carregar').waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Tentar de novo' }).count() === 1,
  'API fora: erro honesto com "Tentar de novo"');

// Voltar leva para a lista de analise.
await p.getByRole('button', { name: /Voltar para a lista/ }).click();
await p.waitForFunction(() => location.pathname === '/analise', { timeout: 8000 });
checar(true, 'voltar leva para /analise');

// No celular, /analise/conferencias nao existe: cai na coleta.
const movel = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const pm = await movel.newPage();
await semearSessao(pm);
await pm.goto(`${BASE}/analise/conferencias`);
await pm.waitForFunction(() => location.pathname === '/coleta', { timeout: 8000 });
checar(true, 'celular: relatorio redireciona para a coleta');
await movel.close();

/* ------------------------- arquivar e excluir, com a falha VISIVEL */
/**
 * O excluir parecia quebrado: a chamada saia, o servidor recusava e a tela
 * nao dizia nada — o erro era gravado no estado e nunca renderizado. Este
 * teste cobre os dois lados: a recusa aparece, e o sucesso remove a linha.
 */
{
  const ctx2 = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx2.newPage();
  await semearSessao(p2);
  const hoje = new Date().toISOString();
  // c1 vem no formato de hoje (instantes). c2 vem no formato ANTIGO, so' com
  // o texto: e' o que um servidor revertido devolveria, e a tela precisa
  // continuar mostrando o periodo em vez de um travessao.
  const inicio = new Date(Date.now() - 180000).toISOString();
  let lista = [
    { id: 'c1', maquina: 'Furadeira14', peca: 'Sleep lateral',
      iniciado_em: inicio, finalizado_em: hoje,
      duracao_ms: 180000, pecas: 20, salvo_em: hoje, arquivada: false, paradas: [] },
    { id: 'c2', maquina: 'Furadeira 03', peca: 'Lateral Mesa', hora_inicial: '07:00', hora_final: '07:30',
      duracao_ms: 1800000, pecas: 420, salvo_em: hoje, arquivada: false, paradas: [] },
    // Segunda medicao da MESMA maquina: e' ela que faz o filtro da lateral
    // abrir o grafico por conferencia, com a peca embaixo de cada barra.
    { id: 'c3', maquina: 'Furadeira 03', peca: 'Princesa Fundo', hora_inicial: '07:30', hora_final: '07:50',
      duracao_ms: 1200000, pecas: 300, salvo_em: hoje, arquivada: false, paradas: [] },
  ];
  let recusar = true;
  const chamadas = [];
  const patches = [];

  // Cadastro de maquinas: liga o nome gravado ao GRUPO (0002 · FURADEIRA).
  await p2.route('**/api/maquinas**', (rota) => rota.fulfill({
    json: {
      maquinas: [
        { id: 'm1', nome: 'Furadeira 03', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
        { id: 'm2', nome: 'Furadeira14', ativa: true, grupo_id: 'g2', grupo_codigo: '0002', grupo_nome: 'FURADEIRA' },
      ],
      grupos: [{ id: 'g2', codigo: '0002', nome: 'FURADEIRA' }],
    },
  }));

  await p2.route('**/api/conferencias**', (rota) => {
    const req = rota.request();
    chamadas.push(req.method());
    if (req.method() === 'DELETE') {
      if (recusar) {
        return rota.fulfill({ status: 500, contentType: 'application/json',
          body: JSON.stringify({ erro: 'Conferencia nao encontrada' }) });
      }
      lista = lista.filter((c) => !req.url().includes(c.id));
      return rota.fulfill({ json: { acao: 'excluida' } });
    }
    if (req.method() === 'PATCH') {
      const corpoPatch = JSON.parse(req.postData() || '{}');
      patches.push(corpoPatch);
      lista = lista.map((c) => (req.url().includes(c.id)
        ? { ...c, ...('arquivada' in corpoPatch ? { arquivada: true } : {}), ...('paradas' in corpoPatch ? { paradas: corpoPatch.paradas } : {}) }
        : c));
      return rota.fulfill({ json: { conferencia: { id: 'c1', arquivada: true } } });
    }
    return rota.fulfill({ json: { conferencias: lista.filter((c) => !c.arquivada), outras: lista.filter((c) => c.arquivada).length } });
  });

  await p2.goto(`${BASE}/analise/conferencias`);
  await p2.getByText('Furadeira14').first().waitFor({ timeout: 8000 });

  /* ------------------- grupo de maquina: no cartao e na impressao */
  const cartoes = await p2.locator('[aria-label="Resumo por máquina"]').innerText();
  checar(/0002 · FURADEIRA/.test(cartoes), 'o cartao da maquina mostra o grupo com o codigo da fabrica');
  const impresso = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/Grupos de máquina/.test(impresso) && /0002 · FURADEIRA/.test(impresso),
    'a folha impressa identifica os grupos cobertos e o grupo de cada maquina');

  /* -------------------- painel: KPIs, o que falta e proximas acoes */
  const kpis = p2.locator('[aria-label="Resumo do período"]');
  const textoKpis = await kpis.innerText();
  checar(/Referências fechadas/i.test(textoKpis) && /0 de 3/.test(textoKpis),
    'a faixa de KPIs abre com o numero que importa: referencias fechadas');
  checar(/Conferências/i.test(textoKpis) && /Disponibilidade/i.test(textoKpis),
    'os demais KPIs contextualizam: conferencias, tempo, disponibilidade, setup');

  const acoesPainel = p2.locator('[aria-label="Próximas ações"]');
  const textoAcoes = await acoesPainel.innerText();
  checar(/Princesa Fundo/.test(textoAcoes) && /\+2 conferência/.test(textoAcoes),
    'proximas acoes dizem o caminho por peca (+2 conferencias, minutos)');

  /* --------------------- referencia por peca: criterio aplicado a peca */
  const refPecas = p2.locator('[aria-label="Referência por peça"]');
  const textoRef = await refPecas.innerText();
  checar(/Princesa Fundo/.test(textoRef) && /Lateral Mesa/.test(textoRef),
    'referencia por peca lista cada peca de cada maquina');
  checar(/1\/3 conf/.test(textoRef),
    'peca com 1 conferencia mostra o que falta: 1/3 conf e os minutos');
  checar(/900/.test(textoRef),
    'o ritmo consolidado da peca aparece (300pc/20min = 900 pc/h)');

  /* ------------- filtro na lateral abre o grafico por conferencia */
  const grafico = p2.locator('figure').first();
  checar(/Ritmo por máquina/.test(await grafico.textContent()),
    'sem filtro, o grafico compara maquinas (uma barra por maquina)');
  await p2.getByRole('button', { name: /^Furadeira 03/ }).click();
  const graficoFiltrado = await grafico.textContent();
  checar(/Conferências — Furadeira 03/.test(graficoFiltrado),
    'filtrando a maquina, o grafico abre as conferencias dela');
  checar(/Lateral Mesa/.test(graficoFiltrado) && /Princesa Fundo/.test(graficoFiltrado),
    'cada barra leva a peca embaixo — da para ver qual puxa o ritmo');
  checar(/840/.test(graficoFiltrado) && /900/.test(graficoFiltrado),
    'os ritmos individuais aparecem (420pc/30min=840 e 300pc/20min=900)');
  await p2.getByRole('button', { name: /^Todas/ }).click();
  checar(/Ritmo por máquina/.test(await grafico.textContent()),
    'voltar a Todas devolve a comparacao entre maquinas');


  await p2.getByRole('button', { name: /Excluir conferência de Furadeira14/ }).click();
  await p2.getByRole('button', { name: /Excluir definitivamente/ }).click();
  await p2.waitForTimeout(600);
  checar(chamadas.includes('DELETE'), 'excluir dispara DELETE no servidor');
  checar(/Conferencia nao encontrada/.test(await p2.locator('body').innerText()),
    'servidor recusou: a falha APARECE, nao morre em silencio');

  recusar = false;
  await p2.getByRole('button', { name: /Excluir definitivamente/ }).click();
  await p2.waitForTimeout(800);
  const corpo = await p2.locator('body').innerText();
  checar(!/Furadeira14/.test(corpo), 'excluida some da lista');
  checar(await p2.locator('[aria-label="Excluir conferência"]').count() === 0, 'modal fecha ao concluir');

  /* ------------------------------- cadastrar paradas direto no PC */
  /**
   * O setup nem sempre e' marcado no corredor. Aqui o analista o registra
   * depois, com o apontamento na mao — e o ritmo passa a sair do tempo em
   * que a maquina rodou, sem precisar arquivar a medicao.
   */
  await p2.getByRole('button', { name: 'Paradas' }).first().click();
  await p2.locator('[aria-label="Paradas da conferência"]').waitFor({ timeout: 4000 });
  checar(true, 'o botao Paradas abre o cadastro da conferencia');

  await p2.getByRole('button', { name: '+ Setup / troca' }).click();
  await p2.locator('input[aria-label="Minutos parada — Setup / Troca"]').fill('10');
  const janela = await p2.locator('[aria-label="Paradas da conferência"]').innerText();
  checar(/20 min/.test(janela), 'a janela mostra quanto sobra de maquina rodando (30 - 10 = 20 min)');

  // Parada do tamanho do periodo: o botao trava antes de chamar o servidor.
  await p2.locator('input[aria-label="Minutos parada — Setup / Troca"]').fill('30');
  checar(await p2.getByRole('button', { name: 'Gravar paradas' }).isDisabled(),
    'parada do tamanho do periodo trava a gravacao');

  await p2.locator('input[aria-label="Minutos parada — Setup / Troca"]').fill('10');
  await p2.getByRole('button', { name: 'Gravar paradas' }).click();
  await p2.waitForTimeout(800);
  const gravada = patches.find((x) => 'paradas' in x);
  checar(!!gravada && gravada.paradas[0].motivo === 'setup' && gravada.paradas[0].duracaoMs === 600000,
    'grava a parada em milissegundos, com o motivo escolhido');
  checar(await p2.locator('[aria-label="Paradas da conferência"]').count() === 0,
    'a janela fecha depois de gravar');

  const depois = await p2.locator('body').innerText();
  // 420 pc num periodo de 30 min com 10 de setup: sobram 20 min rodando e
  // a linha da tabela sobe de 840 para 1260 pc/h.
  checar(/1260/.test(depois),
    'o ritmo passa a sair do tempo rodando (420 pc em 20 min = 1260 pc/h)');
  checar(/Paradas \(1\)/.test(depois), 'a linha passa a mostrar que ha parada marcada');

  await p2.getByRole('button', { name: 'Arquivar' }).first().click();
  await p2.waitForTimeout(800);
  checar(chamadas.includes('PATCH'), 'arquivar dispara PATCH no servidor');
  await ctx2.close();
}

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
