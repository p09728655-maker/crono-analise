/**
 * O VOLUME A VOLUME EM PALAVRAS — o veredito e os numeros que a tela e a
 * folha A4 da Embalagem Takt Time escrevem.
 *
 * Mora no dominio, e nao no componente, por dois motivos: tela e papel leem
 * a MESMA frase (papel e tela dizendo coisas diferentes sobre os mesmos
 * numeros vira discussao na reuniao), e o teste precisa conferir a frase
 * que o gerente le — nao um numero intermediario que nenhuma tela mostra.
 * Foi assim que a regua errada do takt passou uma vez: o teste olhava o
 * numero certo e a tela escrevia outro.
 */
import { conferenciaRapida, potencialSemParada } from './crono/conferencia.js';
import { formatarSegundos } from './crono/formato.js';
import { diasProgramados } from './demanda/formato.js';

/** Takt e intervalo em SEGUNDOS, sempre: "72.0 s", nunca "1min12s". */
const seg = (ms) => (Number.isFinite(ms) && ms > 0 ? `${formatarSegundos(ms)} s` : '—');

/** Tempo somado (lacunas): ate' um minuto em segundos, dai' em min e s. */
export function tempoSomado(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}min${String(s % 60).padStart(2, '0')}s`;
}

/** Por que nao ha' linha de takt — em palavras, nunca so' um traco. */
export function semTakt(estado, nomeGrupo) {
  const g = nomeGrupo ? `do grupo ${nomeGrupo}` : 'do grupo';
  switch (estado) {
    case 'sem-grupo': return 'a máquina não está em nenhum grupo do cadastro, e sem grupo não há programa.';
    case 'sem-demanda': return `não há programa de produção ${g} cadastrado.`;
    case 'sem-semana': return `o programa ${g} não cobre a semana desta medição.`;
    case 'sem-horas': return `faltam as horas disponíveis ${g} na semana.`;
    case 'sem-dias': return `faltam os dias de produção da semana ${g} no cadastro: sem eles não se sabe que parte da semana são os dias programados.`;
    case 'setup-excede': return `o setup cadastrado ${g} passa da jornada — confira o cadastro.`;
    case 'erro-programa': return 'não deu para carregar o programa agora.';
    // Junção: a trava e' pela semana do calendario, o takt pela semana do
    // programa (por data). Se elas nao casam, nao ha' um takt so'.
    case 'takts-diferentes': return 'as medições caem em semanas diferentes do programa, com takts diferentes — não há um takt só para comparar a junção.';
    // So' no tablet (o programa vem guardado no aparelho, ver
    // useTaktDaSemana): a falta e' de rede, nao de programa nem de data.
    case 'sem-rede': return 'o programa da semana ainda não chegou a este aparelho (sem rede).';
    case 'carregando': return 'o programa da semana ainda está sendo buscado.';
    default: return 'a medição não tem data para achar a semana.';
  }
}

/**
 * O VEREDITO. Contra o takt vai o PERIODO por volume, paradas dentro (ver
 * periodoPorPeca) — a regua do veredito da semana. As duas camadas de baixo
 * dizem de onde vem a diferenca, e a primeira que cai dentro do takt
 * aponta a acao: paradas marcadas, lacunas ou o passo da linha.
 *
 * Sem periodo (medicao sem o relogio entre toques) NAO ha' veredito: cair
 * para a linha rodando seria exatamente a regua otimista que esta tela
 * deixou de usar.
 */
export function frasesVolumeAVolume({
  leitura, takt = {}, unidade, nomeGrupo, juncao = false,
}) {
  const { singular, plural } = unidade;
  if (!leitura.suficiente) {
    // "Intervalo", nao "ritmo": os volumes/hora ao lado valem com qualquer
    // numero de toques (saem da medicao inteira) — dizer que nao da' para
    // ler o ritmo, com ele no cartao, seria a tela se contradizendo.
    return {
      tom: 'neutro',
      manchete: `Poucos ${plural} para ler o intervalo`,
      linhas: [`${leitura.motivo}. O gráfico mostra o que foi tocado; os ${plural}/hora valem, porque saem da medição inteira.`],
    };
  }

  const linhas = [];
  let tom;
  let manchete;
  const periodo = leitura.periodoMs;
  const rodandoTxt = seg(leitura.mediaMs);
  const normalTxt = seg(leitura.normalMs);
  const temLacuna = leitura.lacunas.length > 0;
  const alvo = leitura.taktMs;

  if (!periodo) {
    manchete = `Com a linha rodando, saiu um ${singular} a cada ${rodandoTxt}.`;
    tom = temLacuna ? 'atencao' : 'neutro';
    linhas.push('Sem o relógio entre o primeiro e o último toque, não há veredito contra o takt: comparar a linha rodando com ele deixaria as paradas de fora.');
  } else if (alvo) {
    const abertura = `No período, saiu um ${singular} a cada ${seg(periodo)}, paradas dentro`;
    const pct = Math.abs(Math.round(((periodo / alvo) - 1) * 100));
    if (periodo <= alvo) {
      manchete = `${abertura} — dentro do takt de ${seg(alvo)}, com ${pct}% de folga.`;
      tom = temLacuna ? 'atencao' : 'atende';
    } else {
      manchete = `${abertura} — ${pct}% acima do takt de ${seg(alvo)}.`;
      tom = 'falha';
      if (leitura.mediaMs <= alvo) {
        linhas.push(`Com a linha rodando seriam ${rodandoTxt} por ${singular}, dentro do takt: o que tira a linha do takt são as paradas marcadas ${juncao ? 'nestas medições' : 'nesta medição'}.`);
      } else if (leitura.normalMs <= alvo) {
        linhas.push(`Com a linha rodando, ${rodandoTxt}; sem as lacunas, ${normalTxt}, dentro do takt: o que tira a linha do takt são as paradas que ninguém marcou.`);
      } else {
        linhas.push(`Mesmo sem parada nenhuma (${normalTxt} por ${singular}), a linha não acompanha a demanda: é o passo dela que está mais lento que o takt.`);
      }
    }
  } else {
    manchete = `No período, saiu um ${singular} a cada ${seg(periodo)}, paradas dentro; com a linha rodando, ${rodandoTxt}.`;
    tom = temLacuna ? 'atencao' : 'neutro';
    linhas.push(`Sem takt para comparar: ${semTakt(takt.estado, nomeGrupo)}`);
  }

  if (temLacuna) {
    const n = leitura.lacunas.length;
    const cerca = Math.round(leitura.pecasNoExcesso);
    linhas.push(
      `${n} ${n === 1 ? 'lacuna' : 'lacunas'} — intervalo maior que o dobro do normal (${normalTxt}) — `
      + `${n === 1 ? 'somou' : 'somaram'} ${tempoSomado(leitura.excessoMs)} além do normal`
      + `${cerca >= 1 ? `: cerca de ${cerca} ${cerca === 1 ? singular : plural} que ${cerca === 1 ? 'deixou' : 'deixaram'} de sair` : ''}. `
      + 'As paradas marcadas no cronômetro já estão fora desta conta: estas, ninguém marcou.',
    );
  } else {
    linhas.push('Nenhuma lacuna: nenhum intervalo passou do dobro do normal.');
  }
  return { tom, manchete, linhas };
}

/**
 * Os cinco numeros, na ordem em que se leem: o veredito (periodo x takt) e
 * as duas camadas do "se nao parasse". Mesma lista na tela e no papel.
 *
 * A `chave` e' para a tela escolher o que vai em destaque e o que vai na
 * faixa de apoio sem depender do texto do rotulo. Os dois tempos por
 * volume dizem no rotulo de que regua sao — "no periodo" e "com a linha
 * rodando" lado a lado, sem o "por volume", liam-se como a mesma coisa.
 *
 * Sem lacuna, o numero diz so' o que o criterio viu: nenhum intervalo
 * passou do limite. Nao diz que nao houve perda — parada marcada e passo
 * lento nao sao lacuna.
 */
export function numerosDaLeitura(leitura, takt = {}, unidade, { juncao = false } = {}) {
  if (!leitura.suficiente) {
    return [{
      chave: 'tocados', rotulo: 'Intervalos tocados', valor: String(leitura.n),
      sub: `a leitura começa com ${leitura.criterios.minIntervalos}`,
    }];
  }
  return [
    {
      chave: 'periodo',
      rotulo: `Por ${unidade.singular} no período`,
      valor: seg(leitura.periodoMs),
      // Na junção, cada medicao tem o seu primeiro e ultimo toque: o tempo
      // entre elas nao entra (ver juncaoMedicoes.js).
      sub: `com as paradas, do 1º ao último toque${juncao ? ' de cada medição' : ''}`,
    },
    {
      chave: 'takt',
      rotulo: 'Takt da semana',
      valor: seg(leitura.taktMs),
      // Semana programada so' em parte: o takt ja' usa as horas so' dos
      // dias com lote, e o papel diz quantos — senao 35,2 h parece erro.
      sub: leitura.taktMs
        ? `semana ${takt.semana} · por ${unidade.singular}${diasProgramados(takt.dias) ? ` · ${diasProgramados(takt.dias)}` : ''}`
        : (takt.estado === 'takts-diferentes' ? 'medições em semanas diferentes do programa' : 'sem programa para comparar'),
    },
    {
      chave: 'rodando',
      rotulo: `Por ${unidade.singular} com a linha rodando`,
      valor: seg(leitura.mediaMs),
      sub: 'sem as paradas marcadas',
    },
    // A terceira camada, com o nome das outras duas (v2.99.5): na faixa de
    // apoio, "Sem as lacunas" passava despercebido — e e' o passo da linha.
    {
      chave: 'normal',
      rotulo: `Por ${unidade.singular} sem as lacunas`,
      valor: seg(leitura.normalMs),
      sub: 'o passo da linha: sem parada marcada nem lacuna',
    },
    {
      chave: 'lacunas',
      rotulo: 'Lacunas',
      valor: String(leitura.lacunas.length),
      sub: leitura.lacunas.length
        ? `${tempoSomado(leitura.excessoMs)} além do normal${rotuloRoubadosLacunas(leitura, unidade)}`
        : `nenhum intervalo passou de ${leitura.criterios.fatorLacuna}× o normal`,
    },
  ];
}

/**
 * VOLUMES/HORA DA MEDICAO — o MESMO numero da coluna da lista e do
 * resultado no tablet: volumes / medicao inteira, paradas dentro
 * (pecasPorHoraBruto, pela mesma conferenciaRapida). Quem clica no 341 da
 * lista tem de achar 341 aqui, e nao um terceiro numero.
 *
 * Nao e' 3.600 / "por volume no periodo": a medicao inteira traz tambem o
 * tempo antes do primeiro toque e depois do ultimo e, com setup PLANEJADO,
 * o setup marcado entre os toques — que o periodo tira (ver
 * periodoPorPeca). O subtitulo diz de que tempo sai, e o "como ler"
 * explica a diferenca. Sem tempo para dividir, '—', como na lista — nunca 0.
 *
 * O subtitulo e' o do PAPEL: na folha nao ha' lista, e "o mesmo da lista"
 * la' nao diria nada. A tela acrescenta isso.
 */
export function porHoraDaMedicao(conferencia, unidade) {
  const calc = conferenciaRapida({
    duracaoMs: Number(conferencia.duracao_ms), pecas: conferencia.pecas, paradas: conferencia.paradas,
  });
  return {
    chave: 'porHora',
    rotulo: `${unidade.plural.charAt(0).toUpperCase()}${unidade.plural.slice(1)}/hora`,
    valor: calc ? String(Math.round(calc.pecasPorHoraBruto)) : '—',
    sub: 'na medição inteira, com as paradas',
  };
}


/**
 * OS VOLUMES QUE AS LACUNAS ROUBARAM (v2.99.5) — a parada que ninguem
 * marcou tambem e' caixa que nao saiu, e e' a perda mais perigosa: nao
 * aparece no Pareto. A conta ja' existia (leituraPecaAPeca: o tempo ALEM do
 * normal ÷ o normal); o que muda e' que ela sai da frase e vira numero.
 *
 * NAO SOMA com os roubados pelas paradas, e a tela diz por que:
 *  - a parada anotada DEPOIS (no resultado do tablet ou no PC) continua
 *    dentro dos intervalos e pode virar lacuna — somando, contaria duas
 *    vezes;
 *  - as reguas sao outras: as paradas usam o passo da linha rodando (com
 *    as lacunas dentro), as lacunas usam o passo sem elas.
 * Cada numero pede uma acao diferente: parada marcada, ir na causa;
 * lacuna, descobrir o que aconteceu e cobrar o apontamento.
 *
 * Null sem leitura (menos intervalos que o minimo) ou sem lacuna: a tela
 * nao escreve "0 roubados pelas lacunas" sobre uma medicao sem lacuna.
 */
export function roubadosPelasLacunas(leitura) {
  if (!leitura?.suficiente || !leitura.lacunas?.length || !(leitura.normalMs > 0)) return null;
  return {
    roubados: Math.round(leitura.pecasNoExcesso),
    excessoMs: leitura.excessoMs,
    passoMs: leitura.normalMs,
    n: leitura.lacunas.length,
  };
}

/** " · ≈12 volumes não embalados" — so' quando a lacuna custou ao menos um. */
function rotuloRoubadosLacunas(leitura, unidade) {
  const k = roubadosPelasLacunas(leitura)?.roubados || 0;
  if (k < 1) return '';
  return ` · ≈${k} ${k === 1 ? unidade.singular : unidade.plural} ${naoSaiu(unidade, k)}`;
}

/** "deixaram de ser embalados" na embalagem; "deixaram de sair" no resto. */
export function deixaramDe(unidade, n = 2) {
  if (unidade?.singular === 'volume') return n === 1 ? 'deixou de ser embalado' : 'deixaram de ser embalados';
  return n === 1 ? 'deixou de sair' : 'deixaram de sair';
}

/** "não embalados" na embalagem; "que não saíram" no resto. */
export function naoSaiu(unidade, n = 2) {
  if (unidade?.singular === 'volume') return n === 1 ? 'não embalado' : 'não embalados';
  return n === 1 ? 'que não saiu' : 'que não saíram';
}

/**
 * O QUE DEIXOU DE SER EMBALADO (v2.99.6) — o TOTAL, num passo so', e de
 * onde ele veio. Pedido do PCP: um numero so' para "quanto perdemos".
 *
 * O passo e' o da linha sem parada nem lacuna (leitura.normalMs, v). O
 * potencial e' a medicao inteira nesse passo; o que deixou de ser embalado
 * e' o potencial menos o que saiu. E ele se abre EXATO, porque a soma dos
 * intervalos e' (volumes - 1) x v + o excesso das lacunas:
 *
 *   duracao / v - saiu =  paradas marcadas no cronometro entre os toques / v
 *                       + excesso das lacunas / v
 *                       + (antes do 1o e depois do ultimo toque - v) / v
 *
 * (o "- v" e' o volume da largada ao 1o toque, que e' trabalho, nao perda).
 *
 * SEM CONTAGEM DUPLA: a parada anotada DEPOIS (no resultado do tablet ou no
 * PC) esta' dentro dos intervalos — entra na lacuna, se virou uma, e so'
 * nela. As paradas desta conta sao as que o cronometro tirou das marcas:
 * o relogio entre o 1o e o ultimo toque menos o tempo das marcas.
 *
 * Cada parte e' arredondada e o total e' a SOMA delas: a tela nao mostra
 * partes que nao fecham com o total, e a das lacunas e' o mesmo numero do
 * cartao Lacunas. O "antes/depois" nunca fica negativo (largada e Encerrar
 * mais rapidos que um volume nao sao ganho).
 *
 * `itens`: [{ conferencia, marcas, relogio }] — uma medicao ou as da
 * junção, com a leitura dela (a da junção tem o normal da junção). Null sem
 * leitura, sem relogio entre toques (medicao antiga) ou com marcas que nao
 * explicam a contagem: ai' a tela fica com os roubados pelas paradas.
 */
export function deixouDeEmbalar(itens, leitura) {
  if (!leitura?.suficiente || !(leitura.normalMs > 0) || !itens?.length) return null;
  const v = leitura.normalMs;
  const medicoes = [];
  for (const { conferencia: c, marcas, relogio } of itens) {
    const lista = Array.isArray(marcas) ? marcas.map(Number) : [];
    const duracaoMs = Number(c?.duracao_ms) || 0;
    const saiu = Math.floor(Number(c?.pecas) || 0);
    const rel = Number(relogio);
    if (lista.length < 2 || lista.length !== saiu || !(rel > 0) || duracaoMs < rel) return null;
    const entreToques = lista[lista.length - 1] - lista[0];
    medicoes.push({
      conferencia: c,
      saiu,
      duracaoMs,
      // As paradas que o cronometro tirou das marcas, entre os toques.
      paradasMs: Math.max(0, rel - entreToques),
      // Fora dos toques, menos o volume da largada (ver o cabecalho).
      foraMs: duracaoMs - rel - v,
    });
  }
  const soma = (f) => medicoes.reduce((t, m) => t + f(m), 0);
  const partes = {
    paradasMs: soma((m) => m.paradasMs),
    paradas: Math.round(soma((m) => m.paradasMs) / v),
    lacunasMs: leitura.excessoMs,
    lacunas: Math.round(leitura.excessoMs / v),
    foraMs: Math.max(0, soma((m) => m.foraMs)),
    fora: Math.max(0, Math.round(soma((m) => m.foraMs) / v)),
  };
  const total = partes.paradas + partes.lacunas + partes.fora;
  const saiu = soma((m) => m.saiu);
  return {
    passoMs: v,
    duracaoMs: soma((m) => m.duracaoMs),
    saiu,
    potencial: saiu + total,
    total,
    partes,
    // Por medicao (a junção): paradas e "antes/depois" de cada uma no passo
    // da junção; as lacunas de cada uma vem de juntarMedicoes.
    porMedicao: medicoes.map((m) => ({
      id: m.conferencia.id,
      paradas: Math.round(m.paradasMs / v),
      fora: Math.max(0, Math.round(m.foraMs / v)),
    })),
  };
}

/**
 * OS VOLUMES QUE AS PARADAS ROUBARAM — o que saiu x o que teria saido no
 * MESMO tempo, no passo que a linha provou rodando. E' potencialSemParada,
 * a conta que a conferencia de ritmo ja' faz, com o nome da pergunta do
 * PCP: minuto parado e' abstrato, caixa que nao saiu nao e'.
 *
 * As paradas sao as marcadas na medicao inteira (as mesmas do "Parado" da
 * lista), setup incluido — `setupMs` vai junto para a tela dizer quanto
 * dele ha' no total. Sem parada marcada (ou sem tempo rodando), null: nao
 * ha' o que mostrar, e a tela nao escreve "0 roubados" sobre uma medicao
 * que nao parou.
 */
export function roubadosPelasParadas(conferencia) {
  const calc = conferenciaRapida({
    duracaoMs: Number(conferencia.duracao_ms), pecas: conferencia.pecas, paradas: conferencia.paradas,
  });
  if (!calc) return null;
  const p = potencialSemParada({ pecas: calc.pecas, duracaoMs: calc.duracaoMs, produtivoMs: calc.produtivoMs });
  if (!p) return null;
  return {
    saiu: p.pecas,
    potencial: p.potencial,
    roubados: p.perdidas,
    paradaMs: p.paradaMs,
    setupMs: calc.setupMs,
    porHoraRodando: p.ritmoPotencial,
  };
}
