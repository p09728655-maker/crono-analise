/**
 * A serie que o grafico de tendencia desenha e as frases que a tela e a
 * folha A4 dizem sobre ela. Conferidas na mao: a reta precisa passar pela
 * media da serie e a leitura precisa seguir o mesmo criterio das sugestoes.
 */
import { describe, expect, it } from 'vitest';
import { r2MinimoParaTendencia, tendencia } from '../src/domain/estatistica.js';
import { lerTendencia, serieDeTendencia } from '../src/domain/tendenciaColeta.js';

describe('tendencia — intercepto', () => {
  it('reta exata: intercepto e inclinacao batem com a serie', () => {
    // y = 1000 + 100·i
    const t = tendencia([1000, 1100, 1200, 1300, 1400]);
    expect(t.slope).toBeCloseTo(100, 6);
    expect(t.intercepto).toBeCloseTo(1000, 6);
    expect(t.r2).toBeCloseTo(1, 6);
  });

  it('a reta passa pela media no meio da serie', () => {
    const v = [9800, 9500, 10100, 9700, 10200, 9900];
    const t = tendencia(v);
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    const meio = (v.length - 1) / 2;
    expect(t.intercepto + t.slope * meio).toBeCloseTo(media, 6);
  });

  it('serie curta devolve intercepto zero junto com o resto', () => {
    expect(tendencia([1000, 900]).intercepto).toBe(0);
  });
});

describe('r2MinimoParaTendencia — inclinacao distinguivel do acaso', () => {
  it('cresce quando a amostra encolhe: 3 ciclos exigem reta quase perfeita', () => {
    expect(r2MinimoParaTendencia(3)).toBeCloseTo(0.994, 3);   // t(1)=12,706
    expect(r2MinimoParaTendencia(10)).toBeCloseTo(0.399, 3);  // t(8)=2,306
    expect(r2MinimoParaTendencia(20)).toBeCloseTo(0.197, 3);  // t(18)=2,101
    expect(r2MinimoParaTendencia(2)).toBe(1);
  });

  it('ruido puro com poucos ciclos nao vira tendencia (falso positivo ~5%)', () => {
    // Gerador deterministico: normal por Box-Muller, media 8 s, CV 10%.
    let semente = 42;
    const rnd = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };
    const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    for (const n of [3, 4, 6, 8, 12]) {
      let afirmou = 0;
      const coletas = 4000;
      for (let c = 0; c < coletas; c++) {
        const ciclos = Array.from({ length: n }, () => 8000 + 800 * normal());
        if (tendencia(ciclos).direcao !== 'estavel') afirmou++;
      }
      expect(afirmou / coletas, `n=${n}`).toBeLessThan(0.08);
    }
  });

  it('tendencia real continua detectada com amostra usual', () => {
    // Subida de 25% ao longo de 10 ciclos com ruido de 3%.
    const ciclos = [8000, 8250, 8400, 8700, 8900, 9100, 9350, 9500, 9800, 10000]
      .map((v, i) => v + (i % 2 ? 120 : -120));
    expect(tendencia(ciclos).direcao).toBe('degradacao');
  });
});

describe('serieDeTendencia', () => {
  it('mantem a ordem dos ciclos e descarta toque acidental', () => {
    const s = serieDeTendencia([9800, 150, 9500, 10100]);
    expect(s.ciclos).toEqual([9800, 9500, 10100]);
    expect(s.n).toBe(3);
  });

  it('a reta vai do intercepto ao ultimo ciclo ajustado', () => {
    const s = serieDeTendencia([1000, 1100, 1200, 1300, 1400]);
    expect(s.reta.inicio).toBeCloseTo(1000, 6);
    expect(s.reta.fim).toBeCloseTo(1400, 6);
  });

  it('a % exibida compara o fim da reta com o inicio; o criterio usa o ciclo medio', () => {
    const s = serieDeTendencia([7500, 8000, 8500, 9000, 9500, 10000]);
    expect(s.pctExibida).toBeCloseTo(33.33, 1); // 10,0 ÷ 7,5
    expect(s.pct).toBeCloseTo(28.57, 1);        // 2,5 ÷ 8,75
  });

  it('com menos de 3 ciclos nao ha reta — mas os pontos saem', () => {
    const s = serieDeTendencia([1000, 1100]);
    expect(s.reta).toBeNull();
    expect(s.ciclos).toEqual([1000, 1100]);
  });

  it('sem ciclo valido: serie vazia e sem reta', () => {
    const s = serieDeTendencia([]);
    expect(s.n).toBe(0);
    expect(s.reta).toBeNull();
    expect(s.direcao).toBe('estavel');
  });
});

describe('lerTendencia', () => {
  it('poucos ciclos: diz quantos faltam, no singular e no plural', () => {
    expect(lerTendencia(serieDeTendencia([1000])).frase).toMatch(/Com 1 ciclo não/);
    expect(lerTendencia(serieDeTendencia([1000, 1100])).frase).toMatch(/Com 2 ciclos não/);
    expect(lerTendencia(serieDeTendencia([1000])).rotulo).toBe('Poucos ciclos');
  });

  it('ciclos subindo: fadiga vai para a tolerancia, nao para o tempo normal', () => {
    const l = lerTendencia(serieDeTendencia([7500, 8000, 8500, 9000, 9500, 10000]));
    expect(l.rotulo).toBe('Ciclos subindo');
    expect(l.tom).toBe('atencao');
    expect(l.frase).toMatch(/mais lentos/);
    expect(l.frase).toMatch(/tolerância/);
    // O numero declara de onde sai: os dois extremos da reta, em segundos.
    expect(l.frase).toMatch(/de 7\.5 s a 10\.0 s/);
  });

  it('ciclos caindo: curva de aprendizado e media inflada', () => {
    const l = lerTendencia(serieDeTendencia([10000, 9500, 9000, 8500, 8000, 7500]));
    expect(l.rotulo).toBe('Ciclos caindo');
    expect(l.frase).toMatch(/mais rápidos/);
    expect(l.frase).toMatch(/aprendizado/);
  });

  it('a % da frase e a variacao do primeiro ao ultimo ciclo DA RETA', () => {
    // Reta de 7,5 s a 10,0 s: 10 ÷ 7,5 = +33%. Nao 29% (base no ciclo medio).
    const l = lerTendencia(serieDeTendencia([7500, 8000, 8500, 9000, 9500, 10000]));
    expect(l.frase).toMatch(/33% mais lentos/);
  });

  it('poucos ciclos numa reta boa: nao afirma direcao, e diz por que', () => {
    // 4 ciclos subindo com ruido: r2 alto, mas abaixo do minimo para n=4 (0,90).
    const s = serieDeTendencia([8000, 8700, 8500, 9300]);
    expect(s.r2).toBeGreaterThan(0.3);
    expect(s.r2).toBeLessThan(s.r2Minimo);
    const l = lerTendencia(s);
    expect(l.rotulo).toBe('Sem direção');
    expect(l.frase).toMatch(/com 4 ciclos/);
    expect(l.frase).toMatch(/não é tendência confirmada/);
    expect(l.frase).not.toMatch(/coletar|cronometrar mais/i);
  });

  it('variacao de 4,6% nao vira "5%" por arredondar antes do limiar', () => {
    // 20 ciclos que sobem e descem (ruido +,−,−,+ nao correlaciona com a
    // ordem) sobre uma subida de 19 ms por ciclo: 361 ms em 8180 = 4,4%.
    const ruido = [900, -900, -900, 900];
    const ciclos = Array.from({ length: 20 }, (_, i) => 8000 + ruido[i % 4] + i * 19);
    const s = serieDeTendencia(ciclos);
    expect(s.pct).toBeGreaterThan(4);
    expect(s.pct).toBeLessThan(5);
    expect(lerTendencia(s).rotulo).toBe('Estável');
  });

  it('serie constante e estavel', () => {
    const l = lerTendencia(serieDeTendencia([1000, 1000, 1000, 1000]));
    expect(l.rotulo).toBe('Estável');
    expect(l.tom).toBe('ok');
  });

  it('variacao grande sem padrao e dispersao, nao tendencia', () => {
    // Serra: a reta ate' inclina, mas o r2 fica perto de zero.
    const s = serieDeTendencia([1000, 1600, 900, 1700, 950, 1650, 1000, 1750]);
    expect(Math.abs(s.pct)).toBeGreaterThanOrEqual(5);
    expect(s.r2).toBeLessThan(0.3);
    const l = lerTendencia(s);
    expect(l.rotulo).toBe('Sem direção');
    expect(l.frase).toMatch(/dispersão, não tendência/);
    expect(l.frase).toMatch(/CV%/);
  });
});

describe('o selo do quadro', () => {
  it('"Estável" e "Poucos ciclos" nao carregam porcentagem', () => {
    expect(lerTendencia(serieDeTendencia([1000, 1000, 1000, 1000])).mostrarPct).toBe(false);
    expect(lerTendencia(serieDeTendencia([1000])).mostrarPct).toBe(false);
  });

  it('subida, queda e "sem direcao" carregam', () => {
    expect(lerTendencia(serieDeTendencia([7500, 8000, 8500, 9000, 9500, 10000])).mostrarPct).toBe(true);
    expect(lerTendencia(serieDeTendencia([10000, 9500, 9000, 8500, 8000, 7500])).mostrarPct).toBe(true);
    expect(lerTendencia(serieDeTendencia([1000, 1600, 900, 1700, 950, 1650, 1000, 1750])).mostrarPct).toBe(true);
  });
});
