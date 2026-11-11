/**
 * A MEDICAO DA EMBALAGEM VAI PARA O PAINEL RitmoPatrimar — o Apps Script da
 * planilha de producao, que guarda as cronoanalises na aba CRONOANALISE.
 *
 * Antes, o PCP lia a medicao no PC, salvava a analise, imprimia o PDF e
 * importava esse PDF no painel, que tirava dele o produto, a data, os
 * volumes e os tres tempos por volume. Agora o "Salvar analise e fechar"
 * manda a medicao sozinha (api/conferencias.js, PATCH ?painel=1).
 *
 * OS MESMOS NUMEROS DO PDF, NAO NUMEROS PARECIDOS. O painel reconhece a
 * medicao repetida pelo CONTEUDO (produto, data, segundos, volumes): e' assim
 * que o PDF desta medicao, importado antes ou depois, nao vira uma segunda
 * linha. Por isso a leitura sai das mesmas funcoes da tela (periodoPorPeca e
 * leituraPecaAPeca, como em VolumeAVolume.jsx) e o texto dos segundos do
 * mesmo formatarSegundos que a tela e a folha usam ("14.4": uma casa, ponto).
 * Uma conta "equivalente" aqui e o painel ficaria com duas linhas da mesma
 * medicao, uma de cada caminho.
 *
 * O QUE VAI (decidido com o PCP):
 *  - so' a EMBALAGEM: o grupo da maquina, pela mesma regra que poe "volume"
 *    na tela (unidadeDoPosto);
 *  - so' com toques bastantes para a leitura (leitura.suficiente): o painel
 *    recebe tempo por volume, e sem leitura ele nao existe;
 *  - so' com produto DA LISTA do cadastro, no formato do painel ("501059 ·
 *    PENTEADEIRA CAMARIM STRASS · VOL 2/2"). Nome digitado solto o painel
 *    nao acha no cadastro dele: a tela manda corrigir em Editar produto;
 *  - uma linha por medicao, tambem na juncao — o painel ja' soma as
 *    medicoes do mesmo volume.
 * Excluir ou arquivar aqui nao mexe no painel.
 *
 * LIGA/DESLIGA: PAINEL_APPS_SCRIPT_URL, a URL do App da Web (termina em
 * /exec). Sem ela nada sai daqui, e a tela diz, discreta, que o envio esta'
 * desligado.
 *
 * A CHAMADA e' um GET SEM `callback` — a resposta vem em JSON, nao em JSONP.
 * O Apps Script responde com um 302 para script.googleusercontent.com, que o
 * fetch segue sozinho. `buscar` e' injetavel, como em planilhaGoogle.js: os
 * testes respondem como o painel, sem rede.
 */
import { formatarSegundos, unidadeDoPosto } from '../../src/domain/crono/formato.js';
import { nomeChave } from '../../src/domain/crono/conferencia.js';
import { leituraPecaAPeca, periodoPorPeca } from '../../src/domain/crono/intervalos.js';
import { diaCivil } from '../../src/domain/demanda/calendario.js';
import { taktDaMedicao } from '../../src/domain/demanda/programa.js';
import { NO_PAINEL } from '../../src/domain/envioAoPainel.js';
import { comPrazo } from './prazo.js';

export { NO_PAINEL };

/**
 * Quanto se espera o painel. O Apps Script frio leva segundos so' para
 * acordar, e a gravacao dele espera o lock da planilha; 25 s cabe com folga
 * no teto da funcao (60 s, prazo.js), junto das duas idas ao banco.
 */
export const PRAZO_PAINEL_MS = 25_000;

/**
 * O produto DA LISTA do cadastro: seis digitos do modelo, " · " e o nome —
 * o formato em que o painel procura o produto no cadastro dele.
 */
const PRODUTO_DA_LISTA = /^\d{6} · /;

/** O texto guardado em painel_erro tem teto: e' motivo, nao log. */
const MAX_MOTIVO = 500;
/** O que vem do painel (o `erro` dele) entra na frase com teto menor. */
const MAX_DO_PAINEL = 300;
/** O teto do MEDIDO POR no painel (o campo da tela dele tem 40). */
const MAX_QUEM = 40;

export const MENSAGEM_DESLIGADO = 'O envio ao painel está desligado: falta a variável PAINEL_APPS_SCRIPT_URL no servidor.';
export const MENSAGEM_GS_ANTIGO = 'O painel ainda não aceita medição do app: falta colar o .gs v5.58 no Apps Script e reimplantar.';
const MENSAGEM_URL = 'PAINEL_APPS_SCRIPT_URL não é a URL do App da Web do painel (https://script.google.com/macros/s/…/exec): '
  + 'copie pelo botão Copiar, abaixo de URL, em Implantar → Gerenciar implantações.';
const MENSAGEM_NAO_JSON = 'O painel não respondeu em JSON: confira PAINEL_APPS_SCRIPT_URL — é a URL do App da Web, '
  + 'terminada em /exec, implantada para "Qualquer pessoa".';

/**
 * A MARCA DE ANTES DO ENVIO (ver marcaDeEnvio em api/conferencias.js). O
 * envio sai da fila da TELA, depois que a analise ja' esta' salva: se a
 * tela fecha ou recarrega no meio, a medicao ficava analisada sem marca
 * nenhuma, e ninguem sabia que ela nao tinha ido. Por isso a gravacao que
 * pede o envio ja' deixa o motivo em painel_erro; o envio, ao voltar, troca
 * pelo desfecho de verdade. Fica escrito so' se o envio nao voltou.
 */
export const MENSAGEM_NAO_CONFIRMADO = 'O envio ao painel não foi confirmado: a análise foi salva, mas o envio '
  + 'não voltou (a tela foi fechada ou recarregada no meio). Envie de novo; se ele já tinha chegado, '
  + 'o painel responde "já estava".';
export const MENSAGEM_PRODUTO_MUDOU = 'O produto foi corrigido depois do envio e o painel ainda está com o '
  + 'nome de antes: envie de novo (o painel troca a linha).';

/** O envio esta' ligado: a variavel existe e nao esta' em branco. */
export const painelLigado = (env = process.env) => Boolean(String(env.PAINEL_APPS_SCRIPT_URL ?? '').trim());

/**
 * O GRUPO DA MAQUINA DA MEDICAO, se for de embalagem — ou null.
 *
 * A conferencia guarda a maquina como TEXTO (digitado no tablet); o cadastro
 * casa pelo nomeChave (sem caixa, acento e espaco repetido), a mesma regra
 * da tela da Embalagem Takt Time. So' entram as maquinas de grupo de
 * embalagem: e' entre elas que a tela procura, e uma furadeira com nome
 * parecido nao pode emprestar o grupo dela a uma medicao da embalagem.
 *
 * `maquinas`: as linhas de `maquinas` com o grupo junto (grupo_nome,
 * horas_semana, setups_dia, setup_min, dias_semana). Devolve o grupo com
 * `maquinas` = quantas ATIVAS ele tem (o mesmo ativasDoGrupo da tela).
 */
export function grupoDaMedicao(nomeDaMaquina, maquinas) {
  const daEmbalagem = (maquinas || []).filter((m) => m.grupo_id && unidadeDoPosto(m.grupo_nome).singular === 'volume');
  const chave = nomeChave(nomeDaMaquina);
  const achada = chave ? daEmbalagem.find((m) => nomeChave(m.nome) === chave) : null;
  if (!achada) return null;
  return {
    id: achada.grupo_id,
    nome: achada.grupo_nome,
    horas_semana: achada.horas_semana,
    setups_dia: achada.setups_dia,
    setup_min: achada.setup_min,
    dias_semana: achada.dias_semana,
    maquinas: daEmbalagem.filter((m) => m.grupo_id === achada.grupo_id && m.ativa).length,
  };
}

/** "dd/mm/aaaa" do dia da medicao no relogio de Sao Paulo — ou null. */
function dataDaMedicao(conferencia) {
  const quando = conferencia?.iniciado_em || conferencia?.salvo_em;
  if (!quando) return null;
  const dia = diaCivil(quando);
  if (!dia) return null;
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(dia.getUTCDate())}/${dois(dia.getUTCMonth() + 1)}/${dia.getUTCFullYear()}`;
}

/**
 * OS PARAMETROS DO PAINEL para uma medicao — ou o MOTIVO de ela nao ir.
 * Pura: recebe o que a rota leu do banco, nao le nada.
 *
 *   conferencia  a linha de `conferencias` (peca, pecas, marcas_ms,
 *                marcas_relogio_ms, marcas_setup_ms, iniciado_em, salvo_em,
 *                duracao_ms, maquina)
 *   grupo        o grupo de embalagem da maquina (grupoDaMedicao), ou null
 *   demandas     o programa da semana do grupo, como a tela o le
 *
 * A ORDEM DOS MOTIVOS importa: o que nao se corrige vem antes do produto.
 * Com toques de menos, mandar "corrigir o produto e enviar de novo" seria
 * mandar fazer uma correcao que nao leva a medicao a lugar nenhum.
 *
 * O SETUP PLANEJADO e' o do TAKT (taktDaMedicao(...).setupPlanejado) —
 * desde a v2.106.0 a TELA decide pela regua do tempo-alvo (descontaSetup,
 * src/domain/tempoAlvo.js) e aqui NAO, de proposito: o servidor nao tem o
 * alvo do produto sem mais uma ida ao Apps Script no envio, e o NO PERIODO
 * no painel so' informa (a UEP sai do sem as lacunas). Os dois so' diferem
 * com setup marcado entre os toques e sem o programa da semana (ou com o
 * grupo sem setup no app e o painel com setup). O que segue e' a regra do
 * takt, como era: setup maior
 * que zero no cadastro do grupo (setups_dia x dias_semana x setup_min, ver
 * horasDeSetup) E programa da semana cadastrado — sem programa, a tela nao
 * tem takt, o setup nao sai das horas, e o setup que a medicao pegou entre
 * os toques fica no periodo. Por isso a mesma funcao, com o mesmo programa,
 * e nao so' o cadastro: com setup cadastrado e programa vazio, olhar so' o
 * cadastro tiraria do periodo um setup que a tela deixa, e o "no periodo"
 * daqui nao bateria com o do PDF. So' muda alguma coisa com setup marcado AO
 * VIVO entre o primeiro e o ultimo toque (marcas_setup_ms > 0).
 */
export function montarParaOPainel({ conferencia, grupo, demandas = [] } = {}) {
  const c = conferencia || {};
  if (!grupo || unidadeDoPosto(grupo.nome).singular !== 'volume') {
    return {
      motivo: `A máquina "${c.maquina || 'não informada'}" não está num grupo de embalagem no cadastro: `
        + 'só medição da embalagem vai ao painel.',
    };
  }
  const marcas = Array.isArray(c.marcas_ms) ? c.marcas_ms.map(Number) : null;
  if (!marcas || marcas.length < 2) {
    return {
      motivo: 'A medição não tem toques volume a volume (medida por horários, com a contagem corrigida à mão '
        + 'ou com um toque só): não há tempo por volume para o painel.',
    };
  }

  // A data em texto ISO, como a tela a passa (o JSON da lista).
  const instante = new Date(c.iniciado_em || c.salvo_em || NaN);
  const { setupPlanejado } = taktDaMedicao({
    demandas,
    horas: grupo.horas_semana,
    maquinas: grupo.maquinas,
    setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
    data: Number.isNaN(instante.getTime()) ? null : instante.toISOString(),
    pecas: c.pecas,
    duracaoMs: Number(c.duracao_ms),
  });
  // As duas chamadas de VolumeAVolume.jsx, com o setup pela regra do takt
  // (ver acima: a tela usa a do alvo). O takt nao entra: ele so' acrescenta
  // a comparacao, nao muda nenhum dos tres tempos.
  const periodoMs = periodoPorPeca({
    relogioEntreMarcasMs: c.marcas_relogio_ms,
    volumes: marcas.length,
    setupNoTrechoMs: c.marcas_setup_ms,
    setupPlanejado: Boolean(setupPlanejado),
  });
  const leitura = leituraPecaAPeca({ marcasMs: marcas, periodoPorPecaMs: periodoMs });
  if (!leitura?.suficiente) {
    return {
      motivo: `Poucos toques para a leitura (${leitura?.motivo || 'sem intervalo'}): o painel precisa do tempo por volume.`,
    };
  }
  if (!(leitura.mediaMs > 0) || !(leitura.normalMs > 0)) {
    return { motivo: 'A leitura desta medição não tem tempo por volume (intervalos zerados).' };
  }

  const rotulo = typeof c.peca === 'string' ? c.peca : '';
  if (!PRODUTO_DA_LISTA.test(rotulo)) {
    return {
      motivo: `O produto "${rotulo.trim() || 'não informado'}" não é da lista do cadastro (código de 6 dígitos · nome): `
        + 'corrija o produto em Editar produto e envie de novo.',
    };
  }
  const data = dataDaMedicao(c);
  if (!data) return { motivo: 'A medição não tem data.' };

  return {
    params: {
      action: 'registrarCrono',
      origem: 'app',
      // 4 + 36 = 40 caracteres: o teto do REG_ID no painel.
      regId: `app-${c.id}`,
      // EXATAMENTE o nome da medicao: e' por ele que o painel acha o produto.
      rotulo,
      data,
      // Os tres tempos com o texto da tela e do PDF (ver o comeco do arquivo).
      sRod: formatarSegundos(leitura.mediaMs),
      sLac: formatarSegundos(leitura.normalMs),
      // Sem relogio entre os toques nao ha' "no periodo": vai vazio, como o
      // PDF, que mostra "—" no cartao.
      sPer: periodoMs > 0 ? formatarSegundos(periodoMs) : '',
      // O numero do cartao de volumes da tela e da folha (conferencias.pecas,
      // que o banco obriga a ser o numero de marcas).
      volumes: String(c.pecas),
      // O MEDIDO POR do painel: quem salvou a analise (analisada_por, o nome
      // copiado na hora). No caminho do PDF era o nome digitado no painel; sem
      // ele, a medicao do app aparecia so' como "app". Vazio vai vazio.
      quem: quemAnalisou(c.analisada_por),
    },
  };
}

/** O nome de quem analisou, aparado e com o teto do MEDIDO POR do painel. */
function quemAnalisou(nome) {
  const s = String(nome ?? '').trim().replace(/\s+/g, ' ');
  return s.length > MAX_QUEM ? s.slice(0, MAX_QUEM).trim() : s;
}

/** O texto que veio do painel, aparado e com teto. */
function textoDoPainel(valor) {
  const s = String(valor ?? '').trim().replace(/\s+/g, ' ');
  return s.length > MAX_DO_PAINEL ? `${s.slice(0, MAX_DO_PAINEL - 1)}…` : s;
}

/** O mesmo, sem o ponto final: ele entra no meio de uma frase nossa. */
const semPontoFinal = (s) => s.replace(/[\s.]+$/, '');

/**
 * A resposta do .gs ANTERIOR a v5.58 ao pedido do app: ele nao conhece
 * `rotulo` e procura o produto noutro campo. E' a UNICA resposta que diz,
 * com certeza, "o .gs implantado e' velho".
 */
const ERRO_DO_GS_ANTIGO = /^sem o produto da medi[cç][aã]o\.?$/i;

/**
 * A RESPOSTA DO PAINEL (o JSON do .gs v5.58) virada em desfecho:
 *   { estado: 'enviada' | 'ja-estava' | 'recusada' | 'erro' | 'gs-antigo',
 *     mensagem, linha?, substituida? }
 *
 * `app: true` e' a assinatura do .gs que conhece medicao do app, e so' com
 * ela a medicao conta como enviada. Sem ela:
 *  - "Sem o produto da medicao." e' o .gs anterior a v5.58 (gs-antigo): o
 *    que pede e' colar o .gs novo e reimplantar, nao reenviar;
 *  - qualquer outra resposta (o getDados() de um .gs mais antigo, um erro
 *    que nao passou pelo caminho do app) e' ERRO generico: pode reenviar.
 *    Chamar isso de "gs antigo" mandaria reimplantar o que pode estar certo.
 *
 * SUBSTITUIDA: a MESMA medicao (mesmo REG_ID) reenviada com numeros
 * diferentes — o PCP reabriu a analise, marcou uma parada e salvou de novo.
 * O painel troca a linha (a antiga vai para CRONO_EXCLUIDOS) e responde
 * `substituido: true`: e' enviada, com a frase "atualizada no painel".
 *
 * RECUSADA x ERRO: recusada e' o painel dizendo "nao" a esta medicao
 * (produto fora do cadastro dele, dados que nao fecham) — reenviar sem
 * corrigir da' o mesmo nao. Erro e' o painel que nao conseguiu gravar (lock,
 * planilha, excecao: `ok: false`): reenviar resolve.
 */
export function respostaDoPainel(corpo) {
  const objeto = corpo && typeof corpo === 'object' && !Array.isArray(corpo);
  const motivo = objeto ? textoDoPainel(corpo.erro) : '';
  if (!objeto || corpo.app !== true) {
    if (objeto && corpo.ok === false && ERRO_DO_GS_ANTIGO.test(motivo)) {
      return { estado: 'gs-antigo', mensagem: MENSAGEM_GS_ANTIGO };
    }
    return {
      estado: 'erro',
      mensagem: `O painel não confirmou o registro${motivo ? `: ${semPontoFinal(motivo)}` : ''}. Envie de novo; se repetir, `
        + 'confira se o .gs v5.58 está implantado.',
    };
  }
  const linha = Number.isInteger(Number(corpo.linha)) && Number(corpo.linha) > 0 ? Number(corpo.linha) : null;
  if (corpo.ok === true && corpo.registrado === true) {
    if (corpo.substituido === true) {
      return {
        estado: 'enviada', substituida: true, linha,
        mensagem: 'Atualizada no painel: a medição já estava lá com outros números, e a linha foi trocada.',
      };
    }
    return corpo.duplicado === true
      ? { estado: 'ja-estava', mensagem: 'Já estava no painel: a mesma medição tinha chegado antes (pelo app ou pelo PDF).', linha }
      : { estado: 'enviada', mensagem: 'Enviada ao painel.', linha };
  }
  if (corpo.ok === true && corpo.recusado === true) {
    return { estado: 'recusada', mensagem: `O painel recusou: ${motivo || 'sem motivo informado'}` };
  }
  return { estado: 'erro', mensagem: `O painel não gravou${motivo ? `: ${semPontoFinal(motivo)}` : ''}. Envie de novo.` };
}

/**
 * O GET NO PAINEL, cru (v2.106.0): a URL conferida, os parametros, o prazo e
 * o JSON. Devolve { corpo } ou { falha: 'desligado'|'url'|'status'|'json'|
 * 'prazo'|'rede', status?, motivo? } — quem chama diz a frase. E' o que o
 * envio (chamarPainel) e a leitura dos tempos-alvo (temposAlvo.js) dividem:
 * a mesma conferencia do /exec, o mesmo prazo, o mesmo `buscar` dos testes;
 * as frases sao de cada um ("envie de novo" so' faz sentido no envio).
 * Nunca lanca.
 */
export async function lerDoPainel({
  params, url = process.env.PAINEL_APPS_SCRIPT_URL, buscar = fetch, prazoMs = PRAZO_PAINEL_MS,
} = {}) {
  const endereco = String(url ?? '').trim();
  if (!endereco) return { falha: 'desligado' };
  let alvo = null;
  try { alvo = new URL(endereco); } catch { alvo = null; }
  if (!alvo || alvo.protocol !== 'https:' || !/\/exec$/.test(alvo.pathname)) return { falha: 'url' };
  // URLSearchParams, como o painel espera: espaco vai como "+", e o "·"
  // em UTF-8. Pelo objeto URL, e nao "?" colado: uma URL que ja' traga
  // query string nao sai com dois "?".
  Object.entries(params || {}).forEach(([chave, valor]) => alvo.searchParams.set(chave, valor ?? ''));

  const prazo = comPrazo(prazoMs);
  try {
    const r = await buscar(alvo.toString(), { method: 'GET', redirect: 'follow', signal: prazo.sinal });
    const texto = await r.text();
    if (!r.ok) return { falha: 'status', status: r.status };
    try {
      return { corpo: JSON.parse(texto) };
    } catch {
      return { falha: 'json' };
    }
  } catch (e) {
    if (prazo.sinal.aborted || e?.name === 'AbortError' || e?.name === 'TimeoutError') return { falha: 'prazo' };
    return { falha: 'rede', motivo: semPontoFinal(textoDoPainel(e?.message || e)) };
  } finally {
    prazo.encerrar();
  }
}

/** A frase de cada falha do GET, para quem le (a URL e o JSON sao as mesmas do envio). */
export function frasePorFalha(g, { prazoMs = PRAZO_PAINEL_MS, depois = '' } = {}) {
  const fim = depois ? ` ${depois}` : '';
  switch (g.falha) {
    case 'desligado': return MENSAGEM_DESLIGADO;
    case 'url': return MENSAGEM_URL;
    case 'json': return MENSAGEM_NAO_JSON;
    case 'status': return `O painel respondeu ${g.status}.${fim}`;
    case 'prazo': return `O painel não respondeu em ${Math.round(prazoMs / 1000)} s.${fim}`;
    default: return `Não deu para falar com o painel (${g.motivo}).${fim}`;
  }
}

/**
 * A CHAMADA AO PAINEL. Devolve o desfecho (respostaDoPainel), ou:
 *   desligado  sem PAINEL_APPS_SCRIPT_URL — nada sai daqui;
 *   erro       URL que nao e' a do App da Web, resposta que nao e' JSON,
 *              status de erro, rede fora ou o painel calado no prazo.
 * Nunca lanca: quem chama grava o desfecho na medicao, qualquer que seja.
 *
 * A URL "do editor" (/edit) e a copiada da tela, truncada com "…", dao a
 * mesma falha muda; a conferencia do /exec diz o que copiar antes de gastar
 * uma ida ao Google.
 */
export async function chamarPainel({
  params, url = process.env.PAINEL_APPS_SCRIPT_URL, buscar = fetch, prazoMs = PRAZO_PAINEL_MS,
} = {}) {
  const g = await lerDoPainel({ params, url, buscar, prazoMs });
  if (!g.falha) return respostaDoPainel(g.corpo);
  if (g.falha === 'desligado') return { estado: 'desligado', mensagem: MENSAGEM_DESLIGADO };
  const depois = g.falha === 'status' ? 'Envie de novo; se repetir, confira PAINEL_APPS_SCRIPT_URL.' : 'Envie de novo.';
  return { estado: 'erro', mensagem: frasePorFalha(g, { prazoMs, depois }) };
}

/** O motivo que vai para painel_erro, com o teto da coluna. */
export const motivoParaGravar = (mensagem) => String(mensagem ?? '').slice(0, MAX_MOTIVO);
