/**
 * Painel Ritmo/Demanda — compartilhado entre cadastro manual e importacao.
 * As conversoes daqui viram numero gravado no estudo e texto impresso.
 */
import { describe, expect, it } from 'vitest';
import {
  CALC_PADRAO, avisoSemPrograma, contaDaMaquina, demandaPorMaquina, formatarHorasMin, formatarTakt,
  origemDoTakt, taktMsDoCalculo, taktMsDoEstudo,
} from '../src/components/RitmoDemanda.jsx';
import {
  deveLimparProduto, produtoDeOutroGrupo, programaDoTakt, programaLido,
} from '../src/lib/taktDaSemana.js';

describe('taktMsDoCalculo', () => {
  it('480 pecas em 8,8h dao takt de 66s', () => {
    expect(taktMsDoCalculo({ quantidade: '480', horas: '8.8' })).toBe(66000);
  });
  it('aceita virgula brasileira nas horas', () => {
    expect(taktMsDoCalculo({ quantidade: '480', horas: '8,8' })).toBe(66000);
  });
  it('conta incompleta devolve null, nao zero — takt zero nao existe', () => {
    expect(taktMsDoCalculo({ quantidade: '', horas: '8.8' })).toBeNull();
    expect(taktMsDoCalculo({ quantidade: '480', horas: '' })).toBeNull();
    expect(taktMsDoCalculo(undefined)).toBeNull();
  });
});

describe('formatarTakt', () => {
  it('mostra como relogio mm:ss', () => {
    expect(formatarTakt(66000)).toBe('01:06');
    expect(formatarTakt(42000)).toBe('00:42');
  });
});

describe('formatarHorasMin', () => {
  it('8,8 horas sao 8h48min — nao "8h80"', () => {
    expect(formatarHorasMin(8.8)).toBe('8h48min');
  });
  it('5,6 horas sao 5h36min', () => {
    expect(formatarHorasMin(5.6)).toBe('5h36min');
  });
});

describe('CALC_PADRAO', () => {
  it('ja parte da jornada padrao de 8,8h/dia', () => {
    expect(CALC_PADRAO.horas).toBe('8.8');
    expect(CALC_PADRAO.quantidade).toBe('');
  });
});

/**
 * O TAKT DO ESTUDO vem do programa da semana quando o posto tem um — o
 * mesmo numero do quadro do programa — e da conta digitada quando nao tem,
 * ou quando o analista pede para simular.
 */
describe('origem do takt do estudo', () => {
  const furadeira = { taktMs: 42000, semana: '043-26', unidade: { singular: 'peça', plural: 'peças' } };
  const embalagem = { taktMs: 72000, semana: '043-26', unidade: { singular: 'volume', plural: 'volumes' } };

  it('sem programa, e a conta digitada de sempre', () => {
    expect(origemDoTakt({ programa: null })).toBe('manual');
    expect(origemDoTakt({ programa: { taktMs: null } })).toBe('manual');
    // Nem pedindo: nao ha' programa para usar.
    expect(origemDoTakt({ programa: null, escolha: 'programa' })).toBe('manual');
  });

  it('com programa e a conta intocada, o programa entra sozinho', () => {
    expect(origemDoTakt({ programa: furadeira })).toBe('programa');
  });

  /* Decide pelo que o analista FEZ, nao pelo valor do campo: apagar a
     quantidade para corrigi-la deixava o campo vazio, e o programa tomava
     o painel no meio da edicao. */
  it('depois que o analista mexeu na conta, o programa so e oferecido', () => {
    expect(origemDoTakt({ programa: furadeira, digitou: true })).toBe('manual');
  });

  it('a escolha do analista manda, nos dois sentidos', () => {
    expect(origemDoTakt({ programa: furadeira, escolha: 'manual' })).toBe('manual');
    expect(origemDoTakt({ programa: furadeira, escolha: 'programa', digitou: true })).toBe('programa');
  });

  /* O programa da embalagem e' em VOLUMES; o ciclo do estudo pode ser o
     produto inteiro (rack de 2 volumes). Entrar sozinho dobraria a carga. */
  it('na embalagem o programa e oferecido, nao imposto', () => {
    expect(origemDoTakt({ programa: embalagem })).toBe('manual');
    expect(origemDoTakt({ programa: embalagem, escolha: 'programa' })).toBe('programa');
  });

  it('grava o takt da origem escolhida', () => {
    const calc = { quantidade: '480', horas: '5.6' };
    expect(taktMsDoEstudo({ origem: 'programa', programa: { taktMs: 42000.4 }, calc })).toBe(42000);
    expect(taktMsDoEstudo({ origem: 'manual', programa: { taktMs: 99000 }, calc })).toBe(42000);
    expect(taktMsDoEstudo({ origem: 'programa', programa: null, calc: { quantidade: '', horas: '8.8' } })).toBeNull();
  });
});

describe('conta de uma maquina na semana', () => {
  it('jornada menos setup, e a subtracao escrita bate', () => {
    expect(contaDaMaquina({ jornadaPorMaquina: 44, setupPorMaquina: 1 })).toEqual({
      jornadaMin: 2640, setupMin: 60, produtivoMin: 2580,
      texto: 'Por máquina: 44h00min de jornada − 1h00min de setup planejado = 43h00min.',
    });
    // 25 setups x 20 min = 8,333 h: arredondar cada um daria 35h41min.
    expect(contaDaMaquina({ jornadaPorMaquina: 44, setupPorMaquina: 25 * 20 / 60 }).texto)
      .toBe('Por máquina: 44h00min de jornada − 8h20min de setup planejado = 35h40min.');
  });
  it('setup zero e setup nao cadastrado sao coisas diferentes', () => {
    expect(contaDaMaquina({ jornadaPorMaquina: 44, setupPorMaquina: 0 }).texto)
      .toBe('Por máquina: 44h00min de jornada, sem setup planejado.');
    expect(contaDaMaquina({ jornadaPorMaquina: 44, setupPorMaquina: null }).texto)
      .toMatch(/setup planejado do grupo não está cadastrado/);
  });
  it('sem jornada nao ha conta', () => {
    expect(contaDaMaquina({ jornadaPorMaquina: null, setupPorMaquina: 1 })).toBeNull();
  });
});

describe('produto acompanha o grupo do posto', () => {
  const furadeira = [{ nome: 'LATERAL SLEEP' }, { nome: 'FUNDO SLEEP' }];
  const embalagem = [{ nome: 'RACK SIRIUS 1.6' }];
  it('produto da lista do grupo antigo sai ao trocar de grupo', () => {
    expect(produtoDeOutroGrupo({ produto: 'LATERAL SLEEP', antes: furadeira, depois: embalagem })).toBe(true);
  });
  it('produto que tambem esta no grupo novo fica', () => {
    expect(produtoDeOutroGrupo({ produto: 'LATERAL SLEEP', antes: furadeira, depois: furadeira })).toBe(false);
  });
  it('produto digitado a mao fica: e do analista', () => {
    expect(produtoDeOutroGrupo({ produto: 'Mesa nova', antes: furadeira, depois: embalagem })).toBe(false);
    expect(produtoDeOutroGrupo({ produto: 'Mesa nova', antes: [], depois: embalagem })).toBe(false);
  });
  it('sem produto, nada a limpar', () => {
    expect(produtoDeOutroGrupo({ produto: '', antes: furadeira, depois: embalagem })).toBe(false);
  });
});

describe('aviso sem programa', () => {
  const grupo = { codigo: '0002', nome: 'FURADEIRA' };
  it('antes do posto, diz o que fazer para o takt vir do programa', () => {
    expect(avisoSemPrograma({ recurso: '', grupo: null, estado: 'sem-grupo' })).toMatch(/Escolha o posto/);
  });
  it('nomeia o grupo e pede a demanda', () => {
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-demanda' }))
      .toBe('0002 · FURADEIRA não tem programa da semana: digite a demanda.');
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-semana' })).toMatch(/não cobre esta semana/);
  });
  it('posto fora do cadastro ou sem grupo', () => {
    expect(avisoSemPrograma({ recurso: 'Furadeira velha', grupo: null, estado: 'sem-grupo' })).toMatch(/sem grupo/);
  });
  it('com takt, nada a avisar', () => {
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'pronto' })).toBeNull();
  });
  /* Sem rede, o que o aparelho guardou pode ser de outra semana: o aviso
     culpa a rede, nao o programa do PCP. */
  it('sem rede, a culpa e da rede', () => {
    const semRede = 'Sem rede: o programa desta semana não chegou a este aparelho. Digite a demanda.';
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-semana', semRede: true })).toBe(semRede);
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-demanda', semRede: true })).toBe(semRede);
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-rede', semRede: true })).toBe(semRede);
  });
  it('sem cadastro no aparelho, nao diz que o posto nao tem grupo', () => {
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo: null, estado: 'sem-grupo', semCadastro: true }))
      .toBe('O cadastro de máquinas não chegou a este aparelho: digite a demanda.');
  });
  it('jornada cadastrada mas nenhuma maquina ativa: o aviso diz isso, nao "faltam as horas"', () => {
    expect(avisoSemPrograma({
      recurso: 'FURADEIRA 04', grupo: { ...grupo, horas_semana: '44.00' }, estado: 'sem-horas', maquinasDoGrupo: 0,
    })).toBe('0002 · FURADEIRA não tem máquina ativa no cadastro: digite a demanda.');
    expect(avisoSemPrograma({ recurso: 'FURADEIRA 04', grupo, estado: 'sem-horas', maquinasDoGrupo: 3 }))
      .toMatch(/Faltam as horas da semana/);
  });
});

describe('programaDoTakt', () => {
  const grupo = { id: 'g2', codigo: '0002', nome: 'FURADEIRA' };
  const takt = { taktMs: 42000, semana: '043-26', demanda: 6000, horasPorMaquina: 40, estado: 'pronto' };
  it('monta o que o painel mostra, com a unidade do grupo', () => {
    expect(programaDoTakt({ grupo, maquinasDoGrupo: 3, takt: { ...takt, jornadaPorMaquina: 44, setupPorMaquina: 4 } }))
      .toEqual({
        taktMs: 42000, semana: '043-26', demanda: 6000, horasPorMaquina: 40, jornadaPorMaquina: 44,
        setupPorMaquina: 4, casadoPorData: true, confirmado: true, semRede: false, maquinas: 3,
        grupo: '0002 · FURADEIRA', unidade: expect.objectContaining({ singular: 'peça' }),
      });
    expect(programaDoTakt({ grupo: { ...grupo, nome: 'EMBALAGEM' }, maquinasDoGrupo: 1, takt }).unidade.singular)
      .toBe('volume');
  });
  it('sem grupo ou sem takt, nao ha programa', () => {
    expect(programaDoTakt({ grupo: null, maquinasDoGrupo: 0, takt })).toBeNull();
    expect(programaDoTakt({ grupo, maquinasDoGrupo: 3, takt: { taktMs: null, estado: 'sem-demanda' } })).toBeNull();
  });
});

/**
 * QUANDO limpar o produto: so' quando o ANALISTA troca o posto para outro
 * grupo conhecido. Passar por "sem grupo" no meio da digitacao, ou o
 * cadastro do servidor mudar sozinho, apagava o produto gravado.
 */
describe('quando limpar o produto', () => {
  const furadeira = [{ nome: 'LATERAL SLEEP' }];
  const embalagem = [{ nome: 'RACK SIRIUS 1.6' }];
  const base = {
    recursoAntes: 'FURADEIRA 04', grupoConhecido: 'g2', produto: 'LATERAL SLEEP', produtosConhecidos: furadeira,
  };
  it('troca de posto para outro grupo: limpa', () => {
    expect(deveLimparProduto({ ...base, recurso: 'EMBALADORA 01', grupoId: 'g5', produtos: embalagem })).toBe(true);
  });
  it('posto no meio da digitacao (sem grupo): nao limpa', () => {
    expect(deveLimparProduto({ ...base, recurso: 'FURAD', grupoId: null, produtos: [] })).toBe(false);
    expect(deveLimparProduto({ ...base, recurso: '', grupoId: null, produtos: [] })).toBe(false);
  });
  it('volta ao mesmo grupo: nao limpa', () => {
    expect(deveLimparProduto({ ...base, recursoAntes: 'FURAD', recurso: 'FURADEIRA 04', grupoId: 'g2', produtos: furadeira }))
      .toBe(false);
  });
  it('o cadastro mudou sozinho (mesmo posto): nao limpa', () => {
    expect(deveLimparProduto({ ...base, recurso: 'FURADEIRA 04', grupoId: 'g5', produtos: embalagem })).toBe(false);
  });
  it('produto digitado a mao: nao limpa', () => {
    expect(deveLimparProduto({ ...base, produto: 'Mesa nova', recurso: 'EMBALADORA 01', grupoId: 'g5', produtos: embalagem }))
      .toBe(false);
  });
});

describe('programa lido preso ao grupo', () => {
  it('o programa de um grupo nao vale para outro, nem por um instante', () => {
    const lido = { grupoId: 'g2', demandas: [{ ano: 2026, numero: 43, pecas: 6600 }], semRede: false, doServidor: true };
    expect(programaLido(lido, 'g2')).toBe(lido);
    const outro = programaLido(lido, 'g4');
    expect(outro.grupoId).toBe('g4');
    expect(outro.demandas).toBeNull();
    expect(outro.doServidor).toBe(false);
  });
});

describe('demanda por maquina', () => {
  it('a parte de uma maquina, para os dois cartoes fecharem a conta', () => {
    expect(demandaPorMaquina({ demanda: 6600, maquinas: 6 })).toEqual({ valor: 1100, texto: '1.100', semana: '6.600' });
    expect(demandaPorMaquina({ demanda: 2200, maquinas: 3 }).texto).toBe('733,3');
    expect(demandaPorMaquina({ demanda: 2200, maquinas: 0 })).toBeNull();
  });
});
