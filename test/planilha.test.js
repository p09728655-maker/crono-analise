/**
 * Template de tempos (.xlsx): leitura do arquivo real + interpretacao.
 *
 * O leitor (lib/xlsxTexto) roda contra os DOIS arquivos de verdade — o
 * molde vazio enviado pela embalagem e uma copia preenchida — porque zip e
 * sharedStrings quebram em detalhe de byte, nao em teoria. A interpretacao
 * (domain/templateTempos) e' pura e tambem e' testada com matrizes soltas.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lerPlanilhaXlsx } from '../src/lib/xlsxTexto.js';
import { interpretarTemplate } from '../src/domain/templateTempos.js';

const MOLDE = new URL('./fixtures/template-tempos-embalagem.xlsx', import.meta.url);
const PREENCHIDO = new URL('./fixtures/template-tempos-preenchido.xlsx', import.meta.url);
// Buffer do Node compartilha pool: .buffer inteiro traria bytes alheios.
const lerFixture = (url) => {
  const b = readFileSync(url);
  return lerPlanilhaXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe('lerPlanilhaXlsx — arquivo real da embalagem', () => {
  it('le as tres abas com nomes e celulas', async () => {
    const abas = await lerFixture(MOLDE);
    expect(Object.keys(abas)).toEqual(['Config', 'Tempos', 'Paradas']);
    expect(abas.Tempos[0]).toEqual(['OPERAÇÃO', 'FR%', 'TEMPO (s)']);
    expect(abas.Tempos[1][0]).toBe('CAIXA, TAMPO, ISOMANTA');
    expect(abas.Tempos[1][1]).toBe(100);
    expect(abas.Config[5]).toEqual(['Tolerância (%)', '15']);
  });

  it('nao e xlsx: recusa com erro claro', async () => {
    await expect(lerPlanilhaXlsx(new Uint8Array([1, 2, 3, 4]).buffer))
      .rejects.toThrow(/não é uma planilha/);
  });
});

describe('interpretarTemplate — molde vazio (so a estrutura)', () => {
  it('reconhece as duas operacoes da embalagem, sem nenhum ciclo', async () => {
    const modelo = interpretarTemplate(await lerFixture(MOLDE));
    expect(modelo.operacoes.map((o) => o.nome)).toEqual([
      'CAIXA, TAMPO, ISOMANTA',
      'LATERAL, ISOMANTA, LATERAL',
    ]);
    // Tempo zero e' linha de molde, nao cronometragem.
    expect(modelo.operacoes.every((o) => o.tempos.length === 0)).toBe(true);
    expect(modelo.operacoes.every((o) => o.fr === 100)).toBe(true);
    expect(modelo.config.toleranciaPct).toBe(15);
    expect(modelo.config.metaObs).toBe(10);
    // "Ex: Produto X" e' instrucao do molde, nao valor preenchido.
    expect(modelo.config.produto).toBeNull();
    expect(modelo.config.nome).toBeNull();
  });
});

describe('interpretarTemplate — planilha preenchida', () => {
  it('importa ciclos em ms, paradas na operacao certa e avisa a orfa', async () => {
    const modelo = interpretarTemplate(await lerFixture(PREENCHIDO));
    const [caixa, lateral] = modelo.operacoes;
    expect(caixa.tempos).toEqual([12500, 11800, 13200, 12000]);
    expect(lateral.tempos).toEqual([21400, 20900, 22700]);
    expect(caixa.paradas).toEqual([
      { motivo: 'Falta de material', duracaoMs: 180000, observacao: 'Aguardou isomanta' },
    ]);
    expect(modelo.avisos.some((a) => a.includes('OPERACAO INEXISTENTE'))).toBe(true);
    expect(modelo.config.nome).toBe('Embalagem — linha 1');
    expect(modelo.config.analista).toBe('Maurício');
  });
});

describe('interpretarTemplate — casos de borda (matrizes puras)', () => {
  it('sem aba Tempos, recusa com instrucao', () => {
    expect(() => interpretarTemplate({ Outra: [['x']] })).toThrow(/aba "Tempos"/);
  });

  it('FR divergente entre linhas da mesma operacao mantem o primeiro e avisa', () => {
    const modelo = interpretarTemplate({
      Tempos: [
        ['OPERAÇÃO', 'FR%', 'TEMPO (s)'],
        ['Dobrar caixa', 100, 10],
        ['Dobrar caixa', 110, 11],
      ],
    });
    expect(modelo.operacoes[0].fr).toBe(100);
    expect(modelo.avisos.length).toBe(1);
  });

  it('acha as abas sem depender de caixa e ignora linhas vazias', () => {
    const modelo = interpretarTemplate({
      tempos: [
        ['Operação', 'FR%', 'Tempo (s)'],
        [null, null, null],
        ['Selar', '', '9.5'],
      ],
    });
    expect(modelo.operacoes).toHaveLength(1);
    expect(modelo.operacoes[0].tempos).toEqual([9500]);
    expect(modelo.operacoes[0].fr).toBe(100);
  });
});
