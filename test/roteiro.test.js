/**
 * Importacao do roteiro de producao do ERP.
 *
 * O teste de integracao usa o PDF REAL gerado pelo ERP Logica
 * (test/fixtures/) — nao uma imitacao. Se o ERP mudar o layout do
 * relatorio, e' este teste que avisa.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extrairTextoPdf } from '../src/lib/pdfTexto.js';
import {
  SEM_PROCESSO, horaParaMs, interpretarRoteiro, normalizarLinhas, quantidadeParaNumero,
} from '../src/domain/roteiroErp.js';

const PDF = new URL('./fixtures/roteiro-mesa-cabeceira-sleep.pdf', import.meta.url);

describe('horaParaMs', () => {
  it('converte HH:MM:SS', () => {
    expect(horaParaMs('00:00:05')).toBe(5000);
    expect(horaParaMs('01:02:03')).toBe(3723000);
  });
  it('rejeita formato invalido', () => {
    expect(horaParaMs('5s')).toBe(0);
    expect(horaParaMs(null)).toBe(0);
  });
});

describe('quantidadeParaNumero', () => {
  it('le decimal com virgula do ERP', () => {
    expect(quantidadeParaNumero('2,0000')).toBe(2);
    expect(quantidadeParaNumero('1,5000')).toBe(1.5);
  });
  it('quantidade invalida ou zero vira 1 — nenhuma peca entra 0 vezes no produto', () => {
    expect(quantidadeParaNumero('0,0000')).toBe(1);
    expect(quantidadeParaNumero(null)).toBe(1);
  });
});

describe('normalizarLinhas', () => {
  it('remonta rotulos verticais quebrados em uma letra por linha', () => {
    expect(normalizarLinhas('N\ni\nv\n.\nProduto')).toEqual(['Niv.', 'Produto']);
  });
  it('mantem campos curtos isolados entre linhas longas', () => {
    // "2" (funcionarios) precisa continuar sendo uma linha propria.
    expect(normalizarLinhas('FURAR\n2\nFUR16')).toEqual(['FURAR', '2', 'FUR16']);
  });
});

describe('interpretarRoteiro + extrairTextoPdf no PDF real do ERP', () => {
  async function lerRoteiro() {
    const bytes = new Uint8Array(readFileSync(PDF));
    return interpretarRoteiro(await extrairTextoPdf(bytes));
  }

  it('acha o produto pai', async () => {
    const r = await lerRoteiro();
    expect(r.produtoPai).toEqual({ codigo: '103.005.001', descricao: 'MESA CABECEIRA SLEEP BRANCO' });
  });

  it('extrai as 6 pecas com processo, todas na FUR16', async () => {
    const r = await lerRoteiro();
    expect(r.operacoes).toHaveLength(6);
    expect(r.maquinas).toEqual(['FUR16']);
    expect(r.operacoes.every((o) => o.operacao === 'FURAR')).toBe(true);
    expect(r.operacoes.every((o) => o.msUnitario === 5000)).toBe(true);
  });

  it('le a quantidade na estrutura — a lateral entra 2x no produto', async () => {
    const r = await lerRoteiro();
    const lateral = r.operacoes.find((o) => o.codigo === '778.002.001');
    expect(lateral.quantidade).toBe(2);
    // O ERP ja multiplica: 5s x 2 = 10s no total da peca.
    expect(lateral.msTotal).toBe(10000);
    const demais = r.operacoes.filter((o) => o.codigo !== '778.002.001');
    expect(demais.every((o) => o.quantidade === 1)).toBe(true);
  });

  it('emenda a descricao que o relatorio corta em 30 colunas', async () => {
    const r = await lerRoteiro();
    const nomes = r.operacoes.map((o) => o.descricao);
    expect(nomes).toContain('SLEEP LAT DIR/ESQ 328X215X15 MDP 2 BCO');
    expect(nomes).toContain('SLEEP BASE 380X330X15 MDP 1 BCO');
    // O espaco engolido pelo corte volta: "...MDP" + "5 BCO".
    expect(nomes).toContain('SLEEP FUNDO SUP 378X265X15 MDP 5 BCO');
  });

  it('reporta as pecas sem processo em vez de esconde-las', async () => {
    const r = await lerRoteiro();
    expect(r.semProcesso.map((p) => p.codigo)).toEqual(['501.094.001', '778.008.001']);
  });
});

describe('interpretarRoteiro em texto degenerado', () => {
  it('texto vazio devolve estrutura vazia, nao explode', () => {
    const r = interpretarRoteiro('');
    expect(r.produtoPai).toBeNull();
    expect(r.operacoes).toEqual([]);
    expect(r.semProcesso).toEqual([]);
  });

  it('roteiro so com SEM PROCESSO nao gera operacao', () => {
    const r = interpretarRoteiro([
      '103.005.001', 'PRODUTO PAI', SEM_PROCESSO, '0,0000',
      '501.094.001', 'VOLUME', SEM_PROCESSO, '1,0000',
    ].join('\n'));
    expect(r.produtoPai.codigo).toBe('103.005.001');
    expect(r.operacoes).toEqual([]);
    expect(r.semProcesso).toHaveLength(1);
  });
});

describe('extrairTextoPdf recusa o que nao consegue ler', () => {
  it('arquivo que nao e PDF', async () => {
    await expect(extrairTextoPdf(new TextEncoder().encode('isso nao e um pdf')))
      .rejects.toThrow('não é um PDF');
  });
});
