/**
 * CAPACIDADE — o que a demanda exige contra o que o posto entrega.
 *
 * Takt e' tempo disponivel dividido pela demanda. Nenhuma funcao daqui
 * assume jornada, dias ou setup: faltando dado, devolvem null. Jornada e'
 * decisao de turno, e assumir uma produz veredito sobre um turno que
 * talvez nao exista — chute com cara de indicador.
 */

/**
 * O QUE A DEMANDA EXIGE do grupo, na semana.
 *
 * Takt e' tempo disponivel dividido pela demanda. Num grupo de maquinas em
 * PARALELO (tres furadeiras fazendo o mesmo servico) o tempo disponivel e'
 * a soma das maquinas: 3 furadeiras x 44 h = 132 horas-maquina. Por isso o
 * numero que interessa ao chao e' o ritmo POR MAQUINA — e' ele que se
 * compara com as pecas/hora que o relatorio mede em cada posto.
 *
 * Devolve null quando falta dado. Nao ha' padrao de 44 h aqui de proposito:
 * jornada e' decisao de turno, e assumir uma produz veredito sobre um turno
 * que talvez nao exista.
 *
 * @param pecas    demanda da semana (pecas)
 * @param horas    horas disponiveis por maquina na semana
 * @param maquinas maquinas ativas no grupo (minimo 1)
 */
export function ritmoExigido({ pecas, horas, maquinas = 1, setupHoras = 0 } = {}) {
  const p = Number(pecas) || 0;
  const h = Number(horas) || 0;
  const m = Math.max(0, Math.floor(Number(maquinas) || 0));
  const setup = Math.max(0, Number(setupHoras) || 0);
  // O que sobra da jornada depois do setup e' o que produz. Setup maior
  // que a jornada nao e' folga negativa: e' cadastro errado, e nao ha' ritmo.
  const produtivas = h - setup;
  if (p <= 0 || h <= 0 || m <= 0 || produtivas <= 0) return null;

  const horasDisponiveis = produtivas * m;      // horas-maquina PRODUTIVAS na semana
  const pecasPorHoraGrupo = p / horasDisponiveis * m; // o grupo inteiro, por hora de relogio
  const pecasPorHoraMaquina = p / horasDisponiveis;   // o que cada maquina precisa fazer
  return {
    horasDisponiveis,
    // A jornada cheia e o setup, separados, para a tela escrever a conta
    // ("264 h de jornada − 50 h de setup = 214 h produtivas") em vez de
    // um numero que ninguem consegue conferir.
    horasJornada: h * m,
    horasSetup: setup * m,
    pecasPorHoraGrupo,
    pecasPorHoraMaquina,
    // Takt POR MAQUINA, em ms: o tempo que cada maquina tem para cada peca.
    taktMs: 3600000 / pecasPorHoraMaquina,
  };
}

/**
 * HORAS DE SETUP por maquina por semana, do cadastro do grupo.
 *
 * O setup e' o que a medicao NAO pega: a troca de peca (gabarito, batente,
 * posicao das brocas) acontece ENTRE uma medicao e a seguinte, e o
 * cronometro so' roda durante a corrida. No relatorio de setembro/2026 as
 * furadeiras tinham 49 min parados em 4h22 de medicao — e menos de 1 min
 * marcado como troca/setup, num posto que troca de peca cinco vezes por
 * dia. O setup nao estava em lado nenhum da conta: nem no ritmo entregue
 * (ritmo de corrida), nem nas horas disponiveis (jornada cheia). O
 * veredito saia otimista exatamente pelo tamanho do setup semanal.
 *
 * Por isso ele entra como PLANEJADO, no cadastro do grupo — setups por
 * DIA x dias de producao na semana x minutos por setup, por maquina — e
 * nao como medicao: e' como carga-maquina trata preparacao, e nao
 * depende da amostra do dia pegar duas ou tres trocas. Por dia porque e'
 * assim que o chao conta ("cinco trocas por dia"); os dias fecham a
 * conta com a jornada, que esta' por semana. Nao presumo cinco dias pelo
 * mesmo motivo que nao presumo 44 h: e' decisao de turno.
 *
 * Devolve null quando falta qualquer um dos tres: sem eles nao ha' setup
 * planejado, e a tela avisa que o veredito esta' sem ele.
 */
export function horasDeSetup({ setupsDia, dias, minutos } = {}) {
  const vazio = (v) => v == null || v === '';
  // "Este grupo nao faz setup" e' zero em setups OU em minutos — e vale
  // sem os outros dois: quem nao troca de peca nao tem duracao de troca.
  if ((!vazio(setupsDia) && Number(setupsDia) === 0) || (!vazio(minutos) && Number(minutos) === 0)) return 0;
  if (vazio(setupsDia) || vazio(dias) || vazio(minutos)) return null;
  const n = Number(setupsDia);
  const d = Number(dias);
  const min = Number(minutos);
  if (![n, d, min].every(Number.isFinite) || n < 0 || d <= 0 || min < 0) return null;
  return (n * d * min) / 60;
}

/**
 * Quantas maquinas o ritmo medido exige para dar conta da demanda.
 *
 * E' a leitura que fecha a conta no chao: "cada furadeira faz 800 pc/h, o
 * programa pede 107.086 na semana, a jornada e' 44 h — entao sao 3,0
 * furadeiras". Usa o ritmo REAL medido (o de relogio, com as paradas
 * dentro), nao o potencial: maquina parada nao produz.
 *
 * @param pecas       demanda da semana
 * @param horas       horas disponiveis por maquina na semana
 * @param ritmoMedido pecas/hora que UMA maquina entrega
 * @param setupHoras  horas de setup por maquina na semana, que nao produzem
 */
export function maquinasNecessarias({ pecas, horas, ritmoMedido, setupHoras = 0 } = {}) {
  const p = Number(pecas) || 0;
  const h = (Number(horas) || 0) - Math.max(0, Number(setupHoras) || 0);
  const r = Number(ritmoMedido) || 0;
  if (p <= 0 || h <= 0 || r <= 0) return null;
  return p / (h * r);
}

/**
 * O VEREDITO da semana: o que a demanda exige contra o que o posto entrega.
 *
 * Duas reguas, de proposito:
 *
 *  - `ritmoRelogio` (pecas por HORA DE PRESENCA, paradas dentro) e' o que
 *    decide. E' ele que enche o caminhao. Comparar o takt com o ritmo de
 *    maquina rodando dá um veredito otimista pelo tamanho da parada: com
 *    85% de disponibilidade, 44 h de relogio valem 37 h de producao.
 *  - `ritmoRodando` entra so' como o "se nao parasse" — a distancia entre
 *    os dois e' exatamente o que ha' a ganhar tratando parada, e e' o
 *    numero que decide entre comprar maquina e organizar o setup.
 *
 * Devolve null quando falta qualquer peca da conta. Nao ha' aproximacao:
 * veredito sobre dado que nao existe e' chute com cara de indicador.
 */
export function vereditoDaSemana({
  pecas, horas, maquinas = 1, ritmoRelogio, ritmoRodando, setupHoras = null,
} = {}) {
  const setup = setupHoras == null ? 0 : Math.max(0, Number(setupHoras) || 0);
  const exigido = ritmoExigido({ pecas, horas, maquinas, setupHoras: setup });
  const real = Number(ritmoRelogio) || 0;
  if (!exigido || real <= 0) return null;

  const potencial = Number(ritmoRodando) || 0;
  const precisa = maquinasNecessarias({ pecas, horas, ritmoMedido: real, setupHoras: setup });
  return {
    ...exigido,
    ritmoRelogio: real,
    ritmoRodando: potencial > 0 ? potencial : null,
    atende: real >= exigido.pecasPorHoraMaquina,
    // Quanto sobra (+) ou falta (-) no ritmo de cada maquina, em %.
    folgaPct: ((real / exigido.pecasPorHoraMaquina) - 1) * 100,
    maquinasNecessarias: precisa,
    maquinasSeNaoParasse: potencial > 0
      ? maquinasNecessarias({ pecas, horas, ritmoMedido: potencial, setupHoras: setup })
      : null,
    // Quantas maquinas o grupo TEM. Fica no resultado para a tela nao
    // precisar recalcular a comparacao que ela vai escrever em palavras.
    maquinas: Math.max(1, Math.floor(Number(maquinas) || 1)),
  };
}
