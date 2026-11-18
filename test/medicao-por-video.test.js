/**
 * MEDICAO POR VIDEO — as contas que transformam tempos do video na mesma
 * medicao que o tablet manda.
 *
 * O que se prova: as marcas ficam no relogio da linha rodando (a parada
 * marcada sai delas, como no cronometro ao vivo); o setup no trecho vai a
 * parte; a ordem dos toques nao importa; o periodo e' o da filmagem; o que
 * o tablet nao deixa fazer (volume durante parada) e' recusado com o
 * porque; e o resultado passa pelas MESMAS validacoes do servidor, sem
 * virar null em lugar nenhum.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PARADAS, OBS_LACUNA, emRelogio, inicioSugerido, lacunasDoVideo, marcarLacunasComoParada, marcasEmPalavras,
  marcasGuardadas, medicaoDoVideo, semMarcas,
} from '../src/domain/medicaoPorVideo.js';
import { leituraPecaAPeca } from '../src/domain/crono/intervalos.js';
import { conferenciaRapida, leituraPecaAPeca, periodoPorPeca } from '../src/domain/cronoanalise.js';
import {
  marcasDaConferencia, paradasDaConferencia, relogioDasMarcas, setupDasMarcas,
} from '../api/_lib/validar.js';

const INICIO = '2026-10-28T12:00:00.000Z';
const s = (seg) => seg * 1000;

describe('medicao a partir do video', () => {
  it('sem parada: periodo da largada ao Encerrar, uma marca por volume, periodo da filmagem', () => {
    const { medicao, motivo } = medicaoDoVideo({
      largadaMs: s(10), toquesMs: [s(70), s(130), s(190)], paradas: [], fimMs: s(200), inicioFilmagem: INICIO,
    });
    expect(motivo).toBeUndefined();
    expect(medicao).toEqual({
      duracaoMs: s(190),
      pecas: 3,
      marcasMs: [s(60), s(120), s(180)],
      marcasRelogioMs: s(120),
      marcasSetupMs: 0,
      paradas: [],
      // O servidor faz inicio = salvoEm - duracao: 12:00:10, a largada.
      salvoEm: '2026-10-28T12:03:20.000Z',
      iniciadoEm: '2026-10-28T12:00:10.000Z',
    });
  });

  it('a parada marcada sai das marcas seguintes (relogio rodando), como no tablet', () => {
    // Faltou caixa de 100 s a 120 s, entre o 2o e o 3o volume.
    const { medicao } = medicaoDoVideo({
      largadaMs: s(10), toquesMs: [s(70), s(130), s(190)],
      paradas: [{ motivo: 'falta_de_caixa', inicioMs: s(100), fimMs: s(120) }],
      fimMs: s(200), inicioFilmagem: INICIO,
    });
    expect(medicao.marcasMs).toEqual([s(60), s(100), s(160)]);
    // O relogio entre o 1o e o ultimo volume vai COM a parada dentro.
    expect(medicao.marcasRelogioMs).toBe(s(120));
    expect(medicao.marcasSetupMs).toBe(0);
    expect(medicao.paradas).toEqual([{ motivo: 'falta_de_caixa', duracaoMs: s(20) }]);
    // A mesma regua do takt do tablet: relogio / (N - 1), paradas dentro.
    expect(periodoPorPeca({ relogioEntreMarcasMs: medicao.marcasRelogioMs, volumes: medicao.pecas })).toBe(s(60));
  });

  it('setup: o do trecho entre o 1o e o ultimo volume vai a parte; o de antes, nao', () => {
    const { medicao } = medicaoDoVideo({
      largadaMs: s(0),
      toquesMs: [s(60), s(120), s(240)],
      paradas: [
        { motivo: 'setup', inicioMs: s(20), fimMs: s(40) }, // antes do 1o volume
        { motivo: 'setup', inicioMs: s(150), fimMs: s(180) }, // no trecho
      ],
      fimMs: s(250), inicioFilmagem: INICIO,
    });
    expect(medicao.marcasMs).toEqual([s(40), s(100), s(190)]);
    expect(medicao.marcasSetupMs).toBe(s(30));
    expect(medicao.paradas.map((p) => p.duracaoMs)).toEqual([s(20), s(30)]);
  });

  it('marcar fora de ordem (voltando o video) da a mesma medicao', () => {
    const base = { largadaMs: s(5), paradas: [], fimMs: s(100), inicioFilmagem: INICIO };
    const emOrdem = medicaoDoVideo({ ...base, toquesMs: [s(20), s(40), s(60)] });
    const foraDeOrdem = medicaoDoVideo({ ...base, toquesMs: [s(60), s(20), s(40)] });
    expect(foraDeOrdem).toEqual(emOrdem);
  });

  it('o que o tablet nao deixa fazer e recusado, com o porque', () => {
    const base = { largadaMs: s(10), toquesMs: [s(30), s(50)], paradas: [], fimMs: s(100), inicioFilmagem: INICIO };
    const recusa = (extra) => medicaoDoVideo({ ...base, ...extra }).motivo;
    expect(recusa({ paradas: [{ motivo: 'setup', inicioMs: s(40), fimMs: s(60) }] })).toMatch(/durante uma parada \(0:50.0/);
    expect(recusa({ paradas: [{ motivo: 'setup', inicioMs: s(60), fimMs: null }] })).toMatch(/sem o "Voltou"/);
    expect(recusa({
      paradas: [{ motivo: 'setup', inicioMs: s(55), fimMs: s(70) }, { motivo: 'outro', inicioMs: s(65), fimMs: s(80) }],
    })).toMatch(/se sobrepõem/);
    expect(recusa({ paradas: [{ motivo: 'setup', inicioMs: s(5), fimMs: s(20) }] })).toMatch(/fora do período/);
    expect(recusa({ toquesMs: [s(8), s(50)] })).toMatch(/antes da largada/);
    expect(recusa({ toquesMs: [s(30), s(120)] })).toMatch(/depois do Encerrar/);
    expect(recusa({ toquesMs: [] })).toMatch(/nenhum volume/);
    expect(recusa({ fimMs: s(10) })).toMatch(/depois da largada/);
    expect(recusa({ inicioFilmagem: '' })).toMatch(/filmagem começou/);
    expect(recusa({ inicioFilmagem: null })).toMatch(/filmagem começou/);
    expect(recusa({ largadaMs: null })).toMatch(/largada/);
    // O teto do servidor (50 paradas) recusado aqui, antes do Salvar.
    const muitas = Array.from({ length: 51 }, (_, i) => ({ motivo: 'outro', inicioMs: s(51 + i * 0.5), fimMs: s(51.2 + i * 0.5) }));
    expect(recusa({ toquesMs: [s(30), s(80)], paradas: muitas, fimMs: s(100) })).toMatch(/mais de 50 paradas/);
  });

  it('passa pelas validacoes do servidor sem virar null — o sync aceita como a do tablet', () => {
    const { medicao } = medicaoDoVideo({
      largadaMs: 12345.6, toquesMs: [74321.4, 130000, 191999.9, 250500],
      paradas: [{ motivo: 'setup', inicioMs: 140000, fimMs: 170000.4 }],
      fimMs: 260000, inicioFilmagem: INICIO,
    });
    const marcas = marcasDaConferencia(medicao.marcasMs, { pecas: medicao.pecas, duracaoMs: medicao.duracaoMs });
    expect(marcas).toEqual(medicao.marcasMs);
    const relogio = relogioDasMarcas(medicao.marcasRelogioMs, { marcas, duracaoMs: medicao.duracaoMs });
    expect(relogio).toBe(medicao.marcasRelogioMs);
    expect(setupDasMarcas(medicao.marcasSetupMs, { marcas, relogio })).toBe(medicao.marcasSetupMs);
    expect(paradasDaConferencia(medicao.paradas, 'conferencia'))
      .toEqual(medicao.paradas.map((p) => ({ ...p, observacao: null })));
    // E as contas do relatorio leem como leem as do tablet.
    expect(conferenciaRapida({ duracaoMs: medicao.duracaoMs, pecas: medicao.pecas, paradas: medicao.paradas }))
      .toMatchObject({ pecas: 4, paradaMs: 30000 });
    expect(leituraPecaAPeca({ marcasMs: medicao.marcasMs }).intervalos).toHaveLength(3);
  });
});

describe('apoio da tela', () => {
  it('tempo do video como o player mostra', () => {
    expect(emRelogio(0)).toBe('0:00.0');
    expect(emRelogio(83456)).toBe('1:23.4');
    expect(emRelogio(3723400)).toBe('1:02:03.4');
  });

  it('inicio sugerido: o arquivo e gravado no fim da filmagem; menos a duracao, o comeco', () => {
    const fim = Date.parse('2026-10-28T12:30:00.000Z');
    expect(inicioSugerido(fim, 1800).toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(inicioSugerido(fim, Infinity)).toBeNull();
    expect(inicioSugerido(undefined, 60)).toBeNull();
  });
});

describe('as teclas da marcacao', () => {
  // Importadas aqui: o bloco testa so' a marcacao, a conta ja' foi provada acima.
  const marcar = async () => import('../src/domain/medicaoPorVideo.js');

  it('Enter: a 1a vez e a largada; depois volumes, em ordem no video', async () => {
    const { marcacaoVazia, marcarToque } = await marcar();
    let m = marcacaoVazia();
    ({ marcacao: m } = marcarToque(m, 10000));
    expect(m.largadaMs).toBe(10000);
    ({ marcacao: m } = marcarToque(m, 70000.4));
    ({ marcacao: m } = marcarToque(m, 40000));
    expect(m.toques.map((t) => t.ms)).toEqual([40000, 70000]);
    // Antes da largada e o mesmo volume duas vezes: nao marca, e diz por que.
    expect(marcarToque(m, 5000).aviso).toMatch(/Antes da largada \(0:10.0\)/);
    expect(marcarToque(m, 40150).aviso).toMatch(/já está marcado/);
  });

  it('Desfazer tira o ultimo MARCADO (que pode ser anterior no video); sem volume, a largada', async () => {
    const { marcacaoVazia, marcarToque, desfazerUltimo } = await marcar();
    let m = marcacaoVazia();
    for (const ms of [10000, 70000, 40000]) ({ marcacao: m } = marcarToque(m, ms));
    ({ marcacao: m } = desfazerUltimo(m));
    expect(m.toques.map((t) => t.ms)).toEqual([70000]);
    ({ marcacao: m } = desfazerUltimo(m));
    ({ marcacao: m } = desfazerUltimo(m));
    expect(m.largadaMs).toBeNull();
    expect(desfazerUltimo(m).aviso).toMatch(/Nada para desfazer/);
  });

  it('Parou / Voltou: trava o volume com a linha parada e recusa o que o tablet nao deixaria', async () => {
    const {
      marcacaoVazia, marcarToque, iniciarParadaNoVideo, encerrarParadaNoVideo, removerParada, medicaoDoVideo,
    } = await marcar();
    let m = marcacaoVazia();
    expect(iniciarParadaNoVideo(m, 'setup', 5000).aviso).toMatch(/largada antes/);
    ({ marcacao: m } = marcarToque(m, 10000));
    ({ marcacao: m } = marcarToque(m, 30000));
    ({ marcacao: m } = iniciarParadaNoVideo(m, 'falta_de_caixa', 40000));
    expect(marcarToque(m, 45000).aviso).toMatch(/linha está parada/);
    expect(encerrarParadaNoVideo(m, 39000).aviso).toMatch(/depois do Parou/);
    ({ marcacao: m } = encerrarParadaNoVideo(m, 60000));
    expect(m.paradas).toEqual([{ motivo: 'falta_de_caixa', inicioMs: 40000, fimMs: 60000 }]);
    // Voltando o video: volume dentro da parada nao entra.
    expect(marcarToque(m, 50000).aviso).toMatch(/dentro de uma parada \(0:40.0 a 1:00.0\)/);
    ({ marcacao: m } = marcarToque(m, 90000));
    // A conta sai igual a do tablet: a parada sai da marca seguinte.
    const { medicao } = medicaoDoVideo({
      largadaMs: m.largadaMs, toquesMs: m.toques.map((t) => t.ms), paradas: m.paradas, fimMs: 100000,
      inicioFilmagem: INICIO,
    });
    expect(medicao.marcasMs).toEqual([20000, 60000]);
    // Volume ja' marcado dentro do intervalo de uma parada nova: recusa.
    ({ marcacao: m } = iniciarParadaNoVideo(m, 'setup', 70000));
    expect(encerrarParadaNoVideo(m, 95000).aviso).toMatch(/volume marcado dentro/);
    ({ marcacao: m } = removerParada(m, 70000));
    expect(m.aberta).toBeNull();
  });

  it('a 51a parada e\' recusada ao abrir, nao so\' no Encerrar (que recusaria a marcacao inteira)', async () => {
    const {
      marcacaoVazia, marcarToque, iniciarParadaNoVideo, encerrarParadaNoVideo, MAX_PARADAS,
    } = await marcar();
    let { marcacao: m } = marcarToque(marcacaoVazia(), 1000);
    for (let i = 0; i < MAX_PARADAS; i++) {
      ({ marcacao: m } = iniciarParadaNoVideo(m, 'outro', 10000 + i * 2000));
      ({ marcacao: m } = encerrarParadaNoVideo(m, 11000 + i * 2000));
    }
    expect(m.paradas).toHaveLength(MAX_PARADAS);
    const r = iniciarParadaNoVideo(m, 'outro', 500000);
    expect(r.aviso).toMatch(/Já são 50 paradas, o máximo numa medição/);
    expect(r.marcacao.aberta).toBeNull();
  });
});

describe('marcasGuardadas — o aviso ao voltar ao preparo (v2.108.1)', () => {
  const vazia = { largadaMs: null, toques: [], paradas: [], aberta: null, ordem: 0 };
  const toques = (n) => Array.from({ length: n }, (_, i) => ({ ms: (i + 2) * 10000, ordem: i }));
  it('sem nada marcado, nao promete marca nenhuma', () => {
    expect(marcasGuardadas(vazia)).toBe('Nenhuma marca ainda neste vídeo.');
  });
  it('so a largada', () => {
    expect(marcasGuardadas({ ...vazia, largadaMs: 10000 })).toBe('As marcas deste vídeo continuam aqui: a largada.');
  });
  it('singular e plural, com a parada aberta contando como parada', () => {
    expect(marcasGuardadas({ ...vazia, largadaMs: 10000, toques: toques(1), aberta: { motivo: null, inicioMs: 25000 } }))
      .toBe('As marcas deste vídeo continuam aqui: a largada, 1 volume e 1 parada.');
    expect(marcasGuardadas({
      ...vazia, largadaMs: 10000, toques: toques(8), paradas: [{ motivo: 'setup', inicioMs: 45000, fimMs: 60000 }],
    })).toBe('As marcas deste vídeo continuam aqui: a largada, 8 volumes e 1 parada.');
    expect(marcasGuardadas({
      ...vazia, largadaMs: 10000, toques: toques(3),
      paradas: [{ motivo: 'setup', inicioMs: 45000, fimMs: 60000 }], aberta: { motivo: null, inicioMs: 90000 },
    })).toBe('As marcas deste vídeo continuam aqui: a largada, 3 volumes e 2 paradas.');
  });
});

describe('as marcacoes guardadas no PC (v2.112.1): so a que tem marca', () => {
  const vazia = { largadaMs: null, toques: [], paradas: [], aberta: null, ordem: 0 };
  it('sem nada marcado e vazia; a largada, um volume ou uma parada (aberta ou fechada) ja nao', () => {
    expect(semMarcas(vazia)).toBe(true);
    expect(semMarcas(null)).toBe(true);
    expect(semMarcas({ ...vazia, largadaMs: 0 })).toBe(false);
    expect(semMarcas({ ...vazia, toques: [{ ms: 5000, ordem: 1 }] })).toBe(false);
    expect(semMarcas({ ...vazia, paradas: [{ motivo: 'setup', inicioMs: 1, fimMs: 2 }] })).toBe(false);
    expect(semMarcas({ ...vazia, aberta: { motivo: null, inicioMs: 1 } })).toBe(false);
  });
  it('em palavras, sem o "0 volumes" que escondia a largada', () => {
    expect(marcasEmPalavras(vazia)).toBe('');
    expect(marcasEmPalavras({ ...vazia, largadaMs: 1000 })).toBe('a largada');
    expect(marcasEmPalavras({ ...vazia, largadaMs: 1000, toques: [{ ms: 3000, ordem: 1 }, { ms: 5000, ordem: 2 }] }))
      .toBe('a largada e 2 volumes');
  });
});

describe('as LACUNAS do video e marcar sem motivo (v2.112.2)', () => {
  const seg = (x) => x * 1000;
  // Largada em 2 s, volumes a cada 5 s e um 20 s depois do anterior: 11 intervalos.
  const toques = [7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 72].map((x, i) => ({ ms: seg(x), ordem: i + 1 }));
  const m = { largadaMs: seg(2), toques, paradas: [], aberta: null, ordem: 11 };

  it('a lacuna e a do indicador (mais que o dobro do passo), no tempo do video', () => {
    const r = lacunasDoVideo(m);
    expect(r.suficiente).toBe(true);
    expect(r.normalMs).toBe(5000);
    expect(r.lacunas).toEqual([{ deMs: 52000, ateMs: 72000, excessoMs: 15000, parada: { inicioMs: 57000, fimMs: 72000 } }]);
  });

  it('menos de 10 intervalos: sem leitura, sem lacuna (como o Volume a volume)', () => {
    const r = lacunasDoVideo({ ...m, toques: toques.slice(0, 6) });
    expect(r.suficiente).toBe(false);
    expect(r.lacunas).toEqual([]);
    expect(lacunasDoVideo({ ...m, largadaMs: null })).toBeNull();
  });

  it('marcada sem motivo: parada OUTRO com a observacao; o intervalo volta ao passo e a lacuna some', () => {
    const r = marcarLacunasComoParada(m);
    expect(r.marcadas).toBe(1);
    expect(r.aviso).toBeNull();
    expect(r.marcacao.paradas).toEqual([{ motivo: 'outro', inicioMs: 57000, fimMs: 72000, observacao: OBS_LACUNA }]);
    expect(lacunasDoVideo(r.marcacao).lacunas).toEqual([]);
    const med = medicaoDoVideo({
      largadaMs: m.largadaMs, toquesMs: toques.map((t) => t.ms), paradas: r.marcacao.paradas, fimMs: seg(75),
      inicioFilmagem: '2026-11-18T08:00:00Z',
    }).medicao;
    // O que vai ao servidor: a parada com o excesso (15 s) e a observacao.
    expect(med.paradas).toEqual([{ motivo: 'outro', duracaoMs: 15000, observacao: OBS_LACUNA }]);
    // Nas marcas da linha rodando, o ultimo intervalo e' o passo (5 s): o
    // "sem as lacunas" nao muda e o "com a linha rodando" cai para ele.
    const leitura = leituraPecaAPeca({ marcasMs: med.marcasMs });
    expect(leitura.normalMs).toBe(5000);
    expect(leitura.mediaMs).toBe(5000);
    expect(leitura.lacunas).toEqual([]);
  });

  it('lacuna que ja tem parada marcada dentro nao e marcada de novo (fica para conferir)', () => {
    const comParada = { ...m, paradas: [{ motivo: 'setup', inicioMs: 60000, fimMs: 65000 }] };
    const r = lacunasDoVideo(comParada);
    expect(r.lacunas).toHaveLength(1);
    expect(r.lacunas[0].parada).toBeNull();
    const x = marcarLacunasComoParada(comParada);
    expect(x.marcadas).toBe(0);
    expect(x.marcacao).toBe(comParada);
  });

  it('com parada aberta, ou sem vaga (50 paradas), nao marca e diz por que', () => {
    expect(marcarLacunasComoParada({ ...m, aberta: { motivo: null, inicioMs: 73000 } }).aviso).toMatch(/parada aberta/);
    const cheias = Array.from({ length: MAX_PARADAS }, (_, i) => ({ motivo: 'outro', inicioMs: 80000 + i * 10, fimMs: 80005 + i * 10 }));
    expect(marcarLacunasComoParada({ ...m, paradas: cheias }).aviso).toMatch(/máximo/);
  });
});
