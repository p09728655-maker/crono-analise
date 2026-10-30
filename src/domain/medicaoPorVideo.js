/**
 * MEDICAO POR VIDEO (v2.99.0) — a mesma medicao do tablet, marcada no PC
 * assistindo a uma filmagem da linha.
 *
 * Tudo aqui e' TEMPO DO VIDEO, em ms: a largada, cada volume, o inicio e o
 * fim de cada parada e o Encerrar. Diferente do tablet, nada depende do
 * relogio de quem marca — pausar, voltar 5 s ou ver em 2x nao mexe nos
 * numeros, e marcar de novo o mesmo trecho da' o mesmo resultado.
 *
 * A saida e' exatamente o que o tablet manda pelo sync (ver
 * useHistoricoLocal), para o resto do sistema nao saber a diferenca: o
 * volume a volume, as lacunas, o takt, a junção e a folha impressa leem a
 * medicao por video como leem qualquer outra.
 *
 * AS MESMAS REGRAS DO CRONOMETRO AO VIVO (useCronometroAoVivo):
 *  - A LARGADA e' o fechamento de um volume e NAO conta volume; o periodo
 *    vai dela ao Encerrar.
 *  - As MARCAS estao no relogio da LINHA RODANDO: a parada marcada antes de
 *    um volume sai da marca dele (marca = tempo desde a largada - paradas
 *    encerradas ate' ali). E' isso que faz a lacuna que sobra ser parada
 *    que ninguem marcou.
 *  - O RELOGIO ENTRE O PRIMEIRO E O ULTIMO volume vai com as paradas
 *    dentro; o SETUP marcado nesse trecho vai a parte (marcasSetupMs).
 *  - Volume DENTRO de uma parada nao existe: no tablet o alvo trava
 *    enquanto a linha esta' parada. Aqui, voltando o video, daria para
 *    marcar — e a medicao e' recusada com o porque.
 *
 * O que muda e' so' o que o video permite: marcar fora de ordem (a lista
 * sai ordenada) e o periodo ser o da FILMAGEM, que pode ser de outro dia
 * (salvoEm = inicio da filmagem + Encerrar; o servidor calcula o inicio).
 */

/** Dois toques a menos disto sao o mesmo volume: a tecla repetida, nao dois volumes. */
export const TOQUE_REPETIDO_MS = 200;
/** O teto do servidor por medicao (paradasDaConferencia): aqui, com o porque, antes do Salvar. */
export const MAX_PARADAS = 50;

const inteiro = (ms) => Math.round(Number(ms));
// null e '' nao sao zero: Number(null) daria 0 e a largada "existiria".
const finito = (v) => v != null && v !== '' && Number.isFinite(Number(v));

/**
 * As paradas do video, validadas e ordenadas: [{motivo, inicioMs, fimMs}].
 * Devolve { paradas } ou { motivo } (o porque da recusa, em portugues de
 * fabrica). Parada aberta (sem fim) nao entra numa medicao fechada.
 */
function paradasDoVideo(paradas, largadaMs, fimMs) {
  const lista = (paradas || []).map((p) => ({
    motivo: p.motivo, inicioMs: inteiro(p.inicioMs), fimMs: p.fimMs == null ? null : inteiro(p.fimMs),
  }));
  if (lista.some((p) => p.fimMs == null)) return { motivo: 'há uma parada sem o "Voltou" — encerre a parada antes' };
  if (lista.some((p) => !p.motivo)) return { motivo: 'há uma parada sem motivo' };
  if (lista.some((p) => !(p.fimMs > p.inicioMs))) return { motivo: 'há uma parada que termina antes de começar' };
  if (lista.some((p) => p.inicioMs < largadaMs || p.fimMs > fimMs)) {
    return { motivo: 'há uma parada fora do período (antes da largada ou depois do Encerrar)' };
  }
  if (lista.length > MAX_PARADAS) {
    return { motivo: `mais de ${MAX_PARADAS} paradas numa medição — divida o vídeo em duas medições` };
  }
  lista.sort((a, b) => a.inicioMs - b.inicioMs);
  for (let i = 1; i < lista.length; i++) {
    if (lista[i].inicioMs < lista[i - 1].fimMs) return { motivo: 'há duas paradas que se sobrepõem no vídeo' };
  }
  return { paradas: lista };
}

/**
 * A MEDICAO a partir dos tempos do video.
 *
 * @param largadaMs  tempo do video da largada (o volume que fechou ali nao conta)
 * @param toquesMs   tempo do video de cada volume, em qualquer ordem
 * @param paradas    [{motivo, inicioMs, fimMs}] no tempo do video
 * @param fimMs      tempo do video do Encerrar
 * @param inicioFilmagem instante (Date ou ISO) do segundo 0 do video
 *
 * Devolve { medicao } — os campos do sync — ou { motivo } quando ela nao
 * pode ser salva assim. Nunca lanca.
 */
export function medicaoDoVideo({
  largadaMs, toquesMs, paradas, fimMs, inicioFilmagem,
} = {}) {
  if (!finito(largadaMs) || largadaMs < 0) return { motivo: 'falta a largada' };
  if (!finito(fimMs) || !(fimMs > largadaMs)) return { motivo: 'o Encerrar tem de vir depois da largada' };
  // new Date(null) seria 1970: sem data, sem medicao.
  const inicio = inicioFilmagem == null || inicioFilmagem === '' ? new Date(NaN) : new Date(inicioFilmagem);
  if (Number.isNaN(inicio.getTime())) return { motivo: 'falta a data e a hora em que a filmagem começou' };
  const largada = inteiro(largadaMs);
  const fim = inteiro(fimMs);

  const toques = (toquesMs || []).map(inteiro).sort((a, b) => a - b);
  if (!toques.length) return { motivo: 'nenhum volume marcado' };
  if (toques[0] <= largada) return { motivo: 'há volume marcado antes da largada' };
  if (toques[toques.length - 1] > fim) return { motivo: 'há volume marcado depois do Encerrar' };

  const lidas = paradasDoVideo(paradas, largada, fim);
  if (lidas.motivo) return { motivo: lidas.motivo };
  const lista = lidas.paradas;
  const dentro = toques.find((t) => lista.some((p) => t > p.inicioMs && t < p.fimMs));
  if (dentro != null) return { motivo: `há volume marcado durante uma parada (${emRelogio(dentro)} do vídeo)` };

  const duracaoMs = fim - largada;
  const paradoMs = lista.reduce((soma, p) => soma + (p.fimMs - p.inicioMs), 0);
  if (paradoMs >= duracaoMs) return { motivo: 'as paradas cobrem o período inteiro' };

  // Parada encerrada ate' o toque: sai da marca dele (relogio rodando).
  const paradaAte = (t) => lista.reduce((soma, p) => soma + (p.fimMs <= t ? p.fimMs - p.inicioMs : 0), 0);
  const marcasMs = toques.map((t) => (t - largada) - paradaAte(t));
  const primeiro = toques[0];
  const ultimo = toques[toques.length - 1];
  const setupNoTrecho = lista
    .filter((p) => p.motivo === 'setup' && p.inicioMs >= primeiro && p.fimMs <= ultimo)
    .reduce((soma, p) => soma + (p.fimMs - p.inicioMs), 0);

  return {
    medicao: {
      duracaoMs,
      pecas: toques.length,
      marcasMs,
      // Com um volume so' nao ha' trecho entre o primeiro e o ultimo.
      marcasRelogioMs: toques.length >= 2 ? ultimo - primeiro : null,
      marcasSetupMs: toques.length >= 2 ? setupNoTrecho : null,
      paradas: lista.map((p) => ({ motivo: p.motivo, duracaoMs: p.fimMs - p.inicioMs })),
      salvoEm: new Date(inicio.getTime() + fim).toISOString(),
      iniciadoEm: new Date(inicio.getTime() + largada).toISOString(),
    },
  };
}

/** "1:02:03.4" / "2:03.4" — o tempo do video como o player mostra. */
export function emRelogio(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const d = Math.floor((total % 1000) / 100);
  const dois = (n) => String(n).padStart(2, '0');
  return `${h ? `${h}:${dois(m)}` : m}:${dois(s)}.${d}`;
}

/**
 * O INICIO DA FILMAGEM sugerido pelo arquivo: o celular grava o arquivo
 * quando a filmagem TERMINA, entao a data de modificacao e' o fim; menos a
 * duracao, o comeco. E' sugestao — o analista confere antes de marcar,
 * porque a data decide a semana e o takt (arquivo copiado de um PC para
 * outro perde a data original).
 */
export function inicioSugerido(ultimaModificacaoMs, duracaoVideoS) {
  const fim = Number(ultimaModificacaoMs);
  const dur = Number(duracaoVideoS);
  if (!Number.isFinite(fim) || !Number.isFinite(dur) || dur <= 0) return null;
  return new Date(fim - dur * 1000);
}

/* ------------------------------------------------------------ MARCACAO
 * O que cada tecla faz, como funcoes puras: recebem a marcacao e o tempo
 * do video e devolvem { marcacao, aviso }. O aviso e' o porque de NAO ter
 * marcado, escrito para quem esta' diante do video; sem aviso, marcou.
 * As mesmas travas do cronometro ao vivo: volume com a linha parada nao
 * conta, e o mesmo volume nao entra duas vezes.
 *
 * marcacao = { largadaMs, toques: [{ ms, ordem }], paradas: [{ motivo,
 *   inicioMs, fimMs }], aberta: { motivo, inicioMs } | null, ordem }
 * `ordem` e' a ordem em que se marcou — o Desfazer desfaz o ULTIMO
 * MARCADO, que pode nao ser o ultimo no video (voltou e marcou um antes).
 */
export const marcacaoVazia = () => ({ largadaMs: null, toques: [], paradas: [], aberta: null, ordem: 0 });

const dentroDeParada = (paradas, ms) => paradas.find((p) => ms > p.inicioMs && ms < p.fimMs) || null;

/** Enter: a largada, se ainda nao ha'; depois, um volume. */
export function marcarToque(m, msBruto) {
  const ms = inteiro(msBruto);
  if (m.aberta) return { marcacao: m, aviso: 'A linha está parada: aperte P (Voltou) antes de marcar volume.' };
  if (m.largadaMs == null) return { marcacao: { ...m, largadaMs: ms } };
  if (ms <= m.largadaMs) {
    return { marcacao: m, aviso: `Antes da largada (${emRelogio(m.largadaMs)}): avance o vídeo até depois dela.` };
  }
  if (m.toques.some((t) => Math.abs(t.ms - ms) < TOQUE_REPETIDO_MS)) {
    return { marcacao: m, aviso: 'Este volume já está marcado neste ponto do vídeo.' };
  }
  const parada = dentroDeParada(m.paradas, ms);
  if (parada) {
    return {
      marcacao: m,
      aviso: `Este ponto está dentro de uma parada (${emRelogio(parada.inicioMs)} a ${emRelogio(parada.fimMs)}).`,
    };
  }
  const ordem = m.ordem + 1;
  return {
    marcacao: { ...m, ordem, toques: [...m.toques, { ms, ordem }].sort((a, b) => a.ms - b.ms) },
  };
}

/** Backspace: o ultimo volume MARCADO; sem volume, a largada (se nada depende dela). */
export function desfazerUltimo(m) {
  if (m.toques.length) {
    const ultimo = m.toques.reduce((a, b) => (b.ordem > a.ordem ? b : a));
    return { marcacao: { ...m, toques: m.toques.filter((t) => t !== ultimo) } };
  }
  if (m.largadaMs == null) return { marcacao: m, aviso: 'Nada para desfazer.' };
  if (m.paradas.length || m.aberta) {
    return { marcacao: m, aviso: 'Remova as paradas antes de desfazer a largada.' };
  }
  return { marcacao: { ...m, largadaMs: null } };
}

/** Um volume pela lista (o "x" da linha), qualquer que seja a ordem. */
export function removerVolume(m, ms) {
  return { marcacao: { ...m, toques: m.toques.filter((t) => t.ms !== ms) } };
}

/** P (Parou): abre a parada neste ponto, com o motivo escolhido. */
export function iniciarParadaNoVideo(m, motivo, msBruto) {
  const ms = inteiro(msBruto);
  if (m.largadaMs == null) return { marcacao: m, aviso: 'Dê a largada antes: a parada fica dentro do período.' };
  if (m.aberta) return { marcacao: m, aviso: 'Já há uma parada aberta: aperte P para o Voltou.' };
  if (ms <= m.largadaMs) return { marcacao: m, aviso: 'A parada tem de começar depois da largada.' };
  if (dentroDeParada(m.paradas, ms)) return { marcacao: m, aviso: 'Este ponto já está dentro de outra parada.' };
  return { marcacao: { ...m, aberta: { motivo, inicioMs: ms } } };
}

/** P de novo (Voltou): fecha a parada aberta neste ponto. */
export function encerrarParadaNoVideo(m, msBruto) {
  const ms = inteiro(msBruto);
  const { aberta } = m;
  if (!aberta) return { marcacao: m, aviso: 'Não há parada aberta.' };
  if (ms <= aberta.inicioMs) {
    return { marcacao: m, aviso: `O Voltou tem de vir depois do Parou (${emRelogio(aberta.inicioMs)}).` };
  }
  const nova = { ...aberta, fimMs: ms };
  if (m.toques.some((t) => t.ms > nova.inicioMs && t.ms < nova.fimMs)) {
    return { marcacao: m, aviso: 'Há volume marcado dentro deste intervalo: remova-o ou ajuste o Voltou.' };
  }
  if (m.paradas.some((p) => nova.inicioMs < p.fimMs && p.inicioMs < nova.fimMs)) {
    return { marcacao: m, aviso: 'Esta parada se sobrepõe a outra já marcada.' };
  }
  const paradas = [...m.paradas, nova].sort((a, b) => a.inicioMs - b.inicioMs);
  return { marcacao: { ...m, aberta: null, paradas } };
}

/** O "x" da parada na lista; a aberta sai pelo mesmo caminho. */
export function removerParada(m, inicioMs) {
  if (m.aberta && m.aberta.inicioMs === inicioMs) return { marcacao: { ...m, aberta: null } };
  return { marcacao: { ...m, paradas: m.paradas.filter((p) => p.inicioMs !== inicioMs) } };
}
