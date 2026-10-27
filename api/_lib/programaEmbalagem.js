/**
 * O PROGRAMA DA EMBALAGEM, lido da planilha do PCP e gravado no programa
 * da semana (demanda_semanal) do grupo EMBALAGEM.
 *
 * A planilha e' a fonte oficial do programa da embalagem: o PCP a mantem
 * lote a lote, e colar o mesmo numero aqui toda semana seria um controle
 * paralelo esperando para divergir. O servidor le e grava sozinho; o tablet
 * e o PC leem o programa guardado, como o de qualquer grupo.
 *
 * QUANDO: no GET do programa (?demanda=1), no maximo a cada 10 minutos por
 * instancia do servidor (1 minuto depois de uma falha). O tablet ja' busca
 * o programa a cada meia hora, entao a semana nova chega sem ninguem abrir
 * o PC. Sem cron: o plano Hobby da Vercel so' roda cron uma vez por dia.
 *
 * QUEM GRAVA: o servidor, fora da RLS (`sql`), com empresa e grupo no WHERE.
 * O dado nao vem de quem pediu — vem da planilha —, e o tablet (coletor),
 * que e' quem mais pede, nao pode escrever programa pela RLS.
 *
 * O QUE GRAVA: as semanas da planilha a partir de QUATRO semanas antes da
 * atual (as que a tela da embalagem mostra, 30 dias) ate' a ultima
 * programada. Semana mais antiga fica como esta': se o PCP limpar linhas
 * velhas da aba de concluidos, a semana antiga encolheria, e a medicao
 * daquela semana passaria a "atender" um programa que nunca existiu.
 * Dentro da janela a planilha manda: semana do grupo que nao veio dela
 * (colada a mao, ou cujos lotes sairam da planilha) e' apagada.
 *
 * FALHA nao derruba nada: o GET responde com o programa guardado e o motivo
 * em `planilha`, para a tela dizer "nao deu para ler a planilha" em vez de
 * mostrar um takt de idade desconhecida.
 */
import { unidadeDoPosto } from '../../src/domain/crono/formato.js';
import { diaCivil } from '../../src/domain/demanda/calendario.js';
import { empresaDaInstalacao } from './auth.js';
import { sql } from './db.js';
import { idDaPlanilha, lerAbas, lerContaServico } from './planilhaGoogle.js';
import { ABAS_DO_PROGRAMA, semanasDaPlanilha } from './programaPlanilha.js';

const INTERVALO_MS = 10 * 60000;
const INTERVALO_DEPOIS_DE_FALHA_MS = 60000;
const SEMANAS_PASSADAS = 4;
const UM_DIA = 86400000;

let ultima = null; // { quando, grupoId, resultado }
let emAndamento = null;

/** So' para os testes. */
export function _esquecer() { ultima = null; emAndamento = null; }

/**
 * A configuracao do ambiente, ou null quando a leitura esta' desligada (as
 * duas variaveis vazias). Metade configurada e' ERRO, nao desligada: quem
 * pos uma variavel quer a leitura, e precisa saber o que falta.
 */
function configuracao() {
  const planilha = process.env.PROGRAMA_EMBALAGEM_PLANILHA;
  const conta = process.env.GOOGLE_CONTA_SERVICO;
  if (!planilha && !conta) return null;
  if (!planilha) return { erro: 'Falta a variável PROGRAMA_EMBALAGEM_PLANILHA (o ID ou o endereço da planilha)' };
  if (!conta) return { erro: 'Falta a variável GOOGLE_CONTA_SERVICO (o arquivo .json da chave da conta de serviço)' };
  const planilhaId = idDaPlanilha(planilha);
  if (!planilhaId) return { erro: 'PROGRAMA_EMBALAGEM_PLANILHA não tem um ID de planilha do Google' };
  try {
    return { planilhaId, conta: lerContaServico(conta) };
  } catch (e) {
    return { erro: e.message };
  }
}

/**
 * O grupo que a planilha alimenta nesta empresa, ou null quando a planilha
 * nao se aplica (desligada, ou empresa de outra fabrica).
 *
 * `grupos` sao os grupos de embalagem da empresa (pelo nome, a mesma regra
 * que poe "volume" na tela): so' o programa DELES fala da planilha. O
 * programa da furadeira nao recebe o erro de configuracao da embalagem.
 * `grupoId` so' existe quando a planilha esta' de fato mandando; com
 * `erro`, ela esta' configurada mas parada, e a colagem continua aberta.
 */
export async function grupoDaPlanilha(empresaId) {
  const config = configuracao();
  if (!config) return null;
  const grupos = (await sql`SELECT id, nome FROM grupos_maquina WHERE empresa_id = ${empresaId}`)
    .filter((g) => unidadeDoPosto(g.nome).singular === 'volume');
  const ids = grupos.map((g) => g.id);
  let daInstalacao;
  try {
    daInstalacao = await empresaDaInstalacao();
  } catch (e) {
    return { config, grupos: ids, erro: e.message };
  }
  if (daInstalacao !== empresaId) return null;
  if (config.erro) return { config, grupos: ids, erro: config.erro };
  if (ids.length === 0) return { config, grupos: ids, erro: 'Nenhum grupo EMBALAGEM no cadastro (Ferramentas → Máquinas)' };
  if (ids.length > 1) {
    return {
      config,
      grupos: ids,
      erro: `Mais de um grupo de embalagem no cadastro (${grupos.map((g) => g.nome).join(', ')}): a planilha alimenta um só`,
    };
  }
  return { config, grupos: ids, grupoId: ids[0] };
}

/**
 * A segunda-feira da semana de `agora`, menos `semanas` semanas — 'AAAA-MM-DD'.
 * Pelo dia de Sao Paulo: domingo as 22h ja' e' segunda em UTC.
 */
function segundaDaJanela(agora, semanas) {
  const dia = diaCivil(new Date(agora));
  const dds = dia.getUTCDay() || 7;
  return new Date(dia.getTime() - (((dds - 1) + (7 * semanas)) * UM_DIA)).toISOString().slice(0, 10);
}

/**
 * Grava as semanas, numa transacao: a planilha toda entra, ou nada muda.
 * Da segunda `desde` em diante o programa do grupo e' o da planilha: semana
 * guardada que nao veio dela sai, inclusive a futura colada a mao. Devolve
 * quantas linhas mudaram (gravadas ou apagadas) — a regravada igual nao conta.
 */
async function gravar(empresaId, grupoId, semanas, desde) {
  const vindas = new Set(semanas.map((s) => `${s.ano}-${s.numero}`));
  return sql.begin(async (tx) => {
    let mudaram = 0;
    const naJanela = await tx`
      SELECT id, ano, numero FROM demanda_semanal
       WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}
         AND inicio >= ${desde}::date`;
    for (const linha of naJanela) {
      if (vindas.has(`${linha.ano}-${linha.numero}`)) continue;
      await tx`DELETE FROM demanda_semanal WHERE id = ${linha.id}`;
      mudaram += 1;
    }
    for (const s of semanas) {
      const gravada = await tx`
        INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas, inicio)
        VALUES (${empresaId}, ${grupoId}, ${s.ano}, ${s.numero}, ${s.pecas}, ${s.inicio}::date)
        ON CONFLICT (empresa_id, grupo_id, ano, numero)
        DO UPDATE SET pecas = EXCLUDED.pecas, inicio = EXCLUDED.inicio
         WHERE demanda_semanal.pecas IS DISTINCT FROM EXCLUDED.pecas
            OR demanda_semanal.inicio IS DISTINCT FROM EXCLUDED.inicio
        RETURNING id`;
      mudaram += gravada.length;
    }
    return mudaram;
  });
}

async function sincronizar({
  config, empresaId, grupoId, agora, buscar,
}) {
  let resultado;
  try {
    const abas = await lerAbas({
      conta: config.conta, planilhaId: config.planilhaId, abas: ABAS_DO_PROGRAMA, buscar, agora,
    });
    const lido = semanasDaPlanilha(abas, { hoje: new Date(agora) });
    const desde = segundaDaJanela(agora, SEMANAS_PASSADAS);
    const semanas = lido.semanas.filter((s) => s.inicio >= desde);
    // Planilha sem nenhuma semana recente: lida torta ou esvaziada. Nao se
    // grava nada — apagar o programa por causa disso seria pior.
    if (!semanas.length) {
      throw new Error(`A planilha não tem lote programado desde ${desde.split('-').reverse().join('/')}`);
    }
    const mudaram = await gravar(empresaId, grupoId, semanas, desde);
    resultado = {
      estado: 'ok',
      ativa: true,
      grupoId,
      lidaEm: new Date(agora).toISOString(),
      semanas: semanas.length,
      linhas: lido.linhas,
      ignoradas: lido.ignoradas,
      mudaram,
    };
  } catch (e) {
    console.error('[ritmopatrimar] programa da embalagem — planilha nao lida:', e.message);
    resultado = {
      estado: 'erro',
      ativa: true,
      grupoId,
      mensagem: e.message,
      tentadaEm: new Date(agora).toISOString(),
      // A ultima leitura boa desta instancia: a tela diz de quando e' o
      // programa que continua valendo.
      lidaEm: ultima?.resultado?.lidaEm ?? null,
    };
  }
  ultima = { quando: agora, grupoId, resultado };
  return resultado;
}

/**
 * Chamada no GET do programa. Le a planilha se esta' na hora, grava, e
 * devolve o estado para a tela — ou null quando a planilha nao se aplica a
 * este pedido (desligada, outra empresa, ou o programa de outro grupo).
 *
 * `ativa` diz se a planilha MANDA no programa (le e grava; colar e'
 * recusado). Configurada mas parada (falta variavel, dois grupos de
 * embalagem), ela informa o motivo com `ativa: false` e a colagem segue.
 */
export async function programaDaPlanilha({
  empresaId, grupoId = null, agora = Date.now(), buscar,
} = {}) {
  const alvo = await grupoDaPlanilha(empresaId);
  if (!alvo) return null;
  if (grupoId && !alvo.grupos.includes(grupoId)) return null;
  if (alvo.erro) {
    return {
      estado: 'erro', ativa: false, grupoId, mensagem: alvo.erro, lidaEm: null,
    };
  }

  const espera = ultima?.resultado?.estado === 'ok' ? INTERVALO_MS : INTERVALO_DEPOIS_DE_FALHA_MS;
  if (ultima && ultima.grupoId === alvo.grupoId && agora - ultima.quando < espera) return ultima.resultado;
  // Dois pedidos juntos (lista + programa, ao abrir a tela) leem uma vez so'.
  if (!emAndamento) {
    emAndamento = sincronizar({
      config: alvo.config, empresaId, grupoId: alvo.grupoId, agora, buscar,
    }).finally(() => { emAndamento = null; });
  }
  return emAndamento;
}
