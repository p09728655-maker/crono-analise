/**
 * O cadastro de motivos de parada nao pode custar o historico.
 *
 * A lista deixou de ser do codigo e passou a ser da fabrica. O risco que
 * isso cria e' silencioso: parada gravada com um motivo que depois some do
 * cadastro apareceria no relatorio como codigo cru — "falta_material" no
 * lugar de "Falta de material" — e a sugestao de melhoria ficaria sem acao.
 * E' isso que estes testes guardam.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  MOTIVOS_PARADA, acaoDoMotivo, definirCatalogoParadas, resumirParadasDoEstudo, rotuloMotivo,
} from '../src/domain/cronoanalise.js';
import { adotarMotivos, codigoPreferido, motivosAtivos } from '../src/lib/motivosParada.js';

const DA_FABRICA = [
  { codigo: 'energia', rotulo: 'Falta de energia', acao: 'Acionar a manutenção elétrica.' },
  { codigo: 'setup', rotulo: 'Preparação de máquina', acao: 'Aplicar SMED.' },
];

// O catalogo e' estado de modulo: sem isto um teste contamina o proximo.
afterEach(() => definirCatalogoParadas([]));

describe('catalogo de motivos de parada', () => {
  it('sem cadastro, valem os motivos de fabrica', () => {
    expect(rotuloMotivo('setup')).toBe('Setup / Troca');
  });

  it('cadastro da fabrica passa a nomear as paradas', () => {
    definirCatalogoParadas(DA_FABRICA);
    expect(rotuloMotivo('energia')).toBe('Falta de energia');
    // Mesmo codigo, outro nome: o motivo padrao foi renomeado no cadastro e
    // o historico inteiro passa a ler o nome novo — que e' o ponto.
    expect(rotuloMotivo('setup')).toBe('Preparação de máquina');
    expect(acaoDoMotivo('setup')).toBe('Aplicar SMED.');
  });

  it('codigo fora do cadastro cai nos motivos de fabrica, nao no codigo cru', () => {
    definirCatalogoParadas(DA_FABRICA);
    // 'manutencao' saiu do cadastro da fabrica, mas ha paradas antigas com ele.
    expect(rotuloMotivo('manutencao')).toBe('Manutenção corretiva');
    expect(acaoDoMotivo('manutencao')).toMatch(/TPM/);
  });

  it('codigo que nunca existiu volta como veio, com acao generica', () => {
    definirCatalogoParadas(DA_FABRICA);
    expect(rotuloMotivo('inventado_2019')).toBe('inventado_2019');
    expect(acaoDoMotivo('inventado_2019')).toMatch(/Detalhar na observação/);
  });

  it('cadastro vazio devolve o app aos motivos de fabrica', () => {
    definirCatalogoParadas(DA_FABRICA);
    definirCatalogoParadas([]);
    expect(rotuloMotivo('setup')).toBe('Setup / Troca');
    expect(rotuloMotivo('energia')).toBe('energia');
  });

  it('o resumo do estudo sai com o nome e a acao cadastrados', () => {
    definirCatalogoParadas(DA_FABRICA);
    const resumo = resumirParadasDoEstudo([
      { paradas: [{ motivo: 'energia', duracao_ms: 600000 }] },
    ]);
    expect(resumo.porMotivo[0].rotulo).toBe('Falta de energia');
    expect(resumo.porMotivo[0].acao).toBe('Acionar a manutenção elétrica.');
  });
});

describe('atalho de parada', () => {
  it('mantem o codigo preferido quando ele esta cadastrado', () => {
    expect(codigoPreferido(DA_FABRICA, 'setup')).toBe('setup');
  });

  it('cai no primeiro motivo quando o preferido foi desativado', () => {
    const semSetup = DA_FABRICA.filter((m) => m.codigo !== 'setup');
    // Sem isto o botao "+ Setup / troca" criaria uma parada com um motivo
    // que a lista de escolha ao lado nem oferece.
    expect(codigoPreferido(semSetup, 'setup')).toBe('energia');
  });

  it('sem cadastro nenhum, devolve o preferido em vez de indefinido', () => {
    expect(codigoPreferido([], 'setup')).toBe('setup');
  });

  it('os motivos de fabrica continuam trazendo setup', () => {
    expect(codigoPreferido(MOTIVOS_PARADA, 'setup')).toBe('setup');
  });
});

describe('lista que a coleta le', () => {
  /**
   * useSyncExternalStore compara o retorno de getSnapshot por IDENTIDADE.
   * Filtrar a cada leitura devolve um array novo toda vez, o React conclui
   * que a loja mudou e redesenha em loop — a tela de coleta morria com
   * "Maximum update depth exceeded". Este teste guarda a identidade.
   */
  it('devolve sempre a mesma referencia enquanto o cadastro nao muda', () => {
    expect(motivosAtivos()).toBe(motivosAtivos());
  });

  it('troca a referencia quando o cadastro muda, e tira o desativado', () => {
    const antes = motivosAtivos();
    adotarMotivos([
      { codigo: 'energia', rotulo: 'Falta de energia', ativo: true },
      { codigo: 'reuniao', rotulo: 'Reunião', ativo: false },
    ]);
    const depois = motivosAtivos();
    expect(depois).not.toBe(antes);
    expect(depois.map((m) => m.codigo)).toEqual(['energia']);
    // E continua estavel na nova lista.
    expect(motivosAtivos()).toBe(depois);
  });
});
