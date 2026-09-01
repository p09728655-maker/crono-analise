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
  conferencias: linhas,
});

/** Uma medicao com instante de inicio — a tendencia ordena por ele. */
const medicao = (dia, maquina, pecas, minutos = 15, extra = {}) => ({
  maquina, peca: 'A', duracaoMs: minutos * MIN, pecas,
  iniciado_em: `2026-08-${String(dia).padStart(2, '0')}T07:00:00Z`,
  ...extra,
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

  /**
   * A comparacao entre maquinas segue o GRUPO do cadastro.
   *
   * Sem isto, a leitura media a furadeira contra a seccionadora e afirmava
   * que uma "roda 400% mais rapido" que a outra — comparacao entre postos de
   * naturezas diferentes, que so' o grupo do cadastro sabe separar.
   */
  describe('comparacao dentro do grupo', () => {
    const comGrupo = (linhas, grupoDe) => analisarConferencias({
      maquinas: resumirConferencias(linhas),
      pecas: resumirConferencias(linhas, { porPeca: true }),
      conferencias: linhas,
      grupoDe,
    });
    const grupoDe = (n) => (n.startsWith('F') ? '0002 · FURADEIRA' : '0001 · SECCIONADORA');

    it('NUNCA compara maquinas de grupos diferentes', () => {
      const linhas = [];
      for (let i = 0; i < 3; i++) {
        linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 225 });   // 900/h
        linhas.push({ maquina: 'F12', peca: 'A', duracaoMs: 15 * MIN, pecas: 150 });   // 600/h
        linhas.push({ maquina: 'SEC 1', peca: 'Chapa', duracaoMs: 15 * MIN, pecas: 40 }); // 160/h
        linhas.push({ maquina: 'SEC 2', peca: 'Chapa', duracaoMs: 15 * MIN, pecas: 50 }); // 200/h
      }
      const entre = comGrupo(linhas, grupoDe).find((s) => s.titulo === 'Entre máquinas');
      const tudo = entre.linhas.join(' ');
      // Cada grupo com sua propria comparacao, nomeada.
      expect(tudo).toContain('0002 · FURADEIRA');
      expect(tudo).toContain('0001 · SECCIONADORA');
      // E jamais a furadeira medida contra a seccionadora: 900 x 160 seriam
      // 463% — o numero que a leitura antiga produzia.
      expect(tudo).not.toContain('463%');
      expect(tudo).not.toMatch(/F16 está rodando \d+% mais rápido que SEC/);
    });

    it('uma maquina por grupo: diz que nao ha comparacao, em vez de sumir', () => {
      const linhas = [];
      for (let i = 0; i < 3; i++) {
        linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 225 });
        linhas.push({ maquina: 'SEC 1', peca: 'Chapa', duracaoMs: 15 * MIN, pecas: 40 });
      }
      const entre = comGrupo(linhas, grupoDe).find((s) => s.titulo === 'Entre máquinas');
      expect(entre.linhas[0]).toContain('grupos diferentes');
      expect(entre.linhas[0]).toContain('meça outra máquina do mesmo grupo');
    });

    it('sem cadastro de grupo, a leitura sai como sempre saiu', () => {
      const linhas = [];
      for (let i = 0; i < 3; i++) {
        linhas.push({ maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 225 });
        linhas.push({ maquina: 'F12', peca: 'B', duracaoMs: 15 * MIN, pecas: 150 });
      }
      const entre = comGrupo(linhas, undefined).find((s) => s.titulo === 'Entre máquinas');
      expect(entre.linhas[0]).toContain('F16 está rodando 50% mais rápido que F12');
      // Com um grupo so' na leitura, o nome do grupo nao aparece: repetiria
      // o que as maquinas ja' dizem.
      expect(entre.linhas[0]).not.toContain('Sem grupo');
    });
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

  it('com 4+ medicoes, destrava a TENDENCIA: ritmo subindo, com os numeros', () => {
    const secoes = analisar([
      medicao(1, 'F16', 150), // 600/h
      medicao(2, 'F16', 150),
      medicao(3, 'F16', 180), // 720/h
      medicao(4, 'F16', 180),
    ]);
    const tend = secoes.find((s) => s.titulo === 'Tendência');
    expect(tend.linhas[0]).toContain('subindo');
    expect(tend.linhas[0]).toContain('20%');
    expect(tend.linhas[0]).toContain('600 → 720 pç/h');
  });

  it('tendencia caindo aponta o caminho: broca, abastecimento, ajustes', () => {
    const tend = analisar([
      medicao(1, 'F16', 180), medicao(2, 'F16', 180),
      medicao(3, 'F16', 150), medicao(4, 'F16', 150),
    ]).find((s) => s.titulo === 'Tendência');
    expect(tend.linhas[0]).toContain('caindo');
    expect(tend.linhas[0]).toContain('broca');
  });

  it('a ordem vem do INSTANTE, nao da ordem da lista — o servidor manda o recente primeiro', () => {
    const tend = analisar([
      medicao(4, 'F16', 180), medicao(3, 'F16', 180),
      medicao(2, 'F16', 150), medicao(1, 'F16', 150),
    ]).find((s) => s.titulo === 'Tendência');
    expect(tend.linhas[0]).toContain('subindo');
  });

  it('sem instante valido nao ha tendencia — a ordem da lista nunca vira direcao', () => {
    // O servidor manda o mais recente primeiro: assumir a ordem da lista
    // inverteria a leitura. Sem data que parseie, a secao simplesmente
    // nao existe — melhor calar do que afirmar ao contrario.
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 180, iniciado_em: 'data-quebrada' },
      { maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 180 },
      { maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 150 },
      { maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas: 150 },
    ]);
    expect(secoes.find((s) => s.titulo === 'Tendência')).toBeUndefined();
  });

  it('instante de inicio quebrado cai para o salvo_em antes de descartar', () => {
    const comSalvo = (dia, pecas) => ({
      maquina: 'F16', peca: 'A', duracaoMs: 15 * MIN, pecas,
      iniciado_em: 'data-quebrada', salvo_em: `2026-08-${String(dia).padStart(2, '0')}T12:00:00Z`,
    });
    const tend = analisar([comSalvo(1, 150), comSalvo(2, 150), comSalvo(3, 180), comSalvo(4, 180)])
      .find((s) => s.titulo === 'Tendência');
    expect(tend.linhas[0]).toContain('subindo');
  });

  it('diferenca pequena e ritmo que se mantem — nunca tendencia inventada', () => {
    const tend = analisar([
      medicao(1, 'F16', 150), medicao(2, 'F16', 152),
      medicao(3, 'F16', 154), medicao(4, 'F16', 155),
    ]).find((s) => s.titulo === 'Tendência');
    expect(tend.linhas[0]).toContain('se mantém no tempo');
  });

  it('com menos de 4 medicoes nao ha tendencia — e a analise DIZ o que destrava', () => {
    const secoes = analisar([medicao(1, 'F16', 150)]);
    expect(secoes.find((s) => s.titulo === 'Tendência')).toBeUndefined();
    const proximo = secoes.find((s) => s.titulo === 'Próximo passo');
    expect(proximo.linhas.join(' ')).toContain('cresce com os dados');
    expect(proximo.linhas.join(' ')).toContain('4 medições');
  });

  it('com 3+ medicoes, mostra ate onde o posto chega (melhor periodo x media)', () => {
    const secoes = analisar([
      medicao(1, 'F16', 150), // 600/h
      medicao(2, 'F16', 150),
      medicao(3, 'F16', 225, 15, { peca: 'B' }), // 900/h
    ]);
    const chegar = secoes.find((s) => s.titulo === 'Até onde dá para chegar');
    expect(chegar.linhas[0]).toContain('900 pç/h');
    expect(chegar.linhas[0]).toContain('acima da média');
  });

  it('peca cujo ritmo nao se repete (3+ medicoes) e apontada com a faixa medida', () => {
    const secoes = analisar([
      medicao(1, 'F16', 150), // 600/h
      medicao(2, 'F16', 225), // 900/h
      medicao(3, 'F16', 300), // 1200/h
    ]);
    const pecas = secoes.find((s) => s.titulo === 'Entre peças');
    expect(pecas.linhas.join(' ')).toContain('não se repete');
    expect(pecas.linhas.join(' ')).toContain('600 a 1200 pç/h');
  });

  /**
   * DISPONIBILIDADE em portugues. "18 min de 30 min observados" obriga quem
   * le a dividir de cabeca; o percentual e' o numero que se acompanha no
   * tempo. A palavra "disponibilidade" nao entra no texto — a regra de
   * ago/2026 tirou o jargao da tela e o numero voltou sem ele.
   */
  it('a leitura geral diz quanto do periodo a maquina rodou, em %', () => {
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 300,
        paradas: [{ motivo: 'setup', duracaoMs: 12 * MIN }] },
    ]);
    const geral = secoes.find((s) => s.titulo === 'Leitura geral');
    // 18 min rodando de 30 observados = 60%.
    expect(geral.linhas.join(' ')).toContain('A máquina rodou 60% do período observado.');
    expect(texto(secoes)).not.toMatch(/disponibilidade/i);
  });

  it('sem parada marcada nao ha o que dizer sobre tempo rodando — seria sempre 100%', () => {
    const secoes = analisar([{ maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 300 }]);
    expect(texto(secoes)).not.toContain('do período observado');
  });

  /**
   * A CURVA DO DIA. A media esconde a hora fraca: 700 pc/h de manha e 500
   * depois do almoco viram 620 o dia inteiro, e ninguem olha o que muda as
   * 13h. Horario LOCAL de proposito — "7h" e' 7h do chao de fabrica.
   */
  /* Instante com o FUSO DA FABRICA escrito (-03:00), nunca `new Date(a, m, d,
     h)`: aquele monta a hora no fuso de quem roda o teste, e a curva passaria
     em qualquer maquina justamente por nao enxergar o fuso — foi o buraco que
     a auditoria de 31/08 encontrou. */
  const noRelogio = (hora, pecas, dia = 31) => ({
    maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas,
    iniciado_em: `2026-08-${String(dia).padStart(2, '0')}T${String(hora).padStart(2, '0')}:00:00-03:00`,
  });

  it('aponta a hora fraca do dia contra a mais forte, com a queda em %', () => {
    const secoes = analisar([
      noRelogio(7, 350, 30), noRelogio(7, 350, 31), noRelogio(13, 250),
    ]);
    const dia = secoes.find((s) => s.titulo === 'Ao longo do dia');
    // 700 pc/h as 7h contra 500 as 13h = 29% menor.
    expect(dia.linhas[0]).toContain('07h 700 pç/h');
    expect(dia.linhas[0]).toContain('13h 500 pç/h');
    expect(dia.linhas[1]).toContain('Às 13h o ritmo é 29% menor que às 07h');
    expect(dia.linhas[1]).toMatch(/troca, abastecimento/);
  });

  it('horas parecidas nao viram hora fraca — diferenca pequena e ruido de medicao', () => {
    const secoes = analisar([
      noRelogio(7, 300, 30), noRelogio(7, 305, 31), noRelogio(13, 295),
    ]);
    const dia = secoes.find((s) => s.titulo === 'Ao longo do dia');
    expect(dia.linhas.join(' ')).toContain('sem hora fraca a investigar');
  });

  it('com mais de uma maquina a curva nao sai — seria hora contra maquina', () => {
    /**
     * As 13h so' a F14 foi medida, e ela e' mais lenta. Sem esta regra, a
     * analise diria "as 13h o ritmo cai 43%" — e mandaria investigar uma
     * hora quando o que mudou foi o posto.
     */
    const secoes = analisar([
      { maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 350,
        iniciado_em: '2026-08-30T07:00:00-03:00' },
      { maquina: 'F16', peca: 'A', duracaoMs: 30 * MIN, pecas: 350,
        iniciado_em: '2026-08-31T07:00:00-03:00' },
      { maquina: 'F14', peca: 'A', duracaoMs: 30 * MIN, pecas: 200,
        iniciado_em: '2026-08-31T13:00:00-03:00' },
    ]);
    expect(secoes.find((s) => s.titulo === 'Ao longo do dia')).toBeUndefined();
  });

  it('uma hora so, ou poucas medicoes, nao desenha curva nenhuma', () => {
    // Tres medicoes, mas todas as 7h: nao ha com o que comparar.
    expect(analisar([noRelogio(7, 300, 29), noRelogio(7, 300, 30), noRelogio(7, 300, 31)])
      .find((s) => s.titulo === 'Ao longo do dia')).toBeUndefined();
    // Duas horas, mas so duas medicoes: e uma contra a outra, nao padrao.
    expect(analisar([noRelogio(7, 300), noRelogio(13, 200)])
      .find((s) => s.titulo === 'Ao longo do dia')).toBeUndefined();
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
    // O custo em PECAS: 14 min parados ao ritmo medio de 636 pc/h = ~148.
    expect(paradas.linhas.join(' ')).toContain('custou cerca de 148 peças');
    /**
     * E o COMPARATIVO, de quanto para quanto: 700 pecas saidas em 80 min
     * observados (636 pc/h rodando, 525 no periodo). Sem a parada, no mesmo
     * tempo, sairiam 848 — 21% a mais. "Perdemos 148" sozinho nao diz o
     * tamanho da perda; com os dois lados, diz.
     */
    const textoParadas = paradas.linhas.join(' ');
    expect(textoParadas).toContain('No MESMO período');
    expect(textoParadas).toContain('848 peças em vez de 700');
    expect(textoParadas).toContain('525 pç/h');
    expect(textoParadas).toContain('636 pç/h');
    expect(textoParadas).toContain('21% a mais');
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
