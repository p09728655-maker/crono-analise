/**
 * A capacidade e o medido em palavras: o que a tela, a Folha e o Resumo
 * escrevem. O que mais importa aqui e' nao se desmentir — "100%" ao lado
 * de "abaixo do ritmo", "a linha atende" sem medicao que confirme, ou
 * "nenhuma medicao" com tres guardadas no banco.
 */
import { describe, expect, it } from 'vitest';
import {
  capDaOperacao, diferencaExibida, exibirDiferenca, exibirPct, exibirPorHora, lerMedido, porHora,
  porHoraExtenso, porMinuto, porUnidade, vereditoCapacidade,
} from '../src/features/analise/estudo/textosMedicao.js';
import { comparativoCapacidade, unidadeDoPosto } from '../src/domain/cronoanalise.js';
import { medicaoDoEstudo } from '../src/domain/medicaoDoEstudo.js';

const AGORA = Date.parse('2026-10-20T12:00:00Z');
const MIN = 60000;
const med = (extra) => ({
  maquina: 'FURADEIRA 03', peca: 'Painel', duracao_ms: 60 * MIN, pecas: 100,
  paradas: [], arquivada: false, iniciado_em: '2026-10-10T10:00:00Z', ...extra,
});
const base = { recurso: 'FURADEIRA 03', produto: 'Painel', unidade: unidadeDoPosto('FURADEIRAS'), agora: AGORA };
const pronto = (medicao, extra = {}) => ({ estado: 'pronto', medicao, postoNoCadastro: true, ...extra });

describe('exibir — arredondar so para mostrar', () => {
  it('taxa por hora: para baixo, uma casa abaixo de 100/h, sem o erro do ponto flutuante', () => {
    expect(exibirPorHora(3600000 / 144000)).toBe('25');
    // Na embalagem (~25/h) cada unidade vale 4%: a casa decimal aparece.
    expect(exibirPorHora(24.6575)).toBe('24,6');
    expect(exibirPorHora(222.9)).toBe('222');
    expect(exibirPorHora(null)).toBe('—');
  });

  it('deficit escrito e derivado dos dois numeros escritos: a conta fecha', () => {
    const c = { base: 'medido', medido: 24.3, real: 30, esperado: 3600 / 146, diferenca: 24.3 - 3600 / 146 };
    // Exigido 24,6 · Medido 24,3 · Deficit -0,3 (e nao -0,4, que nao fecharia).
    expect(exibirPorHora(c.esperado)).toBe('24,6');
    expect(exibirPorHora(c.medido)).toBe('24,3');
    expect(diferencaExibida(c)).toBeCloseTo(-0.3, 9);
    expect(diferencaExibida({ ...c, base: 'capacidade' })).toBeCloseTo(5.4, 9);
    expect(diferencaExibida({ diferenca: null })).toBeNull();
  });

  it('os dois escritos iguais com a linha abaixo: nunca "deficit 0" ao lado de "nao atende"', () => {
    // 24,62 e 24,66 escritos 24,6 e 24,6: sai o deficit cheio, para longe do zero.
    const emb = comparativoCapacidade({ taktMs: 146000, capacidadeLinha: 31.3, medido: 24.62 });
    expect(emb.atende).toBe(false);
    expect(exibirPorHora(emb.medido)).toBe(exibirPorHora(emb.esperado));
    expect(diferencaExibida(emb)).toBeCloseTo(-0.1, 9);
    expect(exibirDiferenca(diferencaExibida(emb))).toBe('-0,1');
    // Na furadeira (inteiro): 300,2 contra 300,5 escritos 300 e 300.
    const fur = comparativoCapacidade({ taktMs: 11980, capacidadeLinha: 400, medido: 300.2 });
    expect(fur.atende).toBe(false);
    expect(exibirDiferenca(diferencaExibida(fur))).toBe('-0,3');
    // Igual de verdade continua 0, e superavit escrito igual continua 0.
    expect(diferencaExibida(comparativoCapacidade({ taktMs: 144000, capacidadeLinha: 31.3, medido: 25 }))).toBe(0);
    expect(diferencaExibida(comparativoCapacidade({ taktMs: 144000, capacidadeLinha: 31.3, medido: 25.04 }))).toBe(0);
  });

  it('capacidade de uma operacao: do valor cheio, escrita como a do quadro', () => {
    expect(capDaOperacao({ tpPorPeca: 115000 })).toBe('31,3');
    expect(capDaOperacao({ tpPorPeca: 115600 })).toBe('31,1');
    expect(capDaOperacao({ tpPorPeca: 3600000 / 222.7 })).toBe('222');
    expect(capDaOperacao({ tpPorPeca: 0 })).toBe('—');
    expect(capDaOperacao(null)).toBe('—');
  });

  it('por minuto com virgula', () => {
    expect(porMinuto(222.7)).toBe('3,7');
    expect(porMinuto(31.3)).toBe('0,5');
    expect(porMinuto(null)).toBe('—');
  });

  it('percentual com uma casa, e abaixo de 100 nunca vira 100%', () => {
    expect(exibirPct((24.3 / (3600 / 146)) * 100)).toBe('98,6%');
    expect(exibirPct(74)).toBe('74%');
    expect(exibirPct(99.96)).toBe('99,9%');
    expect(exibirPct(100)).toBe('100%');
    expect(exibirPct(125.2)).toBe('125,2%');
    expect(exibirPct(null)).toBe('—');
  });

  it('deficit com sinal e uma casa: o -0,4 da embalagem nao some', () => {
    expect(exibirDiferenca(24.3 - 3600 / 146)).toBe('-0,4');
    expect(exibirDiferenca(-120)).toBe('-120');
    expect(exibirDiferenca(6.32)).toBe('+6,3');
    expect(exibirDiferenca(0)).toBe('0');
    expect(exibirDiferenca(null)).toBe('—');
  });

  it('unidade do estudo: peca fora da embalagem, produto nela', () => {
    expect(porHora('peça')).toBe('pç/h');
    expect(porHora('produto')).toBe('produtos/h');
    expect(porHoraExtenso('produto')).toBe('produtos/hora');
    expect(porHoraExtenso('peça')).toBe('peças/hora');
    expect(porUnidade('produto')).toBe('por produto');
    expect(porUnidade('peça')).toBe('por peça');
  });
});

describe('vereditoCapacidade', () => {
  it('so o MEDIDO diz que a linha atende', () => {
    const c = comparativoCapacidade({ taktMs: 12000, capacidadeLinha: 222, medido: 320 });
    const v = vereditoCapacidade(c, { porQue: null });
    expect(v.confirmado).toBe(true);
    expect(v.frase).toBe('A linha atende o ritmo da demanda, medida na linha.');
    expect(v.tom).toBe('ok');
  });

  it('pela capacidade do tempo padrao, "atenderia" — e diz por que a medicao nao confirma', () => {
    // O cenario da revisao: tempo padrao 31/h contra 25 exigidos, medido
    // em volumes sem os volumes do produto.
    const c = comparativoCapacidade({ taktMs: 144000, capacidadeLinha: 31.3 });
    const doMedido = { porQue: 'faltam os volumes do produto no cadastro para converter a medição em produtos' };
    const v = vereditoCapacidade(c, doMedido);
    expect(v.confirmado).toBe(false);
    expect(v.frase).toMatch(/^Pelo tempo padrão, a linha atenderia o ritmo da demanda — a medição ainda não confirma: faltam os volumes/);
    expect(v.frase).not.toMatch(/A linha atende/);
    expect(v.nota).toMatch(/pelo tempo padrão atenderia · a medição ainda não confirma/);
    // Atender so' na conta nao e' verde.
    expect(v.tom).toBe('atencao');
  });

  it('medido abaixo do exigido por fracao: nao atende (98,6%, nunca 100%)', () => {
    const c = comparativoCapacidade({ taktMs: 146000, capacidadeLinha: 31.3, medido: 24.3 });
    const v = vereditoCapacidade(c, { porQue: null });
    expect(v.atende).toBe(false);
    expect(v.frase).toMatch(/não atende/);
    expect(exibirPct(c.atingimentoPct)).toBe('98,6%');
  });

  it('sem Takt nao ha veredito', () => {
    const v = vereditoCapacidade(comparativoCapacidade({ taktMs: 0, capacidadeLinha: 222 }), {});
    expect(v.atende).toBeNull();
    expect(v.frase).toMatch(/Sem Takt/);
  });
});

describe('lerMedido', () => {
  it('arquivadas: diz quantas e onde restaurar, em vez de "nenhuma medicao"', () => {
    const m = medicaoDoEstudo({
      ...base, conferencias: [],
      arquivadas: [0, 1, 2].map((i) => med({ arquivada: true, iniciado_em: `2026-10-1${i}T10:00:00Z` })),
    });
    const l = lerMedido(pronto(m), base);
    const texto = l.linhas.join(' | ');
    expect(texto).toMatch(/3 medições de Painel em FURADEIRA 03 dos últimos 30 dias estão arquivadas/);
    expect(texto).toMatch(/restaure no relatório Ritmo por máquina, em Arquivadas/);
    expect(texto).not.toMatch(/nenhuma medição/);
    expect(l.porQue).toMatch(/as 3 medições do posto com este produto estão arquivadas/);
    expect(l.curto).toMatch(/3 medições arquivadas/);
  });

  it('sem arquivada nenhuma, continua dizendo onde medir', () => {
    const m = medicaoDoEstudo({ ...base, conferencias: [], arquivadas: [] });
    expect(lerMedido(pronto(m), base).linhas[0]).toMatch(/nenhuma medição de Painel em FURADEIRA 03/);
  });

  it('setup planejado: o setup fica no relogio, e o numero sem ele vai ao lado com quando vale', () => {
    const m = medicaoDoEstudo({
      ...base,
      conferencias: [0, 1, 2].map((i) => med({
        iniciado_em: `2026-10-1${i}T10:00:00Z`, paradas: [{ motivo: 'setup', duracaoMs: 10 * MIN }],
      })),
      setup: { setupsDia: 2, dias: 5, minutos: 20 },
    });
    const l = lerMedido(pronto(m), base);
    expect(l.valor).toBe('100');
    expect(l.linhas.join(' | ')).toMatch(/com o setup marcado \(30 min\) dentro do relógio; sem ele, 120 .*veio do programa da semana/);
  });

  it('lista no teto: avisa no cartao', () => {
    const m = { ...medicaoDoEstudo({ ...base, conferencias: [med({})] }), noTeto: true };
    expect(lerMedido(pronto(m), base).linhas.join(' ')).toMatch(/teto de 1000 medições/);
  });

  it('erro pede o "Tentar de novo"', () => {
    expect(lerMedido({ estado: 'erro', erro: 'HTTP 500' }, base).erro).toBe(true);
    expect(lerMedido({ estado: 'carregando' }, base).erro).toBe(false);
  });
});
