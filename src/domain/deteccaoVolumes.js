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
/** Caixa que passa menos que isso no retangulo e' pessoa ou reflexo, nao volume. */
export const PERMANENCIA_MINIMA_MS = 2000;
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
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (r - b > 35 && r >= g && r > 90) papelao++;
  }
  return papelao / total;
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
  janelaMs = JANELA_MS, permanenciaMinimaMs = PERMANENCIA_MINIMA_MS,
} = {}) {
  const lista = (amostras || [])
    .filter((a) => a && Number.isFinite(a.ms) && Number.isFinite(a.fracao))
    .sort((a, b) => a.ms - b.ms);
  if (lista.length < 10) return { motivo: 'o vídeo é curto demais para ler' };
  const sinal = suavizar(lista, janelaMs);
  const limiares = limiaresDoSinal(sinal.map((s) => s.v));
  if (limiares.motivo) return { motivo: limiares.motivo, semContraste: Boolean(limiares.semContraste) };

  const volumes = [];
  const descartados = [];
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
        const volume = { entrouMs: Math.round(entrou), saiuMs: Math.round(saiu) };
        if (saiu - entrou < permanenciaMinimaMs) descartados.push(volume);
        else volumes.push(volume);
      } else {
        saidaDaQueJaEstava = Math.round(saiu);
      }
      entrou = null;
    }
  }
  // O video acabou com algo no retangulo. A ENTRADA foi filmada: conta como
  // volume. Se ficou menos que a permanencia minima, nao deu para ver se era
  // caixa (o fim cortou) — conta e vai apontado para conferir, em vez de
  // sumir como "pessoa ou reflexo" e deixar a medicao com um volume a menos.
  let cortadoNoFim = null;
  if (dentro && entrou != null) {
    const ultimo = sinal[sinal.length - 1].ms;
    const volume = { entrouMs: Math.round(entrou), saiuMs: null };
    volumes.push(volume);
    if (ultimo - entrou < permanenciaMinimaMs) cortadoNoFim = volume;
  }

  const permanencias = volumes.filter((v) => v.saiuMs != null).map((v) => v.saiuMs - v.entrouMs);
  const tipica = mediana(permanencias);
  const suspeitos = tipica == null || permanencias.length < 3 ? [] : volumes.filter(
    (v) => v.saiuMs != null && v.saiuMs - v.entrouMs > FATOR_SUSPEITO * tipica,
  );
  return {
    volumes, descartados, suspeitos, cortadoNoFim, comCaixaNoInicio, saidaDaQueJaEstava, limiares,
  };
}

/**
 * AS MARCAS PELA SAIDA DA CAIXA (v2.109.0) — o mesmo instante do Enter
 * manual: o FIM da caixa sai do rolete e entra no tapete (o padrao do PPCP,
 * 12/11/2026). Com o retangulo como uma faixa fina sobre essa passagem, a
 * caixa sai dele exatamente quando o fim dela passa.
 *
 * As pontas do video se invertem em relacao a' entrada:
 *  - a caixa que JA' ESTAVA na faixa no comeco conta: a saida foi filmada
 *    (`jaEstava`, para conferir — pode ser uma mao que estava ali);
 *  - a que entrou e o video acabou antes de ela sair NAO conta: a saida nao
 *    foi filmada (`semSaida`, o instante em que ela entrou).
 *
 * @param r o resultado de detectarVolumes
 * @returns { marcasMs, jaEstava, semSaida, suspeitos } — suspeitos na saida
 */
export function saidasDosVolumes(r) {
  const comSaida = (r?.volumes || []).filter((v) => v.saiuMs != null);
  const jaEstava = Number.isFinite(r?.saidaDaQueJaEstava) ? r.saidaDaQueJaEstava : null;
  const semSaida = (r?.volumes || []).find((v) => v.saiuMs == null)?.entrouMs ?? null;
  const marcasMs = [...(jaEstava != null ? [jaEstava] : []), ...comSaida.map((v) => v.saiuMs)];
  return {
    marcasMs,
    jaEstava,
    semSaida,
    suspeitos: (r?.suspeitos || []).filter((v) => v.saiuMs != null).map((v) => v.saiuMs),
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
