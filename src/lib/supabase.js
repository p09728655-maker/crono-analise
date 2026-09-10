/**
 * Sessao no Supabase Auth — o dono oficial de senha e sessao.
 *
 * O navegador fala DIRETO com o /auth/v1 do projeto: entrar, renovar e
 * sair nao passam pela nossa API. O que a API recebe e' o token de acesso
 * resultante, que ela verifica sozinha (assinatura publica) e repassa ao
 * banco para as politicas de RLS avaliarem.
 *
 * Sem dependencia nova, de proposito: sao tres chamadas HTTP com corpo
 * fixo — o SDK inteiro do Supabase para isso seria carregar um caminhao
 * para entregar um envelope, no mesmo espirito do scrypt feito com o
 * crypto do Node no servidor.
 *
 * A URL e a chave publicavel ficam NO CODIGO: sao identificadores publicos
 * por desenho (todo app Supabase os entrega ao navegador). O que protege
 * os dados e' a senha de cada um e a RLS — nunca estes dois valores.
 */

const URL_SUPABASE = import.meta.env?.VITE_SUPABASE_URL
  || 'https://meqjsdrgwnupvreghxgm.supabase.co';
const CHAVE_PUBLICAVEL = import.meta.env?.VITE_SUPABASE_KEY
  || 'sb_publishable_PxLuVvLDpq1OQVqTBt3OAg_s1jz1jpF';

const GUARDA_SESSAO = 'ritmopatrimar.auth';
const GUARDA_APARELHO = 'ritmopatrimar.aparelho';

/** Margem antes do vencimento: renovar em cima da hora e' pedir 401. */
const MARGEM_S = 60;

export class ErroDeEntrada extends Error {}

/* ------------------------------------------------------- armazenamento */

const ler = (chave) => {
  try { return JSON.parse(localStorage.getItem(chave)) || null; } catch { return null; }
};

function guardar(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, JSON.stringify(valor));
    else localStorage.removeItem(chave);
  } catch { /* sem localStorage: a sessao dura o que durar a aba */ }
  // Mesma aba nao recebe o evento 'storage' do navegador — este aviso e' o
  // que faz a porta de entrada do App reagir na hora a entrar e sair.
  try { window.dispatchEvent(new Event('ritmopatrimar-sessao')); } catch { /* teste sem DOM */ }
}

export const temSessao = () => Boolean(ler(GUARDA_SESSAO)?.access);
export const aparelhoPareado = () => Boolean(ler(GUARDA_APARELHO)?.email);

/* ------------------------------------------------------ conversa GoTrue */

async function chamarAuth(caminho, {
  corpo, token, metodo = 'POST', mensagem400 = 'E-mail ou senha nao confere',
} = {}) {
  const resposta = await fetch(`${URL_SUPABASE}/auth/v1${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      apikey: CHAVE_PUBLICAVEL,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados = {};
  try { dados = await resposta.json(); } catch { /* logout devolve corpo vazio */ }
  if (!resposta.ok) {
    // O status e o codigo viajam junto com a mensagem: quem chama precisa
    // distinguir 'senha errada' de 'o servidor de e-mail nao respondeu' —
    // sao dois problemas com donos diferentes.
    const codigo = dados.error_code || dados.error || '';
    const erro = (m) => Object.assign(new ErroDeEntrada(m), { status: resposta.status, codigo });
    // Uma mensagem so' para credencial errada, como sempre foi: distinguir
    // entregaria de graca quais e-mails existem.
    if (resposta.status === 400 || codigo === 'invalid_credentials' || codigo === 'invalid_grant') {
      throw erro(mensagem400);
    }
    throw erro(dados.msg || dados.error_description || 'Nao deu para entrar agora. Tente de novo.');
  }
  return dados;
}

function sessaoDe(dados) {
  return {
    access: dados.access_token,
    refresh: dados.refresh_token,
    // expires_at vem em segundos de epoch; o fallback cobre GoTrue antigo.
    exp: dados.expires_at || Math.floor(Date.now() / 1000) + (dados.expires_in || 3600),
  };
}

export async function entrarComEmail(email, senha) {
  const dados = await chamarAuth('/token?grant_type=password', {
    corpo: { email, password: senha },
  });
  guardar(GUARDA_SESSAO, sessaoDe(dados));
}

export async function sairDaConta() {
  const sessao = ler(GUARDA_SESSAO);
  // O apagar local acontece de qualquer jeito, mesmo se a rede falhar: o
  // computador da sala nao pode continuar identificado como quem acabou de
  // sair. A sessao orfa no servidor vence sozinha.
  guardar(GUARDA_SESSAO, null);
  if (sessao?.access) {
    try { await chamarAuth('/logout', { token: sessao.access }); } catch { /* segue */ }
  }
}

/* ------------------------------------------------- esqueci minha senha */

/**
 * Pede o e-mail com o link de recuperacao.
 *
 * O GoTrue responde OK mesmo para e-mail que nao existe, de proposito — e'
 * a mesma razao da mensagem unica de credencial errada: responder "este
 * e-mail nao esta cadastrado" entregaria de graca a lista de quem tem
 * acesso. Por isso a tela promete "SE estiver cadastrado", nunca "enviamos".
 *
 * O que ele nao esconde e' falha no ENVIO. Projeto sem servidor de e-mail
 * proprio responde com erro aqui, e a tela tem de dizer isso: prometer um
 * e-mail que nunca sai e' pior que nao ter o botao — a pessoa fica
 * esperando em vez de chamar o administrador.
 *
 * O `redirect_to` precisa estar na lista de URLs autorizadas do projeto
 * (Authentication > URL Configuration). Fora da lista, o GoTrue manda o
 * link para a Site URL e a pessoa cai em outro endereco.
 */
export async function pedirRecuperacao(email) {
  const destino = `${window.location.origin}/`;
  try {
    await chamarAuth(`/recover?redirect_to=${encodeURIComponent(destino)}`, {
      corpo: { email },
      mensagem400: 'E-mail invalido',
    });
  } catch (e) {
    if (e.status === 429) {
      throw new ErroDeEntrada('Um link ja foi pedido ha pouco. Espere alguns minutos e tente de novo.');
    }
    if (e.status >= 500) {
      throw new ErroDeEntrada(
        'O envio de e-mail nao esta funcionando. Peca ao administrador para redefinir sua senha.',
      );
    }
    throw e;
  }
}

/**
 * A volta do link, lida do FRAGMENTO da URL (#access_token=...).
 *
 * Fragmento nao vai para servidor nenhum — nem para o nosso, nem para o
 * proxy da empresa, nem para o log do Vercel. E' por isso que o GoTrue
 * devolve a sessao ali e nao em parametro de consulta.
 *
 * Lido UMA vez por carregamento e apagado da barra de endereco na hora:
 * token em URL vira historico do navegador e print de tela em grupo de
 * mensagem. A leitura fica memorizada porque o React chama o componente
 * duas vezes em desenvolvimento — na segunda o fragmento ja' nao existe.
 *
 * Devolve `{ access, refresh, exp }` quando o link vale, `{ erro }` quando
 * o proprio GoTrue recusou (link vencido ou ja' usado) e null quando nao ha
 * recuperacao nenhuma em curso.
 */
let recuperacao;

export function recuperacaoPendente() {
  if (recuperacao !== undefined) return recuperacao;
  recuperacao = null;
  try {
    const bruto = window.location.hash || '';
    const p = new URLSearchParams(bruto.startsWith('#') ? bruto.slice(1) : bruto);
    const limpar = () => window.history.replaceState(
      null, '', window.location.pathname + window.location.search,
    );
    if (p.get('type') === 'recovery' && p.get('access_token')) {
      recuperacao = {
        access: p.get('access_token'),
        refresh: p.get('refresh_token'),
        exp: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600),
      };
      limpar();
    } else if (p.get('error') || p.get('error_code')) {
      // Link vencido e' o caso comum: o de recuperacao vale uma hora. Sem
      // esta mensagem a pessoa cai na tela de entrada sem entender por que
      // o link "nao fez nada".
      recuperacao = {
        erro: p.get('error_code') === 'otp_expired'
          ? 'O link expirou. Peca um novo em "Esqueci minha senha".'
          : 'O link nao vale mais. Peca um novo em "Esqueci minha senha".',
      };
      limpar();
    }
  } catch { /* sem DOM (teste) ou fragmento malformado: nao ha recuperacao */ }
  return recuperacao;
}

/**
 * Troca a senha com o token que veio no link.
 *
 * A sessao so' e' guardada DEPOIS que a senha muda. Guardar antes deixaria
 * quem abriu o link dentro do sistema sem trocar nada — o link de
 * recuperacao viraria uma porta lateral de entrada, valida por uma hora.
 */
export async function definirSenhaComToken(dados, senha) {
  try {
    await chamarAuth('/user', {
      metodo: 'PUT',
      token: dados.access,
      corpo: { password: senha },
      mensagem400: 'Nao deu para trocar a senha. Peca um link novo.',
    });
  } catch (e) {
    if (e.codigo === 'same_password') {
      throw new ErroDeEntrada('A senha nova precisa ser diferente da atual.');
    }
    // O minimo do projeto pode ser maior que o da tela; a recusa vem em
    // ingles do GoTrue e nao serve para quem esta' na fabrica.
    if (e.codigo === 'weak_password') {
      throw new ErroDeEntrada('Senha fraca demais. Use uma senha mais longa.');
    }
    if (e.status === 401 || e.status === 403) {
      throw new ErroDeEntrada('O link expirou. Peca um novo em "Esqueci minha senha".');
    }
    throw e;
  }
  guardar(GUARDA_SESSAO, { access: dados.access, refresh: dados.refresh, exp: dados.exp });
}

/* --------------------------------------------------- token para a API */

/**
 * Uma renovacao por vez: dez requisicoes simultaneas com token vencido
 * fariam dez refresh, e o GoTrue REVOGA a familia inteira quando ve o
 * mesmo refresh token usado duas vezes — o app se deslogaria sozinho.
 */
let renovando = null;

async function renovar(sessao) {
  renovando ??= (async () => {
    try {
      const dados = await chamarAuth('/token?grant_type=refresh_token', {
        corpo: { refresh_token: sessao.refresh },
      });
      guardar(GUARDA_SESSAO, sessaoDe(dados));
      return dados.access_token;
    } catch {
      guardar(GUARDA_SESSAO, null);
      return null;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

/**
 * Uma reentrada por vez, pelo mesmo motivo — e por um medido: o tablet
 * abria tres sessoes no MESMO milissegundo, porque as primeiras requisicoes
 * da tela pedem o token juntas e cada uma achava que precisava entrar.
 * Sessao a mais nao quebra nada, mas e' lixo no servidor por abertura.
 */
let entrando = null;

function entrarUmaVezSo(email, senha) {
  entrando ??= entrarComEmail(email, senha).finally(() => { entrando = null; });
  return entrando;
}

/**
 * O token de acesso valido — renovando ou reentrando quando preciso.
 *
 * No tablet pareado a credencial do APARELHO cobre qualquer falha de
 * renovacao: ele entra de novo sozinho, sem ninguem digitar nada. Se a
 * propria credencial for recusada, o aparelho foi revogado no PC — ai' o
 * pareamento local e' apagado e a tela de parear volta.
 */
export async function tokenDeAcesso() {
  const sessao = ler(GUARDA_SESSAO);
  const agora = Math.floor(Date.now() / 1000);

  if (sessao?.access && sessao.exp - MARGEM_S > agora) return sessao.access;

  if (sessao?.refresh) {
    const novo = await renovar(sessao);
    if (novo) return novo;
  }

  const aparelho = ler(GUARDA_APARELHO);
  if (aparelho?.email) {
    try {
      await entrarUmaVezSo(aparelho.email, aparelho.senha);
      return ler(GUARDA_SESSAO)?.access ?? null;
    } catch (e) {
      if (e instanceof ErroDeEntrada) guardar(GUARDA_APARELHO, null);
      return null;
    }
  }

  return null;
}

/* ------------------------------------------------------------ aparelho */

/** Guarda a credencial do tablet pareado e ja' entra com ela. */
export async function adotarCredencialDoAparelho({ email, senha }) {
  guardar(GUARDA_APARELHO, { email, senha });
  await entrarComEmail(email, senha);
}
