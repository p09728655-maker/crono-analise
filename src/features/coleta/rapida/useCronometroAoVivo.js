/**
 * O CRONOMETRO AO VIVO — para quem fica no posto contando peca a peca.
 *
 * Tres fases: pronto (formulario na tela), rodando (alvo gigante) e
 * resultado (o periodo fechou; pecas ainda editaveis). Mesma ergonomia da
 * coleta: guarda de repique, vibracao, barra de espaco espelhando o toque.
 *
 * A PARADA durante o cronometro nao para o relogio do periodo — o periodo
 * e' o que passou no relogio, e a parada esta' dentro dele. O que a pausa
 * faz e' registrar quanto desse periodo a maquina passou parada, e por que
 * (a linha vai para a lista de paradas, em minutos, ainda editavel).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TOQUE_MINIMO_MS } from '../../../domain/estatistica.js';
import { useCronometro, vibrar } from '../../../lib/hooks.js';

export function useCronometroAoVivo({ paradas }) {
  const [fase, setFase] = useState('pronto'); // pronto | rodando | resultado
  const [pecas, setPecas] = useState(0);
  const [duracaoFinal, setDuracaoFinal] = useState(0);
  const [pecasFinais, setPecasFinais] = useState('0');
  const [pulso, setPulso] = useState(0);
  const [emParada, setEmParada] = useState(null); // {motivo, inicio}
  const [escolhendoMotivo, setEscolhendoMotivo] = useState(false);

  const rodando = fase === 'rodando';
  const { decorrido, iniciar, parar } = useCronometro();
  const ultimoToqueRef = useRef(0);

  const comecar = useCallback(() => {
    setPecas(0);
    // O cronometro ao vivo mede o periodo inteiro; um setup que estivesse
    // correndo no formulario pertencia ao periodo anterior.
    paradas.limpar();
    setFase('rodando');
    iniciar();
    vibrar(45);
  }, [iniciar, paradas.limpar]);

  const contarPeca = useCallback(() => {
    if (!rodando) return;
    // Maquina parada nao produz peca: o toque aqui seria engano de dedo.
    if (emParada) return;
    // Mesma guarda de repique da coleta: dedo/luva encostando duas vezes.
    const agora = performance.now();
    if (agora - ultimoToqueRef.current < TOQUE_MINIMO_MS) return;
    ultimoToqueRef.current = agora;
    vibrar(45);
    setPulso((p) => p + 1);
    setPecas((n) => n + 1);
  }, [rodando, emParada]);

  const desfazer = useCallback(() => {
    setPecas((n) => Math.max(0, n - 1));
    vibrar([25, 40, 25]);
  }, []);

  const iniciarParada = useCallback((motivo) => {
    setEscolhendoMotivo(false);
    setEmParada({ motivo, inicio: performance.now() });
    vibrar([40, 60, 40]);
  }, []);

  const encerrarParada = useCallback(() => {
    if (!emParada) return;
    const ms = performance.now() - emParada.inicio;
    // Menos de 1s e' toque errado, nao parada. Duas casas no minuto: um
    // setup de 45s precisa entrar como 0,75 — arredondar para 0,8 jogaria
    // 3 segundos dentro do tempo de maquina rodando.
    if (ms >= 1000) paradas.adicionar(emParada.motivo, (ms / 60000).toFixed(2));
    setEmParada(null);
    vibrar(45);
  }, [emParada, paradas.adicionar]);

  const encerrar = useCallback(() => {
    // Encerrar com parada em curso fecha a parada primeiro: o tempo dela
    // ja' passou no relogio e nao pode virar tempo de maquina rodando.
    if (emParada) {
      const ms = performance.now() - emParada.inicio;
      if (ms >= 1000) paradas.adicionar(emParada.motivo, (ms / 60000).toFixed(2));
      setEmParada(null);
    }
    const total = parar();
    setDuracaoFinal(total);
    setPecasFinais(String(pecas));
    setFase('resultado');
    vibrar([30, 40, 30]);
  }, [parar, pecas, emParada, paradas.adicionar]);

  /** Do resultado de volta ao formulario, com o periodo zerado. */
  const novaConferencia = useCallback(() => {
    paradas.limpar();
    setFase('pronto');
  }, [paradas.limpar]);

  // Barra de espaco espelha o toque, como na coleta (teclado bluetooth).
  useEffect(() => {
    const aoTeclar = (ev) => {
      if (ev.code !== 'Space' || ev.repeat) return;
      // Sem preventDefault com um input focado: espaco tambem e' digitacao.
      if (ev.target?.tagName === 'INPUT') return;
      ev.preventDefault();
      if (escolhendoMotivo) return;
      if (rodando) contarPeca();
      else if (fase === 'pronto') comecar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fase, rodando, contarPeca, comecar, escolhendoMotivo]);

  // Cronometro da parada em curso. Lido no render de proposito: quem faz a
  // tela repintar e' o cronometro do periodo, que segue correndo durante a
  // parada — nao ha' segundo temporizador para manter em sincronia.
  const tempoParadaAtual = emParada ? performance.now() - emParada.inicio : 0;

  return {
    fase, rodando, decorrido, pecas, pulso, duracaoFinal, pecasFinais, setPecasFinais,
    emParada, tempoParadaAtual, escolhendoMotivo, setEscolhendoMotivo,
    comecar, contarPeca, desfazer, iniciarParada, encerrarParada, encerrar, novaConferencia,
  };
}
