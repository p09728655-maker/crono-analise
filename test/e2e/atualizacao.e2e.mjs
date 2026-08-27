/**
 * Aviso de atualizacao — a faixa que explica por que a tela amanheceu
 * diferente.
 *
 * Cobre a politica inteira contra o app real, com a API fora do ar (a
 * faixa nao depende de rede):
 *  1. primeira visita: nenhuma faixa, versao gravada em silencio;
 *  2. versao antiga gravada: faixa aparece, "Ver novidades" abre o
 *     historico e marca como vista;
 *  3. dispensar pelo × tambem marca — recarregar nao traz a faixa de volta.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/atualizacao.e2e.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHAVE = 'ritmopatrimar.versaoVista';
const VERSAO = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const navegador = await chromium.launch({ executablePath: EXEC });
const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
const p = await ctx.newPage();
await semearSessao(p);
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));

const faixa = () => p.locator('[aria-label="Aviso de atualização"]');

/* -------------------------------------------- 1. primeira visita: silencio */
await p.goto(`${BASE}/coleta`);
await p.getByRole('button', { name: /Ritmo da furadeira/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'primeira visita nao mostra faixa');
checar(
  await p.evaluate((k) => localStorage.getItem(k), CHAVE) === VERSAO,
  `primeira visita grava a versao em silencio (${VERSAO})`,
);

/* --------------------------------- 2. versao antiga: faixa + ver novidades */
await p.evaluate((k) => localStorage.setItem(k, '2.0.0'), CHAVE);
await p.reload();
await faixa().waitFor({ timeout: 8000 });
checar((await faixa().innerText()).includes(`v${VERSAO}`), 'faixa anuncia a versao que chegou');

await p.getByRole('button', { name: 'Ver novidades' }).tap();
await p.locator('[aria-label="Histórico de versões"]').waitFor({ timeout: 4000 });
checar(true, '"Ver novidades" abre o historico de versoes');
checar(await faixa().count() === 0, 'abrir as novidades ja recolhe a faixa');
await p.getByRole('button', { name: 'Fechar histórico' }).tap();

await p.reload();
await p.getByRole('button', { name: /Ritmo da furadeira/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'vista uma vez, a faixa nao volta ao recarregar');

/* ------------------------------------------------- 3. dispensar pelo × */
await p.evaluate((k) => localStorage.setItem(k, '2.0.0'), CHAVE);
await p.reload();
await faixa().waitFor({ timeout: 8000 });
await p.getByRole('button', { name: 'Dispensar aviso de atualização' }).tap();
checar(await faixa().count() === 0, 'dispensar pelo × recolhe a faixa');

await p.reload();
await p.getByRole('button', { name: /Ritmo da furadeira/ }).waitFor({ timeout: 8000 });
checar(await faixa().count() === 0, 'dispensada tambem conta como vista apos recarregar');

/* ---------------- 4. versao NOVA no ar enquanto o app esta aberto */
/**
 * O tablet do posto fica aberto o dia inteiro e nao sabe que houve deploy:
 * segue rodando o bundle que baixou de manha. O app pergunta ao servidor
 * (versao.json) e avisa — sem nunca recarregar sozinho, porque o analista
 * pode estar no meio de um cadastro.
 */
{
  const faixaNova = p.locator('[aria-label="Nova versão disponível"]');

  // Mesma versao no ar: nada a dizer.
  await p.route('**/versao.json**', (r) => r.fulfill({
    contentType: 'application/json', body: JSON.stringify({ versao: VERSAO }),
  }));
  await p.evaluate(([k, v]) => localStorage.setItem(k, v), [CHAVE, VERSAO]);
  await p.reload();
  await p.getByRole('button', { name: /Ritmo da furadeira/ }).waitFor({ timeout: 8000 });
  await p.waitForTimeout(600);
  checar(await faixaNova.count() === 0, 'versao igual a do servidor: sem aviso');

  // Servidor com versao diferente: avisa e oferece recarregar.
  await p.unroute('**/versao.json**');
  await p.route('**/versao.json**', (r) => r.fulfill({
    contentType: 'application/json', body: JSON.stringify({ versao: '99.0.0' }),
  }));
  await p.reload();
  await faixaNova.waitFor({ timeout: 8000 });
  checar(true, 'versao nova no ar: o app avisa sem precisar recarregar antes');
  const textoFaixa = await faixaNova.innerText();
  checar(new RegExp(`v${VERSAO.replace(/\./g, '\\.')}`).test(textoFaixa),
    'a faixa diz qual versao voce esta usando');
  checar(/nada do que já foi salvo se perde/i.test(textoFaixa),
    'tranquiliza sobre o que ja foi salvo');
  checar(await faixaNova.getByRole('button', { name: 'Atualizar agora' }).count() === 1,
    'oferece "Atualizar agora"');

  // Nunca recarrega sozinho: "Agora não" tira a faixa do caminho.
  await faixaNova.getByRole('button', { name: 'Agora não' }).click();
  checar(await faixaNova.count() === 0, '"Agora não" adia sem recarregar');

  // Resposta invalida (rewrite devolvendo index.html) nao pode inventar aviso.
  await p.unroute('**/versao.json**');
  await p.route('**/versao.json**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }));
  await p.reload();
  await p.getByRole('button', { name: /Ritmo da furadeira/ }).waitFor({ timeout: 8000 });
  await p.waitForTimeout(600);
  checar(await faixaNova.count() === 0, 'resposta que nao e JSON: cala a boca em vez de inventar');
}

checar(erros.length === 0, `sem erro de pagina (${erros.join('; ') || 'nenhum'})`);

await navegador.close();
process.exit(falhas ? 1 : 0);
