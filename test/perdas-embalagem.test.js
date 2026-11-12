/**
 * PERDAS DA EMBALAGEM (v2.110.0) — as contas do relatorio.
 *
 * O que se prova: cada medicao fecha (relogio = (N-1) x normal + lacunas +
 * paradas); o curto demais nao separa lacuna; medicoes sobrepostas da mesma
 * maquina nao contam o tempo duas vezes; o produto com e sem codigo e' o
 * mesmo; os agregados sao ponderados pelo tempo; e uma medicao real (so'
 * numeros) da' o mesmo que a consulta feita direto no banco.
 */
import { describe, expect, it } from 'vitest';
import {
  chaveDoProduto, horaExtraDaSemana, perdasDaMedicao, relatorioDePerdas, semSobreposicao,
} from '../src/domain/perdasEmbalagem.js';

const s = (seg) => seg * 1000;
/** Marcas (ms, relogio da linha rodando) a partir de intervalos em s. */
const marcasDe = (intervalos, inicio = 30) => {
  const m = [s(inicio)];
  for (const i of intervalos) m.push(m[m.length - 1] + s(i));
  return m;
};
const medicao = (over) => ({
  id: over.id || 'x', maquina: 'EMBALAGEM 01', peca: 'Rack', pecas: (over.marcas_ms || []).length,
  iniciado_em: '2026-11-10T10:00:00Z', duracao_ms: 600000, paradas: [], ...over,
});

describe('uma medicao', () => {
  it('fecha: relogio = (N-1) x normal + lacunas + paradas', () => {
    // 12 intervalos de 10 s e um de 50 s (lacuna: 40 s alem do normal), e 30 s
    // de parada marcada (o relogio passa as marcas em 30 s).
    const marcas = marcasDe([...Array(6).fill(10), 50, ...Array(6).fill(10)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: soma + s(30) }));
    expect(p.suficiente).toBe(true);
    expect(p.normalMs).toBe(s(10));
    expect(p.lacunasMs).toBe(s(40));
    expect(p.paradasMs).toBe(s(30));
    expect(p.intervalos * p.normalMs + p.lacunasMs + p.paradasMs).toBe(p.relogioMs);
  });
  it('com menos de 10 intervalos nao separa lacuna (a regra do volume a volume)', () => {
    const p = perdasDaMedicao(medicao({ marcas_ms: marcasDe([10, 10, 40]), marcas_relogio_ms: s(60) }));
    expect(p.suficiente).toBe(false);
    expect(p.lacunasMs).toBe(0);
    expect(p.normalMs).toBe(s(20));
    expect(p.paradasMs).toBe(0);
  });
  it('sem dois volumes marcados, nao ha' + "' leitura", () => {
    expect(perdasDaMedicao(medicao({ marcas_ms: [1000] }))).toBeNull();
    expect(perdasDaMedicao(medicao({ marcas_ms: null }))).toBeNull();
  });
  it('MEDICAO REAL (video da envolvedora, 12/11): bate com a consulta direta no banco', () => {
    // HOME RIPADO SUPREMO 2.3 VOL 1/3, 43 volumes, marcas_relogio_ms 1136329.
    // A consulta no banco (a mesma regra, em SQL) deu: periodo 27,1 s,
    // normal 22,5 s, parada 0,4 min (24,3 s), lacunas 2,8 min.
    const marcas = [17936, 34451, 56253, 77151, 98510, 120135, 141647, 176005, 327348, 349999, 370475, 389817, 414473,
      434202, 456420, 479377, 498704, 522921, 543093, 566076, 584214, 608792, 626496, 663406, 682913, 706349, 767578,
      791797, 810655, 837732, 875909, 900174, 924690, 945107, 963375, 984609, 1003787, 1026308, 1046221, 1069001,
      1087066, 1111082, 1130006];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: 1136329, pecas: 43 }));
    expect(p.relogioMs / p.intervalos / 1000).toBeCloseTo(27.06, 1);
    expect(p.normalMs / 1000).toBeCloseTo(22.5, 1);
    expect(p.paradasMs).toBe(1136329 - (1130006 - 17936));
    expect(p.lacunasMs / 60000).toBeCloseTo(2.8, 1);
    expect(p.nLacunas).toBe(2);
  });
});

describe('o produto e as sobreposicoes', () => {
  it('o mesmo produto com e sem o codigo na frente, em qualquer caixa', () => {
    expect(chaveDoProduto('501134 · PENTEADEIRA PRINCESA')).toBe('PENTEADEIRA PRINCESA');
    expect(chaveDoProduto('  Penteadeira   Princesa ')).toBe('PENTEADEIRA PRINCESA');
    expect(chaveDoProduto('')).toBe('PRODUTO NÃO INFORMADO');
    expect(chaveDoProduto(null)).toBe('PRODUTO NÃO INFORMADO');
  });
  it('o tablet e o video do mesmo trecho: fica a de mais volumes, uma vez so', () => {
    const video = medicao({
      id: 'v', pecas: 43, iniciado_em: '2026-11-12T15:44:56Z', finalizado_em: '2026-11-12T16:04:10Z',
    });
    const tablet = medicao({
      id: 't', pecas: 30, iniciado_em: '2026-11-12T15:50:41Z', finalizado_em: '2026-11-12T16:02:54Z',
    });
    const outraHora = medicao({
      id: 'o', pecas: 20, iniciado_em: '2026-11-12T17:00:00Z', finalizado_em: '2026-11-12T17:10:00Z',
    });
    const outraMaquina = medicao({
      id: 'm', maquina: 'EMBALAGEM 02', pecas: 50, iniciado_em: '2026-11-12T15:50:00Z', finalizado_em: '2026-11-12T16:00:00Z',
    });
    const { mantidas, descartadas } = semSobreposicao([tablet, video, outraHora, outraMaquina]);
    expect(mantidas.map((c) => c.id).sort()).toEqual(['m', 'o', 'v']);
    expect(descartadas.map((c) => c.id)).toEqual(['t']);
  });
});

describe('o relatorio', () => {
  // Rack: 2 medicoes; Mesa: 1. Tempos escolhidos para a conta a' mao.
  const rack1 = medicao({ id: 'r1', peca: '501083 · RACK FLIP 2.2', iniciado_em: '2026-11-10T10:00:00Z',
    marcas_ms: marcasDe(Array(10).fill(20)), marcas_relogio_ms: s(200 + 60),
    paradas: [{ motivo: 'outro', duracaoMs: s(40) }, { motivo: 'troca_plastico', duracaoMs: s(20) }] });
  const rack2 = medicao({ id: 'r2', peca: 'Rack Flip 2.2', iniciado_em: '2026-11-11T10:00:00Z',
    marcas_ms: marcasDe([...Array(10).fill(20), 100]), marcas_relogio_ms: s(300) });
  const mesa = medicao({ id: 'm1', peca: 'MESA SLEEP', iniciado_em: '2026-11-11T14:00:00Z',
    marcas_ms: marcasDe(Array(10).fill(9)), marcas_relogio_ms: s(90 + 10),
    paradas: [{ motivo: 'outro', duracaoMs: s(10) }] });
  const r = relatorioDePerdas([rack1, rack2, mesa]);

  it('junta o produto com e sem codigo e ordena pelo tempo sem produzir', () => {
    expect(r.porProduto.map((p) => p.produto)).toEqual(['RACK FLIP 2.2', 'MESA SLEEP']);
    const rack = r.porProduto[0];
    expect(rack.medicoes).toBe(2);
    // rack1: 60 s de parada; rack2: lacuna de 100 - 20 = 80 s.
    expect(rack.paradasMs).toBe(s(60));
    expect(rack.lacunasMs).toBe(s(80));
    expect(rack.semProduzirMs).toBe(s(140));
    // Ponderado pelo tempo: (260 + 300) / (10 + 11) intervalos.
    expect(rack.periodoMs).toBeCloseTo(s(560) / 21, 6);
    expect(rack.normalMs).toBe(s(20));
    expect(rack.volumesPerdidos).toBeCloseTo(7, 6);
  });
  it('o total e as paradas por motivo, com o quanto ficou sem motivo', () => {
    expect(r.total.medicoes).toBe(3);
    expect(r.total.semProduzirMs).toBe(s(150));
    expect(r.total.perdaPct).toBeCloseTo((100 * 150) / (260 + 300 + 100), 6);
    expect(r.porMotivo.map((m) => [m.motivo, m.ms / 1000, m.vezes])).toEqual([['outro', 50, 2], ['troca_plastico', 20, 1]]);
    expect(r.semDefinicaoPct).toBeCloseTo((100 * 50) / 70, 6);
  });
  it('sem medicao com marcas, sem total', () => {
    const vazio = relatorioDePerdas([medicao({ marcas_ms: null })]);
    expect(vazio.total).toBeNull();
    expect(vazio.semMarcas).toBe(1);
  });
});

describe('a hora extra da semana', () => {
  it('o programa no ritmo do periodo contra as horas da linha, e quanto disso sao as perdas', () => {
    // 9.050 volumes; 41,27 h por maquina; 18,7 s medidos, 14,1 s no normal.
    const h = horaExtraDaSemana({ demanda: 9050, horasPorMaquina: 41.27, periodoMs: 18700, normalMs: 14100 });
    expect(h.precisaPeriodo).toBeCloseTo(47.01, 2);
    expect(h.precisaNormal).toBeCloseTo(35.45, 2);
    expect(h.horaExtra).toBeCloseTo(5.74, 2);
    expect(h.horaExtraSemPerdas).toBe(0);
    expect(h.custoDasPerdas).toBeCloseTo(11.56, 2);
  });
  it('duas maquinas dividem o programa; sem programa ou sem horas, nada', () => {
    const h = horaExtraDaSemana({ demanda: 9000, horasPorMaquina: 40, maquinas: 2, periodoMs: 20000, normalMs: 15000 });
    expect(h.precisaPeriodo).toBeCloseTo(25, 6);
    expect(horaExtraDaSemana({ demanda: 0, horasPorMaquina: 40, periodoMs: 20000, normalMs: 15000 })).toBeNull();
    expect(horaExtraDaSemana({ demanda: 100, horasPorMaquina: null, periodoMs: 20000, normalMs: 15000 })).toBeNull();
  });
});

describe('revisao da v2.110.0', () => {
  it('SETUP PLANEJADO no trecho sai do relogio (ja saiu das horas da linha): 60.0 s, nao 75.4 s', () => {
    // 40 volumes a 60 s e 10 min de setup marcado entre eles.
    const marcas = marcasDe(Array(39).fill(60));
    const c = medicao({ marcas_ms: marcas, marcas_relogio_ms: s(39 * 60 + 600), marcas_setup_ms: s(600),
      paradas: [{ motivo: 'setup', duracaoMs: s(600) }] });
    const com = perdasDaMedicao(c, { descontarSetup: true });
    expect(com.relogioMs / com.intervalos).toBe(s(60));
    expect(com.setupMs).toBe(s(600));
    expect(com.paradasMs).toBe(0);
    // Sem setup planejado (grupo sem setup no cadastro), ele e' parada.
    const sem = perdasDaMedicao(c);
    expect(sem.relogioMs / sem.intervalos / 1000).toBeCloseTo(75.4, 1);
    expect(sem.paradasMs).toBe(s(600));
    const r = relatorioDePerdas([c], { descontarSetupDe: () => true });
    expect(r.total.periodoMs).toBe(s(60));
    expect(r.total.setupMs).toBe(s(600));
  });
  it('PARADA ANOTADA DEPOIS sai das lacunas e vai para as marcadas (o total nao muda)', () => {
    // 20 min de "falta de material" anotados no resultado: o cronometro nao
    // tirou nada das marcas, e o intervalo de 20 min ficou dentro delas.
    const marcas = marcasDe([...Array(6).fill(20), 1220, ...Array(6).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const c = medicao({ marcas_ms: marcas, marcas_relogio_ms: soma,
      paradas: [{ motivo: 'falta_material', duracaoMs: s(1200) }] });
    const p = perdasDaMedicao(c);
    expect(p.anotadasMs).toBe(s(1200));
    expect(p.lacunasMs).toBe(0);
    expect(p.paradasMs).toBe(s(1200));
    expect(p.intervalos * p.normalMs + p.lacunasMs + p.paradasMs).toBe(p.relogioMs);
  });
  it('a anotada depois maior que as lacunas so tira o que as lacunas tem', () => {
    const marcas = marcasDe([...Array(6).fill(20), 120, ...Array(6).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: soma,
      paradas: [{ motivo: 'outro', duracaoMs: s(300) }] }));
    expect(p.lacunasMs).toBe(0);
    expect(p.anotadasMs).toBe(s(100));
    expect(p.paradasMs).toBe(s(100));
  });
  it('MEDICAO SEM MARCAS nao ganha a disputa de sobreposicao e leva a boa junto', () => {
    const porHorario = medicao({ id: 'h', pecas: 300, marcas_ms: null,
      iniciado_em: '2026-11-12T12:00:00Z', finalizado_em: '2026-11-12T16:00:00Z' });
    const video = medicao({ id: 'v', marcas_ms: marcasDe(Array(12).fill(20)),
      iniciado_em: '2026-11-12T13:00:00Z', finalizado_em: '2026-11-12T13:10:00Z' });
    const r = relatorioDePerdas([porHorario, video]);
    expect(r.total.medicoes).toBe(1);
    expect(r.semMarcas).toBe(1);
    expect(r.sobrepostas).toBe(0);
  });
});
