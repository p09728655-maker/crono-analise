/**
 * Analise automatica das medicoes — a leitura por REGRA, sem IA.
 *
 * O contrato que importa: a analise nasce do mesmo resumo que a tela mostra
 * (resumirConferencias, por maquina e por peca), fala portugues de fabrica e
 * traz sempre o numero junto da conclusao. Os testes montam o resumo pela
 * propria funcao de dominio — se o resumo mudar de forma, isto quebra aqui,
 * nao na tela.
 */
import { describe, expect, it } from 'vitest';
import { resumirConferencias } from '../src/domain/cronoanalise.js';
import { analisarConferencias } from '../src/domain/analiseConferencias.js';

const MIN = 60000;

const analisar = (linhas) => analisarConferencias({
  maquinas: resumirConferencias(linhas),
  pecas: resumirConferencias(linhas, { porPeca: true }),
});

const texto = (secoes) => secoes.map((s) => `${s.titulo}\n${s.linhas.join('\n')}`).join('\n');

describe('analisarConferencias', () => {
  it('sem medicao, sem analise — nunca inventa leitura', () => {
    expect(analisarConferencias({})).toEqual([]);
    expect(analisarConferencias({ maquinas: [], pecas: [] })).toEqual([]);
  });

  it('a leitura geral traz pecas, tempo rodando e o ritmo em pc/h E pc/min', () => {
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 300 },
    ]);
    const geral = secoes.find((s) => s.titulo === 'Leitura geral');
    expect(geral.linhas[0]).toContain('300 peças');
    expect(geral.linhas[0]).toContain('30 min');
    // 300 pc em 30 min = 600 pc/h = 10.0 pc/min
    expect(geral.linhas[0]).toContain('600 pç/h');
    expect(geral.linhas[0]).toContain('10.0 pç/min');
  });

  it('maquina fora do criterio sai como "ainda em medição", com o que falta em palavras', () => {
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 10 * MIN, pecas: 100 },
    ]);
    const porMaquina = secoes.find((s) => s.titulo === 'Por máquina');
    expect(porMaquina.linhas[0]).toContain('ainda em medição');
    expect(porMaquina.linhas[0]).toContain('mais 2 medições');
    expect(porMaquina.linhas[0]).toContain('mais 20 min de máquina rodando');
    // Jargao banido do texto: o criterio aparece em palavras, nunca como "amostra".
    expect(texto(secoes)).not.toMatch(/amostra|insuficiente|CV%/i);
    // E o caminho reaparece como proximo passo.
    const proximo = secoes.find((s) => s.titulo === 'Próximo passo');
    expect(proximo.linhas[0]).toContain('F16');
  });

  it('compara maquinas pelo ritmo e avisa da diferenca de peca', () => {
    const linhas = [];
    for (let i = 0; i < 3; i++) {
      linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 225 }); // 900/h
      linhas.push({ maquina: 'F12', peca: 'B', duracaoMs: 15 * MIN, pecas: 150 }); // 600/h
    }
    const secoes = analisar(linhas);
    const entre = secoes.find((s) => s.titulo === 'Entre máquinas');
    expect(entre.linhas[0]).toContain('F16');
    expect(entre.linhas[0]).toContain('50%');
    expect(entre.linhas[0]).toContain('900 contra 600');
    expect(entre.linhas[0]).toContain('peças parecidas');
    // Ambas fecharam o criterio: nao ha ressalva de medicao.
    expect(entre.linhas.join(' ')).not.toContain('ainda em medição');
  });

  it('ritmos parecidos (< 5%) nao viram ranking', () => {
    const linhas = [];
    for (let i = 0; i < 3; i++) {
      linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 204 });
      linhas.push({ maquina: 'F12', peca: 'B', duracaoMs: 15 * MIN, pecas: 200 });
    }
    const entre = analisar(linhas).find((s) => s.titulo === 'Entre máquinas');
    expect(entre.linhas[0]).toContain('ritmo parecido');
  });

  it('na mesma maquina, aponta a peca mais rapida e a mais lenta — e manda planejar pela peca', () => {
    const linhas = [];
    for (let i = 0; i < 2; i++) {
      linhas.push({ maquina: 'F16', peca: 'Sleep base', duracaoMs: 16 * MIN, pecas: 256 }); // 960/h
      linhas.push({ maquina: 'F16', peca: 'Princesa fundo', duracaoMs: 6 * MIN, pecas: 64 }); // 640/h
    }
    const pecas = analisar(linhas).find((s) => s.titulo === 'Entre peças');
    expect(pecas.linhas[0]).toContain('Sleep base');
    expect(pecas.linhas[0]).toContain('Princesa fundo');
    expect(pecas.linhas[0]).toContain('ritmo da peça');
  });

  it('paradas: nomeia o maior motivo e, com troca dominante, ensina a preparar a troca', () => {
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 40 * MIN, pecas: 300,
        paradas: [{ motivo: 'setup', duracaoMs: 12 * MIN }, { motivo: 'manutencao', duracaoMs: 2 * MIN }] },
      { maquina: 'F16', peca: 'A', duracaoMs: 20 * MIN, pecas: 200 },
      { maquina: 'F16', peca: 'A', duracaoMs: 20 * MIN, pecas: 200 },
    ]);
    const paradas = secoes.find((s) => s.titulo === 'Paradas');
    expect(paradas.linhas[0]).toContain('Setup / Troca');
    expect(paradas.linhas[0]).toContain('12 min');
    expect(paradas.linhas.join(' ')).toContain('ANTES de parar a máquina');
    // Sem sigla: a acao sai em portugues, nao em SMED.
    expect(texto(secoes)).not.toContain('SMED');
  });

  it('sem parada marcada, a secao de paradas nao existe', () => {
    const secoes = analisar([{ maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 300 }]);
    expect(secoes.find((s) => s.titulo === 'Paradas')).toBeUndefined();
  });

  it('com tudo dentro do criterio, nao ha "Próximo passo" cobrando medicao', () => {
    const linhas = [];
    for (let i = 0; i < 3; i++) linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 200 });
    expect(analisar(linhas).find((s) => s.titulo === 'Próximo passo')).toBeUndefined();
  });
});
