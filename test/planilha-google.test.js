/**
 * Leitura da planilha do Google com conta de servico — sem rede: o JWT e'
 * conferido com a chave publica do par gerado aqui, e o Google e' uma
 * funcao `buscar` que responde como ele.
 */
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  _esquecerToken, assinarJwt, idDaPlanilha, lerAbas, lerContaServico,
} from '../api/_lib/planilhaGoogle.js';

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = par.privateKey.export({ type: 'pkcs8', format: 'pem' });
const CONTA = { email: 'ritmo@projeto.iam.gserviceaccount.com', chave: PEM };
const ID = '1W9bK_IoWknk8eKFbSWCMxILAQcaXuWD2gG7B0jcwFzg';
const ABAS = ['PROGRAMACAO', 'PROGRAMACAO_CONCLUIDA'];

const resposta = (status, corpo) => ({ ok: status < 400, status, json: async () => corpo });

/** Um Google de mentira: conta as chamadas e responde o que o teste mandar. */
function google({ planilha = resposta(200, { valueRanges: [{ values: [['Data']] }, {}] }) } = {}) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (url.includes('oauth2')) return resposta(200, { access_token: 'tk-1', expires_in: 3600 });
    return typeof planilha === 'function' ? planilha(url, opcoes) : planilha;
  };
  return { buscar, chamadas };
}

beforeEach(() => _esquecerToken());

describe('conta de servico', () => {
  it('le o JSON da chave inteiro, com a quebra de linha escapada ou nao', () => {
    const json = JSON.stringify({ type: 'service_account', client_email: CONTA.email, private_key: PEM });
    expect(lerContaServico(json)).toEqual(CONTA);
    const escapada = json.replace(/\\n/g, '\\\\n');
    expect(lerContaServico(escapada).chave).toBe(PEM);
  });

  it("recusa o que nao e' a chave, dizendo o que colar", () => {
    expect(() => lerContaServico('{nao e json')).toThrow(/não é um JSON válido/);
    expect(() => lerContaServico('{"client_email":"x"}')).toThrow(/sem client_email ou private_key/);
  });

  it("o JWT e' RS256, so' leitura, e confere com a chave publica", () => {
    const jwt = assinarJwt(CONTA, 1800000000);
    const [cab, corpo, assinatura] = jwt.split('.');
    expect(JSON.parse(Buffer.from(cab, 'base64url'))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(corpo, 'base64url'))).toMatchObject({
      iss: CONTA.email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token', iat: 1800000000, exp: 1800003600,
    });
    const ok = createVerify('RSA-SHA256').update(`${cab}.${corpo}`)
      .verify(par.publicKey, Buffer.from(assinatura, 'base64url'));
    expect(ok).toBe(true);
  });
});

describe('idDaPlanilha', () => {
  it('aceita o ID puro ou o endereco copiado do navegador', () => {
    expect(idDaPlanilha(ID)).toBe(ID);
    expect(idDaPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(idDaPlanilha('planilha da embalagem')).toBeNull();
  });
});

describe('lerAbas', () => {
  it('pede as duas abas numa requisicao, com data em numero de serie, e devolve por aba', async () => {
    const g = google({
      planilha: resposta(200, { valueRanges: [{ values: [['Data'], [46321]] }, { values: [['DATA']] }] }),
    });
    const abas = await lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar });
    expect(abas).toEqual({ PROGRAMACAO: [['Data'], [46321]], PROGRAMACAO_CONCLUIDA: [['DATA']] });
    const url = new URL(g.chamadas[1].url);
    expect(url.pathname).toBe(`/v4/spreadsheets/${ID}/values:batchGet`);
    expect(url.searchParams.getAll('ranges')).toEqual(["'PROGRAMACAO'", "'PROGRAMACAO_CONCLUIDA'"]);
    expect(url.searchParams.get('valueRenderOption')).toBe('UNFORMATTED_VALUE');
    expect(url.searchParams.get('dateTimeRenderOption')).toBe('SERIAL_NUMBER');
    expect(g.chamadas[1].opcoes.headers.authorization).toBe('Bearer tk-1');
  });

  it('aba vazia vem como lista vazia, nao some', async () => {
    const g = google({ planilha: resposta(200, { valueRanges: [{ values: [['Data']] }, {}] }) });
    const abas = await lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar });
    expect(abas.PROGRAMACAO_CONCLUIDA).toEqual([]);
  });

  it('o token vale uma hora: a segunda leitura nao troca de novo', async () => {
    const g = google();
    await lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar, agora: 1000 });
    await lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar, agora: 1000 + 30 * 60000 });
    expect(g.chamadas.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);
    // Perto de vencer (menos de 1 min), troca.
    await lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar, agora: 1000 + 59.5 * 60000 });
    expect(g.chamadas.filter((c) => c.url.includes('oauth2'))).toHaveLength(2);
  });

  it('cada recusa do Google vira o que fazer, em portugues', async () => {
    const casos = [
      [403, 'The caller does not have permission', /compartilhe com ritmo@projeto\.iam\.gserviceaccount\.com \(leitor\)/],
      [403, 'Google Sheets API has not been used in project 123 before or it is disabled', /ative-a no Google Cloud/],
      [404, 'Requested entity was not found.', /confira o ID em PROGRAMA_EMBALAGEM_PLANILHA/],
      [400, "Unable to parse range: 'PROGRAMACAO_CONCLUIDA'", /não tem a aba PROGRAMACAO_CONCLUIDA/],
      [500, 'Internal error', /O Google respondeu 500: Internal error/],
    ];
    for (const [status, message, esperado] of casos) {
      const g = google({ planilha: resposta(status, { error: { message } }) });
      await expect(lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar: g.buscar })).rejects.toThrow(esperado);
    }
  });

  it('chave recusada pelo Google diz para conferir a variavel', async () => {
    const buscar = async () => resposta(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' });
    await expect(lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar }))
      .rejects.toThrow(/recusou a conta de serviço \(Invalid JWT Signature\.\): confira a chave em GOOGLE_CONTA_SERVICO/);
  });

  it('Google que nao responde nao prende a tela: desiste no limite', async () => {
    const buscar = (url, { signal }) => new Promise((_, rejeitar) => {
      signal.addEventListener('abort', () => rejeitar(signal.reason));
    });
    await expect(lerAbas({ conta: CONTA, planilhaId: ID, abas: ABAS, buscar, limiteMs: 50 }))
      .rejects.toThrow(/O Google não respondeu em 0 s/);
  });
});
