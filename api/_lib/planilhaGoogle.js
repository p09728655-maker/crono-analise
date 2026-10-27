/**
 * LEITURA DE PLANILHA DO GOOGLE pelo servidor, com CONTA DE SERVICO.
 *
 * Conta de servico, e nao "publicar na web": o programa de producao nao
 * pode ficar num endereco publico. A conta e' um usuario-robo do Google;
 * a planilha e' compartilhada com ela como LEITOR, e o escopo pedido aqui
 * e' so' leitura (spreadsheets.readonly) — mesmo com a chave na mao, ela
 * nao altera a planilha.
 *
 * Sem biblioteca do Google: o fluxo e' um JWT assinado em RS256 trocado por
 * um token de uma hora, e um GET. node:crypto faz a assinatura; o pacote
 * oficial traria dezenas de dependencias para isso.
 *
 * As celulas vem com UNFORMATTED_VALUE + SERIAL_NUMBER: data chega como
 * numero de serie (com o ANO — a aba PROGRAMACAO mostra "23/10", sem ano) e
 * quantidade chega como numero, sem depender do formato da celula.
 */
import { createSign } from 'node:crypto';

const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const URL_SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * O JSON da chave — o arquivo que o Google baixa ao criar a chave — vira
 * { email, chave }. Vai inteiro numa variavel so' de proposito: copiar
 * campo a campo e' onde a quebra de linha da chave privada se perde.
 */
export function lerContaServico(texto) {
  let obj;
  try {
    obj = typeof texto === 'string' ? JSON.parse(texto) : texto;
  } catch {
    throw new Error('GOOGLE_CONTA_SERVICO não é um JSON válido: cole o conteúdo inteiro do arquivo .json da chave');
  }
  const email = obj?.client_email;
  const chave = typeof obj?.private_key === 'string' ? obj.private_key.replace(/\\n/g, '\n') : '';
  if (!email || !/BEGIN PRIVATE KEY/.test(chave)) {
    throw new Error('GOOGLE_CONTA_SERVICO sem client_email ou private_key: cole o arquivo .json da chave, inteiro');
  }
  return { email, chave };
}

/** O ID da planilha, de um ID puro ou do endereco inteiro copiado do navegador. */
export function idDaPlanilha(valor) {
  const texto = String(valor || '').trim();
  const doEndereco = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(texto);
  if (doEndereco) return doEndereco[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(texto) ? texto : null;
}

const b64u = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

/** O JWT que a conta de servico apresenta ao Google, valido por uma hora. */
export function assinarJwt({ email, chave }, agoraS) {
  const cabecalho = b64u({ alg: 'RS256', typ: 'JWT' });
  const corpo = b64u({ iss: email, scope: ESCOPO, aud: URL_TOKEN, iat: agoraS, exp: agoraS + 3600 });
  const assinatura = createSign('RSA-SHA256').update(`${cabecalho}.${corpo}`).sign(chave);
  return `${cabecalho}.${corpo}.${assinatura.toString('base64url')}`;
}

/**
 * Token reaproveitado enquanto a instancia esta' quente: uma troca por
 * hora, nao uma por leitura. Sai um minuto antes de vencer.
 */
let tokenGuardado = null; // { email, token, venceEm }

/** So' para os testes. */
export function _esquecerToken() { tokenGuardado = null; }

async function obterToken(conta, { buscar, agora }) {
  if (tokenGuardado?.email === conta.email && tokenGuardado.venceEm - agora > 60000) {
    return tokenGuardado.token;
  }
  const r = await buscar(URL_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assinarJwt(conta, Math.floor(agora / 1000)),
    }).toString(),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || !corpo.access_token) {
    throw new Error(`O Google recusou a conta de serviço (${corpo.error_description || corpo.error || r.status}): `
      + 'confira a chave em GOOGLE_CONTA_SERVICO');
  }
  tokenGuardado = { email: conta.email, token: corpo.access_token, venceEm: agora + ((corpo.expires_in || 3600) * 1000) };
  return tokenGuardado.token;
}

/**
 * O motivo da recusa em portugues, dizendo O QUE FAZER: quem le e' o PCP
 * olhando o takt sumir, nao quem conhece a API do Google.
 */
function motivoDaRecusa(status, corpo, { email, abas }) {
  const msg = String(corpo?.error?.message || '');
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    return 'A Google Sheets API está desativada no projeto da conta de serviço: ative-a no Google Cloud';
  }
  if (status === 403) {
    return `A planilha não está compartilhada com a conta de serviço: compartilhe com ${email} (leitor)`;
  }
  if (status === 404) return 'Planilha não encontrada: confira o ID em PROGRAMA_EMBALAGEM_PLANILHA';
  if (status === 400 && /Unable to parse range/i.test(msg)) {
    // Pelo nome ENTRE ASPAS, como o Google escreve: "PROGRAMACAO" esta'
    // dentro de "PROGRAMACAO_CONCLUIDA", e o includes puro culpava a aba errada.
    const aba = abas.find((a) => msg.includes(`'${a}'`));
    return aba ? `A planilha não tem a aba ${aba}` : `A planilha não tem uma das abas ${abas.join(' / ')}`;
  }
  return `O Google respondeu ${status}${msg ? `: ${msg.slice(0, 200)}` : ''}`;
}

/**
 * As linhas de cada aba: { NOME_DA_ABA: [[celula, ...], ...] }, cabecalho
 * incluido. Uma requisicao so' para todas as abas (values:batchGet).
 *
 * `limiteMs` vale para a leitura INTEIRA (token + planilha): quem espera e'
 * uma requisicao de tela, e o Google lento nao pode prende-la.
 */
export async function lerAbas({
  conta, planilhaId, abas, buscar = fetch, agora = Date.now(), limiteMs = 6000,
}) {
  const sinal = AbortSignal.timeout(limiteMs);
  const comLimite = (url, opcoes = {}) => buscar(url, { ...opcoes, signal: sinal });
  try {
    const token = await obterToken(conta, { buscar: comLimite, agora });
    const params = new URLSearchParams({
      valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS',
    });
    abas.forEach((aba) => params.append('ranges', `'${aba}'`));
    const r = await comLimite(`${URL_SHEETS}/${encodeURIComponent(planilhaId)}/values:batchGet?${params}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 401) tokenGuardado = null;
    if (!r.ok) throw new Error(motivoDaRecusa(r.status, corpo, { email: conta.email, abas }));
    const porAba = {};
    (corpo.valueRanges || []).forEach((faixa, i) => { porAba[abas[i]] = faixa.values || []; });
    return porAba;
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error(`O Google não respondeu em ${Math.round(limiteMs / 1000)} s`);
    }
    throw e;
  }
}
