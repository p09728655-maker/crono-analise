/**
 * ANALISE AUTOMATICA das medicoes das furadeiras — sem IA e sem chave.
 *
 * Pedido de 31/08: a "Análise com IA" gastava a chave do usuario para dizer
 * o que os proprios numeros do relatorio ja' dizem. Esta funcao le o MESMO
 * resumo que subia para a IA (por maquina e por peca) e escreve a leitura
 * por regra: e' instantanea, gratuita, funciona offline e sai identica para
 * os mesmos numeros — da' para conferir na calculadora.
 *
 * A ANALISE CRESCE COM OS DADOS (pedido de 31/08, parte 2): cada leitura
 * tem um minimo de medicoes para destravar, entao o texto fica mais
 * completo a cada medicao registrada —
 *   1 medicao   -> leitura geral e o que falta para firmar;
 *   2+ pecas    -> peca mais rapida x mais lenta;
 *   2+ maquinas -> comparacao entre maquinas;
 *   3+ medicoes -> ate onde o posto chega (melhor periodo x media);
 *   4+ medicoes -> tendencia (o ritmo esta subindo ou caindo no tempo);
 *   3+ da peca  -> peca cujo ritmo nao se repete.
 *
 * Mesmas regras de projeto de sugerirMelhorias:
 *  1. Toda conclusao vem com o numero que a motivou.
 *  2. Linguagem de fabrica, sem jargao (modelo basico de 31/08): nada de
 *     CV%, SMED ou "amostra" — e' "o ritmo varia muito", "organizar a
 *     troca", "ainda em medicao".
 *
 * Funcao pura: recebe os resumos ja' calculados (resumirConferencias, por
 * maquina e por peca) e as medicoes cruas (para ordenar no tempo), devolve
 * secoes de texto. Nao conhece React nem tela.
 *
 * @param maquinas      resultado de resumirConferencias(linhas)
 * @param pecas         resultado de resumirConferencias(linhas, { porPeca: true })
 * @param conferencias  as medicoes cruas (opcional) — so' a tendencia usa,
 *                      porque o resumo nao guarda a ordem no tempo
 * @param grupoDe       (nomeDaMaquina) => grupo do cadastro (opcional). E' o
 *                      que autoriza a comparacao entre maquinas: sem ele,
 *                      todas caem em "Sem grupo" e a leitura sai como antes
 *                      do cadastro existir.
 * @returns [{ titulo, linhas: [string] }] — secoes na ordem de leitura
 */
import {
  CRITERIOS_CONFERENCIA, comparativoDeParadas, formatarDuracao, nomeChave, ritmoPorHoraDoDia,
  somarParadas,
} from './cronoanalise.js';

const MS_POR_HORA = 3600000;

/** Minimo de medicoes da mesma maquina para falar de tendencia no tempo. */
const MIN_TENDENCIA = 4;
/**
 * Minimos da CURVA DO DIA. Duas horas medidas e tres medicoes no total: com
 * menos que isso, "as 10h rende menos" e' uma medicao contra outra, nao um
 * padrao do dia — e apontar hora fraca sem padrao manda gente investigar
 * ruido.
 */
const MIN_HORAS_CURVA = 2;
const MIN_MEDICOES_CURVA = 3;
/** Variacao (em %) abaixo da qual tendencia e comparacao viram ruido. */
const RUIDO_PCT = 8;
/**
 * Entre MAQUINAS o corte e' menor: 8% no tempo da mesma maquina pode ser o
 * dia; 5% entre duas maquinas ja' e' diferenca de posto que vale olhar. E'
 * o mesmo corte do quadro comparativo (EMPATE_PCT), de proposito — os dois
 * saem no mesmo relatorio e nao podem discordar sobre o mesmo par.
 */
const RUIDO_ENTRE_MAQUINAS_PCT = 5;

/** Maquina sem grupo no cadastro — o mesmo rotulo da lateral e do quadro. */
const SEM_GRUPO = 'Sem grupo';

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

/**
 * Tendencia do ritmo NO TEMPO, por maquina: metade mais antiga contra
 * metade mais recente, cada metade ponderada pelo tempo rodando (a mesma
 * conta do ritmo medio, entao uma medicao curta nao inverte a leitura).
 * Precisa de MIN_TENDENCIA medicoes; abaixo de RUIDO_PCT nao ha tendencia.
 */
function tendenciaDaMaquina(conferencias, chaveMaquina) {
  const validas = [];
  for (const c of conferencias || []) {
    const nome = String(c.maquina || '').trim() || 'Sem máquina';
    if (nomeChave(nome) !== chaveMaquina) continue;
    const dur = Number(c.duracaoMs ?? c.duracao_ms) || 0;
    const pecas = Number(c.pecas) || 0;
    if (dur <= 0 || pecas <= 0) continue;
    const par = somarParadas(c.paradas);
    const produtivoMs = dur - Math.min(par.totalMs, dur);
    if (produtivoMs <= 0) continue;
    // O primeiro instante que PARSEIA vale; medicao sem instante valido
    // fica FORA da tendencia. A ordem da lista nao serve de fallback: o
    // servidor manda o mais recente primeiro, e assumir ordem inverteria
    // a direcao — melhor nao afirmar tendencia do que afirmar ao contrario.
    let ts = NaN;
    for (const candidato of [c.iniciado_em, c.iniciadoEm, c.salvo_em, c.salvoEm]) {
      if (candidato == null) continue;
      ts = new Date(candidato).getTime();
      if (Number.isFinite(ts)) break;
    }
    if (!Number.isFinite(ts)) continue;
    validas.push({ ts, pecas, produtivoMs });
  }
  if (validas.length < MIN_TENDENCIA) return null;

  validas.sort((a, b) => a.ts - b.ts);
  const corte = Math.floor(validas.length / 2);
  const ritmoDe = (fatia) => {
    const p = fatia.reduce((acc, x) => acc + x.pecas, 0);
    const t = fatia.reduce((acc, x) => acc + x.produtivoMs, 0);
    return t > 0 ? (p * MS_POR_HORA) / t : null;
  };
  const antes = ritmoDe(validas.slice(0, corte));
  const agora = ritmoDe(validas.slice(corte));
  if (antes == null || agora == null || antes <= 0) return null;

  const pct = Math.round(((agora / antes) - 1) * 100);
  if (Math.abs(pct) < RUIDO_PCT) return { direcao: 'estavel', pct, antes, agora };
  return { direcao: pct > 0 ? 'subindo' : 'caindo', pct, antes, agora };
}

export function analisarConferencias({ maquinas = [], pecas = [], conferencias = [], grupoDe } = {}) {
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
    // Quanto do periodo a maquina passou produzindo. E' a disponibilidade,
    // dita em portugues: o percentual e o numero que se acompanha no tempo,
    // enquanto "18 min de 30" obriga quem le a dividir de cabeca.
    const totObservado = totProdutivo + totParada;
    if (totObservado > 0) {
      geral.push(
        `A máquina rodou ${Math.round((totProdutivo / totObservado) * 100)}% do período observado.`,
      );
    }
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

  /* ------------------------------------------------- 3. tendencia no tempo */
  // Destrava com 4+ medicoes da mesma maquina: e' a leitura que so' o
  // historico da' — o relatorio fica mais esperto a cada medicao nova.
  const linhasTendencia = [];
  for (const g of maquinas) {
    const t = tendenciaDaMaquina(conferencias, nomeChave(g.maquina));
    if (!t) continue;
    if (t.direcao === 'estavel') {
      linhasTendencia.push(`${g.maquina}: o ritmo se mantém no tempo (diferença de ${Math.abs(t.pct)}% entre as medições mais antigas e as mais recentes).`);
    } else if (t.direcao === 'subindo') {
      linhasTendencia.push(
        `${g.maquina}: o ritmo está subindo — as medições mais recentes rodam ${t.pct}% acima das primeiras `
        + `(${Math.round(t.antes)} → ${Math.round(t.agora)} pç/h). O que melhorou ali vale virar padrão.`,
      );
    } else {
      linhasTendencia.push(
        `${g.maquina}: o ritmo está caindo — as medições mais recentes rodam ${Math.abs(t.pct)}% abaixo das primeiras `
        + `(${Math.round(t.antes)} → ${Math.round(t.agora)} pç/h). Vale olhar broca, abastecimento e ajustes antes que vire perda.`,
      );
    }
  }
  if (linhasTendencia.length) secoes.push({ titulo: 'Tendência', linhas: linhasTendencia });

  /* ------------------------------------------- 4. comparacao entre maquinas */
  /**
   * DENTRO DO GRUPO, sempre.
   *
   * Esta secao comparava a maquina mais rapida com a mais lenta da lista
   * inteira. Enquanto so' havia furadeira medida, funcionava. Com o cadastro
   * ganhando seccionadora, fresadora e embalagem, a mesma frase passou a
   * dizer que "a furadeira roda 400% mais rapido que a seccionadora" — que
   * nao e' comparacao, e' comparar coisas diferentes: uma corta chapa, a
   * outra fura peca. O grupo do cadastro e' o que declara quais maquinas
   * fazem a mesma coisa, e por isso e' ele que autoriza a comparacao.
   *
   * Sem cadastro de grupo (`grupoDe` ausente ou vazio) tudo cai em "Sem
   * grupo" e a leitura sai como sempre saiu — a fabrica que ainda nao
   * cadastrou grupos nao perde a secao.
   */
  if (maquinas.length >= 2) {
    const porGrupo = new Map();
    for (const g of maquinas) {
      const grupo = grupoDe?.(g.maquina) || SEM_GRUPO;
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
      porGrupo.get(grupo).push(g);
    }
    const comparaveis = [...porGrupo.entries()].filter(([, lista]) => lista.length >= 2);
    // Nomear o grupo so' quando ha' mais de uma comparacao: com uma so', o
    // titulo repetiria o que as maquinas ja' dizem.
    const nomearGrupo = comparaveis.length > 1;

    const linhas = [];
    for (const [grupo, lista] of comparaveis) {
      const ordenadas = [...lista].sort((a, b) => b.ritmoMedio - a.ritmoMedio);
      const rapida = ordenadas[0];
      const lenta = ordenadas[ordenadas.length - 1];
      if (!(lenta.ritmoMedio > 0)) continue;
      const prefixo = nomearGrupo && grupo !== SEM_GRUPO ? `${grupo} — ` : '';
      const pct = Math.round(((rapida.ritmoMedio / lenta.ritmoMedio) - 1) * 100);
      if (pct >= RUIDO_ENTRE_MAQUINAS_PCT) {
        linhas.push(
          `${prefixo}${rapida.maquina} está rodando ${pct}% mais rápido que ${lenta.maquina} `
          + `(${Math.round(rapida.ritmoMedio)} contra ${Math.round(lenta.ritmoMedio)} pç/h). `
          + 'Antes de concluir que uma máquina é melhor, confira se as duas mediram peças parecidas — peça com mais furação rende menos sem a máquina ser mais lenta.',
        );
      } else {
        linhas.push(`${prefixo}As máquinas estão rodando em ritmo parecido (diferença de ${pct}%).`);
      }
      const emMedicao = [rapida, lenta].filter((g) => !g.confiavel);
      if (emMedicao.length) {
        linhas.push(
          `${emMedicao.map((g) => g.maquina).join(' e ')} ainda em medição — compare de novo quando o número firmar.`,
        );
      }
    }

    /* Todas as maquinas medidas em grupos DIFERENTES: nao ha' comparacao a
       fazer, e dizer isso e' melhor do que a secao sumir — sem a frase, quem
       le' procura a comparacao que nunca vai aparecer. */
    if (!linhas.length && porGrupo.size > 1) {
      linhas.push(
        `As ${maquinas.length} máquinas medidas são de grupos diferentes `
        + `(${[...porGrupo.keys()].join(', ')}) — uma de cada. Postos de naturezas diferentes não `
        + 'disputam peças/hora entre si: para comparar, meça outra máquina do mesmo grupo.',
      );
    }
    if (linhas.length) secoes.push({ titulo: 'Entre máquinas', linhas });
  }

  /* ------------------------------------------------- 5. entre pecas */
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
  // Peca cujo ritmo NAO se repete entre as proprias medicoes: destrava com
  // 3+ medicoes da peca — antes disso a "variacao" seria so' duas leituras.
  for (const p of pecas) {
    if (p.n >= 3 && p.cvPct != null && p.cvPct > 20 && p.melhor && p.pior && p.pior.ritmo > 0) {
      linhasPecas.push(
        `O ritmo de ${p.peca} na ${p.maquina} não se repete: foi de ${Math.round(p.pior.ritmo)} a ${Math.round(p.melhor.ritmo)} pç/h `
        + 'entre as medições. Vale conferir o que mudou entre elas (gabarito, lote, operador).',
      );
    }
  }
  if (linhasPecas.length) secoes.push({ titulo: 'Entre peças', linhas: linhasPecas });

  /* ------------------------------------------------- 6. ate onde da para chegar */
  // O melhor periodo e' meta que o proprio posto ja' provou ser possivel.
  // Destrava com 3+ medicoes e so' quando a diferenca e' de verdade (15%+).
  const linhasChegar = [];
  for (const g of maquinas) {
    if (g.n < 3 || !g.melhor || !(g.ritmoMedio > 0)) continue;
    const pct = Math.round(((g.melhor.ritmo / g.ritmoMedio) - 1) * 100);
    if (pct < 15) continue;
    linhasChegar.push(
      `O melhor período da ${g.maquina} fez ${Math.round(g.melhor.ritmo)} pç/h${g.melhor.peca ? ` (${g.melhor.peca})` : ''} — `
      + `${pct}% acima da média dela. O posto alcança esse ritmo: vale olhar o que estava diferente ali e repetir.`,
    );
  }
  if (linhasChegar.length) secoes.push({ titulo: 'Até onde dá para chegar', linhas: linhasChegar });

  /* ------------------------------------------------- 7. paradas */
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
    /**
     * O custo da parada em PECAS: minutos parados sao abstratos, pecas que
     * deixaram de sair sao concretas — e' o numero que muda conversa.
     *
     * A conta e' MAQUINA POR MAQUINA e somada (comparativoDeParadas), nunca
     * o ritmo do conjunto aplicado ao tempo parado do conjunto: o ritmo
     * medio e' puxado por quem rodou bem e o tempo parado e' de quem parou.
     * Somando antes de dividir, a auditoria de 31/08 achou uma perda de 367
     * pecas onde a real era 100.
     */
    const custo = comparativoDeParadas(maquinas);
    if (custo && custo.perdidas >= 10 && totParada >= 5 * 60000) {
      linhas.push(
        `Esse tempo parado custou cerca de ${custo.perdidas} peças que deixaram de sair `
        + `(conta feita máquina por máquina, ao ritmo de cada uma com ela rodando).`,
      );
      // O COMPARATIVO em uma frase: o numero sozinho ("perdemos 322") nao
      // diz de quanto para quanto. Com os dois lados, a frase serve de
      // legenda para o quadro em destaque no topo — e sobrevive sozinha,
      // colada num e-mail.
      /**
       * "essa parada" (singular) vinha logo depois da linha do MAIOR MOTIVO
       * e creditava a ele um ganho que e' de TODAS as paradas. E esta frase
       * e' a unica saida do comparativo que viaja sozinha — colada num
       * e-mail, sem o quadro do relatorio junto —, entao a protecao contra
       * ler o potencial como META tem de vir dentro dela.
       */
      linhas.push(
        `No MESMO período, sem as paradas marcadas, teriam saído cerca de ${custo.potencial} peças `
        + `em vez de ${custo.pecas} — de ${Math.round(custo.ritmoPeriodo)} pç/h `
        + `(${pMin(custo.ritmoPeriodo)} pç/min) para ${Math.round(custo.ritmoPotencial)} pç/h `
        + `(${pMin(custo.ritmoPotencial)} pç/min), ${Math.round(custo.ganhoPct)}% a mais no mesmo `
        + 'tempo. Não é meta nem capacidade de catálogo: é o ritmo que cada máquina fez com ela '
        + 'rodando, aplicado ao período dela.',
      );
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

  /* ------------------------------------------------- 8. curva do dia */
  /**
   * A HORA FRACA. A media do periodo esconde a hora ruim: o posto que faz
   * 700 pc/h de manha e 500 depois do almoco aparece como 620 o dia
   * inteiro, e ninguem vai olhar o que muda as 13h. Aqui a diferenca entre
   * a melhor e a pior hora vira uma frase — com a pergunta que ela pede.
   */
  /* So' com UMA maquina: com postos diferentes juntos, a hora "fraca" pode
     ser apenas a hora em que a maquina mais lenta foi medida — a frase
     mandaria investigar a hora quando o que mudou foi o posto. */
  const curva = maquinas.length === 1 ? ritmoPorHoraDoDia(conferencias) : [];
  /* So' horas com tempo medido suficiente entram na COMPARACAO: uma hora
     com 2 min medidos descreve uma rajada, e apontar ela como "hora fraca"
     manda investigar ruido. Ela continua no grafico, hachurada — o que nao
     pode e' virar conclusao. */
  const horasFirmes = curva.filter((h) => h.confiavel);
  if (horasFirmes.length >= MIN_HORAS_CURVA && totMedicoes >= MIN_MEDICOES_CURVA) {
    const ordenadas = [...horasFirmes].sort((a, b) => b.ritmoMedio - a.ritmoMedio);
    const melhor = ordenadas[0];
    const pior = ordenadas[ordenadas.length - 1];
    const queda = ((melhor.ritmoMedio - pior.ritmoMedio) / melhor.ritmoMedio) * 100;
    const linhas = [
      `Horas medidas: ${curva.map((h) => `${h.rotulo} ${Math.round(h.ritmoMedio)} pç/h`).join(' · ')}.`,
    ];
    // Diferenca pequena entre horas e ruido de medicao, nao padrao do dia.
    if (queda >= RUIDO_PCT) {
      linhas.push(
        `Às ${pior.rotulo} o ritmo é ${Math.round(queda)}% menor que às ${melhor.rotulo} — `
        + `${Math.round(pior.ritmoMedio)} contra ${Math.round(melhor.ritmoMedio)} pç/h. `
        + 'Vale olhar o que muda nessa hora: troca, abastecimento, revezamento ou fadiga.',
      );
    } else {
      linhas.push('O ritmo se mantém parecido nas horas medidas — sem hora fraca a investigar.');
    }
    secoes.push({ titulo: 'Ao longo do dia', linhas });
  }

  /* ------------------------------------------------- 9. proximo passo */
  const pendentes = maquinas.filter((g) => !g.confiavel);
  if (pendentes.length) {
    const linhas = [
      `Medir de novo: ${pendentes.map((g) => g.maquina).join(', ')}. `
      + `Períodos de ${formatarDuracao(CRITERIOS_CONFERENCIA.minPeriodoMs)} ou mais, de preferência em horários e operadores diferentes — é isso que firma o número.`,
    ];
    // A analise diz o que ela mesma ganha com mais dados: com 4+ medicoes
    // por maquina, destrava a tendencia no tempo.
    if (maquinas.some((g) => g.n < MIN_TENDENCIA)) {
      linhas.push(
        `Esta análise cresce com os dados: a partir de ${MIN_TENDENCIA} medições por máquina ela passa a mostrar também a tendência — se o ritmo está subindo ou caindo no tempo.`,
      );
    }
    secoes.push({ titulo: 'Próximo passo', linhas });
  }

  return secoes;
}
