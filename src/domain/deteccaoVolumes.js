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
/**
 * Retangulo menor que isso le' poucos pontos e erra: cada lado com pelo
 * menos LADO_MINIMO da imagem e a area com pelo menos AREA_MINIMA. Ate' a
 * v2.112 era 2% em cada lado; a linha fina sobre uma fita de 5 cm (v2.113.0)
 * fica com 8 a 18 px de distancia da outra numa camera de lado — 2% (11 px
 * em 540) nao deixava desenhar as duas. A area garante os pontos: uma faixa
 * de 6% da largura × 0,5% da altura = 155 px num video de 960×540.
 */
export const LADO_MINIMO = 0.004;
export const AREA_MINIMA = 0.0003;
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
    linhaB: linhaBDaLeitura(lista, s.marcasMs, { ocupacaoMs: ocupacaoTipica(r.volumes) }),
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
    && r.largura * r.altura >= AREA_MINIMA
    && r.x + r.largura <= 1.0001 && r.y + r.altura <= 1.0001);
}

/* ----------------------- a esteira pelas linhas A e B (v2.113.0)
 * VELOCIDADE E ENTRE-PECAS MEDIDOS NO VIDEO (PPCP, 18/11/2026: "ponta A e
 * B"). A linha A e' o retangulo de sempre (o que marca as caixas); a linha
 * B, uma segunda faixa no mesmo corredor, um pouco ADIANTE (no sentido em
 * que a caixa anda). O analista mede com trena, uma vez, a distancia real
 * entre as duas — de centro a centro de duas fitas na lateral fixa da
 * esteira (nunca na lona, que anda) — e desenha cada linha no centro de uma.
 *  - O ATRASO de A para B sai do SINAL INTEIRO das duas faixas (correlacao):
 *    o deslocamento em que o que a B ve' mais se parece com o que a A viu.
 *    Chapa a chapa nao serve: na Emb inicio as pecas postas em cima da chapa
 *    cobrem o papelao e a passagem de cada uma sai torta; o sinal inteiro
 *    nao se importa (medido no video de 18/11, 14:52–14:55).
 *  - VELOCIDADE = distancia ÷ atraso. Nao depende do cadastro.
 *  - CAIXA + VAO = velocidade × o intervalo entre as caixas (o do video,
 *    com as pausas de cada ciclo, se houver); ENTRE-PECAS = isso − a caixa.
 *    E' o vao que a linha PRATICA, nao um padrao — e a diferenca de dois
 *    numeros proximos (~975 − 825): por isso vai com a faixa dos intervalos.
 *
 * ⚠ O SINAL SE REPETE A CADA CAIXA (revisao da v2.113.0): o atraso so' se
 * le' entre −0,4 e +0,4 periodo. Um atraso real maior aparece como a copia
 * dele um periodo antes — NEGATIVA (a caixa "chegaria" a' B antes da A). Como
 * a B e' desenhada adiante da A, atraso negativo e' recusado: ou as linhas
 * estao invertidas, ou longe demais. O periodo sai da AUTOCORRELACAO do
 * sinal da A (nao das marcas: a A que perde caixas dobraria o intervalo e
 * a janela junto). A janela tem teto de 10 s (a tela nao trava em video
 * longo) e o atraso, piso de ATRASO_MINIMO_MS (abaixo, a grade de 40 ms ja'
 * e' erro grande).
 * Ate' a v2.112 tentou-se a velocidade pela propria caixa (comprimento ÷
 * tempo na faixa), sem linha B: na Emb inicio deu de 8,5 a 12,3 m/min
 * conforme a faixa — as pecas em cima da chapa. Nao foi ao ar.
 */

/** O passo da grade em que os dois sinais sao comparados. */
const PASSO_GRADE_MS = 40;
/** Abaixo disto, as duas linhas nao viram a mesma coisa passar: o atraso nao vale. */
export const CORRELACAO_MINIMA = 0.4;
/** O atraso so' vale ate' esta fracao do periodo: perto da metade, a copia da caixa seguinte compete. */
export const FRACAO_DO_PERIODO = 0.4;
/** A janela de busca nunca passa disto: video longo ou periodo absurdo nao trava a tela. */
export const JANELA_MAXIMA_MS = 10000;
/** Atraso menor que isto: A e B perto demais — 10 passos da grade, ~6 cm a 9 m/min. */
export const ATRASO_MINIMO_MS = 400;
/** O periodo das caixas e' procurado entre estes dois. */
const PERIODO_MINIMO_MS = 1500;
const PERIODO_MAXIMO_MS = 60000;

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

/** As amostras com as duas linhas, em ordem. */
function amostrasAB(amostras) {
  return (amostras || [])
    .filter((a) => a && Number.isFinite(a.ms) && Number.isFinite(a.fracao) && Number.isFinite(a.fracaoB))
    .sort((a, b) => a.ms - b.ms);
}

/**
 * O PERIODO DAS CAIXAS no sinal de uma linha: o menor deslocamento em que o
 * sinal se parece consigo mesmo quase tanto quanto no melhor (85%). O menor,
 * e nao o melhor: em 2 periodos o sinal tambem se repete. Null quando o
 * sinal nao se repete (nada passou, ou passou uma vez so').
 */
export function periodoDoSinal(sinal) {
  const maxLag = Math.min(Math.floor(PERIODO_MAXIMO_MS / PASSO_GRADE_MS), Math.floor(sinal.length / 2));
  const minLag = Math.ceil(PERIODO_MINIMO_MS / PASSO_GRADE_MS);
  if (maxLag <= minLag) return null;
  const c = [];
  let melhor = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    c[lag] = correlacao(sinal, sinal, lag);
    if (c[lag] > melhor) melhor = c[lag];
  }
  if (!(melhor > 0.3)) return null;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    // O primeiro pico (maior que os vizinhos) que chega a 85% do melhor.
    if (c[lag] >= 0.85 * melhor && c[lag] >= c[lag - 1] && c[lag] >= c[lag + 1]) return lag * PASSO_GRADE_MS;
  }
  return null;
}

/**
 * O ATRASO DE A PARA B: em quanto tempo o que passa na linha A chega a' B.
 *
 * @param amostras [{ ms, fracao, fracaoB }] — as duas linhas medidas no
 *   mesmo quadro (analisarVideo com retanguloB)
 * @returns { atrasoMs, correlacao, periodoMs, limiteMs, noLimite, fraca,
 *   invertido, pertoDemais } ou { motivo } — atrasoMs positivo: a caixa
 *   passa primeiro em A. So' vale com os quatro avisos falsos (linhaBValida).
 */
export function atrasoEntreFaixas(amostras, { marcasMs = null } = {}) {
  const lista = amostrasAB(amostras);
  if (lista.length < 20) return { motivo: 'poucas amostras das duas linhas' };
  const ini = lista[0].ms;
  const n = Math.floor((lista[lista.length - 1].ms - ini) / PASSO_GRADE_MS) + 1;
  const A = naGrade(lista, 'fracao', ini, n);
  const B = naGrade(lista, 'fracaoB', ini, n);
  const periodoMs = periodoDoSinal(A);
  const marcasTipico = intervaloTipico(marcasMs);
  // A janela sai do MENOR intervalo que se conhece (revisao da 2.113.0): o
  // sinal da' o dobro quando as caixas se alternam (uma com pecas em cima,
  // outra sem); as marcas, o dobro quando a A perde caixas; com chegadas
  // irregulares o sinal nao se repete e so' as marcas dizem.
  const base = [periodoMs, marcasTipico].filter((x) => x > 0);
  if (!base.length) return { motivo: 'poucas caixas na linha A no trecho lido para medir' };
  const limiteMs = Math.min(FRACAO_DO_PERIODO * Math.min(...base), JANELA_MAXIMA_MS);
  const maxLag = Math.max(1, Math.floor(limiteMs / PASSO_GRADE_MS));
  let melhor = -Infinity;
  let lagMelhor = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const c = correlacao(A, B, lag);
    if (c > melhor) { melhor = c; lagMelhor = lag; }
  }
  if (!(melhor > -1)) return { motivo: 'uma das linhas não mudou no trecho (nada passou nela)' };
  // O pico entre dois pontos da grade (parabola nos tres vizinhos).
  let ajuste = 0;
  if (Math.abs(lagMelhor) < maxLag) {
    const y0 = correlacao(A, B, lagMelhor - 1);
    const y2 = correlacao(A, B, lagMelhor + 1);
    const den = y0 - 2 * melhor + y2;
    if (den < 0) ajuste = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den));
  }
  const atrasoMs = Math.round((lagMelhor + ajuste) * PASSO_GRADE_MS);
  return {
    atrasoMs,
    correlacao: melhor,
    periodoMs,
    intervaloMarcasMs: marcasTipico,
    limiteMs: maxLag * PASSO_GRADE_MS,
    noLimite: Math.abs(lagMelhor) >= maxLag,
    fraca: melhor < CORRELACAO_MINIMA,
    // A B fica ADIANTE da A: chegar antes nela e' linha invertida ou a copia
    // da caixa anterior (A e B longe demais).
    invertido: atrasoMs < 0,
    pertoDemais: Math.abs(atrasoMs) < ATRASO_MINIMO_MS,
  };
}

/** O atraso vale: leu, separou, nao esta' no limite, nem invertido, nem perto demais. */
export function linhaBValida(l) {
  return Boolean(l && !l.motivo && !l.noLimite && !l.fraca && !l.invertido && !l.pertoDemais && l.atrasoMs > 0);
}

/** O intervalo tipico entre as caixas (a mediana dos intervalos entre as marcas). */
export function intervaloTipico(marcasMs) {
  const o = (marcasMs || []).filter(Number.isFinite).sort((a, b) => a - b);
  return mediana(o.slice(1).map((ms, i) => ms - o[i]));
}

/** A ocupacao tipica da linha A: a mediana do tempo de cada caixa na faixa (entrada ate' a saida). */
export function ocupacaoTipica(volumes) {
  return mediana((volumes || []).filter((v) => v?.saiuMs != null && v.saiuMs > v.entrouMs).map((v) => v.saiuMs - v.entrouMs));
}

/**
 * O INTERVALO ENTRE AS CAIXAS, conciliando o sinal e as marcas (revisao da
 * 2.113.0): cada um erra pelo dobro num caso. Concordam (15%): vale a
 * mediana das marcas. O sinal da' o dobro: as caixas se alternam (uma com
 * pecas em cima, outra sem; produto de dois volumes) — vale a mediana. As
 * marcas dao o dobro: a A perdeu caixas — vale o periodo. Nenhum dos dois:
 * nao ha' intervalo, e o porque. Um so': ele.
 */
export function intervaloDaLinha({ periodoMs = null, medianaMs = null } = {}) {
  const p = periodoMs > 0 ? periodoMs : null;
  const m = medianaMs > 0 ? medianaMs : null;
  if (p && m) {
    const r = p / m;
    if (Math.abs(r - 1) <= 0.15) return { intervaloMs: m, motivo: null };
    if (Math.abs(r - 2) <= 0.3) return { intervaloMs: m, motivo: null, alternadas: true };
    if (Math.abs(1 / r - 2) <= 0.3) return { intervaloMs: p, motivo: null, perdidas: true };
    const s = (x) => (Math.round(x / 100) / 10).toFixed(1);
    return {
      intervaloMs: null,
      motivo: `o intervalo entre as caixas não fecha — pelas marcas da A, ${s(m)} s; pelo sinal, ${s(p)} s`,
    };
  }
  if (m || p) return { intervaloMs: m || p, motivo: null };
  return { intervaloMs: null, motivo: 'sem caixas bastantes na linha A para o intervalo' };
}

/**
 * A LINHA B DE UMA LEITURA: o atraso, o intervalo entre as caixas
 * (intervaloDaLinha) e a ocupacao tipica da A (a conferencia da velocidade
 * pela propria caixa). Null sem a linha B nas amostras.
 */
export function linhaBDaLeitura(amostras, marcasMs, { ocupacaoMs = null } = {}) {
  if (!(amostras || []).some((a) => Number.isFinite(a?.fracaoB))) return null;
  const sinal = atrasoEntreFaixas(amostras, { marcasMs });
  const iv = intervaloDaLinha({ periodoMs: sinal.periodoMs, medianaMs: intervaloTipico(marcasMs) });
  // CAIXA A CAIXA (v2.114.0): quando as duas linhas pegam as caixas certinho
  // (a caixa fechada da seladora), o tempo de cada uma de A ate' B e' mais
  // preciso que o sinal inteiro. Vale so' com caixas bastantes e tempos que
  // concordam entre si; senao fica o sinal (a Emb inicio, chapa coberta).
  const limiteMs = sinal.limiteMs || (iv.intervaloMs > 0 ? FRACAO_DO_PERIODO * iv.intervaloMs : null);
  const caixa = limiteMs ? atrasoCaixaACaixa(amostras, { limiteMs }) : null;
  const base = {
    intervaloTipicoMs: iv.intervaloMs,
    intervaloMotivo: iv.motivo,
    ocupacaoMs: ocupacaoMs > 0 ? ocupacaoMs : null,
    atrasoSinalMs: Number.isFinite(sinal.atrasoMs) ? sinal.atrasoMs : null,
    caixaACaixa: caixa,
  };
  if (caixa?.valido) {
    return {
      ...sinal,
      ...base,
      metodo: 'caixa',
      atrasoMs: caixa.atrasoMs,
      // As travas valem para o atraso caixa a caixa: positivo (o par so' casa
      // B depois de A), dentro da janela (casa so' ate' o limite) e acima do
      // minimo. A correlacao fraca nao derruba caixas que concordam.
      motivo: undefined,
      fraca: false,
      invertido: false,
      noLimite: false,
      pertoDemais: caixa.atrasoMs < ATRASO_MINIMO_MS,
      concordam: Number.isFinite(sinal.atrasoMs) && sinal.atrasoMs > 0
        ? Math.abs(sinal.atrasoMs - caixa.atrasoMs) <= 0.1 * caixa.atrasoMs : null,
    };
  }
  return { ...sinal, ...base, metodo: 'sinal' };
}

/** Caixas casadas de menos, ou tempos que nao concordam: o caixa a caixa nao vale. */
export const MIN_PARES_CAIXA = 3;
/** Os tempos de A ate' B variam no maximo isto (do 1o ao 3o quartil, ÷ a mediana). */
export const DISPERSAO_MAXIMA_CAIXA = 0.15;

/**
 * O ATRASO CAIXA A CAIXA (v2.114.0): cada caixa da linha A casa com a
 * primeira da linha B que ENTRA depois dela, ate' `limiteMs` (a mesma
 * janela do sinal: alem dela a caixa se confunde com a seguinte). O tempo de
 * cada uma e' o da PONTA (a entrada nas duas linhas — "ponta A e B", PPCP
 * 18/11). O fim, nao: na seladora a linha B fica na borda do tapete da
 * envolvedora, e o fim da caixa passa por ela ja' no tapete, que anda em
 * outra velocidade (no video de 18/11 o tempo pelo fim ia de 1,4 a 2,4 s; pela
 * ponta, de 1,45 a 1,53). Vale com MIN_PARES_CAIXA pares e os tempos
 * concordando (DISPERSAO_MAXIMA_CAIXA); caixa que uma linha nao viu fica de
 * fora, sem casar com a errada.
 *
 * @returns { valido, atrasoMs (a mediana), pares, deMs, ateMs, dispersao,
 *   caixasA } ou null sem caixas nas duas linhas
 */
export function atrasoCaixaACaixa(amostras, { limiteMs } = {}) {
  const lista = amostrasAB(amostras);
  if (lista.length < 20 || !(limiteMs > 0)) return null;
  // Na grade fixa, e nao nos quadros que chegaram: na leitura a 8x o
  // navegador entrega um quadro a cada ~130 ms, e a media de 0,5 s sobre
  // poucos quadros vira escada — a ponta sai adiantada ou atrasada conforme o
  // quadro caiu, diferente em cada linha (no video de teste, a 6,0 m/min, o
  // caixa a caixa dava 5,5). Na grade, a ponta e' a mesma em qualquer ritmo de
  // quadros.
  const ini = lista[0].ms;
  const n = Math.floor((lista[lista.length - 1].ms - ini) / PASSO_GRADE_MS) + 1;
  const grade = (campo) => Array.from(naGrade(lista, campo, ini, n), (fracao, i) => ({ ms: ini + i * PASSO_GRADE_MS, fracao }));
  const A = detectarVolumes(grade('fracao'));
  const B = detectarVolumes(grade('fracaoB'));
  if (A.motivo || B.motivo || !A.volumes.length || !B.volumes.length) return null;
  const pontasA = A.volumes.map((v) => v.entrouMs);
  const pontasB = B.volumes.map((v) => v.entrouMs);
  const usadas = new Set();
  const tempos = [];
  for (const a of pontasA) {
    const j = pontasB.findIndex((b, k) => !usadas.has(k) && b > a && b - a <= limiteMs);
    if (j < 0) continue;
    usadas.add(j);
    tempos.push(pontasB[j] - a);
  }
  if (!tempos.length) return { valido: false, pares: 0, caixasA: A.volumes.length };
  const m = mediana(tempos);
  const de = percentil(tempos, 0.25);
  const ate = percentil(tempos, 0.75);
  const dispersao = m > 0 ? (ate - de) / m : Infinity;
  return {
    valido: tempos.length >= MIN_PARES_CAIXA && dispersao <= DISPERSAO_MAXIMA_CAIXA && m > 0,
    atrasoMs: Math.round(m),
    pares: tempos.length,
    deMs: Math.round(Math.min(...tempos)),
    ateMs: Math.round(Math.max(...tempos)),
    dispersao,
    caixasA: A.volumes.length,
  };
}

/**
 * VELOCIDADE E ENTRE-PECAS a partir do atraso de A para B.
 *
 * A CONFERENCIA (revisao da 2.113.0): um atraso maior que um intervalo
 * inteiro volta positivo e o sinal nao o distingue. A velocidade pela
 * propria caixa (comprimento ÷ ocupacao na A) erra uns 20% na Emb inicio
 * (pecas em cima da chapa) e mais quando duas chapas se juntam na faixa, mas
 * o atraso trocado da' 3,5 vezes ou mais: mais que o triplo (ou menos que um
 * terco) e' `suspeito`. Sem a ocupacao, a reserva: entre-pecas negativo ou
 * maior que 5 caixas.
 *
 * @returns null sem distancia ou com o atraso que nao vale; senao
 *   { velocidadeMMin, velocidadeCaixaMMin | null, passoMm | null,
 *   entrePecasMm | null, suspeito: null | 'velocidade' | 'entre' }
 */
export function esteiraPelasLinhas({
  atrasoMs, distanciaMm, intervaloTipicoMs, comprimentoMm, ocupacaoMs = null,
} = {}) {
  const d = Number(distanciaMm);
  const dt = Number(atrasoMs);
  if (!(d > 0) || !(dt >= ATRASO_MINIMO_MS)) return null;
  const v = d / dt; // mm por ms
  const L = Number(comprimentoMm);
  const passoMm = Number(intervaloTipicoMs) > 0 ? v * Number(intervaloTipicoMs) : null;
  const entrePecasMm = passoMm != null && L > 0 ? passoMm - L : null;
  const vCaixa = L > 0 && Number(ocupacaoMs) > 0 ? L / Number(ocupacaoMs) : null;
  let suspeito = null;
  if (vCaixa && (v / vCaixa > 3 || v / vCaixa < 1 / 3)) suspeito = 'velocidade';
  // Reserva, so' sem a ocupacao da A: entre-pecas negativo, ou maior que 5
  // caixas (caixa pequena com vao grande e' normal — na seladora, por exemplo).
  else if (!vCaixa && entrePecasMm != null && (entrePecasMm > 5 * L || entrePecasMm < -0.1 * L)) suspeito = 'entre';
  return {
    velocidadeMMin: v * 60,
    velocidadeCaixaMMin: vCaixa ? vCaixa * 60 : null,
    passoMm,
    entrePecasMm,
    suspeito,
  };
}

/* As linhas e a distancia de uma leitura (revisao da 2.113.0): o atraso so'
 * vale para as linhas que o mediram. */
const LADOS = ['x', 'y', 'largura', 'altura'];
/** So' a posicao de uma linha (sem a B nem a distancia que andam junto com a A). */
export const soLinha = (r) => (r ? Object.fromEntries(LADOS.map((k) => [k, r[k]])) : null);
/** As duas linhas sao a mesma (ou as duas faltam). */
export const mesmaLinha = (a, b) => (!a && !b) || Boolean(a && b && LADOS.every((k) => Math.abs(a[k] - b[k]) < 1e-9));
/** A linha B de uma leitura com as linhas e a distancia que a mediram. */
export function congelarLinhaB(l, lido) {
  if (!l) return null;
  return { ...l, linhas: { a: soLinha(lido), b: soLinha(lido?.b) }, distanciaMm: lido?.distanciaMm ?? null };
}
/**
 * A DISTANCIA QUE VALE para uma leitura: a de agora, se as linhas sao as
 * mesmas (corrigir um numero digitado errado nao pede ler de novo); senao, a
 * que foi congelada com ela — que pode faltar (a leitura foi feita sem
 * distancia e as linhas mudaram depois: so' lendo de novo).
 */
export function distanciaDaLeitura(linhaB, retangulo) {
  const mesmas = mesmaLinha(linhaB?.linhas?.a, soLinha(retangulo)) && mesmaLinha(linhaB?.linhas?.b, soLinha(retangulo?.b));
  return { mesmas, distanciaMm: mesmas ? (retangulo?.distanciaMm ?? null) : (linhaB?.distanciaMm ?? null) };
}
