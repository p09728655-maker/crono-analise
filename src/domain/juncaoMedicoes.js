/**
 * A JUNCAO DE MEDICOES — varias medicoes volume a volume do MESMO produto,
 * na MESMA maquina e na MESMA semana, lidas como uma amostra so'.
 *
 * Nasceu de tres medicoes seguidas de uma penteadeira (07:11, 07:27 e
 * 07:52): 236, 181 e 159 volumes/hora na lista, tres numeros que nao
 * diziam nada juntos. Juntas, elas mostram o que interessa ao PCP: o passo
 * da linha era o mesmo nas tres (14,1 a 14,9 s rodando), e as paradas
 * roubaram 36 volumes em 42 minutos.
 *
 * AS REGRAS, todas pelo mesmo motivo — nao inventar tempo nem misturar
 * coisas diferentes:
 *
 *  - Tudo PONDERADO PELO TEMPO, nunca a media das taxas: a media de 236,
 *    181 e 159 da' 192, e faria a medicao de 7 min pesar o mesmo que a de
 *    20. A junta da' 197 (138 volumes / 42 min).
 *  - O INTERVALO NAO ATRAVESSA MEDICOES: o tempo entre o ultimo toque de
 *    uma e o primeiro da seguinte nao foi medido. Nao vira intervalo,
 *    lacuna nem parada; fica fora da conta.
 *  - O PERIODO POR VOLUME soma os relogios do 1o ao ultimo toque de cada
 *    medicao (cada um ja' sem o setup no trecho, quando ha' setup
 *    planejado — ver periodoPorPeca) e divide pela soma dos intervalos.
 *  - A LACUNA e' contra o normal DA JUNCAO: mesma linha, mesmo produto,
 *    mesma semana — e 135 intervalos dao um normal mais firme que 17.
 *    Por isso a contagem pode diferir da de cada medicao sozinha.
 *  - Os ROUBADOS somam os de cada medicao: cada parada custa no passo da
 *    medicao em que aconteceu (5 + 22 + 9 = 36).
 *  - Produto, maquina e semana iguais. Linhas diferentes tem ritmos
 *    diferentes; semanas diferentes, takts diferentes.
 */
import { nomeChave } from './crono/conferencia.js';
import { formatarSegundos } from './crono/formato.js';
import {
  CRITERIOS_INTERVALOS, intervalosEntreMarcas, leituraPecaAPeca, periodoPorPeca,
} from './crono/intervalos.js';
import { semanaIso } from './demanda/calendario.js';
import { frasesVolumeAVolume, roubadosPelasParadas } from './volumeAVolume.js';

/**
 * O PASSO de cada medicao e' a media dos intervalos dela SEM as lacunas da
 * junção (o "sem as lacunas"): com elas dentro, uma parada que ninguem
 * marcou faria a medicao parecer de outro passo — e e' parada, nao passo.
 *
 * O passo MUDOU so' quando a mais lenta passa da mais rapida em mais de 10%
 * E a diferenca passa do dobro do erro das duas medias (erro = desvio dos
 * intervalos / raiz da quantidade). Nas medicoes reais o desvio e' de 3 a
 * 4 s em 14 s: com 10 intervalos o erro da media ja' e' 6 a 9%, e 10% sozinho
 * seria ruido. So' entram na comparacao as medicoes com a leitura minima
 * (10 intervalos), a mesma de uma medicao sozinha.
 */
export const CRITERIOS_JUNCAO = { minMedicoes: 2, passoIgualPct: 10 };

const semanaDa = (c) => {
  const s = semanaIso(c.iniciado_em || c.salvo_em);
  return s ? `${s.ano}-${s.numero}` : null;
};

/**
 * Por que estas medicoes NAO se juntam — ou null, quando se juntam. O
 * motivo vai escrito na tela, ao lado do botao travado: "nao da'" sem o
 * porque faz o PCP achar que o botao quebrou.
 */
export function motivoParaNaoJuntar(conferencias) {
  const lista = conferencias || [];
  if (lista.length < CRITERIOS_JUNCAO.minMedicoes) return 'Marque duas medições ou mais para juntar.';
  const regra = 'Só se juntam medições do mesmo produto, na mesma máquina e na mesma semana';
  if (lista.some((c) => !nomeChave(c.peca))) return `${regra}: há medição sem produto informado.`;
  if (new Set(lista.map((c) => nomeChave(c.peca))).size > 1) return `${regra}: estas são de produtos diferentes.`;
  if (new Set(lista.map((c) => nomeChave(c.maquina))).size > 1) return `${regra}: estas são de máquinas diferentes.`;
  const semanas = lista.map(semanaDa);
  if (semanas.some((s) => !s) || new Set(semanas).size > 1) return `${regra}: estas são de semanas diferentes.`;
  return null;
}

/** As medicoes na ordem em que aconteceram. */
export const emOrdem = (conferencias) => [...conferencias]
  .sort((a, b) => new Date(a.iniciado_em || a.salvo_em) - new Date(b.iniciado_em || b.salvo_em));

/**
 * O ID DA JUNCAO — o que vai na entrada do historico do navegador, como o
 * id de uma medicao: o Voltar fecha a junção e o F5 a reabre. Sao os ids
 * das medicoes, na ordem em que aconteceram: a mesma junção marcada em
 * outra ordem e' a mesma junção.
 */
export const PREFIXO_JUNCAO = 'juncao:';
export const idDaJuncao = (conferencias) => `${PREFIXO_JUNCAO}${emOrdem(conferencias).map((c) => c.id).join(',')}`;
export const idsDaJuncao = (id) => (String(id ?? '').startsWith(PREFIXO_JUNCAO)
  ? String(id).slice(PREFIXO_JUNCAO.length).split(',').filter(Boolean)
  : null);

// Hora e dia no fuso de quem le, como faixaHoraria.
const hm = (v) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dm = (v) => new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** "07:11" — a hora em que a medicao comecou, o nome dela dentro da junção. */
export const horaDaMedicao = (c) => hm(c.iniciado_em || c.salvo_em);

/**
 * "07:11–07:58": do inicio da primeira ao fim da ultima. Em dias
 * diferentes (a mesma semana permite), com o dia: "27/10 15:02 a 28/10
 * 07:58" — so' a hora diria que uma terminou antes de comecar.
 */
export function faixaDaJuncao(conferencias) {
  const lista = emOrdem(conferencias);
  const ini = lista[0]?.iniciado_em || lista[0]?.salvo_em;
  const ultima = lista[lista.length - 1];
  const fim = ultima?.finalizado_em || ultima?.salvo_em;
  if (!ini || !fim) return null;
  return dm(ini) === dm(fim) ? `${hm(ini)}–${hm(fim)}` : `${dm(ini)} ${hm(ini)} a ${dm(fim)} ${hm(fim)}`;
}

/**
 * A NOTA gravada em cada medicao da junção: o PCP le uma delas sozinha,
 * depois, e precisa saber que ela foi analisada junto com as outras.
 */
export function notaDaJuncao(conferencias, nota) {
  const cabeca = `Junção de ${conferencias.length} medições (${faixaDaJuncao(conferencias)})`;
  const texto = String(nota ?? '').trim();
  return texto ? `${cabeca}: ${texto}` : `${cabeca}.`;
}

/**
 * A JUNCAO VISTA COMO UMA MEDICAO — o que o painel le de uma conferencia
 * (produto, maquina, quando, volumes, tempo, paradas, analise), com os
 * valores da junção: volumes e tempos somados, paradas juntas. Analisada
 * so' quando TODAS estao; a nota, so' quando e' a mesma em todas.
 */
export function medicaoDaJuncao(conferencias) {
  const lista = emOrdem(conferencias);
  const primeira = lista[0];
  const ultima = lista[lista.length - 1];
  const todas = lista.every((c) => c.analisada_em);
  const umaSo = (valores) => (new Set(valores).size === 1 ? valores[0] : null);
  return {
    id: idDaJuncao(lista),
    juncao: true,
    medicoes: lista,
    peca: primeira.peca,
    maquina: primeira.maquina,
    iniciado_em: primeira.iniciado_em,
    salvo_em: primeira.salvo_em,
    finalizado_em: ultima.finalizado_em,
    pecas: lista.reduce((s, c) => s + (Number(c.pecas) || 0), 0),
    duracao_ms: lista.reduce((s, c) => s + (Number(c.duracao_ms) || 0), 0),
    paradas: lista.flatMap((c) => c.paradas || []),
    observacao: null,
    analisada_em: todas ? lista.map((c) => c.analisada_em).sort().at(-1) : null,
    analisada_por: todas ? umaSo(lista.map((c) => c.analisada_por)) : null,
    analise_nota: todas ? umaSo(lista.map((c) => c.analise_nota || '')) || null : null,
  };
}

const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Erro da media: desvio-padrao amostral / raiz de n. */
const erroDaMedia = (xs) => {
  if (xs.length < 2) return null;
  const m = media(xs);
  const variancia = xs.reduce((s, x) => s + ((x - m) ** 2), 0) / (xs.length - 1);
  return Math.sqrt(variancia / xs.length);
};

/**
 * A LEITURA DA JUNCAO.
 *
 * @param itens   [{ conferencia, marcas, relogio, setup }] — a medicao e o
 *                que /conferencias?id= devolve dela; em qualquer ordem
 * @param taktMs  takt da semana (o mesmo para todas, que sao da mesma semana)
 * @param setupPlanejado  como em periodoPorPeca
 *
 * Devolve null sem intervalo nenhum. `leitura` e' a de leituraPecaAPeca
 * sobre os intervalos de todas, em sequencia, e serve a tudo que a tela de
 * uma medicao ja' le (numeros, grafico, frases). `segmentos` diz onde cada
 * medicao comeca nessa sequencia — o grafico separa, a tabela de lacunas
 * diz de qual medicao e' cada uma.
 */
export function juntarMedicoes(itens, { taktMs = null, setupPlanejado = false } = {}) {
  const ordenados = [...(itens || [])].sort((a, b) => new Date(a.conferencia.iniciado_em || a.conferencia.salvo_em)
    - new Date(b.conferencia.iniciado_em || b.conferencia.salvo_em));

  let inicio = 0;
  let relogioUtil = 0;
  let semRelogio = false;
  const todos = [];
  const medicoes = ordenados.map(({ conferencia: c, marcas, relogio, setup }) => {
    const intervalos = intervalosEntreMarcas(marcas);
    const periodoMs = periodoPorPeca({
      relogioEntreMarcasMs: relogio, volumes: (marcas || []).length, setupNoTrechoMs: setup, setupPlanejado,
    });
    // O relogio util desta medicao: periodo x intervalos devolve o relogio
    // ja' sem o setup no trecho, sem repetir a regra de periodoPorPeca.
    if (periodoMs) relogioUtil += periodoMs * intervalos.length;
    else semRelogio = true;
    const segmento = {
      conferencia: c,
      inicio,
      n: intervalos.length,
      periodoMs,
      rodandoMs: intervalos.length ? media(intervalos) : null,
      roubo: roubadosPelasParadas(c),
    };
    inicio += intervalos.length;
    todos.push(...intervalos);
    return segmento;
  });
  if (!todos.length) return null;

  // Os intervalos de todas, um atras do outro, como se fossem marcas de uma
  // medicao so': o tempo ENTRE medicoes nunca entra (ver o cabecalho).
  const marcasJuntas = [0];
  for (const x of todos) marcasJuntas.push(marcasJuntas[marcasJuntas.length - 1] + x);
  // Sem o relogio de alguma, nao ha' periodo da junção: somar so' as que
  // tem deixaria a regua do veredito com um pedaço faltando.
  const periodoPorPecaMs = !semRelogio && todos.length ? relogioUtil / todos.length : null;
  const leitura = leituraPecaAPeca({ marcasMs: marcasJuntas, taktMs, periodoPorPecaMs });

  // O passo de cada medicao, sem as lacunas da junção (ver CRITERIOS_JUNCAO).
  const ehLacuna = new Set((leitura?.lacunas || []).map((l) => l.indice));
  for (const m of medicoes) {
    const semLacunas = todos.slice(m.inicio, m.inicio + m.n).filter((_, k) => !ehLacuna.has(m.inicio + k));
    m.normalMs = semLacunas.length ? media(semLacunas) : null;
    m.erroMs = erroDaMedia(semLacunas);
  }

  const segmentoDe = (indice) => medicoes.find((m) => indice >= m.inicio && indice < m.inicio + m.n);
  const lacunas = (leitura?.lacunas || []).map((l) => {
    const m = segmentoDe(l.indice);
    return { ...l, conferencia: m.conferencia, volume: l.indice - m.inicio + 2 };
  });

  const comRoubo = medicoes.filter((m) => m.roubo);
  const roubados = comRoubo.reduce((s, m) => s + m.roubo.roubados, 0);
  const pecas = medicoes.reduce((s, m) => s + (Number(m.conferencia.pecas) || 0), 0);
  // A "medicao" da junção para as contas que leem uma conferencia
  // (volumes/hora, paradas): volumes e tempos somados, paradas juntas.
  const total = {
    pecas,
    duracao_ms: medicoes.reduce((s, m) => s + (Number(m.conferencia.duracao_ms) || 0), 0),
    paradas: medicoes.flatMap((m) => m.conferencia.paradas || []),
  };

  return {
    leitura,
    medicoes,
    lacunas,
    total,
    roubo: comRoubo.length
      ? { saiu: pecas, roubados, potencial: pecas + roubados }
      : null,
  };
}

/**
 * O passo das medicoes que tem leitura (ver CRITERIOS_JUNCAO): o menor, o
 * maior e se mudou. Null com menos de duas medicoes comparaveis — ai' a
 * junção nao diz nada do passo.
 */
export function passoDasMedicoes(medicoes) {
  const comLeitura = medicoes
    .filter((m) => m.n >= CRITERIOS_INTERVALOS.minIntervalos && m.normalMs > 0 && m.erroMs !== null);
  if (comLeitura.length < 2) return null;
  const ordem = [...comLeitura].sort((a, b) => a.normalMs - b.normalMs);
  const rapida = ordem[0];
  const lenta = ordem[ordem.length - 1];
  const diferenca = lenta.normalMs - rapida.normalMs;
  const pct = (diferenca / rapida.normalMs) * 100;
  const ruido = 2 * Math.sqrt((rapida.erroMs ** 2) + (lenta.erroMs ** 2));
  return {
    menor: rapida.normalMs,
    maior: lenta.normalMs,
    igual: !(pct > CRITERIOS_JUNCAO.passoIgualPct && diferenca > ruido),
    maisLenta: lenta,
    comparadas: comLeitura.length,
  };
}

/**
 * O QUE A JUNCAO DIZ, em palavras — as frases de uma medicao (veredito,
 * takt, lacunas) mais o que so' a junção sabe: quanto as paradas
 * roubaram e se o passo foi o mesmo nas medicoes.
 *
 * A manchete e' o veredito contra o takt quando ha' veredito (e' a pergunta
 * da tela); sem ele, o que as paradas roubaram — e' o que move a acao.
 *
 * `hora(c)` escreve o horario de uma medicao ("07:27"): vem da tela, que
 * sabe o fuso de quem le.
 */
export function frasesDaJuncao({
  juncao, takt = {}, unidade, nomeGrupo, hora,
}) {
  const { leitura, medicoes, roubo } = juncao;
  const base = frasesVolumeAVolume({
    leitura, takt, unidade, nomeGrupo, juncao: true,
  });
  const n = medicoes.length;
  const { plural } = unidade;
  const temVeredito = Boolean(leitura.suficiente && leitura.periodoMs && leitura.taktMs);

  const extras = [];
  let manchete = base.manchete;
  let linhasBase = base.linhas;

  if (roubo && roubo.roubados > 0) {
    const frase = `Nas ${n} medições, as paradas roubaram ${roubo.roubados} ${roubo.roubados === 1 ? unidade.singular : plural}: `
      + `saíram ${roubo.saiu}, e no passo da linha rodando teriam saído ${roubo.potencial}.`;
    if (temVeredito) {
      extras.push(frase);
    } else {
      manchete = frase;
      linhasBase = [base.manchete, ...base.linhas];
    }
  }

  // O passo so' com a leitura da junção completa: "poucos volumes" e "o
  // passo e' o mesmo" na mesma tela seria a tela se contradizendo.
  const passo = leitura.suficiente ? passoDasMedicoes(medicoes) : null;
  if (passo) {
    const quais = passo.comparadas === n ? `nas ${n}` : `nas ${passo.comparadas} com leitura (${CRITERIOS_INTERVALOS.minIntervalos} intervalos ou mais)`;
    const faixa = `de ${formatarSegundos(passo.menor)} a ${formatarSegundos(passo.maior)} s sem as lacunas`;
    if (passo.igual) {
      const comParada = medicoes.some((m) => (m.roubo?.paradaMs || 0) > 0);
      const maiorRoubo = [...medicoes].filter((m) => m.roubo?.roubados > 0)
        .sort((a, b) => b.roubo.roubados - a.roubo.roubados)[0];
      extras.push(
        `O passo é o mesmo ${quais} (${faixa})`
        + `${comParada ? ': o que muda de uma para outra são as paradas.' : '.'}`
        + `${maiorRoubo && n > 2 ? ` A das ${hora(maiorRoubo.conferencia)} sozinha perdeu ${maiorRoubo.roubo.roubados}.` : ''}`,
      );
    } else {
      extras.push(
        `O passo muda entre as medições (${faixa}); a das ${hora(passo.maisLenta.conferencia)} foi a mais lenta. `
        + `Veja se ela tem outra história — operador, lote, abastecimento — antes de ler as ${n} como uma só.`,
      );
    }
  }

  // Com veredito ACIMA do takt, a causa ("o que tira a linha do takt…")
  // fica colada a ele, antes dos roubados e do passo.
  if (temVeredito && base.tom === 'falha') {
    return { tom: base.tom, manchete, linhas: [linhasBase[0], ...extras, ...linhasBase.slice(1)] };
  }
  // Sem veredito, a frase do periodo vem logo depois do passo (que explica
  // a diferenca entre as medicoes).
  return { tom: base.tom, manchete, linhas: [...extras, ...linhasBase] };
}
