/**
 * O programa da embalagem lido da planilha — contra um Postgres real.
 *
 * O Google e' um `fetch` de mentira (token + values:batchGet); o resto e'
 * o caminho de producao: a rota /api/maquinas?demanda=1, a autenticacao
 * (o tablet entra como COLETOR, que a RLS nao deixa escrever programa), a
 * gravacao fora da RLS e o que a resposta diz para a tela.
 *
 * Pula automaticamente se TEST_DATABASE_URL nao estiver definida.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

const URL_TESTE = process.env.TEST_DATABASE_URL;
const rodar = URL_TESTE ? describe : describe.skip;

process.env.SUPABASE_URL = 'https://supabase.teste.local';

// Empresas proprias: o outro arquivo de integracao apaga as dele.
const EMPRESA = '22222222-2222-2222-2222-222222222222';
const OUTRA = '88888888-8888-8888-8888-888888888888';
const TOKEN = 'token-de-servico-planilha';
const PLANILHA = '1W9bK_IoWknk8eKFbSWCMxILAQcaXuWD2gG7B0jcwFzg';

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenDe(usuarioId) {
  const cab = b64u({ alg: 'ES256', kid: 'kid-planilha', typ: 'JWT' });
  const corpo = b64u({
    iss: 'https://supabase.teste.local/auth/v1', aud: 'authenticated', role: 'authenticated',
    sub: usuarioId, exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const ass = sign('sha256', Buffer.from(`${cab}.${corpo}`), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${cab}.${corpo}.${ass.toString('base64url')}`;
}

const req = ({
  metodo = 'GET', corpo, query = {}, token = TOKEN,
} = {}) => ({ method: metodo, body: corpo, query, headers: { authorization: `Bearer ${token}` } });
function res() {
  return {
    statusCode: 0, corpo: null,
    status(c) { this.statusCode = c; return this; },
    setHeader() { return this; },
    end(t) { this.corpo = t ? JSON.parse(t) : null; return this; },
  };
}

/* As datas da planilha andam com o dia do teste: a janela gravada e' a
   semana atual e as quatro anteriores. */
const UM_DIA = 86400000;
const EPOCA_SHEETS = Date.UTC(1899, 11, 30);
const hoje = new Date();
const segundaAtual = (() => {
  const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()));
  return new Date(d.getTime() - (((d.getUTCDay() || 7) - 1) * UM_DIA));
})();
const segunda = (semanas) => new Date(segundaAtual.getTime() + (semanas * 7 * UM_DIA));
const iso = (d) => d.toISOString().slice(0, 10);
const serial = (d) => Math.round((d.getTime() - EPOCA_SHEETS) / UM_DIA);
const CAB = ['Lote', 'Data', 'Ordem', 'Codigo', 'Descricao', 'Qtd_cx'];
const linha = (lote, dia, qtd) => [String(lote), serial(dia), '1', `501.${lote}`, 'VOL 1/1 X', qtd];

let maquinasApi;
let semanaIso;
let sql;
let esquecer;
let esquecerToken;
let grupoEmb;
let grupoFur;
let grupoOutra;
let coletorId;
let abas;
let chamadasGoogle;
let respostaGoogle;

rodar('Programa da embalagem lido da planilha — integracao', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;
    process.env.API_TOKEN = TOKEN;
    process.env.EMPRESA_ID = EMPRESA;
    process.env.PROGRAMA_EMBALAGEM_PLANILHA = `https://docs.google.com/spreadsheets/d/${PLANILHA}/edit`;
    process.env.GOOGLE_CONTA_SERVICO = JSON.stringify({
      client_email: 'ritmo@teste.iam.gserviceaccount.com',
      private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });

    ({ sql } = await import('../api/_lib/db.js'));
    const { _definirJwks } = await import('../api/_lib/jwt.js');
    _definirJwks([{ ...ec.publicKey.export({ format: 'jwk' }), kid: 'kid-planilha', alg: 'ES256' }]);
    maquinasApi = (await import('../api/maquinas.js')).default;
    ({ semanaIso } = await import('../src/domain/demanda/calendario.js'));
    esquecer = (await import('../api/_lib/programaEmbalagem.js'))._esquecer;
    esquecerToken = (await import('../api/_lib/planilhaGoogle.js'))._esquecerToken;

    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA})`;
    await sql`INSERT INTO empresas (id, nome) VALUES (${EMPRESA}, 'Patrimar Planilha'), (${OUTRA}, 'Outra Fabrica')`;
    [{ id: grupoEmb }] = await sql`
      INSERT INTO grupos_maquina (empresa_id, codigo, nome) VALUES (${EMPRESA}, '0005', 'EMBALAGEM') RETURNING id`;
    [{ id: grupoFur }] = await sql`
      INSERT INTO grupos_maquina (empresa_id, codigo, nome) VALUES (${EMPRESA}, '0002', 'FURADEIRA') RETURNING id`;
    [{ id: grupoOutra }] = await sql`
      INSERT INTO grupos_maquina (empresa_id, codigo, nome) VALUES (${OUTRA}, '0005', 'EMBALAGEM') RETURNING id`;

    coletorId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (${coletorId}, 'authenticated', 'authenticated', 'tablet@planilha.com', '', now(), now(), '', '', '', '')`;
    await sql`
      INSERT INTO usuarios (id, empresa_id, nome, email, papel)
      VALUES (${coletorId}, ${EMPRESA}, 'Tablet embalagem', 'tablet@planilha.com', 'coletor')`;

    vi.stubGlobal('fetch', async (url) => {
      chamadasGoogle.push(String(url));
      if (String(url).includes('oauth2')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tk', expires_in: 3600 }) };
      }
      const r = respostaGoogle || {
        status: 200, corpo: { valueRanges: [{ values: abas.PROGRAMACAO }, { values: abas.PROGRAMACAO_CONCLUIDA }] },
      };
      return { ok: r.status < 400, status: r.status, json: async () => r.corpo };
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql`DELETE FROM auth.users WHERE id = ${coletorId}`;
    await sql`DELETE FROM empresas WHERE id IN (${EMPRESA}, ${OUTRA})`;
    await sql.end();
  });

  beforeEach(async () => {
    esquecer();
    esquecerToken();
    chamadasGoogle = [];
    respostaGoogle = null;
    await sql`DELETE FROM demanda_semanal WHERE empresa_id IN (${EMPRESA}, ${OUTRA})`;
    // Esta semana: 300 em aberto + 200 ja' concluidos. A anterior: 1.000.
    abas = {
      PROGRAMACAO: [CAB, linha(1, segunda(0), 300)],
      PROGRAMACAO_CONCLUIDA: [CAB, linha(2, segunda(0), 200), linha(3, new Date(segunda(-1).getTime() + UM_DIA), 1000)],
    };
  });

  const programa = async (grupo, token = tokenDe(coletorId)) => {
    const r = res();
    await maquinasApi(req({ query: { demanda: '1', grupo }, token }), r);
    return r;
  };
  const semanaDe = (r, inicio) => r.corpo.demandas.find((d) => d.inicio === iso(inicio));

  it("o tablet (coletor) pede o programa e recebe a planilha ja' gravada: as duas abas, por semana", async () => {
    const r = await programa(grupoEmb);
    expect(r.statusCode).toBe(200);
    expect(semanaDe(r, segunda(0))?.pecas).toBe(500);
    expect(semanaDe(r, segunda(-1))?.pecas).toBe(1000);
    // Os dias programados vao junto: o takt usa as horas so' desses dias.
    expect(semanaDe(r, segunda(0))?.dias).toBe(1);
    expect(r.corpo.planilha).toMatchObject({
      estado: 'ok', ativa: true, grupoId: grupoEmb, semanas: 2, linhas: 3, mudaram: 2,
      ignoradas: { semData: 0, semQuantidade: 0, duplicadas: 0 }, conflitos: [],
    });
    expect(chamadasGoogle).toHaveLength(2); // token + planilha
  });

  it("semana congelada com o MESMO numero (outra numeracao) nao e' sobrescrita: a da planilha fica de fora, dita", async () => {
    const { ano, numero } = semanaIso(new Date(`${iso(segunda(0))}T12:00:00Z`));
    await sql`
      INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas, inicio)
      VALUES (${EMPRESA}, ${grupoEmb}, ${ano}, ${numero}, 7200, ${iso(segunda(-10))})`;
    const r = await programa(grupoEmb);
    expect(semanaDe(r, segunda(-10))?.pecas, 'a congelada continua com o programa dela').toBe(7200);
    expect(semanaDe(r, segunda(0)), 'a da planilha nao entra por cima').toBeUndefined();
    expect(r.corpo.planilha).toMatchObject({ estado: 'ok', semanas: 1, conflitos: [iso(segunda(0))] });
  });

  it("aba PROGRAMACAO vazia (lida no meio de uma edicao) nao derruba a semana para so' o concluido", async () => {
    await programa(grupoEmb);
    esquecer();
    abas.PROGRAMACAO = [CAB];
    const r = await programa(grupoEmb);
    expect(r.corpo.planilha.estado).toBe('erro');
    expect(r.corpo.planilha.mensagem).toMatch(/aba PROGRAMACAO veio sem nenhum lote/);
    expect(semanaDe(r, segunda(0))?.pecas).toBe(500);
  });

  it("planilha falhando: a idade vem do banco; colar segue recusado, e so' a semana colada se apaga", async () => {
    const boa = await programa(grupoEmb);
    esquecer(); // outra instancia: sem memoria da leitura boa
    esquecerToken();
    respostaGoogle = { status: 403, corpo: { error: { message: 'The caller does not have permission' } } };
    const r = await programa(grupoEmb);
    expect(r.corpo.planilha).toMatchObject({ estado: 'erro', ativa: true });
    expect(new Date(r.corpo.planilha.lidaEm).getTime())
      .toBeGreaterThanOrEqual(new Date(boa.corpo.planilha.lidaEm).getTime() - 5000);
    const chamadas = chamadasGoogle.length;

    // A colagem traz o codigo do PCP ("043-26" e' a semana de 26/10, que no
    // ISO e' a 44): gravada, ela cairia por cima da semana ISO 43. Recusada,
    // com a leitura falhando tambem — e a recusa nao vai ao Google.
    const { ano, numero } = semanaIso(new Date(`${iso(segunda(-1))}T12:00:00Z`));
    const colar = res();
    await maquinasApi(req({
      metodo: 'POST', query: { demanda: '1', grupo: grupoEmb },
      corpo: { semanas: [{ ano, numero, pecas: 9999, inicio: iso(segunda(0)) }] },
    }), colar);
    expect(colar.statusCode).toBe(409);
    expect(semanaDe(await programa(grupoEmb), segunda(-1))?.pecas, 'a semana ISO de mesmo numero intacta').toBe(1000);
    expect(chamadasGoogle).toHaveLength(chamadas);

    // Apagar: a semana lida da planilha, nao (409); a colada (sem dias), sim.
    const apagarLida = res();
    await maquinasApi(req({
      metodo: 'DELETE', query: { demanda: '1', grupo: grupoEmb, ano: String(ano), numero: String(numero) },
    }), apagarLida);
    expect(apagarLida.statusCode).toBe(409);
    await sql`
      INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas, inicio)
      VALUES (${EMPRESA}, ${grupoEmb}, 2000, 5, 4242, ${iso(segunda(-10))})`;
    const apagarColada = res();
    await maquinasApi(req({
      metodo: 'DELETE', query: { demanda: '1', grupo: grupoEmb, ano: '2000', numero: '5' },
    }), apagarColada);
    expect(apagarColada.statusCode).toBe(200);
    expect(semanaDe(apagarColada, segunda(-10))).toBeUndefined();
  });

  it("semana colada SEM data no grupo da planilha: a de mesmo numero recebe a da planilha; a outra sai", async () => {
    const { ano, numero } = semanaIso(new Date(`${iso(segunda(0))}T12:00:00Z`));
    await sql`
      INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas) VALUES
        (${EMPRESA}, ${grupoEmb}, ${ano}, ${numero}, 4242),
        (${EMPRESA}, ${grupoEmb}, 2000, 9, 31)`;
    const r = await programa(grupoEmb);
    expect(semanaDe(r, segunda(0)), 'mesmo numero: vira a semana da planilha, com data e dias')
      .toMatchObject({ pecas: 500, dias: 1 });
    expect(r.corpo.demandas.filter((d) => !d.inicio), 'sem data nao fica no grupo da planilha').toHaveLength(0);
    expect(r.corpo.planilha).toMatchObject({ estado: 'ok', conflitos: [] });
  });

  it("com a planilha lida, apagar o programa do grupo tambem e' recusado", async () => {
    await programa(grupoEmb);
    const apagar = res();
    await maquinasApi(req({ metodo: 'DELETE', query: { demanda: '1', grupo: grupoEmb, tudo: '1' } }), apagar);
    expect(apagar.statusCode).toBe(409);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM demanda_semanal WHERE grupo_id = ${grupoEmb}`;
    expect(n).toBe(2);
  });

  it('dentro de 10 minutos le do banco, sem ir ao Google; releitura igual nao muda nada', async () => {
    await programa(grupoEmb);
    const segunda2 = await programa(grupoEmb);
    expect(chamadasGoogle).toHaveLength(2);
    expect(segunda2.corpo.planilha.estado).toBe('ok');
    esquecer();
    const terceira = await programa(grupoEmb);
    expect(terceira.corpo.planilha.mudaram).toBe(0);
  });

  it('na janela a planilha manda; semana antiga fica como estava', async () => {
    const antiga = segunda(-10);
    await sql`
      INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas, inicio) VALUES
        (${EMPRESA}, ${grupoEmb}, 2000, 1, 777, ${iso(segunda(-2))}),
        (${EMPRESA}, ${grupoEmb}, 2000, 3, 888, ${iso(segunda(6))}),
        (${EMPRESA}, ${grupoEmb}, 2000, 2, 4321, ${iso(antiga)})`;
    // A planilha tambem traz a semana antiga — com outro numero.
    abas.PROGRAMACAO_CONCLUIDA.push(linha(9, antiga, 5));
    const r = await programa(grupoEmb);
    expect(semanaDe(r, segunda(-2)), 'colada a mao, dentro da janela, sem lote na planilha: sai').toBeUndefined();
    expect(semanaDe(r, segunda(6)), 'futura colada a mao, sem lote na planilha: sai').toBeUndefined();
    expect(semanaDe(r, antiga)?.pecas, 'fora da janela: intocada').toBe(4321);
    expect(r.corpo.demandas.filter((d) => d.inicio === iso(antiga))).toHaveLength(1);
  });

  it('planilha recusada: o programa guardado continua, e a resposta diz o motivo', async () => {
    await programa(grupoEmb);
    esquecer();
    esquecerToken();
    respostaGoogle = { status: 403, corpo: { error: { message: 'The caller does not have permission' } } };
    const r = await programa(grupoEmb);
    expect(r.statusCode).toBe(200);
    expect(semanaDe(r, segunda(0))?.pecas).toBe(500);
    expect(r.corpo.planilha).toMatchObject({ estado: 'erro', grupoId: grupoEmb });
    expect(r.corpo.planilha.mensagem).toMatch(/compartilhe com ritmo@teste\.iam\.gserviceaccount\.com/);
  });

  it('planilha sem nenhum lote recente nao apaga o programa', async () => {
    await programa(grupoEmb);
    esquecer();
    abas = { PROGRAMACAO: [CAB, linha(8, segunda(-21), 30)], PROGRAMACAO_CONCLUIDA: [CAB, linha(9, segunda(-20), 50)] };
    const r = await programa(grupoEmb);
    expect(r.corpo.planilha.estado).toBe('erro');
    expect(r.corpo.planilha.mensagem).toMatch(/não tem lote programado desde/);
    expect(semanaDe(r, segunda(0))?.pecas).toBe(500);
  });

  it('configuracao quebrada: a embalagem ouve o motivo (sem travar a colagem); a furadeira, nada', async () => {
    const guardada = process.env.GOOGLE_CONTA_SERVICO;
    process.env.GOOGLE_CONTA_SERVICO = '{nao e json';
    try {
      const emb = await programa(grupoEmb);
      expect(emb.corpo.planilha).toMatchObject({ estado: 'erro', ativa: false, grupoId: grupoEmb });
      expect(emb.corpo.planilha.mensagem).toMatch(/não é um JSON válido/);
      const fur = await programa(grupoFur);
      expect(fur.corpo.planilha).toBeUndefined();
      const colar = res();
      await maquinasApi(req({
        metodo: 'POST', query: { demanda: '1', grupo: grupoEmb },
        corpo: { semanas: [{ ano: 2026, numero: 40, pecas: 100 }] },
      }), colar);
      expect(colar.statusCode, 'parada, a planilha nao manda: a colagem segue aberta').toBe(201);
      expect(chamadasGoogle).toHaveLength(0);
    } finally {
      process.env.GOOGLE_CONTA_SERVICO = guardada;
    }
  });

  it('o programa de outro grupo nao le a planilha nem fala dela', async () => {
    const r = await programa(grupoFur);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.planilha).toBeUndefined();
    expect(chamadasGoogle).toHaveLength(0);
  });

  it("colar programa no grupo da planilha e' recusado com o motivo; nos outros grupos, segue", async () => {
    const semanas = [{ ano: 2026, numero: 40, pecas: 100, inicio: iso(segunda(0)) }];
    const naEmbalagem = res();
    await maquinasApi(req({ metodo: 'POST', query: { demanda: '1', grupo: grupoEmb }, corpo: { semanas } }), naEmbalagem);
    expect(naEmbalagem.statusCode).toBe(409);
    expect(naEmbalagem.corpo.erro).toMatch(/vem da planilha/);
    const naFuradeira = res();
    await maquinasApi(req({ metodo: 'POST', query: { demanda: '1', grupo: grupoFur }, corpo: { semanas } }), naFuradeira);
    expect(naFuradeira.statusCode).toBe(201);
  });

  it('outra empresa no mesmo banco: a planilha desta fabrica nao entra no programa dela', async () => {
    const alheioId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change)
      VALUES (${alheioId}, 'authenticated', 'authenticated', 'pcp@outra.com', '', now(), now(), '', '', '', '')`;
    await sql`
      INSERT INTO usuarios (id, empresa_id, nome, email, papel)
      VALUES (${alheioId}, ${OUTRA}, 'PCP da outra', 'pcp@outra.com', 'analista')`;
    try {
      const r = await programa(grupoOutra, tokenDe(alheioId));
      expect(r.statusCode).toBe(200);
      expect(r.corpo.planilha).toBeUndefined();
      expect(chamadasGoogle).toHaveLength(0);
      const [{ n }] = await sql`SELECT count(*)::int AS n FROM demanda_semanal WHERE empresa_id = ${OUTRA}`;
      expect(n).toBe(0);
    } finally {
      await sql`DELETE FROM auth.users WHERE id = ${alheioId}`;
    }
  });
});
