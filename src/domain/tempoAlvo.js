/**
 * O TEMPO-ALVO DO PRODUTO (v2.106.0) — a regua do veredito da Embalagem
 * Takt Time.
 *
 * PPCP, 11/11/2026: o takt da semana (jornada ÷ volumes programados) e' um
 * numero so' para todo volume — o produto pesado saia sempre vermelho e o
 * leve sempre verde, pelo peso e nao pelo desempenho. O tempo-alvo e' o
 * tempo que CADA volume pode levar para a linha fazer a media sem hora
 * extra: segundos por UEP da media da linha (sem o setup) × UEP do volume.
 * Vem pronto do painel (.gs v5.62, getTemposAlvo), pelo servidor do app
 * (api/_lib/temposAlvo.js); aqui so' se acha o do produto e se diz, em
 * palavras, por que nao ha' alvo quando nao ha'.
 *
 * Decisoes do PPCP (11/11/2026):
 *  - a COR (vermelho/verde) segue o alvo; o takt da semana vira uma linha de
 *    CARGA, sem cor — duas reguas pintando a mesma medicao confundem;
 *  - produto sem UEP (ou fora da lista do painel): SEM alvo e SEM cor, com
 *    o motivo — nunca o takt no lugar, senao a tela teria duas reguas
 *    conforme o produto.
 *
 * A SEMANA PEDE (v2.107.0, PPCP 11/11/2026, com a MESA CABECEIRA SLEEP na
 * tela: takt 8,5 s, tempo-alvo 8,9 s — "quem vê a tela acha que está tudo
 * bem"). A linha da carga era o takt POR VOLUME do app (jornada ÷ volumes,
 * 16.4 s para todo produto): no produto leve a medicao no alvo parecia
 * folgada. Agora a linha e' a do PRODUTO: os segundos por UEP que a semana
 * pede (o painel manda junto, .gs v5.63, a mesma conta do TAKT DA SEMANA) ×
 * a UEP dele — a coluna PELO TAKT do painel. A cor continua do alvo: 0,4 s
 * (5%) entre os dois e' do tamanho do erro de uma medicao, e a cor trocaria
 * por acaso. Sem a semana no painel (.gs antes da v5.63, semana sem UEP
 * programada, medicao de mais de 6 semanas), a linha de antes.
 *
 * PELA ESTEIRA (v2.111.0, .gs v5.65, PPCP 12/11/2026, com o RACK MOVE 1.6 na
 * tela: alvo 32,3 s pela UEP, medido 25,2 s com as paradas e 18,2 s sem as
 * lacunas — "tempo alvo está equivocado" → "hoje temos tamanho da caixa,
 * velocidade da esteira" → "85 ok"). A UEP e' medida contra os 6,7 s LIMPOS da
 * MADERO e os 10,74 s por UEP sao a MEDIA do dia: o alvo saia 1,6 × o trabalho
 * limpo. Nas 69 medicoes da CRONOANALISE do painel, o sem as lacunas = 0,99 ×
 * a esteira. Agora (a conta mora no painel):
 *   esteira    = (medida da caixa + entre-pecas) mm ÷ velocidade m/min
 *   tempo-alvo = esteira ÷ a eficiencia da embalagem do ⚙ do painel (85%)
 * Os 85% sao da linha COM O PRODUTO RODANDO, nao a meta do dia: a carga da
 * semana continua pela UEP, e em % da media — sem segundos no produto. "A
 * semana pede X s" (a UEP × os s por UEP da semana) estava na escala da MEDIA
 * DO DIA; ao lado de um alvo com o produto rodando, ele pareceria folga. Painel
 * antes da v5.65 (ref.metodo 'uep'): tudo como antes.
 *
 * O alvo e' o de HOJE (o cadastro do painel agora): uma medicao antiga e'
 * lida com a UEP e a meta de hoje. O volume a volume, a folha e o resultado
 * salvo do tablet dizem isso quando a medicao nao e' de hoje, e dizem a
 * idade do alvo quando a leitura do painel ficou velha (avisoDoAlvo).
 *
 * NUMEROS COM PONTO, como o resto do app (o cronometro, o takt: "72.0 s"),
 * e a META sem separador de milhar ("÷ 2761"): na mesma frase, "10.74" e
 * "2.761" fariam o ponto valer duas coisas. O painel escreve com virgula;
 * aqui vale a convencao do app.
 */
import { nomeChave } from './crono/conferencia.js';
import { formatarSegundos } from './crono/formato.js';

const MAPAS = new WeakMap();

/** O mapa nome → produto da lista lida (o nome comparado sem caixa, acento e espaco repetido). */
function mapaDe(lido) {
  let m = MAPAS.get(lido);
  if (!m) {
    m = new Map((lido.produtos || []).map((p) => [nomeChave(p.rot), p]));
    MAPAS.set(lido, m);
  }
  return m;
}

/**
 * O alvo do produto. `lido` e' a resposta do servidor ({ estado, ref,
 * produtos, mensagem }) ou null (ainda nao chegou). Devolve sempre um
 * objeto com `alvoMs` (null sem alvo) e `estado`:
 *   ok · sem-produto · fora-da-lista · sem-uep · sem-esteira · carregando · sem-rede ·
 *   desligado · gs-antigo · erro
 */
export function alvoDoProduto(lido, peca, { semRede = false, data = null } = {}) {
  if (!lido) return { alvoMs: null, estado: semRede ? 'sem-rede' : 'carregando' };
  if (lido.estado !== 'ok') return { alvoMs: null, estado: lido.estado || 'erro', mensagem: lido.mensagem || null };
  const nome = String(peca ?? '').trim();
  if (!nome) return { alvoMs: null, estado: 'sem-produto' };
  const p = mapaDe(lido).get(nomeChave(nome));
  if (!p) return { alvoMs: null, estado: 'fora-da-lista' };
  const esteira = lido.ref?.metodo === 'esteira';
  if (!(p.alvoMs > 0)) return { alvoMs: null, estado: esteira ? 'sem-esteira' : 'sem-uep', rot: p.rot };
  return {
    alvoMs: p.alvoMs, estado: 'ok', rot: p.rot, uep: p.uep,
    metodo: esteira ? 'esteira' : 'uep',
    eficiencia: esteira ? lido.ref?.eficiencia ?? null : null,
    esteiraMs: esteira ? p.esteiraMs ?? null : null,
    medida: esteira ? p.medida ?? null : null, vel: esteira ? p.vel ?? null : null, entre: esteira ? p.entre ?? null : null,
    sUep: lido.ref?.sUep ?? null, metaUep: lido.ref?.metaUep ?? null, setupDia: lido.ref?.setupDia ?? null,
    minDia: lido.ref?.minDia ?? null, lidoEm: lido.lidoEm ?? null,
    semana: semanaDoProduto(semanaDaData(lido, data ?? new Date()), p.uep, { esteira }),
  };
}

/** dd/mm/aaaa → aaaammdd (0 se nao for data). */
const numBR = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? Number(m[3] + m[2] + m[1]) : 0;
};

/**
 * A SEMANA de uma data (a do dia em Sao Paulo), na lista que o painel mandou
 * (.gs v5.63: a semana de hoje e as 5 anteriores, segunda a domingo). null
 * sem a lista (painel antigo) ou fora dela.
 */
export function semanaDaData(lido, data = new Date()) {
  const lista = lido?.semanas;
  if (!Array.isArray(lista) || !lista.length) return null;
  const quando = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(quando.getTime())) return null;
  const [d, m, a] = diaSp(quando).split('/');
  const n = Number(a + m + d);
  return lista.find((w) => numBR(w.de) <= n && n <= numBR(w.ate)) || null;
}

/**
 * O QUE A SEMANA PEDE NESTE PRODUTO: os segundos por UEP da semana × a UEP
 * dele, com duas casas como o alvo (em ms). null sem o takt da semana (sem
 * UEP programada) ou sem a UEP do produto.
 *
 * PELA ESTEIRA (v2.111.0): so' a carga em % da media (`pede`), taktMs null —
 * os segundos por UEP da semana sao da media do dia, e o alvo e' com o produto
 * rodando: os dois nao se comparam (ver o cabecalho). null sem o %.
 */
export function semanaDoProduto(w, uep, { esteira = false } = {}) {
  if (esteira) {
    if (!w || !(w.pede > 0)) return null;
    return { de: w.de, ate: w.ate, sUep: w.sUep ?? null, pede: w.pede, cxSemUep: w.cxSemUep ?? null, taktMs: null, esteira: true };
  }
  if (!w || !(w.sUep > 0) || !(uep > 0)) return null;
  return {
    de: w.de, ate: w.ate, sUep: w.sUep, pede: w.pede ?? null, cxSemUep: w.cxSemUep ?? null,
    taktMs: Math.round(w.sUep * uep * 100) * 10,
  };
}

/**
 * O VEREDITO DA SEMANA no tempo-alvo, em palavras (revisao de 12/11): "não
 * fecha" quando a programacao pede mais que a media; "cabe" so' quando pede
 * ate' a media E todas as caixas tem UEP — caixa sem UEP fica fora da UEP
 * programada e a semana parece mais leve do que e'. Sem o % (pede null), nada.
 */
export function vereditoDaSemana(w, { esteira = Boolean(w?.esteira) } = {}) {
  if (!(w?.pede > 0)) return '';
  // pela esteira (v2.111.0): contra a MEDIA da linha — o alvo nao diz quanto o dia entrega
  if (w.pede > 100) return esteira ? 'acima do que a linha entrega em média' : 'no tempo-alvo, ela não fecha';
  const n = Number(w.cxSemUep) || 0;
  if (n > 0) return `sem contar ${n.toLocaleString('pt-BR')} ${n === 1 ? 'caixa' : 'caixas'} sem UEP, que ficam fora da conta`;
  return esteira ? 'dentro do que a linha entrega em média' : 'no tempo-alvo, ela cabe';
}

/**
 * A JUNCAO de medicoes: um alvo so' quando todas tem o MESMO (mesmo
 * produto, ou produtos de mesmo peso). Medicao sem alvo derruba a junção
 * com o motivo dela; alvos diferentes nao se juntam — a media de dois
 * alvos nao e' alvo de produto nenhum.
 */
export function alvoDaJuncao(alvos) {
  const lista = (alvos || []).filter(Boolean);
  if (!lista.length) return { alvoMs: null, estado: 'sem-produto' };
  const semAlvo = lista.find((a) => !(a.alvoMs > 0));
  if (semAlvo) return semAlvo;
  const primeiro = lista[0];
  return lista.every((a) => a.alvoMs === primeiro.alvoMs)
    ? primeiro
    : { alvoMs: null, estado: 'alvos-diferentes' };
}

/**
 * O SETUP MARCADO ENTRE OS TOQUES SAI DO PERIODO? (revisao de 11/11/2026)
 *
 * Com tempo-alvo, quem decide e' a regua DO ALVO: os segundos por UEP do
 * painel ja' vem sem o setup do ⚙ de la' (ref.setupDia > 0). O periodo tem de
 * sair sem o setup marcado tambem — senao a medicao com uma troca no meio
 * sai acima do alvo pela troca, e nao pelo passo. Antes a decisao era so'
 * a do takt (setupPlanejado): sem o programa da semana (nao carregou, grupo
 * sem programa, tablet sem nada guardado) ou com o grupo sem setup no app,
 * o setup ficava no periodo e o veredito contra o alvo saia vermelho.
 *
 * Sem alvo nao ha' veredito, e vale o criterio de antes (o do takt).
 *
 * PELA ESTEIRA (v2.111.0): sempre — o alvo e' com o produto rodando, e a
 * troca de produto marcada no meio nao e' o produto rodando (o setup do ⚙ do
 * painel ja' nao entra na conta do alvo).
 */
export function descontaSetup(alvo, takt) {
  if (alvo?.alvoMs > 0) return alvo.metodo === 'esteira' || Number(alvo.setupDia) > 0;
  return Boolean(takt?.setupPlanejado);
}

/** O numero com ponto e as casas pedidas, como o resto do app. */
const num = (v, casas) => Number(v).toFixed(casas);
/** A meta inteira, sem separador de milhar (ver o cabecalho). */
const inteiro = (v) => String(Math.round(Number(v)));

/** A eficiencia sem casa quando inteira: "85", "82.5". */
const pct = (v) => num(v, Number(v) % 1 ? 1 : 0);

/**
 * "2.48 UEP × 10.74 s" — de onde o alvo sai, em uma linha. Pela esteira, com
 * o resultado (PPCP, 12/11: "16,51 é o alvo ou 19,4?" — sem o "= 19.4 s" a
 * esteira parecia o alvo): "esteira 16.5 s ÷ 85% de eficiência = 19.4 s".
 */
export function contaDoAlvo(alvo) {
  if (!(alvo?.alvoMs > 0)) return '';
  if (alvo.metodo === 'esteira') {
    return alvo.esteiraMs > 0 && alvo.eficiencia > 0
      ? `esteira ${num(alvo.esteiraMs / 1000, 1)} s ÷ ${pct(alvo.eficiencia)}% de eficiência = ${num(alvo.alvoMs / 1000, 1)} s`
      : '';
  }
  if (!(alvo.uep > 0) || !(alvo.sUep > 0)) return '';
  return `${num(alvo.uep, 2)} UEP × ${num(alvo.sUep, 2)} s`;
}

/**
 * COMO SE CHEGA NO TEMPO-ALVO, por extenso (PPCP, 11/11/2026: "só preciso
 * deixar claro como chegamos no tempo-alvo de cada produto"). Duas frases,
 * na ordem em que se confere: o alvo do produto e, depois, de onde saem os
 * segundos por UEP. A MESMA frase no tablet, no PC e na folha:
 *
 *   "Tempo-alvo = 2.48 UEP × 10.74 s por UEP = 26.6 s por volume. Os 10.74 s
 *    por UEP: (527 min de jornada − 32.8 min de setup) × 60 ÷ 2761 UEP por
 *    dia, a média da linha sem hora extra."
 *
 * Sem alvo, ''. Sem a jornada (painel antes da v5.62 mandar o minDia), so'
 * a primeira frase.
 */
export function explicacaoDoAlvo(alvo) {
  if (alvo?.metodo === 'esteira') return explicacaoDaEsteira(alvo);
  if (!(alvo?.alvoMs > 0) || !(alvo.uep > 0) || !(alvo.sUep > 0)) return '';
  const uma = `Tempo-alvo = ${num(alvo.uep, 2)} UEP × ${num(alvo.sUep, 2)} s por UEP = ${num(alvo.alvoMs / 1000, 1)} s por volume.`;
  const regua = explicacaoDaRegua(alvo);
  return regua ? `${uma} ${regua}` : uma;
}

/** O que os X% sao — a mesma frase no tablet, no PC e na folha. */
const fraseDaEficiencia = (ef) => `Os ${pct(ef)}% são a eficiência da embalagem do painel: a linha com o produto `
  + 'rodando, paradas e lacunas dentro.';

/**
 * PELA ESTEIRA (v2.111.0), por extenso — a mesma frase no tablet, no PC e na
 * folha:
 *   "Tempo-alvo = (2076 + 400) mm ÷ 9 m/min = 16.5 s de esteira, ÷ 85% = 19.4 s
 *    por volume. Os 85% são a eficiência da embalagem do painel: a linha com o
 *    produto rodando, paradas e lacunas dentro."
 * Sem a caixa (o produto inteiro com volumes de caixas diferentes): a esteira
 * media por caixa, sem a medida. '' sem a esteira ou a eficiencia.
 */
function explicacaoDaEsteira(alvo) {
  if (!(alvo?.alvoMs > 0) || !(alvo.esteiraMs > 0) || !(alvo.eficiencia > 0)) return '';
  const est = num(alvo.esteiraMs / 1000, 1);
  const caixa = alvo.medida > 0 && alvo.vel > 0 && alvo.entre != null
    ? `(${inteiro(alvo.medida)} + ${inteiro(alvo.entre)}) mm ÷ ${num(alvo.vel, alvo.vel % 1 ? 1 : 0)} m/min = ${est} s de esteira`
    : `${est} s de esteira (a média por caixa dos volumes)`;
  return `Tempo-alvo = ${caixa}, ÷ ${pct(alvo.eficiencia)}% = ${num(alvo.alvoMs / 1000, 1)} s por volume. ${fraseDaEficiencia(alvo.eficiencia)}`;
}

/**
 * De onde saem os segundos por UEP — a regua de TODOS os alvos (`ref` do
 * painel: sUep, minDia, setupDia, metaUep). '' sem a jornada ou a meta.
 * Pela esteira (v2.111.0): a conta de todos os alvos, por extenso.
 */
export function explicacaoDaRegua(ref) {
  if (ref?.metodo === 'esteira') {
    return ref.eficiencia > 0
      ? `Tempo-alvo de cada produto = a esteira dele — (medida da caixa + entre-peças) ÷ velocidade, do cadastro do painel — ÷ ${pct(ref.eficiencia)}%. ${fraseDaEficiencia(ref.eficiencia)}`
      : '';
  }
  if (!(ref?.sUep > 0) || !(ref.minDia > 0) || !(ref.metaUep > 0)) return '';
  const setup = ref.setupDia > 0 ? ` − ${num(ref.setupDia, ref.setupDia % 1 ? 1 : 0)} min de setup` : '';
  return `Os ${num(ref.sUep, 2)} s por UEP: (${inteiro(ref.minDia)} min de jornada${setup}) × 60 ÷ `
    + `${inteiro(ref.metaUep)} UEP por dia, a média da linha sem hora extra.`;
}

/**
 * A LINHA DA CARGA, por produto (ver o cabecalho). Sem cor e sem julgar:
 *   "A semana pede 8.5 s neste produto: a programação da semana de 09/11
 *    pede 105.1% da média da linha — no tempo-alvo, ela não fecha."
 * `curta` (cronometro, subtitulo de cartao): "a semana pede 8.5 s (105.1% da
 * média)". '' sem a semana — quem chama escreve a linha de antes.
 */
export function fraseDaSemana(alvo, { curta = false } = {}) {
  const w = alvo?.semana;
  // pela esteira (v2.111.0): a carga em % da media, sem segundos no produto (ver o cabecalho)
  if (alvo?.metodo === 'esteira') {
    if (!(w?.pede > 0)) return '';
    const p = `${num(w.pede, 1)}%`;
    if (curta) return `a semana pede ${p} da média`;
    return `A programação da semana de ${String(w.de).slice(0, 5)} pede ${p} da média da linha — `
      + `${vereditoDaSemana(w, { esteira: true })}. É a carga da semana: não julga o produto.`;
  }
  if (!(w?.taktMs > 0)) return '';
  const s = num(w.taktMs / 1000, 1);
  const pct = w.pede > 0 ? `${num(w.pede, 1)}%` : null;
  if (curta) return `a semana pede ${s} s${pct ? ` (${pct} da média)` : ''}`;
  if (!pct) return `A semana pede ${s} s neste produto (a programação da semana de ${String(w.de).slice(0, 5)}).`;
  return `A semana pede ${s} s neste produto: a programação da semana de ${String(w.de).slice(0, 5)} pede ${pct} `
    + `da média da linha — ${vereditoDaSemana(w)}.`;
}

/** A partir de quantas horas a leitura do painel e' "velha" e a tela diz a idade. */
export const ALVO_VELHO_MS = 2 * 3600000;
const FUSO = 'America/Sao_Paulo';
const diaSp = (d) => d.toLocaleDateString('pt-BR', { timeZone: FUSO });
const ddmm = (d) => d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });

/**
 * O QUE O ALVO NAO DIZ SOZINHO (revisao de 11/11/2026), em ate' duas frases:
 *  - a medicao nao e' de hoje: ela foi lida com o alvo de HOJE (a UEP e a
 *    media de agora) — se a UEP do produto mudou por cronoanalise, o
 *    veredito de antes mudou junto;
 *  - a leitura do painel tem mais de 2 h (painel calado, aparelho sem
 *    rede): o alvo pode estar velho.
 * '' quando nao ha' nada a dizer (ou sem alvo).
 */
export function avisoDoAlvo(alvo, { data = null, agora = new Date() } = {}) {
  if (!(alvo?.alvoMs > 0)) return '';
  const partes = [];
  const quando = data ? new Date(data) : null;
  if (quando && !Number.isNaN(quando.getTime()) && diaSp(quando) !== diaSp(agora)) {
    partes.push(alvo.metodo === 'esteira'
      ? `Medição de ${ddmm(quando)} lida com o tempo-alvo de hoje (a caixa, a velocidade e a eficiência de agora).`
      : `Medição de ${ddmm(quando)} lida com o tempo-alvo de hoje (a UEP e a média de agora).`);
  }
  const idade = idadeDoAlvo(alvo.lidoEm, agora);
  if (idade) partes.push(idade);
  return partes.join(' ');
}

/** A idade da leitura do painel, so' quando passou de 2 h; '' antes disso. */
export function idadeDoAlvo(lidoEm, agora = new Date()) {
  const lido = lidoEm ? new Date(lidoEm) : null;
  if (!lido || Number.isNaN(lido.getTime()) || agora - lido <= ALVO_VELHO_MS) return '';
  return `Tempo-alvo lido do painel em ${ddmm(lido)} às ${hhmm(lido)}: sem leitura nova desde então.`;
}

/**
 * MEDIDO × ALVO, PRODUTO A PRODUTO (v2.106.0, PPCP: "e os produtos que ja'
 * fizemos?"). Para cada produto da lista do painel, o alvo e — se ja' foi
 * medido no app — o "por volume no periodo" da ULTIMA medicao dele (o mesmo
 * numero do veredito quando a medicao e' aberta) e a diferenca em %.
 *
 * `periodoDe(c)` vem da tela, que sabe o programa e o setup planejado de
 * cada medicao (periodoPorPeca); medicao sem os toques nao entra. Os
 * medidos vem primeiro, do mais acima do alvo para o mais abaixo: e' quem
 * pede atencao. Medicao com produto fora da lista (texto livre) e' contada,
 * nao some calada.
 */
export function medidoXAlvo(lido, medicoes, periodoDe, agora = new Date()) {
  if (!lido || lido.estado !== 'ok') return null;
  const mapa = mapaDe(lido);
  const ultima = new Map();
  const quantas = new Map();
  let foraDaLista = 0;
  for (const c of medicoes || []) {
    const chave = nomeChave(c?.peca || '');
    if (!chave) continue;
    if (!mapa.has(chave)) { foraDaLista += 1; continue; }
    const periodoMs = periodoDe(c);
    if (!(periodoMs > 0)) continue;
    quantas.set(chave, (quantas.get(chave) || 0) + 1);
    const quando = c.iniciado_em || c.salvo_em || null;
    const atual = ultima.get(chave);
    if (!atual || new Date(quando) > new Date(atual.quando)) ultima.set(chave, { periodoMs, quando, id: c.id });
  }
  // v2.107.0: o que ESTA semana pede em cada produto (a coluna PELO TAKT do painel);
  // pela esteira (v2.111.0) so' o % da media, sem segundos no produto
  const semana = semanaDaData(lido, agora);
  const esteira = lido.ref?.metodo === 'esteira';
  const todos = (lido.produtos || []).map((p) => {
    const chave = nomeChave(p.rot);
    const m = ultima.get(chave) || null;
    return {
      rot: p.rot, uep: p.uep, alvoMs: p.alvoMs, esteiraMs: p.esteiraMs ?? null,
      semanaMs: esteira ? null : semanaDoProduto(semana, p.uep)?.taktMs ?? null,
      medicao: m ? { ...m, n: quantas.get(chave) } : null,
      difPct: m && p.alvoMs > 0 ? ((m.periodoMs / p.alvoMs) - 1) * 100 : null,
    };
  });
  const medidos = todos.filter((l) => l.medicao)
    .sort((a, b) => (b.difPct ?? -Infinity) - (a.difPct ?? -Infinity) || a.rot.localeCompare(b.rot));
  if (esteira) return { medidos, todos, foraDaLista, esteira, semana: semana && semana.pede > 0 ? { ...semana, esteira: true } : null };
  return { medidos, todos, foraDaLista, esteira, semana: semana && semana.sUep > 0 ? semana : null };
}

/** O alvo em segundos, como o takt: "26,6 s". */
export const alvoEmSegundos = (alvo) => (alvo?.alvoMs > 0 ? `${formatarSegundos(alvo.alvoMs)} s` : '—');

/**
 * Por que nao ha' tempo-alvo — em palavras, nunca so' um traco. Com o erro,
 * a mensagem que o servidor deu (URL errada, setup que nao cabe na jornada,
 * o painel respondeu 500), em vez da frase generica.
 */
export function semAlvo(estado, mensagem) {
  switch (estado) {
    case 'sem-produto': return 'escolha o produto da lista para ver o tempo-alvo dele.';
    case 'fora-da-lista': return 'o produto não é um da lista do painel (código · nome) — escolha da lista.';
    case 'sem-uep': return 'o produto não tem UEP no cadastro do painel, e sem UEP não há tempo-alvo.';
    case 'sem-esteira': return 'o produto não tem a medida da caixa ou a velocidade da esteira no cadastro do painel (PRODUTO_CODIGO), e sem elas não há tempo-alvo.';
    case 'sem-rede': return 'os tempos-alvo ainda não chegaram a este aparelho (sem rede).';
    case 'carregando': return 'os tempos-alvo ainda estão sendo buscados.';
    case 'desligado': return 'o app não está ligado ao painel (falta PAINEL_APPS_SCRIPT_URL no servidor).';
    case 'gs-antigo': return 'o painel ainda não tem o tempo-alvo (falta implantar o Apps Script v5.62).';
    case 'alvos-diferentes': return 'as medições são de produtos com tempos-alvo diferentes — não há um alvo só para a junção.';
    default: {
      const m = String(mensagem || '').trim();
      // A mensagem ja' e' frase inteira; so' a inicial desce, porque a tela
      // a poe depois de "Sem tempo-alvo para comparar: ".
      return m ? m.replace(/^\p{Lu}(?!\p{Lu})/u, (l) => l.toLowerCase())
        : 'não deu para buscar os tempos-alvo no painel agora.';
    }
  }
}

/** O mesmo motivo, curto, para o subtitulo de um cartao. */
export function semAlvoCurto(estado) {
  return {
    'sem-produto': 'escolha o produto da lista',
    'fora-da-lista': 'produto fora da lista do painel',
    'sem-uep': 'produto sem UEP no painel',
    'sem-esteira': 'produto sem medida da caixa no painel',
    'sem-rede': 'sem rede: ainda não chegou',
    carregando: 'buscando no painel',
    desligado: 'app não ligado ao painel',
    'gs-antigo': 'falta o Apps Script v5.62',
    'alvos-diferentes': 'produtos com alvos diferentes',
  }[estado] || 'não deu para buscar agora';
}
