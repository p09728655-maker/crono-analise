/**
 * MARCACAO AUTOMATICA DO VIDEO (v2.105.0) — encontra os volumes num video
 * da embalagem para o Cronometrar por video marcar sozinho. O analista
 * confere e corrige com as teclas de sempre: isto so' poupa o trabalho de
 * assistir e apertar Enter a cada volume.
 *
 * COMO: o analista desenha um retangulo — uma faixa fina — sobre a
 * passagem do rolete para o tapete verde da envolvedora. Em cada quadro,
 * mede-se quanto do retangulo tem COR DE PAPELAO. Esteira vazia: quase
 * nada. Caixa passando: o retangulo enche. Cada enche-esvazia e' um volume.
 * Desde a v2.109.0 a marca e' o instante em que a caixa SAI do retangulo —
 * o fim da caixa sai do rolete e entra no tapete, o padrao de marcacao do
 * PPCP no Enter e no tablet (saidasDosVolumes). Ate' a v2.108 era a entrada
 * (a frente da caixa), e o volume a volume nao batia com o do analista.
 *
 * A mesma conta do leitor de camera (ferramentas/leitor-camera), validada
 * quadro a quadro num video real da envolvedora — com uma diferenca: aqui
 * os limiares saem do PROPRIO video (cada camera, luz e retangulo da' um
 * nivel diferente), e o analista nao tem numero nenhum para ajustar.
 *
 * Tudo puro: recebe numeros, devolve numeros. Ler o video e' do navegador
 * (lib/analisarVideo.js).
 */

/** Diferenca minima entre "caixa" e "esteira vazia": abaixo disso o retangulo nao separa os dois. */
export const CONTRASTE_MINIMO = 0.15;
/** Media de meio segundo: o filme balancando em cima da caixa nao vira duas marcas. */
export const JANELA_MS = 500;
/**
 * PASSAGEM CURTA = PESSOA OU REFLEXO. Desde a v2.109.0 o limite sai do
 * PROPRIO video: metade do percentil 75 das passagens dele. O percentil 75,
 * e nao a mediana: com uma mao em todo ciclo as passagens curtas sao metade
 * da lista, a mediana caia no meio delas e as maos viravam volume (revisao
 * de 12/11: o ritmo quase dobrava, sem aviso).
 * Com a faixa fina sobre a passagem do rolete, a caixa leva so' o tempo de
 * atravessar — 2 a 3 s na envolvedora —, e o minimo fixo de 2 s de antes
 * descartava caixa de verdade (revisao da v2.109.0: 3 de 9 sumiam e o ritmo
 * caia 33% sem aviso). Mao e reflexo passam bem mais rapido que uma caixa.
 * Abaixo do PISO nada e' caixa (a media de 0,5 s ja' apaga quase tudo).
 */
export const PISO_PERMANENCIA_MS = 600;
export const FATOR_PERMANENCIA = 0.5;
/** Retangulo menor que isso (fracao da imagem, em cada lado) le' poucos pontos e erra. */
export const LADO_MINIMO = 0.02;
/** Volume que demora isto vezes o tipico no retangulo pode ser duas caixas encostadas. */
const FATOR_SUSPEITO = 1.6;

/**
 * Fracao dos pixels com COR DE PAPELAO (pardo: bem mais vermelho que azul,
 * nao escuro). `rgba` e' o ImageData.data do canvas: 4 bytes por pixel.
 */
export function fracaoPapelao(rgba) {
  const total = Math.floor((rgba?.length || 0) / 4);
  if (!total) return 0;
  let papelao = 0;
  for (let i = 0; i < total * 4; i += 4) {
    if (ehPapelao(rgba[i], rgba[i + 1], rgba[i + 2])) papelao++;
  }
  return papelao / total;
}

/**
 * Um pixel com COR DE PAPELAO — a regra de `fracaoPapelao`, sozinha, para a
 * tela pintar o que o leitor conta (v2.112.0): a mascara sobre o retangulo
 * tem de ser a MESMA conta da leitura, senao o teste mostraria outra coisa.
 */
export function ehPapelao(r, g, b) {
  return r - b > 35 && r >= g && r > 90;
}

/**
 * Media CENTRADA no tempo: cada amostra vira a media das que estao a ate'
 * meia janela dela. Centrada (e nao so' das anteriores) porque o video
 * inteiro ja' esta' lido — assim a media nao atrasa a marca.
 */
function suavizar(amostras, janelaMs) {
  const meia = janelaMs / 2;
  const saida = [];
  let ini = 0;
  let fim = 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) {
    const t = amostras[i].ms;
    while (fim < amostras.length && amostras[fim].ms <= t + meia) { soma += amostras[fim].fracao; fim++; }
    while (amostras[ini].ms < t - meia) { soma -= amostras[ini].fracao; ini++; }
    saida.push({ ms: t, v: soma / (fim - ini) });
  }
  return saida;
}

/**
 * Os LIMIARES do proprio video. O metodo de Otsu acha o corte que melhor
 * separa os valores em dois grupos (esteira vazia x caixa); a base e o topo
 * sao as medias de cada grupo. A caixa ENTRA quando passa de 60% do caminho
 * entre os dois e SAI abaixo de 40% — dois limiares, para o filme
 * balancando perto do corte nao gerar entra-sai-entra.
 *
 * Devolve { base, topo, entra, sai } ou { motivo } quando o retangulo nao
 * mostra diferenca entre caixa e esteira vazia.
 */
export function limiaresDoSinal(valores) {
  const lista = (valores || []).filter(Number.isFinite);
  if (lista.length < 10) return { motivo: 'o vídeo é curto demais para ler' };
  const FAIXAS = 100;
  const hist = new Array(FAIXAS).fill(0);
  for (const v of lista) hist[Math.min(FAIXAS - 1, Math.max(0, Math.floor(v * FAIXAS)))]++;
  const n = lista.length;
  const somaTotal = hist.reduce((s, c, i) => s + c * (i + 0.5), 0);
  let melhor = -1;
  let corte = -1;
  let pesoBaixo = 0;
  let somaBaixo = 0;
  for (let i = 0; i < FAIXAS - 1; i++) {
    pesoBaixo += hist[i];
    somaBaixo += hist[i] * (i + 0.5);
    const pesoAlto = n - pesoBaixo;
    if (!pesoBaixo || !pesoAlto) continue;
    const mBaixo = somaBaixo / pesoBaixo;
    const mAlto = (somaTotal - somaBaixo) / pesoAlto;
    const entre = pesoBaixo * pesoAlto * (mBaixo - mAlto) ** 2;
    if (entre > melhor) { melhor = entre; corte = (i + 1) / FAIXAS; }
  }
  const baixos = lista.filter((v) => v < corte);
  const altos = lista.filter((v) => v >= corte);
  const media = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  if (corte < 0 || !baixos.length || !altos.length || media(altos) - media(baixos) < CONTRASTE_MINIMO) {
    // Neutro de proposito: daqui nao da' para saber se o retangulo esta'
    // errado ou se nenhuma caixa passou no trecho lido. A tela, que sabe de
    // onde a leitura comecou, diz as duas causas.
    return { motivo: 'o retângulo não mostrou diferença entre caixa e esteira vazia no trecho lido', semContraste: true };
  }
  const base = media(baixos);
  const topo = media(altos);
  return {
    base, topo, entra: base + 0.6 * (topo - base), sai: base + 0.4 * (topo - base),
  };
}

/** O instante em que o sinal cruza o limiar entre duas amostras (reta entre elas). */
function cruzamento(a, b, limiar) {
  if (b.v === a.v) return b.ms;
  return a.ms + ((limiar - a.v) / (b.v - a.v)) * (b.ms - a.ms);
}

/** O percentil `q` (0 a 1), interpolado entre os vizinhos. */
function percentil(xs, q) {
  const o = [...xs].sort((a, b) => a - b);
  const pos = (o.length - 1) * q;
  const base = Math.floor(pos);
  return o[base] + (o[Math.min(base + 1, o.length - 1)] - o[base]) * (pos - base);
}

const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * OS VOLUMES do video.
 *
 * @param amostras [{ ms, fracao }] — tempo do video e fracao de papelao no
 *   retangulo, em qualquer ordem e com qualquer espacamento.
 *
 * Devolve { volumes: [{ entrouMs, saiuMs }], descartados, suspeitos,
 * comCaixaNoInicio, saidaDaQueJaEstava, limiares } ou { motivo }.
 *  - A caixa que JA' ESTAVA no retangulo no comeco do video nao entra em
 *    `volumes`: a entrada dela nao foi filmada (comCaixaNoInicio). A SAIDA
 *    foi, e vem em `saidaDaQueJaEstava` (v2.109.0, a marca pela saida).
 *  - Passagem curta demais (pessoa, reflexo) vai para `descartados`.
 *  - A que entrou e o video acabou com ela no retangulo vale, com saiuMs
 *    null — a entrada foi filmada. Se ficou menos que a permanencia minima,
 *    vale do mesmo jeito e vem em `cortadoNoFim`, para conferir.
 *  - `suspeitos`: os volumes que ficaram muito mais que o tipico no
 *    retangulo. Pode ser duas caixas encostadas lidas como uma — o analista
 *    confere esses pontos.
 */
export function detectarVolumes(amostras, {
  janelaMs = JANELA_MS, permanenciaMinimaMs = null,
} = {}) {
  const lista = (amostras || [])
    .filter((a) => a && Number.isFinite(a.ms) && Number.isFinite(a.fracao))
    .sort((a, b) => a.ms - b.ms);
  if (lista.length < 10) return { motivo: 'o vídeo é curto demais para ler' };
  const sinal = suavizar(lista, janelaMs);
  const limiares = limiaresDoSinal(sinal.map((s) => s.v));
  if (limiares.motivo) return { motivo: limiares.motivo, semContraste: Boolean(limiares.semContraste) };

  const passagens = [];
  const comCaixaNoInicio = sinal[0].v > limiares.entra;
  let dentro = comCaixaNoInicio;
  let entrou = null;
  let saidaDaQueJaEstava = null;
  for (let i = 1; i < sinal.length; i++) {
    const a = sinal[i - 1];
    const b = sinal[i];
    if (!dentro && b.v > limiares.entra) {
      dentro = true;
      entrou = cruzamento(a, b, limiares.entra);
    } else if (dentro && b.v < limiares.sai) {
      dentro = false;
      const saiu = cruzamento(a, b, limiares.sai);
      if (entrou != null) {
        passagens.push({ entrouMs: Math.round(entrou), saiuMs: Math.round(saiu) });
      } else {
        saidaDaQueJaEstava = Math.round(saiu);
      }
      entrou = null;
    }
  }
  // O limite da passagem curta: o dado (testes) ou o do proprio video.
  const longas = passagens.map((x) => x.saiuMs - x.entrouMs).filter((d) => d >= PISO_PERMANENCIA_MS);
  const limite = Number.isFinite(permanenciaMinimaMs) ? permanenciaMinimaMs
    : longas.length >= 3 ? Math.max(PISO_PERMANENCIA_MS, FATOR_PERMANENCIA * percentil(longas, 0.75)) : PISO_PERMANENCIA_MS;
  const volumes = passagens.filter((x) => x.saiuMs - x.entrouMs >= limite);
  const descartados = passagens.filter((x) => x.saiuMs - x.entrouMs < limite);

  // O video acabou com algo no retangulo. A ENTRADA foi filmada: conta como
  // volume. Se ficou menos que a permanencia minima, nao deu para ver se era
  // caixa (o fim cortou) — conta e vai apontado para conferir, em vez de
  // sumir como "pessoa ou reflexo" e deixar a medicao com um volume a menos.
  let cortadoNoFim = null;
  if (dentro && entrou != null) {
    const ultimo = sinal[sinal.length - 1].ms;
    const volume = { entrouMs: Math.round(entrou), saiuMs: null };
    volumes.push(volume);
    if (ultimo - entrou < limite) cortadoNoFim = volume;
  }

  const permanencias = volumes.filter((v) => v.saiuMs != null).map((v) => v.saiuMs - v.entrouMs);
  const tipica = mediana(permanencias);
  const suspeitos = tipica == null || permanencias.length < 3 ? [] : volumes.filter(
    (v) => v.saiuMs != null && v.saiuMs - v.entrouMs > FATOR_SUSPEITO * tipica,
  );
  return {
    volumes, descartados, suspeitos, cortadoNoFim, comCaixaNoInicio, saidaDaQueJaEstava, limiares,
    permanenciaMinimaMs: Math.round(limite),
  };
}

/**
 * AS MARCAS PELA SAIDA DA CAIXA (v2.109.0) — o mesmo instante do Enter
 * manual: o FIM da caixa sai do rolete e entra no tapete (o padrao do PPCP,
 * 12/11/2026). Com o retangulo como uma faixa fina sobre essa passagem, a
 * caixa sai dele exatamente quando o fim dela passa.
 *
 * So' conta a caixa que passou INTEIRA pela faixa durante a leitura:
 *  - a que JA' ESTAVA na faixa no comeco nao conta (`jaEstava`, o instante
 *    em que ela saiu). Podia ser uma mao, e como primeira marca ela viraria
 *    a largada, que a lista nao deixa apagar (revisao da v2.109.0). Nao
 *    conta-la nao muda o tempo por volume: a medicao so' comeca uma caixa
 *    depois;
 *  - a que entrou e o video acabou antes de ela sair nao conta (`semSaida`,
 *    o instante em que ela entrou): a saida nao foi filmada.
 *
 * @param r o resultado de detectarVolumes
 * @returns { marcasMs, jaEstava, semSaida, suspeitos, descartados } — os
 *   suspeitos e os descartados no instante da SAIDA, onde o Enter marcaria
 */
export function saidasDosVolumes(r) {
  const comSaida = (r?.volumes || []).filter((v) => v.saiuMs != null);
  const jaEstava = Number.isFinite(r?.saidaDaQueJaEstava) ? r.saidaDaQueJaEstava : null;
  const semSaida = (r?.volumes || []).find((v) => v.saiuMs == null)?.entrouMs ?? null;
  return {
    marcasMs: comSaida.map((v) => v.saiuMs),
    jaEstava,
    semSaida,
    suspeitos: (r?.suspeitos || []).filter((v) => v.saiuMs != null).map((v) => v.saiuMs),
    descartados: (r?.descartados || []).map((v) => v.saiuMs),
  };
}

/**
 * Os INTERVALOS LONGOS entre volumes seguidos: mais de `fator` vezes o
 * intervalo tipico (a mediana). Ali a linha provavelmente parou — a
 * marcacao automatica so' acha caixa, nao parada, entao o analista confere
 * esses pontos e marca a parada (P) se foi. Com menos de 4 intervalos nao
 * ha' tipico para comparar: nada e' apontado.
 */
export function intervalosLongos(entradasMs, fator = 3) {
  const ordenadas = (entradasMs || []).filter(Number.isFinite).sort((a, b) => a - b);
  const intervalos = ordenadas.slice(1).map((ms, i) => ({ deMs: ordenadas[i], ateMs: ms, duracaoMs: ms - ordenadas[i] }));
  if (intervalos.length < 4) return [];
  const tipico = mediana(intervalos.map((x) => x.duracaoMs));
  return intervalos.filter((x) => x.duracaoMs > fator * tipico);
}

/* ------------------------------------------- o teste antes da leitura
 * TESTAR O RETANGULO (v2.112.0). Antes, o analista so' sabia que o
 * retangulo nao pegava DEPOIS de ler o video inteiro — 14 min de video
 * eram de 2 a 7 min de espera para ouvir "sem diferenca entre caixa e
 * esteira vazia" (PPCP, 18/11/2026: "descobre so' depois que nao pegou").
 * O teste le' so' um trecho curto, com a MESMA conta da leitura inteira
 * (detectarVolumes + saidasDosVolumes). Mas os niveis (esteira vazia,
 * caixa) e o limite da passagem curta saem das amostras LIDAS: no teste,
 * do trecho; na leitura, do video todo. Com a mesma camera, luz e produto
 * o video todo, dao o mesmo; se o produto ou a luz mudam no meio do video,
 * a leitura inteira pode marcar diferente do teste naquele trecho (revisao
 * da v2.112.0 — o teste prova isso nos dois sentidos).
 */

/** O trecho do teste: 2 min de video, uns 15 s de leitura a 8x — tempo para umas 10 caixas. */
export const TESTE_MS = 120000;
/**
 * Sobrando menos que isto de video a partir de onde ele esta', nao ha' o que
 * testar: o teste recusa e pede para voltar o video. No fim do video, o
 * play() volta ao comeco — o "teste" lia o video INTEIRO (revisao da v2.112.0).
 */
export const TESTE_MINIMO_MS = 30000;
/** Pontos do grafico do teste: o bastante para ver cada caixa, sem pesar a tela. */
const PONTOS_GRAFICO = 240;

/**
 * O trecho do teste a partir de `inicioMs`: 2 min, ou ate' o fim do video.
 * `curto`: sobra menos de TESTE_MINIMO_MS de video — nao da' para testar dali.
 */
export function trechoDoTeste(inicioMs, duracaoMs) {
  const inicio = Math.max(0, Number(inicioMs) || 0);
  const fim = Number.isFinite(duracaoMs) && duracaoMs > 0 ? Math.min(inicio + TESTE_MS, duracaoMs) : inicio + TESTE_MS;
  return { inicioMs: inicio, fimMs: fim, curto: fim - inicio < TESTE_MINIMO_MS };
}

/** O sinal reduzido para o grafico: o MAIOR valor de cada faixa de tempo (a caixa e' um pico, nao some). */
function reduzir(sinal, pontos) {
  if (sinal.length <= pontos) return sinal.map((s) => ({ ms: s.ms, v: s.v }));
  const ini = sinal[0].ms;
  const passo = (sinal[sinal.length - 1].ms - ini) / pontos || 1;
  const faixas = [];
  for (const s of sinal) {
    const i = Math.min(pontos - 1, Math.floor((s.ms - ini) / passo));
    if (!faixas[i] || s.v > faixas[i].v) faixas[i] = { ms: s.ms, v: s.v };
  }
  return faixas.filter(Boolean);
}

/**
 * O VEREDITO DO TESTE — o que o retangulo fez no trecho e o que fazer:
 *  - 'ok': separou caixa de esteira vazia e achou 2 caixas ou mais;
 *  - 'uma': separou, mas so' 1 caixa passou inteira — pouco para dizer, e a
 *    leitura recusa com uma caixa so' (ela seria a largada);
 *  - 'nenhuma': separou, mas nenhuma caixa passou INTEIRA pela faixa;
 *  - 'nada': em nenhum momento o retangulo teve cor de papelao — nenhuma
 *    caixa passou, ou o retangulo esta' fora do caminho dela;
 *  - 'sempre': tem cor de papelao o tempo todo — algo pardo ou amarelo
 *    parado dentro dele (rolete, barra), ou uma caixa parada com a linha;
 *  - 'sem-contraste': varia, mas pouco — a caixa cobre so' parte dele, ou
 *    nenhuma caixa passou e o que mexeu foi mao ou reflexo.
 *  Os tres sem contraste sao neutros como o dominio (limiaresDoSinal): o
 *  sinal nao diz se o retangulo esta' errado ou se a linha nao andou.
 *  - 'curto': amostras de menos para ler.
 *
 * @param amostras [{ ms, fracao }] do trecho, como as da leitura inteira
 * @returns { veredito, caixas, marcasMs, descartados, suspeitos, base, topo,
 *   contraste, minimo, maximo, entra, grafico: [{ ms, v }], inicioMs, fimMs }
 *   (base/topo/contraste/entra so' quando o sinal separou)
 */
export function avaliarTeste(amostras, { inicioMs = 0, fimMs = null } = {}) {
  const lista = (amostras || [])
    .filter((a) => a && Number.isFinite(a.ms) && Number.isFinite(a.fracao))
    .sort((a, b) => a.ms - b.ms);
  const vazio = {
    caixas: 0, marcasMs: [], descartados: [], suspeitos: [], base: null, topo: null, contraste: null,
    entra: null, inicioMs, fimMs,
  };
  if (lista.length < 10) return { ...vazio, veredito: 'curto', minimo: null, maximo: null, grafico: [] };
  const sinal = suavizar(lista, JANELA_MS);
  let minimo = Infinity;
  let maximo = -Infinity;
  for (const s of sinal) { if (s.v < minimo) minimo = s.v; if (s.v > maximo) maximo = s.v; }
  const comum = { ...vazio, minimo, maximo, grafico: reduzir(sinal, PONTOS_GRAFICO) };
  const r = detectarVolumes(lista);
  if (r.motivo) {
    if (!r.semContraste) return { ...comum, veredito: 'curto' };
    const veredito = maximo < CONTRASTE_MINIMO ? 'nada' : minimo >= CONTRASTE_MINIMO ? 'sempre' : 'sem-contraste';
    return { ...comum, veredito };
  }
  const s = saidasDosVolumes(r);
  const contraste = r.limiares.topo - r.limiares.base;
  const veredito = s.marcasMs.length >= 2 ? 'ok' : s.marcasMs.length === 1 ? 'uma' : 'nenhuma';
  return {
    ...comum,
    veredito,
    // A linha B (v2.113.0): o atraso de A para B e o intervalo tipico — a
    // velocidade e o entre-pecas saem deles e da distancia (esteiraPelasLinhas).
    linhaB: linhaBDaLeitura(lista, s.marcasMs),
    caixas: s.marcasMs.length,
    marcasMs: s.marcasMs,
    descartados: s.descartados,
    suspeitos: s.suspeitos,
    base: r.limiares.base,
    topo: r.limiares.topo,
    contraste,
    entra: r.limiares.entra,
  };
}

/* ----------------------------------------------------- o retangulo na tela
 * O video aparece "contido" no elemento (object-fit: contain): sobra faixa
 * preta dos lados ou em cima e embaixo. O retangulo desenhado e' guardado
 * em FRACAO DA IMAGEM do video (0 a 1), nao em pixels da tela — assim vale
 * em qualquer tamanho de janela e e' o mesmo recorte que se le' do quadro.
 */

/** A area da imagem dentro do elemento: { x, y, largura, altura } em pixels do elemento. */
export function areaDaImagem({
  larguraElemento, alturaElemento, larguraVideo, alturaVideo,
}) {
  if (!(larguraElemento > 0 && alturaElemento > 0 && larguraVideo > 0 && alturaVideo > 0)) return null;
  const escala = Math.min(larguraElemento / larguraVideo, alturaElemento / alturaVideo);
  const largura = larguraVideo * escala;
  const altura = alturaVideo * escala;
  return {
    x: (larguraElemento - largura) / 2, y: (alturaElemento - altura) / 2, largura, altura,
  };
}

/** Um ponto do elemento em fracao da imagem, preso entre 0 e 1 (clicar na faixa preta vale a borda). */
export function pontoNaImagem(px, py, area) {
  const preso = (v) => Math.min(1, Math.max(0, v));
  return { x: preso((px - area.x) / area.largura), y: preso((py - area.y) / area.altura) };
}

/** O retangulo entre dois pontos (em fracao), em qualquer direcao de arrasto. */
export function retanguloEntre(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    largura: Math.abs(b.x - a.x), altura: Math.abs(b.y - a.y),
  };
}

/** Retangulo que da' para usar: dentro da imagem e com tamanho para ler. */
export function retanguloValido(r) {
  const n = (v) => typeof v === 'number' && Number.isFinite(v);
  return Boolean(r && n(r.x) && n(r.y) && n(r.largura) && n(r.altura)
    && r.x >= 0 && r.y >= 0 && r.largura >= LADO_MINIMO && r.altura >= LADO_MINIMO
    && r.x + r.largura <= 1.0001 && r.y + r.altura <= 1.0001);
}

/* ----------------------- a esteira pelas linhas A e B (v2.113.0)
 * VELOCIDADE E ENTRE-PECAS MEDIDOS NO VIDEO (PPCP, 18/11/2026: "ponta A e
 * B"). A linha A e' o retangulo de sempre (o que marca as caixas); a linha
 * B, uma segunda faixa no mesmo corredor, um pouco adiante. O analista mede
 * com trena, uma vez, a distancia real entre as duas (dois pontos fixos na
 * lateral da esteira — nunca na lona, que anda).
 *  - O ATRASO de A para B sai do SINAL INTEIRO das duas faixas (correlacao):
 *    e' o deslocamento em que o que a B ve' mais se parece com o que a A viu.
 *    Chapa a chapa nao serve: na Emb inicio as pecas postas em cima da chapa
 *    cobrem o papelao e a passagem de cada uma sai torta; o sinal inteiro
 *    nao se importa (medido no video de 18/11, 14:52–14:55).
 *  - VELOCIDADE = distancia ÷ atraso. Nao depende do cadastro.
 *  - CAIXA + VAO = velocidade × o intervalo tipico entre as caixas;
 *    ENTRE-PECAS = isso − o comprimento da caixa (do cadastro, ou o digitado).
 * O sinal se repete a cada caixa: um atraso de meio intervalo ou mais se
 * confunde com a caixa seguinte. Por isso A e B tem de ficar mais perto que
 * meia (caixa + vao); o atraso no limite da busca e' recusado.
 * Ate' a v2.112 tentou-se a velocidade pela propria caixa (comprimento ÷
 * tempo na faixa), sem linha B: na Emb inicio deu de 8,5 a 12,3 m/min
 * conforme a faixa — as pecas em cima da chapa. Nao foi ao ar.
 */

/** O passo da grade em que os dois sinais sao comparados. */
const PASSO_GRADE_MS = 40;
/** Abaixo disto, as duas linhas nao viram a mesma coisa passar: o atraso nao vale. */
export const CORRELACAO_MINIMA = 0.4;

/** O sinal na grade fixa (reta entre as amostras vizinhas). */
function naGrade(lista, campo, ini, n) {
  const saida = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = ini + i * PASSO_GRADE_MS;
    while (j < lista.length - 2 && lista[j + 1].ms < t) j++;
    const a = lista[j];
    const b = lista[Math.min(j + 1, lista.length - 1)];
    saida[i] = b.ms === a.ms || t <= a.ms ? a[campo] : a[campo] + ((t - a.ms) / (b.ms - a.ms)) * (b[campo] - a[campo]);
  }
  return saida;
}

/** Correlacao de A[i] com B[i + lag] (Pearson, so' onde os dois existem). */
function correlacao(A, B, lag) {
  let n = 0; let sa = 0; let sb = 0; let saa = 0; let sbb = 0; let sab = 0;
  const de = Math.max(0, -lag);
  const ate = Math.min(A.length, B.length - lag);
  for (let i = de; i < ate; i++) {
    const x = A[i];
    const y = B[i + lag];
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < 10) return -1;
  const va = saa / n - (sa / n) ** 2;
  const vb = sbb / n - (sb / n) ** 2;
  if (!(va > 1e-9) || !(vb > 1e-9)) return -1;
  return (sab / n - (sa / n) * (sb / n)) / Math.sqrt(va * vb);
}

/**
 * O ATRASO DE A PARA B: em quanto tempo o que passa na linha A chega a' B.
 *
 * @param amostras [{ ms, fracao, fracaoB }] — as duas linhas medidas no
 *   mesmo quadro (analisarVideo com retanguloB)
 * @param limiteMs o maior atraso procurado: meio intervalo tipico entre as
 *   caixas (mais que isso se confunde com a caixa seguinte)
 * @returns { atrasoMs, correlacao, limiteMs, noLimite, fraca } ou { motivo }
 *   — atrasoMs positivo: a caixa passa primeiro em A; negativo: em B.
 */
export function atrasoEntreFaixas(amostras, { limiteMs = 3000 } = {}) {
  const lista = (amostras || [])
    .filter((a) => a && Number.isFinite(a.ms) && Number.isFinite(a.fracao) && Number.isFinite(a.fracaoB))
    .sort((a, b) => a.ms - b.ms);
  if (lista.length < 20) return { motivo: 'poucas amostras das duas linhas' };
  const ini = lista[0].ms;
  const n = Math.floor((lista[lista.length - 1].ms - ini) / PASSO_GRADE_MS) + 1;
  const A = naGrade(lista, 'fracao', ini, n);
  const B = naGrade(lista, 'fracaoB', ini, n);
  const maxLag = Math.max(1, Math.floor(limiteMs / PASSO_GRADE_MS));
  let melhor = -Infinity;
  let lagMelhor = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const c = correlacao(A, B, lag);
    if (c > melhor) { melhor = c; lagMelhor = lag; }
  }
  if (!(melhor > -1)) return { motivo: 'uma das linhas nao mudou no trecho (nada passou nela)' };
  // O pico entre dois pontos da grade (parabola nos tres vizinhos).
  let ajuste = 0;
  if (Math.abs(lagMelhor) < maxLag) {
    const y0 = correlacao(A, B, lagMelhor - 1);
    const y2 = correlacao(A, B, lagMelhor + 1);
    const den = y0 - 2 * melhor + y2;
    if (den < 0) ajuste = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den));
  }
  return {
    atrasoMs: Math.round((lagMelhor + ajuste) * PASSO_GRADE_MS),
    correlacao: melhor,
    limiteMs: maxLag * PASSO_GRADE_MS,
    noLimite: Math.abs(lagMelhor) >= maxLag,
    fraca: melhor < CORRELACAO_MINIMA,
  };
}

/** O intervalo tipico entre as caixas (a mediana dos intervalos entre as marcas). */
export function intervaloTipico(marcasMs) {
  const o = (marcasMs || []).filter(Number.isFinite).sort((a, b) => a - b);
  return mediana(o.slice(1).map((ms, i) => ms - o[i]));
}

/**
 * A LINHA B DE UMA LEITURA: o atraso (com o limite de meio intervalo
 * tipico) e o intervalo tipico — o que a tela precisa para a velocidade e o
 * entre-pecas. Null sem a linha B nas amostras.
 */
export function linhaBDaLeitura(amostras, marcasMs) {
  if (!(amostras || []).some((a) => Number.isFinite(a?.fracaoB))) return null;
  const tipico = intervaloTipico(marcasMs);
  return {
    intervaloTipicoMs: tipico,
    ...atrasoEntreFaixas(amostras, { limiteMs: tipico > 0 ? tipico / 2 : 3000 }),
  };
}

/**
 * VELOCIDADE E ENTRE-PECAS a partir do atraso de A para B.
 *
 * @returns null sem distancia ou sem atraso; senao { velocidadeMMin,
 *   passoMm (caixa + vao) | null, entrePecasMm | null }
 */
export function esteiraPelasLinhas({
  atrasoMs, distanciaMm, intervaloTipicoMs, comprimentoMm,
} = {}) {
  const d = Number(distanciaMm);
  const dt = Math.abs(Number(atrasoMs));
  if (!(d > 0) || !(dt > 0)) return null;
  const v = d / dt; // mm por ms
  const passoMm = Number(intervaloTipicoMs) > 0 ? v * Number(intervaloTipicoMs) : null;
  const L = Number(comprimentoMm);
  return {
    velocidadeMMin: v * 60,
    passoMm,
    entrePecasMm: passoMm != null && L > 0 ? passoMm - L : null,
  };
}
