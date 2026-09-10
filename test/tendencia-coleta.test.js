/**
 * A serie que o grafico de tendencia desenha e as frases que a tela e a
 * folha A4 dizem sobre ela. Conferidas na mao: a reta precisa passar pela
 * media da serie e a leitura precisa seguir o mesmo criterio das sugestoes.
 */
import { describe, expect, it } from 'vitest';
import { tendencia } from '../src/domain/estatistica.js';
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
  });

  it('ciclos caindo: curva de aprendizado e media inflada', () => {
    const l = lerTendencia(serieDeTendencia([10000, 9500, 9000, 8500, 8000, 7500]));
    expect(l.rotulo).toBe('Ciclos caindo');
    expect(l.frase).toMatch(/mais rápidos/);
    expect(l.frase).toMatch(/aprendizado/);
  });

  it('a % da frase e a variacao do primeiro ao ultimo ciclo da reta', () => {
    // 7500 -> 10000 sobre media 8750: +28,6% -> "29%"
    const l = lerTendencia(serieDeTendencia([7500, 8000, 8500, 9000, 9500, 10000]));
    expect(l.frase).toMatch(/29% mais lentos/);
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
