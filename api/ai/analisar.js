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

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  await autenticar(req);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErroHttp(503, 'Analise por IA nao configurada neste ambiente');
  }

  const corpo = await lerCorpo(req);
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

  const client = new Anthropic();

  try {
    const resposta = await client.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      thinking: { type: 'adaptive' },
      messages: [{
        role: 'user',
        content: `Dados do estudo de tempos:\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    });

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
      console.error('[ritmoprod] ANTHROPIC_API_KEY invalida.');
      throw new ErroHttp(503, 'Analise por IA indisponivel');
    }
    if (err instanceof Anthropic.APIError) {
      console.error('[ritmoprod] erro da API Anthropic:', err.status, err.message);
      throw new ErroHttp(502, 'Falha ao consultar a IA');
    }
    throw err;
  }
});
