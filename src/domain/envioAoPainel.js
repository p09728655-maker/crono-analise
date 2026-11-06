/**
 * A MEDICAO NO PAINEL RitmoPatrimar — onde ela esta', para a TELA.
 *
 * O envio mora no servidor (api/_lib/painel.js); aqui so' se junta o que o
 * BANCO disse ao carregar a lista (painel_em, painel_erro) com o que ESTA
 * tela acabou de fazer (o desfecho do envio de agora, que ainda nao esta'
 * na lista). Puro de proposito: a lista, o aviso e o volume a volume leem a
 * mesma regra, e tres leituras proprias acabariam dizendo coisas
 * diferentes da mesma medicao.
 */

/**
 * Os desfechos em que a medicao ESTA' no painel: ele a aceitou agora, ou
 * disse que ja' a tinha (a mesma medicao importada antes pelo PDF, ou um
 * reenvio). O servidor grava painel_em nos dois — e so' neles.
 */
export const NO_PAINEL = Object.freeze(['enviada', 'ja-estava']);

/**
 * A situacao de UMA medicao:
 *   { tipo: 'na-fila' | 'enviando' }   o envio desta tela ainda nao voltou;
 *   { tipo: 'no-painel', em, estado, substituida }
 *                                      esta' la' (em = quando o painel aceitou);
 *   { tipo: 'nao-foi', motivo, em }    a ULTIMA tentativa nao foi, e por que
 *                                      (`em`: uma versao anterior esta' la');
 *   { tipo: 'desligado' }              esta tela tentou e o envio esta' desligado;
 *   { tipo: 'nunca' }                  ninguem tentou ainda.
 *
 * `local` e' o desfecho guardado pela tela: { fase: 'na-fila'|'enviando' },
 * { fase: 'feito', estado, em, erro, substituida } (o que o servidor
 * respondeu: o retrato do banco depois da tentativa) ou { fase: 'feito',
 * falha } (o nosso servidor nem respondeu — o banco pode ter mudado ou nao).
 *
 * A ULTIMA TENTATIVA MANDA. A medicao reaberta, com uma parada marcada e
 * salva de novo, vai ao painel com numeros novos, e o painel troca a linha.
 * Se esse reenvio falha, o painel continua com os numeros VELHOS: "no
 * painel" ali esconderia justamente o que falta fazer. Por isso o motivo
 * vem antes de `em` — e `em` vai junto, para a tela dizer que uma versao
 * anterior esta' la'. Reenviar o que ja' estava igual nao custa nada: o
 * painel responde "ja' estava".
 */
export function situacaoNoPainel(medicao, local = null) {
  if (local?.fase === 'na-fila' || local?.fase === 'enviando') return { tipo: local.fase };
  const feito = local?.fase === 'feito';
  const doServidor = feito && !local.falha && Boolean(local.estado) && local.estado !== 'desligado';
  let em = medicao?.painel_em ?? null;
  let motivo = medicao?.painel_erro ?? null;
  if (feito && local.falha) motivo = local.falha;
  else if (doServidor) {
    // O que o servidor respondeu E' o banco depois da tentativa.
    em = local.em ?? null;
    motivo = local.erro ?? null;
  }
  if (motivo) return { tipo: 'nao-foi', motivo, em };
  if (em) {
    return {
      tipo: 'no-painel',
      em,
      // O desfecho DESTA tela (enviada / ja-estava), quando foi ela que mandou.
      estado: doServidor && NO_PAINEL.includes(local.estado) ? local.estado : null,
      // Reenviada com outros numeros: o painel trocou a linha dela.
      substituida: doServidor && Boolean(local.substituida),
    };
  }
  if (feito && local.estado === 'desligado') return { tipo: 'desligado' };
  return { tipo: 'nunca' };
}

/** Ainda nao esta' no painel, e nada desta tela esta' a caminho: da' para (re)enviar. */
export const podeEnviarAoPainel = (situacao) => ['nao-foi', 'nunca', 'desligado'].includes(situacao?.tipo);
