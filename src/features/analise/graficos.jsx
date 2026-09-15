/**
 * Graficos de cronoanalise em SVG inline.
 *
 * Sem biblioteca de charts: sao formas conhecidas, o SVG e' nativo, e o
 * resultado imprime com nitidez de vetor. Uma dependencia aqui custaria
 * mais KB que todo o resto do app.
 *
 * Identidade nunca depende so' de cor:
 *  - legenda sempre presente (2 series);
 *  - a serie de tolerancia leva TEXTURA hachurada, entao continua distinguivel
 *    em impressao P&B e para quem tem daltonismo;
 *  - gargalo e ponto fora de controle levam forma + rotulo, nao so' cor.
 *
 * Este arquivo e' a PORTA. Cada grafico mora no proprio arquivo em
 * graficos/, e o que os quatro dividem — a medida do container, a escala,
 * as texturas, a legenda e os estilos — esta' em graficos/comuns.jsx e
 * graficos/estilos.js. Sao esses dois que mantem os quatro parecidos.
 */
export { GraficoYamazumi } from './graficos/Yamazumi.jsx';
export { GraficoTendencia } from './graficos/Tendencia.jsx';
export { GraficoTendenciaPeriodo } from './graficos/TendenciaPeriodo.jsx';
export { GraficoRitmoMaquinas } from './graficos/RitmoMaquinas.jsx';
