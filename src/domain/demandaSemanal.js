/**
 * DEMANDA SEMANAL — o programa de producao, semana a semana.
 *
 * O PCP mantem a quantidade programada numa planilha (SEMANA, LOTE 1..5,
 * TOTAL SEMANA). Sem ela o relatorio de ritmo responde "quanto o posto
 * entrega" e nunca "isso basta?" — que e' a pergunta que a reuniao faz.
 *
 * POR QUE POR SEMANA, E NAO UM NUMERO SO': a demanda varia demais para
 * caber num campo fixo. Nas 36 semanas de 2026 medidas pelo PCP a media
 * foi 107.086 pecas com desvio de 18.723 (CV 17,5%) — da menor semana
 * (64.750) para a maior (134.586) sao 2,08x. Um takt fixo na media erra
 * 66% na semana fraca. O numero tem de vir com a semana a que pertence.
 *
 * Este arquivo e' a PORTA: o assunto e' grande demais para um modulo so',
 * e cada pedaco dele responde uma pergunta diferente —
 *
 *   demanda/leitura.js      como o PCP escreve semana, data e numero
 *   demanda/colagem.js      qual coluna e' qual, na planilha colada
 *   demanda/calendario.js   a que semana da fabrica pertence uma data
 *   demanda/capacidade.js   o que a demanda exige, e o veredito
 *   demanda/formato.js      como a tela escreve, com a conta fechando
 *   demanda/programa.js     qual semana comparar, e o que falta
 *
 * Quem importa daqui continua importando daqui: a porta e' a mesma de
 * sempre, e nenhum dos sete arquivos que usavam este modulo mudou. Quem
 * precisar so' de um pedaco pode importa-lo direto.
 */
export { MAX_SEMANAS } from './demanda/colagem.js';
export { interpretarColagem } from './demanda/colagem.js';
export {
  chaveSemana, dataIso, lerCodigoSemana, lerDataPtBr, numeroPtBr, ordenarSemanas,
} from './demanda/leitura.js';
export {
  emUtc, intervaloIso, periodoDaSemana, periodosDoPrograma, semanaIso, semanaQueContem,
} from './demanda/calendario.js';
export {
  horasDeSetup, maquinasNecessarias, ritmoExigido, vereditoDaSemana,
} from './demanda/capacidade.js';
export { comoDia, comoHoras, comoPeriodo, contaDasHoras } from './demanda/formato.js';
export { leituraDaDemanda, resumoDaDemanda } from './demanda/programa.js';
