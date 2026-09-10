/**
 * TENDENCIA DO RITMO NO TEMPO — o posto esta' rendendo mais ou menos que
 * semana passada?
 *
 * E' outra pergunta que a tendencia do ESTUDO (tendenciaColeta.js). La' o
 * eixo e' a ordem dos ciclos DENTRO de uma cronometragem, e a resposta e'
 * sobre a pessoa no posto naquele momento — fadiga, aquecimento. Aqui o
 * eixo e' a DATA, e a resposta e' sobre a maquina ao longo de dias e
 * semanas — broca gastando, ajuste que se perdeu, melhoria que pegou.
 *
 * O relatorio ja' dizia isso em uma frase ("o ritmo se mantem no tempo"),
 * comparando a metade mais antiga com a mais recente. Duas medicoes contra
 * duas, sem ver a curva, e sem separar o efeito da PECA.
 *
 * A ARMADILHA DA PECA. Peca diferente rende diferente na mesma maquina —
 * no relatorio de setembro, a FURADEIRA 16 fez 762 pc/h no SLEEP TAMPO e
 * 648 pc/h no LIVREITO, 18% de diferenca sem a maquina mudar nada. Se as
 * pecas antigas eram as rapidas e as recentes as lentas, uma reta sobre o
 * ritmo bruto acusa "a maquina esta' caindo" quando o que mudou foi o que
 * ela esta' furando. Por isso a DIRECAO so' e' afirmada depois de dividir
 * cada medicao pela media da propria peca naquela maquina: sobra o que e'
 * do tempo. O grafico continua desenhando o ritmo BRUTO, que e' o numero
 * que o analista conhece — mas a leitura nao confunde os dois.
 *
 * E A ARMADILHA DA ARMADILHA. Descontar a peca so' e' possivel quando
 * ALGUMA peca foi medida em datas diferentes: e' comparando a peca consigo
 * mesma que se enxerga o que e' do tempo. Sem isso a serie normalizada vira
 * uma reta de 1,0 — nao porque a maquina esteja constante, mas porque nao
 * ha' o que comparar. Tratar esse vazio como "a variacao e' da peca" foi o
 * pior defeito desta tela: uma maquina caindo de 900 para 450 pc/h, com uma
 * peca diferente em cada data, saia no papel como "acompanha a peca medida,
 * nao o tempo" — o relatorio afirmando o contrario do que aconteceu. Por
 * isso ha' TRES respostas, nao duas: e' a peca, e' o tempo, ou NAO DA' PARA
 * SEPARAR. A terceira nao e' um meio-termo diplomatico: e' a unica honesta
 * quando ninguem mediu a mesma peca duas vezes, e ela diz o que fazer para
 * sair desse estado.
 */
import { CRITERIOS_CONFERENCIA, conferenciaRapida, nomeChave } from './cronoanalise.js';
import { r2MinimoParaTendencia } from './estatistica.js';

/** Minimo de medicoes da mesma maquina para desenhar a serie. */
export const MIN_MEDICOES_TENDENCIA = 4;

/** Variacao (em %) abaixo da qual a inclinacao vira ruido. O mesmo corte
 *  que o relatorio ja' usava para falar de tendencia no tempo. */
const RUIDO_PCT = 8;

/**
 * Quanto do periodo precisa estar coberto POR DENTRO DE UMA PECA para o
 * desconto da peca significar alguma coisa.
 *
 * A conta e': o maior vao entre a primeira e a ultima medicao da MESMA
 * peca, dividido pelo vao do periodo inteiro. Meia dose (0,5) e' o corte —
 * abaixo disso a serie normalizada nao tem alavanca sobre o eixo do tempo e
 * nada pode ser afirmado nem a favor nem contra a peca.
 *
 * O relatorio de setembro e' o exemplo: quatro pecas, cada uma medida
 * dentro de um unico dia, num periodo de dez dias. Cobertura de 1% — nao
 * da' para separar, e o quadro precisa dizer isso em vez de escolher um
 * lado.
 */
const COBERTURA_MINIMA = 0.5;

const DIA_MS = 86400000;

/** O primeiro instante que parseia. Medicao sem data fica FORA: a ordem da
 *  lista nao serve de fallback — o servidor manda o mais recente primeiro,
 *  e assumir ordem inverteria a direcao. */
function instante(c) {
  for (const candidato of [c.iniciado_em, c.iniciadoEm, c.salvo_em, c.salvoEm]) {
    if (candidato == null) continue;
    const ts = new Date(candidato).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return NaN;
}

/**
 * A serie de uma maquina: uma medicao por ponto, em ordem de data.
 *
 * `reta` sai da regressao sobre o RITMO BRUTO contra o tempo (em dias), que
 * e' o que o grafico desenha. `direcao` sai da regressao sobre o ritmo
 * NORMALIZADO pela peca — ver o cabecalho do modulo.
 */
export function serieDoPeriodo(conferencias, maquina) {
  const chave = nomeChave(maquina);
  const pontos = [];

  for (const c of conferencias || []) {
    if (nomeChave(c.maquina || '') !== chave) continue;
    const ts = instante(c);
    if (!Number.isFinite(ts)) continue;
    const calc = conferenciaRapida({
      duracaoMs: Number(c.duracao_ms ?? c.duracaoMs),
      pecas: c.pecas,
      paradas: c.paradas,
      ciclosPorPeca: c.ciclos_por_peca ?? c.ciclosPorPeca,
    });
    if (!calc || !(calc.pecasPorHora > 0)) continue;
    pontos.push({
      chave: c.id ?? `${ts}`,
      ts,
      ritmo: calc.pecasPorHora,
      peca: String(c.peca || '').trim() || 'Sem peça',
      produtivoMs: calc.produtivoMs,
      // Medicao curta mede rajada, nao ritmo: entra no grafico marcada,
      // como ja' acontece nas barras por medicao.
      confiavel: calc.produtivoMs >= CRITERIOS_CONFERENCIA.minPeriodoMs,
    });
  }

  pontos.sort((a, b) => a.ts - b.ts);
  const n = pontos.length;
  if (n < MIN_MEDICOES_TENDENCIA) {
    // A MESMA forma do retorno cheio, com os numeros zerados: quem consome
    // nao precisa saber por qual ramo passou, e um `pctBruto` ausente vira
    // NaN no rotulo de quem so' olha o campo.
    return {
      maquina, n, pontos, reta: null, dias: [], direcao: 'estavel',
      pct: 0, pctBruto: 0, r2: 0, r2Minimo: 1, nEfetivo: 0,
      cobertura: 0, podeSeparar: false, pecas: [], misturaPecas: false,
    };
  }

  /* A reta DESENHADA: ritmo bruto contra o tempo real, em dias. Contra a
     ordem da medicao ela mentiria — quatro medicoes numa manha e uma dez
     dias depois nao sao cinco passos iguais. */
  const t0 = pontos[0].ts;
  const dias = pontos.map((p) => (p.ts - t0) / DIA_MS);
  const bruta = regressao(dias, pontos.map((p) => p.ritmo));
  const reta = bruta
    ? { inicio: bruta.intercepto, fim: bruta.intercepto + bruta.slope * dias[n - 1] }
    : null;

  /* A DIRECAO: a mesma reta, sobre o ritmo dividido pela media da propria
     peca. Peca medida uma vez so' vira exatamente 1 e nao empurra a reta
     para lado nenhum — o que e' honesto: com ela nao da' para separar o
     efeito do tempo do efeito da peca. */
  const mediaPorPeca = new Map();
  for (const p of pontos) {
    const atual = mediaPorPeca.get(p.peca) || { soma: 0, n: 0 };
    mediaPorPeca.set(p.peca, { soma: atual.soma + p.ritmo, n: atual.n + 1 });
  }
  const normalizados = pontos.map((p) => {
    const m = mediaPorPeca.get(p.peca);
    const media = m.soma / m.n;
    return media > 0 ? p.ritmo / media : 1;
  });
  const limpa = regressao(dias, normalizados);

  const pecas = [...mediaPorPeca.keys()];
  // Variacao do inicio ao fim da reta LIMPA, em % — e' o que se afirma.
  const spanDias = dias[n - 1];
  const pctLimpo = limpa && limpa.intercepto > 0
    ? ((limpa.slope * spanDias) / limpa.intercepto) * 100
    : 0;

  /* GRAUS DE LIBERDADE, descontando o que a normalizacao ja' consumiu.
     Dividir cada medicao pela media da PROPRIA peca nao e' de graca: essas
     k medias sao estimadas nos mesmos dados, e cada uma custa um grau de
     liberdade. Sobram n − k − 1, nao n − 2. Cobrar o r2 minimo de n cru
     deixaria o teste frouxo justo onde ele mais precisa segurar — com 9
     medicoes de 4 pecas ele exigiria r2 de 0,44 quando o correto e' 0,66.
     `r2MinimoParaTendencia` recebe um n EFETIVO porque calcula df = n − 2:
     passar n − k + 1 devolve exatamente df = n − k − 1. No extremo, cada
     peca medida uma vez so' zera os graus (o helper devolve 1, e nada e'
     afirmado) — que e' o resultado honesto: normalizada, a serie inteira
     vira 1 e nao sobra nada para o tempo explicar. */
  const nEfetivo = n - pecas.length + 1;
  const r2Minimo = r2MinimoParaTendencia(nEfetivo);

  /* COBERTURA INTERNA: o maior vao de tempo coberto por UMA MESMA peca,
     como fracao do periodo. E' a alavanca que o desconto da peca tem sobre
     o eixo do tempo — sem ela, "normalizado" nao mede nada. Em ms, nao em
     datas civis: peca medida duas vezes no mesmo dia contribui as poucas
     horas que separam as duas medicoes, que e' exatamente o peso que ela
     merece, e nenhum fuso horario entra na conta. */
  const vaoPorPeca = new Map();
  for (const p of pontos) {
    const atual = vaoPorPeca.get(p.peca);
    if (!atual) vaoPorPeca.set(p.peca, { min: p.ts, max: p.ts });
    else { atual.min = Math.min(atual.min, p.ts); atual.max = Math.max(atual.max, p.ts); }
  }
  const vaoTotal = pontos[n - 1].ts - pontos[0].ts;
  const vaoInterno = Math.max(...[...vaoPorPeca.values()].map((v) => v.max - v.min));
  const cobertura = vaoTotal > 0 ? vaoInterno / vaoTotal : 0;

  /* PODE SEPARAR peca de tempo? Precisa de alavanca (cobertura) E de graus
     de liberdade (r2Minimo abaixo de 1). Sem os dois, o unico veredito
     honesto e' "nao da' para separar" — nem direcao, nem "e' a peca". */
  const podeSeparar = cobertura >= COBERTURA_MINIMA && r2Minimo < 1;

  let direcao = 'estavel';
  if (podeSeparar && limpa && Math.abs(pctLimpo) >= RUIDO_PCT && limpa.r2 >= r2Minimo) {
    direcao = limpa.slope > 0 ? 'subindo' : 'caindo';
  }

  // Variacao do ritmo BRUTO, que e' a que o grafico mostra.
  const pctBruto = reta && reta.inicio > 0 ? ((reta.fim / reta.inicio) - 1) * 100 : 0;

  return {
    maquina,
    n,
    pontos,
    reta,
    dias,
    direcao,
    pct: pctLimpo,
    pctBruto,
    r2: limpa ? limpa.r2 : 0,
    r2Minimo,
    nEfetivo,
    cobertura,
    podeSeparar,
    pecas,
    // Mais de uma peca medida: parte da variacao BRUTA pode ser a peca.
    misturaPecas: pecas.length > 1,
  };
}

/** Regressao linear de y sobre x. Devolve null sem variacao em x. */
function regressao(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const somaX = x.reduce((a, v) => a + v, 0);
  const somaY = y.reduce((a, v) => a + v, 0);
  const somaXX = x.reduce((a, v) => a + v * v, 0);
  const somaXY = x.reduce((a, v, i) => a + v * y[i], 0);
  const den = n * somaXX - somaX * somaX;
  // Todas as medicoes no mesmo instante: nao ha' eixo do tempo.
  if (den === 0) return null;
  const slope = (n * somaXY - somaX * somaY) / den;
  const intercepto = (somaY - slope * somaX) / n;
  const mediaY = somaY / n;
  const ssTot = y.reduce((a, v) => a + (v - mediaY) ** 2, 0);
  const ssRes = y.reduce((a, v, i) => a + (v - (intercepto + slope * x[i])) ** 2, 0);
  return { slope, intercepto, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/**
 * A leitura em palavras. Mesma regra do resto do relatorio: sem jargao, e
 * a frase diz o que fazer, nao so' o que aconteceu.
 *
 * `mostrarPct` diz se o selo do quadro pode carregar a porcentagem. Com
 * "Ritmo estavel" ela nao pode: "Ritmo estavel · −7%" se contradiz na
 * mesma linha — a reta ate' inclina, mas o que se afirma e' que nao ha'
 * deriva, e o numero ao lado desmentiria a palavra.
 */
export function lerTendenciaPeriodo(serie) {
  const { n, direcao, pct, pctBruto, misturaPecas, podeSeparar, reta } = serie;
  const limpo = Math.abs(Math.round(pct));
  const bruto = Math.abs(Math.round(pctBruto));
  // Os extremos da reta BRUTA — a que esta' desenhada. O % afirmado sai da
  // reta com a peca descontada, que e' OUTRA serie: por isso a frase diz de
  // qual dos dois cada numero vem, em vez de deixar quem le' fazer a conta
  // e achar que os numeros brigam.
  const noGrafico = reta ? `${Math.round(reta.inicio)} → ${Math.round(reta.fim)} pç/h` : '';

  if (n < MIN_MEDICOES_TENDENCIA) {
    return {
      rotulo: 'Poucas medições',
      tom: 'neutro',
      mostrarPct: false,
      frase: `Com ${n} ${n === 1 ? 'medição' : 'medições'} não dá para falar de tendência no tempo: `
        + `a partir de ${MIN_MEDICOES_TENDENCIA} desta máquina o relatório passa a mostrar se o ritmo sobe ou cai.`,
    };
  }

  if (direcao === 'subindo' || direcao === 'caindo') {
    const subiu = direcao === 'subindo';
    return {
      rotulo: subiu ? 'Ritmo subindo' : 'Ritmo caindo',
      tom: subiu ? 'ok' : 'atencao',
      mostrarPct: true,
      frase: `Comparando cada peça consigo mesma, o ritmo ${subiu ? 'subiu' : 'caiu'} ${limpo}% no período. `
        + `No gráfico a linha vai de ${noGrafico}, sem esse desconto — a diferença entre os dois números é a peça. `
        + (subiu
          ? 'O que melhorou aqui vale virar padrão: ver o que mudou de ajuste, ferramenta ou abastecimento.'
          : 'Olhar broca, abastecimento e ajustes antes que vire perda de capacidade.'),
    };
  }

  /* NAO DA' PARA SEPARAR. A linha se mexe, mas ninguem mediu a mesma peca
     em datas distantes o bastante para dizer se quem mudou foi a maquina ou
     a peca. NAO e' "esta' tudo bem": pode ser uma queda real, e a frase
     precisa dizer isso e dizer o que destrava — senao o relatorio absolve a
     maquina por falta de dado, que foi o defeito que originou este ramo. */
  if (!podeSeparar && bruto >= RUIDO_PCT) {
    return {
      rotulo: 'Não dá para separar',
      tom: 'atencao',
      mostrarPct: true,
      frase: `A linha vai de ${noGrafico} (${bruto}%), mas cada data tem uma peça diferente `
        + '— pode ser a máquina rendendo menos, pode ser só a peça, e com estas medições não dá para '
        + 'saber qual. Meça a MESMA peça outra vez, em outra data: é o que separa uma coisa da outra.',
    };
  }

  /* E' A PECA — e aqui isso pode ser afirmado: alguma peca foi acompanhada
     ao longo do periodo, e comparada consigo mesma ela nao se mexeu. */
  if (podeSeparar && misturaPecas && limpo < RUIDO_PCT && bruto >= RUIDO_PCT) {
    return {
      rotulo: 'Efeito da peça',
      tom: 'neutro',
      mostrarPct: true,
      frase: `A linha vai de ${noGrafico} (${bruto}%), mas comparando cada peça consigo mesma o ritmo `
        + `não se mexeu (${limpo}%): o que mudou foi a peça medida em cada data, não a máquina. `
        + 'Para comparar ritmo entre datas, use o quadro Ritmo por peça.',
    };
  }

  /* Ha' movimento na serie descontada, mas ele nao passa no teste para o
     numero de medicoes e pecas desta maquina. Ver, mas nao afirmar. */
  if (bruto >= RUIDO_PCT || limpo >= RUIDO_PCT) {
    return {
      rotulo: 'Não confirmada',
      tom: 'neutro',
      mostrarPct: true,
      frase: `A linha vai de ${noGrafico} (${bruto}%), e descontada a peça a variação é de ${limpo}% — `
        + `movimento que estas ${n} medições ainda não confirmam como tendência. `
        + 'Mais medições da mesma peça fecham a conta.',
    };
  }

  return {
    rotulo: 'Ritmo estável',
    tom: 'ok',
    mostrarPct: false,
    frase: `Em ${n} medições a linha não subiu nem caiu no período`
      + (podeSeparar ? ', e isso vale também comparando cada peça consigo mesma.' : '.'),
  };
}

/** As series de todas as maquinas do resumo, na ordem em que ele vem. */
export function tendenciasDoPeriodo(conferencias, resumo) {
  return (resumo || []).map((g) => serieDoPeriodo(conferencias, g.maquina));
}
