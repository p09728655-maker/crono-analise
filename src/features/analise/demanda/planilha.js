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
 * guardado. Planilha configurada mas PARADA (falta variavel, dois grupos):
 * vale o colado — e a colagem segue aberta.
 */
export function textoDaFalha(planilha, agora = new Date()) {
  if (planilha?.estado !== 'erro') return null;
  if (!planilha.ativa) {
    return `A leitura da planilha do PCP está configurada, mas parada: ${planilha.mensagem}. `
      + 'Enquanto isso, vale o programa colado aqui.';
  }
  const quando = quandoLida(planilha.lidaEm, agora);
  return `Não deu para ler a planilha do PCP: ${planilha.mensagem}. `
    + `Continua valendo o programa guardado${quando ? ` (lido ${quando})` : ''}; a leitura tenta de novo em 1 minuto.`;
}
