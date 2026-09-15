/**
 * O CALENDARIO DA FABRICA — a que semana pertence uma data.
 *
 * O programa e' numerado por semana (001-26) e a medicao e' datada; casar
 * os dois e' o assunto deste arquivo. A conta usa o dia CIVIL de Sao
 * Paulo: a medicao de segunda as 07h nao pode cair na semana anterior
 * porque o navegador do PC esta' em UTC.
 *
 * As semanas da fabrica NAO sao as do calendario — a 035-26 vai de terca
 * 08/09 a segunda 14/09 porque 07/09 foi feriado, e o rotulo S corre uma
 * semana a frente do ISO. Por isso o casamento por PERIODO (a data cai
 * dentro da janela da linha) vale mais que o numero da semana, que erra em
 * toda semana com feriado.
 */

/**
 * A SEMANA de uma medicao — ISO 8601, no relogio da fabrica.
 *
 * O programa e' numerado por semana (001-26) e a medicao e' datada. Para
 * casar os dois e' preciso dizer a que semana a data pertence, e a conta
 * usa o dia CIVIL da fabrica: a medicao de segunda as 07h em Sao Paulo nao
 * pode cair na semana anterior porque o navegador do PC esta' em UTC.
 *
 * ISO: a semana comeca na SEGUNDA e a semana 1 e' a que contem a primeira
 * quinta-feira do ano. E' a convencao do Brasil e a que o Excel usa em
 * NUMSEMANA(data; 21) — se a numeracao do PCP for outra, a tela deixa
 * escolher a semana a mao, e por isso este numero nunca decide sozinho.
 */
const FUSO_FABRICA = 'America/Sao_Paulo';

const civilDaFabrica = (() => {
  let fmt = null;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO_FABRICA, year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { fmt = null; }
  return (data) => {
    // Ambiente sem base de fusos: cai no relogio local — pior que o certo,
    // melhor que quebrar o relatorio.
    if (!fmt) return [data.getFullYear(), data.getMonth() + 1, data.getDate()];
    const [a, m, d] = fmt.format(data).split('-').map(Number);
    return [a, m, d];
  };
})();

export function semanaIso(data) {
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) return null;
  const [a, m, d] = civilDaFabrica(quando);
  // A quinta-feira da mesma semana define o ano ISO: e' o que faz 31/12 e
  // 01/01 caírem na mesma semana quando e' o caso.
  const utc = new Date(Date.UTC(a, m - 1, d));
  const diaDaSemana = utc.getUTCDay() || 7;            // segunda = 1, domingo = 7
  utc.setUTCDate(utc.getUTCDate() + 4 - diaDaSemana);
  const ano = utc.getUTCFullYear();
  const primeiroDia = Date.UTC(ano, 0, 1);
  const numero = Math.ceil((((utc.getTime() - primeiroDia) / 86400000) + 1) / 7);
  return { ano, numero };
}

/**
 * QUANTOS DIAS uma semana do programa cobre a partir do inicio.
 *
 * SETE, fixo. A semana da fabrica produz de segunda a sexta, e a janela de
 * sete dias cobre o sabado e o domingo (onde nao ha' medicao) sem alcancar
 * a seguinte. Cobre tambem a semana deslocada por feriado: a 035-26 vai de
 * terca 08/09 a segunda 14/09, sete dias exatos.
 *
 * POR QUE NAO "ate' a vespera da proxima", que parecia mais esperto: a
 * planilha tem saltos de oito a onze dias (Pascoa, Tiradentes, Corpus
 * Christi, 7 de setembro), e esticar a janela ate' a semana seguinte
 * resolveria esses dias — mas atribuiria a semana ANTERIOR todos os dias
 * de uma semana que faltou na colagem. Colando S36 e S38 sem a S37, a
 * medicao de 02/09 sairia com a demanda de 24/08: 128.900 no lugar de
 * 93.200, "faltam 28% de ritmo, precisa de 4,2 maquinas" em vez de
 * "praticamente atende". Decisao de comprar maquina nascida de uma linha
 * que nao foi colada, e sem nenhum aviso na tela.
 *
 * O preco da janela fixa e' o oposto, e e' o preco certo: um dia util no
 * meio de um feriado longo (20/04, 06/05 em 2026) fica DESCOBERTO, e o
 * quadro diz "sem programa para o periodo desta medicao" — visivel, e com
 * o seletor de semana ali do lado para resolver na mao. Errar calado e'
 * pior que faltar em voz alta.
 */
const DIAS_DA_SEMANA_DO_PROGRAMA = 7;
const UM_DIA = 86400000;

/** "2026-09-08" -> Date do dia, as 00h UTC. Null quando nao e' data. */
export const emUtc = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * O DIA CIVIL DA FABRICA de uma medicao, as 00h UTC.
 *
 * A medicao guarda instante; a semana do programa e' um intervalo de DIAS.
 * Comparar os dois direto joga a medicao de segunda as 21h (00h UTC de
 * terca) para o dia seguinte — e na virada de semana isso troca de
 * programa. O dia vem do relogio de Sao Paulo, como no resto do app.
 */
export function diaCivil(data) {
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) return null;
  const [a, m, d] = civilDaFabrica(quando);
  return new Date(Date.UTC(a, m - 1, d));
}

/**
 * As linhas do programa com O PERIODO que cada uma cobre.
 *
 * Ordenadas pela DATA, nao pelo rotulo: a premissa desta tela e' que o
 * rotulo da planilha nao e' confiavel (corre a frente do calendario, pula
 * numero, e a ultima planilha do ano pode chamar-se "S01"). Ordenar pelo
 * numero poria essa semana no comeco do ano.
 *
 * Linha sem data fica de fora: ela nao participa do casamento por data, e
 * o quadro cai no casamento por numero da semana (programa antigo, colado
 * antes da coluna INICIO existir).
 */
export function periodosDoPrograma(semanas) {
  return (semanas || [])
    .filter((s) => s?.inicio && emUtc(s.inicio))
    .sort((a, b) => (a.inicio < b.inicio ? -1 : (a.inicio > b.inicio ? 1 : 0)))
    .map((s) => {
      const inicio = emUtc(s.inicio);
      const fim = new Date(inicio.getTime() + ((DIAS_DA_SEMANA_DO_PROGRAMA - 1) * UM_DIA));
      return { semana: s, inicio, fim };
    });
}

/**
 * A linha do programa que COBRE uma data.
 *
 * E' o casamento que substitui o numero da semana. Numero erra sempre que
 * a fabrica pula uma semana ou desloca por feriado — e o rotulo S da
 * fabrica ainda corre uma semana a frente do ISO. Data com data nao tem
 * ambiguidade.
 */
export function semanaQueContem(semanas, data) {
  const dia = diaCivil(data);
  if (!dia) return null;
  const alvo = dia.getTime();
  // De tras para frente: com periodos sobrepostos por engano na planilha,
  // vale a semana mais recente que cobre a data, nao a primeira achada.
  const periodos = periodosDoPrograma(semanas).reverse();
  const achado = periodos.find((p) => alvo >= p.inicio.getTime() && alvo <= p.fim.getTime());
  return achado ? achado.semana : null;
}

/** O periodo coberto por UMA linha, dentro do programa a que ela pertence. */
export function periodoDaSemana(semanas, semana) {
  if (!semana?.inicio) return null;
  const achado = periodosDoPrograma(semanas)
    .find((p) => p.semana.ano === semana.ano && p.semana.numero === semana.numero);
  return achado ? { inicio: achado.inicio, fim: achado.fim } : null;
}

/** Segunda e domingo de uma semana ISO — para a tela mostrar o periodo. */
export function intervaloIso({ ano, numero } = {}) {
  if (!(ano >= 2000 && numero >= 1 && numero <= 53)) return null;
  const jan4 = new Date(Date.UTC(ano, 0, 4));
  const dia = jan4.getUTCDay() || 7;
  const inicio = new Date(jan4);
  inicio.setUTCDate(jan4.getUTCDate() - dia + 1 + ((numero - 1) * 7));
  const fim = new Date(inicio);
  fim.setUTCDate(inicio.getUTCDate() + 6);
  return { inicio, fim };
}
