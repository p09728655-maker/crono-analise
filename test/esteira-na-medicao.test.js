/**
 * A ESTEIRA PELAS LINHAS A E B NA MEDICAO SALVA (v2.115.0, PPCP 19/11/2026:
 * "coloca na impressao velocidade e entre pecas"). Tres pecas e o caminho
 * inteiro entre elas:
 *  - esteiraParaSalvar (tela do video): so' o que o quadro mostra;
 *  - esteiraDaConferencia (servidor): o que nao serve vira null, sem
 *    derrubar a medicao;
 *  - fraseDaEsteira (volume a volume e folha): os mesmos numeros da tela.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  detectarVolumes, esteiraParaSalvar, esteiraPelasLinhas, linhaBDaLeitura, ocupacaoTipica, saidasDosVolumes,
} from '../src/domain/deteccaoVolumes.js';
import { camposDaEsteira, esteiraEmColunas, fraseDaEsteira } from '../src/domain/volumeAVolume.js';
import { esteiraDaConferencia } from '../api/_lib/validar.js';

const LINHAS = {
  x: 0.4, y: 0.4, largura: 0.03, altura: 0.2, b: { x: 0.6, y: 0.4, largura: 0.03, altura: 0.2 },
};
/** A linha B como a leitura do video a congela (congelarLinhaB). */
const congelada = (l, distanciaMm = 310) => ({
  ...l,
  linhas: { a: { x: 0.4, y: 0.4, largura: 0.03, altura: 0.2 }, b: LINHAS.b },
  distanciaMm,
});
const valida = {
  atrasoMs: 1604, metodo: 'caixa', caixaACaixa: { pares: 51 }, intervaloTipicoMs: 6100, ocupacaoMs: 2000,
};

describe('esteiraParaSalvar — o que vai com a medicao e o que o quadro mostra', () => {
  it('caixa a caixa, com distancia e caixa: as entradas da conta, inteiras', () => {
    expect(esteiraParaSalvar({
      linhaB: congelada(valida), retangulo: { ...LINHAS, distanciaMm: 310 }, caixaMm: 440,
    })).toEqual({ distanciaMm: 310, atrasoMs: 1604, metodo: 'caixa', caixas: 51, intervaloMs: 6100, caixaMm: 440 });
  });

  it('com a caixa e sem o intervalo: vai a velocidade, sem o caixa + vao', () => {
    const e = esteiraParaSalvar({
      linhaB: congelada({ ...valida, metodo: 'sinal', intervaloTipicoMs: null }), retangulo: { ...LINHAS, distanciaMm: 310 }, caixaMm: 440,
    });
    expect(e).toEqual({ distanciaMm: 310, atrasoMs: 1604, metodo: 'sinal', caixas: null, intervaloMs: null, caixaMm: 440 });
  });

  /* SEM A CAIXA, NADA (revisao da v2.119.0). A leitura com ocupacao de 200 ms
     (a B a mais de uma caixa + vao da A) e' recusada com a caixa — 440, ou a
     825 aberta de antes. Sem caixa, o `suspeito` desligava e a folha imprimia
     "Velocidade da esteira 11.6 m/min", um numero que a tela recusaria. */
  it('sem a caixa a esteira nao vai: sem ela a leitura nao se confere pela propria caixa', () => {
    const ret = { ...LINHAS, distanciaMm: 310 };
    const trocada = congelada({ ...valida, ocupacaoMs: 200 });
    expect(esteiraParaSalvar({ linhaB: trocada, retangulo: ret, caixaMm: 440 })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: trocada, retangulo: ret, caixaMm: 825 })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: trocada, retangulo: ret })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: congelada(valida), retangulo: ret, caixaMm: null })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: congelada(valida), retangulo: ret, caixaMm: 0 })).toBeNull();
    // exigeCaixa: false — so' para a tela saber que a unica coisa que falta e' a caixa
    expect(esteiraParaSalvar({ linhaB: congelada(valida), retangulo: ret, exigeCaixa: false }))
      .toMatchObject({ distanciaMm: 310, caixaMm: null });
    expect(esteiraParaSalvar({ linhaB: congelada(valida, null), retangulo: { ...LINHAS, distanciaMm: null }, exigeCaixa: false })).toBeNull();
  });

  it('o que o quadro recusa nao vai: linha B que nao vale, sem distancia, atraso trocado', () => {
    const ret = { ...LINHAS, distanciaMm: 310 };
    expect(esteiraParaSalvar({ linhaB: null, retangulo: ret })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: congelada({ ...valida, invertido: true }), retangulo: ret })).toBeNull();
    expect(esteiraParaSalvar({ linhaB: congelada({ ...valida, fraca: true }), retangulo: ret })).toBeNull();
    // Sem distancia digitada (e as linhas sao as mesmas): a tela pede a distancia.
    expect(esteiraParaSalvar({ linhaB: congelada(valida, null), retangulo: { ...LINHAS, distanciaMm: null } })).toBeNull();
    // A velocidade pelas linhas e' mais que o triplo da pela caixa (ocupacao 200 ms): suspeita, sem numeros.
    expect(esteiraParaSalvar({ linhaB: congelada({ ...valida, ocupacaoMs: 200 }), retangulo: ret, caixaMm: 440 })).toBeNull();
  });

  it('as linhas mudaram depois da leitura: vale a distancia congelada com ela', () => {
    const outraA = { ...LINHAS, x: 0.1, distanciaMm: null };
    expect(esteiraParaSalvar({ linhaB: congelada(valida, 300), retangulo: outraA, caixaMm: 440 })?.distanciaMm).toBe(300);
  });
});

describe('esteiraDaConferencia — o servidor', () => {
  const boa = { distanciaMm: 310, atrasoMs: 1604, metodo: 'caixa', caixas: 51, intervaloMs: 6100, caixaMm: 440 };

  it('so\' na medicao por video', () => {
    expect(esteiraDaConferencia(boa, { origem: 'video' })).toEqual(boa);
    expect(esteiraDaConferencia(boa, { origem: 'tablet' })).toBeNull();
  });

  it('sem distancia, tempo ou metodo que sirvam, nada; os opcionais que nao servem viram null', () => {
    for (const ruim of [
      { ...boa, distanciaMm: 0 }, { ...boa, atrasoMs: 1.5 }, { ...boa, metodo: 'outro' }, null, 'x', [boa],
    ]) expect(esteiraDaConferencia(ruim, { origem: 'video' })).toBeNull();
    expect(esteiraDaConferencia({ ...boa, caixaMm: -1, intervaloMs: 'x' }, { origem: 'video' }))
      .toMatchObject({ caixaMm: null, intervaloMs: null, atrasoMs: 1604 });
    // O numero de caixas e' do caixa a caixa.
    expect(esteiraDaConferencia({ ...boa, metodo: 'sinal' }, { origem: 'video' }).caixas).toBeNull();
  });
});

describe('fraseDaEsteira — a folha do Takt Time', () => {
  const linha = (e) => Object.fromEntries(Object.entries({
    esteira_distancia_mm: e.distanciaMm, esteira_atraso_ms: e.atrasoMs, esteira_metodo: e.metodo,
    esteira_caixas: e.caixas, esteira_intervalo_ms: e.intervaloMs, esteira_caixa_mm: e.caixaMm,
  }).map(([k, v]) => [k, v ?? null]));

  it('a revisao, antes de salvar, escreve a MESMA frase que a folha (esteiraEmColunas)', () => {
    const e = { distanciaMm: 310, atrasoMs: 1604, metodo: 'caixa', caixas: 51, intervaloMs: 6100, caixaMm: 440 };
    expect(fraseDaEsteira(esteiraEmColunas(e))).toEqual(fraseDaEsteira(linha(e)));
    expect(esteiraEmColunas(null)).toEqual({});
    expect(fraseDaEsteira(esteiraEmColunas(null))).toBeNull();
  });

  /* O cadastro vai ao lado do CAIXA + VAO, nao do entre-pecas (revisao da
     v2.119.0): o ENTRE_PECAS do cadastro (400) e' o vao com a caixa ABERTA
     (825); o video mede com a FECHADA (440). "≈ 708 mm · cadastro: 400 mm"
     dava 77% a mais de vao numa linha MAIS apertada: 1148 contra 1225. */
  it('a FOLHA em campos (v2.116.0): os numeros da frase, com o cadastro do produto ao lado do caixa + vao', () => {
    const c = linha({ distanciaMm: 310, atrasoMs: 1620, metodo: 'caixa', caixas: 52, intervaloMs: 5998, caixaMm: 440 });
    const campos = camposDaEsteira(c, { vel: 9, entre: 400, medida: 825 });
    expect(campos.map((k) => [k.rotulo, k.valor, k.sub])).toEqual([
      ['Velocidade da esteira', '11.5 m/min', 'cadastro: 9.0 m/min'],
      ['Caixa + vão', '1148 mm', 'uma caixa a cada 6.0 s · cadastro: 1225 mm'],
      ['Entre-peças', '≈ 708 mm', 'caixa de 440 mm'],
      ['Ponta da caixa de A até B', '1.62 s', '310 mm · mediana de 52 caixas'],
    ]);
    // Os mesmos numeros da frase da tela.
    const f = fraseDaEsteira(c).texto;
    for (const v of ['11.5 m/min', '1148 mm', '≈ 708 mm', '1.62 s']) expect(f).toContain(v);
  });

  it('a folha sem cadastro, sem caixa, sem intervalo, pelo video inteiro: diz o que falta, sem inventar', () => {
    const semCaixa = camposDaEsteira(linha({ distanciaMm: 310, atrasoMs: 1620, metodo: 'caixa', intervaloMs: 6000 }));
    expect(semCaixa[0].sub).toBe('medida no vídeo');
    expect(semCaixa[2]).toMatchObject({ valor: '—', sub: 'falta a medida da caixa' });
    expect(semCaixa[3].sub).toBe('310 mm · caixa a caixa');
    const semPasso = camposDaEsteira(linha({ distanciaMm: 310, atrasoMs: 1670, metodo: 'sinal' }), { vel: 9, entre: 400, medida: 825 });
    expect(semPasso[1]).toMatchObject({ valor: '—', sub: 'o intervalo entre as caixas não fechou · cadastro: 1225 mm' });
    expect(semPasso[2]).toMatchObject({ valor: '—', sub: 'sem o caixa + vão' });
    // sem a medida no cadastro (o jogo de caixas diferentes): sem o caixa + vao do cadastro, nunca so' o entre
    expect(camposDaEsteira(linha({ distanciaMm: 310, atrasoMs: 1670, metodo: 'sinal' }), { vel: 9, entre: 400 })[1].sub)
      .toBe('o intervalo entre as caixas não fechou');
    expect(semPasso[3].sub).toBe('310 mm · pelo vídeo inteiro');
    expect(camposDaEsteira({})).toBeNull();
  });

  it('medicao sem esteira: nada', () => {
    expect(fraseDaEsteira({})).toBeNull();
    expect(fraseDaEsteira(null)).toBeNull();
  });

  it('com a caixa: velocidade, caixa + vao, entre-pecas e de onde vieram', () => {
    const f = fraseDaEsteira(linha({
      distanciaMm: 310, atrasoMs: 1604, metodo: 'caixa', caixas: 51, intervaloMs: 6100, caixaMm: 440,
    }));
    expect(f.rotulo).toBe('Esteira, pelas linhas A e B');
    expect(f.texto).toContain('velocidade 11.6 m/min');
    expect(f.texto).toContain('caixa + vão 1179 mm (uma caixa a cada 6.1 s)');
    expect(f.texto).toContain('entre-peças ≈ 739 mm (caixa de 440 mm)');
    expect(f.texto).toContain('1.60 s de A até B (310 mm), a mediana de 51 caixas, caixa a caixa');
    expect(f.texto).toContain('não um padrão');
  });

  it('sem a caixa, sem o intervalo, pelo video inteiro: diz o que falta', () => {
    expect(fraseDaEsteira(linha({ distanciaMm: 310, atrasoMs: 1604, metodo: 'caixa', intervaloMs: 6100 })).texto)
      .toContain('entre-peças — (sem a medida da caixa)');
    const sinal = fraseDaEsteira(linha({ distanciaMm: 310, atrasoMs: 1670, metodo: 'sinal' })).texto;
    expect(sinal).toContain('caixa + vão e entre-peças — (o intervalo entre as caixas não fechou)');
    expect(sinal).toContain('pelo vídeo inteiro');
  });

  it('o CAMINHO INTEIRO no video real da seladora: a folha diz o mesmo que o quadro da tela', () => {
    const real = JSON.parse(readFileSync(new URL('./fixtures/sinal-seladora-27s.json', import.meta.url)));
    const am = real.amostras.map(([ms, fracao, fracaoB]) => ({ ms, fracao, fracaoB }));
    const r = detectarVolumes(am);
    const l = linhaBDaLeitura(am, saidasDosVolumes(r).marcasMs, { ocupacaoMs: ocupacaoTipica(r.volumes) });
    const ret = { ...LINHAS, distanciaMm: real.distanciaMm };
    const tela = esteiraPelasLinhas({ ...l, distanciaMm: real.distanciaMm, comprimentoMm: real.caixaMm });
    const salva = esteiraDaConferencia(
      esteiraParaSalvar({ linhaB: congelada(l, real.distanciaMm), retangulo: ret, caixaMm: real.caixaMm }),
      { origem: 'video' },
    );
    expect(salva.metodo).toBe('caixa');
    const folha = fraseDaEsteira(linha(salva)).texto;
    expect(folha).toContain(`velocidade ${(Math.round(tela.velocidadeMMin * 10) / 10).toFixed(1)} m/min`);
    expect(folha).toContain(`caixa + vão ${Math.round(tela.passoMm)} mm`);
    expect(folha).toContain(`entre-peças ≈ ${Math.round(tela.entrePecasMm)} mm`);
  });
});
