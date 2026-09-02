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
await p.getByText('Ritmo por máquina').first().waitFor({ timeout: 8000 });
checar(true, 'PC: /analise/conferencias abre o relatorio');
/**
 * O relatorio se chamava "Furadeiras", de quando so' havia furadeira
 * medida. Com fresadora e embalagem no cadastro o nome passou a mentir
 * sobre o que ele cobre — quem media uma fresadora nao achava onde ver.
 */
checar(await p.getByText(/Peças\/hora e peças\/minuto de cada posto/).count() > 0,
  'o titulo e do POSTO, seja ele qual for — nao mais "Furadeiras"');

await p.getByText('Não foi possível carregar').waitFor({ timeout: 8000 });
checar(await p.getByRole('button', { name: 'Tentar de novo' }).count() === 1,
  'API fora: erro honesto com "Tentar de novo"');

// Voltar leva para a lista de analise — que desde o Inicio mora em
// /analise/estudos (`/analise` virou a casa).
await p.getByRole('button', { name: /Voltar para a lista/ }).click();
await p.waitForFunction(() => location.pathname === '/analise/estudos', { timeout: 8000 });
checar(true, 'voltar leva para /analise/estudos');

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
  let recusarLote = true;
  let recusarLinha = false;
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
      // Lote (arquivar por maquina): sem id na URL, a lista vem no corpo.
      if (Array.isArray(corpoPatch.ids)) {
        if (recusarLote && 'arquivada' in corpoPatch) {
          return rota.fulfill({ status: 403, contentType: 'application/json',
            body: JSON.stringify({ erro: 'Seu papel nao permite esta operacao' }) });
        }
        lista = lista.map((c) => (corpoPatch.ids.includes(c.id)
          ? {
            ...c,
            ...('arquivada' in corpoPatch ? { arquivada: Boolean(corpoPatch.arquivada) } : {}),
            ...('peca' in corpoPatch ? { peca: corpoPatch.peca } : {}),
          }
          : c));
        return rota.fulfill({ json: { atualizadas: corpoPatch.ids.length } });
      }
      if (recusarLinha && 'arquivada' in corpoPatch) {
        return rota.fulfill({ status: 403, contentType: 'application/json',
          body: JSON.stringify({ erro: 'Seu papel nao permite esta operacao' }) });
      }
      lista = lista.map((c) => (req.url().includes(c.id)
        ? {
          ...c,
          ...('arquivada' in corpoPatch ? { arquivada: true } : {}),
          ...('paradas' in corpoPatch ? { paradas: corpoPatch.paradas } : {}),
          ...('peca' in corpoPatch ? { peca: corpoPatch.peca } : {}),
        }
        : c));
      return rota.fulfill({ json: { conferencia: { id: 'c1', arquivada: true } } });
    }
    // A lista arquivada e' a outra face da mesma tabela: ?arquivadas=1.
    const soArquivadas = /arquivadas=1/.test(req.url());
    return rota.fulfill({ json: {
      conferencias: lista.filter((c) => Boolean(c.arquivada) === soArquivadas),
      outras: lista.filter((c) => Boolean(c.arquivada) !== soArquivadas).length,
    } });
  });

  await p2.goto(`${BASE}/analise/conferencias`);
  await p2.getByText('Furadeira14').first().waitFor({ timeout: 8000 });

  /* ------------------- grupo de maquina: no cartao e na impressao */
  const cartoes = await p2.locator('[aria-label="Resumo por máquina"]').innerText();
  checar(/0002 · FURADEIRA/.test(cartoes), 'o cartao da maquina mostra o grupo com o codigo da fabrica');
  const impresso = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/Grupos de máquina/.test(impresso) && /0002 · FURADEIRA/.test(impresso),
    'a folha impressa identifica os grupos cobertos e o grupo de cada maquina');

  /* ------------- COMPARATIVO: o que saiu x o que teria saido */
  /**
   * "Perdemos 322" sozinho nao diz de quanto para quanto. O quadro poe os
   * dois lados na mesma linha e destaca a diferenca — e' o numero que a
   * reuniao de producao pergunta.
   *
   * Aqui: 740 pecas em 53 min observados (838 pc/h rodando). Sem parada
   * marcada nesta carga, o quadro NAO aparece — comparar seria inventar
   * perda. Ele entra depois, quando o teste cadastra o setup.
   */
  checar(await p2.locator('[aria-label="Comparativo com e sem parada"]').count() === 0,
    'sem parada marcada, o comparativo nao aparece — nao ha perda a mostrar');

  /* -------------------- painel: numeros do topo em portugues de fabrica */
  const kpis = p2.locator('[aria-label="Resumo do período"]');
  const textoKpis = await kpis.innerText();
  checar(/Ritmo médio/i.test(textoKpis) && /838 pç\/h/.test(textoKpis),
    'a faixa abre com o ritmo medio ponderado (740 pc em 53 min = 838 pc/h)');
  checar(/14\.0 peças por minuto/.test(textoKpis),
    'o ritmo medio tambem sai em pecas por minuto (838/60 = 14.0)');
  checar(/Medições/i.test(textoKpis) && /Tempo parado/i.test(textoKpis),
    'os demais numeros sao em palavras: medicoes, tempo rodando, tempo parado');
  checar(!/insuficiente/i.test(await p2.locator('main').innerText()),
    'o carimbo "amostra insuficiente" sumiu da tela — virou nota "ainda em medição"');
  checar(/[Aa]inda em medição/.test(await p2.locator('[aria-label="Resumo por máquina"]').innerText()),
    'maquina medida ha pouco tempo leva a nota discreta, nao um selo');

  /* --------------------------- ritmo por peca, com pecas por minuto */
  const refPecas = p2.locator('[aria-label="Ritmo por peça"]');
  const textoRef = await refPecas.innerText();
  checar(/Princesa Fundo/.test(textoRef) && /Lateral Mesa/.test(textoRef),
    'ritmo por peca lista cada peca de cada maquina');
  checar(/900/.test(textoRef),
    'o ritmo consolidado da peca aparece (300pc/20min = 900 pc/h)');
  checar(/15\.0/.test(textoRef),
    'a peca tambem sai em pecas por minuto (900/60 = 15.0)');

  /* ------------------- analise do periodo, gerada pelo algoritmo */
  const analise = p2.locator('[aria-label="Análise do período"]');
  const textoAnalise = await analise.innerText();
  checar(/sem IA, sem custo/i.test(textoAnalise),
    'a analise aparece na hora, gerada pelos numeros — sem gastar a chave');
  checar(/Por máquina/i.test(textoAnalise) && /ainda em medição/i.test(textoAnalise),
    'uma linha por maquina, com o que falta dito em palavras');
  checar(/Entre máquinas/i.test(textoAnalise) && /116%/.test(textoAnalise),
    'compara as maquinas pelo ritmo (864 contra 400 pc/h = 116% mais rapida)');
  checar(/Próximo passo/i.test(textoAnalise) && /Furadeira14/.test(textoAnalise),
    'diz o proximo passo: quais maquinas medir de novo');
  checar(await analise.getByRole('button', { name: 'Analisar com IA' }).count() === 1,
    'a IA segue disponivel como opcao, num botao discreto');

  /* ----------------------- a analise no papel e' OPCAO, desligada por padrao */
  const folhaSem = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(!/Análise do período/.test(folhaSem),
    'por padrao, a folha impressa sai so com os numeros — sem a analise');
  await analise.getByRole('checkbox', { name: 'Sair na impressão' }).check();
  const folhaCom = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/Análise do período/.test(folhaCom) && /Leitura geral/i.test(folhaCom),
    'marcada a caixa, a analise inteira entra na folha A4');
  checar(/Gerada automaticamente/.test(folhaCom),
    'o papel declara que a analise e automatica — leitura de regra, nao parecer');
  checar(await p2.evaluate(() => localStorage.getItem('ritmo.analise-na-impressao')) === '1',
    'a escolha fica gravada no navegador para as proximas impressoes');
  await analise.getByRole('checkbox', { name: 'Sair na impressão' }).uncheck();
  checar(!/Análise do período/.test(await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '')),
    'desmarcada, o papel volta a sair so com os numeros');

  /* ------------- filtro na lateral abre o grafico por conferencia */
  const grafico = p2.locator('figure').first();
  checar(/Ritmo por máquina/.test(await grafico.textContent()),
    'sem filtro, o grafico compara maquinas (uma barra por maquina)');
  await p2.getByRole('button', { name: /^Furadeira 03/ }).click();
  const graficoFiltrado = await grafico.textContent();
  checar(/Medições — Furadeira 03/.test(graficoFiltrado),
    'filtrando a maquina, o grafico abre as medicoes dela');
  checar(/Lateral Mesa/.test(graficoFiltrado) && /Princesa Fundo/.test(graficoFiltrado),
    'cada barra leva a peca embaixo — da para ver qual puxa o ritmo');
  checar(/840/.test(graficoFiltrado) && /900/.test(graficoFiltrado),
    'os ritmos individuais aparecem (420pc/30min=840 e 300pc/20min=900)');

  /* ------------------- o filtro vale para o relatorio inteiro e o papel */
  checar(/Imprimir esta máquina/.test(await p2.locator('nav').innerText()),
    'com a maquina filtrada, o botao diz o que vai sair: "Imprimir esta máquina"');
  const kpisFiltrados = await kpis.innerText();
  checar(/864 pç\/h/.test(kpisFiltrados),
    'os numeros do topo seguem o filtro (720 pc em 50 min = 864 pc/h)');
  const folhaFiltrada = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/Ritmo por Máquina — Furadeira 03/.test(folhaFiltrada),
    'a folha impressa sai com o nome da maquina no titulo');
  checar(!/Furadeira14/.test(folhaFiltrada),
    'a folha filtrada NAO leva as outras maquinas — imprime so a escolhida');

  await p2.getByRole('button', { name: /^Todas/ }).click();
  checar(/Ritmo por máquina/.test(await grafico.textContent()),
    'voltar a Todas devolve a comparacao entre maquinas');
  checar(/Imprimir todas/.test(await p2.locator('nav').innerText()),
    'sem filtro, o botao volta a "Imprimir todas"');
  checar(/Furadeira14/.test(await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '')),
    'sem filtro, a folha volta a cobrir todas as maquinas');


  await p2.getByRole('button', { name: /Excluir medição de Furadeira14/ }).click();
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
  checar(await p2.locator('[aria-label="Excluir medição"]').count() === 0, 'modal fecha ao concluir');

  /* ------------------------------- cadastrar paradas direto no PC */
  /**
   * O setup nem sempre e' marcado no corredor. Aqui o analista o registra
   * depois, com o apontamento na mao — e o ritmo passa a sair do tempo em
   * que a maquina rodou, sem precisar arquivar a medicao.
   */
  await p2.getByRole('button', { name: 'Paradas' }).first().click();
  await p2.locator('[aria-label="Paradas da medição"]').waitFor({ timeout: 4000 });
  checar(true, 'o botao Paradas abre o cadastro da conferencia');

  await p2.getByRole('button', { name: '+ Setup / troca' }).click();
  await p2.locator('input[aria-label="Minutos parada — Setup / Troca"]').fill('10');
  const janela = await p2.locator('[aria-label="Paradas da medição"]').innerText();
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
  checar(await p2.locator('[aria-label="Paradas da medição"]').count() === 0,
    'a janela fecha depois de gravar');

  const depois = await p2.locator('body').innerText();
  // 420 pc num periodo de 30 min com 10 de setup: sobram 20 min rodando e
  // a linha da tabela sobe de 840 para 1260 pc/h.
  checar(/1260/.test(depois),
    'o ritmo passa a sair do tempo rodando (420 pc em 20 min = 1260 pc/h)');
  checar(/Paradas \(1\)/.test(depois), 'a linha passa a mostrar que ha parada marcada');

  /* ---- com a parada marcada, o comparativo aparece, na tela e no papel */
  const quadro = p2.locator('[aria-label="Comparativo com e sem parada"]');
  await quadro.waitFor({ timeout: 4000 });
  const textoQuadro = await quadro.innerText();
  /**
   * Carga do teste, ja com o setup de 10 min: sobraram as duas medicoes da
   * Furadeira 03 (420 pc em 30 min e 300 pc em 20 min) = 720 pecas em 50
   * min de periodo, 40 min rodando = 1080 pc/h. Esticado para os 50 min,
   * o potencial e' 900 pecas — 180 a mais que as 720 que sairam, 25%.
   */
  checar(/Saiu no período/i.test(textoQuadro) && /720/.test(textoQuadro),
    'o quadro mostra o que SAIU no periodo (720 pc)');
  checar(/Teria saído no mesmo tempo/i.test(textoQuadro) && /900/.test(textoQuadro),
    'e o que teria saido no MESMO tempo, sem a parada (900 pc)');
  checar(/Deixou de sair/i.test(textoQuadro) && /180/.test(textoQuadro),
    'a diferenca fica em destaque: 180 pecas que deixaram de sair');
  checar(/1080 pç\/h/.test(textoQuadro) && /18\.0 pç\/min/.test(textoQuadro),
    'os dois ritmos saem em pecas/hora E pecas/minuto');
  checar(/25% a mais de produção no mesmo tempo/.test(textoQuadro),
    'e o ganho em percentual: 180 sobre 720 = 25% a mais no mesmo tempo');
  checar(/não é meta nem capacidade de catálogo/i.test(textoQuadro),
    'o quadro declara que o potencial nao e meta — e o ritmo que a maquina ja provou');

  const folhaComparativo = await p2.evaluate(() => document.querySelector('.somente-impressao')?.textContent || '');
  checar(/O que a parada custou/.test(folhaComparativo) && /900 peças/.test(folhaComparativo),
    'o comparativo tambem sai na folha impressa — e o papel que vai para a reuniao');
  checar(/Coordenador PPCP/.test(folhaComparativo) && !/Supervis/.test(folhaComparativo),
    'a assinatura do papel e do Coordenador PPCP');

  /**
   * A RECUSA PRECISA SER LIDA DE ONDE SE CLICOU.
   *
   * Era este o "arquivar nao funciona" de 31/08: o servidor negava, a faixa
   * de erro nascia no TOPO do relatorio — mil pixels acima de quem clicou no
   * fim da tabela — e a tela parecia nao ter feito nada. O aviso agora
   * flutua preso a' janela; o teste mede a posicao dele, nao so a presenca.
   */
  recusarLinha = true;
  const botaoArquivar = p2.getByRole('button', { name: 'Arquivar' }).first();
  await botaoArquivar.scrollIntoViewIfNeeded();
  await botaoArquivar.click();
  await p2.waitForTimeout(800);
  const aviso = p2.locator('main [role="alert"]').first();
  const caixa = await aviso.boundingBox();
  const altura = await p2.evaluate(() => window.innerHeight);
  checar(!!caixa && caixa.y >= 0 && caixa.y + caixa.height <= altura,
    'a recusa aparece DENTRO da janela, na altura em que o usuario esta');
  checar(/Seu papel nao permite/.test(await aviso.innerText()),
    'e o aviso diz o motivo da recusa, nao um silencio');

  recusarLinha = false;
  await p2.getByRole('button', { name: 'Arquivar' }).first().click();
  await p2.waitForTimeout(800);
  checar(chamadas.includes('PATCH'), 'arquivar dispara PATCH no servidor');

  /* ------------------------------- ARQUIVAR POR MAQUINA (lote) */
  /**
   * A medicao entra uma a uma, mas sai por posto. Sem isto, tirar uma
   * maquina do relatorio era um clique por medicao — e nao havia como
   * saber quando tinha acabado.
   */
  // A medicao arquivada logo acima volta: o lote precisa de mais de uma
  // linha da mesma maquina para provar o que faz.
  lista = lista.map((c) => ({ ...c, arquivada: false }));
  await p2.goto(`${BASE}/analise/conferencias`);
  await p2.getByText('Lateral Mesa').first().waitFor({ timeout: 8000 });

  await p2.getByRole('button', { name: /^Furadeira 03/ }).click();
  await p2.waitForTimeout(300);
  const cabecalho = await p2.locator('section[aria-label="Todas as medições"]').innerText();
  checar(/Todas as medições · Furadeira 03/.test(cabecalho),
    'o cabecalho da tabela diz de qual maquina sao as linhas');

  await p2.getByRole('button', { name: 'Arquivar esta máquina' }).click();
  const janelaLote = p2.locator('[aria-label="Arquivar máquina"]');
  await janelaLote.waitFor({ timeout: 4000 });
  const textoLote = await janelaLote.innerText();
  checar(/Arquivar as medições da Furadeira 03\?/.test(textoLote),
    'a janela nomeia a maquina que vai sair do relatorio');
  checar(/2 medição\(ões\)/.test(textoLote) && /Nada é apagado/.test(textoLote),
    'diz QUANTAS medicoes saem e que nada e apagado — arquivar nao e excluir');

  // Primeiro a RECUSA: o servidor nega e a tela precisa dizer, com a
  // janela aberta e o botao ainda ali.
  await p2.getByRole('button', { name: 'Arquivar 2' }).click();
  await p2.waitForTimeout(700);
  checar(/Seu papel nao permite/.test(await janelaLote.innerText()),
    'lote recusado: o erro sai DENTRO da janela, ao lado do botao que falhou');

  recusarLote = false;
  await p2.getByRole('button', { name: 'Arquivar 2' }).click();
  await p2.waitForTimeout(900);
  const loteEnviado = patches.find((x) => Array.isArray(x.ids));
  checar(!!loteEnviado && loteEnviado.ids.length === 2 && loteEnviado.arquivada === true,
    'o lote vai numa unica ida, com os ids das medicoes que estavam na tela');
  const depoisDoLote = await p2.locator('body').innerText();
  checar(!/Lateral Mesa/.test(depoisDoLote) && !/Princesa Fundo/.test(depoisDoLote),
    'as medicoes da maquina somem do relatorio de uma vez');
  checar(await p2.locator('[aria-label="Arquivar máquina"]').count() === 0,
    'a janela fecha depois de arquivar');

  /* -------- e voltam inteiras: restaurar tambem e' por maquina */
  await p2.getByRole('button', { name: /Arquivadas 2/ }).click();
  await p2.waitForTimeout(700);
  checar(/Lateral Mesa/.test(await p2.locator('body').innerText()),
    'as arquivadas aparecem na outra face da lista');
  await p2.getByRole('button', { name: /^Furadeira 03/ }).click();
  await p2.waitForTimeout(300);
  await p2.getByRole('button', { name: 'Restaurar esta máquina' }).click();
  await p2.getByRole('button', { name: 'Restaurar 2' }).click();
  await p2.waitForTimeout(900);
  const volta = patches.filter((x) => Array.isArray(x.ids)).pop();
  checar(volta.arquivada === false && volta.ids.length === 2,
    'restaurar por maquina e o mesmo caminho, com arquivada: false');
  checar(/Nenhuma medição arquivada/.test(await p2.locator('body').innerText()),
    'a lista de arquivadas vazia diz que esta vazia — nao "nada sincronizado"');

  /* ------------------------------- CORRIGIR O NOME DA PECA */
  /**
   * O nome da peca e' digitado no aparelho, medicao a medicao: o mesmo
   * produto chega escrito de dois jeitos e o Ritmo por peca mostra duas
   * pecas com metade das medicoes cada. Corrigir o texto e' o que junta.
   */
  await p2.getByRole('button', { name: 'Ver ativas' }).first().click();
  await p2.waitForTimeout(700);
  await p2.getByRole('button', { name: /^Todas/ }).click();
  await p2.waitForTimeout(300);
  const pecasAntes = await p2.locator('[aria-label="Ritmo por peça"]').innerText();
  checar(/Lateral Mesa/.test(pecasAntes) && /Princesa Fundo/.test(pecasAntes),
    'as duas grafias aparecem como duas pecas diferentes no Ritmo por peça');

  await p2.getByRole('button', { name: 'Princesa Fundo', exact: true }).click();
  const janelaNome = p2.locator('[aria-label="Nome da peça"]').first();
  await janelaNome.waitFor({ timeout: 4000 });
  checar(await p2.locator('#pecas-ja-medidas option').count() >= 2,
    'a janela oferece os nomes ja medidos — escolher evita inventar a terceira grafia');

  await p2.locator('input[aria-label="Nome da peça"]').fill('Lateral Mesa');
  await p2.getByRole('button', { name: /^Renomear$/ }).click();
  await p2.waitForTimeout(900);
  const renomeada = patches.filter((x) => 'peca' in x).pop();
  checar(!!renomeada && renomeada.peca === 'Lateral Mesa',
    'o novo nome vai para o servidor');
  const pecasDepois = await p2.locator('[aria-label="Ritmo por peça"]').innerText();
  checar(!/Princesa Fundo/.test(pecasDepois),
    'a grafia velha some do Ritmo por peça');
  checar(/Lateral Mesa/.test(pecasDepois) && /720/.test(pecasDepois),
    'as duas medicoes viram UMA peca so (420 + 300 = 720 pc)');

  // E com irmas na lista, a correcao alcanca todas de uma vez.
  await p2.getByRole('button', { name: 'Lateral Mesa', exact: true }).first().click();
  await janelaNome.waitFor({ timeout: 4000 });
  checar(/Corrigir também a outra medição com este mesmo nome/.test(await janelaNome.innerText()),
    'com outra medicao na mesma grafia, a janela oferece corrigir as duas');
  await p2.locator('input[aria-label="Nome da peça"]').fill('LATERAL MESA 380');
  await p2.getByRole('button', { name: /^Renomear as 2 medições$/ }).click();
  await p2.waitForTimeout(900);
  const loteNome = patches.filter((x) => Array.isArray(x.ids) && 'peca' in x).pop();
  checar(!!loteNome && loteNome.ids.length === 2 && loteNome.peca === 'LATERAL MESA 380',
    'a correcao vai para as duas medicoes numa unica ida');

  await ctx2.close();
}

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
