/**
 * O PROGRAMA LIDO PARA O RELATORIO: qual semana comparar, com o que, e o
 * que falta quando nao da' para comparar.
 *
 * Existe para a tela nao precisar decidir nada: ela recebe um estado e os
 * numeros prontos. Toda a politica de "com o que comparar" mora aqui —
 * inclusive a recusa de comparar medicao de marco com o programa de
 * setembro, que e' o erro que um "pega a ultima cadastrada" produziria.
 */
import { chaveSemana, ordenarSemanas } from './leitura.js';
import { horasDeSetup, vereditoDaSemana } from './capacidade.js';
import {
  diaCivil, intervaloIso, periodoDaSemana, periodosDoPrograma, semanaIso, semanaQueContem,
} from './calendario.js';
import { contaDasHoras } from './formato.js';

/**
 * Leitura do programa: media, variacao e extremos.
 *
 * Existe para a tela poder dizer, ao lado do que foi colado, o que aquele
 * conjunto significa — e principalmente QUANTO ele varia. E' a variacao que
 * justifica guardar semana a semana em vez de um numero so'.
 */
export function resumoDaDemanda(semanas) {
  const valores = (semanas || []).map((s) => s.pecas).filter((n) => n > 0);
  if (!valores.length) return null;
  const n = valores.length;
  const media = valores.reduce((a, b) => a + b, 0) / n;
  // Desvio AMOSTRAL, como no resto do app: as semanas medidas sao uma
  // amostra do programa, nao o programa inteiro.
  const dp = n > 1
    ? Math.sqrt(valores.reduce((a, v) => a + ((v - media) ** 2), 0) / (n - 1))
    : 0;
  const ordenadas = ordenarSemanas(semanas.filter((s) => s.pecas > 0));
  const maior = ordenadas.reduce((a, s) => (s.pecas > a.pecas ? s : a), ordenadas[0]);
  const menor = ordenadas.reduce((a, s) => (s.pecas < a.pecas ? s : a), ordenadas[0]);
  return {
    n,
    media,
    dp,
    cvPct: media > 0 ? (dp / media) * 100 : 0,
    maior,
    menor,
    primeira: ordenadas[0],
    ultima: ordenadas[ordenadas.length - 1],
  };
}

/**
 * A LEITURA da demanda para o relatorio: qual semana comparar, com o que,
 * e o que falta quando nao da' para comparar.
 *
 * Existe para a tela nao precisar decidir nada: ela recebe um estado e os
 * numeros prontos. Os estados sao os seis caminhos honestos —
 *   sem-demanda  o grupo nao tem programa cadastrado;
 *   sem-semana   ha' programa, mas nao o da semana das medicoes;
 *   sem-horas    ha' programa e falta a jornada do grupo;
 *   setup-excede o setup cadastrado come a jornada inteira (cadastro errado);
 *   sem-ritmo    ha' tudo e nao ha' medicao aproveitavel no periodo;
 *   pronto       da' para comparar.
 *
 * A semana ESCOLHIDA manda; sem escolha, vale a linha do programa cujo
 * PERIODO contem a medicao mais recente. Nunca "a ultima cadastrada":
 * comparar medicao de marco com o programa de setembro daria um veredito
 * que ninguem consegue explicar.
 */
const numeroOuNulo = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

function classificarParadas({
  paradaMs, setupMs, setupPlanejado, ritmoRelogio, ritmoRodando, temObservado,
}) {
  if (temObservado) {
    const outrasMs = Math.max(0, paradaMs - (setupPlanejado ? setupMs : 0));
    if (outrasMs > 0) return 'outras';
    return setupPlanejado && setupMs > 0 ? 'so-setup' : 'nenhuma';
  }
  // Sem o detalhe das paradas (chamador antigo), vale a inferencia pela
  // diferenca entre rodando e relogio — e' o que havia antes.
  const rodando = Number(ritmoRodando) || 0;
  const relogio = Number(ritmoRelogio) || 0;
  return rodando > 0 && relogio > 0 && rodando > relogio + 0.5 ? 'outras' : 'nenhuma';
}

export function leituraDaDemanda({
  demandas = [], horas = null, maquinas = 0, ritmoRelogio = null, ritmoRodando = null,
  datas = [], semanaEscolhida = null,
  // Setup PLANEJADO do grupo: { setupsDia, dias, minutos } por maquina.
  setup = null,
  // O periodo OBSERVADO: { pecas, totalMs, paradaMs, setupMs } — o que as
  // medicoes somaram, para tirar do relogio o setup que elas por acaso
  // pegaram e para dizer se houve parada ALEM dele.
  observado = null,
} = {}) {
  const semanas = ordenarSemanas(
    (demandas || []).map((d) => ({ ...d, chave: chaveSemana(d) })),
  );
  if (!semanas.length) return { estado: 'sem-demanda', semanas: [] };

  const medidas = ordenarSemanas(
    (datas || []).map((d) => semanaIso(d)).filter(Boolean),
  );
  const daMedicao = medidas.length ? medidas[medidas.length - 1] : null;

  /**
   * POR DATA, quando a linha tem data — e e' a diferenca entre acertar e
   * errar sempre que houve feriado.
   *
   * O numero da semana nao casa: o rotulo S da planilha corre uma semana a
   * frente do ISO (a 034-26 e' "S37" e roda de 31/08 a 04/09, que e' a
   * semana ISO 36), e feriado desloca o inicio. Com a coluna INICIO na
   * planilha, a medicao cai na linha cujo PERIODO a contem, e nenhuma
   * dessas duas armadilhas alcanca o veredito.
   *
   * O casamento antigo, por numero ISO, continua valendo para as linhas
   * SEM data — e a decisao e' de cada linha, nao do programa inteiro. A
   * gravacao mescla: basta colar setembro com a coluna INICIO para o
   * programa ter linhas dos dois tipos, e regra de programa inteiro faria
   * as semanas antigas — visiveis na tela de Demanda — pararem de casar.
   */
  const temData = semanas.some((s) => s.inicio);
  const instantes = (datas || [])
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .filter((d) => !Number.isNaN(d.getTime()));
  const ultimaMedicao = instantes.length
    ? new Date(Math.max(...instantes.map((d) => d.getTime())))
    : null;

  const escolhido = semanaEscolhida
    ? semanas.find((s) => s.ano === semanaEscolhida.ano && s.numero === semanaEscolhida.numero)
    : null;
  const daData = ultimaMedicao ? semanaQueContem(semanas, ultimaMedicao) : null;
  // So' as linhas SEM data entram no casamento por numero: linha que tem
  // data ja' respondeu, e foi "nao".
  const doCalendario = daMedicao
    ? semanas.find((s) => !s.inicio && s.ano === daMedicao.ano && s.numero === daMedicao.numero)
    : null;
  /**
   * SEM MEDICAO NENHUMA em tela nao ha' data para casar, e ai' vale a
   * ultima semana cadastrada — e' so' o programa se mostrando, sem
   * veredito nenhum por cima (nao ha' ritmo medido para comparar).
   */
  const semMedicao = !instantes.length;
  // A ultima do programa e' a de DATA mais recente quando ha' data: o
  // rotulo nao serve nem para isso (a ultima planilha do ano pode
  // chamar-se "S01" e iria para o comeco da lista).
  const periodos = periodosDoPrograma(semanas);
  const ultimaDoPrograma = periodos.length
    ? periodos[periodos.length - 1].semana
    : semanas[semanas.length - 1];
  const registro = semanaEscolhida
    ? (escolhido || null)
    : (semMedicao ? ultimaDoPrograma : (daData || doCalendario || null));
  /**
   * A LINHA DA VEZ tem data? Nao e' propriedade do programa: no mesmo
   * programa uma semana pode ter data e outra nao.
   *
   * A pergunta e' "a linha tem data", e nao "foi a data que escolheu":
   * quando o usuario troca a semana no seletor, nada 'casou' — e cobrar
   * a coluna INICIO de uma semana que a tem, mostrando o periodo dela na
   * linha de cima, ensina a ignorar a ressalva que importa.
   */
  const casadoPorData = Boolean(registro?.inicio);

  // Quando nada casou, o alvo serve so' para a tela dizer DE QUE semana
  // sentiu falta: a da medicao, como o calendario a numera.
  const alvo = registro || semanaEscolhida || daMedicao || semanas[semanas.length - 1];

  /**
   * O CARIMBO DO PROGRAMA: de quando ele e' e ate' onde vai.
   *
   * A conta pode estar certa e o veredito errado do mesmo jeito, se o
   * programa for de tres meses atras. A tela nao tinha como dizer isso —
   * numero sem idade nao levanta suspeita em ninguem.
   */
  const gravacoes = semanas
    .map((s) => new Date(s.atualizado_em))
    .filter((d) => !Number.isNaN(d.getTime()));
  const programa = {
    n: semanas.length,
    primeira: semanas[0],
    ultima: semanas[semanas.length - 1],
    atualizadoEm: gravacoes.length
      ? new Date(Math.max(...gravacoes.map((d) => d.getTime())))
      : null,
    // Quantas linhas do programa ainda nao tem data. A tela precisa saber:
    // veredito casado por numero merece ressalva, na tela e no papel.
    temData,
    semData: semanas.filter((s) => !s.inicio).length,
  };

  /**
   * O SETUP entra UMA vez so'. Planejado, ele sai das horas disponiveis.
   * Se as medicoes tambem pegaram troca/setup como parada, esse tempo ja'
   * esta' dentro do ritmo de relogio — e ficaria contado duas vezes: uma
   * nas horas, outra no ritmo. Por isso, com setup planejado informado, o
   * relogio da comparacao e' recalculado SEM as paradas de setup medidas:
   * pecas sobre (tempo observado − setup medido). Sem setup planejado,
   * o relogio fica como veio, com tudo dentro.
   */
  const setupHoras = horasDeSetup(setup || {});
  const setupMedidoMs = Math.max(0, Number(observado?.setupMs) || 0);
  const totalMs = Number(observado?.totalMs) || 0;
  const pecasObservadas = Number(observado?.pecas) || 0;
  const relogioSemSetup = setupHoras != null && setupMedidoMs > 0
    && totalMs > setupMedidoMs && pecasObservadas > 0
    ? (pecasObservadas * 3600000) / (totalMs - setupMedidoMs)
    : null;
  const relogio = relogioSemSetup ?? ritmoRelogio;

  const periodo = registro ? periodoDaSemana(semanas, registro) : null;
  const base = {
    semanas,
    programa,
    semana: { ...alvo, chave: chaveSemana(alvo) },
    // O periodo da PLANILHA quando ele existe; o do calendario ISO quando
    // nao. A tela escreve "de 31/08 a 04/09" nos dois casos, e so' o
    // primeiro e' a semana de verdade da fabrica.
    periodo,
    intervalo: periodo || intervaloIso(alvo),
    // Quantas semanas DIFERENTES as medicoes cobrem: com mais de uma, o
    // ritmo medido e' de um periodo que atravessa semanas, e a tela precisa
    // dizer isso em vez de deixar entender que mediu so' aquela.
    //
    // Contadas na semana da FABRICA quando ha' programa com data: contar
    // semana ISO aqui punha a tela a se contradizer na mesma frase — "o
    // periodo e' de 31/08 a 06/09" seguido de "as medicoes cobrem 2
    // semanas", porque 31/08 e 06/09 caem em semanas ISO diferentes.
    semanasMedidas: temData
      ? new Set(instantes.map((d) => semanaQueContem(semanas, d)?.chave
        ?? `fora:${chaveSemana(semanaIso(d))}`)).size
      : new Set(medidas.map(chaveSemana)).size,
    // A medicao mais recente em tela: e' ela que escolheu a linha do
    // programa, e e' o que a tela mostra quando nenhuma linha a cobre.
    medicao: ultimaMedicao ? diaCivil(ultimaMedicao) : null,
    escolhaAutomatica: !semanaEscolhida && Boolean(daMedicao),
    casadoPorData,
    // O setup como a tela escreve a conta: "25 × 20 min = 8,3 h por
    // máquina". Nulo quando nao informado — e a tela diz que falta.
    setup: setupHoras == null ? null : {
      // Os campos como foram cadastrados — null continua null. "Zero
      // setup" vale com dias e minutos vazios, e a tela nao pode imprimir
      // "0 por dia × 0 dias × 0 min" para um cadastro que so' disse 0.
      setupsDia: numeroOuNulo(setup.setupsDia),
      dias: numeroOuNulo(setup.dias),
      minutos: numeroOuNulo(setup.minutos),
      horasPorMaquina: setupHoras,
      zerado: setupHoras === 0,
      // Quanto de troca/setup as medicoes pegaram e foi tirado do relogio
      // para nao contar duas vezes. Zero na pratica de hoje (< 1 min).
      medidoMs: relogioSemSetup != null ? setupMedidoMs : 0,
    },
    // A conta das horas como a tela escreve, com os numeros derivados um
    // do outro para a subtracao fechar. Null enquanto falta jornada.
    conta: contaDasHoras({ horas, setupHoras, maquinas }),
    /**
     * O QUE AS PARADAS MARCADAS DIZEM, decidido aqui e nao por diferenca
     * de taxa na tela: 'nenhuma' (nada marcado), 'so-setup' (a unica
     * parada foi troca/setup e ela ja' esta' no setup planejado) ou
     * 'outras' (houve parada alem do setup — ou o setup nao e' planejado
     * e entao conta como parada). Com o setup planejado tirando o setup
     * medido do relogio, relogio e rodando ficam iguais quando so' houve
     * setup — e "sem parada marcada" ai' contradiria a nota do setup.
     */
    paradas: classificarParadas({
      paradaMs: Number(observado?.paradaMs) || 0,
      setupMs: setupMedidoMs,
      setupPlanejado: setupHoras != null,
      ritmoRelogio: relogio,
      ritmoRodando,
      temObservado: observado != null && Number.isFinite(Number(observado?.paradaMs)),
    }),
  };

  if (!registro) return { ...base, estado: 'sem-semana', demanda: null, veredito: null };
  if (!(Number(horas) > 0) || !(Number(maquinas) > 0)) {
    return { ...base, estado: 'sem-horas', demanda: registro.pecas, veredito: null };
  }
  // Setup que come a jornada inteira e' cadastro errado (200 min no lugar
  // de 20), nao folga negativa. Estado PROPRIO: mandar "informar as horas"
  // aqui apontaria uma correcao que nao corrige — as horas estao la'.
  if (setupHoras != null && setupHoras >= Number(horas)) {
    return { ...base, estado: 'setup-excede', demanda: registro.pecas, veredito: null };
  }
  /**
   * SEM RITMO MEDIDO nao ha' veredito — e 'pronto' com veredito nulo era
   * um estado que a tela nao sabia desenhar. Acontece quando o periodo
   * em tela nao tem medicao aproveitavel (duracao zerada, por exemplo):
   * ha' programa, ha' jornada, e nao ha' com o que comparar.
   */
  /**
   * SEM MEDICAO NENHUMA nao ha' veredito, mesmo que chegue um ritmo: o
   * ritmo sem data nao se sabe de que semana e', e comparar a ultima
   * semana cadastrada com ele e' exatamente o "comparar medicao de marco
   * com o programa de setembro" que este arquivo inteiro recusa.
   */
  const veredito = semMedicao ? null : vereditoDaSemana({
    pecas: registro.pecas, horas, maquinas, ritmoRelogio: relogio, ritmoRodando, setupHoras,
  });
  if (!veredito) return { ...base, estado: 'sem-ritmo', demanda: registro.pecas, veredito: null };
  return {
    ...base, estado: 'pronto', demanda: registro.pecas, veredito,
  };
}
