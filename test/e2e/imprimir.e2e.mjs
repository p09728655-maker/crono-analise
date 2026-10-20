/**
 * Imprimir a Folha de Analise a partir da LISTA.
 *
 * Existe por um caso real: um estudo de EMBALAGEM com 80 ciclos, ainda em
 * medicao, e ninguem na tela conseguia chegar ao relatorio. O botao
 * "Analisar" tinha sido removido da linha porque "Proximas acoes oferece o
 * mesmo destino" — so' que oferece apenas para estudo CONCLUIDO. Em
 * andamento o cartao diz "Continuar medicao", e o unico caminho ate' o papel
 * era adivinhar que o nome do estudo era clicavel.
 *
 * O que este teste prova e' a cadeia inteira: botao na linha, rota com
 * ?imprimir=folha (que o roteador precisa aceitar), painel carregando o
 * estudo, impressao disparada DEPOIS de haver dado na tela, pedido saindo da
 * URL e a folha aparecendo no papel com o conteudo do estudo.
 *
 * O estudo daqui e' de proposito 'coletando': e' o estado que estava
 * quebrado.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/imprimir.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ID = 'b17e849c-da3f-4d8c-a262-81e8748c589b';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

/** Ciclos suficientes para a folha ter o que dizer. */
const tempos = (base) => Array.from({ length: 10 }, (_, i) => base + (i % 4) * 400);

const lista = {
  estudos: [{
    id: ID, nome: 'RACK EMBALAGEM', recurso: 'EMBALAGEM', produto: '',
    analista: 'ADRIANO', setor: '', total_operacoes: 2, total_observacoes: 20,
    status: 'coletando', atualizado_em: '2026-09-11T10:00:00Z',
  }],
};
const estudo = {
  estudo: {
    id: ID, nome: 'RACK EMBALAGEM', setor: '', recurso: 'EMBALAGEM', produto: null,
    analista: 'ADRIANO', data_estudo: '2026-09-11', tolerancia_pct: '15',
    meta_obs: 10, takt_time_ms: null, status: 'coletando',
  },
  operacoes: [
    {
      id: 'op1', estudo_id: ID, nome: 'MONTAR CAIXA', fr_pct: '100',
      ciclos_por_peca: 1, ordem: 0, tempos: tempos(12500), observacoes: [], paradas: [],
    },
    {
      id: 'op2', estudo_id: ID, nome: 'APLICAR ISOMANTA', fr_pct: '100',
      ciclos_por_peca: 1, ordem: 1, tempos: tempos(9800), observacoes: [], paradas: [],
    },
  ],
};

const b = await chromium.launch({ executablePath: EXEC });
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
await semearSessao(p);

// O navegador de verdade abriria a caixa de impressao e travaria o teste.
// Contar as chamadas e' o que interessa: quantas, e depois de que ponto.
await p.addInitScript(() => {
  window.__impressoes = 0;
  window.print = () => {
    window.__impressoes += 1;
    // O que estava no papel NA HORA do print — nao o que chegou depois.
    window.__papel = document.querySelector('.somente-impressao')?.textContent || '';
  };
});

const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.route('**/api/estudos**', (r) => {
  const req = r.request();
  if (req.url().includes('id=')) return r.fulfill({ json: estudo });
  return r.fulfill({ json: req.url().includes('arquivados=1') ? { estudos: [] } : lista });
});
await p.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));
await p.route('**/api/usuarios**', (r) => r.fulfill({ json: { usuarios: [] } }));
// A medicao da linha carrega junto com o estudo, e o papel pedido pela
// lista espera por ela. As medicoes chegam DEPOIS do estudo de proposito:
// e' o caso em que imprimir na hora levaria "carregando" para o papel.
await p.route('**/api/maquinas**', (r) => r.fulfill({ json: { maquinas: [], grupos: [], produtos: [] } }));
await p.route('**/api/conferencias**', async (r) => {
  await new Promise((ok) => { setTimeout(ok, 800); });
  return r.fulfill({ json: { conferencias: [], outras: 0 } });
});

await p.goto(`${BASE}/analise/estudos`);
await p.getByText('RACK EMBALAGEM').first().waitFor({ timeout: 8000 });

const botao = p.getByRole('button', { name: 'Imprimir', exact: true });
checar(await botao.count() === 1, 'a linha do estudo oferece Imprimir');

// A altura de uma linha so': quatro botoes nao podem quebrar para a linha
// de baixo, que era o motivo de o quarto ter sido removido.
const alturaLinha = await p.locator('tbody tr').first().evaluate((el) => el.getBoundingClientRect().height);
checar(alturaLinha < 80, `os quatro botoes cabem numa linha so (${Math.round(alturaLinha)}px)`);

await botao.click();
await p.waitForFunction(() => location.pathname.includes('/analise/estudo/'), { timeout: 8000 });
checar(await p.evaluate(() => location.pathname) === `/analise/estudo/${ID}`,
  'o botao leva ao painel do estudo, nao derruba o app para a lista');

await p.waitForFunction(() => window.__impressoes > 0, { timeout: 8000 });
checar(true, 'a impressao dispara sozinha, sem procurar botao dentro do painel');

// O pedido tem de sair da URL: recarregar nao pode reabrir a impressao.
checar(!(await p.evaluate(() => location.search)).includes('imprimir'),
  'o pedido sai da URL depois de atendido');

const uma = await p.evaluate(() => window.__impressoes);
await p.waitForTimeout(500);
checar(await p.evaluate(() => window.__impressoes) === uma && uma === 1,
  'imprime UMA vez — nao a cada render');
const papel = await p.evaluate(() => window.__papel || '');
checar(/Medido na linha:\s*sem produto no estudo/i.test(papel) && !/carregando/.test(papel),
  'o papel espera a medicao da linha responder antes de imprimir');

// E o que vai ao papel e' a folha com o estudo, nao uma pagina em branco.
await p.emulateMedia({ media: 'print' });
await p.waitForTimeout(400);
const folha = await p.evaluate(() => {
  const rel = document.querySelector('.somente-impressao');
  const tela = document.querySelector('.somente-tela');
  const vis = (el) => (el ? getComputedStyle(el).display !== 'none' : null);
  return {
    visivel: vis(rel) === true,
    telaOculta: vis(tela) === false,
    temNome: /RACK EMBALAGEM/.test(rel?.innerText || ''),
    temOperacao: /MONTAR CAIXA/.test(rel?.innerText || ''),
    // Estudo sem produto: a folha diz por que nao ha' medido, em vez de
    // um vazio que parece "a linha nao produziu".
    medidoExplicado: /Medido na linha:\s*sem produto no estudo/i.test(rel?.innerText || ''),
  };
});
checar(folha.visivel, 'a folha aparece no papel');
checar(folha.telaOculta, 'a interface some no papel');
checar(folha.temNome, 'a folha traz o nome do estudo');
checar(folha.temOperacao, 'a folha traz as operacoes medidas');
checar(folha.medidoExplicado, 'a folha traz o medido na linha, com o motivo de nao haver');

checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await ctx.close();

/* ------------------------------------------- embalagem com medicao */
/**
 * O papel da EMBALAGEM pedido pela lista, com medicao na linha: o estudo
 * mede o PRODUTO (o rack inteiro), e o que estava no papel NA HORA do
 * print tem de dizer produtos/h em todos os numeros da capacidade, o
 * mesmo nome do topo ("Capacidade pelo tempo padrao"), o veredito do
 * medido e o setup uma vez so'.
 *
 * Numeros feitos na mao: 3 medicoes de 60 min com 10 min de setup marcado
 * e 50 volumes cada. O grupo tem setup planejado, entao o setup sai do
 * relogio: 150 volumes em 150 min = 60 vol/h; rack de 2 volumes = 30
 * produtos/h, contra 25 exigidos (takt 144 s) — atende, medido. Com o
 * setup no relogio seriam 25, no limite. O tempo padrao do gargalo e'
 * 100,6 s x 1,15 = 115,7 s: 31 produtos/h. O produto esta' DESATIVADO no
 * cadastro e os volumes valem do mesmo jeito.
 */
{
  const ID2 = '0c0e7a52-6a55-4d1b-9d4e-6f3a2b1c9d10';
  const haDias = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p2 = await ctx2.newPage();
  await semearSessao(p2);
  await p2.addInitScript(() => {
    window.__impressoes = 0;
    window.print = () => {
      window.__impressoes += 1;
      window.__papel = document.querySelector('.somente-impressao')?.innerText || '';
    };
  });
  const erros2 = [];
  p2.on('pageerror', (e) => erros2.push(e.message));
  const lista2 = {
    estudos: [{
      id: ID2, nome: 'RACK SIRIUS — EMBALAGEM 01', recurso: 'EMBALAGEM 01', produto: 'RACK SIRIUS 1.6',
      analista: 'ADRIANO', setor: 'Embalagem', total_operacoes: 2, total_observacoes: 20,
      status: 'concluido', atualizado_em: '2026-10-11T10:00:00Z',
    }],
  };
  const estudo2 = {
    estudo: {
      id: ID2, nome: 'RACK SIRIUS — EMBALAGEM 01', setor: 'Embalagem', recurso: 'EMBALAGEM 01',
      produto: 'RACK SIRIUS 1.6', analista: 'ADRIANO', data_estudo: '2026-10-11', tolerancia_pct: '15',
      meta_obs: 10, takt_time_ms: 144000, status: 'concluido',
    },
    operacoes: [
      { id: 'e1', estudo_id: ID2, nome: 'CX 1/1 MONTAR', fr_pct: '100', ciclos_por_peca: 1, ordem: 0, tempos: tempos(100000), observacoes: [], paradas: [] },
      { id: 'e2', estudo_id: ID2, nome: 'APLICAR ISOMANTA', fr_pct: '100', ciclos_por_peca: 1, ordem: 1, tempos: tempos(70000), observacoes: [], paradas: [] },
    ],
  };
  const cadastro = {
    maquinas: [{ id: 'm5', nome: 'EMBALAGEM 01', grupo_id: 'g5', ativa: true }],
    grupos: [{ id: 'g5', codigo: '0005', nome: 'EMBALAGEM', horas_semana: '44.00', setups_dia: 2, dias_semana: 5, setup_min: 10 }],
    produtos: [{ id: 'p5', nome: 'RACK SIRIUS 1.6', codigo: '12345', grupo_id: 'g5', ativo: false, volumes: 2 }],
  };
  const medicoes = [0, 1, 2].map((i) => ({
    id: `v${i}`, maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6', duracao_ms: 3600000, pecas: 50,
    ciclos_por_peca: 1, arquivada: false, com_marcas: true, iniciado_em: haDias(8 - i * 3),
    paradas: [{ motivo: 'setup', duracaoMs: 600000, observacao: null }],
  }));
  await p2.route('**/api/estudos**', (r) => {
    const req = r.request();
    if (req.url().includes('id=')) return r.fulfill({ json: estudo2 });
    return r.fulfill({ json: req.url().includes('arquivados=1') ? { estudos: [] } : lista2 });
  });
  await p2.route('**/api/config**', (r) => r.fulfill({ json: { chaveIa: { configurada: false } } }));
  await p2.route('**/api/usuarios**', (r) => r.fulfill({ json: { usuarios: [] } }));
  await p2.route('**/api/maquinas**', (r) => r.fulfill({ json: cadastro }));
  await p2.route('**/api/conferencias**', async (r) => {
    // Depois do estudo, de proposito: o papel tem de esperar a medicao.
    await new Promise((ok) => { setTimeout(ok, 800); });
    const arquivadas = r.request().url().includes('arquivadas=1');
    return r.fulfill({ json: { conferencias: arquivadas ? [] : medicoes, outras: 0 } });
  });

  await p2.goto(`${BASE}/analise/estudos`);
  await p2.getByText('RACK SIRIUS — EMBALAGEM 01').first().waitFor({ timeout: 8000 });
  await p2.getByRole('button', { name: 'Imprimir', exact: true }).click();
  await p2.waitForFunction(() => window.__impressoes > 0, { timeout: 10000 });
  const papel2 = await p2.evaluate(() => window.__papel || '');
  checar(/Medido na linha\s*30\s*produtos\/h/i.test(papel2),
    `embalagem: o papel sai com o medido em produtos/h, ja' convertido (${(papel2.match(/Medido na linha\s*\S+\s*\S+/i) || [''])[0].replace(/\s+/g, ' ')})`);
  checar(/o setup marcado \(30 min\) saiu do relógio: já está no takt/.test(papel2),
    'o setup marcado sai do relogio (o grupo tem setup planejado) e o papel diz');
  checar(/Veredito: A linha atende o ritmo da demanda, medida na linha/.test(papel2),
    'o veredito do papel e o do medido');
  checar(/Exigido \(takt\)\s*25\s*produtos\/h/i.test(papel2) && /Capacidade pelo tempo padrão\s*31\s*produtos\/h/i.test(papel2)
    && /Superávit\s*\+5\s*produtos\/h/i.test(papel2),
    'exigido, tempo padrao e superavit tambem em produtos/h');
  checar(/A capacidade pelo tempo padrão é\s+limitada por esta operação — 31 produtos\/hora/.test(papel2)
    && /s por produto/.test(papel2) && !/capacidade da linha/i.test(papel2),
    'o paragrafo do gargalo diz "capacidade pelo tempo padrao", por produto');
  const capacidadeNoPapel = papel2.slice(papel2.indexOf('Exigido'), papel2.indexOf('Resultados por operação'));
  checar(!/pç\/h|peças\/hora/.test(capacidadeNoPapel), 'nenhum pç/h na capacidade da embalagem');
  checar(erros2.length === 0, `embalagem: sem erros de pagina${erros2.length ? `: ${erros2[0]}` : ''}`);
  await ctx2.close();
}

await b.close();
console.log(falhas ? `\n${falhas} checagem(ns) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
