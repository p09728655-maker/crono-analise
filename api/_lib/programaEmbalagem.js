/**
 * O PROGRAMA DA EMBALAGEM, lido da planilha do PCP e gravado no programa
 * da semana (demanda_semanal) do grupo EMBALAGEM.
 *
 * A planilha e' a fonte oficial do programa da embalagem: o PCP a mantem
 * lote a lote, e colar o mesmo numero aqui toda semana seria um controle
 * paralelo esperando para divergir. O servidor le e grava sozinho; o tablet
 * e o PC leem o programa guardado, como o de qualquer grupo.
 *
 * QUANDO: no GET do programa (?demanda=1) — quando alguem pede o programa,
 * e no maximo a cada 10 minutos por instancia do servidor (1 minuto depois
 * de uma falha). O tablet ligado pede a cada meia hora, entao a semana nova
 * chega sem ninguem abrir o PC; fim de semana com tudo desligado, nao ha'
 * leitura nenhuma. Sem cron: o plano Hobby da Vercel so' roda cron uma vez
 * por dia.
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
 * COLAR NO GRUPO DA PLANILHA E' RECUSADO, com a leitura boa ou falhando. A
 * colagem traz o codigo de semana do PCP, e a planilha grava pelo numero
 * ISO: os dois numeram a mesma semana de jeitos diferentes, e a colagem
 * caia por cima de OUTRA semana. Com a leitura falhando, vale o programa
 * guardado, e a semana que ainda nao foi lida fica sem takt ate' a leitura
 * voltar — falta dita na tela, nao numero de outra semana.
 *
 * FALHA nao derruba nada: o GET responde com o programa guardado e o motivo
 * em `planilha`, para a tela dizer "nao deu para ler a planilha" em vez de
 * mostrar um takt de idade desconhecida.
 */
import { unidadeDoPosto } from '../../src/domain/crono/formato.js';
import { diaCivil, semanaIso } from '../../src/domain/demanda/calendario.js';
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
// Sobe a cada lerDeNovo(): a leitura que comecou antes nao guarda o que viu.
let geracao = 0;

/**
 * O programa do grupo mudou por fora da leitura (a semana colada que
 * travava uma da planilha foi apagada): a proxima pergunta le de novo, sem
 * esperar os 10 minutos. A leitura em curso pode ter visto a linha antes de
 * ela sair, entao o resultado dela nao fica guardado. Vale nesta instancia
 * do servidor; outra relê no prazo dela.
 */
export function lerDeNovo() { ultima = null; emAndamento = null; geracao += 1; }

/** So' para os testes. */
export const _esquecer = lerDeNovo;

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
 * `grupoId` so' existe quando a planilha manda no grupo (configurada, lendo
 * bem ou nao); com `erro`, ela esta' configurada mas parada, e a colagem
 * continua aberta.
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
    // Mais de uma empresa e sem EMPRESA_ID: nao da' para saber de quem e' a
    // planilha. Nao grava — e nao conta o motivo a quem pediu, que pode ser
    // de outra empresa. Fica no log para quem administra.
    console.error('[ritmopatrimar] programa da embalagem — empresa da instalacao:', e.message);
    return null;
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

/** Onde fica a hora da ultima leitura boa: sobrevive a' troca de instancia. */
const CHAVE_LIDA_EM = 'programa_embalagem_lida_em';

/**
 * Grava as semanas, numa transacao: a planilha toda entra, ou nada muda.
 * Da segunda `desde` em diante o programa do grupo e' o da planilha: semana
 * guardada que nao veio dela sai, inclusive a futura colada a mao.
 *
 * Semana SEM DATA (colada sem a coluna INICIO) so' tem o numero para dizer
 * de quando e'. Com numero da janela em diante, ela sai (ou recebe a da
 * planilha, se o numero for o mesmo): no grupo numerado pelo ISO ela so'
 * casaria com a medicao pelo numero de outra semana. Com numero de antes da
 * janela, e' historia e fica, como a semana antiga com data — e nao trava
 * nada, porque nenhuma semana da janela tem numero tao baixo.
 *
 * A gravacao casa por (ano, numero), e a semana CONGELADA (com data antes
 * da janela) pode ter o mesmo numero de outra numeracao — colada pela
 * coluna S da planilha da fabrica, por exemplo. Sobrescreve-la trocaria o
 * programa de uma semana antiga pelo de outra. Essa semana da planilha nao
 * entra e volta em `conflitos`, com a colada que a travou, para a tela
 * dizer qual apagar (o apagar so' alcanca semana colada).
 *
 * Devolve quantas linhas mudaram (gravadas ou apagadas; a regravada igual
 * nao conta) e as semanas que nao entraram.
 */
async function gravar(empresaId, grupoId, semanas, desde) {
  const vindas = new Set(semanas.map((s) => `${s.ano}-${s.numero}`));
  const janela = semanaIso(new Date(`${desde}T12:00:00Z`));
  const numeroAntes = (l) => l.ano < janela.ano || (l.ano === janela.ano && l.numero < janela.numero);
  return sql.begin(async (tx) => {
    let mudaram = 0;
    // `na_janela` e' null na semana sem data: decide o numero dela.
    const doGrupo = await tx`
      SELECT id, ano, numero, to_char(inicio, 'YYYY-MM-DD') AS inicio,
             inicio >= ${desde}::date AS na_janela
        FROM demanda_semanal
       WHERE empresa_id = ${empresaId} AND grupo_id = ${grupoId}`;
    const congelada = (l) => (l.na_janela === null ? numeroAntes(l) : !l.na_janela);
    const congeladas = new Map(doGrupo.filter(congelada).map((l) => [`${l.ano}-${l.numero}`, l]));
    for (const linha of doGrupo) {
      if (congelada(linha) || vindas.has(`${linha.ano}-${linha.numero}`)) continue;
      await tx`DELETE FROM demanda_semanal WHERE id = ${linha.id}`;
      mudaram += 1;
    }
    const conflitos = [];
    for (const s of semanas) {
      const colada = congeladas.get(`${s.ano}-${s.numero}`);
      if (colada) {
        conflitos.push({ inicio: s.inicio, colada: { ano: colada.ano, numero: colada.numero, inicio: colada.inicio } });
        continue;
      }
      const gravada = await tx`
        INSERT INTO demanda_semanal (empresa_id, grupo_id, ano, numero, pecas, inicio, dias)
        VALUES (${empresaId}, ${grupoId}, ${s.ano}, ${s.numero}, ${s.pecas}, ${s.inicio}::date, ${s.dias})
        ON CONFLICT (empresa_id, grupo_id, ano, numero)
        DO UPDATE SET pecas = EXCLUDED.pecas, inicio = EXCLUDED.inicio, dias = EXCLUDED.dias
         WHERE demanda_semanal.pecas IS DISTINCT FROM EXCLUDED.pecas
            OR demanda_semanal.inicio IS DISTINCT FROM EXCLUDED.inicio
            OR demanda_semanal.dias IS DISTINCT FROM EXCLUDED.dias
        RETURNING id`;
      mudaram += gravada.length;
    }
    await tx`
      INSERT INTO configuracoes (empresa_id, chave, valor)
      VALUES (${empresaId}, ${CHAVE_LIDA_EM}, ${new Date().toISOString()})
      ON CONFLICT (empresa_id, chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`;
    return { mudaram, conflitos };
  });
}

/** A hora da ultima leitura boa, do banco — ou null. */
async function lidaPorUltimo(empresaId) {
  try {
    const [linha] = await sql`
      SELECT valor FROM configuracoes WHERE empresa_id = ${empresaId} AND chave = ${CHAVE_LIDA_EM}`;
    return linha?.valor ?? null;
  } catch {
    return null;
  }
}

async function sincronizar({
  config, empresaId, grupoId, agora, buscar,
}) {
  const daGeracao = geracao;
  let resultado;
  try {
    const abas = await lerAbas({
      conta: config.conta, planilhaId: config.planilhaId, abas: ABAS_DO_PROGRAMA, buscar, agora,
    });
    const lido = semanasDaPlanilha(abas, { hoje: new Date(agora) });
    // A aba de abertos nunca fica vazia numa fabrica rodando: vazia, ela foi
    // lida no meio de uma reescrita (ou apagada). Gravar a leitura assim
    // derrubaria a semana para so' o que ja' foi concluido.
    if (!lido.porAba.PROGRAMACAO) {
      throw new Error('A aba PROGRAMACAO veio sem nenhum lote (no meio de uma edição?): nada foi gravado');
    }
    const desde = segundaDaJanela(agora, SEMANAS_PASSADAS);
    const semanas = lido.semanas.filter((s) => s.inicio >= desde);
    // Planilha sem nenhuma semana recente: lida torta ou esvaziada. Nao se
    // grava nada — apagar o programa por causa disso seria pior.
    if (!semanas.length) {
      throw new Error(`A planilha não tem lote programado desde ${desde.split('-').reverse().join('/')}`);
    }
    const { mudaram, conflitos } = await gravar(empresaId, grupoId, semanas, desde);
    resultado = {
      estado: 'ok',
      ativa: true,
      grupoId,
      lidaEm: new Date(agora).toISOString(),
      semanas: semanas.length - conflitos.length,
      linhas: lido.linhas,
      ignoradas: lido.ignoradas,
      mudaram,
      conflitos,
    };
  } catch (e) {
    console.error('[ritmopatrimar] programa da embalagem — planilha nao lida:', e.message);
    resultado = {
      estado: 'erro',
      ativa: true,
      grupoId,
      mensagem: e.message,
      tentadaEm: new Date(agora).toISOString(),
      // A ultima leitura boa, do BANCO (a memoria e' so' desta instancia, e
      // a instancia nova nao saberia): a tela diz de quando e' o programa
      // que continua valendo.
      lidaEm: await lidaPorUltimo(empresaId),
    };
  }
  if (daGeracao === geracao) ultima = { quando: agora, grupoId, resultado };
  return resultado;
}

/**
 * Chamada no GET do programa. Le a planilha se esta' na hora, grava, e
 * devolve o estado para a tela — ou null quando a planilha nao se aplica a
 * este pedido (desligada, outra empresa, ou o programa de outro grupo).
 *
 * `ativa` diz se a planilha MANDA no programa (le e grava; colar e'
 * recusado, mesmo com a leitura falhando). Configurada mas parada (falta
 * variavel, dois grupos de embalagem), ela informa o motivo com
 * `ativa: false` e a colagem segue — so' no grupo que ainda nao tem semana
 * lida da planilha (ver api/_lib/demanda.js).
 */
export async function programaDaPlanilha({
  empresaId, grupoId = null, agora = Date.now(), buscar,
} = {}) {
  const alvo = await grupoDaPlanilha(empresaId);
  if (!alvo) return null;
  // Minusculo: o Postgres aceita o uuid em maiusculas, e a comparacao nao.
  if (grupoId && !alvo.grupos.includes(String(grupoId).toLowerCase())) return null;
  if (alvo.erro) {
    return {
      estado: 'erro', ativa: false, grupoId, mensagem: alvo.erro, lidaEm: null,
    };
  }

  const espera = ultima?.resultado?.estado === 'ok' ? INTERVALO_MS : INTERVALO_DEPOIS_DE_FALHA_MS;
  if (ultima && ultima.grupoId === alvo.grupoId && agora - ultima.quando < espera) return ultima.resultado;
  // Dois pedidos juntos (lista + programa, ao abrir a tela) leem uma vez so'.
  if (!emAndamento) {
    const leitura = sincronizar({
      config: alvo.config, empresaId, grupoId: alvo.grupoId, agora, buscar,
    }).finally(() => { if (emAndamento === leitura) emAndamento = null; });
    emAndamento = leitura;
  }
  return emAndamento;
}

/**
 * O que a planilha diz sobre colar e apagar neste grupo, sem ir ao Google
 * (so' a configuracao e o cadastro):
 *   manda       configurada PARA ele, lendo bem ou falhando (ver o comeco
 *               do arquivo: colar com o codigo do PCP caia por cima de
 *               outra semana);
 *   configurada ele e' grupo de embalagem com a leitura configurada —
 *               mandando, ou parada (variavel quebrada, dois grupos).
 */
export async function planilhaNoGrupo(empresaId, grupoId) {
  const alvo = await grupoDaPlanilha(empresaId);
  // Minusculo: o Postgres aceita o uuid em maiusculas, e a recusa nao pode.
  const id = String(grupoId || '').toLowerCase();
  return {
    manda: Boolean(alvo?.grupoId && alvo.grupoId === id),
    configurada: Boolean(alvo?.grupos?.includes(id)),
  };
}
