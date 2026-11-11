/**
 * LER O VIDEO PARA A MARCACAO AUTOMATICA (v2.105.0).
 *
 * Tudo no navegador, neste PC: nada do video sobe. Toca-se uma COPIA do
 * video (o mesmo arquivo num segundo <video>, mudo) acelerada, e a cada
 * quadro que o navegador mostra mede-se o papelao no retangulo
 * (fracaoPapelao). As contas que acham os volumes sao puras e ficam no
 * dominio (deteccaoVolumes.js); aqui so' se le' o video.
 *
 * - O tempo de cada amostra e' o TEMPO DO VIDEO do quadro (mediaTime do
 *   requestVideoFrameCallback), nao o relogio: PC lento so' da' menos
 *   amostras, nunca hora errada.
 * - PC que nao acompanha (quadros pulados, amostras espacadas demais): a
 *   velocidade cai pela metade, ate' 2x.
 * - Aba escondida: o navegador para de desenhar video — a leitura pausa e
 *   continua quando a aba volta.
 * - Video que para de andar por 15 s: falha com o porque, sem travar a tela.
 */
import { fracaoPapelao } from '../domain/deteccaoVolumes.js';

/** A velocidade de leitura: 30 min de video em uns 4 min. */
export const VELOCIDADE = 8;
const VELOCIDADE_MINIMA = 2;
/** Amostra mais espacada que isto (no tempo do video): o PC nao esta' acompanhando. */
const PASSO_MAXIMO_MS = 250;
/** Sem o video andar por isto (com a aba aberta): desiste e diz por que. */
const PARADO_MS = 15000;
/** O retangulo e' reduzido a isto para medir: para saber se ha' papelao, nao precisa de resolucao. */
const LARGURA = 64;
const ALTURA = 32;

const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? o[Math.floor(o.length / 2)] : 0;
};

/** Espera um evento do video, com prazo (o navegador as vezes nao dispara). */
function esperar(video, evento, prazoMs) {
  return new Promise((ok) => {
    const fim = () => { clearTimeout(t); video.removeEventListener(evento, fim); ok(); };
    const t = setTimeout(fim, prazoMs);
    video.addEventListener(evento, fim);
  });
}

/**
 * Le' o video do `inicioMs` ao fim, medindo o retangulo a cada quadro.
 *
 * @param video     um <video> NA TELA (o navegador so' entrega quadros de
 *                  video que esta' na pagina), com o arquivo ja' carregado
 * @param retangulo { x, y, largura, altura } em fracao da imagem
 * @param aoProgresso ({ ms, duracaoMs, velocidade, pausado }) a cada quadro
 *
 * Devolve { promessa, cancelar }. A promessa resolve com { amostras,
 * cancelado } e rejeita com um Error de mensagem em portugues.
 */
export function analisarVideo({
  video, retangulo, inicioMs = 0, aoProgresso = () => {},
}) {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const amostras = [];
  const passos = [];
  let velocidade = VELOCIDADE;
  let encerrado = false;
  // `tocando`: ja' passou da preparacao (metadados, ida ao ponto) e o video
  // foi mandado tocar. Antes disso, esconder a aba so' fica anotado.
  let tocando = false;
  let pausadoPorAba = false;
  let ultimoMs = -1;
  let ultimoAvanco = performance.now();
  let pedido = null;
  let vigia = null;
  let resolver;
  let rejeitar;
  const promessa = new Promise((ok, erro) => { resolver = ok; rejeitar = erro; });
  const temQuadros = typeof video.requestVideoFrameCallback === 'function';
  const duracaoMs = () => (Number.isFinite(video.duration) ? video.duration * 1000 : null);

  const medir = (ms) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || ms <= ultimoMs) return; // sem imagem ainda, ou o mesmo quadro de novo
    ctx.drawImage(
      video,
      retangulo.x * vw, retangulo.y * vh, retangulo.largura * vw, retangulo.altura * vh,
      0, 0, LARGURA, ALTURA,
    );
    amostras.push({ ms, fracao: fracaoPapelao(ctx.getImageData(0, 0, LARGURA, ALTURA).data) });
    if (ultimoMs >= 0) {
      passos.push(ms - ultimoMs);
      // A cada ~30 amostras: o PC acompanha esta velocidade? Se as amostras
      // estao espacadas demais, metade da velocidade.
      if (passos.length >= 30) {
        if (mediana(passos) > PASSO_MAXIMO_MS && velocidade > VELOCIDADE_MINIMA) {
          velocidade /= 2;
          video.playbackRate = velocidade;
        }
        passos.length = 0;
      }
    }
    ultimoMs = ms;
    ultimoAvanco = performance.now();
    aoProgresso({
      ms, duracaoMs: duracaoMs(), velocidade, pausado: false,
    });
  };

  const aoQuadro = (_agora, meta) => {
    if (encerrado) return;
    medir(Math.round(meta.mediaTime * 1000));
    pedido = video.requestVideoFrameCallback(aoQuadro);
  };
  const aoAnimar = () => {
    if (encerrado) return;
    if (!video.paused) medir(Math.round(video.currentTime * 1000));
    pedido = requestAnimationFrame(aoAnimar);
  };

  function limpar() {
    encerrado = true;
    clearInterval(vigia);
    if (pedido != null) {
      if (temQuadros) video.cancelVideoFrameCallback?.(pedido); else cancelAnimationFrame(pedido);
    }
    video.removeEventListener('ended', aoFim);
    video.removeEventListener('error', aoErro);
    document.removeEventListener('visibilitychange', aoAba);
    video.pause();
  }
  function aoFim() {
    if (encerrado) return;
    limpar();
    resolver({ amostras, cancelado: false });
  }
  function falhar(mensagem) {
    if (encerrado) return;
    limpar();
    rejeitar(new Error(mensagem));
  }
  function aoErro() { falhar('o navegador não conseguiu ler o vídeo até o fim'); }
  function avisarPausa() {
    aoProgresso({
      ms: Math.max(0, ultimoMs), duracaoMs: duracaoMs(), velocidade, pausado: true,
    });
  }
  function aoAba() {
    if (encerrado) return;
    if (document.hidden) {
      pausadoPorAba = true;
      if (tocando) video.pause();
      avisarPausa();
    } else if (pausadoPorAba) {
      pausadoPorAba = false;
      ultimoAvanco = performance.now();
      if (tocando) video.play().catch(() => recusouTocar('o navegador não deixou continuar a leitura do vídeo'));
    }
  }
  // Um pause() com o play() ainda pendente faz o navegador recusar esse
  // play() (AbortError) — e' o que acontece num alt-tab rapido. Com a aba
  // escondida, a recusa e' esperada: a volta da aba toca de novo.
  function recusouTocar(mensagem) {
    if (!pausadoPorAba) falhar(mensagem);
  }

  const cancelar = () => {
    if (encerrado) return;
    limpar();
    resolver({ amostras, cancelado: true });
  };

  (async () => {
    // A aba pode ser escondida ja' durante a preparacao (que leva ate' 20 s
    // num video pesado): o aviso de aba e' ligado antes de tudo.
    document.addEventListener('visibilitychange', aoAba);
    video.muted = true;
    if (video.readyState < 1) await esperar(video, 'loadedmetadata', 10000);
    if (encerrado) return;
    const alvo = Math.max(0, inicioMs / 1000);
    if (Math.abs(video.currentTime - alvo) > 0.001) {
      video.currentTime = alvo;
      await esperar(video, 'seeked', 10000);
    }
    if (encerrado) return;
    video.playbackRate = velocidade;
    video.addEventListener('ended', aoFim);
    video.addEventListener('error', aoErro);
    vigia = setInterval(() => {
      if (!pausadoPorAba && performance.now() - ultimoAvanco > PARADO_MS) {
        falhar('o vídeo parou de andar durante a leitura (o PC pode estar sobrecarregado) — tente de novo');
      }
    }, 1000);
    pedido = temQuadros ? video.requestVideoFrameCallback(aoQuadro) : requestAnimationFrame(aoAnimar);
    ultimoAvanco = performance.now();
    tocando = true;
    // Aba escondida AGORA (antes ou durante a preparacao): nao toca — o
    // visibilitychange de quando ela voltar faz o play. Tocar escondida dava
    // "parou de andar" em 15 s, culpando o PC.
    if (document.hidden) {
      pausadoPorAba = true;
      avisarPausa();
      return;
    }
    try {
      await video.play();
    } catch {
      recusouTocar('o navegador não deixou tocar o vídeo para ler — clique na página e tente de novo');
    }
  })();

  return { promessa, cancelar };
}
