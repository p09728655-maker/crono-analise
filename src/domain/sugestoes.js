/**
 * SUGESTOES DE MELHORIA — o que fazer com os numeros do estudo.
 *
 * O painel responde "quanto" (tempo padrao, capacidade, operadores). Isto
 * responde "e agora": le os mesmos numeros e devolve uma lista priorizada
 * de acoes de chao de fabrica, cada uma com o diagnostico que a motivou.
 *
 * Duas regras de projeto:
 *
 *  1. TODA sugestao carrega uma ACAO concreta. Diagnostico sem acao vira
 *     numero na parede: "CV de 130%" nao muda nada; "revisar o MOP e
 *     treinar no metodo padrao" muda.
 *
 *  2. NENHUMA sugestao manda coletar mais ciclos. A meta de amostra e'
 *     decisao do analista — o app declara a confiabilidade do que tem e
 *     nao cobra observacao de ninguem (decisao de processo, ago/2026).
 *
 * Funcao pura: recebe numeros ja' calculados, devolve dados. Nao conhece
 * React, nem tela, nem o formato do relatorio.
 */
import { acaoDoMotivo, formatarDuracao, formatarSegundos } from './cronoanalise.js';

const ORDEM = { alta: 0, media: 1, baixa: 2 };

/**
 * Ordem dentro da mesma prioridade.
 *
 * Comparar `peso` entre tipos diferentes nao significa nada — um e' CV em
 * %, outro e' tempo parado em ms, e o ms sempre ganharia por ser um numero
 * grande. Entao a ordem e' por TIPO primeiro (o gargalo trava a linha
 * inteira: vem antes de qualquer outra coisa), e o peso so' desempata
 * dentro do mesmo tipo.
 */
const GRUPO = { gargalo: 0, parada: 1, cv: 2, tendencia: 3, ocioso: 4 };

export const PRIORIDADES = {
  alta: { rotulo: 'Alta', descricao: 'Trata primeiro: afeta o tempo padrão ou o ritmo da linha.' },
  media: { rotulo: 'Média', descricao: 'Vale investigar depois das de alta.' },
  baixa: { rotulo: 'Baixa', descricao: 'Ajuste fino, sem urgência.' },
};

/**
 * Gera as sugestoes do estudo.
 *
 * @param operacoes  [{ id, nome, resultado }] — resultado de calcularOperacao
 * @param taktMs     ritmo exigido pela demanda (0 = nao configurado)
 * @param gargalo    a operacao de maior TP por peca, ou null
 * @param paradas    resumo de resumirParadasDoEstudo, ou null
 */
export function sugerirMelhorias({ operacoes = [], taktMs = 0, gargalo = null, paradas = null } = {}) {
  const lista = [];
  const comDados = (operacoes || []).filter((o) => o?.resultado);

  for (const op of comDados) {
    const r = op.resultado;

    /**
     * Variacao alta e' o achado que mais custa: o tempo padrao sai de uma
     * media que nao descreve ciclo nenhum, e o dimensionamento herda o erro.
     */
    if (r.cvPct > 20) {
      lista.push({
        id: `cv-${op.id}`,
        prioridade: 'alta',
        grupo: GRUPO.cv,
        peso: r.cvPct,
        operacao: op.nome,
        titulo: 'Alta variação no tempo de ciclo',
        diagnostico: `CV de ${r.cvPct.toFixed(1)}% em ${r.n} ciclos — o processo não se repete igual.`,
        acao: 'Análise de causa raiz (Ishikawa) no posto. Criar ou revisar o MOP e treinar os operadores no método padrão antes de fechar o tempo.',
      });
    } else if (r.cvPct > 10) {
      lista.push({
        id: `cv-${op.id}`,
        prioridade: 'media',
        grupo: GRUPO.cv,
        peso: r.cvPct,
        operacao: op.nome,
        titulo: 'Variação moderada no tempo de ciclo',
        diagnostico: `CV de ${r.cvPct.toFixed(1)}% em ${r.n} ciclos.`,
        acao: 'Comparar o método entre operadores e checar abastecimento e organização do posto (5S). Diferença de gesto costuma explicar essa faixa.',
      });
    }

    /**
     * Tendencia ao longo da coleta. Sobe: fadiga, ferramenta gastando,
     * abastecimento piorando. Cai: curva de aprendizado — e ai o tempo
     * padrao calculado sobre a coleta inteira sai inflado.
     */
    if (r.tendencia?.direcao === 'degradacao') {
      lista.push({
        id: `tend-${op.id}`,
        prioridade: 'media',
        grupo: GRUPO.tendencia,
        peso: Math.abs(r.tendencia.pct || 0),
        operacao: op.nome,
        titulo: 'Tempos subindo ao longo da coleta',
        diagnostico: 'Os ciclos ficaram mais lentos do início para o fim da medição.',
        acao: 'Verificar fadiga, vida útil da ferramenta e abastecimento do posto. Se a causa for fadiga, ela precisa entrar na tolerância, não no tempo normal.',
      });
    } else if (r.tendencia?.direcao === 'aprendizado') {
      lista.push({
        id: `tend-${op.id}`,
        prioridade: 'baixa',
        grupo: GRUPO.tendencia,
        peso: Math.abs(r.tendencia.pct || 0),
        operacao: op.nome,
        titulo: 'Curva de aprendizado na coleta',
        diagnostico: 'Os ciclos foram ficando mais rápidos — o operador ainda estava pegando o ritmo no começo.',
        acao: 'Considerar cronometrar uma rodada nova com o operador já aquecido: a média da coleta inteira puxa o tempo padrão para cima.',
      });
    }
  }

  /**
   * Gargalo acima do Takt: a linha nao entrega o que a demanda pede, e
   * nenhuma melhoria nos outros postos muda isso enquanto este nao ceder.
   */
  if (taktMs > 0 && gargalo?.resultado?.tpPorPeca > taktMs) {
    const acima = ((gargalo.resultado.tpPorPeca / taktMs) - 1) * 100;
    lista.push({
      id: 'gargalo',
      prioridade: 'alta',
      // Sempre no topo das de alta: e' o unico achado que trava a linha.
      grupo: GRUPO.gargalo,
      peso: acima,
      operacao: gargalo.nome,
      titulo: 'Gargalo acima do Takt',
      diagnostico: `${formatarSegundos(gargalo.resultado.tpPorPeca)} s por peça contra ${formatarSegundos(taktMs)} s exigidos — ${acima.toFixed(0)}% acima do ritmo da demanda.`,
      acao: 'Balancear a linha: mover elemento desta operação para outra com folga, dividir o posto ou reduzir o conteúdo de trabalho. Sem isso a linha não atinge o Takt.',
    });
  }

  /**
   * Paradas: perda ja' medida, com dono e acao conhecidos. A prioridade sai
   * do PESO no tempo observado, nao do motivo em si — 40 min de falta de
   * material e 2 min de falta de material nao pedem a mesma reuniao.
   */
  for (const m of paradas?.porMotivo || []) {
    const fatia = paradas.totalMs > 0 ? (m.ms / paradas.totalMs) * 100 : 0;
    const doObservado = paradas.pctDoObservado * (fatia / 100);
    lista.push({
      id: `parada-${m.motivo}`,
      grupo: GRUPO.parada,
      prioridade: doObservado >= 15 ? 'alta' : (doObservado >= 5 ? 'media' : 'baixa'),
      peso: m.ms,
      operacao: null,
      titulo: `Parada: ${m.rotulo}`,
      diagnostico: `${formatarDuracao(m.ms)} em ${m.n} ocorrência(s) — ${fatia.toFixed(0)}% de todo o tempo parado, ${doObservado.toFixed(1)}% do tempo observado.`,
      acao: acaoDoMotivo(m.motivo),
    });
  }

  /**
   * Posto ocioso frente ao Takt: a linha entrega, mas com gente parada. So'
   * faz sentido quando ha Takt configurado e sobra folga em TODAS.
   */
  if (taktMs > 0 && comDados.length > 1) {
    const ociosas = comDados.filter((o) => o.resultado.tpPorPeca < taktMs * 0.5);
    if (ociosas.length === comDados.length) {
      lista.push({
        id: 'ocioso',
        prioridade: 'baixa',
        grupo: GRUPO.ocioso,
        peso: 0,
        operacao: null,
        titulo: 'Todas as operações bem abaixo do Takt',
        diagnostico: `Nenhuma passa de metade dos ${formatarSegundos(taktMs)} s exigidos por peça.`,
        acao: 'Avaliar acumular operações no mesmo operador — ou rever o Takt, se a demanda usada no cálculo já não é a atual.',
      });
    }
  }

  return lista.sort((a, b) => ORDEM[a.prioridade] - ORDEM[b.prioridade] || a.grupo - b.grupo || b.peso - a.peso);
}

/** Contagem por prioridade — o cabecalho da secao mostra isso antes da lista. */
export function contarPorPrioridade(sugestoes) {
  return (sugestoes || []).reduce(
    (acc, s) => ({ ...acc, [s.prioridade]: (acc[s.prioridade] || 0) + 1 }),
    { alta: 0, media: 0, baixa: 0 },
  );
}
