/**
 * Nucleo da cronoanalise: TO -> TN -> TP -> capacidade.
 * Funcoes puras. Toda a matematica do sistema mora aqui.
 *
 * Este arquivo e' a PORTA. A matematica esta' em crono/, um arquivo por
 * assunto — quarenta e dois arquivos importam daqui, e mudar o caminho de
 * cada um so' para reorganizar a casa seria trocar risco por arrumacao:
 *
 *   crono/paradas.js      o catalogo de motivos e o tempo que cada um comeu
 *   crono/operacao.js     TO -> TN -> TP, com a carta de controle
 *   crono/conferencia.js  a medicao do posto: relogio, rodando, resumo
 *   crono/maquinas.js     o posto ao longo do dia e o conjunto de maquinas
 *   crono/capacidade.js   takt, operadores e OEE
 *   crono/formato.js      duracao, decimal e cronometro, como a tela escreve
 *   crono/intervalos.js   peca a peca: o intervalo entre uma e a seguinte
 */
export { MOTIVOS_PARADA } from './crono/paradas.js';
export {
  acaoDoMotivo, definirCatalogoParadas, resumirParadasDoEstudo, rotuloMotivo, somarParadas,
} from './crono/paradas.js';
export { FR_PRESETS, amostraSuficiente, calcularOperacao } from './crono/operacao.js';
export {
  CRITERIOS_CONFERENCIA, conferenciaRapida, nomeChave, potencialSemParada, resumirConferencias,
} from './crono/conferencia.js';
export { comparativoDeParadas, ritmoPorHoraDoDia } from './crono/maquinas.js';
export {
  CRITERIOS_INTERVALOS, MAX_MARCAS, intervalosEntreMarcas, leituraPecaAPeca, marcasValidas,
} from './crono/intervalos.js';
export {
  comparativoCapacidade, dimensionarOperadores, oee, operadoresNecessarios, taktTime,
} from './crono/capacidade.js';
export {
  duracaoEntreHoras, faixaHoraria, formatarCronometro, formatarDuracao, formatarSegundos,
  numeroDecimal, textoDecimal, unidadeDoPosto,
} from './crono/formato.js';
