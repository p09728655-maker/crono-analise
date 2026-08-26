/**
 * Analise de cronoanalise com Claude — proxy servidor.
 *
 * Por que existe: no app anterior a chave da Anthropic ficava no
 * localStorage do navegador (`claudeApiKey`, "sk-ant-..."). Qualquer pessoa
 * com acesso ao PC ou tablet do chao de fabrica — ou qualquer extensao
 * instalada — conseguia ler a chave e gastar a cota da empresa. Aqui a chave
 * nunca sai do servidor.
 *
 * Decisao deliberada: este endpoint NAO aceita prompt livre do cliente. Ele
 * recebe apenas os numeros do estudo e monta o prompt aqui. Aceitar prompt
 * arbitrario transformaria o endpoint num proxy aberto de LLM para quem
 * tivesse o token do app.
 */
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '../_lib/db.js';
import { autenticar } from '../_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from '../_lib/http.js';
import { decimal, inteiro, lista, texto } from '../_lib/validar.js';

const MODELO = 'claude-opus-5';
const MAX_OPERACOES = 60;

const SISTEMA = `Voce e um engenheiro industrial senior especializado em cronoanalise e
balanceamento de linha em industria de moveis.

Analise os dados de estudo de tempos fornecidos e responda em portugues do Brasil.

Regras:
- Baseie-se SOMENTE nos numeros fornecidos. Nao invente dados.
- Se a amostra for pequena ou o CV% alto, diga explicitamente que a conclusao
  e' fragil e o que precisa ser coletado antes de decidir.
- Priorize acoes praticas de chao de fabrica, nao teoria.
- Seja direto. Sem preambulo.

Estruture a resposta em:
1. Diagnostico (3 a 5 linhas)
2. Gargalo e impacto na capacidade
3. Acoes recomendadas (maximo 5, ordenadas por impacto)
4. O que ainda falta medir`;

const SISTEMA_CONFERENCIA = `Voce e um engenheiro industrial senior especializado em analise de
capacidade e vazao de postos em industria de moveis.

Os dados sao CONFERENCIAS RAPIDAS: periodos observados num posto (hora inicial,
hora final, pecas produzidas). NAO sao estudo de tempos — nao ha fator de ritmo,
tolerancia nem tempo padrao. Fale em pecas/hora e ciclo medio, nunca em TO/TN/TP.

Regras:
- Baseie-se SOMENTE nos numeros fornecidos. Nao invente dados.
- Cada maquina traz "confiavel" e os motivos quando a amostra nao fecha os
  criterios (minimo de conferencias, tempo total observado, periodo minimo).
  Onde "confiavel" for falso, diga que o numero NAO serve de referencia ainda
  e o que falta medir — nao tire conclusao de capacidade dali.
- CV% alto entre conferencias significa ritmo instavel: aponte isso.
- Priorize acoes praticas de chao de fabrica, nao teoria.
- Seja direto. Sem preambulo.

Estruture a resposta em:
1. Leitura dos numeros (3 a 5 linhas)
2. Diferencas entre maquinas e entre pecas
3. Acoes recomendadas (maximo 5, ordenadas por impacto)
4. O que falta medir para virar referencia`;

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const { empresaId } = await autenticar(req);

  // Ambiente primeiro (configuracao do administrador); senao, a chave que o
  // usuario salvou pelo painel (tabela configuracoes).
  const chaveIa = process.env.ANTHROPIC_API_KEY || await chaveSalva(empresaId);
  if (!chaveIa) {
    throw new ErroHttp(503,
      'Análise por IA não configurada. Salve a chave da API na seção "Análise com IA" do painel.');
  }

  const corpo = await lerCorpo(req);

  // Duas formas de entrada, um endpoint: estudo (operacoes) e conferencia
  // rapida (maquinas). O prompt continua sendo montado AQUI nos dois casos —
  // aceitar texto livre transformaria isto num proxy aberto de LLM.
  if (corpo.maquinas) {
    return analisarConferencias(res, corpo, chaveIa);
  }

  const operacoes = lista(corpo.operacoes || [], 'operacoes', { max: MAX_OPERACOES });
  if (!operacoes.length) throw new ErroHttp(400, 'Envie ao menos uma operacao com dados');

  // Reduz ao minimo necessario: so' os indicadores agregados vao para a API.
  // Nenhum dado pessoal de operador trafega.
  const resumo = operacoes.map((op, i) => ({
    operacao: texto(op.nome, `operacoes[${i}].nome`, { obrigatorio: true, max: 200 }),
    observacoes: inteiro(op.n, `operacoes[${i}].n`, { min: 0, max: 100000, padrao: 0 }),
    tempoObservadoSeg: decimal(op.toSeg, `operacoes[${i}].toSeg`, { min: 0, padrao: 0 }),
    tempoNormalSeg: decimal(op.tnSeg, `operacoes[${i}].tnSeg`, { min: 0, padrao: 0 }),
    tempoPadraoSeg: decimal(op.tpSeg, `operacoes[${i}].tpSeg`, { min: 0, padrao: 0 }),
    cvPct: decimal(op.cvPct, `operacoes[${i}].cvPct`, { min: 0, padrao: 0 }),
    capacidadeHora: inteiro(op.cap, `operacoes[${i}].cap`, { min: 0, max: 1000000, padrao: 0 }),
    frPct: decimal(op.frPct, `operacoes[${i}].frPct`, { min: 0, padrao: 100 }),
    paradasSeg: decimal(op.paradasSeg, `operacoes[${i}].paradasSeg`, { min: 0, padrao: 0 }),
  }));

  const contexto = {
    estudo: texto(corpo.estudo, 'estudo', { max: 200 }),
    produto: texto(corpo.produto, 'produto', { max: 200 }),
    recurso: texto(corpo.recurso, 'recurso', { max: 120 }),
    toleranciaPct: decimal(corpo.toleranciaPct, 'toleranciaPct', { min: 0, max: 100, padrao: 0 }),
    taktTimeSeg: decimal(corpo.taktTimeSeg, 'taktTimeSeg', { min: 0, padrao: null }),
    operacoes: resumo,
  };

  const client = new Anthropic({ apiKey: chaveIa });

  try {
    // Streaming, nao create(): requisicao longa sem streaming bate no timeout
    // de HTTP do SDK. E effort medio de proposito — a funcao serverless tem
    // 60s de teto, e este e' um diagnostico sobre poucos numeros, nao um
    // problema de raciocinio profundo. Estourar o tempo devolve pagina de
    // erro em texto, que e' pior que uma analise um pouco mais curta.
    const fluxo = client.messages.stream({
      model: MODELO,
      max_tokens: 8000,
      system: SISTEMA,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{
        role: 'user',
        content: `Dados do estudo de tempos:\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    });
    const resposta = await fluxo.finalMessage();

    // Fable/Opus podem recusar por politica: 200 com stop_reason "refusal".
    if (resposta.stop_reason === 'refusal') {
      throw new ErroHttp(422, 'A analise foi recusada pelo modelo', {
        categoria: resposta.stop_details?.category ?? null,
      });
    }

    const texto_ = resposta.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return json(res, 200, {
      analise: texto_,
      modelo: resposta.model,
      uso: {
        entrada: resposta.usage?.input_tokens ?? null,
        saida: resposta.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    if (err instanceof Anthropic.RateLimitError) {
      throw new ErroHttp(429, 'Limite de uso da IA atingido. Tente em alguns minutos.');
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('[ritmopatrimar] chave da API de IA invalida ou revogada.');
      throw new ErroHttp(503,
        'A chave da IA foi recusada pela Anthropic. Troque a chave na seção "Análise com IA".');
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[ritmopatrimar] erro da API Anthropic:', err.status, err.message);
      throw new ErroHttp(502, 'Falha ao consultar a IA');
    }
    throw err;
  }
});

/** Chave salva pelo painel. Nunca sai daqui para o navegador. */
/**
 * Analise das conferencias rapidas — resumo POR MAQUINA, ja agregado no
 * cliente. Sobe o agregado, nao as linhas cruas: e' o que a IA precisa, e
 * o payload nao cresce com o historico do posto.
 */
async function analisarConferencias(res, corpo, chaveIa) {
  const maquinas = lista(corpo.maquinas || [], 'maquinas', { max: MAX_OPERACOES });
  if (!maquinas.length) throw new ErroHttp(400, 'Envie ao menos uma maquina com conferencias');

  const contexto = {
    maquinas: maquinas.map((m, i) => ({
      maquina: texto(m.maquina, `maquinas[${i}].maquina`, { obrigatorio: true, max: 120 }),
      conferencias: inteiro(m.n, `maquinas[${i}].n`, { min: 0, max: 100000, padrao: 0 }),
      pecasTotais: inteiro(m.pecas, `maquinas[${i}].pecas`, { min: 0, max: 10000000, padrao: 0 }),
      tempoObservadoMin: decimal(m.minutos, `maquinas[${i}].minutos`, { min: 0, padrao: 0 }),
      ritmoMedioPecasHora: decimal(m.ritmo, `maquinas[${i}].ritmo`, { min: 0, padrao: 0 }),
      cicloMedioSeg: decimal(m.cicloSeg, `maquinas[${i}].cicloSeg`, { min: 0, padrao: 0 }),
      cvPct: decimal(m.cvPct, `maquinas[${i}].cvPct`, { min: 0, padrao: null }),
      melhorPecasHora: decimal(m.melhor, `maquinas[${i}].melhor`, { min: 0, padrao: null }),
      piorPecasHora: decimal(m.pior, `maquinas[${i}].pior`, { min: 0, padrao: null }),
      confiavel: Boolean(m.confiavel),
      motivos: lista(m.motivos || [], `maquinas[${i}].motivos`, { max: 10 })
        .map((mot, j) => texto(mot, `maquinas[${i}].motivos[${j}]`, { max: 300 })),
    })),
  };

  const client = new Anthropic({ apiKey: chaveIa });

  try {
    const fluxo = client.messages.stream({
      model: MODELO,
      max_tokens: 8000,
      system: SISTEMA_CONFERENCIA,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      messages: [{
        role: 'user',
        content: `Conferencias rapidas por maquina:\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    });
    const resposta = await fluxo.finalMessage();

    if (resposta.stop_reason === 'refusal') {
      throw new ErroHttp(422, 'A analise foi recusada pelo modelo', {
        categoria: resposta.stop_details?.category ?? null,
      });
    }

    return json(res, 200, {
      analise: resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
      modelo: resposta.model,
      uso: {
        entrada: resposta.usage?.input_tokens ?? null,
        saida: resposta.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    if (err instanceof Anthropic.RateLimitError) {
      throw new ErroHttp(429, 'Limite de uso da IA atingido. Tente em alguns minutos.');
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ErroHttp(503, 'A chave da IA foi recusada pela Anthropic. Troque a chave em "Chave da IA".');
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[ritmopatrimar] erro da API Anthropic:', err.status, err.message);
      throw new ErroHttp(502, 'Falha ao consultar a IA');
    }
    throw err;
  }
}

async function chaveSalva(empresaId) {
  const [linha] = await sql`
    SELECT valor FROM configuracoes
     WHERE empresa_id = ${empresaId} AND chave = 'anthropic_api_key'`;
  return linha?.valor || null;
}
