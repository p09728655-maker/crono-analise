/**
 * "Esqueci minha senha" — o que estes testes guardam.
 *
 * Recuperacao de senha e' o unico caminho do sistema em que alguem entra SEM
 * saber a senha. As propriedades abaixo sao o que impede esse caminho de
 * virar porta lateral, e nenhuma delas aparece na tela:
 *
 *  - so' recebe link quem JA' PODIA ENTRAR. Analista cadastrado sem senha
 *    existe como identidade e nao abre login (api/usuarios.js); se o link
 *    chegasse nele, ele criaria a propria senha e entraria sozinho;
 *  - a resposta nunca diz se o e-mail existe — nem por conteudo, nem por
 *    codigo de status. Distinguir entregaria a lista de quem tem acesso;
 *  - a sessao so' e' guardada DEPOIS que a senha muda de verdade, e nunca no
 *    tablet pareado, que tem conta propria de papel 'coletor';
 *  - o token do link nao fica na barra de endereco.
 *
 * Rodam sem DOM e sem banco: fetch, window/localStorage e o `sql` do
 * servidor sao dublados aqui.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GUARDA = 'ritmopatrimar.auth';
const APARELHO = 'ritmopatrimar.aparelho';
const ORIGEM = 'https://ritmo.patrimar.app';

/**
 * O `sql` do servidor, dublado: guarda a consulta que o endpoint monta e
 * devolve o que o cenario mandar. Precisa de vi.hoisted porque a fabrica do
 * vi.mock sobe para o topo do arquivo.
 */
const banco = vi.hoisted(() => ({ consultas: [], resultado: [] }));
vi.mock('../api/_lib/db.js', () => ({
  sql: (partes, ...valores) => {
    banco.consultas.push({ texto: partes.join(' ? '), valores });
    return Promise.resolve(banco.resultado);
  },
}));

/** Navegador de mentira: localStorage, location e history. */
function prepararNavegador({ hash = '', pareado = false, caminho = '/', busca = '' } = {}) {
  const guardado = new Map();
  if (pareado) {
    guardado.set(APARELHO, JSON.stringify({
      email: 'coletor-x@dispositivo.ritmopatrimar.app', senha: 's',
    }));
  }
  globalThis.localStorage = {
    getItem: (c) => (guardado.has(c) ? guardado.get(c) : null),
    setItem: (c, v) => guardado.set(c, v),
    removeItem: (c) => guardado.delete(c),
  };
  globalThis.window = {
    location: { origin: ORIGEM, hash, pathname: caminho, search: busca },
    history: {
      replaceState: vi.fn(() => { globalThis.window.location.hash = ''; }),
    },
    dispatchEvent: vi.fn(),
  };
  return guardado;
}

/** Resposta do GoTrue. */
const resposta = (status, corpo = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

/**
 * Reimporta o modulo do zero: a leitura do fragmento e' memorizada no escopo
 * do modulo (o React chama o componente duas vezes em desenvolvimento) e
 * precisa ser descartada entre cenarios.
 */
async function carregarModulo() {
  vi.resetModules();
  return import('../src/lib/supabase.js');
}

beforeEach(() => {
  prepararNavegador();
  globalThis.fetch = vi.fn(async () => resposta(200));
  banco.consultas = [];
  banco.resultado = [];
});

/* ----------------------------------------------- o pedido, no servidor */

/** req/res da Vercel, no minimo que este endpoint usa. */
const fingirReq = (corpo, metodo = 'POST') => ({ method: metodo, body: corpo, query: {} });

function fingirRes() {
  return {
    statusCode: 0,
    corpo: null,
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
  };
}

async function pedirNoServidor(corpo, metodo) {
  const { default: endpoint } = await import('../api/sessao.js');
  const res = fingirRes();
  await endpoint(fingirReq(corpo, metodo), res);
  return res;
}

describe('pedir o link (api/sessao.js)', () => {
  const PEDIDO = { acao: 'recuperar-senha', email: 'ppcp@patrimarmoveis.com.br', destino: `${ORIGEM}/` };

  it('conta que ja podia entrar recebe o link, com a volta para o proprio site', async () => {
    banco.resultado = [{ id: 'u1' }];

    const res = await pedirNoServidor(PEDIDO);

    expect(res.statusCode).toBe(200);
    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/auth/v1/recover?redirect_to=');
    expect(url).toContain(encodeURIComponent(`${ORIGEM}/`));
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body)).toEqual({ email: PEDIDO.email });
  });

  it('e-mail que nao pode entrar NAO recebe link — e a resposta e a mesma', async () => {
    // Sem senha, inativo, coletor ou inexistente: a consulta nao devolve
    // linha, e e' isso que separa "existe" de "pode entrar".
    banco.resultado = [];

    const res = await pedirNoServidor(PEDIDO);

    expect(res.statusCode).toBe(200);
    expect(res.corpo).toEqual({ ok: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('a consulta exige senha cadastrada, conta ativa e que nao seja tablet', async () => {
    // Estrutural de proposito: sao os filtros que impedem o link de virar
    // cadastro de senha para quem o administrador nao autorizou.
    await pedirNoServidor(PEDIDO);

    const [{ texto }] = banco.consultas;
    expect(texto).toMatch(/encrypted_password\s*<>\s*''/);
    expect(texto).toMatch(/u\.ativo/);
    expect(texto).toMatch(/papel\s*<>\s*'coletor'/);
    expect(texto).toMatch(/lower\(u\.email\)\s*=\s*lower/);
  });

  it('falha no envio nao vira resposta diferente — senao ela denuncia quem existe', async () => {
    banco.resultado = [{ id: 'u1' }];
    globalThis.fetch = vi.fn(async () => resposta(500, { msg: 'Error sending recovery email' }));

    const res = await pedirNoServidor(PEDIDO);

    expect(res.statusCode).toBe(200);
    expect(res.corpo).toEqual({ ok: true });
  });

  it('pedido sem e-mail nao consulta banco nem envia nada', async () => {
    const res = await pedirNoServidor({ acao: 'recuperar-senha' });

    expect(res.statusCode).toBe(200);
    expect(banco.consultas).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('o caminho publico so abre para a acao de recuperar', async () => {
    // POST sem a acao continua sendo o bundle velho pedindo login aqui — e
    // continua levando 410. Sem isto, dobrar a recuperacao dentro do
    // endpoint de sessao teria aberto uma porta sem autenticacao.
    const res = await pedirNoServidor({ email: 'ppcp@patrimarmoveis.com.br' });

    expect(res.statusCode).toBe(410);
    expect(banco.consultas).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------- a volta do link */

describe('a volta do link', () => {
  const FRAGMENTO = '#access_token=tok-123&refresh_token=ref-456&expires_in=3600&type=recovery';

  it('le a sessao do fragmento e apaga o token da barra de endereco', async () => {
    prepararNavegador({ hash: FRAGMENTO, caminho: '/analise', busca: '?aba=paradas' });
    const { recuperacaoPendente } = await carregarModulo();

    const rec = recuperacaoPendente();

    expect(rec.access).toBe('tok-123');
    expect(rec.refresh).toBe('ref-456');
    expect(rec.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // O endereco reescrito e' o que prova a limpeza: mantem a pagina e a
    // consulta e nao carrega mais o token. Verificar so' que replaceState
    // foi chamado deixaria passar uma reescrita com o token dentro.
    const [, , endereco] = globalThis.window.history.replaceState.mock.calls[0];
    expect(endereco).toBe('/analise?aba=paradas');
    expect(endereco).not.toContain('tok-123');
  });

  it('a segunda leitura devolve o mesmo, mesmo com o fragmento ja apagado', async () => {
    prepararNavegador({ hash: FRAGMENTO });
    const { recuperacaoPendente } = await carregarModulo();

    expect(recuperacaoPendente()).toEqual(recuperacaoPendente());
    expect(recuperacaoPendente().access).toBe('tok-123');
  });

  it('encerrada a recuperacao, ela nao volta a abrir sozinha', async () => {
    prepararNavegador({ hash: FRAGMENTO });
    const { limparRecuperacao, recuperacaoPendente } = await carregarModulo();

    recuperacaoPendente();
    limparRecuperacao();

    expect(recuperacaoPendente()).toBeNull();
  });

  it('link vencido vira aviso legivel, nao tela de senha', async () => {
    prepararNavegador({ hash: '#error=access_denied&error_code=otp_expired' });
    const { recuperacaoPendente } = await carregarModulo();

    const rec = recuperacaoPendente();
    expect(rec.access).toBeUndefined();
    expect(rec.erro).toMatch(/expirou/i);
  });

  it('abertura normal do sistema nao tem recuperacao nenhuma', async () => {
    const { recuperacaoPendente } = await carregarModulo();
    expect(recuperacaoPendente()).toBeNull();
  });
});

/* ------------------------------------------------- gravar a senha nova */

describe('gravar a senha nova', () => {
  const DADOS = { access: 'tok-123', refresh: 'ref-456', exp: 9_999_999_999 };

  it('troca a senha no GoTrue com o token do link e ja deixa a pessoa dentro', async () => {
    const guardado = prepararNavegador();
    globalThis.fetch = vi.fn(async () => resposta(200, { id: 'u1' }));
    const { definirSenhaComToken } = await carregarModulo();

    const { entrou } = await definirSenhaComToken(DADOS, 'SenhaNova123');

    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/auth/v1/user');
    expect(opcoes.method).toBe('PUT');
    expect(opcoes.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(opcoes.body)).toEqual({ password: 'SenhaNova123' });
    expect(entrou).toBe(true);
    expect(JSON.parse(guardado.get(GUARDA)).access).toBe('tok-123');
  });

  it('derruba as outras sessoes junto — quem troca a senha desconfia dela', async () => {
    globalThis.fetch = vi.fn(async () => resposta(200, {}));
    const { definirSenhaComToken } = await carregarModulo();

    await definirSenhaComToken(DADOS, 'SenhaNova123');

    const chamadas = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(chamadas.some((u) => u.includes('/auth/v1/logout?scope=others'))).toBe(true);
  });

  it('no tablet pareado a senha muda, mas o aparelho NAO vira a pessoa', async () => {
    // O tablet compartilhado tem conta propria de papel 'coletor'. Adotar
    // aqui a sessao de quem abriu o e-mail deixaria o aparelho do chao de
    // fabrica rodando com o papel dessa pessoa.
    const guardado = prepararNavegador({ pareado: true });
    globalThis.fetch = vi.fn(async () => resposta(200, { id: 'u1' }));
    const { definirSenhaComToken } = await carregarModulo();

    const { entrou } = await definirSenhaComToken(DADOS, 'SenhaNova123');

    expect(entrou).toBe(false);
    expect(guardado.has(GUARDA)).toBe(false);
    expect(guardado.has(APARELHO)).toBe(true);
  });

  it('se a troca falha, NAO guarda sessao — o link nao entra sem trocar senha', async () => {
    const guardado = prepararNavegador();
    globalThis.fetch = vi.fn(async () => resposta(401, { msg: 'invalid token' }));
    const { definirSenhaComToken } = await carregarModulo();

    await expect(definirSenhaComToken(DADOS, 'SenhaNova123')).rejects.toThrow(/expirou/i);
    expect(guardado.has(GUARDA)).toBe(false);
  });

  it('senha fraca e recusada em portugues, nao no ingles do GoTrue', async () => {
    globalThis.fetch = vi.fn(async () => resposta(422, {
      error_code: 'weak_password', msg: 'Password is too weak',
    }));
    const { definirSenhaComToken } = await carregarModulo();

    await expect(definirSenhaComToken(DADOS, '12345678')).rejects.toThrow(/senha fraca/i);
  });

  it('repetir a senha atual e recusado com a razao certa', async () => {
    globalThis.fetch = vi.fn(async () => resposta(422, { error_code: 'same_password' }));
    const { definirSenhaComToken } = await carregarModulo();

    await expect(definirSenhaComToken(DADOS, 'SenhaAntiga1'))
      .rejects.toThrow(/diferente da atual/i);
  });
});

describe('a entrada normal continua como estava', () => {
  it('credencial errada nao ganhou mensagem nova por causa da recuperacao', async () => {
    globalThis.fetch = vi.fn(async () => resposta(400, { error_code: 'invalid_credentials' }));
    const { entrarComEmail } = await carregarModulo();

    await expect(entrarComEmail('ppcp@patrimarmoveis.com.br', 'errada'))
      .rejects.toThrow('E-mail ou senha não confere');
  });

  it('token vencido renova por POST — mexer no chamarAuth nao mudou o refresh', async () => {
    // A refatoracao que deu metodo e mensagem ao chamarAuth passa por aqui:
    // renovacao e' o caminho mais usado do arquivo e o que ninguem ve quando
    // quebra — o app so' desloga sozinho.
    const guardado = prepararNavegador();
    guardado.set(GUARDA, JSON.stringify({ access: 'velho', refresh: 'r1', exp: 1 }));
    globalThis.fetch = vi.fn(async () => resposta(200, {
      access_token: 'novo', refresh_token: 'r2', expires_in: 3600,
    }));
    const { tokenDeAcesso } = await carregarModulo();

    expect(await tokenDeAcesso()).toBe('novo');
    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('grant_type=refresh_token');
    expect(opcoes.method).toBe('POST');
  });

  it('sem sessao, o tablet pareado continua entrando sozinho', async () => {
    prepararNavegador({ pareado: true });
    globalThis.fetch = vi.fn(async () => resposta(200, {
      access_token: 'a', refresh_token: 'r', expires_in: 3600,
    }));
    const { tokenDeAcesso } = await carregarModulo();

    expect(await tokenDeAcesso()).toBe('a');
  });

  it('entrada certa guarda a sessao', async () => {
    const guardado = prepararNavegador();
    globalThis.fetch = vi.fn(async () => resposta(200, {
      access_token: 'a', refresh_token: 'r', expires_in: 3600,
    }));
    const { entrarComEmail } = await carregarModulo();

    await entrarComEmail('ppcp@patrimarmoveis.com.br', 'certa');
    expect(JSON.parse(guardado.get(GUARDA)).access).toBe('a');
  });
});
