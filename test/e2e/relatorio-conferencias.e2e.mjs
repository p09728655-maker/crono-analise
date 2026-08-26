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

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

await p.goto(`${BASE}/analise/conferencias`);
await p.getByText('Conferências rápidas').first().waitFor({ timeout: 8000 });
checar(true, 'PC: /analise/conferencias abre o relatorio');
// O subtitulo precisa dizer PARA QUE serve: era a duvida do usuario —
// onde fica a parte das furadeiras e onde fica a da embalagem.
checar(await p.getByText(/Furadeiras e demais postos/).count() > 0,
  'subtitulo diz que esta e a tela das furadeiras');

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
  const hoje = new Date().toISOString();
  let lista = [
    { id: 'c1', maquina: 'Furadeira14', peca: 'Sleep lateral', hora_inicial: '08:21', hora_final: '08:24',
      duracao_ms: 180000, pecas: 20, salvo_em: hoje, arquivada: false },
    { id: 'c2', maquina: 'Furadeira 03', peca: 'Lateral Mesa', hora_inicial: '07:00', hora_final: '07:30',
      duracao_ms: 1800000, pecas: 420, salvo_em: hoje, arquivada: false },
  ];
  let recusar = true;
  const chamadas = [];

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
      lista = lista.map((c) => (req.url().includes(c.id) ? { ...c, arquivada: true } : c));
      return rota.fulfill({ json: { conferencia: { id: 'c1', arquivada: true } } });
    }
    return rota.fulfill({ json: { conferencias: lista.filter((c) => !c.arquivada), outras: lista.filter((c) => c.arquivada).length } });
  });

  await p2.goto(`${BASE}/analise/conferencias`);
  await p2.getByText('Furadeira14').first().waitFor({ timeout: 8000 });

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

  await p2.getByRole('button', { name: 'Arquivar' }).first().click();
  await p2.waitForTimeout(800);
  checar(chamadas.includes('PATCH'), 'arquivar dispara PATCH no servidor');
  await ctx2.close();
}

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
