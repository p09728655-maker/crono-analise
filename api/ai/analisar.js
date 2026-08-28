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
import { autenticar, exigirPapel } from '../_lib/auth.js';
import { ErroHttp, handler, json, lerCorpo, permitir } from '../_lib/http.js';
import { decimal, inteiro, lista, texto } from '../_lib/validar.js';
import { comPrazo } from '../_lib/prazo.js';

const MODELO = 'claude-opus-5';
const MAX_OPERACOES = 60;

/**
 * Esforco BAIXO de proposito.
 *
 * Isto e' um diagnostico sobre poucas dezenas de numeros ja' calculados —
 * nao um problema de raciocinio profundo. Com esforco medio o Opus pensava
 * tempo demais e a funcao estourava o teto: o analista via um erro em vez
 * da analise. Uma analise boa que chega vale mais que uma otima que morre
 * no timeout.
 *
 * max_tokens e' teto, nao alvo: nao acelera nada baixa-lo, so' arrisca
 * cortar a resposta no meio. Fica folgado, e se ainda assim bater no teto
 * a resposta sai com a ressalva em vez de terminar no meio de uma frase.
 */
const ESFORCO = 'low';
const MAX_TOKENS = 8000;

const SISTEMA = `Voce e um engenheiro industrial senior especializado em cronoanalise e
balanceamento de linha em industria de moveis.

Analise os dados de estudo de tempos fornecidos e responda em portugues do Brasil.

Regras:
- Baseie-se SOMENTE nos numeros fornecidos. Nao invente dados.
- Se a amostra for pequena ou o CV% alto, diga explicitamente que a conclusao
  e' fragil e o que precisa ser coletado antes de decidir.
- "paradasPorMotivo" e' tempo em que a producao PAROU durante a coleta
  (setup, falta de material, manutencao). Esse tempo NAO esta dentro do
  tempo observado — foi descontado do ciclo. Trate como perda separada: nao
  some ao TP nem diga que a operacao esta lenta por causa dele.
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
hora final, pecas produzidas e as paradas do periodo). NAO sao estudo de tempos — nao ha fator de ritmo,
tolerancia nem tempo padrao. Fale em pecas/hora e ciclo medio, nunca em TO/TN/TP.

Regras:
- Baseie-se SOMENTE nos numeros fornecidos. Nao invente dados.
- Cada maquina traz "confiavel" e os motivos quando a amostra nao fecha os
  criterios (minimo de conferencias, tempo total observado, periodo minimo).
  Onde "confiavel" for falso, diga que o numero NAO serve de referencia ainda
  e o que falta medir — nao tire conclusao de capacidade dali.
- CV% alto entre conferencias significa ritmo instavel: aponte isso.
- "ritmoMedioPecasHora" e' o ritmo com a MAQUINA RODANDO: ja' desconta as
  paradas marcadas (tempoParadoMin). Nao confunda com vazao do turno.
- Ciclos de FURACAO: cada peca exige 1, 2 ou 3 acionamentos do motor
  (acionamentosMotor = soma de pecas x ciclos). Peca de mais ciclos rende
  menos pecas/hora SEM a maquina estar mais lenta — antes de comparar
  maquinas ou pecas pelo ritmo, compare o cicloMotorSeg (segundos por
  acionamento), que e' o numero comparavel. So' chame de lentidao o que o
  ciclo do motor confirmar.
- Trate parada e lentidao como problemas DIFERENTES: disponibilidade baixa
  com ritmo alto pede atacar a parada (SMED no setup, kanban na falta de
  material, TPM na manutencao); ritmo baixo com disponibilidade alta pede
  olhar o metodo, o gabarito e a ferramenta. Diga qual dos dois e' o caso.
- Onde tempoParadoMin for 0, nao afirme que nao houve parada: pode ser que
  ninguem tenha marcado. Trate como dado ausente.
- Priorize acoes praticas de chao de fabrica, nao teoria.
- Seja direto. Sem preambulo.

Estruture a resposta em:
1. Leitura dos numeros (3 a 5 linhas)
2. Diferencas entre maquinas e entre pecas
3. Acoes recomendadas (maximo 5, ordenadas por impacto)
4. O que falta medir para virar referencia`;

/**
 * Resposta cortada no teto de tokens sai com a ressalva.
 *
 * Sem isto o texto simplesmente terminava no meio de uma frase e parecia
 * conclusao. Relatorio incompleto que se anuncia e' util; o que se disfarca
 * de completo, nao.
 */
function comRessalvaDeCorte(texto, stopReason) {
  if (stopReason !== 'max_tokens') return texto;
  return `${texto}\n\n[Análise interrompida no limite de tamanho — os itens acima estão completos, mas pode faltar o final.]`;
}

export default handler(async (req, res) => {
  permitir(req, ['POST']);
  const auth = await autenticar(req);
  const { empresaId } = auth;
  // Analise e' trabalho de PC — o tablet pareado nao tem por que gastar a
  // cota de IA da empresa. A chave em si e' lida ADIANTE fora da RLS, de
  // proposito: ela nunca sai do servidor, e a politica que a esconde do
  // navegador nao deve impedir o proprio servidor de usa-la.
  exigirPapel(auth, ['admin', 'analista', 'leitor']);

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
    // Paradas do estudo por motivo. O tempo delas NAO esta' dentro do TO —
    // e' descontado do ciclo na coleta —, entao e' perda a tratar a parte.
    paradasPorMotivo: lista(corpo.paradas || [], 'paradas', { max: 20 })
      .map((par, j) => ({
        motivo: texto(par?.motivo, `paradas[${j}].motivo`, { max: 120 }),
        minutos: decimal(par?.minutos, `paradas[${j}].minutos`, { min: 0, padrao: 0 }),
        ocorrencias: inteiro(par?.ocorrencias, `paradas[${j}].ocorrencias`, { min: 0, max: 100000, padrao: 0 }),
      })),
    operacoes: resumo,
  };

  const client = new Anthropic({ apiKey: chaveIa });

  const prazo = comPrazo();

  try {
    // Streaming, nao create(): requisicao longa sem streaming bate no timeout
    // de HTTP do SDK.
    const fluxo = client.messages.stream({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: SISTEMA,
      thinking: { type: 'adaptive' },
      output_config: { effort: ESFORCO },
      messages: [{
        role: 'user',
        content: `Dados do estudo de tempos:\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    }, { signal: prazo.sinal });
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
      analise: comRessalvaDeCorte(texto_, resposta.stop_reason),
      modelo: resposta.model,
      uso: {
        entrada: resposta.usage?.input_tokens ?? null,
        saida: resposta.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    if (err instanceof Anthropic.APIUserAbortError) {
      throw new ErroHttp(504,
        'A IA passou do tempo do servidor e foi interrompida. Tente de novo — '
        + 'se repetir, analise um estudo com menos operações.');
    }
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
  } finally {
    prazo.encerrar();
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
      // Furacao: total de acionamentos do motor e o tempo de UM acionamento.
      acionamentosMotor: inteiro(m.acionamentos, `maquinas[${i}].acionamentos`, { min: 0, max: 100_000_000, padrao: null }),
      cicloMotorSeg: decimal(m.cicloMotorSeg, `maquinas[${i}].cicloMotorSeg`, { min: 0, padrao: null }),
      cvPct: decimal(m.cvPct, `maquinas[${i}].cvPct`, { min: 0, padrao: null }),
      melhorPecasHora: decimal(m.melhor, `maquinas[${i}].melhor`, { min: 0, padrao: null }),
      piorPecasHora: decimal(m.pior, `maquinas[${i}].pior`, { min: 0, padrao: null }),
      // Parada marcada no periodo: e' o que separa "maquina lenta" de
      // "maquina parada". Sem isto a IA leria queda de setup como perda de
      // ritmo e recomendaria a acao errada.
      tempoRodandoMin: decimal(m.minutosProdutivos, `maquinas[${i}].minutosProdutivos`, { min: 0, padrao: null }),
      tempoParadoMin: decimal(m.minutosParados, `maquinas[${i}].minutosParados`, { min: 0, padrao: 0 }),
      tempoSetupMin: decimal(m.minutosSetup, `maquinas[${i}].minutosSetup`, { min: 0, padrao: 0 }),
      disponibilidadePct: decimal(m.disponibilidadePct, `maquinas[${i}].disponibilidadePct`, { min: 0, padrao: null }),
      paradasPorMotivo: lista(m.paradas || [], `maquinas[${i}].paradas`, { max: 20 })
        .map((par, j) => ({
          motivo: texto(par?.motivo, `maquinas[${i}].paradas[${j}].motivo`, { max: 120 }),
          minutos: decimal(par?.minutos, `maquinas[${i}].paradas[${j}].minutos`, { min: 0, padrao: 0 }),
        })),
      confiavel: Boolean(m.confiavel),
      motivos: lista(m.motivos || [], `maquinas[${i}].motivos`, { max: 10 })
        .map((mot, j) => texto(mot, `maquinas[${i}].motivos[${j}]`, { max: 300 })),
    })),
  };

  const client = new Anthropic({ apiKey: chaveIa });

  const prazo = comPrazo();

  try {
    const fluxo = client.messages.stream({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: SISTEMA_CONFERENCIA,
      thinking: { type: 'adaptive' },
      output_config: { effort: ESFORCO },
      messages: [{
        role: 'user',
        content: `Conferencias rapidas por maquina:\n\n${JSON.stringify(contexto, null, 2)}`,
      }],
    }, { signal: prazo.sinal });
    const resposta = await fluxo.finalMessage();

    if (resposta.stop_reason === 'refusal') {
      throw new ErroHttp(422, 'A analise foi recusada pelo modelo', {
        categoria: resposta.stop_details?.category ?? null,
      });
    }

    return json(res, 200, {
      analise: comRessalvaDeCorte(
        resposta.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
        resposta.stop_reason,
      ),
      modelo: resposta.model,
      uso: {
        entrada: resposta.usage?.input_tokens ?? null,
        saida: resposta.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    if (err instanceof ErroHttp) throw err;
    if (err instanceof Anthropic.APIUserAbortError) {
      throw new ErroHttp(504,
        'A IA passou do tempo do servidor e foi interrompida. Tente de novo — '
        + 'se repetir, filtre uma máquina antes de analisar.');
    }
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
  } finally {
    prazo.encerrar();
  }
}

async function chaveSalva(empresaId) {
  const [linha] = await sql`
    SELECT valor FROM configuracoes
     WHERE empresa_id = ${empresaId} AND chave = 'anthropic_api_key'`;
  return linha?.valor || null;
}
