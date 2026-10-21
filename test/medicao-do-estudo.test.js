/**
 * A medicao real da linha na analise do estudo: quais medicoes entram
 * (mesmo posto, mesmo produto, nao arquivadas, ultimos 30 dias), as duas
 * reguas (relogio e rodando), a conversao de volume para produto na
 * embalagem e o criterio de amostra do relatorio. Numeros feitos na mao.
 */
import { describe, expect, it } from 'vitest';
import { TETO_LISTA_CONFERENCIAS, medicaoDoEstudo, unidadeDoEstudo } from '../src/domain/medicaoDoEstudo.js';
import { unidadeDoPosto } from '../src/domain/cronoanalise.js';

const AGORA = Date.parse('2026-10-20T12:00:00Z');
const MIN = 60000;
const PECA = unidadeDoPosto('FURADEIRAS');
const VOLUME = unidadeDoPosto('EMBALAGEM');

const med = (extra) => ({
  maquina: 'FURADEIRA 03', peca: 'Painel MDF 18mm', duracao_ms: 20 * MIN, pecas: 60,
  paradas: [], arquivada: false, iniciado_em: '2026-10-10T10:00:00Z', ...extra,
});

// Tres medicoes de 20 min do posto e do produto, grafadas de tres jeitos:
// 60 + 66 + 54 = 180 pecas em 60 min de relogio; 5 min de setup na segunda.
const DO_ESTUDO = [
  med({ id: 'c1' }),
  med({
    id: 'c2', maquina: 'furadeira 03 ', peca: 'PAINEL MDF 18MM', pecas: 66,
    iniciado_em: '2026-10-12T10:00:00Z', paradas: [{ motivo: 'setup', duracaoMs: 5 * MIN }],
  }),
  med({ id: 'c3', maquina: 'Furadeira  03', peca: 'painel mdf 18mm', pecas: 54, iniciado_em: '2026-10-15T10:00:00Z' }),
];
const FORA = [
  med({ id: 'arq', pecas: 999, arquivada: true }),
  med({ id: 'velha', pecas: 999, iniciado_em: '2026-09-01T10:00:00Z' }),
  med({ id: 'outro-produto', peca: 'Lateral Sleep', pecas: 999 }),
  med({ id: 'outra-maquina', maquina: 'Furadeira 04', pecas: 999 }),
];

const base = { recurso: 'Furadeira 03', produto: 'Painel MDF 18mm', unidade: PECA, agora: AGORA };

describe('medicaoDoEstudo — quais medicoes entram', () => {
  const m = medicaoDoEstudo({ ...base, conferencias: [...DO_ESTUDO, ...FORA] });

  it('so o mesmo posto e o mesmo produto, por nomeChave, nao arquivadas e dos ultimos 30 dias', () => {
    expect(m.n).toBe(3);
    expect(m.contadas).toBe(180);
    expect(m.desde).toBe(Date.parse('2026-10-10T10:00:00Z'));
    expect(m.ate).toBe(Date.parse('2026-10-15T10:00:00Z'));
    // O que ficou de fora e ajuda a explicar um vazio.
    expect(m.outrosProdutos).toBe(1);
    expect(m.antigas).toBe(1);
  });

  it('relogio com as paradas dentro; rodando sem elas — ponderados pelo tempo', () => {
    // 180 pecas em 60 min de relogio = 180/h.
    expect(m.ritmoRelogio).toBeCloseTo(180, 6);
    // 180 pecas em 55 min rodando = 196,36/h.
    expect(m.ritmoRodando).toBeCloseTo(196.3636, 3);
    expect(m.totalMs).toBe(60 * MIN);
    expect(m.produtivoMs).toBe(55 * MIN);
    expect(m.paradaMs).toBe(5 * MIN);
  });

  it('na furadeira a unidade e a peca do estudo: entra sem conversao', () => {
    expect(m.unidade).toBe('peça');
    expect(m.contada).toBe('peça');
    expect(m.convertido).toBe(false);
    expect(m.volumes).toBeNull();
    expect(m.suficiente).toBe(true);
    expect(m.motivo).toBeNull();
    expect(m.usavel).toBe(true);
  });

  it('a medicao dos 30 dias conta a partir de AGORA', () => {
    // 21 dias depois, a primeira (10/10) sai da janela.
    const depois = medicaoDoEstudo({ ...base, conferencias: DO_ESTUDO, agora: Date.parse('2026-11-10T11:00:00Z') });
    expect(depois.n).toBe(2);
    expect(depois.antigas).toBe(1);
    expect(medicaoDoEstudo({ ...base, conferencias: DO_ESTUDO, agora: new Date(AGORA) }).n).toBe(3);
  });

  it('sem iniciado_em vale o salvo_em, como no relatorio', () => {
    const salvas = [med({ iniciado_em: null, salvo_em: '2026-08-01T10:00:00Z' }), ...DO_ESTUDO];
    const r = medicaoDoEstudo({ ...base, conferencias: salvas });
    expect(r.n).toBe(3);
    expect(r.antigas).toBe(1);
  });
});

describe('medicaoDoEstudo — embalagem: volume para produto', () => {
  // 16 + 14 + 16 = 46 volumes em 60 min = 46 vol/h; rack de 2 volumes = 23 produtos/h.
  const embalagem = [16, 14, 16].map((pecas, i) => med({
    maquina: 'EMBALAGEM 01', peca: 'Rack Sirius 1.6', pecas, iniciado_em: `2026-10-1${i}T10:00:00Z`,
  }));
  const daEmbalagem = { conferencias: embalagem, recurso: 'embalagem 01', produto: 'RACK SIRIUS 1.6', unidade: VOLUME, agora: AGORA };

  it('com os volumes do produto, converte para PRODUTOS dividindo pelos volumes', () => {
    const m = medicaoDoEstudo({ ...daEmbalagem, volumes: 2 });
    expect(m.contada).toBe('volume');
    expect(m.unidade).toBe('produto');
    expect(m.convertido).toBe(true);
    expect(m.volumes).toBe(2);
    expect(m.ritmoRelogioContado).toBeCloseTo(46, 6);
    expect(m.ritmoRelogio).toBeCloseTo(23, 6);
    expect(m.ritmoRodando).toBeCloseTo(23, 6);
    expect(m.usavel).toBe(true);
  });

  it('sem volumes informados NAO converte: devolve volumes/h e pede o cadastro', () => {
    for (const volumes of [null, undefined, 0, '']) {
      const m = medicaoDoEstudo({ ...daEmbalagem, volumes });
      expect(m.unidade).toBe('volume');
      expect(m.convertido).toBe(false);
      expect(m.volumes).toBeNull();
      // O numero continua la' — em volumes, nunca como se fosse produto.
      expect(m.ritmoRelogio).toBeCloseTo(46, 6);
      expect(m.motivo).toBe('sem-volumes');
      expect(m.usavel).toBe(false);
    }
  });

  it('produto de 1 volume: o mesmo numero, agora em produtos', () => {
    const m = medicaoDoEstudo({ ...daEmbalagem, volumes: 1 });
    expect(m.unidade).toBe('produto');
    expect(m.ritmoRelogio).toBeCloseTo(46, 6);
  });
});

describe('medicaoDoEstudo — amostra', () => {
  it('menos de 3 medicoes: o numero sai, com o motivo, e nao e usavel', () => {
    const m = medicaoDoEstudo({ ...base, conferencias: DO_ESTUDO.slice(0, 2) });
    expect(m.n).toBe(2);
    expect(m.ritmoRelogio).toBeCloseTo(126 * 60 / 40, 6);
    expect(m.suficiente).toBe(false);
    expect(m.motivo).toBe('amostra-insuficiente');
    expect(m.usavel).toBe(false);
    expect(m.faltas).toEqual({ medicoes: true, tempo: false, curtas: 0 });
    expect(m.motivosAmostra.length).toBeGreaterThan(0);
  });

  it('menos de 30 min rodando, ou medicao com menos de 5 min, tambem nao sustenta', () => {
    const curtas = [8, 8, 8].map((min, i) => med({ duracao_ms: min * MIN, pecas: 20, iniciado_em: `2026-10-1${i}T10:00:00Z` }));
    const r1 = medicaoDoEstudo({ ...base, conferencias: curtas });
    expect(r1.faltas.tempo).toBe(true);
    expect(r1.usavel).toBe(false);

    const umaRajada = [...DO_ESTUDO, med({ duracao_ms: 4 * MIN, pecas: 30, iniciado_em: '2026-10-16T10:00:00Z' })];
    const r2 = medicaoDoEstudo({ ...base, conferencias: umaRajada });
    expect(r2.faltas.curtas).toBe(1);
    expect(r2.motivo).toBe('amostra-insuficiente');
  });

  it('embalagem sem volumes E amostra curta: o motivo e o cadastro, e a amostra fica registrada', () => {
    const m = medicaoDoEstudo({
      conferencias: [med({ maquina: 'EMBALAGEM 01', peca: 'Rack' })],
      recurso: 'EMBALAGEM 01', produto: 'Rack', unidade: VOLUME, volumes: null, agora: AGORA,
    });
    expect(m.motivo).toBe('sem-volumes');
    expect(m.suficiente).toBe(false);
  });
});

describe('medicaoDoEstudo — sem o que medir', () => {
  it('sem posto, sem produto e sem medicao dizem o motivo, com o mesmo formato', () => {
    const semPosto = medicaoDoEstudo({ ...base, recurso: '  ', conferencias: DO_ESTUDO });
    const semProduto = medicaoDoEstudo({ ...base, produto: null, conferencias: DO_ESTUDO });
    const semMedicao = medicaoDoEstudo({ ...base, conferencias: FORA });
    expect(semPosto.motivo).toBe('sem-posto');
    expect(semProduto.motivo).toBe('sem-produto');
    expect(semMedicao.motivo).toBe('sem-medicao');
    for (const m of [semPosto, semProduto, semMedicao]) {
      expect(m.usavel).toBe(false);
      expect(m.n).toBe(0);
      expect(m.ritmoRelogio).toBeNull();
      expect(m.ritmoRodando).toBeNull();
    }
    // O vazio de medicao diz o que existe por perto.
    expect(semMedicao.outrosProdutos).toBe(1);
    expect(semMedicao.antigas).toBe(1);
  });

  it('lista ausente ou fora do formato (resposta sem conferencias) nao quebra', () => {
    expect(medicaoDoEstudo({ ...base, conferencias: undefined }).motivo).toBe('sem-medicao');
    expect(medicaoDoEstudo({ ...base, conferencias: { estudo: {} } }).motivo).toBe('sem-medicao');
    expect(medicaoDoEstudo({ ...base, conferencias: [null, med({ duracao_ms: 0 })] }).motivo).toBe('sem-medicao');
    expect(medicaoDoEstudo().motivo).toBe('sem-posto');
  });
});

describe('medicaoDoEstudo — o setup entra UMA vez so, pela origem do takt', () => {
  /* Tres medicoes de 60 min, cada uma com 10 min de setup marcado e 100
     pecas: 300 em 180 min de relogio (100/h), 300 em 150 min sem o setup
     marcado (120/h). O grupo planeja 2 trocas de 20 min por dia, 5 dias
     (3,33 h na semana); com 44 h de jornada, a fatia do setup e' 7,58%. */
  const comSetup = [0, 1, 2].map((i) => med({
    id: `s${i}`, duracao_ms: 60 * MIN, pecas: 100, iniciado_em: `2026-10-1${i}T10:00:00Z`,
    paradas: [{ motivo: 'setup', duracaoMs: 10 * MIN }],
  }));
  const planejado = { setupsDia: 2, dias: 5, minutos: 20, horasSemana: 44 };
  const fatia = (2 * 5 * 20) / 60 / 44;

  it('takt do programa: o setup marcado sai do relogio (o programa ja descontou o planejado)', () => {
    const m = medicaoDoEstudo({ ...base, conferencias: comSetup, setup: planejado, taktOrigem: 'programa' });
    expect(m.regraSetup).toBe('sem-setup');
    expect(m.ritmo).toBeCloseTo(120, 6);
    // As reguas cruas continuam la', para a tela mostrar a conta.
    expect(m.ritmoRelogio).toBeCloseTo(100, 6);
    expect(m.ritmoSemSetup).toBeCloseTo(120, 6);
    expect(m.setupMedidoMs).toBe(30 * MIN);
    expect(m.relogioMs).toBe(180 * MIN);
    expect(m.ritmoRodando).toBeCloseTo(120, 6);
    expect(m.usavel).toBe(true);
  });

  it('takt do programa nao precisa das horas da semana: so tira o marcado', () => {
    const { horasSemana, ...semHoras } = planejado;
    expect(horasSemana).toBe(44);
    const m = medicaoDoEstudo({ ...base, conferencias: comSetup, setup: semHoras, taktOrigem: 'programa' });
    expect(m.regraSetup).toBe('sem-setup');
    expect(m.ritmo).toBeCloseTo(120, 6);
  });

  it('takt digitado: rodando sem o setup marcado, menos a fatia do setup planejado', () => {
    const m = medicaoDoEstudo({ ...base, conferencias: comSetup, setup: planejado, taktOrigem: 'manual' });
    expect(m.regraSetup).toBe('fatia');
    expect(m.fatiaSetup).toBeCloseTo(fatia, 9);
    // 120 x (1 - 7,58%) = 110,9/h: o setup pesa o que o plano diz, nao os
    // 17% que a amostra pegou (10 min em cada hora medida).
    expect(m.ritmo).toBeCloseTo(120 * (1 - fatia), 6);
    expect(m.ritmo).toBeLessThan(120);
    expect(m.ritmo).toBeGreaterThan(100);
  });

  it('sem origem (estudo antigo, ou valor estranho): tratado como digitado', () => {
    for (const taktOrigem of [null, undefined, '', 'outra']) {
      const m = medicaoDoEstudo({ ...base, conferencias: comSetup, setup: planejado, taktOrigem });
      expect(m.taktOrigem).toBeNull();
      expect(m.regraSetup).toBe('fatia');
      expect(m.ritmo).toBeCloseTo(120 * (1 - fatia), 6);
    }
  });

  it('digitado sem as horas da semana do grupo: sem fatia, o setup marcado fica no relogio', () => {
    for (const horasSemana of [undefined, null, '', 0, 3]) {
      const m = medicaoDoEstudo({
        ...base, conferencias: comSetup, setup: { ...planejado, horasSemana }, taktOrigem: 'manual',
      });
      expect(m.regraSetup).toBe('relogio');
      expect(m.fatiaSetup).toBeNull();
      expect(m.ritmo).toBeCloseTo(100, 6);
    }
  });

  it('digitado sem setup marcado nas medicoes: o plano entra do mesmo jeito', () => {
    const semMarca = comSetup.map((c) => ({ ...c, paradas: [] }));
    const m = medicaoDoEstudo({ ...base, conferencias: semMarca, setup: planejado, taktOrigem: 'manual' });
    expect(m.setupMedidoMs).toBe(0);
    expect(m.ritmo).toBeCloseTo(100 * (1 - fatia), 6);
  });

  it('sem setup planejado (nao informado ou zero): o setup e uma parada como as outras, fica no relogio', () => {
    for (const setup of [null, undefined, {}, { setupsDia: 0 }, { minutos: 0 }, { setupsDia: 2, dias: 5 }]) {
      for (const taktOrigem of ['programa', 'manual', null]) {
        const m = medicaoDoEstudo({ ...base, conferencias: comSetup, setup, taktOrigem });
        expect(m.regraSetup).toBe('relogio');
        expect(m.ritmo).toBeCloseTo(100, 6);
        expect(m.ritmoRelogio).toBeCloseTo(100, 6);
        expect(m.relogioMs).toBe(180 * MIN);
      }
    }
  });

  it('so o setup MARCADO sai: as outras paradas continuam no relogio', () => {
    const misto = comSetup.map((c) => ({
      ...c, paradas: [...c.paradas, { motivo: 'falta_material', duracaoMs: 5 * MIN }],
    }));
    const m = medicaoDoEstudo({ ...base, conferencias: misto, setup: planejado, taktOrigem: 'programa' });
    // Sem o setup: 300 em 150 min = 120/h — os 15 min de falta de material ficam.
    expect(m.ritmo).toBeCloseTo(120, 6);
    expect(m.ritmoRelogio).toBeCloseTo(100, 6);
    // Rodando: 300 em (180 - 45) min.
    expect(m.ritmoRodando).toBeCloseTo((300 * 60) / 135, 6);
  });

  it('na embalagem, converte para produto pela mesma regra', () => {
    const vol = comSetup.map((c) => ({ ...c, maquina: 'EMBALAGEM 01', peca: 'Rack', pecas: 40 }));
    const comum = {
      conferencias: vol, recurso: 'EMBALAGEM 01', produto: 'Rack', unidade: VOLUME, volumes: 2,
      setup: planejado, agora: AGORA,
    };
    // 120 volumes em 180 min = 40 vol/h = 20 produtos/h; sem o setup
    // marcado, 120 em 150 min = 48 vol/h = 24 produtos/h.
    const prog = medicaoDoEstudo({ ...comum, taktOrigem: 'programa' });
    expect(prog.ritmoContado).toBeCloseTo(48, 6);
    expect(prog.ritmo).toBeCloseTo(24, 6);
    expect(prog.ritmoRelogioContado).toBeCloseTo(40, 6);
    expect(prog.ritmoRelogio).toBeCloseTo(20, 6);
    const dig = medicaoDoEstudo({ ...comum, taktOrigem: 'manual' });
    expect(dig.ritmo).toBeCloseTo(24 * (1 - fatia), 6);
  });
});

describe('medicaoDoEstudo — arquivadas e teto da lista', () => {
  const arquivadasDoEstudo = DO_ESTUDO.map((c) => ({ ...c, arquivada: true }));

  it('sem medicao ativa e com arquivadas do posto e produto: conta as da janela', () => {
    const m = medicaoDoEstudo({
      ...base,
      conferencias: [],
      arquivadas: [...arquivadasDoEstudo, med({ arquivada: true, peca: 'Lateral Sleep' }),
        med({ arquivada: true, iniciado_em: '2026-08-01T10:00:00Z' })],
    });
    expect(m.motivo).toBe('sem-medicao');
    // As tres do estudo; a de outro produto e a velha ficam de fora.
    expect(m.arquivadas).toBe(3);
  });

  it('lista das arquivadas que nao veio: nao se sabe (null), nao e zero', () => {
    expect(medicaoDoEstudo({ ...base, conferencias: [] }).arquivadas).toBeNull();
    expect(medicaoDoEstudo({ ...base, conferencias: [], arquivadas: [] }).arquivadas).toBe(0);
  });

  it('lista do servidor no teto (1000): avisa que medicao antiga pode ter ficado de fora', () => {
    const outras = Array.from({ length: TETO_LISTA_CONFERENCIAS - 3 }, (_, i) => med({ id: `o${i}`, maquina: 'FURADEIRA 09' }));
    const cheia = medicaoDoEstudo({ ...base, conferencias: [...DO_ESTUDO, ...outras] });
    expect(cheia.noTeto).toBe(true);
    expect(cheia.n).toBe(3);
    const vazia = medicaoDoEstudo({ ...base, conferencias: [...outras, med({ maquina: 'FURADEIRA 09' }), med({ maquina: 'FURADEIRA 09' }), med({ maquina: 'FURADEIRA 09' })] });
    expect(vazia.motivo).toBe('sem-medicao');
    expect(vazia.noTeto).toBe(true);
    expect(medicaoDoEstudo({ ...base, conferencias: DO_ESTUDO }).noTeto).toBe(false);
  });
});

describe('unidadeDoEstudo', () => {
  it('embalagem mede o PRODUTO; qualquer outro grupo, ou nenhum, a peca', () => {
    expect(unidadeDoEstudo('EMBALAGEM')).toBe('produto');
    expect(unidadeDoEstudo('Embalagem linha 2')).toBe('produto');
    expect(unidadeDoEstudo('FURADEIRAS')).toBe('peça');
    expect(unidadeDoEstudo(null)).toBe('peça');
    expect(unidadeDoEstudo(undefined)).toBe('peça');
  });
});
