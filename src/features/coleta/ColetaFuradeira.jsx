import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALVO_MINIMO, cores, espaco, fonte, raio, sombra, tamanho, transicao } from '../../theme/tokens.js';
import { calcularOperacao, formatarCronometro, formatarSegundos, MOTIVOS_PARADA } from '../../domain/cronoanalise.js';
import { TOQUE_MINIMO_MS, ultimaObservacaoAtipica } from '../../domain/estatistica.js';
import { enfileirar, novoId } from '../../lib/filaOffline.js';
import { useCronometro, useOnline, useWakeLock, vibrar } from '../../lib/hooks.js';

/**
 * TELA DE COLETA — posto da furadeira.
 *
 * Usuario: analista de tempos, EM PE', diante da maquina, tablet na bancada
 * ou na mao, as vezes de luva, com ruido alto e iluminacao irregular.
 *
 * Tarefa unica: marcar o fim de cada ciclo. Tudo o mais e' secundario.
 *
 * Decisoes que vem desse contexto:
 *  - O botao de registro ocupa a maior parte da tela. Nao e' exagero
 *    estetico: com luva de raspa o toque perde precisao.
 *  - Confirmacao por vibracao, nao por som. Perto da furadeira nao se ouve.
 *  - Toque abaixo de 200ms e' recusado com aviso — e' repique de luva, nao
 *    ciclo. Recusar em silencio faria o analista achar que registrou.
 *  - O ciclo e' gravado em disco ANTES de tentar a rede.
 *  - Ciclo atipico e' sinalizado na hora, enquanto ainda da' para descartar.
 */
export default function ColetaFuradeira({ estudo, operacao, aoSair, aoRegistrar }) {
  const [tempos, setTempos] = useState(() => operacao?.tempos ?? []);
  const [rodada, setRodada] = useState(1);
  const [aviso, setAviso] = useState(null);
  const [pausa, setPausa] = useState(null);
  const [pulso, setPulso] = useState(0);

  const online = useOnline();
  const wakeLockSuportado = useWakeLock(true);
  const { decorrido, rodando, iniciar, marcarEReiniciar, parar, somarPausa } = useCronometro();
  const ultimoToqueRef = useRef(0);

  const toleranciaPct = Number(estudo?.tolerancia_pct ?? estudo?.toleranciaPct ?? 15);
  const metaObs = Number(estudo?.meta_obs ?? estudo?.metaObs ?? 10);

  const resultado = useMemo(
    () => calcularOperacao({ ...operacao, tempos }, toleranciaPct),
    [operacao, tempos, toleranciaPct],
  );

  const atipico = useMemo(() => ultimaObservacaoAtipica(tempos), [tempos]);
  const progresso = metaObs > 0 ? Math.min(100, ((resultado?.n ?? 0) / metaObs) * 100) : 0;

  // Aviso some sozinho: no chao de fabrica ninguem para para fechar alerta.
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  const registrar = useCallback(async () => {
    if (!rodando || pausa) return;

    // Guarda contra repique: dedo/luva encostando duas vezes no mesmo toque.
    const agora = performance.now();
    if (agora - ultimoToqueRef.current < TOQUE_MINIMO_MS) {
      vibrar([40, 60, 40]);
      setAviso({ tipo: 'atencao', texto: 'Toque muito rapido — ciclo nao registrado' });
      return;
    }
    ultimoToqueRef.current = agora;

    const duracao = marcarEReiniciar();
    if (duracao <= TOQUE_MINIMO_MS) {
      vibrar([40, 60, 40]);
      setAviso({ tipo: 'atencao', texto: 'Ciclo curto demais — descartado' });
      return;
    }

    vibrar(45);
    setPulso((p) => p + 1);
    setTempos((anteriores) => [...anteriores, duracao]);

    // Grava em disco primeiro. A rede vem depois, quando vier.
    const item = {
      tipo: 'observacao',
      clientId: novoId(),
      operacaoId: operacao.id,
      duracaoMs: Math.round(duracao),
      rodada,
      coletadoEm: new Date().toISOString(),
    };
    try {
      await enfileirar(item);
      aoRegistrar?.(item);
    } catch {
      setAviso({ tipo: 'critico', texto: 'Falha ao gravar localmente — verifique o dispositivo' });
    }
  }, [rodando, pausa, marcarEReiniciar, operacao, rodada, aoRegistrar]);

  const iniciarPausa = useCallback((motivo) => {
    setPausa({ motivo, inicio: performance.now(), iniciadoEm: new Date().toISOString() });
    vibrar([30, 40, 30]);
  }, []);

  const encerrarPausa = useCallback(async () => {
    if (!pausa) return;
    const duracao = performance.now() - pausa.inicio;
    // Descontamos do ciclo: o tempo parado nao e' tempo de trabalho e nao
    // pode inflar o TO. Ele e' registrado a' parte, como perda.
    somarPausa(duracao);
    setPausa(null);
    if (duracao > TOQUE_MINIMO_MS) {
      await enfileirar({
        tipo: 'parada',
        clientId: novoId(),
        operacaoId: operacao.id,
        motivo: pausa.motivo,
        duracaoMs: Math.round(duracao),
        iniciadoEm: pausa.iniciadoEm,
      }).catch(() => {});
    }
  }, [pausa, somarPausa, operacao]);

  const desfazerUltimo = useCallback(() => {
    if (!tempos.length) return;
    setTempos((t) => t.slice(0, -1));
    vibrar([25, 40, 25]);
    setAviso({ tipo: 'atencao', texto: 'Ultimo ciclo removido da tela' });
  }, [tempos.length]);

  // Barra de espaco espelha o botao: alguns analistas usam teclado bluetooth.
  useEffect(() => {
    const aoTeclar = (ev) => {
      if (ev.code !== 'Space' || ev.repeat) return;
      ev.preventDefault();
      if (rodando) registrar(); else iniciar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [rodando, registrar, iniciar]);

  return (
    <div style={est.tela}>
      <Cabecalho
        estudo={estudo}
        operacao={operacao}
        online={online}
        wakeLockSuportado={wakeLockSuportado}
        aoSair={aoSair}
      />

      <Metricas resultado={resultado} metaObs={metaObs} progresso={progresso} />

      {atipico && (
        <Faixa
          tipo="atencao"
          icone="!"
          titulo={`Ciclo atipico: ${formatarSegundos(atipico.valor)}s`}
          texto={`${atipico.acima ? 'Acima' : 'Abaixo'} do padrao (mediana ${formatarSegundos(atipico.mediana)}s). Confirme se houve interferencia antes de seguir.`}
          acao={{ rotulo: 'Descartar ciclo', aoClicar: desfazerUltimo }}
        />
      )}

      {aviso && <Faixa tipo={aviso.tipo} icone={aviso.tipo === 'critico' ? '×' : '!'} texto={aviso.texto} />}

      {pausa ? (
        <PainelPausa pausa={pausa} aoEncerrar={encerrarPausa} />
      ) : (
        <BotaoRegistro
          rodando={rodando}
          decorrido={decorrido}
          pulso={pulso}
          aoIniciar={iniciar}
          aoRegistrar={registrar}
        />
      )}

      <BarraInferior
        rodando={rodando}
        pausado={Boolean(pausa)}
        temTempos={tempos.length > 0}
        rodada={rodada}
        aoPausar={iniciarPausa}
        aoDesfazer={desfazerUltimo}
        aoTrocarRodada={() => { setRodada((r) => r + 1); setAviso({ tipo: 'ok', texto: `Rodada ${rodada + 1} iniciada` }); }}
        aoEncerrar={() => { parar(); aoSair?.(); }}
      />

      <UltimosCiclos tempos={tempos} resultado={resultado} />
    </div>
  );
}

/* ------------------------------------------------------------------ partes */

function Cabecalho({ estudo, operacao, online, wakeLockSuportado, aoSair }) {
  return (
    <header style={est.cabecalho}>
      <button type="button" onClick={aoSair} style={est.botaoVoltar} aria-label="Voltar para a lista de operacoes">
        ←
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={est.tituloOperacao}>{operacao?.nome || 'Operacao'}</div>
        <div style={est.subtitulo}>
          {[estudo?.recurso, estudo?.produto].filter(Boolean).join(' · ') || estudo?.nome}
        </div>
      </div>
      <div style={{ display: 'flex', gap: espaco.sm, alignItems: 'center' }}>
        {!wakeLockSuportado && (
          <span style={est.selo} title="Este navegador nao mantem a tela acesa automaticamente">
            TELA
          </span>
        )}
        {/* Status de rede nunca depende so' da cor: tem texto junto. */}
        <span style={{ ...est.selo, ...(online ? est.seloOk : est.seloAtencao) }}>
          {online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </header>
  );
}

function Metricas({ resultado, metaObs, progresso }) {
  const itens = [
    { rotulo: 'Ciclos', valor: resultado ? String(resultado.n) : '0', sufixo: metaObs ? `/ ${metaObs}` : '' },
    { rotulo: 'Media', valor: resultado ? formatarSegundos(resultado.toMed) : '—', sufixo: 's' },
    { rotulo: 'CV', valor: resultado ? resultado.cvPct.toFixed(1) : '—', sufixo: '%' },
    { rotulo: 'Cap/h', valor: resultado ? String(resultado.cap) : '—', sufixo: 'pc' },
  ];

  return (
    <section style={est.metricas} aria-label="Indicadores da coleta">
      <div style={est.linhaMetricas}>
        {itens.map((m) => (
          <div key={m.rotulo} style={est.metrica}>
            <span style={est.metricaRotulo}>{m.rotulo}</span>
            <span style={est.metricaValor}>
              {m.valor}
              <span style={est.metricaSufixo}>{m.sufixo}</span>
            </span>
          </div>
        ))}
      </div>
      <div style={est.trilha} role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ ...est.preenchimento, width: `${progresso}%` }} />
      </div>
      {resultado && (
        <div style={est.estabilidade}>
          <span style={{ ...est.pontoEstado, background: corDoNivel(resultado.estabilidade.nivel) }} />
          {resultado.estabilidade.rotulo} · Nievel pede {resultado.obsMinimas} obs
        </div>
      )}
    </section>
  );
}

function BotaoRegistro({ rodando, decorrido, pulso, aoIniciar, aoRegistrar }) {
  return (
    <button
      type="button"
      onPointerDown={rodando ? aoRegistrar : aoIniciar}
      style={{ ...est.botaoRegistro, ...(rodando ? est.botaoRegistroAtivo : est.botaoRegistroInicial) }}
      aria-label={rodando ? 'Registrar fim do ciclo' : 'Iniciar cronometragem'}
    >
      {rodando ? (
        <>
          <span key={pulso} style={est.cronometro}>{formatarCronometro(decorrido)}</span>
          <span style={est.rotuloRegistro}>TOQUE AO FIM DO CICLO</span>
        </>
      ) : (
        <>
          <span style={est.iconeIniciar}>▶</span>
          <span style={est.rotuloRegistro}>INICIAR COLETA</span>
        </>
      )}
    </button>
  );
}

function PainelPausa({ pausa, aoEncerrar }) {
  const [decorrido, setDecorrido] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDecorrido(performance.now() - pausa.inicio), 100);
    return () => clearInterval(id);
  }, [pausa.inicio]);

  return (
    <div style={{ ...est.botaoRegistro, ...est.painelPausa }}>
      <span style={est.rotuloPausa}>PRODUCAO PARADA</span>
      <span style={est.cronometroPausa}>{formatarCronometro(decorrido)}</span>
      <span style={est.motivoPausa}>{pausa.motivo}</span>
      <button type="button" onClick={aoEncerrar} style={est.botaoRetomar}>
        RETOMAR PRODUCAO
      </button>
    </div>
  );
}

function BarraInferior({ rodando, pausado, temTempos, rodada, aoPausar, aoDesfazer, aoTrocarRodada, aoEncerrar }) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <>
      {menuAberto && (
        <div style={est.menuMotivos} role="dialog" aria-label="Motivo da parada">
          <div style={est.menuTitulo}>Por que a producao parou?</div>
          <div style={est.listaMotivos}>
            {MOTIVOS_PARADA.map((m) => (
              <button
                key={m.codigo}
                type="button"
                style={est.itemMotivo}
                onClick={() => { aoPausar(m.rotulo); setMenuAberto(false); }}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
          <button type="button" style={est.botaoSecundario} onClick={() => setMenuAberto(false)}>
            Cancelar
          </button>
        </div>
      )}

      <nav style={est.barraInferior} aria-label="Acoes da coleta">
        <button
          type="button"
          style={est.botaoBarra}
          onClick={() => setMenuAberto(true)}
          disabled={!rodando || pausado}
        >
          <span style={est.iconeBarra}>❚❚</span>
          Parada
        </button>
        <button type="button" style={est.botaoBarra} onClick={aoDesfazer} disabled={!temTempos}>
          <span style={est.iconeBarra}>↩</span>
          Desfazer
        </button>
        <button type="button" style={est.botaoBarra} onClick={aoTrocarRodada} disabled={!temTempos}>
          <span style={est.iconeBarra}>⚑</span>
          Rodada {rodada}
        </button>
        <button type="button" style={{ ...est.botaoBarra, ...est.botaoEncerrar }} onClick={aoEncerrar}>
          <span style={est.iconeBarra}>■</span>
          Encerrar
        </button>
      </nav>
    </>
  );
}

function UltimosCiclos({ tempos, resultado }) {
  if (!tempos.length) {
    return (
      <section style={est.vazio}>
        Nenhum ciclo coletado ainda. Toque em iniciar quando a peca entrar na furadeira.
      </section>
    );
  }

  const ultimos = tempos.slice(-8).reverse();
  const mediana = resultado?.toMed ?? 0;

  return (
    <section style={est.ultimos} aria-label="Ultimos ciclos">
      {ultimos.map((t, i) => {
        const desvio = mediana ? ((t - mediana) / mediana) * 100 : 0;
        const numero = tempos.length - i;
        return (
          <div key={`${numero}-${t}`} style={est.chip}>
            <span style={est.chipNumero}>#{numero}</span>
            <span style={est.chipTempo}>{formatarSegundos(t)}s</span>
            {Math.abs(desvio) >= 10 && (
              <span style={{ ...est.chipDesvio, color: Math.abs(desvio) >= 25 ? cores.critico : cores.atencao }}>
                {desvio > 0 ? '+' : ''}{desvio.toFixed(0)}%
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Faixa({ tipo, icone, titulo, texto, acao }) {
  const paleta = {
    ok: { borda: cores.ok, fundo: cores.okFundo },
    atencao: { borda: cores.atencao, fundo: cores.atencaoFundo },
    critico: { borda: cores.critico, fundo: cores.criticoFundo },
  }[tipo] || { borda: cores.neutro, fundo: 'rgba(100,116,139,0.12)' };

  return (
    <div style={{ ...est.faixa, borderColor: paleta.borda, background: paleta.fundo }} role="status">
      <span style={{ ...est.faixaIcone, background: paleta.borda }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {titulo && <div style={est.faixaTitulo}>{titulo}</div>}
        <div style={est.faixaTexto}>{texto}</div>
      </div>
      {acao && (
        <button type="button" style={est.faixaAcao} onClick={acao.aoClicar}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

const corDoNivel = (nivel) =>
  ({ estavel: cores.ok, atencao: cores.atencao, critico: cores.critico }[nivel] || cores.neutro);

/* ------------------------------------------------------------------ estilos */

const est = {
  tela: {
    height: '100dvh',
    // Explicito de proposito: o componente nao pode depender de um reset
    // global que vive no index.html. Sem isto o padding soma a' altura e
    // empurra a ultima faixa para fora da viewport.
    boxSizing: 'border-box',
    // Sem rolagem durante a coleta: o analista esta de maos ocupadas e nao
    // vai rolar a tela para achar um indicador. Tudo precisa caber.
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: espaco.md,
    padding: espaco.md,
    paddingBottom: `calc(${espaco.md}px + env(safe-area-inset-bottom, 0px))`,
    background: cores.fundo,
    color: cores.texto,
    fontFamily: fonte.familia,
    // Impede o duplo-toque de dar zoom no meio da coleta.
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },

  cabecalho: { display: 'flex', alignItems: 'center', gap: espaco.md, flexShrink: 0 },
  botaoVoltar: {
    width: 44, height: 44, flexShrink: 0,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.md, color: cores.texto, fontSize: 20, cursor: 'pointer',
  },
  tituloOperacao: {
    fontSize: tamanho.titulo, fontWeight: 700, lineHeight: 1.2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  subtitulo: {
    fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  selo: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: '4px 8px',
    borderRadius: raio.sm, color: cores.textoFraco,
    // Longhand de proposito: `seloOk`/`seloAtencao` sobrescrevem borderColor.
    // Misturar com a shorthand `border` quebra o estilo em rerender.
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
  },
  seloOk: { color: cores.ok, borderColor: cores.ok, background: cores.okFundo },
  seloAtencao: { color: cores.atencao, borderColor: cores.atencao, background: cores.atencaoFundo },

  metricas: {
    flexShrink: 0,
    background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.md,
  },
  linhaMetricas: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: espaco.sm },
  metrica: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  metricaRotulo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  metricaValor: { fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero, lineHeight: 1.1 },
  metricaSufixo: { fontSize: tamanho.legenda, color: cores.textoFraco, marginLeft: 3, fontWeight: 400 },
  trilha: { height: 6, background: cores.superficieAlta, borderRadius: raio.pill, marginTop: espaco.md, overflow: 'hidden' },
  preenchimento: { height: '100%', background: cores.ok, borderRadius: raio.pill, transition: transicao.normal },
  estabilidade: {
    display: 'flex', alignItems: 'center', gap: espaco.sm,
    fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: espaco.sm,
  },
  pontoEstado: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },

  // A acao principal ocupa todo o espaco livre. Alvo enorme e' requisito
  // funcional aqui, nao escolha estetica.
  botaoRegistro: {
    // Cresce para ocupar a sobra, mas encolhe antes de empurrar os ultimos
    // ciclos para fora da tela. 180px continua sendo um alvo enorme.
    flex: '1 1 auto', minHeight: 180,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: espaco.sm,
    border: 'none', borderRadius: raio.lg, cursor: 'pointer',
    fontFamily: fonte.familia, color: '#fff',
    boxShadow: sombra.alta, transition: `transform ${transicao.rapida}`,
    userSelect: 'none',
  },
  botaoRegistroInicial: { background: `linear-gradient(160deg, ${cores.vermelho}, ${cores.bordeaux})` },
  botaoRegistroAtivo: { background: `linear-gradient(160deg, #1D4ED8, #1E3A8A)` },
  cronometro: {
    fontSize: tamanho.cronometro, fontWeight: 700, fontFamily: fonte.numero,
    lineHeight: 1, letterSpacing: -1,
    // Tabular impede o numero de "pular" a cada decimo.
    fontVariantNumeric: 'tabular-nums',
  },
  rotuloRegistro: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, opacity: 0.92 },
  iconeIniciar: { fontSize: 56, lineHeight: 1 },

  painelPausa: { background: `linear-gradient(160deg, ${cores.critico}, #7C2D12)`, cursor: 'default' },
  rotuloPausa: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5 },
  cronometroPausa: { fontSize: 52, fontWeight: 700, fontFamily: fonte.numero, fontVariantNumeric: 'tabular-nums' },
  motivoPausa: { fontSize: tamanho.corpo, opacity: 0.9 },
  botaoRetomar: {
    marginTop: espaco.md, minHeight: ALVO_MINIMO, padding: `0 ${espaco.xxl}px`,
    background: '#fff', color: cores.critico, border: 'none', borderRadius: raio.md,
    fontSize: tamanho.corpo, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', fontFamily: 'inherit',
  },

  barraInferior: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: espaco.sm, flexShrink: 0 },
  botaoBarra: {
    minHeight: ALVO_MINIMO,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
    background: cores.superficie, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    color: cores.texto, fontSize: tamanho.legenda, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoEncerrar: { borderColor: cores.critico, color: cores.critico },
  iconeBarra: { fontSize: 18, lineHeight: 1 },

  menuMotivos: {
    position: 'fixed', inset: 0, zIndex: 20,
    background: 'rgba(10,12,14,0.92)', padding: espaco.lg,
    display: 'flex', flexDirection: 'column', gap: espaco.md, justifyContent: 'center',
  },
  menuTitulo: { fontSize: tamanho.titulo, fontWeight: 700, textAlign: 'center', color: cores.texto },
  listaMotivos: { display: 'grid', gap: espaco.sm, maxHeight: '60vh', overflowY: 'auto' },
  itemMotivo: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.lg}px`, textAlign: 'left',
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.md,
    color: cores.texto, fontSize: tamanho.corpo, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: ALVO_MINIMO, background: 'transparent', border: `1px solid ${cores.borda}`,
    borderRadius: raio.md, color: cores.textoFraco, fontSize: tamanho.corpo,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  faixa: {
    flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md, borderRadius: raio.md,
    // borderColor vem do tipo da faixa; longhand evita conflito com shorthand.
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
  },
  faixaIcone: {
    width: 24, height: 24, flexShrink: 0, borderRadius: '50%', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14,
  },
  faixaTitulo: { fontSize: tamanho.pequeno, fontWeight: 700, marginBottom: 2 },
  faixaTexto: { fontSize: tamanho.legenda, color: cores.textoFraco, lineHeight: 1.4 },
  faixaAcao: {
    flexShrink: 0, minHeight: 44, padding: `0 ${espaco.md}px`,
    background: 'transparent', border: `1px solid ${cores.borda}`, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.legenda, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },

  ultimos: { display: 'flex', gap: espaco.sm, overflowX: 'auto', paddingBottom: espaco.xs, flexShrink: 0 },
  chip: {
    display: 'flex', alignItems: 'baseline', gap: espaco.xs, flexShrink: 0,
    padding: `${espaco.sm}px ${espaco.md}px`,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.pill,
  },
  chipNumero: { fontSize: 10, color: cores.textoFraco },
  chipTempo: { fontSize: tamanho.pequeno, fontWeight: 700, fontFamily: fonte.numero },
  chipDesvio: { fontSize: 10, fontWeight: 700 },

  vazio: {
    flexShrink: 0,
    padding: espaco.lg, textAlign: 'center', fontSize: tamanho.pequeno,
    color: cores.textoFraco, lineHeight: 1.5,
  },
};
