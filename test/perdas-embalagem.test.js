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
  chaveDoProduto, horaExtraDaSemana, horaExtraDosGrupos, perdasDaMedicao, relatorioDePerdas, semSobreposicao,
  setupPlanejadoDoCadastro,
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
    // Fora da conta e' fora dos motivos tambem (revisao da v2.110.1): o
    // quadro dizia "12 min de paradas" com o cartao em 2 min.
    expect(r.porMotivo.find((m) => m.motivo === 'setup')).toBeUndefined();
    expect(r.totalMotivosMs).toBe(0);
    expect(r.setupForaMs).toBe(s(600));
    // Sem setup planejado, ele continua la'.
    expect(relatorioDePerdas([c]).porMotivo[0].motivo).toBe('setup');
  });
  it('PARADA ANOTADA DEPOIS sai das lacunas e vai para as marcadas (o total nao muda)', () => {
    // 20 min de "falta de material" anotados no resultado: o cronometro nao
    // tirou nada das marcas, e o intervalo de 20 min ficou dentro delas.
    const marcas = marcasDe([...Array(6).fill(20), 1220, ...Array(6).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    // Como no tablet: o 1o volume sai 20 s (um volume) depois da largada.
    const c = medicao({ marcas_ms: marcas, marcas_relogio_ms: soma, duracao_ms: soma + s(20),
      paradas: [{ motivo: 'falta_material', duracaoMs: s(1200) }] });
    const p = perdasDaMedicao(c);
    expect(p.anotadasMs).toBe(s(1200));
    expect(p.lacunasMs).toBe(0);
    // A lacuna que a anotada cobriu inteira nao conta mais como lacuna.
    expect(p.nLacunas).toBe(0);
    expect(p.paradasMs).toBe(s(1200));
    expect(p.intervalos * p.normalMs + p.lacunasMs + p.paradasMs).toBe(p.relogioMs);
  });
  it('a anotada depois maior que as lacunas so tira o que as lacunas tem', () => {
    const marcas = marcasDe([...Array(6).fill(20), 120, ...Array(6).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: soma, duracao_ms: soma,
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

describe('revisao da v2.110.1', () => {
  const min = 60000;
  // 61 volumes a 60 s, com UMA lacuna de 9 min que ninguem marcou (8 min de
  // excesso sobre o normal).
  const comLacuna = marcasDe([...Array(30).fill(60), 540, ...Array(30).fill(60)]);
  const somaLacuna = comLacuna[comLacuna.length - 1] - comLacuna[0];

  it('PARADA ANTES DO 1o VOLUME nao vira "anotada depois": a lacuna continua lacuna', () => {
    // 15 min de falta de material entre a largada e o 1o volume (fora dos
    // toques, fora do relogio do trecho).
    const p = perdasDaMedicao(medicao({ marcas_ms: comLacuna, marcas_relogio_ms: somaLacuna,
      duracao_ms: somaLacuna + 16 * min, paradas: [{ motivo: 'falta_material', duracaoMs: 15 * min }] }));
    expect(p.anotadasMs).toBe(0);
    expect(p.lacunasMs).toBe(8 * min);
    expect(p.nLacunas).toBe(1);
    expect(p.paradasMs).toBe(0);
  });
  it('a anotada depois de verdade (sem folga fora dos toques) ainda sai da lacuna', () => {
    const p = perdasDaMedicao(medicao({ marcas_ms: comLacuna, marcas_relogio_ms: somaLacuna,
      duracao_ms: somaLacuna, paradas: [{ motivo: 'falta_material', duracaoMs: 9 * min }] }));
    expect(p.anotadasMs).toBe(8 * min);
    expect(p.lacunasMs).toBe(0);
  });
  it('o ARREDONDAMENTO DA LISTA (minutos com 2 casas) nao inventa parada anotada', () => {
    // Paradas ao vivo de 45.4 s e 61.7 s (o relogio tirou 107.1 s), gravadas
    // como 45.6 s e 61.8 s: 0.3 s a mais na lista.
    const rel = somaLacuna + 107100;
    const p = perdasDaMedicao(medicao({ marcas_ms: comLacuna, marcas_relogio_ms: rel, duracao_ms: rel,
      paradas: [{ motivo: 'outro', duracaoMs: 45600 }, { motivo: 'outro', duracaoMs: 61800 }] }));
    expect(p.anotadasMs).toBe(0);
    expect(p.lacunasMs).toBe(8 * min);
    expect(p.paradasMs).toBe(107100);
  });
  it('a MESMA MAQUINA com acento e espaco diferentes e' + "' o mesmo trecho (a chave da API)", () => {
    const video = medicao({ id: 'v', maquina: 'Embalagem Rápida 01', marcas_ms: marcasDe(Array(10).fill(20)),
      iniciado_em: '2026-11-12T13:00:00Z', finalizado_em: '2026-11-12T13:10:00Z' });
    const tablet = medicao({ id: 't', maquina: 'EMBALAGEM RAPIDA  01', marcas_ms: marcasDe(Array(5).fill(20)),
      iniciado_em: '2026-11-12T13:02:00Z', finalizado_em: '2026-11-12T13:05:00Z' });
    const r = relatorioDePerdas([video, tablet]);
    expect(r.total.medicoes).toBe(1);
    expect(r.total.volumes).toBe(11);
    expect(r.sobrepostas).toBe(1);
  });

  describe('a hora extra de cada grupo', () => {
    const agora = Date.parse('2026-11-11T12:00:00Z'); // quarta; a semana comeca em 09/11
    const programa = (pecas) => [{ ano: 2026, numero: 46, pecas, inicio: '2026-11-09', atualizado_em: '2026-11-09T08:00:00Z' }];
    const grupo = (id, nome, over = {}) => ({
      id, nome, horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5, ...over,
    });
    // 40 volumes a 60 s com 10 min de setup marcado no trecho.
    const comSetup = (id, maquina) => medicao({ id, maquina, marcas_ms: marcasDe(Array(39).fill(60)),
      marcas_relogio_ms: s(39 * 60 + 600), marcas_setup_ms: s(600), duracao_ms: s(39 * 60 + 600),
      paradas: [{ motivo: 'setup', duracaoMs: s(600) }] });

    it('CADA GRUPO NO RITMO DELE: a linha lenta nao empresta o ritmo para a rapida', () => {
      const lenta = { grupo: grupo('a', 'EMB A'), ativas: 1, demandas: programa(2640),
        medicoes: [medicao({ id: 'a1', maquina: 'EMB A 01', marcas_ms: marcasDe(Array(20).fill(60)) })] };
      const rapida = { grupo: grupo('b', 'EMB B'), ativas: 1, demandas: programa(2640),
        medicoes: [medicao({ id: 'b1', maquina: 'EMB B 01', marcas_ms: marcasDe(Array(20).fill(30)) })] };
      const { colunas } = horaExtraDosGrupos([lenta, rapida], { agora });
      const esta = colunas.filter((c) => c.chave.endsWith('-0'));
      expect(esta.map((c) => c.rotulo)).toEqual(['EMB A · Esta semana (de 09/11)', 'EMB B · Esta semana (de 09/11)']);
      expect(esta[0].periodoMs).toBe(s(60));
      expect(esta[0].conta.precisaPeriodo).toBeCloseTo(44, 6);
      expect(esta[1].periodoMs).toBe(s(30));
      expect(esta[1].conta.precisaPeriodo).toBeCloseTo(22, 6);
    });
    it('SETUP NO CADASTRO: sai das horas E das medicoes — 2.5 h de hora extra, nao 13.8 h', () => {
      const g = { grupo: grupo('a', 'EMB A', { setups_dia: 1, setup_min: '30' }), ativas: 1, demandas: programa(2640),
        medicoes: [comSetup('a1', 'EMB A 01')] };
      expect(setupPlanejadoDoCadastro(g.grupo)).toBe(true);
      const [c] = horaExtraDosGrupos([g], { agora }).colunas;
      expect(c.periodoMs).toBe(s(60));
      expect(c.conta.horasDisponiveis).toBeCloseTo(41.5, 6);
      expect(c.conta.horaExtra).toBeCloseTo(2.5, 6);
    });
    it('SEM SETUP NO CADASTRO: o setup e perda nas medicoes, e as horas sao a jornada (11.3 h, nao nenhuma)', () => {
      const g = { grupo: grupo('a', 'EMB A'), ativas: 1, demandas: programa(2640), medicoes: [comSetup('a1', 'EMB A 01')] };
      expect(setupPlanejadoDoCadastro(g.grupo)).toBe(false);
      const [c] = horaExtraDosGrupos([g], { agora }).colunas;
      expect(c.periodoMs / 1000).toBeCloseTo(75.4, 1);
      expect(c.conta.horasDisponiveis).toBe(44);
      expect(c.conta.horaExtra).toBeCloseTo(11.3, 1);
    });
    it('a semana sem conta diz por que, sem o codigo do PCP e sem "esta semana" na proxima', () => {
      const g = { grupo: grupo('a', 'EMB A'), ativas: 1, demandas: programa(2640),
        medicoes: [medicao({ id: 'a1', maquina: 'EMB A 01', marcas_ms: marcasDe(Array(20).fill(60)) })] };
      const { colunas, avisos } = horaExtraDosGrupos([g], { agora });
      expect(colunas).toHaveLength(1);
      expect(avisos).toEqual(['Próxima semana: o programa do grupo não cobre a semana.']);
      const semPrograma = horaExtraDosGrupos([{ ...g, demandas: [] }], { agora });
      expect(semPrograma.avisos).toEqual([
      'Esta semana: não há programa de produção do grupo cadastrado.',
      'Próxima semana: não há programa de produção do grupo cadastrado.',
    ]);
      const foraDoAr = horaExtraDosGrupos([{ ...g, erroPrograma: 'HTTP 500' }], { agora });
      expect(foraDoAr.avisos).toEqual(['não deu para ler o programa da semana (HTTP 500).']);
    });
  });
});

describe('revisao da v2.110.2', () => {
  const min = 60000;
  it('TABLET COM ANOTACAO: o volume da largada nao e' + "' folga fora dos toques", () => {
    // 1o volume 20 s apos a largada (o volume, nao uma parada) e 20 min de
    // falta de material anotados depois: tudo sai da lacuna.
    const marcas = marcasDe([...Array(10).fill(20), 1220, ...Array(10).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: soma, duracao_ms: soma + s(20),
      paradas: [{ motivo: 'falta_material', duracaoMs: 20 * min }] }));
    expect(p.anotadasMs).toBe(20 * min);
    expect(p.lacunasMs).toBe(0);
    expect(p.nLacunas).toBe(0);
  });
  it('o Encerrar uns segundos depois do ultimo volume nao deixa "1 lacuna" de sobra', () => {
    const marcas = marcasDe([...Array(10).fill(20), 1220, ...Array(10).fill(20)]);
    const soma = marcas[marcas.length - 1] - marcas[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: marcas, marcas_relogio_ms: soma, duracao_ms: soma + s(25),
      paradas: [{ motivo: 'falta_material', duracaoMs: 20 * min }] }));
    expect(p.anotadasMs).toBe(20 * min);
    expect(p.lacunasMs).toBe(0);
    expect(p.nLacunas).toBe(0);
  });
  it('parada ao vivo ANTES do 1o volume, com o volume saindo rapido, nao inventa anotada', () => {
    // 15 min de falta de material ao vivo; o 1o volume sai 30 s depois
    // (o normal e' 60 s): a conta fora dos toques fica 30 s curta.
    const comLacuna = marcasDe([...Array(30).fill(60), 540, ...Array(30).fill(60)]);
    const soma = comLacuna[comLacuna.length - 1] - comLacuna[0];
    const p = perdasDaMedicao(medicao({ marcas_ms: comLacuna, marcas_relogio_ms: soma, duracao_ms: soma + 15 * min + s(30),
      paradas: [{ motivo: 'falta_material', duracaoMs: 15 * min }] }));
    expect(p.anotadasMs).toBe(0);
    expect(p.lacunasMs).toBe(8 * min);
    expect(p.nLacunas).toBe(1);
  });
  it('SO O SETUP QUE SAIU DA CONTA sai do quadro dos motivos', () => {
    const marcas = marcasDe(Array(39).fill(60));
    const soma = marcas[marcas.length - 1] - marcas[0];
    // 20 min de setup ao vivo ANTES do 1o volume: fora do trecho, nao saiu
    // de conta nenhuma — continua no quadro.
    const antes = medicao({ id: 'a', marcas_ms: marcas, marcas_relogio_ms: soma, marcas_setup_ms: 0,
      duracao_ms: soma + 20 * min + s(60), paradas: [{ motivo: 'setup', duracaoMs: 20 * min }] });
    const ra = relatorioDePerdas([antes], { descontarSetupDe: () => true });
    expect(ra.total.setupMs).toBe(0);
    expect(ra.setupForaMs).toBe(0);
    expect(ra.porMotivo).toEqual([{ motivo: 'setup', ms: 20 * min, vezes: 1, pct: 100 }]);
    // 1 min de setup ao vivo no trecho e a mesma troca anotada depois com 12
    // min: so' o 1 min saiu do relogio; os outros 11 min estao nas paradas
    // do cartao e ficam no quadro tambem.
    const anotado = medicao({ id: 'b', marcas_ms: marcas, marcas_relogio_ms: soma + min, marcas_setup_ms: min,
      duracao_ms: soma + min + s(60), paradas: [{ motivo: 'setup', duracaoMs: 12 * min }] });
    const rb = relatorioDePerdas([anotado], { descontarSetupDe: () => true });
    expect(rb.total.setupMs).toBe(min);
    expect(rb.setupForaMs).toBe(min);
    expect(rb.porMotivo[0].ms).toBe(11 * min);
    expect(rb.totalMotivosMs).toBe(11 * min);
  });

  describe('a regua do setup e' + "' a do takt", () => {
    const agora = Date.parse('2026-11-11T12:00:00Z');
    const programa = (pecas) => [{ ano: 2026, numero: 46, pecas, inicio: '2026-11-09', atualizado_em: '2026-11-09T08:00:00Z' }];
    const comSetup = medicao({ id: 'a1', maquina: 'EMB A 01', marcas_ms: marcasDe(Array(39).fill(60)),
      marcas_relogio_ms: s(39 * 60 + 600), marcas_setup_ms: s(600), duracao_ms: s(39 * 60 + 660),
      paradas: [{ motivo: 'setup', duracaoMs: s(600) }] });

    it('SEM OS DIAS DA SEMANA no cadastro, o takt nao tira o setup das horas — e o resumo nao tira das medicoes', () => {
      const g = { id: 'a', nome: 'EMB A', horas_semana: '44.00', setups_dia: 1, setup_min: '30', dias_semana: null };
      expect(setupPlanejadoDoCadastro(g)).toBe(false);
      const resumo = relatorioDePerdas([comSetup], { descontarSetupDe: () => setupPlanejadoDoCadastro(g) }).total;
      const [c] = horaExtraDosGrupos([{ grupo: g, ativas: 1, demandas: programa(2640), medicoes: [comSetup] }], { agora }).colunas;
      // O MESMO "por volume no periodo" no resumo e na hora extra.
      expect(resumo.periodoMs).toBe(c.periodoMs);
      expect(c.conta.horasDisponiveis).toBe(44);
      expect(c.periodoMs / 1000).toBeCloseTo(75.4, 1);
    });
    it('com os dias, os dois tiram: o resumo e a hora extra no mesmo ritmo', () => {
      const g = { id: 'a', nome: 'EMB A', horas_semana: '44.00', setups_dia: 1, setup_min: '30', dias_semana: 5 };
      expect(setupPlanejadoDoCadastro(g)).toBe(true);
      const resumo = relatorioDePerdas([comSetup], { descontarSetupDe: () => setupPlanejadoDoCadastro(g) }).total;
      const [c] = horaExtraDosGrupos([{ grupo: g, ativas: 1, demandas: programa(2640), medicoes: [comSetup] }], { agora }).colunas;
      expect(resumo.periodoMs).toBe(c.periodoMs);
      expect(c.periodoMs).toBe(s(60));
    });
    it('SEMANA COM ZERO VOLUMES para o grupo diz por que nao ha conta', () => {
      const g = { id: 'a', nome: 'EMB A', horas_semana: '44.00', setups_dia: 0, setup_min: '0', dias_semana: 5 };
      const { colunas, avisos } = horaExtraDosGrupos([{ grupo: g, ativas: 1, demandas: programa(0), medicoes: [comSetup] }], { agora });
      expect(colunas).toHaveLength(0);
      expect(avisos[0]).toBe('Esta semana (de 09/11): o programa da semana não tem volumes para o grupo.');
    });
  });
});
