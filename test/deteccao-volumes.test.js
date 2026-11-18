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
  AREA_MINIMA, ATRASO_MINIMO_MS, CORRELACAO_MINIMA, JANELA_MAXIMA_MS, LADO_MINIMO, TESTE_MINIMO_MS, TESTE_MS, areaDaImagem,
  DISPERSAO_MAXIMA_CAIXA, MIN_PARES_CAIXA, atrasoCaixaACaixa, atrasoEntreFaixas, congelarLinhaB, distanciaDaLeitura,
  esteiraPelasLinhas, intervaloDaLinha, intervaloTipico, linhaBDaLeitura, linhaBValida, mesmaLinha, ocupacaoTipica,
  periodoDoSinal, soLinha, avaliarTeste, detectarVolumes, ehPapelao, fracaoPapelao, intervalosLongos,
  limiaresDoSinal, pontoNaImagem, retanguloEntre, retanguloValido, saidasDosVolumes, trechoDoTeste,
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
    // Desde a v2.113.0 a linha fina vale (0,4% de lado e area minima): a de
    // 1% × 30% passou a valer; abaixo de 0,4% de um lado, nao.
    expect(retanguloValido({
      x: 0.5, y: 0.5, largura: 0.003, altura: 0.3,
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
  it('uma MAO EM TODO CICLO (tantas passagens curtas quanto caixas) nao vira volume', () => {
    // Com a mediana, o limite caia para 0,88 s e as 10 maos de 0,9 s viravam
    // volume — o ritmo quase dobrava (revisao de 12/11). Com o percentil 75, nao.
    const caixas = Array.from({ length: 10 }, (_, i) => [10 + 24 * i, 12.5 + 24 * i]);
    const maos = Array.from({ length: 10 }, (_, i) => [22 + 24 * i, 22.9 + 24 * i]);
    const d = detectarVolumes(sinal({ duracao: 260, caixas: [...caixas, ...maos] }));
    const r = saidasDosVolumes(d);
    expect(r.marcasMs).toHaveLength(10);
    expect(r.descartados).toHaveLength(10);
    expect(d.permanenciaMinimaMs).toBeGreaterThan(1000);
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

describe('TESTAR O RETANGULO (v2.112.0): o trecho curto diz se pegou, antes de ler o video todo', () => {
  it('a mascara da tela pinta exatamente o que a leitura conta (a mesma regra, pixel a pixel)', () => {
    const pxs = [[176, 138, 90], [150, 120, 80], [30, 61, 51], [70, 50, 30], [240, 240, 235], [230, 200, 40]];
    const dados = Uint8ClampedArray.from(pxs.flatMap(([r, g, b]) => [r, g, b, 255]));
    const pintados = pxs.filter(([r, g, b]) => ehPapelao(r, g, b)).length;
    expect(fracaoPapelao(dados)).toBeCloseTo(pintados / pxs.length);
    // O amarelo (barra de protecao) conta como papelao: e' por isso que a
    // tela mostra o que fica rosa — para tirar o que nao e' caixa.
    expect(ehPapelao(230, 200, 40)).toBe(true);
    expect(ehPapelao(30, 61, 51)).toBe(false);
  });

  it('o trecho: 2 min a partir de onde o video esta, ou ate o fim do video', () => {
    expect(TESTE_MS).toBe(120000);
    expect(trechoDoTeste(60000, 878600)).toEqual({ inicioMs: 60000, fimMs: 180000, curto: false });
    expect(trechoDoTeste(800000, 878600)).toEqual({ inicioMs: 800000, fimMs: 878600, curto: false });
    expect(trechoDoTeste(0, null)).toEqual({ inicioMs: 0, fimMs: 120000, curto: false });
    expect(trechoDoTeste(-5, 60000)).toEqual({ inicioMs: 0, fimMs: 60000, curto: false });
  });

  it('no fim do video nao ha o que testar (o play voltaria ao comeco e leria o video todo): curto', () => {
    expect(trechoDoTeste(878600, 878600)).toMatchObject({ curto: true, fimMs: 878600 });
    expect(trechoDoTeste(878600 - TESTE_MINIMO_MS + 1, 878600).curto).toBe(true);
    expect(trechoDoTeste(878600 - TESTE_MINIMO_MS, 878600).curto).toBe(false);
  });

  // 2 min de linha rodando: uma caixa a cada 12 s, 2,5 s na faixa.
  const caixasDe2Min = Array.from({ length: 9 }, (_, i) => [8 + 12 * i, 10.5 + 12 * i]);

  it('ok: separou caixa de esteira vazia e achou as caixas, na SAIDA de cada uma', () => {
    const t = avaliarTeste(sinal({ duracao: 120, caixas: caixasDe2Min }), { inicioMs: 0, fimMs: 120000 });
    expect(t.veredito).toBe('ok');
    expect(t.caixas).toBe(9);
    t.marcasMs.forEach((ms, i) => expect(Math.abs(ms / 1000 - caixasDe2Min[i][1])).toBeLessThan(0.4));
    expect(t.base).toBeLessThan(0.1);
    expect(t.topo).toBeGreaterThan(0.5);
    expect(t.inicioMs).toBe(0);
    expect(t.fimMs).toBe(120000);
  });

  it('ok tambem com pouca diferenca (0,25): sem evidencia de que perca caixa, nao vira aviso', () => {
    const t = avaliarTeste(sinal({ duracao: 120, caixas: caixasDe2Min, topo: 0.3, ruido: 0.01 }));
    expect(t.veredito).toBe('ok');
    expect(t.caixas).toBe(9);
    expect(t.contraste).toBeLessThan(0.3);
  });

  /** O trecho [de, ate) (em s) das amostras de um sinal mais longo, como o teste le. */
  const trechoDe = (amostras, de, ate) => amostras.filter((a) => a.ms >= de * 1000 && a.ms < ate * 1000);
  const marcasEntre = (marcasMs, de, ate) => marcasMs.filter((ms) => ms >= de * 1000 && ms < ate * 1000);

  it('mesmo produto e luz o video todo (10 min): o teste de 2 min marca as mesmas caixas que a leitura inteira nesse trecho', () => {
    const caixas10 = Array.from({ length: 49 }, (_, i) => [5 + 12 * i, 7.5 + 12 * i]);
    const todas = sinal({ duracao: 600, caixas: caixas10 });
    const t = avaliarTeste(trechoDe(todas, 120, 240), { inicioMs: 120000, fimMs: 240000 });
    const inteira = marcasEntre(saidasDosVolumes(detectarVolumes(todas)).marcasMs, 120, 240);
    expect(t.veredito).toBe('ok');
    expect(t.marcasMs.length).toBe(inteira.length);
    // Os niveis saem de amostras diferentes: o instante pode andar uns decimos, a caixa nao.
    t.marcasMs.forEach((ms, i) => expect(Math.abs(ms - inteira[i])).toBeLessThan(300));
  });

  it('o LIMITE do teste: se a caixa muda no meio do video, a leitura inteira acha outros niveis e pode marcar diferente', () => {
    // 2 min de um produto que cobre 45% da faixa, depois 8 min de outro que
    // cobre 95% (troca de produto, ou de luz). O teste no comeco aprova; a
    // leitura do video todo, com os niveis do video inteiro, nao marca as do
    // comeco. Por isso a tela nao promete que a leitura acha o que o teste
    // achou (revisao da v2.112.0).
    const a = Array.from({ length: 9 }, (_, i) => [8 + 12 * i, 10.5 + 12 * i]);
    const b = Array.from({ length: 39 }, (_, i) => [128 + 12 * i, 130.5 + 12 * i]);
    const comeco = sinal({ duracao: 120, caixas: a, topo: 0.45 });
    const resto = sinal({ duracao: 480, caixas: b.map(([x, y]) => [x - 120, y - 120]), topo: 0.95 })
      .map((p) => ({ ...p, ms: p.ms + 120000 + 50 }));
    const todas = [...comeco, ...resto];
    const t = avaliarTeste(comeco, { inicioMs: 0, fimMs: 120000 });
    expect(t.veredito).toBe('ok');
    expect(t.caixas).toBe(9);
    const inteira = saidasDosVolumes(detectarVolumes(todas)).marcasMs;
    expect(marcasEntre(inteira, 0, 120)).toHaveLength(0);
    expect(marcasEntre(inteira, 120, 600).length).toBeGreaterThan(30);
  });

  it('uma: so 1 caixa passou inteira — pouco para dizer, e a leitura nao mede com uma caixa so', () => {
    const t = avaliarTeste(sinal({ duracao: 120, caixas: [[40, 42.5]] }));
    expect(t.veredito).toBe('uma');
    expect(t.caixas).toBe(1);
  });

  it('nada: o retangulo nunca teve cor de papelao (nenhuma caixa passou, ou ele esta fora do caminho)', () => {
    const t = avaliarTeste(sinal({ duracao: 120, base: 0.04 }));
    expect(t.veredito).toBe('nada');
    expect(t.maximo).toBeLessThan(0.15);
    expect(t.caixas).toBe(0);
    expect(t.base).toBeNull();
  });

  it('sempre: cor de papelao o tempo todo, mesmo vazio (algo pardo ou amarelo parado dentro dele)', () => {
    const t = avaliarTeste(sinal({ duracao: 120, base: 0.4 }));
    expect(t.veredito).toBe('sempre');
    expect(t.minimo).toBeGreaterThanOrEqual(0.15);
  });

  it('sem contraste: varia, mas pouco — a caixa cobre so parte do retangulo', () => {
    const t = avaliarTeste(sinal({
      duracao: 120, caixas: caixasDe2Min, base: 0.05, topo: 0.18, ruido: 0.01,
    }));
    expect(t.veredito).toBe('sem-contraste');
    expect(t.minimo).toBeLessThan(0.15);
    expect(t.maximo).toBeGreaterThanOrEqual(0.15);
  });

  it('nenhuma: separou, mas nenhuma caixa passou INTEIRA (a que ja estava e a cortada no fim nao contam)', () => {
    const t = avaliarTeste(sinal({ duracao: 60, caixas: [[0, 5], [57, 61]] }));
    expect(t.veredito).toBe('nenhuma');
    expect(t.caixas).toBe(0);
  });

  it('curto: amostras de menos', () => {
    expect(avaliarTeste([{ ms: 0, fracao: 0.5 }]).veredito).toBe('curto');
    expect(avaliarTeste(null).veredito).toBe('curto');
  });

  it('o grafico: no maximo 240 pontos, e o pico de cada caixa nao some na reducao', () => {
    const amostras = sinal({ duracao: 120, caixas: caixasDe2Min });
    const t = avaliarTeste(amostras);
    expect(amostras.length).toBeGreaterThan(240);
    expect(t.grafico.length).toBeLessThanOrEqual(240);
    expect(Math.max(...t.grafico.map((p) => p.v))).toBeCloseTo(t.maximo, 5);
    expect(t.grafico.every((p, i) => i === 0 || p.ms > t.grafico[i - 1].ms)).toBe(true);
  });

  it('o SINAL REAL da envolvedora (87 s, faixa certa): ok, 3 caixas, com diferenca de ~0,5 entre vazio e caixa', () => {
    const real = JSON.parse(readFileSync(new URL('./fixtures/sinal-envolvedora-87s.json', import.meta.url)));
    const amostras = real.amostras.map(([ms, fracao]) => ({ ms, fracao }));
    const t = avaliarTeste(amostras, { inicioMs: 0, fimMs: 87000 });
    expect(t.veredito).toBe('ok');
    expect(t.caixas).toBe(3);
    // As saidas: a caixa que ja' estava (sai em ~5 s) nao conta; as tres
    // que entram em ~26,8, ~58,2 e ~70,5 s saem uns 7 s depois.
    [26.8, 58.2, 70.5].forEach((entrada, i) => {
      expect(t.marcasMs[i] / 1000 - entrada).toBeGreaterThan(5);
      expect(t.marcasMs[i] / 1000 - entrada).toBeLessThan(8);
    });
    expect(t.contraste).toBeGreaterThan(0.45);
  });
});

describe('A ESTEIRA PELAS LINHAS A E B (v2.113.0): velocidade e entre-pecas medidos no video', () => {
  // A caixa passa na linha A (2 s cobrindo, a cada `periodo` ms) e o MESMO
  // desenho aparece na B `atraso` ms depois; amostras a cada ~130 ms, como a 8x.
  const duasLinhas = ({
    atraso = 1000, periodo = 8000, duracao = 120000, ruido = 0.03, bIndependente = false,
  } = {}) => {
    let semente = 11;
    const r = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    const pulso = (t) => { const m = ((t % periodo) + periodo) % periodo; return m >= 3000 && m < 5000 ? 0.9 : 0.05; };
    const am = [];
    for (let ms = 0; ms < duracao; ms += 110 + Math.round(r() * 40)) {
      am.push({
        ms,
        fracao: pulso(ms) + (r() - 0.5) * 2 * ruido,
        fracaoB: bIndependente ? r() : pulso(ms - atraso) + (r() - 0.5) * 2 * ruido,
      });
    }
    return am;
  };

  it('o atraso de A para B sai do sinal inteiro, com erro menor que 5%, e o periodo sai do proprio sinal', () => {
    const a = atrasoEntreFaixas(duasLinhas({ atraso: 1000 }));
    expect(Math.abs(a.atrasoMs - 1000)).toBeLessThan(50);
    expect(a.periodoMs).toBe(8000);
    expect(a.limiteMs).toBe(3200); // 0,4 periodo
    expect(a.correlacao).toBeGreaterThan(0.9);
    expect(linhaBValida(a)).toBe(true);
  });

  it('A E B LONGE DEMAIS (revisao): o atraso alem de meio periodo aparece como a copia NEGATIVA — recusado', () => {
    // 5 s com periodo de 8 s: a copia em −3 s cai dentro da busca.
    const a5 = atrasoEntreFaixas(duasLinhas({ atraso: 5000 }));
    expect(Math.abs(a5.atrasoMs + 3000)).toBeLessThan(100);
    expect(a5.invertido).toBe(true);
    expect(linhaBValida(a5)).toBe(false);
    // 7 s: a copia em −1 s.
    const a7 = atrasoEntreFaixas(duasLinhas({ atraso: 7000 }));
    expect(a7.invertido).toBe(true);
    expect(linhaBValida(a7)).toBe(false);
    // 3,5 s: passa de 0,4 periodo (3,2 s) — o pico fica no limite da busca.
    const a35 = atrasoEntreFaixas(duasLinhas({ atraso: 3500 }));
    expect(a35.noLimite).toBe(true);
    expect(linhaBValida(a35)).toBe(false);
  });

  it('linhas trocadas (a caixa chega antes na B): invertido, recusado', () => {
    const a = atrasoEntreFaixas(duasLinhas({ atraso: -1500 }));
    expect(Math.abs(a.atrasoMs + 1500)).toBeLessThan(75);
    expect(a.invertido).toBe(true);
    expect(linhaBValida(a)).toBe(false);
  });

  it('perto demais (menos que o atraso minimo): recusado; linhas que nao veem a mesma coisa: fraca', () => {
    const perto = atrasoEntreFaixas(duasLinhas({ atraso: 200 }));
    expect(perto.pertoDemais).toBe(true);
    expect(linhaBValida(perto)).toBe(false);
    expect(ATRASO_MINIMO_MS).toBe(400);
    const fraca = atrasoEntreFaixas(duasLinhas({ bIndependente: true }));
    expect(fraca.fraca || fraca.motivo).toBeTruthy();
    expect(linhaBValida(fraca)).toBe(false);
  });

  it('a janela de busca tem teto (o video longo nao trava a tela) e o periodo, limite', () => {
    // Periodo de 40 s: 0,4 × 40 = 16 s, mas a busca para em 10 s.
    const a = atrasoEntreFaixas(duasLinhas({ atraso: 2000, periodo: 40000, duracao: 400000 }));
    expect(a.periodoMs).toBe(40000);
    expect(a.limiteMs).toBe(JANELA_MAXIMA_MS);
    expect(Math.abs(a.atrasoMs - 2000)).toBeLessThan(100);
  });

  it('O INTERVALO ENTRE AS CAIXAS concilia o sinal e as marcas (revisao): cada um erra pelo dobro num caso', () => {
    expect(intervaloDaLinha({ periodoMs: 6600, medianaMs: 6500 })).toMatchObject({ intervaloMs: 6500, motivo: null });
    // Caixas alternadas (uma com pecas em cima, outra sem): o sinal da' o dobro — vale a mediana.
    expect(intervaloDaLinha({ periodoMs: 13200, medianaMs: 6600 })).toMatchObject({ intervaloMs: 6600, alternadas: true });
    // A linha A perdeu caixas: as marcas dao o dobro — vale o periodo.
    expect(intervaloDaLinha({ periodoMs: 6600, medianaMs: 13200 })).toMatchObject({ intervaloMs: 6600, perdidas: true });
    const nao = intervaloDaLinha({ periodoMs: 9900, medianaMs: 6600 });
    expect(nao.intervaloMs).toBeNull();
    expect(nao.motivo).toMatch(/não fecha — pelas marcas da A, 6\.6 s; pelo sinal, 9\.9 s/);
    // Chegadas irregulares (o sinal nao se repete): as marcas.
    expect(intervaloDaLinha({ periodoMs: null, medianaMs: 6200 })).toMatchObject({ intervaloMs: 6200 });
  });

  it('caixas ALTERNADAS (a revisao: caixa + vao saia 1975 mm em vez de 990): o intervalo e o das marcas', () => {
    let semente = 5;
    const r = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    const ent = Array.from({ length: 40 }, (_, k) => 3000 + 6600 * k);
    const f = (ms) => {
      const k = ent.findIndex((e) => ms >= e && ms < e + 2000);
      if (k < 0) return 0.05;
      return k % 2 ? 0.45 : 0.9;
    };
    const am = [];
    for (let ms = 0; ms < 270000; ms += 110 + Math.round(r() * 40)) {
      am.push({ ms, fracao: f(ms) + (r() - 0.5) * 0.06, fracaoB: f(ms - 2000) + (r() - 0.5) * 0.06 });
    }
    const l = linhaBDaLeitura(am, ent.map((e) => e + 2000));
    expect(l.periodoMs).toBe(13200); // o sinal erra pelo dobro...
    expect(l.intervaloTipicoMs).toBe(6600); // ...e as marcas corrigem
    const e = esteiraPelasLinhas({ ...l, distanciaMm: 300, comprimentoMm: 825 });
    expect(Math.abs(e.passoMm - 990)).toBeLessThan(15);
    expect(Math.abs(e.entrePecasMm - 165)).toBeLessThan(15);
  });

  it('a linha A que perde caixas nao dobra a janela nem o intervalo: o periodo do sinal manda', () => {
    const am = duasLinhas({ atraso: 1000 });
    const l = linhaBDaLeitura(am, [5000, 21000, 37000, 53000, 69000, 85000]);
    expect(l.intervaloTipicoMs).toBe(8000);
    expect(l.limiteMs).toBe(3200);
    expect(linhaBDaLeitura([{ ms: 0, fracao: 0.1 }], [1000, 9000])).toBeNull();
  });

  it('periodoDoSinal: com caixas quase iguais, o PRIMEIRO pico (8 s), nao o dobro, mesmo o dobro sendo maior', () => {
    const n = 4000; // 160 s numa grade de 40 ms
    const sinal = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * 40;
      const k = Math.floor(t / 8000);
      const dentro = t % 8000 >= 3000 && t % 8000 < 5000;
      sinal[i] = dentro ? (k % 2 ? 0.8 : 0.9) : 0.05;
    }
    expect(periodoDoSinal(sinal)).toBe(8000);
    expect(periodoDoSinal(new Float64Array(2000).fill(0.1))).toBeNull();
  });

  it('chegadas irregulares (o sinal nao se repete): a janela sai das marcas e a medida vale', () => {
    let semente = 9;
    const r = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    const ent = [];
    let t = 3000;
    for (let k = 0; k < 40; k++) { ent.push(t); t += 6600 + (r() - 0.5) * 6000; }
    const f = (ms) => (ent.some((e) => ms >= e && ms < e + 2000) ? 0.9 : 0.05);
    const am = [];
    for (let ms = 0; ms < t + 3000; ms += 110 + Math.round(r() * 40)) {
      am.push({ ms, fracao: f(ms) + (r() - 0.5) * 0.06, fracaoB: f(ms - 2000) + (r() - 0.5) * 0.06 });
    }
    const l = linhaBDaLeitura(am, ent.map((e) => e + 2000));
    expect(l.motivo).toBeUndefined();
    expect(Math.abs(l.atrasoMs - 2000)).toBeLessThan(80);
    expect(linhaBValida(l)).toBe(true);
  });

  it('a conta: 360 mm em 2,4 s = 9 m/min; uma caixa a cada 6,5 s = 975 mm de caixa + vao; com a caixa de 825, 150 mm', () => {
    const r = esteiraPelasLinhas({
      atrasoMs: 2400, distanciaMm: 360, intervaloTipicoMs: 6500, comprimentoMm: 825, ocupacaoMs: 5500,
    });
    expect(r.velocidadeMMin).toBeCloseTo(9, 6);
    expect(r.velocidadeCaixaMMin).toBeCloseTo(9, 6); // 825 mm em 5,5 s na faixa
    expect(r.passoMm).toBeCloseTo(975, 6);
    expect(r.entrePecasMm).toBeCloseTo(150, 6);
    expect(r.suspeito).toBeNull();
    expect(esteiraPelasLinhas({ atrasoMs: -2400, distanciaMm: 360, intervaloTipicoMs: 6500, comprimentoMm: 825 })).toBeNull();
    expect(esteiraPelasLinhas({ atrasoMs: 200, distanciaMm: 360, intervaloTipicoMs: 6500, comprimentoMm: 825 })).toBeNull();
    expect(esteiraPelasLinhas({ atrasoMs: 2400, distanciaMm: null, intervaloTipicoMs: 6500 })).toBeNull();
    expect(esteiraPelasLinhas({ atrasoMs: 2400, distanciaMm: 360, intervaloTipicoMs: 6500 }).entrePecasMm).toBeNull();
  });

  it('ATRASO DE MAIS DE UM INTERVALO (revisao: 83 m/min na tela): a velocidade pela propria caixa o pega, sem cadastro', () => {
    // Verdade: 9 m/min (150 mm/s), caixa de 825 mm (5,5 s na faixa), uma a
    // cada 6,5 s; A e B a 1050 mm (7 s): a copia aparece 0,5 s depois.
    const r = esteiraPelasLinhas({
      atrasoMs: 500, distanciaMm: 1050, intervaloTipicoMs: 6500, comprimentoMm: 825, ocupacaoMs: 5500,
    });
    expect(r.velocidadeMMin).toBeGreaterThan(100);
    expect(r.suspeito).toBe('velocidade');
    // Sem a ocupacao, o entre-pecas absurdo (mais que 5 caixas) ainda pega; com
    // ela, vao grande de caixa pequena (3 caixas) e' normal.
    expect(esteiraPelasLinhas({
      atrasoMs: 1000, distanciaMm: 100, intervaloTipicoMs: 8000, comprimentoMm: 200, ocupacaoMs: 2000,
    })).toMatchObject({ suspeito: null, entrePecasMm: 600 });
    const semOcupacao = esteiraPelasLinhas({ atrasoMs: 500, distanciaMm: 1050, intervaloTipicoMs: 6500, comprimentoMm: 825 });
    expect(semOcupacao.suspeito).toBe('entre');
    // A ocupacao que erra uns 20% (pecas em cima da chapa) nao acusa a medida boa.
    expect(esteiraPelasLinhas({
      atrasoMs: 2400, distanciaMm: 360, intervaloTipicoMs: 6500, comprimentoMm: 825, ocupacaoMs: 4400,
    }).suspeito).toBeNull();
  });

  it('as linhas e a distancia de uma leitura ficam congeladas; a de agora so vale com as mesmas linhas', () => {
    const A = { x: 0.4, y: 0.5, largura: 0.06, altura: 0.01 };
    const B = { x: 0.4, y: 0.55, largura: 0.06, altura: 0.01 };
    const lido = { ...A, evento: 'saida', b: B, distanciaMm: 300 };
    const l = congelarLinhaB({ atrasoMs: 2000 }, lido);
    expect(l.linhas).toEqual({ a: A, b: B });
    expect(l.distanciaMm).toBe(300);
    expect(distanciaDaLeitura(l, { ...lido, distanciaMm: 320 })).toEqual({ mesmas: true, distanciaMm: 320 });
    expect(distanciaDaLeitura(l, { ...lido, b: { ...B, y: 0.6 }, distanciaMm: 500 })).toEqual({ mesmas: false, distanciaMm: 300 });
    const semD = congelarLinhaB({ atrasoMs: 2000 }, { ...lido, distanciaMm: undefined });
    expect(distanciaDaLeitura(semD, { ...lido, b: { ...B, y: 0.6 }, distanciaMm: 500 })).toEqual({ mesmas: false, distanciaMm: null });
    expect(congelarLinhaB(null, lido)).toBeNull();
    expect(mesmaLinha(soLinha(A), A)).toBe(true);
  });

  it('o intervalo tipico das marcas e a mediana (a parada nao o estica)', () => {
    expect(intervaloTipico([0, 6500, 13000, 80000, 86500, 93000])).toBe(6500);
    expect(intervaloTipico([1000])).toBeNull();
  });

  it('o teste do retangulo devolve a linha B quando ela foi lida', () => {
    const am = duasLinhas({ atraso: 1000 });
    const t = avaliarTeste(am, { inicioMs: 0, fimMs: 120000 });
    expect(t.linhaB).not.toBeNull();
    expect(Math.abs(t.linhaB.atrasoMs - 1000)).toBeLessThan(60);
    expect(Math.abs(t.linhaB.intervaloTipicoMs - 8000)).toBeLessThan(50);
    expect(avaliarTeste(am.map(({ ms, fracao }) => ({ ms, fracao }))).linhaB).toBeNull();
  });

  it('a linha fina sobre a fita: lado minimo de 0,4% e area minima (a de 2% de cada lado nao deixava desenhar A e B)', () => {
    // 6% da largura × 0,6% da altura: uma linha atravessando a esteira.
    expect(retanguloValido({ x: 0.4, y: 0.5, largura: 0.06, altura: 0.006 })).toBe(true);
    // Fina demais, ou pequena demais nos dois lados.
    expect(retanguloValido({ x: 0.4, y: 0.5, largura: 0.06, altura: 0.003 })).toBe(false);
    expect(retanguloValido({ x: 0.6, y: 0.6, largura: 0.005, altura: 0.01 })).toBe(false);
    expect(LADO_MINIMO).toBe(0.004);
    expect(AREA_MINIMA).toBe(0.0003);
  });
});

describe('O ATRASO CAIXA A CAIXA (v2.114.0): a ponta de cada caixa de A ate B, quando as linhas pegam as caixas certinho', () => {
  // Caixas limpas: 2 s na faixa, uma a cada 8 s; a B ve' a mesma caixa 1,2 s depois.
  const limpas = ({ atraso = 1200, extraB = false } = {}) => {
    let semente = 13;
    const r = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    const ent = Array.from({ length: 12 }, (_, k) => 3000 + 8000 * k);
    const naA = (ms) => ent.some((e) => ms >= e && ms < e + 2000);
    const naB = (ms) => naA(ms - atraso) || (extraB && ms >= 50500 && ms < 52500);
    const am = [];
    for (let ms = 0; ms < 100000; ms += 110 + Math.round(r() * 40)) {
      am.push({ ms, fracao: (naA(ms) ? 0.9 : 0.05) + (r() - 0.5) * 0.06, fracaoB: (naB(ms) ? 0.9 : 0.05) + (r() - 0.5) * 0.06 });
    }
    return am;
  };

  it('caixas limpas: casa uma a uma, mediana certa, e a leitura usa o caixa a caixa', () => {
    const c = atrasoCaixaACaixa(limpas(), { limiteMs: 3200 });
    expect(c.valido).toBe(true);
    expect(c.pares).toBeGreaterThanOrEqual(10);
    expect(Math.abs(c.atrasoMs - 1200)).toBeLessThan(60);
    const l = linhaBDaLeitura(limpas(), Array.from({ length: 12 }, (_, k) => 5000 + 8000 * k));
    expect(l.metodo).toBe('caixa');
    expect(l.concordam).toBe(true);
    expect(linhaBValida(l)).toBe(true);
  });

  it('uma caixa a mais na B (um vulto) nao casa com a errada: fica de fora', () => {
    const c = atrasoCaixaACaixa(limpas({ extraB: true }), { limiteMs: 3200 });
    expect(c.valido).toBe(true);
    expect(Math.abs(c.atrasoMs - 1200)).toBeLessThan(60);
  });

  it('a B longe demais (alem da janela): nada casa, e a leitura fica no sinal (que recusa a copia negativa)', () => {
    const am = limpas({ atraso: 5000 });
    expect(atrasoCaixaACaixa(am, { limiteMs: 3200 }).pares).toBe(0);
    const l = linhaBDaLeitura(am, Array.from({ length: 12 }, (_, k) => 5000 + 8000 * k));
    expect(l.metodo).toBe('sinal');
    expect(linhaBValida(l)).toBe(false);
  });

  it('o SINAL REAL DA SELADORA (27 s): a ponta leva ~1,5 s, caixa a caixa; o sinal inteiro diverge 11% e a tela avisa', () => {
    const real = JSON.parse(readFileSync(new URL('./fixtures/sinal-seladora-27s.json', import.meta.url)));
    const am = real.amostras.map(([ms, fracao, fracaoB]) => ({ ms, fracao, fracaoB }));
    const r = detectarVolumes(am);
    const l = linhaBDaLeitura(am, saidasDosVolumes(r).marcasMs, { ocupacaoMs: ocupacaoTipica(r.volumes) });
    expect(l.metodo).toBe('caixa');
    expect(l.caixaACaixa.pares).toBe(MIN_PARES_CAIXA);
    expect(l.caixaACaixa.dispersao).toBeLessThan(DISPERSAO_MAXIMA_CAIXA);
    expect(Math.abs(l.atrasoMs - 1500)).toBeLessThan(50);
    expect(l.concordam).toBe(false); // o sinal inteiro deu ~1,67 s
    const e = esteiraPelasLinhas({ ...l, distanciaMm: real.distanciaMm, comprimentoMm: real.caixaMm });
    expect(e.velocidadeMMin).toBeGreaterThan(12);
    expect(e.velocidadeMMin).toBeLessThan(13);
    expect(e.suspeito).toBeNull(); // a velocidade pela caixa (~13 m/min) concorda
  });

  it('a ponta nao depende do ritmo de quadros: o mesmo video com 1 quadro a cada 40 ms ou ~130 ms (a leitura a 8x) dá o mesmo tempo', () => {
    // A v2.114.0 em teste: na media de 0,5 s sobre os quadros que chegavam, a
    // ponta virava escada e o video de teste a 6,0 m/min dava 5,5.
    const real = JSON.parse(readFileSync(new URL('./fixtures/sinal-seladora-27s.json', import.meta.url)));
    const am = real.amostras.map(([ms, fracao, fracaoB]) => ({ ms, fracao, fracaoB }));
    const cheio = atrasoCaixaACaixa(am, { limiteMs: 2400 }).atrasoMs;
    for (const passo of [2, 3.33, 4, 5]) {
      const ralo = am.filter((_, i) => i === 0 || Math.floor(i / passo) !== Math.floor((i - 1) / passo));
      const c = atrasoCaixaACaixa(ralo, { limiteMs: 2400 });
      expect(c.valido).toBe(true);
      expect(Math.abs(c.atrasoMs - cheio) / cheio).toBeLessThan(0.03);
    }
    // A ponta leva 190 ms para cobrir a faixa (como no video de teste), e o
    // navegador entrega 3 quadros a cada 10 (~133 ms): o tempo de cada caixa
    // fica no lugar, sem a escada (antes: 1,105 s em todas, 10% a mais).
    const rampa = (t) => {
      const u = (((t % 8000) + 8000) % 8000) - 2000;
      if (u < 0 || u > 2190) return 0.05;
      if (u < 190) return 0.05 + (0.85 * u) / 190;
      return u > 2000 ? 0.05 + (0.85 * (2190 - u)) / 190 : 0.9;
    };
    const quadros = [];
    for (let i = 0; i * 40 < 60000; i++) {
      if (i % 10 === 0 || i % 10 === 3 || i % 10 === 7) quadros.push({ ms: i * 40, fracao: rampa(i * 40), fracaoB: rampa(i * 40 - 1000) });
    }
    const c = atrasoCaixaACaixa(quadros, { limiteMs: 3200 });
    expect(Math.abs(c.atrasoMs - 1000)).toBeLessThan(50); // antes, 105 ms (10%)
    expect(c.ateMs - c.deMs).toBeLessThan(60);
  });

  it('chapa coberta (como na Emb inicio): os tempos caixa a caixa se espalham e a leitura fica no sinal inteiro', () => {
    // Reproduzido com sinais sinteticos de casamento ruim: tempos espalhados.
    let semente = 21;
    const r = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    const ent = Array.from({ length: 12 }, (_, k) => 3000 + 8000 * k);
    const desvio = ent.map(() => 600 + r() * 1800); // 0,6 a 2,4 s: nao concordam
    const naA = (ms) => ent.some((e) => ms >= e && ms < e + 2000);
    const naB = (ms) => ent.some((e, k) => ms >= e + desvio[k] && ms < e + desvio[k] + 2000);
    const am = [];
    for (let ms = 0; ms < 100000; ms += 110 + Math.round(r() * 40)) {
      am.push({ ms, fracao: (naA(ms) ? 0.9 : 0.05), fracaoB: (naB(ms) ? 0.9 : 0.05) });
    }
    const c = atrasoCaixaACaixa(am, { limiteMs: 3200 });
    expect(c.valido).toBe(false);
    expect(c.dispersao).toBeGreaterThan(DISPERSAO_MAXIMA_CAIXA);
  });
});
