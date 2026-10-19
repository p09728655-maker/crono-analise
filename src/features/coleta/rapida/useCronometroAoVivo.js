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
 *
 * As MARCAS sao o instante de cada toque, em ms desde o comeco, no RELOGIO
 * DA LINHA RODANDO: o tempo das paradas marcadas aqui sai delas. E' o que
 * deixa o PC ver o intervalo volume a volume (ver domain/crono/intervalos.js)
 * — e, com a parada marcada fora, intervalo grande que sobra e' parada que
 * ninguem marcou. Desfazer tira a ultima, como tira da contagem.
 *
 * O RELOGIO ENTRE MARCAS e' o tempo de relogio, paradas dentro, entre o
 * primeiro e o ultimo toque. E' dele que sai o tempo por volume que se
 * compara com o takt (ver periodoPorPeca): entre o primeiro e o ultimo
 * toque ha' exatamente N-1 volumes, sem a sobra antes do primeiro e depois
 * do ultimo que a duracao inteira traz. E nao conta duas vezes a parada
 * anotada depois do periodo — ela ja' esta' dentro do relogio.
 *
 * O SETUP ENTRE MARCAS e' o setup marcado ao vivo que caiu DENTRO desse
 * trecho. E' so' ele que pode sair do relogio quando o grupo tem setup
 * planejado: a troca costuma vir ANTES do primeiro volume do produto novo,
 * fora do trecho, e descontar o setup da medicao inteira tirava do relogio
 * um tempo que ele nunca conteve (revisao de 19/10).
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
  const [marcasFinais, setMarcasFinais] = useState([]);
  // O intervalo entre os DOIS ULTIMOS toques — o que a Embalagem Takt Time
  // mostra enquanto o cronometro roda. Null antes do segundo toque.
  const [ultimoIntervaloMs, setUltimoIntervaloMs] = useState(null);
  const [relogioEntreMarcasMs, setRelogioEntreMarcasMs] = useState(null);
  const [setupEntreMarcasMs, setSetupEntreMarcasMs] = useState(null);

  const rodando = fase === 'rodando';
  const { decorrido, iniciar, parar } = useCronometro();
  const ultimoToqueRef = useRef(0);
  // Ref, nao estado: o toque precisa da lista na hora, sem esperar render.
  const marcasRef = useRef([]);
  // O instante BRUTO de cada toque (paradas dentro), so' para o relogio
  // entre o primeiro e o ultimo — as marcas gravadas sao as do relogio rodando.
  const brutasRef = useRef([]);
  // Setup ao vivo ja' encerrado, em ms, e o valor dele em cada toque: a
  // diferenca entre o ultimo e o primeiro e' o setup dentro do trecho.
  const setupAcumuladoRef = useRef(0);
  const setupNoToqueRef = useRef([]);
  const inicioRef = useRef(0);
  // Parada ja' encerrada neste periodo, em ms — sai do relogio das marcas.
  const paradaAcumuladaRef = useRef(0);

  const comecar = useCallback(() => {
    setPecas(0);
    marcasRef.current = [];
    brutasRef.current = [];
    setupNoToqueRef.current = [];
    paradaAcumuladaRef.current = 0;
    setupAcumuladoRef.current = 0;
    setUltimoIntervaloMs(null);
    setRelogioEntreMarcasMs(null);
    setSetupEntreMarcasMs(null);
    // O cronometro ao vivo mede o periodo inteiro; um setup que estivesse
    // correndo no formulario pertencia ao periodo anterior.
    paradas.limpar();
    setFase('rodando');
    inicioRef.current = performance.now();
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
    const toque = momentoDoToque({
      agora, inicio: inicioRef.current,
      paradaAcumulada: paradaAcumuladaRef.current, setupAcumulado: setupAcumuladoRef.current,
    });
    marcasRef.current.push(toque.marca);
    brutasRef.current.push(toque.bruta);
    setupNoToqueRef.current.push(toque.setup);
    setUltimoIntervaloMs(ultimoIntervalo(marcasRef.current));
    setRelogioEntreMarcasMs(entrePrimeiraEUltima(brutasRef.current));
    setSetupEntreMarcasMs(entrePrimeiraEUltima(setupNoToqueRef.current));
    vibrar(45);
    setPulso((p) => p + 1);
    setPecas((n) => n + 1);
  }, [rodando, emParada]);

  const desfazer = useCallback(() => {
    marcasRef.current.pop();
    brutasRef.current.pop();
    setupNoToqueRef.current.pop();
    setUltimoIntervaloMs(ultimoIntervalo(marcasRef.current));
    setRelogioEntreMarcasMs(entrePrimeiraEUltima(brutasRef.current));
    setSetupEntreMarcasMs(entrePrimeiraEUltima(setupNoToqueRef.current));
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
    const ms = duracaoDaParada(emParada.inicio, performance.now());
    // Menos de 1s e' toque errado, nao parada. Duas casas no minuto: um
    // setup de 45s precisa entrar como 0,75 — arredondar para 0,8 jogaria
    // 3 segundos dentro do tempo de maquina rodando.
    if (ms >= 1000) {
      paradas.adicionar(emParada.motivo, (ms / 60000).toFixed(2));
      paradaAcumuladaRef.current += ms;
      if (emParada.motivo === 'setup') setupAcumuladoRef.current += ms;
    }
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
    // Nenhuma marca passa do fim do periodo: o servidor recusaria todas.
    setMarcasFinais(marcasRef.current.map((m) => Math.min(m, Math.floor(total))));
    const entre = entrePrimeiraEUltima(brutasRef.current);
    setRelogioEntreMarcasMs(entre == null ? null : Math.min(entre, Math.floor(total)));
    // Parada aberta no Encerrar cai DEPOIS do ultimo toque: fora do trecho.
    setSetupEntreMarcasMs(entrePrimeiraEUltima(setupNoToqueRef.current));
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
      // Sem preventDefault com um campo focado: espaco tambem e' digitacao.
      // TEXTAREA e' a observacao — sem esta guarda, um espaco no meio de
      // "operador novo" iniciava o cronometro ao vivo.
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName)) return;
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
    fase, rodando, decorrido, pecas, pulso, duracaoFinal, pecasFinais, setPecasFinais, marcasFinais,
    ultimoIntervaloMs, relogioEntreMarcasMs, setupEntreMarcasMs,
    emParada, tempoParadaAtual, escolhendoMotivo, setEscolhendoMotivo,
    comecar, contarPeca, desfazer, iniciarParada, encerrarParada, encerrar, novaConferencia,
  };
}

const ultimoIntervalo = (marcas) => (marcas.length >= 2
  ? marcas[marcas.length - 1] - marcas[marcas.length - 2]
  : null);

const entrePrimeiraEUltima = (brutas) => (brutas.length >= 2
  ? brutas[brutas.length - 1] - brutas[0]
  : null);

/**
 * A ARITMETICA DO TOQUE, fora do hook para ser testada com decimal.
 *
 * Tudo em ms INTEIRO, e a parada arredondada UMA vez, na origem
 * (duracaoDaParada). Com a parada acumulada inteira, `bruta - marca` e'
 * exatamente a parada acumulada — Math.round(x - P) = Math.round(x) - P
 * quando P e' inteiro. E e' isso que o servidor confere: o setup no trecho
 * nao pode passar do que o trecho parou (bruta - marca entre o primeiro e o
 * ultimo toque). Arredondando a soma em vez de cada parada, o setup passava
 * do parado por 1 ms em 12,6% das medicoes, o servidor descartava o
 * desconto e tablet e PC mostravam tempos diferentes (revisao de 19/10).
 */
export const duracaoDaParada = (inicio, fim) => Math.round(fim - inicio);

export function momentoDoToque({
  agora, inicio, paradaAcumulada, setupAcumulado,
}) {
  const bruta = Math.round(agora - inicio);
  return { bruta, marca: bruta - paradaAcumulada, setup: setupAcumulado };
}
