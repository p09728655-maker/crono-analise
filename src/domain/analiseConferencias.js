/**
 * ANALISE AUTOMATICA das medicoes das furadeiras — sem IA e sem chave.
 *
 * Pedido de 31/08: a "Análise com IA" gastava a chave do usuario para dizer
 * o que os proprios numeros do relatorio ja' dizem. Esta funcao le o MESMO
 * resumo que subia para a IA (por maquina e por peca) e escreve a leitura
 * por regra: e' instantanea, gratuita, funciona offline e sai identica para
 * os mesmos numeros — da' para conferir na calculadora.
 *
 * Mesmas regras de projeto de sugerirMelhorias:
 *  1. Toda conclusao vem com o numero que a motivou.
 *  2. Linguagem de fabrica, sem jargao (modelo basico de 31/08): nada de
 *     CV%, SMED ou "amostra" — e' "o ritmo varia muito", "organizar a
 *     troca", "ainda em medicao".
 *
 * Funcao pura: recebe os resumos ja' calculados (resumirConferencias, por
 * maquina e por peca), devolve secoes de texto. Nao conhece React nem tela.
 *
 * @param maquinas  resultado de resumirConferencias(linhas)
 * @param pecas     resultado de resumirConferencias(linhas, { porPeca: true })
 * @returns [{ titulo, linhas: [string] }] — secoes na ordem de leitura
 */
import { CRITERIOS_CONFERENCIA, formatarDuracao } from './cronoanalise.js';

const MS_POR_HORA = 3600000;

const pMin = (pecasPorHora) => (pecasPorHora / 60).toFixed(1);
const ritmoTexto = (pph) => `${Math.round(pph)} pç/h (${pMin(pph)} pç/min)`;

/** "medição" / "medições" — o plural errado denuncia texto de máquina. */
const plural = (n, singular, muitos) => `${n} ${n === 1 ? singular : muitos}`;

/**
 * O que falta para a referencia firmar, em palavras — nunca em criterio.
 * Devolve null quando nada falta.
 */
function oQueFalta(g) {
  const c = CRITERIOS_CONFERENCIA;
  const partes = [];
  const faltamConf = Math.max(0, c.minConferencias - g.n);
  const faltamMin = Math.max(0, Math.ceil((c.minTempoTotalMs - g.totalProdutivoMs) / 60000));
  if (faltamConf > 0) partes.push(`mais ${plural(faltamConf, 'medição', 'medições')}`);
  if (faltamMin > 0) partes.push(`mais ${faltamMin} min de máquina rodando`);
  if (g.curtas > 0) {
    partes.push(`${plural(g.curtas, 'medição foi', 'medições foram')} de menos de ${formatarDuracao(c.minPeriodoMs)} — prefira períodos mais longos`);
  }
  return partes.length ? partes.join(' e ') : null;
}

/** A variacao entre medicoes, em palavras. Null quando nao ha o que dizer. */
function variacaoTexto(g) {
  if (g.cvPct == null || g.n < 2) return null;
  if (g.cvPct <= 10) return 'o ritmo se repete bem entre as medições';
  if (g.cvPct <= 20) return 'o ritmo varia um pouco entre as medições';
  return 'o ritmo varia muito entre as medições — vale olhar o que muda (peça, operador, abastecimento)';
}

export function analisarConferencias({ maquinas = [], pecas = [] } = {}) {
  const secoes = [];
  if (!maquinas.length) return secoes;

  /* ------------------------------------------------- 1. leitura geral */
  const totPecas = maquinas.reduce((acc, g) => acc + g.totalPecas, 0);
  const totProdutivo = maquinas.reduce((acc, g) => acc + g.totalProdutivoMs, 0);
  const totParada = maquinas.reduce((acc, g) => acc + g.totalParadaMs, 0);
  const totSetup = maquinas.reduce((acc, g) => acc + g.totalSetupMs, 0);
  const totMedicoes = maquinas.reduce((acc, g) => acc + g.n, 0);
  const ritmoGeral = totProdutivo > 0 ? (totPecas * MS_POR_HORA) / totProdutivo : null;

  const geral = [];
  if (ritmoGeral != null) {
    geral.push(
      `${plural(totMedicoes, 'medição', 'medições')} em ${plural(maquinas.length, 'máquina', 'máquinas')}: `
      + `${totPecas} peças em ${formatarDuracao(totProdutivo)} de máquina rodando — ritmo médio de ${ritmoTexto(ritmoGeral)}.`,
    );
  }
  if (totParada > 0) {
    geral.push(
      `Tempo parado: ${formatarDuracao(totParada)}`
      + (totSetup > 0 ? `, sendo ${formatarDuracao(totSetup)} em troca/setup` : '')
      + '. Esse tempo não conta no ritmo — mas é produção que deixou de sair.',
    );
  }
  secoes.push({ titulo: 'Leitura geral', linhas: geral });

  /* ------------------------------------------------- 2. por maquina */
  const porMaquina = maquinas.map((g) => {
    const pedacos = [`${g.maquina}: ${ritmoTexto(g.ritmoMedio)} em ${plural(g.n, 'medição', 'medições')}`];
    const variacao = variacaoTexto(g);
    if (variacao) pedacos.push(variacao);
    if (!g.confiavel) {
      const falta = oQueFalta(g);
      pedacos.push(`ainda em medição${falta ? ` (para firmar: ${falta})` : ''}`);
    }
    return `${pedacos.join(' — ')}.`;
  });
  secoes.push({ titulo: 'Por máquina', linhas: porMaquina });

  /* ------------------------------------------- 3. comparacao entre maquinas */
  if (maquinas.length >= 2) {
    const ordenadas = [...maquinas].sort((a, b) => b.ritmoMedio - a.ritmoMedio);
    const rapida = ordenadas[0];
    const lenta = ordenadas[ordenadas.length - 1];
    if (lenta.ritmoMedio > 0) {
      const pct = Math.round(((rapida.ritmoMedio / lenta.ritmoMedio) - 1) * 100);
      const linhas = [];
      if (pct >= 5) {
        linhas.push(
          `${rapida.maquina} está rodando ${pct}% mais rápido que ${lenta.maquina} `
          + `(${Math.round(rapida.ritmoMedio)} contra ${Math.round(lenta.ritmoMedio)} pç/h). `
          + 'Antes de concluir que uma máquina é melhor, confira se as duas mediram peças parecidas — peça com mais furação rende menos sem a máquina ser mais lenta.',
        );
      } else {
        linhas.push(`As máquinas estão rodando em ritmo parecido (diferença de ${pct}%).`);
      }
      const emMedicao = [rapida, lenta].filter((g) => !g.confiavel);
      if (emMedicao.length) {
        linhas.push(
          `${emMedicao.map((g) => g.maquina).join(' e ')} ainda em medição — compare de novo quando o número firmar.`,
        );
      }
      secoes.push({ titulo: 'Entre máquinas', linhas });
    }
  }

  /* ------------------------------------------------- 4. entre pecas */
  const pecasPorMaquina = new Map();
  for (const p of pecas) {
    if (!pecasPorMaquina.has(p.maquina)) pecasPorMaquina.set(p.maquina, []);
    pecasPorMaquina.get(p.maquina).push(p);
  }
  const linhasPecas = [];
  for (const [maquina, lista] of pecasPorMaquina) {
    if (lista.length < 2) continue;
    const ordenadas = [...lista].sort((a, b) => b.ritmoMedio - a.ritmoMedio);
    const rapida = ordenadas[0];
    const lenta = ordenadas[ordenadas.length - 1];
    if (lenta.ritmoMedio <= 0) continue;
    const pct = Math.round(((rapida.ritmoMedio / lenta.ritmoMedio) - 1) * 100);
    if (pct < 10) continue;
    linhasPecas.push(
      `Na ${maquina}, a peça mais rápida é ${rapida.peca} (${Math.round(rapida.ritmoMedio)} pç/h) `
      + `e a mais lenta é ${lenta.peca} (${Math.round(lenta.ritmoMedio)} pç/h) — diferença de ${pct}%. `
      + 'Para planejar carga e lote, use o ritmo da peça, não a média da máquina.',
    );
  }
  if (linhasPecas.length) secoes.push({ titulo: 'Entre peças', linhas: linhasPecas });

  /* ------------------------------------------------- 5. paradas */
  if (totParada > 0) {
    const porMotivo = new Map();
    for (const g of maquinas) {
      for (const m of g.paradasPorMotivo || []) {
        const atual = porMotivo.get(m.rotulo) || 0;
        porMotivo.set(m.rotulo, atual + m.ms);
      }
    }
    const maiores = [...porMotivo.entries()].sort((a, b) => b[1] - a[1]);
    const linhas = [];
    if (maiores.length) {
      const [rotulo, ms] = maiores[0];
      linhas.push(`O maior motivo de parada foi ${rotulo}: ${formatarDuracao(ms)} de ${formatarDuracao(totParada)} parados.`);
    }
    // Troca dominante pede organizacao de troca, nao maquina nova: e' o
    // ganho que nao custa investimento. Dito sem a sigla SMED.
    if (totSetup >= totParada / 2 && totSetup >= 10 * 60000) {
      linhas.push(
        'A troca é onde o tempo vai embora: deixar broca, gabarito e programa prontos ANTES de parar a máquina devolve produção sem investir nada.',
      );
    }
    secoes.push({ titulo: 'Paradas', linhas });
  }

  /* ------------------------------------------------- 6. proximo passo */
  const pendentes = maquinas.filter((g) => !g.confiavel);
  if (pendentes.length) {
    secoes.push({
      titulo: 'Próximo passo',
      linhas: [
        `Medir de novo: ${pendentes.map((g) => g.maquina).join(', ')}. `
        + `Períodos de ${formatarDuracao(CRITERIOS_CONFERENCIA.minPeriodoMs)} ou mais, de preferência em horários e operadores diferentes — é isso que firma o número.`,
      ],
    });
  }

  return secoes;
}
