/**
 * "Esqueci minha senha" — o que estes testes guardam.
 *
 * Recuperacao de senha e' o unico caminho do sistema em que alguem entra
 * SEM saber a senha. As tres propriedades abaixo sao o que impede esse
 * caminho de virar porta lateral, e nenhuma delas aparece na tela:
 *
 *  - a tela nunca diz se o e-mail existe (o servidor responde igual para
 *    cadastrado e nao cadastrado — dizer entregaria a lista de quem tem
 *    acesso);
 *  - falha de ENVIO nao pode virar promessa de e-mail enviado: a pessoa
 *    ficaria esperando em vez de chamar o administrador;
 *  - a sessao so' e' guardada DEPOIS que a senha muda de verdade. Guardar
 *    antes deixaria quem abriu o link dentro do sistema sem trocar nada.
 *
 * Rodam sem DOM: o modulo fala com o GoTrue por fetch e com o navegador
 * por window/localStorage, e os tres sao dublados aqui.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const GUARDA = 'ritmopatrimar.auth';
const ORIGEM = 'https://ritmo.patrimar.app';

/** Navegador de mentira: localStorage, location e history. */
function prepararNavegador({ hash = '' } = {}) {
  const guardado = new Map();
  globalThis.localStorage = {
    getItem: (c) => (guardado.has(c) ? guardado.get(c) : null),
    setItem: (c, v) => guardado.set(c, v),
    removeItem: (c) => guardado.delete(c),
  };
  globalThis.window = {
    location: { origin: ORIGEM, hash, pathname: '/', search: '' },
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
 * Reimporta o modulo do zero: a leitura do fragmento e' memorizada no
 * escopo do modulo (o React chama o componente duas vezes em
 * desenvolvimento) e precisa ser descartada entre cenarios.
 */
async function carregarModulo() {
  vi.resetModules();
  return import('../src/lib/supabase.js');
}

beforeEach(() => {
  prepararNavegador();
  globalThis.fetch = vi.fn(async () => resposta(200));
});

describe('pedir o link de recuperacao', () => {
  it('chama o /recover do GoTrue mandando de volta para o proprio site', async () => {
    const { pedirRecuperacao } = await carregarModulo();

    await pedirRecuperacao('ppcp@patrimarmoveis.com.br');

    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/auth/v1/recover?redirect_to=');
    expect(url).toContain(encodeURIComponent(`${ORIGEM}/`));
    expect(opcoes.method).toBe('POST');
    expect(JSON.parse(opcoes.body)).toEqual({ email: 'ppcp@patrimarmoveis.com.br' });
  });

  it('e-mail nao cadastrado nao se distingue de cadastrado', async () => {
    // O GoTrue responde 200 para os dois casos, de proposito. O teste fixa
    // que nao ha' tratamento nosso reintroduzindo a diferenca.
    const { pedirRecuperacao } = await carregarModulo();
    await expect(pedirRecuperacao('ninguem@patrimarmoveis.com.br')).resolves.toBeUndefined();
  });

  it('sem servidor de e-mail, diz que o envio falhou — nao promete link', async () => {
    globalThis.fetch = vi.fn(async () => resposta(500, { msg: 'Error sending recovery email' }));
    const { pedirRecuperacao } = await carregarModulo();

    await expect(pedirRecuperacao('ppcp@patrimarmoveis.com.br'))
      .rejects.toThrow(/envio de e-mail nao esta funcionando/i);
  });

  it('pedido repetido em seguida vira "espere e tente de novo"', async () => {
    // O GoTrue tem dois limites que respondem 429 — por e-mail (segundos) e
    // por projeto (hora). A mensagem nao promete prazo que ela nao sabe.
    globalThis.fetch = vi.fn(async () => resposta(429, { error_code: 'over_email_send_rate_limit' }));
    const { pedirRecuperacao } = await carregarModulo();

    await expect(pedirRecuperacao('ppcp@patrimarmoveis.com.br'))
      .rejects.toThrow(/espere alguns minutos/i);
  });
});

describe('a volta do link', () => {
  const FRAGMENTO = '#access_token=tok-123&refresh_token=ref-456&expires_in=3600&type=recovery';

  it('le a sessao do fragmento e apaga o token da barra de endereco', async () => {
    prepararNavegador({ hash: FRAGMENTO });
    const { recuperacaoPendente } = await carregarModulo();

    const rec = recuperacaoPendente();

    expect(rec.access).toBe('tok-123');
    expect(rec.refresh).toBe('ref-456');
    expect(rec.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(globalThis.window.history.replaceState).toHaveBeenCalled();
    expect(globalThis.window.location.hash).toBe('');
  });

  it('a segunda leitura devolve o mesmo, mesmo com o fragmento ja apagado', async () => {
    prepararNavegador({ hash: FRAGMENTO });
    const { recuperacaoPendente } = await carregarModulo();

    expect(recuperacaoPendente()).toEqual(recuperacaoPendente());
    expect(recuperacaoPendente().access).toBe('tok-123');
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

describe('gravar a senha nova', () => {
  const DADOS = { access: 'tok-123', refresh: 'ref-456', exp: 9_999_999_999 };

  it('troca a senha no GoTrue com o token do link e ja deixa a pessoa dentro', async () => {
    const guardado = prepararNavegador();
    globalThis.fetch = vi.fn(async () => resposta(200, { id: 'u1' }));
    const { definirSenhaComToken } = await carregarModulo();

    await definirSenhaComToken(DADOS, 'SenhaNova123');

    const [url, opcoes] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/auth/v1/user');
    expect(opcoes.method).toBe('PUT');
    expect(opcoes.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(opcoes.body)).toEqual({ password: 'SenhaNova123' });
    expect(JSON.parse(guardado.get(GUARDA)).access).toBe('tok-123');
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
      .rejects.toThrow('E-mail ou senha nao confere');
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
