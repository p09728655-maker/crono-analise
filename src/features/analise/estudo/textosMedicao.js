/**
 * A CAPACIDADE E O MEDIDO NA LINHA em palavras — o mesmo texto na tela e
 * nas duas folhas.
 *
 * Os numeros saem de medicaoDoEstudo e comparativoCapacidade; aqui so' se
 * decide como cada caso se escreve. Fica num lugar so' porque a tela, a
 * Folha de Analise e o Resumo Executivo precisam dizer a MESMA coisa: um
 * papel que chama de "medido" o que a tela chamou de "amostra curta", ou
 * que diz "a linha atende" onde a tela diz "pelo tempo padrao atenderia",
 * desmente a tela na reuniao.
 *
 * A UNIDADE: fora da embalagem, peca. Na embalagem o estudo mede o PRODUTO
 * inteiro (unidadeDoEstudo), e todo numero por hora do quadro de
 * capacidade diz "produtos/h" — o medido tambem, quando converteu os
 * volumes; "vol/h" so' quando nao pode converter, e o cartao diz por que.
 *
 * O ARREDONDAMENTO e' so' de exibicao (a conta usa o valor cheio): taxas
 * por hora para baixo, com uma casa abaixo de 100/h (exibirPorHora — a
 * capacidade de cada operacao tambem); percentual e deficit com uma casa,
 * porque na embalagem (25/h) uma unidade vale 4% e o inteiro escondia a
 * diferenca entre 98,6% e 100%.
 */
import {
  CRITERIOS_CONFERENCIA, formatarDuracao, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { TETO_LISTA_CONFERENCIAS } from '../../../domain/medicaoDoEstudo.js';

const POR_HORA = { 'peça': 'pç/h', produto: 'produtos/h', volume: 'vol/h' };
export const porHora = (unidade) => POR_HORA[unidade] || 'pç/h';

const POR_HORA_EXTENSO = { 'peça': 'peças/hora', produto: 'produtos/hora', volume: 'volumes/hora' };
/** "peças/hora" ou "produtos/hora": o numero grande do topo. */
export const porHoraExtenso = (unidade) => POR_HORA_EXTENSO[unidade] || 'peças/hora';

/** "por peça" ou "por produto": o takt e o tempo do gargalo. */
export const porUnidade = (unidade) => (unidade === 'produto' ? 'por produto' : 'por peça');

const UMA_CASA = { maximumFractionDigits: 1, useGrouping: false };

/**
 * A taxa por hora COMO A TELA A ESCREVE: para baixo, como a capacidade;
 * abaixo de 100/h com uma casa — na embalagem a taxa e' ~25/h, e cada
 * unidade inteira vale 4%: "Exigido 24 · Medido 24 · Deficit -0,4" nao
 * fechava a conta e escondia que 24,66 era a demanda. A folga de 1e-9 e'
 * do ponto flutuante: 3.600.000 / 144.000 tem de dar 25, nao 24.
 */
const comoExibe = (v) => (v < 100 ? Math.floor(v * 10 + 1e-9) / 10 : Math.floor(v + 1e-9));
/** O NUMERO que exibirPorHora escreve, para conta que tem de fechar com ele. */
export const taxaEscrita = (v) => (Number.isFinite(v) ? comoExibe(v) : null);
export const exibirPorHora = (v) => (Number.isFinite(v) ? comoExibe(v).toLocaleString('pt-BR', UMA_CASA) : '—');

/**
 * A capacidade de UMA operacao (o resultado de calcularOperacao) escrita
 * como a do quadro: do valor cheio, nao do `cap` inteiro. Com o inteiro, a
 * tabela dizia 31 na linha do gargalo e o quadro, 31,1.
 */
export const capDaOperacao = (r) => exibirPorHora(r && r.tpPorPeca > 0 ? 3600000 / r.tpPorPeca : null);

/**
 * O ritmo por minuto, por extenso, com a unidade: "3,7 pç/min" a partir de
 * 60/h; abaixo disso, "1 produto a cada 2,4 min". Uma casa por minuto na
 * embalagem (~25/h) arredondava 4% a 20%: "25/h · 0,4/min" ao lado, e
 * 0,4 x 60 = 24.
 */
export function porMinuto(porHoraValor, unidade = 'peça') {
  if (!Number.isFinite(porHoraValor) || porHoraValor <= 0) return '—';
  const curta = unidade === 'produto' ? 'produtos' : 'pç';
  if (porHoraValor >= 60) {
    return `${(porHoraValor / 60).toLocaleString('pt-BR', { minimumFractionDigits: 1, ...UMA_CASA })} ${curta}/min`;
  }
  return `1 ${unidade === 'produto' ? 'produto' : 'peça'} a cada ${(60 / porHoraValor).toLocaleString('pt-BR', UMA_CASA)} min`;
}

/**
 * O deficit/superavit que a tela escreve, DERIVADO dos dois numeros que
 * ela mostra (a regra de contaDasHoras): a subtracao que o analista
 * confere de cabeca bate sempre. O atingimento continua com os valores
 * cheios. Null sem base de comparacao.
 *
 * A excecao: os dois para baixo podem cair no MESMO numero com a linha
 * abaixo do exigido (24,62 contra 24,66 escritos 24,6 e 24,6). "Deficit 0"
 * ao lado de "nao atende" e' a tela se desmentindo — ai' sai o deficit
 * cheio para baixo, no passo dos numeros ao lado: -0,1 abaixo de 100/h,
 * -1 acima (onde os numeros sao inteiros).
 */
export function diferencaExibida(capacidade) {
  if (!capacidade || capacidade.diferenca === null || capacidade.diferenca === undefined) return null;
  const base = capacidade.base === 'medido' ? capacidade.medido : capacidade.real;
  if (!Number.isFinite(base) || !Number.isFinite(capacidade.esperado)) return capacidade.diferenca;
  const escrita = Math.round((comoExibe(base) - comoExibe(capacidade.esperado)) * 10) / 10;
  const cheia = base - capacidade.esperado;
  if (cheia < 0 && escrita >= 0) {
    // Para baixo no passo dos numeros ao lado: 0,1 abaixo de 100/h, 1 acima
    // ("300 · 300 · -1", nunca "-0,7" ao lado de dois inteiros).
    const passo = comoExibe(capacidade.esperado) >= 100 ? 1 : 0.1;
    return Math.round(Math.floor(cheia / passo + 1e-9) * passo * 10) / 10;
  }
  return escrita;
}

/**
 * Percentual com uma casa ("98,6%", "74%"). Abaixo de 100 nunca vira
 * "100%": 99,96% ao lado de "abaixo do ritmo exigido" e' a tela se
 * desmentindo.
 */
export function exibirPct(pct) {
  if (!Number.isFinite(pct)) return '—';
  const v = pct < 100 ? Math.min(pct, 99.9) : pct;
  return `${v.toLocaleString('pt-BR', UMA_CASA)}%`;
}

/** Deficit/superavit com sinal e uma casa: "-0,4", "+6", "-77,4". */
export function exibirDiferenca(d) {
  if (!Number.isFinite(d)) return '—';
  const txt = Math.abs(d).toLocaleString('pt-BR', UMA_CASA);
  if (d < 0) return `-${txt}`;
  return d > 0 ? `+${txt}` : txt;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** "de 10/10 a 15/10", ou "em 12/10" quando foi tudo no mesmo dia. */
export function periodoDaMedicao(m) {
  if (!Number.isFinite(m?.desde) || !Number.isFinite(m?.ate)) return '';
  const de = dataCurta(m.desde);
  const ate = dataCurta(m.ate);
  return de === ate ? `em ${de}` : `de ${de} a ${ate}`;
}

/**
 * Onde o posto se mede, no tablet: o nome que o analista ve' no menu.
 * Posto fora do cadastro nao tem grupo que diga a unidade; ai' vale o
 * proprio nome do posto ("EMBALAGEM"), a mesma regra de unidadeDoPosto.
 */
export const ondeMedir = (m, recurso) => (
  m?.contada === 'volume' || unidadeDoPosto(recurso).singular === 'volume'
    ? 'Embalagem Takt Time'
    : 'Ritmo por máquina'
);

/** Do criterio do relatorio, so' o que faltou — em uma linha. */
function amostraCurta(m) {
  const c = CRITERIOS_CONFERENCIA;
  const f = m.faltas || {};
  const partes = [];
  if (f.medicoes) partes.push(`${m.n} de ${c.minConferencias} medições`);
  if (f.tempo) partes.push(`${formatarDuracao(m.produtivoMs)} de ${formatarDuracao(c.minTempoTotalMs)} com a linha rodando`);
  if (f.curtas) partes.push(`${plural(f.curtas, 'medição', 'medições')} com menos de ${formatarDuracao(c.minPeriodoMs)}`);
  return `amostra curta${partes.length ? ` (${partes.join('; ')})` : ''}`;
}

/* A lista do servidor tem teto, e vem das mais novas para as mais velhas,
   de todas as maquinas: cheia, a medicao velha do posto pode nao ter vindo. */
const linhaDoTeto = (m) => (m.noTeto
  ? [`a lista do servidor veio no teto de ${TETO_LISTA_CONFERENCIAS} medições (de todas as máquinas): medições mais antigas deste posto podem ter ficado de fora`]
  : []);

/**
 * O cartao "Medido na linha": valor, unidade, as linhas da nota, o nivel
 * (para a cor da barra), uma frase CURTA para o papel e o `porQue` — por
 * que a medicao nao confirma o veredito, quando nao confirma.
 *
 * `carga` e' o que useMedicaoDoEstudo devolve: { estado, erro, medicao }.
 * `erro: true` pede o botao "Tentar de novo" na tela.
 */
export function lerMedido(carga, { recurso, produto } = {}) {
  if (!carga || carga.estado === 'carregando') {
    return {
      valor: '…', unidade: '', nivel: 'neutro', erro: false,
      linhas: ['buscando as medições do posto'], curto: 'medição da linha ainda carregando',
      porQue: 'a medição da linha ainda está carregando',
    };
  }
  if (carga.estado === 'erro' || !carga.medicao) {
    return {
      valor: '—', unidade: '', nivel: 'neutro', erro: true,
      linhas: [`não deu para buscar a medição agora${carga.erro ? ` (${carga.erro})` : ''} — o resto da análise não depende dela`],
      curto: 'medição da linha indisponível',
      porQue: 'não deu para buscar a medição da linha',
    };
  }

  const m = carga.medicao;
  if (m.motivo === 'sem-posto') {
    return {
      valor: '—', unidade: '', nivel: 'neutro', erro: false,
      linhas: ['o estudo não tem posto — informe o recurso em Editar estudo: a medição é casada por posto e produto'],
      curto: 'sem posto no estudo',
      porQue: 'o estudo não tem posto',
    };
  }
  if (m.motivo === 'sem-produto') {
    return {
      valor: '—', unidade: '', nivel: 'neutro', erro: false,
      linhas: ['o estudo não tem produto — informe-o em Editar estudo: a medição é casada por posto e produto'],
      curto: 'sem produto no estudo',
      porQue: 'o estudo não tem produto',
    };
  }
  if (m.motivo === 'sem-medicao') {
    const onde = ondeMedir(m, recurso);
    const arq = m.arquivadas || 0;
    /* ARQUIVADAS: a medicao existe, guardada, fora da conta. "Nenhuma
       medicao / para medir..." mandava medir de novo o que esta' no banco.
       Restaurar e' no relatorio Ritmo por maquina — e' la' que a medicao
       se arquiva, a da Embalagem Takt Time tambem. */
    const linhas = arq > 0
      ? [
        `${plural(arq, 'medição', 'medições')} de ${produto} em ${recurso} dos últimos ${m.dias} dias ${arq === 1 ? 'está arquivada' : 'estão arquivadas'} — fora da conta`,
        `para ${arq === 1 ? 'usá-la' : 'usá-las'}: restaure no relatório Ritmo por máquina, em Arquivadas${onde === 'Embalagem Takt Time' ? ' (a medição da Embalagem Takt Time se restaura lá também)' : ''}`,
      ]
      : [
        `nenhuma medição de ${produto} em ${recurso} nos últimos ${m.dias} dias`,
        `para medir: no tablet, ${onde}, com este posto e este produto`,
      ];
    // O caso que mais acontece na embalagem: o estudo diz o GRUPO e a
    // medicao grava a MAQUINA. Nenhuma medicao vai casar ate' trocar.
    if (carga.postoNoCadastro === false) {
      linhas.push(`“${recurso}” não é uma máquina do cadastro, e a medição grava a máquina — escolha-a em Editar estudo`);
    }
    if (m.outrosProdutos) {
      linhas.push(`${plural(m.outrosProdutos, 'medição', 'medições')} do posto com outro produto — confira a grafia`);
    }
    if (m.antigas) {
      linhas.push(m.antigas === 1
        ? `1 medição mais antiga que ${m.dias} dias ficou de fora`
        : `${m.antigas} medições mais antigas que ${m.dias} dias ficaram de fora`);
    }
    linhas.push(...linhaDoTeto(m));
    return arq > 0
      ? {
        valor: '—', unidade: '', nivel: 'atencao', erro: false, linhas,
        curto: `${plural(arq, 'medição arquivada', 'medições arquivadas')} nos últimos ${m.dias} dias, fora da conta (restaurar no relatório Ritmo por máquina, em Arquivadas)`,
        porQue: arq === 1
          ? 'a medição do posto com este produto está arquivada'
          : `as ${arq} medições do posto com este produto estão arquivadas`,
      }
      : {
        valor: '—', unidade: '', nivel: 'neutro', erro: false, linhas,
        curto: `sem medição nos últimos ${m.dias} dias (medir em ${onde})`,
        porQue: `não há medição de ${produto} em ${recurso} nos últimos ${m.dias} dias`,
      };
  }

  // Daqui para baixo ha' numero, escrito como os outros dois (exibirPorHora).
  const u = porHora(m.unidade);
  const valor = exibirPorHora(m.ritmo);
  const rodando = `com a linha rodando: ${exibirPorHora(m.ritmoRodando)} ${u}`;
  const base = `${[plural(m.n, 'medição', 'medições'), periodoDaMedicao(m)].filter(Boolean).join(' ')} · ${REGUA_DO_SETUP[m.regraSetup === 'relogio' && m.setupPlanejado ? 'relogio-com-plano' : m.regraSetup] || REGUA_DO_SETUP.relogio}`;
  const setup = linhaDoSetup(m, u);

  if (m.motivo === 'sem-volumes') {
    const linhas = [
      base,
      ...setup,
      'informe os volumes do produto em Produtos para converter em produtos/h — até lá não entra no atingimento',
    ];
    if (!m.suficiente) linhas.push(amostraCurta(m));
    linhas.push(...linhaDoTeto(m));
    return {
      valor, unidade: u, nivel: 'atencao', erro: false, linhas,
      curto: `${valor} ${u} (${base}) — sem os volumes do produto no cadastro: não convertido, fora do atingimento`,
      porQue: 'faltam os volumes do produto no cadastro para converter a medição em produtos',
    };
  }
  if (m.motivo === 'amostra-insuficiente') {
    return {
      valor, unidade: u, nivel: 'atencao', erro: false,
      linhas: [base, ...setup, `${amostraCurta(m)} — não entra no atingimento`, rodando, ...linhaDoTeto(m)],
      curto: `${valor} ${u} (${base}) — ${amostraCurta(m)}: fora do atingimento`,
      porQue: amostraCurta(m),
    };
  }

  const linhas = [base, ...setup, rodando];
  if (m.convertido) {
    // O contado com a precisao do convertido: "101 ÷ 2" ao lado de 50,9 nao
    // fechava (o contado passava de 100/h e perdia a casa).
    const contado = m.ritmo < 100 ? Math.floor(m.ritmoContado * 10 + 1e-9) / 10 : Math.floor(m.ritmoContado + 1e-9);
    linhas.push(`contados ${contado.toLocaleString('pt-BR', UMA_CASA)} vol/h ÷ ${plural(m.volumes, 'volume', 'volumes')} por produto`);
  }
  linhas.push(...linhaDoTeto(m));
  return {
    valor, unidade: u, nivel: m.noTeto ? 'atencao' : 'neutro', erro: false, linhas,
    curto: `${valor} ${u} (${base}${setup.length ? `; ${setup[0]}` : ''})`,
    porQue: null,
  };
}

/* A REGUA do medido, na linha de base do cartao: o que ficou dentro do
   relogio e o que saiu (medicaoDoEstudo, regraSetup). */
const REGUA_DO_SETUP = {
  relogio: 'no relógio, paradas dentro',
  'relogio-com-plano': 'no relógio, paradas dentro, inclusive o setup marcado',
  'sem-setup': 'no relógio, paradas dentro, menos o setup marcado',
  fatia: 'no relógio, paradas dentro; o setup entra pela fatia do plano do grupo',
};

const pctDaJornada = (f) => `${(f * 100).toLocaleString('pt-BR', UMA_CASA)}% da jornada`;

/**
 * O PORQUE DA REGUA do setup, numa linha: de onde veio o takt, e o numero
 * com o setup marcado dentro do relogio para quem quiser comparar. Vazio
 * sem setup planejado no grupo — ali o setup e' uma parada como as outras.
 */
function linhaDoSetup(m, u) {
  const marcado = m.setupMedidoMs > 0 ? formatarDuracao(m.setupMedidoMs) : null;
  const inteiro = `com tudo dentro do relógio, ${exibirPorHora(m.ritmoRelogio)} ${u}`;
  if (m.regraSetup === 'sem-setup') {
    return [marcado
      ? `setup marcado (${marcado}) fora do relógio: o takt veio do programa da semana, que já desconta o setup planejado; ${inteiro}`
      : 'o takt veio do programa da semana, que já desconta o setup planejado'];
  }
  if (m.regraSetup === 'fatia') {
    const deOnde = m.taktOrigem === 'manual'
      ? 'o takt foi digitado com a jornada cheia'
      : 'a origem do takt não foi registrada (estudo anterior à 2.94.0) e ele é tratado como digitado, com a jornada cheia';
    return [`${deOnde}: o setup entra como o plano do grupo (${pctDaJornada(m.fatiaSetup)})`
      + `${marcado ? `, não pelo marcado nas medições (${marcado})` : ''}; ${inteiro}`];
  }
  if (m.setupPlanejado) {
    return [`setup marcado${marcado ? ` (${marcado})` : ''} dentro do relógio: faltam as horas da semana do grupo `
      + 'no cadastro para contar só a fatia do setup planejado'];
  }
  return [];
}

/**
 * O VEREDITO do quadro de capacidade, em palavras — a tela, a Folha e o
 * Resumo leem daqui.
 *
 * So' o MEDIDO na linha diz que a linha atende. Pela capacidade do tempo
 * padrao, o estudo diz que ela ATENDERIA: e' conta sobre o gargalo, nao o
 * que saiu do posto. Escrever "a linha atende" nesse caso, ao lado de um
 * medido que mostra o contrario (o medido sem os volumes do produto, por
 * exemplo), era o papel afirmando o que ninguem mediu (revisao de 20/10).
 * Por isso, sem medido utilizavel, a frase diz que a medicao ainda nao
 * confirma — e por que (`porQue` de lerMedido).
 *
 * Devolve { atende, confirmado, tom, simbolo, frase, nota }: `frase` e' a
 * do papel, `nota` a do cartao de atingimento, `tom` a cor da barra.
 */
export function vereditoCapacidade(capacidade, doMedido) {
  if (!capacidade || capacidade.esperado === null) {
    return {
      atende: null, confirmado: false, tom: 'neutro', simbolo: '',
      frase: 'Sem Takt configurado, não há veredito de atendimento.', nota: '—',
    };
  }
  // Com takt, sem ciclos e sem medicao: o exigido existe, a resposta nao.
  if (capacidade.atende === null) {
    return {
      atende: null, confirmado: false, tom: 'neutro', simbolo: '',
      frase: 'Sem ciclos coletados nem medição na linha, ainda não há veredito de atendimento.',
      nota: 'sem ciclos nem medição: ainda não há veredito',
    };
  }
  const { atende } = capacidade;
  if (capacidade.base === 'medido') {
    return {
      atende,
      confirmado: true,
      tom: atende ? 'ok' : 'critico',
      simbolo: atende ? '✓' : '⚠',
      frase: atende
        ? 'A linha atende o ritmo da demanda, medida na linha.'
        : 'A linha não atende o ritmo da demanda, medida na linha.',
      nota: `${atende ? 'a linha entrega o ritmo' : 'abaixo do ritmo exigido'} · base: medido na linha`,
    };
  }
  const porQue = doMedido?.porQue || 'sem medição utilizável na linha';
  return {
    atende,
    confirmado: false,
    // Atender so' na conta nao e' verde: e' "falta confirmar".
    tom: atende ? 'atencao' : 'critico',
    simbolo: atende ? '' : '⚠',
    frase: atende
      ? `Pelo tempo padrão, a linha atenderia o ritmo da demanda — a medição ainda não confirma: ${porQue}.`
      : `Pelo tempo padrão, a linha não atende o ritmo da demanda — a medição ainda não confirma: ${porQue}.`,
    nota: `${atende ? 'pelo tempo padrão atenderia' : 'abaixo do ritmo exigido pelo tempo padrão'} · a medição ainda não confirma: ${porQue}`,
  };
}
