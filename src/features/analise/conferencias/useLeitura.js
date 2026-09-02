/**
 * As LEITURAS do relatorio — tudo o que se calcula por cima das medicoes
 * carregadas, ja' cortado pelo filtro da lateral.
 *
 * Cada leitura e' calculada UMA vez, aqui, porque quase todas tem dois
 * leitores: o painel na tela e a folha A4. Calcular em cada um deixaria os
 * dois divergirem um dia — e papel e tela dizendo coisas diferentes sobre
 * os mesmos numeros e' o comeco de uma discussao inutil na reuniao.
 *
 * As contas em si moram no dominio (cronoanalise, analiseConferencias,
 * comparativoMaquinas, ritmoPorCiclo, relatorioConferencias); aqui so' se
 * decide QUANDO recalcular. `mapaGrupos` entra nas dependencias no lugar
 * de `grupoDe`: a funcao e' recriada a cada render e reiniciaria as
 * leituras a toa — o que muda a leitura e' o cadastro.
 */
import { useMemo } from 'react';
import {
  comparativoDeParadas, resumirConferencias, ritmoPorHoraDoDia,
} from '../../../domain/cronoanalise.js';
import { analisarConferencias } from '../../../domain/analiseConferencias.js';
import { compararMaquinas } from '../../../domain/comparativoMaquinas.js';
import { classesDeCiclo } from '../../../domain/ritmoPorCiclo.js';
import {
  barrasPorMedicao, filtrarPorMaquina, filtrarResumo, itensDaLateral, resumoDoPeriodo,
} from '../../../domain/relatorioConferencias.js';

export function useLeitura({ linhas, filtro, mapaGrupos, grupoDe }) {
  const resumo = useMemo(() => resumirConferencias(linhas), [linhas]);
  // Ritmo POR PECA: mesmo calculo, agrupado por peca x maquina — e' o
  // numero que dimensiona carga e lote. Ver resumirConferencias.
  const resumoPecas = useMemo(() => resumirConferencias(linhas, { porPeca: true }), [linhas]);

  const visiveis = useMemo(() => filtrarPorMaquina(linhas, filtro), [linhas, filtro]);
  const resumoVisivel = useMemo(() => filtrarResumo(resumo, filtro), [resumo, filtro]);
  const resumoPecasVisivel = useMemo(() => filtrarResumo(resumoPecas, filtro), [resumoPecas, filtro]);

  const analise = useMemo(
    () => analisarConferencias({
      maquinas: resumoVisivel, pecas: resumoPecasVisivel, conferencias: visiveis, grupoDe,
    }),
    [resumoVisivel, resumoPecasVisivel, visiveis, mapaGrupos],
  );

  const barrasDoFiltro = useMemo(() => barrasPorMedicao(visiveis, filtro), [filtro, visiveis]);

  const painel = useMemo(() => resumoDoPeriodo(visiveis, resumoVisivel), [visiveis, resumoVisivel]);

  /**
   * A CURVA DO DIA: o ritmo por hora do relogio, juntando as medicoes
   * feitas na mesma hora de qualquer data. So' com UMA maquina em vista.
   * Misturando postos, a hora "fraca" pode ser so' a hora em que a maquina
   * mais lenta foi medida — a curva diria "as 9h rende menos" quando o que
   * mudou foi a maquina, nao a hora. Com uma maquina (filtrada na lateral,
   * ou porque so' ha' uma), a comparacao e' hora contra hora do mesmo posto.
   */
  const curvaDoDia = useMemo(
    () => (resumoVisivel.length === 1 ? ritmoPorHoraDoDia(visiveis) : []),
    [visiveis, resumoVisivel.length],
  );

  /**
   * O COMPARATIVO do periodo: o que saiu x o que teria saido no MESMO
   * tempo, sem parada. Some quando nao houve parada, porque ai' o que saiu
   * ja' E' o potencial e comparar seria inventar perda.
   */
  const comparativo = useMemo(() => comparativoDeParadas(resumoVisivel), [resumoVisivel]);

  /**
   * O COMPARATIVO ENTRE MAQUINAS — "qual esta' melhor?". Usa o GRUPO do
   * cadastro para saber quais maquinas podem ser comparadas entre si. Com
   * uma maquina escolhida na lateral nao ha' com quem comparar: o quadro
   * simplesmente nao aparece (compararMaquinas devolve grupo nenhum com
   * uma maquina so').
   */
  const entreMaquinas = useMemo(
    () => compararMaquinas({ maquinas: resumoVisivel, pecas: resumoPecasVisivel, grupoDe }),
    [resumoVisivel, resumoPecasVisivel, mapaGrupos],
  );

  /**
   * AS CLASSES DE CICLO — pecas agrupadas por quantos acionamentos do motor
   * pedem. E' a leitura que responde "as pecas sao diferentes, e dai'?": com
   * a mesma furacao, o ritmo deveria bater, e quem foge da faixa aponta para
   * o manuseio.
   */
  const porCiclo = useMemo(() => classesDeCiclo(resumoPecasVisivel), [resumoPecasVisivel]);

  /* A lateral: as maquinas debaixo do grupo do cadastro. Sai do resumo
     INTEIRO (nao do filtrado) — e' ela que escolhe o filtro. */
  const secoes = useMemo(
    () => itensDaLateral({ resumo, total: linhas.length, grupoDe }),
    [resumo, linhas.length, mapaGrupos],
  );

  return {
    resumo, visiveis, resumoVisivel, resumoPecasVisivel, analise, barrasDoFiltro, painel,
    curvaDoDia, comparativo, entreMaquinas, porCiclo, secoes,
  };
}
