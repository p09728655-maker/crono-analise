/**
 * OS VOLUMES QUE AS LACUNAS ROUBARAM (v2.99.5) — a parada que ninguem
 * marcou vira numero, ao lado (e nao somada) dos roubados pelas paradas.
 */
import { describe, expect, it } from 'vitest';
import { leituraPecaAPeca, unidadeDoPosto } from '../src/domain/cronoanalise.js';
import { numerosDaLeitura, roubadosPelasLacunas } from '../src/domain/volumeAVolume.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');
const marcasDe = (intervalosS) => {
  const marcas = [0];
  for (const s of intervalosS) marcas.push(marcas[marcas.length - 1] + s * 1000);
  return marcas;
};

describe('roubadosPelasLacunas', () => {
  // 12 volumes a cada 60 s e uma lacuna de 200 s: excesso 140 s / 60 s = 2,33.
  const comLacuna = leituraPecaAPeca({ marcasMs: marcasDe([60, 60, 60, 60, 60, 60, 200, 60, 60, 60, 60, 60, 60]) });

  it('o tempo alem do normal / o normal, arredondado: 140 s / 60 s = 2', () => {
    expect(roubadosPelasLacunas(comLacuna)).toEqual({ roubados: 2, excessoMs: 140000, passoMs: 60000, n: 1 });
  });

  it('a lacuna sempre custa ao menos um volume: passou do dobro do normal', () => {
    // 21 s numa linha de 10 s (50 intervalos, para a media da 1a volta nao
    // esconder a lacuna): excesso 11 s -> 1,1 volume.
    const l = leituraPecaAPeca({ marcasMs: marcasDe([...Array(25).fill(10), 21, ...Array(25).fill(10)]) });
    expect(roubadosPelasLacunas(l).roubados).toBe(1);
  });

  it('sem lacuna ou sem leitura, null — a tela nao escreve "0 roubados"', () => {
    expect(roubadosPelasLacunas(leituraPecaAPeca({ marcasMs: marcasDe(Array(12).fill(60)) }))).toBeNull();
    expect(roubadosPelasLacunas(leituraPecaAPeca({ marcasMs: marcasDe([60, 60, 200]) }))).toBeNull();
    expect(roubadosPelasLacunas(null)).toBeNull();
  });

  it('o cartao Lacunas diz os volumes; o "sem as lacunas" tem o nome das outras camadas', () => {
    const k = Object.fromEntries(numerosDaLeitura(comLacuna, {}, VOLUME).map((x) => [x.chave, x]));
    expect(k.lacunas.sub).toBe('2min20s além do normal · ≈2 volumes não embalados');
    expect(k.normal.rotulo).toBe('Por volume sem as lacunas');
    expect(k.normal.valor).toBe('60.0 s');
  });
});
