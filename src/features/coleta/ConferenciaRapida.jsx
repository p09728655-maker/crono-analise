import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALVO_MINIMO, cores, espaco, fonte, raio, sombra, tamanho, transicao } from '../../theme/tokens.js';
import {
  conferenciaRapida, duracaoEntreHoras, formatarCronometro, formatarDuracao, formatarSegundos,
} from '../../domain/cronoanalise.js';
import { TOQUE_MINIMO_MS } from '../../domain/estatistica.js';
import { useCronometro, useWakeLock, vibrar } from '../../lib/hooks.js';

/**
 * CONFERENCIA RAPIDA — hora inicial, hora final, pecas. Sem cadastro.
 *
 * Cenario: o analista PASSA pelo posto as 7:00, marca a hora, segue o
 * caminho dele, volta as 7:10, marca de novo, le o contador da maquina
 * (150 pecas) e a conta sai — 900 pc/h, ciclo medio 4s. Ninguem fica
 * parado segurando cronometro, entao o caminho principal e' o formulario
 * de horarios, com botao "Agora" para carimbar a hora na passada e campos
 * livres para digitar de cabeca depois do fato.
 *
 * O cronometro ao vivo continua na mesma tela, como alternativa, para
 * quem quer ficar diante da maquina contando peca a peca.
 *
 * Decisoes que vem desse cenario:
 *  - Nada e' gravado. Nem fila offline, nem servidor. Conferencia e'
 *    descartavel por definicao; registro e' papel do estudo. A tela diz
 *    isso com todas as letras para ninguem descobrir depois.
 *  - O resultado recalcula a cada tecla: preencheu os tres campos, a
 *    conta esta' na tela. Sem botao "calcular" — ele so' atrasaria.
 *  - A quantidade de pecas e' EDITAVEL tambem no resultado do cronometro,
 *    para quem cronometrou ao vivo mas contou pelo contador da maquina.
 *  - Mesma ergonomia da coleta: alvo gigante, vibracao, tema escuro,
 *    tela acesa enquanto cronometra.
 */
export default function ConferenciaRapida({ aoSair }) {
  const [fase, setFase] = useState('pronto'); // pronto | rodando | resultado
  const [pecas, setPecas] = useState(0);
  const [duracaoFinal, setDuracaoFinal] = useState(0);
  const [pecasFinais, setPecasFinais] = useState('0');
  const [pulso, setPulso] = useState(0);

  // Formulario de horarios (caminho principal).
  const [horaInicial, setHoraInicial] = useState('');
  const [horaFinal, setHoraFinal] = useState('');
  const [pecasPeriodo, setPecasPeriodo] = useState('');

  const rodando = fase === 'rodando';
  useWakeLock(rodando);
  const { decorrido, iniciar, parar } = useCronometro();
  const ultimoToqueRef = useRef(0);

  // Recarregar no meio da conferencia perderia o periodo cronometrado.
  useEffect(() => {
    if (!rodando) return undefined;
    const aoFechar = (ev) => { ev.preventDefault(); ev.returnValue = ''; };
    window.addEventListener('beforeunload', aoFechar);
    return () => window.removeEventListener('beforeunload', aoFechar);
  }, [rodando]);

  const comecar = useCallback(() => {
    setPecas(0);
    setFase('rodando');
    iniciar();
    vibrar(45);
  }, [iniciar]);

  const contarPeca = useCallback(() => {
    if (!rodando) return;
    // Mesma guarda de repique da coleta: dedo/luva encostando duas vezes.
    const agora = performance.now();
    if (agora - ultimoToqueRef.current < TOQUE_MINIMO_MS) return;
    ultimoToqueRef.current = agora;
    vibrar(45);
    setPulso((p) => p + 1);
    setPecas((n) => n + 1);
  }, [rodando]);

  const desfazer = useCallback(() => {
    setPecas((n) => Math.max(0, n - 1));
    vibrar([25, 40, 25]);
  }, []);

  const encerrar = useCallback(() => {
    const total = parar();
    setDuracaoFinal(total);
    setPecasFinais(String(pecas));
    setFase('resultado');
    vibrar([30, 40, 30]);
  }, [parar, pecas]);

  // Barra de espaco espelha o toque, como na coleta (teclado bluetooth).
  useEffect(() => {
    const aoTeclar = (ev) => {
      if (ev.code !== 'Space' || ev.repeat) return;
      // Sem preventDefault com um input focado: espaco tambem e' digitacao.
      if (ev.target?.tagName === 'INPUT') return;
      ev.preventDefault();
      if (rodando) contarPeca();
      else if (fase === 'pronto') comecar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fase, rodando, contarPeca, comecar]);

  const parcial = useMemo(
    () => conferenciaRapida({ duracaoMs: decorrido, pecas }),
    [decorrido, pecas],
  );

  const resultado = useMemo(
    () => conferenciaRapida({ duracaoMs: duracaoFinal, pecas: pecasFinais }),
    [duracaoFinal, pecasFinais],
  );

  // A conta dos horarios sai a cada tecla: preencheu, apareceu.
  const duracaoHoras = useMemo(
    () => duracaoEntreHoras(horaInicial, horaFinal),
    [horaInicial, horaFinal],
  );
  const resultadoHoras = useMemo(
    () => (duracaoHoras > 0 ? conferenciaRapida({ duracaoMs: duracaoHoras, pecas: pecasPeriodo }) : null),
    [duracaoHoras, pecasPeriodo],
  );

  const agoraHM = () => {
    const d = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  };

  return (
    <div style={{ ...est.tela, ...(rodando ? {} : est.telaRolavel) }}>
      <header style={est.cabecalho}>
        <button type="button" onClick={aoSair} style={est.botaoVoltar} aria-label="Voltar para a lista">
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={est.titulo}>Conferência rápida</div>
          <div style={est.subtitulo}>Sem cadastro · nada é gravado</div>
        </div>
        <span style={est.selo}>AVULSA</span>
      </header>

      {fase === 'pronto' && (
        <>
          <section style={est.formHoras} aria-label="Conferência por horários">
            <div style={est.linhaHoras}>
              <div style={est.campoHora}>
                <span style={est.rotuloCampo}>HORA INICIAL</span>
                <div style={est.horaComAgora}>
                  <input
                    type="time"
                    value={horaInicial}
                    onChange={(ev) => setHoraInicial(ev.target.value)}
                    style={est.inputHora}
                    aria-label="Hora inicial"
                  />
                  <button
                    type="button"
                    style={est.botaoAgora}
                    onClick={() => { setHoraInicial(agoraHM()); vibrar(30); }}
                  >
                    Agora
                  </button>
                </div>
              </div>
              <div style={est.campoHora}>
                <span style={est.rotuloCampo}>HORA FINAL</span>
                <div style={est.horaComAgora}>
                  <input
                    type="time"
                    value={horaFinal}
                    onChange={(ev) => setHoraFinal(ev.target.value)}
                    style={est.inputHora}
                    aria-label="Hora final"
                  />
                  <button
                    type="button"
                    style={est.botaoAgora}
                    onClick={() => { setHoraFinal(agoraHM()); vibrar(30); }}
                  >
                    Agora
                  </button>
                </div>
              </div>
            </div>

            <label style={est.campoHora}>
              <span style={est.rotuloCampo}>PEÇAS NO PERÍODO</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Ex: 150"
                value={pecasPeriodo}
                onChange={(ev) => setPecasPeriodo(ev.target.value)}
                style={est.inputPecasForm}
                aria-label="Peças no período"
              />
            </label>
          </section>

          {resultadoHoras && resultadoHoras.pecas > 0 ? (
            <section style={est.painelHoras} aria-label="Resultado dos horários">
              <div style={est.destaqueRitmo} aria-label="Ritmo do período">
                <span style={est.valorRitmo}>{Math.round(resultadoHoras.pecasPorHora)}</span>
                <span style={est.sufixoRitmo}>peças/hora</span>
              </div>
              <div style={est.linhaParcial}>
                <Parcial rotulo="Período" valor={formatarDuracao(duracaoHoras)} />
                <Parcial rotulo="Peças/min" valor={resultadoHoras.pecasPorMinuto.toFixed(1)} />
                <Parcial
                  rotulo="Ciclo médio"
                  valor={resultadoHoras.cicloMedioMs ? formatarSegundos(resultadoHoras.cicloMedioMs) : '—'}
                  sufixo="s/pç"
                />
              </div>
            </section>
          ) : (
            <section style={est.explicacao}>
              Passe pela máquina e toque <strong>Agora</strong> na chegada; na
              volta, toque <strong>Agora</strong> de novo, digite quantas peças
              saíram e a conta aparece aqui — peças/hora e ciclo médio. Também
              dá para digitar os horários depois, de cabeça.
            </section>
          )}

          <div style={est.divisorOu}>
            <span style={est.traco} />
            <span style={est.textoOu}>ou fique no posto e conte peça a peça</span>
            <span style={est.traco} />
          </div>

          <button type="button" onPointerDown={comecar} style={{ ...est.botaoGrande, ...est.botaoIniciar, ...est.botaoVivo }}>
            <span style={est.rotuloBotao}>▶ CRONOMETRAR AO VIVO</span>
          </button>
          <div style={est.rodape} />
        </>
      )}

      {rodando && (
        <>
          <section style={est.painelTempo} aria-label="Tempo decorrido">
            <span style={est.rotuloTempo}>TEMPO</span>
            <span style={est.tempoCorrido}>{formatarCronometro(decorrido)}</span>
            <div style={est.linhaParcial}>
              <Parcial rotulo="Peças" valor={String(pecas)} />
              <Parcial rotulo="Ritmo" valor={parcial && pecas > 0 ? String(Math.round(parcial.pecasPorHora)) : '—'} sufixo="pç/h" />
              <Parcial rotulo="Ciclo médio" valor={parcial?.cicloMedioMs ? formatarSegundos(parcial.cicloMedioMs) : '—'} sufixo="s" />
            </div>
          </section>

          <button
            type="button"
            onPointerDown={contarPeca}
            style={{ ...est.botaoGrande, ...est.botaoContar }}
            aria-label="Contar uma peça"
          >
            <span key={pulso} style={est.contagem}>{pecas}</span>
            <span style={est.rotuloBotao}>TOQUE A CADA PEÇA</span>
            <span style={est.dicaBotao}>ou só cronometre e digite o total no fim</span>
          </button>

          <nav style={est.barraInferior} aria-label="Ações da conferência">
            <button type="button" style={est.botaoBarra} onClick={desfazer} disabled={!pecas}>
              <span style={est.iconeBarra}>↩</span>
              Desfazer
            </button>
            <button type="button" style={{ ...est.botaoBarra, ...est.botaoEncerrar }} onClick={encerrar}>
              <span style={est.iconeBarra}>■</span>
              Encerrar
            </button>
          </nav>
        </>
      )}

      {fase === 'resultado' && resultado && (
        <>
          <section style={est.painelResultado} aria-label="Resultado da conferência">
            <div style={est.linhaResultado}>
              <div style={est.blocoResultado}>
                <span style={est.rotuloTempo}>TEMPO CRONOMETRADO</span>
                <span style={est.valorTempo}>{formatarCronometro(duracaoFinal)}</span>
              </div>
              <label style={est.blocoResultado}>
                <span style={est.rotuloTempo}>PEÇAS NO PERÍODO</span>
                {/* Editavel de proposito: quem leu o contador da maquina
                    corrige aqui e o resultado recalcula na hora. */}
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={pecasFinais}
                  onChange={(ev) => setPecasFinais(ev.target.value)}
                  style={est.inputPecas}
                  aria-label="Peças no período"
                />
              </label>
            </div>

            <div style={est.destaqueRitmo} aria-label="Ritmo do período">
              <span style={est.valorRitmo}>{Math.round(resultado.pecasPorHora)}</span>
              <span style={est.sufixoRitmo}>peças/hora</span>
            </div>

            <div style={est.linhaParcial}>
              <Parcial rotulo="Peças/min" valor={resultado.pecasPorMinuto.toFixed(1)} />
              <Parcial
                rotulo="Ciclo médio"
                valor={resultado.cicloMedioMs ? formatarSegundos(resultado.cicloMedioMs) : '—'}
                sufixo="s/pç"
              />
            </div>
          </section>

          <section style={est.aviso}>
            Conferência não gravada. Para registrar ciclos e calcular o tempo
            padrão, crie um estudo.
          </section>

          <nav style={est.barraInferior} aria-label="Ações do resultado">
            <button type="button" style={est.botaoBarra} onClick={aoSair}>
              <span style={est.iconeBarra}>←</span>
              Sair
            </button>
            <button
              type="button"
              style={{ ...est.botaoBarra, ...est.botaoNova }}
              onClick={() => setFase('pronto')}
            >
              <span style={est.iconeBarra}>▶</span>
              Nova conferência
            </button>
          </nav>
        </>
      )}
    </div>
  );
}

function Parcial({ rotulo, valor, sufixo }) {
  return (
    <div style={est.parcial}>
      <span style={est.parcialRotulo}>{rotulo}</span>
      <span style={est.parcialValor}>
        {valor}
        {sufixo && <span style={est.parcialSufixo}>{sufixo}</span>}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ estilos */

const est = {
  tela: {
    height: '100dvh',
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: espaco.md,
    padding: espaco.md,
    paddingBottom: `calc(${espaco.md}px + env(safe-area-inset-bottom, 0px))`,
    background: cores.fundo,
    color: cores.texto,
    fontFamily: fonte.familia,
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },

  cabecalho: { display: 'flex', alignItems: 'center', gap: espaco.md, flexShrink: 0 },
  botaoVoltar: {
    width: 44, height: 44, flexShrink: 0,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.md, color: cores.texto, fontSize: 20, cursor: 'pointer',
  },
  titulo: {
    fontSize: tamanho.titulo, fontWeight: 700, lineHeight: 1.2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  subtitulo: {
    fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  selo: {
    flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '4px 8px',
    borderRadius: raio.sm, color: cores.textoFraco,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
  },

  // Fora da cronometragem ao vivo pode rolar: formulario com teclado aberto
  // em tela baixa nao pode cortar campo. Durante o ao vivo segue travado.
  telaRolavel: { overflowY: 'auto' },

  explicacao: {
    flexShrink: 0, padding: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.lg,
    fontSize: tamanho.corpo, color: cores.textoFraco, lineHeight: 1.5,
  },

  /* ---- conferencia por horarios (caminho principal) ---- */
  formHoras: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  linhaHoras: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.md },
  campoHora: { display: 'flex', flexDirection: 'column', gap: espaco.xs, minWidth: 0 },
  rotuloCampo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  // "Agora" embaixo do campo, nao ao lado: dividir 200px de coluna entre
  // input de hora e botao corta o valor ("07:00 AM" some pela metade).
  horaComAgora: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  inputHora: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums', outline: 'none',
    // Sem o esquema escuro o WebKit pinta o relogio interno preto no fundo
    // escuro e o campo parece vazio.
    colorScheme: 'dark',
  },
  botaoAgora: {
    width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  inputPecasForm: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.md}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero, outline: 'none',
  },
  painelHoras: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.md,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  divisorOu: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: espaco.md, padding: `${espaco.xs}px 0` },
  traco: { flex: 1, height: 1, background: cores.borda },
  textoOu: { fontSize: tamanho.legenda, color: cores.textoFraco },
  botaoVivo: { flex: '0 0 auto', minHeight: 72 },

  painelTempo: {
    flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.md,
  },
  rotuloTempo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  tempoCorrido: {
    fontSize: 48, fontWeight: 700, fontFamily: fonte.numero, lineHeight: 1.1,
    fontVariantNumeric: 'tabular-nums',
  },
  linhaParcial: {
    display: 'flex', gap: espaco.xl, justifyContent: 'center',
    marginTop: espaco.xs, width: '100%',
  },
  parcial: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 },
  parcialRotulo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  parcialValor: { fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, lineHeight: 1.1 },
  parcialSufixo: { fontSize: tamanho.legenda, color: cores.textoFraco, marginLeft: 3, fontWeight: 400 },

  botaoGrande: {
    flex: '1 1 auto', minHeight: 180,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: espaco.sm,
    border: 'none', borderRadius: raio.lg, cursor: 'pointer',
    fontFamily: fonte.familia, color: '#fff',
    boxShadow: sombra.alta, transition: `transform ${transicao.rapida}`,
    userSelect: 'none',
  },
  botaoIniciar: { background: `linear-gradient(160deg, ${cores.vermelho}, ${cores.bordeaux})` },
  botaoContar: { background: `linear-gradient(160deg, #1D4ED8, #1E3A8A)` },
  iconeIniciar: { fontSize: 56, lineHeight: 1 },
  contagem: {
    fontSize: tamanho.cronometro, fontWeight: 700, fontFamily: fonte.numero,
    lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums',
  },
  rotuloBotao: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, opacity: 0.92 },
  dicaBotao: { fontSize: tamanho.legenda, opacity: 0.75 },

  barraInferior: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm, flexShrink: 0 },
  botaoBarra: {
    minHeight: ALVO_MINIMO,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    color: cores.texto, fontSize: tamanho.legenda, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoEncerrar: { borderColor: cores.critico, color: cores.critico },
  botaoNova: { borderColor: cores.ok, color: cores.ok },
  iconeBarra: { fontSize: 18, lineHeight: 1 },

  painelResultado: {
    flex: '1 1 auto', minHeight: 0,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: espaco.lg,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.lg,
  },
  linhaResultado: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.md },
  blocoResultado: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs },
  valorTempo: {
    fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums', lineHeight: 1.4,
  },
  inputPecas: {
    width: '100%', maxWidth: 140, minHeight: 44, textAlign: 'center',
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, outline: 'none',
  },
  destaqueRitmo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
    padding: `${espaco.lg}px 0`,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: cores.borda,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: cores.borda,
  },
  valorRitmo: {
    fontSize: tamanho.cronometro, fontWeight: 700, fontFamily: fonte.numero,
    lineHeight: 1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums', color: cores.ok,
  },
  sufixoRitmo: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, color: cores.textoFraco },

  aviso: {
    flexShrink: 0, padding: espaco.md, textAlign: 'center',
    fontSize: tamanho.legenda, color: cores.textoFraco, lineHeight: 1.5,
    background: cores.atencaoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.atencao,
  },

  rodape: { flexShrink: 0, height: espaco.md },
};
