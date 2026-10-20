/**
 * Painel Ritmo/Demanda — compartilhado entre cadastro manual e importacao.
 * As conversoes daqui viram numero gravado no estudo e texto impresso.
 */
import { describe, expect, it } from 'vitest';
import {
  CALC_PADRAO, avisoSemPrograma, contaDaMaquina, demandaPorMaquina, formatarHorasMin, formatarTakt,
  origemDoTakt, ressalvasDoPrograma, taktMsDoCalculo, taktMsDoEstudo,
} from '../src/components/RitmoDemanda.jsx';
import {
  conflitoDoProduto, conflitoDoTakt, programaDoTakt, programaLido,
} from '../src/lib/taktDaSemana.js';
import { motivoSemTakt } from '../src/features/coleta/embalagem/motivoSemTakt.js';

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
 * O PRODUTO TEM DE SER DO POSTO — conferido, nao adivinhado. Nada muda
 * sozinho quando o posto muda; a tela avisa e nao grava a combinacao.
 */
describe('produto do posto, conferido', () => {
  const g2 = { id: 'g2', codigo: '0002', nome: 'FURADEIRA' };
  const g5 = { id: 'g5', codigo: '0005', nome: 'EMBALAGEM' };
  const cadastro = {
    grupos: [g2, g5],
    produtos: [
      { id: 'p1', nome: 'LATERAL SLEEP', grupo_id: 'g2', ativo: true },
      { id: 'p3', nome: 'RACK SIRIUS 1.6', grupo_id: 'g5', ativo: true },
    ],
  };
  it('produto do grupo do posto: tudo certo (pelo nome normalizado)', () => {
    expect(conflitoDoProduto({ produto: 'LATERAL SLEEP', recurso: 'FURADEIRA 04', cadastro, grupo: g2 })).toBeNull();
    expect(conflitoDoProduto({ produto: 'lateral  sleep', recurso: 'FURADEIRA 04', cadastro, grupo: g2 })).toBeNull();
  });
  it('produto de outro grupo: avisa, nomeando os dois grupos', () => {
    expect(conflitoDoProduto({ produto: 'LATERAL SLEEP', recurso: 'EMBALADORA 01', cadastro, grupo: g5 }).texto)
      .toBe('LATERAL SLEEP é produto do 0002 · FURADEIRA, e o posto EMBALADORA 01 é do 0005 · EMBALAGEM. '
        + 'Escolha um produto deste posto, ou troque o posto.');
  });
  it('posto sem grupo ou fora do cadastro com produto de um grupo: avisa', () => {
    expect(conflitoDoProduto({ produto: 'LATERAL SLEEP', recurso: 'SERRA 02', cadastro, grupo: null }).texto)
      .toMatch(/o posto SERRA 02 não é desse grupo/);
  });
  it('produto digitado a mao (de lista nenhuma) e sem cadastro: passa', () => {
    expect(conflitoDoProduto({ produto: 'Mesa nova', recurso: 'EMBALADORA 01', cadastro, grupo: g5 })).toBeNull();
    expect(conflitoDoProduto({ produto: 'LATERAL SLEEP', recurso: 'EMBALADORA 01', cadastro: { produtos: [] }, grupo: g5 }))
      .toBeNull();
    expect(conflitoDoProduto({ produto: '', recurso: 'EMBALADORA 01', cadastro, grupo: g5 })).toBeNull();
  });
});

describe('takt do programa no Editar, conferido', () => {
  const g2 = { id: 'g2', codigo: '0002', nome: 'FURADEIRA' };
  const g5 = { id: 'g5', codigo: '0005', nome: 'EMBALAGEM' };
  const marca = { grupoId: 'g2', grupo: '0002 · FURADEIRA', escrito: '144.0' };
  it('no grupo em que foi clicado: tudo certo', () => {
    expect(conflitoDoTakt({ marca, grupo: g2, taktSeg: '144.0' })).toBeNull();
  });
  it('posto em outro grupo, sem grupo ou fora do cadastro: avisa', () => {
    expect(conflitoDoTakt({ marca, grupo: g5, taktSeg: '144.0' }).texto)
      .toBe('Este takt (144.0 s) veio do programa do 0002 · FURADEIRA, e o posto agora é do 0005 · EMBALAGEM. '
        + 'Digite o takt ou use o programa do grupo do posto.');
    expect(conflitoDoTakt({ marca, grupo: null, taktSeg: '144.0' }).texto).toMatch(/não é desse grupo/);
  });
  it('numero diferente do escrito (o analista digitou) ou sem marca: passa', () => {
    expect(conflitoDoTakt({ marca, grupo: g5, taktSeg: '150' })).toBeNull();
    expect(conflitoDoTakt({ marca: null, grupo: g5, taktSeg: '144.0' })).toBeNull();
  });
});

describe('ressalvas do programa e motivos sem rede', () => {
  it('programa guardado e semana casada pelo numero viram texto, com risco e acao', () => {
    expect(ressalvasDoPrograma({ confirmado: true, casadoPorData: true })).toEqual([]);
    expect(ressalvasDoPrograma({ confirmado: false, semRede: true })[0]).toMatch(/sem rede para conferir/);
    expect(ressalvasDoPrograma({ confirmado: false, semRede: false })[0]).toMatch(/conferindo com o servidor/);
    expect(ressalvasDoPrograma({ confirmado: true, casadoPorData: false })[0]).toMatch(/feriado.*coluna INÍCIO/);
  });
  it('tablet sem rede na virada da semana culpa a rede, nao o programa', () => {
    expect(motivoSemTakt('sem-semana', { semRede: true })).toMatch(/^Sem rede/);
    expect(motivoSemTakt('sem-semana')).toBe('O programa da embalagem não cobre esta semana.');
  });
  it('cadastro: buscando, nao chegou, fora do cadastro e sem grupo sao avisos diferentes', () => {
    const base = { recurso: 'FURADEIRA 04', grupo: null, estado: 'sem-grupo' };
    expect(avisoSemPrograma({ ...base, buscandoCadastro: true })).toBe('Buscando o cadastro de máquinas…');
    expect(avisoSemPrograma({ ...base, semCadastro: true })).toMatch(/não chegou a este aparelho/);
    expect(avisoSemPrograma({ ...base, noCadastro: false })).toBe('Posto fora do cadastro de máquinas: digite a demanda.');
    expect(avisoSemPrograma({ ...base, noCadastro: true })).toBe('Posto sem grupo no cadastro de máquinas: digite a demanda.');
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
