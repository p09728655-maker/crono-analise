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
  window.print = () => { window.__impressoes += 1; };
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
  };
});
checar(folha.visivel, 'a folha aparece no papel');
checar(folha.telaOculta, 'a interface some no papel');
checar(folha.temNome, 'a folha traz o nome do estudo');
checar(folha.temOperacao, 'a folha traz as operacoes medidas');

checar(erros.length === 0, `sem erros de pagina${erros.length ? `: ${erros[0]}` : ''}`);

await b.close();
console.log(falhas ? `\n${falhas} checagem(ns) falharam` : '\nTodas as verificacoes passaram');
process.exit(falhas ? 1 : 0);
