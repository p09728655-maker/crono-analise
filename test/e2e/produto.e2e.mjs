/**
 * O PRODUTO DA MEDICAO (v2.97.0) — cadastrado no tablet antes de medir,
 * corrigido no PC depois.
 *
 * O servidor e' simulado: o que se prova e' o caminho na tela. No tablet,
 * o nome que nao esta' na lista vai para o cadastro do grupo da maquina,
 * entra na lista na hora e e' o que a medicao leva; o nome que ja' esta'
 * la' e' escolhido sem ir ao servidor; sem rede, o aviso aparece e o nome
 * segue como texto. No PC, a lista da Embalagem Takt Time corrige o
 * produto da medicao — sozinha ou com as outras do mesmo nome — e a lista
 * muda sem F5.
 *
 * Uso: npm run dev (porta 5199) e depois node test/e2e/produto.e2e.mjs
 */
import { chromium } from 'playwright';
import { semearSessao } from './_sessao.mjs';

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const FOTOS = process.env.E2E_FOTOS || null;

let falhas = 0;
const checar = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) falhas++; };

const EMB = {
  id: '00000000-0000-0000-0000-0000000000e1', codigo: '0005', nome: 'EMBALAGEM',
  horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5,
};
const FUR = { id: '00000000-0000-0000-0000-0000000000f1', codigo: '0002', nome: 'FURADEIRA', horas_semana: null };
const MAQ_EMB = {
  id: '00000000-0000-0000-0000-0000000000a1', nome: 'EMBALAGEM 01', ativa: true,
  grupo_id: EMB.id, grupo_codigo: EMB.codigo, grupo_nome: EMB.nome,
};
const MAQ_FUR = {
  id: '00000000-0000-0000-0000-0000000000a2', nome: 'FURADEIRA 03', ativa: true,
  grupo_id: FUR.id, grupo_codigo: FUR.codigo, grupo_nome: FUR.nome,
};
const cadastroCom = (produtos) => ({ maquinas: [MAQ_EMB, MAQ_FUR], grupos: [FUR, EMB], produtos });

/**
 * `cadastro`: o que o GET devolve. `aoCriar(corpo)`: a resposta do POST de
 * produto (padrao: 201 com o produto). `aoSincronizar`, `aoRenomear`: o que
 * subiu pelo sync e os PATCH de conferencia.
 */
async function simularServidor(pagina, {
  cadastro, aoCriar, criados = [], enviados = [], conferencias = [], renomeios = [], recusarRenomeio = false,
}) {
  await pagina.route('**/api/maquinas**', (rota) => {
    const url = rota.request().url();
    if (/demanda=1/.test(url)) return rota.fulfill({ json: { demandas: [] } });
    if (/produtos=1/.test(url) && rota.request().method() === 'POST') {
      const corpo = rota.request().postDataJSON();
      criados.push(corpo);
      if (aoCriar) return aoCriar(rota, corpo);
      return rota.fulfill({
        status: 201, json: { produto: { id: `p-${criados.length}`, nome: corpo.nome, codigo: null, ativo: true, grupo_id: corpo.grupoId } },
      });
    }
    return rota.fulfill({ json: cadastro });
  });
  await pagina.route('**/api/motivos-parada**', (rota) => rota.fulfill({ json: { motivos: [] } }));
  await pagina.route('**/api/conferencias**', (rota) => {
    const req = rota.request();
    if (req.method() === 'PATCH') {
      const id = new URL(req.url()).searchParams.get('id');
      const corpo = req.postDataJSON();
      renomeios.push({ id, corpo });
      if (recusarRenomeio) return rota.fulfill({ status: 403, json: { erro: 'Seu papel nao permite esta operacao' } });
      return rota.fulfill({ json: id ? { conferencia: { id, peca: corpo.peca } } : { atualizadas: corpo.ids.length, peca: corpo.peca } });
    }
    return rota.fulfill({ json: { conferencias, outras: 0 } });
  });
  await pagina.route('**/api/sync**', (rota) => {
    const corpo = rota.request().postDataJSON();
    enviados.push(...(corpo.conferencias || []));
    const clientIds = [...(corpo.conferencias || []), ...(corpo.observacoes || [])].map((x) => x.clientId);
    return rota.fulfill({ json: { recebidos: clientIds.length, novos: clientIds.length, clientIds } });
  });
}

const navegador = await chromium.launch({ executablePath: EXEC });
const erros = [];
const tabletNovo = async (opcoes) => {
  const ctx = await navegador.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true });
  const pagina = await ctx.newPage();
  await semearSessao(pagina);
  pagina.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(pagina, opcoes);
  return { ctx, pagina };
};

/* ===================== TABLET: grupo sem produto, cadastra antes de medir */
{
  const criados = [];
  const enviados = [];
  const { ctx, pagina: t } = await tabletNovo({ cadastro: cadastroCom([]), criados, enviados });
  await t.goto(`${BASE}/coleta/embalagem`);
  const texto = t.locator('input[aria-label="Produto embalado"]');
  await texto.waitFor({ timeout: 8000 });
  checar(await t.getByRole('button', { name: /Cadastrar/ }).count() === 0, 'campo vazio: sem botao de cadastrar');
  await texto.fill('  Penteadeira   Princesa ');
  const botao = t.getByRole('button', { name: /Cadastrar «Penteadeira Princesa» no grupo EMBALAGEM/ });
  checar(await botao.count() === 1, 'nome digitado: o botao diz o nome e o grupo para onde ele vai');
  checar(/entra na lista do grupo em todos os tablets, e só o PCP corrige ou desativa/.test(await t.locator('body').innerText())
    && /Sem cadastrar, o nome vai só nesta medição/.test(await t.locator('body').innerText()),
  'a dica diz o que cadastrar muda, que so o PCP desfaz, e que sem cadastrar o nome vai so nesta');
  if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-cadastrar-produto.png` });
  await botao.tap();
  const lista = t.locator('select[aria-label="Produto embalado"]');
  await lista.waitFor({ timeout: 4000 });
  checar(criados.length === 1 && criados[0].nome === 'Penteadeira Princesa' && criados[0].grupoId === EMB.id
    && !('codigo' in criados[0]),
  `o cadastro vai ao servidor com o nome aparado, o grupo da embalagem e sem codigo (${JSON.stringify(criados[0])})`);
  checar(await lista.inputValue() === 'Penteadeira Princesa', 'cadastrado, ele vira a lista, ja escolhido');
  checar(await t.getByRole('status').filter({ hasText: /Penteadeira Princesa» cadastrado na lista do grupo EMBALAGEM/ }).count() === 1,
    'a tela confirma o cadastro, com o grupo');
  if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-produto-cadastrado.png` });

  // Mede com ele: o produto escolhido antes e' o que a medicao leva.
  await t.getByRole('button', { name: /INICIAR/ }).click();
  const largada = t.getByRole('button', { name: /Largada/ });
  await largada.waitFor({ timeout: 4000 });
  await t.waitForTimeout(300);
  await largada.dispatchEvent('pointerdown');
  const alvo = t.getByRole('button', { name: 'Contar um volume' });
  await alvo.waitFor({ timeout: 4000 });
  await t.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await alvo.dispatchEvent('pointerdown');
    await t.waitForTimeout(260);
  }
  await t.getByRole('button', { name: /Encerrar/ }).click();
  await t.locator('[aria-label="Resultado da conferência"]').waitFor({ timeout: 4000 });
  checar(await t.locator('select[aria-label="Produto embalado"]').inputValue() === 'Penteadeira Princesa',
    'no resultado, o produto cadastrado continua escolhido');
  await t.getByRole('button', { name: /salvar conferência/i }).click();
  for (let i = 0; i < 40 && !enviados.length; i++) await t.waitForTimeout(150);
  checar(enviados[0]?.peca === 'Penteadeira Princesa', `a medicao sobe com o produto cadastrado (${enviados[0]?.peca})`);

  // Recarregada a tela sem rede para o cadastro, a lista guardada ja' tem o produto.
  await t.route('**/api/maquinas**', (rota) => rota.abort('internetdisconnected'));
  await t.goto(`${BASE}/coleta/embalagem`);
  const depois = t.locator('select[aria-label="Produto embalado"]');
  await depois.waitFor({ timeout: 8000 });
  checar((await depois.locator('option').allInnerTexts()).includes('Penteadeira Princesa'),
    'sem rede depois: a lista guardada no tablet ja traz o produto cadastrado');
  await ctx.close();
}

/* ============ TABLET: nome que ja esta no cadastro, desativado, sem rede */
{
  const criados = [];
  const produtos = [
    { id: 'p1', nome: 'Rack Sirius 1.6', codigo: '12345', grupo_id: EMB.id, ativo: true },
    { id: 'p2', nome: 'Rack Antigo', codigo: null, grupo_id: EMB.id, ativo: false },
  ];
  const { ctx, pagina: t } = await tabletNovo({
    cadastro: cadastroCom(produtos), criados,
    aoCriar: (rota) => rota.abort('internetdisconnected'),
  });
  await t.goto(`${BASE}/coleta/embalagem`);
  const lista = t.locator('select[aria-label="Produto embalado"]');
  await lista.waitFor({ timeout: 8000 });
  const opcoes = await lista.locator('option').allInnerTexts();
  checar(opcoes.includes('Outro produto (digitar ou cadastrar)…'), 'a saida da lista diz que da para cadastrar');
  await lista.selectOption('__outro');
  const texto = t.locator('input[aria-label="Produto embalado"]');

  // O comeco da digitacao nao oferece cadastro: um toque sem querer em
  // "+ Cadastrar «Ra»" ficaria na lista de todos os tablets.
  await texto.fill('Ra');
  checar(await t.getByRole('button', { name: /Cadastrar/ }).count() === 0, 'com 2 letras, sem botao de cadastrar');

  // Ja' na lista, com outra grafia: o botao NAO promete cadastro, oferece o da lista.
  await texto.fill('rack  sirius 1.6');
  checar(await t.getByRole('button', { name: /Cadastrar/ }).count() === 0
    && await t.getByText(/entra na lista do grupo/).count() === 0,
  'nome que ja esta na lista com outra grafia: nada de "+ Cadastrar", nem a dica de cadastro');
  await t.getByRole('button', { name: 'Usar «Rack Sirius 1.6» da lista' }).tap();
  await lista.waitFor({ timeout: 4000 });
  checar(await lista.inputValue() === 'Rack Sirius 1.6' && criados.length === 0,
    '"Usar da lista": escolhe o produto com a grafia do cadastro, sem ir ao servidor');

  // Desativado pelo PCP: nao volta pelo tablet; a medicao segue com o nome.
  await lista.selectOption('__outro');
  await texto.fill('RACK ANTIGO');
  await t.getByRole('button', { name: /Cadastrar «RACK ANTIGO»/ }).tap();
  const aviso = t.getByRole('alert').filter({ hasText: /desativado pelo PCP/ });
  await aviso.waitFor({ timeout: 4000 });
  checar(await texto.inputValue() === 'Rack Antigo' && criados.length === 0,
    'desativado: o nome fica com a grafia do cadastro, como texto, e nada vai ao servidor');
  checar(await t.getByRole('button', { name: /Cadastrar/ }).count() === 0,
    'desativado: o botao some — tocar de novo so repetiria a recusa');

  // Sem rede: o aviso aparece colado ao campo e o nome digitado fica.
  await texto.fill('Rack Lua');
  checar(await aviso.count() === 0, 'mudou o nome: o aviso do nome anterior some');
  await t.getByRole('button', { name: /Cadastrar «Rack Lua»/ }).tap();
  const semRede = t.getByRole('alert').filter({ hasText: /Sem rede/ });
  await semRede.waitFor({ timeout: 4000 });
  checar(await texto.inputValue() === 'Rack Lua' && criados.length === 1,
    'sem rede: tentou uma vez, avisa, e o nome segue no campo para a medicao');
  checar(!(await t.getByRole('button', { name: /INICIAR/ }).isDisabled()), 'sem rede: a medicao comeca do mesmo jeito');
  if (FOTOS) await t.screenshot({ path: `${FOTOS}/tablet-cadastrar-sem-rede.png` });
  await ctx.close();
}

/* =========== TABLET: Ritmo da maquina — so cadastra com a maquina do cadastro */
{
  const criados = [];
  const { ctx, pagina: r } = await tabletNovo({ cadastro: cadastroCom([]), criados });
  await r.goto(`${BASE}/coleta/rapida`);
  const peca = r.locator('input[aria-label="Nome da peça"]');
  await peca.waitFor({ timeout: 8000 });
  await peca.fill('Lateral Mesa');
  checar(await r.getByRole('button', { name: /Cadastrar/ }).count() === 0,
    'sem maquina escolhida nao ha grupo: a peca fica so como texto, sem botao de cadastrar');
  await r.locator('select[aria-label="Máquina"]').selectOption('FURADEIRA 03');
  const botao = r.getByRole('button', { name: /Cadastrar «Lateral Mesa» no grupo FURADEIRA/ });
  await botao.waitFor({ timeout: 4000 });
  await botao.tap();
  await r.locator('select[aria-label="Nome da peça"]').waitFor({ timeout: 4000 });
  checar(criados[0]?.grupoId === FUR.id, 'escolhida a furadeira, a peca vai para o grupo FURADEIRA');
  await ctx.close();
}

/* ======================================== PC: editar o produto da medicao */
{
  const agora = Date.now();
  const marcas = [0, 60000, 120000, 180000];
  const base = {
    maquina: 'EMBALAGEM 01', duracao_ms: 300000, pecas: marcas.length, ciclos_por_peca: 1, furacao_passante: false,
    arquivada: false, com_marcas: true, paradas: [], observacao: '',
  };
  const quando = (h) => ({
    iniciado_em: new Date(agora - h * 3600000).toISOString(),
    finalizado_em: new Date(agora - h * 3600000 + 300000).toISOString(),
    salvo_em: new Date(agora - h * 3600000 + 300000).toISOString(),
  });
  const conferencias = [
    { ...base, ...quando(1), id: '00000000-0000-0000-0000-00000000c0a1', peca: 'Penteadeira Princeza' },
    { ...base, ...quando(2), id: '00000000-0000-0000-0000-00000000c0a2', peca: 'penteadeira princeza ' },
    { ...base, ...quando(3), id: '00000000-0000-0000-0000-00000000c0a3', peca: '' },
    // Outra maquina, mesmo nome: a correcao da embalagem nunca a alcanca.
    { ...base, ...quando(4), id: '00000000-0000-0000-0000-00000000c0a4', maquina: 'FURADEIRA 03', peca: 'Penteadeira Princeza' },
  ];
  const renomeios = [];
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  await semearSessao(p);
  p.on('pageerror', (e) => erros.push(e.message));
  await simularServidor(p, {
    cadastro: cadastroCom([
      { id: 'p1', nome: 'Penteadeira Princeza', codigo: null, grupo_id: EMB.id, ativo: true },
      { id: 'p2', nome: 'Penteadeira Princesa', codigo: '4410', grupo_id: EMB.id, ativo: true },
      { id: 'p3', nome: 'Lateral Mesa', codigo: null, grupo_id: FUR.id, ativo: true },
    ]),
    conferencias, renomeios,
  });
  await p.goto(`${BASE}/analise/embalagem`);
  const tabela = p.locator('[aria-label="Medições da embalagem"]');
  await tabela.locator('table').waitFor({ timeout: 8000 });
  // As linhas: a 1a (Penteadeira Princeza) e a 3a (sem produto) da lista.
  const editar = (n) => tabela.locator('tbody tr').nth(n).getByRole('button', { name: /o produto da medição de/ });
  checar(await editar(0).innerText() === 'Editar produto' && await editar(2).innerText() === 'Informar produto'
    && /^Informar o produto da medição de \d{2}\/\d{2}\/\d{4}/.test(await editar(2).getAttribute('aria-label')),
  'PC: cada medicao da embalagem tem como corrigir o produto (e informar, quando veio sem)');

  // A medicao abre pela linha; o editar NAO abre a linha.
  await editar(0).click();
  const janela = p.getByRole('dialog', { name: 'Produto da medição' });
  await janela.waitFor({ timeout: 4000 });
  checar(await p.locator('.embalagem-detalhe').count() === 0, 'editar o produto nao abre o volume a volume da linha');
  checar(/4 volumes/.test(await janela.innerText()), 'a janela fala em volumes, nao em pecas');
  const sugestoes = await p.locator('#pecas-ja-medidas option').evaluateAll((os) => os.map((o) => o.value));
  checar(sugestoes.includes('Penteadeira Princesa') && !sugestoes.includes('Lateral Mesa'),
    `os nomes sugeridos trazem o cadastro da embalagem, nao o da furadeira (${sugestoes.join(' | ')})`);
  const campo = janela.locator('input[aria-label="Nome do produto"]');
  // Correcao so' de caixa: e' o MESMO produto do cadastro — nada de mandar
  // desativar o certo.
  await campo.fill('PENTEADEIRA PRINCEZA');
  checar(/As 2 medições/.test(await janela.innerText()) && !/cadastro de produtos/.test(await janela.innerText()),
    'correcao so de caixa: renomeia as 2, sem aviso de cadastro');
  await campo.fill('Penteadeira Princesa');
  const textoJanela = (await janela.innerText()).replace(/\s+/g, ' ');
  checar(/As 2 medições que hoje se chamam «Penteadeira Princeza» passam a se chamar «Penteadeira Princesa»/.test(textoJanela),
    `o lote e so o da embalagem: 2 medicoes, nao a da furadeira (${textoJanela.slice(0, 160)})`);
  checar(/estão os dois no cadastro de produtos\. Se forem o mesmo produto, desative «Penteadeira Princeza» em Produtos da embalagem/.test(textoJanela),
    'troca de produto com os dois nomes no cadastro: a janela diz, condicional, para desativar o errado, e onde');
  if (FOTOS) await p.screenshot({ path: `${FOTOS}/pc-editar-produto.png` });
  await janela.getByRole('button', { name: 'Renomear as 2 medições' }).click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  checar(renomeios.length === 1 && renomeios[0].id === null
    && JSON.stringify([...renomeios[0].corpo.ids].sort()) === JSON.stringify([conferencias[0].id, conferencias[1].id].sort())
    && renomeios[0].corpo.peca === 'Penteadeira Princesa',
  `um PATCH em lote com as 2 medicoes da embalagem (${JSON.stringify(renomeios[0])})`);
  checar(await tabela.getByRole('button', { name: 'Penteadeira Princesa', exact: true }).count() === 2
    && await tabela.getByText('Penteadeira Princeza').count() === 0,
  'a lista mostra o nome novo na hora, sem F5');

  // A recusa aparece na janela, onde se clicou — e a janela fica aberta.
  await p.unrouteAll({ behavior: 'ignoreErrors' });
  await simularServidor(p, { cadastro: cadastroCom([]), conferencias, renomeios, recusarRenomeio: true });
  await editar(2).click();
  await janela.waitFor({ timeout: 4000 });
  checar(/Esta medição passa de/.test(await janela.innerText()) === false, 'sem nome digitado ainda, nada a confirmar');
  await campo.fill('Rack Lua');
  await janela.getByRole('button', { name: 'Renomear' }).click();
  await janela.getByRole('alert').waitFor({ timeout: 4000 });
  checar(/não permite/i.test(await janela.getByRole('alert').innerText()) || /nao permite/.test(await janela.getByRole('alert').innerText()),
    'recusado: o motivo aparece na janela, e ela fica aberta');
  checar(renomeios.at(-1)?.id === conferencias[2].id, 'a medicao sem nome vai sozinha (PATCH da medicao, nao lote)');
  await janela.getByRole('button', { name: 'Cancelar' }).click();
  await janela.waitFor({ state: 'detached', timeout: 4000 });
  await ctx.close();
}

checar(erros.length === 0, `sem erro de pagina${erros.length ? `: ${erros[0]}` : ''}`);
await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
