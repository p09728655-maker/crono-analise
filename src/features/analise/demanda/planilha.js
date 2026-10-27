/**
 * O PROGRAMA QUE VEM DA PLANILHA DO PCP — como a tela diz de onde ele veio,
 * quando foi lido e o que deu errado.
 *
 * O servidor le a planilha da embalagem sozinho (api/_lib/programaEmbalagem.js)
 * e devolve, junto do programa, o estado da leitura. Takt sem idade e' o
 * risco: um programa de ontem com cara de atual. Por isso toda tela que usa
 * o programa da planilha diz QUANDO ele foi lido, e a falha aparece por
 * escrito, com o que fazer.
 */
const FUSO = 'America/Sao_Paulo';

const diaDe = (d) => d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const chaveDoDia = (d) => d.toLocaleDateString('pt-BR', { timeZone: FUSO });

/** "hoje às 10:32" ou "em 26/10 às 10:32", no relogio da fabrica. */
export function quandoLida(iso, agora = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  return chaveDoDia(d) === chaveDoDia(agora) ? `hoje às ${hora}` : `em ${diaDe(d)} às ${hora}`;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** As linhas que a leitura deixou de fora, por escrito — ou null. */
export function linhasDeFora(ignoradas) {
  if (!ignoradas) return null;
  const partes = [
    ignoradas.semData > 0 && plural(ignoradas.semData, 'sem data', 'sem data'),
    ignoradas.semQuantidade > 0 && plural(ignoradas.semQuantidade, 'sem quantidade', 'sem quantidade'),
    ignoradas.duplicadas > 0 && plural(ignoradas.duplicadas, 'repetida entre as abas', 'repetidas entre as abas'),
  ].filter(Boolean);
  if (!partes.length) return null;
  const total = ignoradas.semData + ignoradas.semQuantidade + ignoradas.duplicadas;
  return `${plural(total, 'linha ficou', 'linhas ficaram')} de fora: ${partes.join(', ')}.`;
}

/**
 * A frase da falha. Planilha que MANDA no programa e nao foi lida: vale o
 * guardado, e a semana ainda nao lida fica sem takt — colar nao e' saida (o
 * codigo de semana do PCP cairia por cima de outra semana; ver
 * api/_lib/programaEmbalagem.js). Planilha configurada mas PARADA (falta
 * variavel, dois grupos): vale o que esta' gravado.
 */
export function textoDaFalha(planilha, agora = new Date()) {
  if (planilha?.estado !== 'erro') return null;
  if (!planilha.ativa) {
    return `A leitura da planilha do PCP está configurada, mas parada: ${planilha.mensagem}. `
      + 'Enquanto isso, vale o programa que está gravado.';
  }
  const quando = quandoLida(planilha.lidaEm, agora);
  return `Não deu para ler a planilha do PCP: ${planilha.mensagem}. `
    + `Continua valendo o programa guardado${quando ? ` (lido ${quando})` : ''}, e a leitura tenta de novo `
    + 'em 1 minuto. Semana que ainda não foi lida fica sem takt até a leitura voltar: corrija o que '
    + 'o motivo aponta.';
}

/**
 * Por que a colagem NAO aparece no grupo — ou null quando ela aparece, ou
 * quando o quadro da planilha ja' diz (lendo: "altere a planilha").
 *
 * Grupo com semana lida da planilha nao recebe colagem em estado nenhum: a
 * lida e' numerada pelo calendario e a colagem traz o codigo de semana do
 * PCP, e uma cairia por cima de outra (api/_lib/demanda.js). Parada, a saida
 * e' corrigir a leitura; desligada, apagar o programa do grupo.
 */
export function porQueSemColagem({ planilha, lidas }) {
  if (planilha?.ativa || !lidas) return null;
  const motivo = 'Colar fica fechado: o grupo tem semanas lidas da planilha do PCP, numeradas pelo '
    + 'calendário, e a colagem traz o código de semana do PCP — uma semana cairia por cima de outra.';
  return planilha
    ? `${motivo} Corrija a leitura (o motivo está acima).`
    : `${motivo} A leitura está desligada: para voltar a colar, apague o programa do grupo, abaixo.`;
}
