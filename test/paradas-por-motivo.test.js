/**
 * POR QUE A LINHA PAROU (v2.104.0) — as paradas de uma medicao por motivo,
 * no volume a volume da embalagem. O total tem de ser o do cartao Paradas
 * marcadas (somarParadas): o quadro abre o mesmo numero, nao cria outro.
 */
import { describe, expect, it } from 'vitest';
import {
  paradasPorMotivo, rotuloMotivo, somarParadas, unidadeDoPosto,
} from '../src/domain/cronoanalise.js';
import { frasesDasParadas, pctDoParado } from '../src/domain/volumeAVolume.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');

const S = 1000;
const MIN = 60 * S;

describe('paradasPorMotivo', () => {
  // 13 paradas, 12 min — o caso da medicao das 08:47 (RACK FLIP 2.2).
  const paradas = [
    ...Array(5).fill(null).map(() => ({ motivo: 'falta_material', duracaoMs: 84 * S, observacao: 'faltou caixa' })),
    { motivo: 'setup', duracaoMs: 2 * MIN },
    { motivo: 'setup', duracaoMs: 1 * MIN, observacao: 'troca de fita' },
    ...Array(6).fill(null).map(() => ({ motivo: 'outro', duracaoMs: 20 * S, observacao: null })),
  ];

  it('o total e o numero de paradas sao os do cartao Paradas marcadas', () => {
    const r = paradasPorMotivo(paradas);
    const cartao = somarParadas(paradas);
    expect(r.totalMs).toBe(cartao.totalMs);
    expect(r.totalMs).toBe(12 * MIN);
    expect(r.n).toBe(13);
  });

  it('o maior motivo primeiro, com o tempo, as paradas e o % de cada um', () => {
    const r = paradasPorMotivo(paradas);
    expect(r.motivos.map((m) => m.motivo)).toEqual(['falta_material', 'setup', 'outro']);
    // 5 x 84 s = 7 min; setup 2 + 1 = 3 min; 6 x 20 s = 2 min. 7 + 3 + 2 = 12.
    expect(r.motivos.map((m) => m.ms)).toEqual([7 * MIN, 3 * MIN, 2 * MIN]);
    expect(r.motivos.map((m) => m.n)).toEqual([5, 2, 6]);
    expect(r.motivos[0].pct).toBeCloseTo((7 / 12) * 100, 6);
    expect(r.motivos[0].rotulo).toBe(rotuloMotivo('falta_material'));
    // A soma das partes fecha com o total.
    expect(r.motivos.reduce((t, m) => t + m.ms, 0)).toBe(r.totalMs);
  });

  it('a observacao vai com o motivo dela, uma vez so', () => {
    const r = paradasPorMotivo(paradas);
    const por = Object.fromEntries(r.motivos.map((m) => [m.motivo, m.observacoes]));
    expect(por.falta_material).toEqual(['faltou caixa']);
    expect(por.setup).toEqual(['troca de fita']);
    expect(por.outro).toEqual([]);
  });

  it('aceita o formato do banco e o rotulo antigo como motivo', () => {
    const r = paradasPorMotivo([
      { motivo: 'Setup / Troca', duracao_ms: 4 * MIN, observacao: '  gabarito  ' },
      { motivo: 'setup', duracao_ms: 2 * MIN },
    ]);
    expect(r.motivos).toHaveLength(1);
    expect(r.motivos[0]).toMatchObject({ motivo: 'setup', ms: 6 * MIN, n: 2, observacoes: ['gabarito'] });
  });

  it('parada sem tempo nao conta, nem a observacao dela', () => {
    const r = paradasPorMotivo([
      { motivo: 'setup', duracaoMs: 0, observacao: 'zerada' },
      { motivo: 'setup', duracaoMs: 3 * MIN },
    ]);
    expect(r.n).toBe(1);
    expect(r.motivos[0].observacoes).toEqual([]);
  });

  it('sem parada com tempo, null — a tela nao desenha quadro vazio', () => {
    expect(paradasPorMotivo([])).toBeNull();
    expect(paradasPorMotivo(undefined)).toBeNull();
    expect(paradasPorMotivo([{ motivo: 'setup', duracaoMs: 0 }])).toBeNull();
  });
});

describe('frasesDasParadas — a mesma frase no PC, na folha e no tablet', () => {
  // 523,2 s: o cartao diz "9 min"; o quadro tem de dizer o exato.
  const pm = paradasPorMotivo([{ motivo: 'outro', duracaoMs: 523200 }, { motivo: 'outro', duracaoMs: 0 }]);

  it('o total exato, e onde esta o arredondado: o cartao na tela, o Parado (marcado) no papel', () => {
    const tela = frasesDasParadas(pm, { unidade: VOLUME });
    expect(tela).toMatch(/^8min43s em 1 parada na medição inteira, o maior motivo primeiro:/);
    expect(tela).toMatch(/É o total do cartão Paradas marcadas, que arredonda para minutos\.$/);
    const papel = frasesDasParadas(pm, { unidade: VOLUME, saida: 'papel', nMedicoes: 3 });
    expect(papel).toMatch(/^8min43s em 1 parada nas 3 medições inteiras/);
    expect(papel).toMatch(/É o total do Parado \(marcado\), lá arredondado para minutos\.$/);
    expect(papel).not.toMatch(/cartão/);
  });

  it('o De onde veio com outro numero: a frase diz quanto ele da e por que', () => {
    expect(frasesDasParadas(pm, { unidade: VOLUME, entreToquesMs: 480000 }))
      .toMatch(/O "Paradas marcadas" do De onde veio dá 8min00s: ele conta só o que o cronômetro tirou entre o 1º e o último volume\.$/);
    // Igual (menos de 1 s de diferenca) ou sem a linha dele: nada a explicar.
    expect(frasesDasParadas(pm, { unidade: VOLUME, entreToquesMs: 522800 })).not.toMatch(/De onde veio/);
    expect(frasesDasParadas(pm, { unidade: VOLUME })).not.toMatch(/De onde veio/);
  });

  it('o % do parado: "<1%" no lugar de "0%"', () => {
    expect(pctDoParado(0.2)).toBe('<1%');
    expect(pctDoParado(0.5)).toBe('1%');
    expect(pctDoParado(58.33)).toBe('58%');
    expect(pctDoParado(100)).toBe('100%');
  });
});

describe('frasesDasParadas — o que cada saida pode afirmar (revisao de 10/11)', () => {
  const pm = paradasPorMotivo([{ motivo: 'setup', duracaoMs: 60000 }, { motivo: 'outro', duracaoMs: 30000 }]);

  it('no tablet, as anotadas depois sao as do resultado DESTE tablet — a copia nao recebe as do PC', () => {
    const t = frasesDasParadas(pm, { unidade: VOLUME, saida: 'tablet' });
    expect(t).toMatch(/as anotadas depois, no resultado deste tablet, também as de fora dos toques\./);
    expect(t).not.toMatch(/PC/);
    expect(frasesDasParadas(pm, { unidade: VOLUME })).toMatch(/\(no resultado do tablet ou aqui no PC\)/);
    expect(frasesDasParadas(pm, { unidade: VOLUME, saida: 'papel' })).toMatch(/\(no resultado do tablet ou no PC\)/);
  });

  it('sem toques, sem "fora dos toques"; sem cartao na tela, sem citar o cartao', () => {
    const t = frasesDasParadas(pm, { unidade: VOLUME, comToques: false, comCartao: false });
    expect(t).not.toMatch(/fora dos toques/);
    expect(t).not.toMatch(/cartão/);
  });

  it('abaixo de um minuto, o cartao mostra "< 1 min" — a frase nao diz que arredonda', () => {
    const curto = paradasPorMotivo([{ motivo: 'outro', duracaoMs: 46000 }]);
    expect(frasesDasParadas(curto, { unidade: VOLUME })).toMatch(/que mostra "< 1 min"\.$/);
    expect(frasesDasParadas(curto, { unidade: VOLUME, saida: 'papel' })).toMatch(/que lá aparece como "< 1 min"\.$/);
  });

  it('o De onde veio MAIOR que a lista: a causa e outra (parada apagada ou encurtada), e a frase diz qual', () => {
    expect(frasesDasParadas(pm, { unidade: VOLUME, entreToquesMs: 120000 }))
      .toMatch(/dá 2min00s: ele sai do relógio do cronômetro, não desta lista — parada marcada ao vivo e depois apagada ou encurtada continua nele\.$/);
  });

  it('o arredondamento da lista (ate 0,3 s por parada) nao vira frase', () => {
    // 13 paradas: folga de 3,9 s. 3 s de diferenca e' arredondamento.
    const muitas = paradasPorMotivo(Array(13).fill(null).map(() => ({ motivo: 'outro', duracaoMs: 60000 })));
    expect(frasesDasParadas(muitas, { unidade: VOLUME, entreToquesMs: 13 * 60000 - 3000 })).not.toMatch(/De onde veio/);
    expect(frasesDasParadas(muitas, { unidade: VOLUME, entreToquesMs: 13 * 60000 + 3000 })).not.toMatch(/De onde veio/);
    expect(frasesDasParadas(muitas, { unidade: VOLUME, entreToquesMs: 13 * 60000 - 60000 })).toMatch(/De onde veio dá 12min00s/);
  });
});
