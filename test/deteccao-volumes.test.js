/**
 * MARCACAO AUTOMATICA DO VIDEO — as contas que acham os volumes no sinal
 * de papelao do retangulo.
 *
 * O que se prova: a marca sai na ENTRADA da caixa; os limiares saem do
 * proprio video; pessoa passando e filme balancando nao viram volume; a
 * caixa que ja' estava no filme nao vira marca (a entrada nao foi
 * filmada); retangulo sem contraste e' recusado com o porque; duas caixas
 * encostadas ficam apontadas para conferir; e, no SINAL REAL da envolvedora
 * (so' numeros, nenhuma imagem), as entradas batem com as conferidas
 * quadro a quadro. Tambem: o retangulo desenhado vira fracao da imagem com
 * faixa preta e tudo, e as entradas viram a marcacao do Enter.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  areaDaImagem, detectarVolumes, fracaoPapelao, intervalosLongos, limiaresDoSinal, pontoNaImagem, retanguloEntre,
  retanguloValido, saidasDosVolumes,
} from '../src/domain/deteccaoVolumes.js';
import {
  conferirAutomatica, marcacaoDasEntradas, marcacaoVazia, marcarToque, medicaoDoVideo, removerVolume,
} from '../src/domain/medicaoPorVideo.js';

const s = (seg) => seg * 1000;

/**
 * Sinal sintetico: amostras a cada ~130 ms (o que o navegador entrega a 8x),
 * com tremida no espacamento e no valor. `caixas` = [[entra, sai], ...] em s.
 */
function sinal({
  duracao = 60, caixas = [], base = 0.05, topo = 0.6, ruido = 0.03, extra = () => 0,
} = {}) {
  const amostras = [];
  let semente = 7;
  const aleatorio = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  for (let ms = 0; ms <= s(duracao); ms += 110 + Math.round(aleatorio() * 40)) {
    const t = ms / 1000;
    const dentro = caixas.some(([a, b]) => t >= a && t < b);
    const v = (dentro ? topo : base) + (aleatorio() - 0.5) * 2 * ruido + extra(t);
    amostras.push({ ms, fracao: Math.min(1, Math.max(0, v)) });
  }
  return amostras;
}
const entradas = (r) => r.volumes.map((v) => v.entrouMs / 1000);

describe('cor de papelao', () => {
  it('conta so' + "' o pardo: nem o verde do tapete, nem o escuro, nem o branco", () => {
    const px = (r, g, b) => [r, g, b, 255];
    const dados = Uint8ClampedArray.from([
      ...px(176, 138, 90), // papelao
      ...px(150, 120, 80), // papelao na sombra
      ...px(30, 61, 51), // tapete verde
      ...px(70, 50, 30), // escuro demais
      ...px(240, 240, 235), // branco (filme refletindo)
    ]);
    expect(fracaoPapelao(dados)).toBeCloseTo(2 / 5);
    expect(fracaoPapelao(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('limiares do proprio video', () => {
  it('separa esteira vazia de caixa e poe a entrada a 60% e a saida a 40% do caminho', () => {
    const valores = [...Array(70).fill(0.05), ...Array(30).fill(0.65)];
    const l = limiaresDoSinal(valores);
    expect(l.base).toBeCloseTo(0.05);
    expect(l.topo).toBeCloseTo(0.65);
    expect(l.entra).toBeCloseTo(0.41);
    expect(l.sai).toBeCloseTo(0.29);
  });

  it('retangulo que nao separa caixa de esteira e' + "' recusado, com o que fazer", () => {
    // Sem caixa no trecho ou retangulo fora do tapete: daqui nao da' para
    // saber qual — a tela diz as duas causas (semContraste).
    expect(limiaresDoSinal(Array(100).fill(0.04)).semContraste).toBe(true);
    expect(limiaresDoSinal([...Array(50).fill(0.05), ...Array(50).fill(0.12)]).motivo).toMatch(/não mostrou diferença/);
    expect(limiaresDoSinal([0.1, 0.2]).motivo).toMatch(/curto/);
  });
});

describe('os volumes no sinal', () => {
  it('uma marca por caixa, na ENTRADA, com amostras irregulares e ruido', () => {
    const r = detectarVolumes(sinal({ caixas: [[5, 12], [20, 27], [40, 47]] }));
    expect(r.motivo).toBeUndefined();
    expect(entradas(r)).toHaveLength(3);
    [5, 20, 40].forEach((t, i) => expect(Math.abs(entradas(r)[i] - t)).toBeLessThan(0.3));
    expect(r.descartados).toEqual([]);
    expect(r.comCaixaNoInicio).toBe(false);
  });

  it('a ordem das amostras nao importa e amostra estragada e' + "' ignorada", () => {
    const certas = sinal({ caixas: [[5, 12], [20, 27]] });
    const baguncadas = [...certas].reverse();
    baguncadas.push({ ms: NaN, fracao: 0.9 }, { ms: 3000, fracao: undefined }, null);
    expect(entradas(detectarVolumes(baguncadas))).toEqual(entradas(detectarVolumes(certas)));
  });

  it('pessoa passando (1 s de papelao) e' + "' descartada, nao vira volume", () => {
    const r = detectarVolumes(sinal({ caixas: [[5, 12], [20, 21], [40, 47]] }));
    expect(entradas(r)).toHaveLength(2);
    expect(r.descartados).toHaveLength(1);
    expect(Math.abs(r.descartados[0].entrouMs / 1000 - 20)).toBeLessThan(0.3);
  });

  it('filme balancando em cima da caixa nao vira entra-sai-entra', () => {
    // Durante a caixa o valor oscila 0,40–0,60 a cada 300 ms: abaixo da
    // entrada mas acima da saida — os dois limiares seguram uma marca so'.
    const extra = (t) => ((t >= 5 && t < 12) ? (Math.floor(t * 3.3) % 2 ? -0.1 : 0.1) : 0);
    const r = detectarVolumes(sinal({ caixas: [[5, 12], [30, 37]], extra, ruido: 0.01 }));
    expect(entradas(r)).toHaveLength(2);
  });

  it('a caixa que ja' + "' estava no filme no comeco nao vira marca: a entrada dela nao foi filmada", () => {
    const r = detectarVolumes(sinal({ caixas: [[0, 4], [20, 27], [40, 47]] }));
    expect(r.comCaixaNoInicio).toBe(true);
    expect(entradas(r)).toHaveLength(2);
    expect(Math.abs(entradas(r)[0] - 20)).toBeLessThan(0.3);
  });

  it('caixa que entrou e o video acabou: a entrada foi filmada, conta como volume', () => {
    const longa = detectarVolumes(sinal({ duracao: 60, caixas: [[10, 17], [30, 37], [56.5, 61]] }));
    expect(entradas(longa)).toHaveLength(3);
    expect(longa.volumes[2].saiuMs).toBeNull();
    expect(longa.cortadoNoFim).toBeNull();
    // A menos de 2 s do fim: nao da' para ver se era caixa, mas a entrada
    // foi filmada — conta, e vem apontada para conferir. Descartada, a
    // medicao ficava com um volume a menos (revisao de 11/11).
    // Tres caixas inteiras antes: o limite da passagem curta sai delas (3,5 s).
    const curta = detectarVolumes(sinal({ duracao: 60, caixas: [[5, 12], [20, 27], [35, 42], [59, 61]] }));
    expect(entradas(curta)).toHaveLength(4);
    expect(curta.descartados).toEqual([]);
    expect(Math.abs(curta.cortadoNoFim.entrouMs / 1000 - 59)).toBeLessThan(0.3);
  });

  it('duas caixas encostadas (14 s contra 7 s do tipico) ficam apontadas para conferir', () => {
    const r = detectarVolumes(sinal({
      duracao: 90, caixas: [[5, 12], [20, 27], [35, 49], [60, 67], [75, 82]],
    }));
    expect(entradas(r)).toHaveLength(5);
    expect(r.suspeitos).toHaveLength(1);
    expect(Math.abs(r.suspeitos[0].entrouMs / 1000 - 35)).toBeLessThan(0.3);
  });

  it('video sem caixa nenhuma: recusa com o porque, sem inventar volume', () => {
    expect(detectarVolumes(sinal({ caixas: [] })).motivo).toMatch(/não mostrou diferença/);
    expect(detectarVolumes(sinal({ caixas: [] })).semContraste).toBe(true);
  });

  it('o SINAL REAL da envolvedora: as entradas batem com as conferidas quadro a quadro', () => {
    const real = JSON.parse(readFileSync(new URL('./fixtures/sinal-envolvedora-87s.json', import.meta.url)));
    const r = detectarVolumes(real.amostras.map(([ms, fracao]) => ({ ms, fracao })));
    expect(r.motivo).toBeUndefined();
    expect(r.comCaixaNoInicio).toBe(true);
    expect(entradas(r)).toHaveLength(3);
    // Conferidas quadro a quadro: a frente da caixa chega ao tapete. A marca
    // automatica vem ~0,25 s depois (a caixa ja' cobrindo parte do
    // retangulo) — atraso fixo, que nao muda o ciclo.
    [26.8, 58.2, 70.5].forEach((t, i) => expect(Math.abs(entradas(r)[i] - t)).toBeLessThan(0.5));
    // Os ciclos entre entradas: 31,4 e 12,4 s, os mesmos do leitor de camera.
    expect(entradas(r)[1] - entradas(r)[0]).toBeCloseTo(31.4, 0);
    expect(entradas(r)[2] - entradas(r)[1]).toBeCloseTo(12.4, 0);
    // Embaixo do filme cada caixa fica o mesmo tempo (tempo de maquina): a
    // deteccao le' as tres do mesmo jeito.
    const permanencias = r.volumes.map((v) => (v.saiuMs - v.entrouMs) / 1000);
    expect(Math.max(...permanencias) - Math.min(...permanencias)).toBeLessThan(0.3);
    expect(r.descartados).toEqual([]);
    expect(r.suspeitos).toEqual([]);
  });
});

describe('intervalos longos (onde a linha provavelmente parou)', () => {
  it('aponta o intervalo de mais de 3x o tipico; com poucos intervalos, nada', () => {
    const entradas30 = [0, 30, 60, 90, 120, 300, 330].map(s);
    expect(intervalosLongos(entradas30)).toEqual([{ deMs: s(120), ateMs: s(300), duracaoMs: s(180) }]);
    expect(intervalosLongos([0, 30, 200].map(s))).toEqual([]);
    expect(intervalosLongos([])).toEqual([]);
  });
});

describe('o retangulo desenhado na tela', () => {
  it('video largo num elemento alto: faixa preta em cima e embaixo', () => {
    const a = areaDaImagem({
      larguraElemento: 800, alturaElemento: 600, larguraVideo: 1280, alturaVideo: 720,
    });
    expect(a).toEqual({
      x: 0, y: 75, largura: 800, altura: 450,
    });
    expect(pontoNaImagem(400, 300, a)).toEqual({ x: 0.5, y: 0.5 });
    // Clique na faixa preta vale a borda da imagem.
    expect(pontoNaImagem(-10, 10, a)).toEqual({ x: 0, y: 0 });
  });

  it('video em pe' + "' num elemento largo: faixa preta dos lados", () => {
    const a = areaDaImagem({
      larguraElemento: 1000, alturaElemento: 500, larguraVideo: 720, alturaVideo: 1280,
    });
    expect(a.altura).toBe(500);
    expect(a.x).toBeCloseTo((1000 - 281.25) / 2);
    expect(areaDaImagem({
      larguraElemento: 0, alturaElemento: 500, larguraVideo: 720, alturaVideo: 1280,
    })).toBeNull();
  });

  it('arrastar em qualquer direcao da' + "' o mesmo retangulo, e retangulo minusculo nao vale", () => {
    const r = retanguloEntre({ x: 0.8, y: 0.9 }, { x: 0.6, y: 0.5 });
    expect(r.x).toBeCloseTo(0.6);
    expect(r.y).toBeCloseTo(0.5);
    expect(r.largura).toBeCloseTo(0.2);
    expect(r.altura).toBeCloseTo(0.4);
    expect(retanguloValido(r)).toBe(true);
    expect(retanguloValido({
      x: 0.5, y: 0.5, largura: 0.01, altura: 0.3,
    })).toBe(false);
    expect(retanguloValido({
      x: 0.9, y: 0.5, largura: 0.2, altura: 0.3,
    })).toBe(false);
    expect(retanguloValido(null)).toBe(false);
  });
});

describe('das entradas a' + "' marcacao do Enter", () => {
  it('a primeira entrada e' + "' a largada; as outras, volumes na ordem do video", () => {
    const m = marcacaoDasEntradas([s(40), s(5.2), s(20.04), s(20.1)]);
    expect(m.largadaMs).toBe(s(5.2));
    // 20,04 e 20,1 s: a menos de 200 ms, um volume so'.
    expect(m.toques).toEqual([{ ms: s(20.04), ordem: 1 }, { ms: s(40), ordem: 2 }]);
    expect(m.ordem).toBe(2);
    expect(marcacaoDasEntradas([])).toEqual(marcacaoVazia());
  });

  it('a marcacao automatica segue as regras do Enter: encerra e vira a medicao de sempre', () => {
    const m = marcacaoDasEntradas([s(5), s(20), s(40)]);
    const { medicao } = medicaoDoVideo({
      largadaMs: m.largadaMs, toquesMs: m.toques.map((t) => t.ms), paradas: [], fimMs: s(50),
      inicioFilmagem: '2026-11-11T13:00:00.000Z',
    });
    expect(medicao.pecas).toBe(2);
    expect(medicao.marcasMs).toEqual([s(15), s(35)]);
    // E o Enter do analista por cima: perto de uma marca automatica, recusa.
    expect(marcarToque(m, s(20.1)).aviso).toMatch(/já está marcado/);
  });

  it('a conferencia conta o que o analista mexeu: mantidas, apagadas, acrescentadas', () => {
    const automaticas = [s(5), s(20), s(40), s(60)];
    let m = marcacaoDasEntradas(automaticas);
    expect(conferirAutomatica(automaticas, m)).toEqual({
      automaticas: 4, mantidas: 4, apagadas: 0, acrescentadas: 0,
    });
    m = removerVolume(m, s(40)).marcacao;
    m = marcarToque(m, s(50)).marcacao;
    m = marcarToque(m, s(70)).marcacao;
    expect(conferirAutomatica(automaticas, m)).toEqual({
      automaticas: 4, mantidas: 3, apagadas: 1, acrescentadas: 2,
    });
    expect(conferirAutomatica([], m)).toBeNull();
    expect(conferirAutomatica(null, m)).toBeNull();
  });
});

describe('as marcas pela SAIDA da caixa (v2.109.0): o fim sai do rolete e entra no tapete', () => {
  const seg = (xs) => xs.map((ms) => ms / 1000);
  it('cada caixa vira uma marca no instante em que sai da faixa', () => {
    const r = saidasDosVolumes(detectarVolumes(sinal({ caixas: [[5, 12], [20, 27], [40, 47]] })));
    expect(r.marcasMs).toHaveLength(3);
    seg(r.marcasMs).forEach((t, i) => expect(Math.abs(t - [12, 27, 47][i])).toBeLessThan(0.3));
    expect(r.jaEstava).toBeNull();
    expect(r.semSaida).toBeNull();
  });
  it('a caixa que ja estava na faixa no comeco NAO conta (podia ser uma mao, e viraria a largada)', () => {
    const d = detectarVolumes(sinal({ caixas: [[0, 4], [20, 27], [40, 47]] }));
    const r = saidasDosVolumes(d);
    expect(d.comCaixaNoInicio).toBe(true);
    expect(Math.abs(r.jaEstava / 1000 - 4)).toBeLessThan(0.3);
    expect(r.marcasMs).toHaveLength(2);
    seg(r.marcasMs).forEach((t, i) => expect(Math.abs(t - [27, 47][i])).toBeLessThan(0.3));
  });
  it('FAIXA FINA: caixa que atravessa em 1,8 a 2,8 s conta; a mao de 0,7 s nao (revisao da v2.109.0)', () => {
    // Ciclo de 24 s; com o minimo fixo de 2 s de antes, 3 destas caixas sumiam.
    const travessias = [1.8, 2.3, 1.9, 2.8, 2.1, 1.95, 2.6, 2.2, 2.4, 2.0];
    const caixas = travessias.map((t, i) => [10 + 24 * i, 10 + 24 * i + t]);
    const mao = [10 + 24 * 4 + 12, 10 + 24 * 4 + 12.7];
    const d = detectarVolumes(sinal({ duracao: 260, caixas: [...caixas, mao] }));
    const r = saidasDosVolumes(d);
    expect(r.marcasMs).toHaveLength(10);
    seg(r.marcasMs).forEach((t, i) => expect(Math.abs(t - caixas[i][1])).toBeLessThan(0.35));
    expect(r.descartados).toHaveLength(1);
    expect(Math.abs(r.descartados[0] / 1000 - mao[1])).toBeLessThan(0.35);
    // O limite saiu do video: metade da travessia tipica (~2,2 s).
    expect(d.permanenciaMinimaMs).toBeGreaterThan(800);
    expect(d.permanenciaMinimaMs).toBeLessThan(1400);
  });
  it('retangulo grande (caixas de 7 s): o vulto de 1 s continua descartado pelo limite do proprio video', () => {
    const d = detectarVolumes(sinal({ caixas: [[5, 12], [20, 21], [30, 37], [45, 52]] }));
    expect(d.volumes).toHaveLength(3);
    expect(d.descartados).toHaveLength(1);
    expect(d.permanenciaMinimaMs).toBeGreaterThan(3000);
  });
  it('a que entrou e o video acabou antes de ela sair NAO conta: a saida nao foi filmada', () => {
    const r = saidasDosVolumes(detectarVolumes(sinal({ duracao: 60, caixas: [[10, 17], [30, 37], [56.5, 61]] })));
    expect(r.marcasMs).toHaveLength(2);
    expect(Math.abs(r.semSaida / 1000 - 56.5)).toBeLessThan(0.3);
  });
  it('a caixa suspeita (duas encostadas) e' + "' apontada no instante da marca, a saida", () => {
    const r = saidasDosVolumes(detectarVolumes(sinal({
      duracao: 90, caixas: [[5, 12], [20, 27], [35, 49], [60, 67], [75, 82]],
    })));
    expect(r.suspeitos).toHaveLength(1);
    expect(Math.abs(r.suspeitos[0] / 1000 - 49)).toBeLessThan(0.3);
  });
  it('sem leitura (motivo), nenhuma marca', () => {
    expect(saidasDosVolumes({ motivo: 'x' })).toEqual({
      marcasMs: [], jaEstava: null, semSaida: null, suspeitos: [], descartados: [],
    });
  });
});
