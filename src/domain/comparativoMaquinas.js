/**
 * COMPARATIVO ENTRE MAQUINAS — qual posto rende mais, e sob qual pergunta.
 *
 * O relatorio ja' dizia quanto CADA maquina faz. A pergunta que sobrava era
 * a de sempre na reuniao: "qual esta' melhor?". Responder isso empilhando
 * todas as maquinas numa lista unica de pecas/hora e' errado, e o erro tem
 * nome — comparar posto com posto de natureza diferente. Seccionadora e
 * furadeira nao disputam ritmo: uma corta chapa, a outra fura peca. O
 * ranking corrido diria que a seccionadora "perde" para a furadeira, e
 * alguem levaria isso para uma reuniao.
 *
 * Por isso a comparacao AQUI e' SEMPRE DENTRO DO GRUPO do cadastro
 * (0002 FURADEIRA, 0004 FRESADORA...). O grupo e' o que declara "estas
 * maquinas fazem a mesma coisa" — e' ele que autoriza a comparacao. Grupo
 * com uma maquina so' nao vira comparativo: nao ha' com quem comparar.
 *
 * A SEGUNDA armadilha e' o MIX DE PECAS. Duas furadeiras do mesmo grupo,
 * uma medida na peca de 4 furos e a outra na de 12: a primeira ganha em
 * pecas/hora sem ser mais rapida. Entao a leitura sai em tres niveis, do
 * mais limpo para o mais ressalvado:
 *
 *   1. MESMA PECA nas duas (duelo)  -> comparacao limpa, sem ressalva.
 *   2. Mesmo grupo, mix diferente   -> o numero sai, com o aviso junto e,
 *                                      quando ha' peca em comum, o duelo
 *                                      ao lado para conferir.
 *   3. Sem nenhuma peca em comum    -> NAO se elege vencedor. A saida e'
 *                                      dizer o que medir para comparar.
 *
 * E "melhor rendimento" nao e' UMA pergunta, sao quatro — e a maquina que
 * ganha numa pode perder na outra. As quatro saem lado a lado:
 *
 *   - RITMO (pc/h rodando): velocidade com a maquina produzindo.
 *   - CICLOS/H: acionamentos do motor por hora. So' aparece quando alguma
 *     peca fura em mais de um ciclo — e' o que torna pecas de furacao
 *     diferente comparaveis dentro do grupo.
 *   - RODANDO %: quanto do periodo a maquina passou produzindo. Este
 *     compara entre QUAISQUER maquinas, porque e' percentual do proprio
 *     periodo — nao depende da peca.
 *   - CONSTANCIA e DO PROPRIO MELHOR: cada maquina contra ela mesma. Sao os
 *     unicos indices que sobrevivem quando o mix e' incomparavel, e sao os
 *     que apontam ganho sem trocar maquina.
 *
 * Funcao pura: recebe os resumos ja' calculados (resumirConferencias) e a
 * funcao de grupo do cadastro. Nao conhece React nem tela.
 */
import { MS_POR_HORA } from './estatistica.js';
import { nomeChave } from './cronoanalise.js';

/**
 * Diferenca abaixo da qual duas maquinas estao EMPATADAS.
 *
 * Medicao de chao de fabrica tem ruido: contador lido a olho, cronometro
 * parado com a mao, peca que entra no fim do periodo. Chamar de "melhor"
 * quem esta' 3% acima e' apontar vencedor no ruido — e mandar investigar
 * diferenca que nao existe. E' o mesmo corte de 5% que a analise
 * automatica ja' usa para nao inventar ranking.
 */
export const EMPATE_PCT = 5;

/** Minimo de medicoes para a maquina ter um "proprio melhor" que valha. */
const MIN_PARA_MELHOR = 3;

const SEM_GRUPO = 'Sem grupo';

/**
 * Quanto A roda A MAIS que B, em % de B — "50% mais rapido que".
 *
 * E' a MESMA conta da analise automatica (analiseConferencias, secao "Entre
 * maquinas") de proposito. As duas leituras saem no mesmo relatorio, e o
 * mesmo par de maquinas dizendo "33%" num quadro e "50%" no outro faria
 * quem le' concluir que um dos dois esta' errado — quando as duas contas
 * so' dividem por bases diferentes.
 */
const quantoMaisRapido = (a, b) => (b > 0 ? ((a / b) - 1) * 100 : 0);

/**
 * O ritmo da maquina em % do ritmo do LIDER do grupo — 100% no primeiro.
 *
 * Na tabela esta e' a coluna que compara: "a F12 faz 67% do ritmo da F16".
 * Percentual de diferenca ("33% abaixo" x "50% mais rapido") depende de
 * qual dos dois e' a base e troca de valor conforme a direcao da leitura;
 * o indice nao tem essa ambiguidade.
 */
const indiceDoLider = (valor, lider) => (lider > 0 ? (valor / lider) * 100 : null);

/**
 * As pecas que CADA maquina mediu, pela chave normalizada.
 *
 * Serve para responder se duas maquinas do mesmo grupo mediram a mesma
 * coisa — que e' o que decide se pecas/hora compara ou nao. Conferencia
 * sem nome de peca nao entra no resumo por peca (resumirConferencias
 * descarta), entao maquina medida sem nome nenhum aparece aqui com lista
 * vazia: e' honesto, nao da' para afirmar mix igual sem saber a peca.
 */
function pecasPorMaquina(pecas) {
  const mapa = new Map();
  for (const p of pecas || []) {
    const chave = nomeChave(p.maquina);
    if (!mapa.has(chave)) mapa.set(chave, new Map());
    mapa.get(chave).set(nomeChave(p.peca), p);
  }
  return mapa;
}

/**
 * DUELOS: a mesma peca medida em duas ou mais maquinas do mesmo grupo.
 *
 * E' a unica comparacao de ritmo sem ressalva que existe neste relatorio —
 * mesma peca, mesmo tipo de posto. Quando ela existe, ela manda: se a
 * tabela do grupo diz que a F16 esta' 40% na frente mas o duelo da peca em
 * comum diz 6%, o que a tabela mediu foi o mix, nao a maquina.
 *
 * Ordenados pela maior diferenca: e' onde ha' ganho para buscar.
 */
function montarDuelos(pecas, grupoPorMaquina) {
  const porPeca = new Map();
  for (const p of pecas || []) {
    const grupo = grupoPorMaquina.get(nomeChave(p.maquina)) || SEM_GRUPO;
    // A peca so' duela DENTRO do grupo: a mesma peca passando por
    // seccionadora e por furadeira nao e' disputa, e' roteiro.
    const chave = `${grupo}\u0000${nomeChave(p.peca)}`;
    if (!porPeca.has(chave)) porPeca.set(chave, { peca: p.peca, grupo, linhas: [] });
    porPeca.get(chave).linhas.push({
      maquina: p.maquina,
      ritmoMedio: p.ritmoMedio,
      n: p.n,
      totalPecas: p.totalPecas,
      totalProdutivoMs: p.totalProdutivoMs,
      confiavel: p.confiavel,
    });
  }

  const duelos = [];
  for (const d of porPeca.values()) {
    if (d.linhas.length < 2) continue;
    const linhas = [...d.linhas].sort((a, b) => b.ritmoMedio - a.ritmoMedio);
    const lider = linhas[0];
    const lanterna = linhas[linhas.length - 1];
    if (!(lider.ritmoMedio > 0) || !(lanterna.ritmoMedio > 0)) continue;
    const pct = quantoMaisRapido(lider.ritmoMedio, lanterna.ritmoMedio);
    for (const l of linhas) l.indicePct = indiceDoLider(l.ritmoMedio, lider.ritmoMedio);
    duelos.push({
      peca: d.peca,
      grupo: d.grupo,
      linhas,
      lider,
      lanterna,
      difPct: pct,
      empate: pct < EMPATE_PCT,
      // Duelo com maquina ainda em medicao continua valendo como leitura,
      // mas quem le' precisa saber que o numero ainda assenta.
      emMedicao: linhas.filter((l) => !l.confiavel).map((l) => l.maquina),
    });
  }
  return duelos.sort((a, b) => b.difPct - a.difPct);
}

/**
 * @param maquinas  resultado de resumirConferencias(linhas)
 * @param pecas     resultado de resumirConferencias(linhas, { porPeca: true })
 * @param grupoDe   (nomeDaMaquina) => '0002 · FURADEIRA' | null — do cadastro
 * @returns { grupos, duelos, comparaveis, semPar }
 */
export function compararMaquinas({ maquinas = [], pecas = [], grupoDe } = {}) {
  const grupoPorMaquina = new Map();
  for (const g of maquinas) {
    grupoPorMaquina.set(nomeChave(g.maquina), (grupoDe?.(g.maquina)) || SEM_GRUPO);
  }
  const mapaPecas = pecasPorMaquina(pecas);

  const porGrupo = new Map();
  for (const g of maquinas) {
    const grupo = grupoPorMaquina.get(nomeChave(g.maquina));
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push(g);
  }

  const grupos = [];
  const semPar = [];

  for (const [grupo, lista] of porGrupo) {
    if (lista.length < 2) {
      // Maquina sozinha no grupo nao e' erro nem omissao: e' a fabrica.
      // Ela sai nomeada para a tela poder dizer POR QUE ela nao aparece no
      // comparativo — sumir em silencio faz o usuario procurar o que nao ha'.
      semPar.push({ maquina: lista[0].maquina, grupo });
      continue;
    }

    // Peca com mais de um ciclo em alguma maquina do grupo: so' entao os
    // ciclos do motor dizem algo que as pecas/hora nao dizem.
    const temMultiCiclo = lista.some((g) => g.totalAcionamentos > g.totalPecas);

    const linhas = lista.map((g) => {
      const doGrupo = mapaPecas.get(nomeChave(g.maquina)) || new Map();
      return {
        maquina: g.maquina,
        grupo,
        n: g.n,
        totalPecas: g.totalPecas,
        totalMs: g.totalMs,
        totalProdutivoMs: g.totalProdutivoMs,
        totalParadaMs: g.totalParadaMs,
        ritmoMedio: g.ritmoMedio,
        ritmoBruto: g.ritmoBruto,
        disponibilidadePct: g.disponibilidadePct,
        // Acionamentos do motor por hora rodando — a mesma ponderacao do
        // ritmo. Sem peca multi-ciclo no grupo seria a copia da coluna de
        // pecas/hora, e coluna repetida e' ruido: fica null.
        ciclosPorHora: temMultiCiclo && g.totalProdutivoMs > 0
          ? (g.totalAcionamentos * MS_POR_HORA) / g.totalProdutivoMs
          : null,
        cvPct: g.cvPct,
        estabilidade: g.estabilidade,
        /**
         * A media dela contra o MELHOR PERIODO dela — cada maquina medida
         * contra ela mesma. E' o unico indice de ritmo que compara maquina
         * com maquina sem depender da peca: 82% e 95% dizem quanta folga
         * cada posto tem contra o que ele proprio ja' provou fazer.
         *
         * Precisa de 3 medicoes: com uma ou duas, o "melhor" e' so' a
         * medicao que calhou de ser boa, e o indice viraria sorte.
         */
        aproveitamentoPct: g.n >= MIN_PARA_MELHOR && g.melhor?.ritmo > 0
          ? (g.ritmoMedio / g.melhor.ritmo) * 100
          : null,
        melhor: g.melhor,
        confiavel: g.confiavel,
        pecas: [...doGrupo.keys()],
      };
    }).sort((a, b) => b.ritmoMedio - a.ritmoMedio);

    const lider = linhas[0];
    const lanterna = linhas[linhas.length - 1];
    for (const l of linhas) l.indicePct = indiceDoLider(l.ritmoMedio, lider.ritmoMedio);

    /**
     * O MIX. Todas mediram exatamente as mesmas pecas? Entao pecas/hora
     * compara direto. Se nao, procura-se peca em comum — e' ela que
     * sustenta a comparacao; sem nenhuma, o ritmo nao se compara e o
     * comparativo diz isso em vez de eleger um vencedor no vazio.
     */
    const conjuntos = linhas.map((l) => l.pecas);
    const todasComPeca = conjuntos.every((c) => c.length > 0);
    const mixIgual = todasComPeca
      && conjuntos.every((c) => c.length === conjuntos[0].length && c.every((x) => conjuntos[0].includes(x)));
    // Peca medida em 2+ maquinas do grupo (nem precisa ser em todas): ja'
    // da' um duelo limpo para conferir a leitura da tabela.
    const contagem = new Map();
    for (const c of conjuntos) for (const x of c) contagem.set(x, (contagem.get(x) || 0) + 1);
    const pecasEmComum = [...contagem.values()].filter((v) => v >= 2).length;

    const diferenca = quantoMaisRapido(lider.ritmoMedio, lanterna.ritmoMedio);

    /* Lideres de cada leitura. Sao perguntas diferentes, e e' comum a
       resposta ser maquina diferente em cada uma — e' exatamente essa
       divergencia que diz onde atacar: ritmo baixo se trata na maquina,
       disponibilidade baixa se trata na parada. */
    const melhorPor = (campo, maior = true) => {
      const validas = linhas.filter((l) => Number.isFinite(l[campo]));
      if (!validas.length) return null;
      return validas.reduce((a, b) => {
        if (maior) return b[campo] > a[campo] ? b : a;
        return b[campo] < a[campo] ? b : a;
      });
    };

    grupos.push({
      grupo,
      linhas,
      lider,
      lanterna,
      // Quanto o LIDER roda a mais que a ultima — a mesma conta e o mesmo
      // corte de ruido da analise automatica, para os dois quadros do
      // relatorio nunca darem numeros diferentes sobre o mesmo par.
      difPct: diferenca,
      empate: diferenca < EMPATE_PCT,
      temCiclos: temMultiCiclo,
      mixIgual,
      pecasEmComum,
      // Sem peca em comum entre nenhum par, pecas/hora nao compara: a
      // diferenca pode ser toda do mix. E' o unico caso em que este modulo
      // se recusa a apontar quem esta' na frente.
      comparavel: mixIgual || pecasEmComum > 0,
      emMedicao: linhas.filter((l) => !l.confiavel).map((l) => l.maquina),
      liderRitmo: lider,
      liderDisponibilidade: melhorPor('disponibilidadePct'),
      // Constancia: MENOR variacao entre medicoes e' a melhor.
      liderConstancia: melhorPor('cvPct', false),
      duelos: [],
    });
  }

  const duelos = montarDuelos(pecas, grupoPorMaquina);
  for (const g of grupos) g.duelos = duelos.filter((d) => d.grupo === g.grupo);

  // Grupos na ordem do codigo do cadastro (0002 antes de 0004); sem grupo
  // por ultimo, como na lateral do relatorio.
  grupos.sort((a, b) => {
    if (a.grupo === SEM_GRUPO) return 1;
    if (b.grupo === SEM_GRUPO) return -1;
    return a.grupo.localeCompare(b.grupo, 'pt-BR');
  });

  return {
    grupos,
    duelos,
    comparaveis: grupos.reduce((acc, g) => acc + g.linhas.length, 0),
    semPar,
  };
}

/* --------------------------------------------------------- a leitura */

const pph = (v) => `${Math.round(v)} pç/h`;
const pct = (v) => `${Math.round(v)}%`;

/**
 * A CONSTANCIA em palavras — a mesma regua da analise automatica.
 *
 * O relatorio baniu "CV%" da tela (decisao de 31/08): quem le' e' o
 * encarregado, nao o estatistico. A regua e' a mesma de sempre, so' que
 * dita: ate 10% repete bem, ate 20% varia um pouco, acima disso varia
 * muito e ha' o que investigar.
 */
/**
 * O duelo que liga JUSTAMENTE o lider e o ultimo do grupo.
 *
 * Um grupo pode ter varios duelos e nenhum deles envolver esse par — e' o
 * caso de tres maquinas em que a peca comum liga a segunda e a terceira. Ai'
 * o duelo existe, mas nao qualifica o veredito, e citar o numero dele ao
 * lado do da tabela compararia coisas diferentes.
 */
function dueloDoPar(g) {
  return (g.duelos || []).find((d) => (
    d.linhas.some((l) => l.maquina === g.lider.maquina)
    && d.linhas.some((l) => l.maquina === g.lanterna.maquina)
  ));
}

export function constanciaTexto(cvPct) {
  if (cvPct == null) return null;
  if (cvPct <= 10) return 'Repete bem';
  if (cvPct <= 20) return 'Varia um pouco';
  return 'Varia muito';
}

/**
 * A LEITURA de um grupo, em frases — o "qual esta' melhor" respondido.
 *
 * Mora no dominio, e nao na tela, pelo mesmo motivo da analise automatica:
 * a tela e o PAPEL leem os dois, e uma frase escrita duas vezes diverge um
 * dia. Devolve [string], na ordem de leitura.
 *
 * A primeira frase e' sempre o veredito — ou a RECUSA dele, quando o mix de
 * pecas nao deixa comparar. A recusa nunca vem sozinha: vem com o que medir
 * para a comparacao passar a existir.
 */
export function lerGrupo(g) {
  if (!g?.lider) return [];
  const frases = [];
  const { lider, lanterna } = g;

  if (!g.comparavel) {
    frases.push(
      `Não dá para dizer qual rende mais em peças/hora: as máquinas deste grupo mediram peças `
      + `diferentes e nenhuma peça foi medida em duas delas. A diferença que aparece na tabela `
      + `pode ser toda do mix — peça com mais furação rende menos sem a máquina ser mais lenta.`,
    );
    frases.push(
      `Para comparar de verdade: meça a MESMA peça nas duas máquinas. Enquanto isso, o que já `
      + `compara aqui é o tempo rodando e a constância — esses não dependem da peça.`,
    );
  } else if (g.empate) {
    frases.push(
      `${lider.maquina} e ${lanterna.maquina} rodam praticamente no mesmo ritmo `
      + `(diferença de ${pct(g.difPct)}, dentro do ruído de medição). O que separa uma da outra `
      + `não está na velocidade: está no tempo parado e na constância.`,
    );
  } else {
    frases.push(
      `${lider.maquina} é a que mais rende neste grupo: ${pph(lider.ritmoMedio)} contra `
      + `${pph(lanterna.ritmoMedio)} da ${lanterna.maquina} — ${pct(g.difPct)} mais rápido.`,
    );
    /**
     * O DUELO DESMENTINDO (ou confirmando) A TABELA.
     *
     * A tabela carrega o mix junto; o duelo da peca medida nas duas, nao.
     * Quando existe duelo entre esse par, e' ele quem qualifica o veredito —
     * e por isso ele substitui o generico "confira o duelo abaixo": mandar
     * conferir e ja' dizer o resultado sao a mesma frase, dita duas vezes.
     */
    const duelo = dueloDoPar(g);
    if (g.mixIgual) {
      frases.push('As máquinas do grupo mediram as mesmas peças, então a comparação é direta.');
    } else if (duelo && Math.abs(duelo.difPct - g.difPct) >= EMPATE_PCT) {
      const noDuelo = duelo.linhas.map((l) => `${l.maquina} ${pph(l.ritmoMedio)}`).join(' contra ');
      frases.push(
        `Elas mediram peças diferentes, e isso pesa: na ${duelo.peca}, medida nas duas, a diferença `
        + `é de ${pct(duelo.difPct)} (${noDuelo}) — ${duelo.difPct < g.difPct ? 'menor' : 'maior'} que os `
        + `${pct(g.difPct)} da tabela. Vale o número da mesma peça: o da tabela carrega o mix junto.`,
      );
    } else if (duelo) {
      frases.push(
        `Elas mediram peças diferentes, mas na ${duelo.peca} — medida nas duas — a diferença é a `
        + `mesma (${pct(duelo.difPct)}): a leitura se sustenta.`,
      );
    } else {
      frases.push(
        'Elas mediram peças diferentes e nenhuma peça em comum liga justamente essas duas: parte '
        + 'da diferença pode ser do mix. Uma medição da mesma peça nas duas resolve.',
      );
    }
  }

  /**
   * O DESMENTIDO DOS CICLOS.
   *
   * Duas furadeiras do mesmo grupo, uma 25% "mais rapida" em pecas/hora e
   * as duas fazendo o mesmo numero de acionamentos do motor por hora: a
   * maquina nao e' mais rapida, a peca dela e' que tem menos furo. Sem esta
   * frase, o quadro traz as duas colunas e deixa a conclusao errada de pe'
   * — e "a F16 rende 25% mais" e' o que sai da reuniao.
   */
  if (g.temCiclos && !g.empate && lider.ciclosPorHora > 0 && lanterna.ciclosPorHora > 0) {
    const maior = Math.max(lider.ciclosPorHora, lanterna.ciclosPorHora);
    const menor = Math.min(lider.ciclosPorHora, lanterna.ciclosPorHora);
    if (quantoMaisRapido(maior, menor) < EMPATE_PCT) {
      frases.push(
        `Em acionamentos do motor as duas rodam praticamente igual `
        + `(${Math.round(lider.ciclosPorHora)} contra ${Math.round(lanterna.ciclosPorHora)} ciclos/h): `
        + `a vantagem da ${lider.maquina} em peças/hora vem da furação da peça, não da velocidade `
        + 'da máquina. Para carga e capacidade, use o ritmo da peça.',
      );
    }
  }

  // Disponibilidade e ritmo respondem perguntas diferentes, e quando a
  // resposta e' maquina diferente esta' dito onde atacar cada uma.
  const disp = g.liderDisponibilidade;
  if (disp && disp.maquina !== lider.maquina && disp.disponibilidadePct - lider.disponibilidadePct >= EMPATE_PCT) {
    frases.push(
      `Atenção à leitura: quem menos para é a ${disp.maquina} `
      + `(${pct(disp.disponibilidadePct)} do período rodando, contra ${pct(lider.disponibilidadePct)} da `
      + `${lider.maquina}). Ritmo baixo se trata na máquina; tempo parado se trata na parada.`,
    );
  }

  // Folga contra o proprio melhor: e' o ganho que nao pede maquina nova.
  const comFolga = g.linhas
    .filter((l) => l.aproveitamentoPct != null && l.aproveitamentoPct < 85)
    .sort((a, b) => a.aproveitamentoPct - b.aproveitamentoPct)[0];
  if (comFolga) {
    frases.push(
      `${comFolga.maquina} roda a ${pct(comFolga.aproveitamentoPct)} do melhor período dela própria `
      + `(${pph(comFolga.melhor.ritmo)}${comFolga.melhor.peca ? ` na ${comFolga.melhor.peca}` : ''}). `
      + 'O posto já provou que alcança esse ritmo — a folga está nele, não em máquina nova.',
    );
  }

  if (g.emMedicao.length) {
    frases.push(
      `${g.emMedicao.join(' e ')} ainda em medição — compare de novo quando o número firmar.`,
    );
  }
  return frases;
}
