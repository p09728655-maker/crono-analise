import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALVO_MINIMO, cores, espaco, fonte, raio, sombra, tamanho, transicao } from '../../theme/tokens.js';
import {
  conferenciaRapida, duracaoEntreHoras, formatarCronometro, formatarDuracao,
  formatarSegundos, rotuloMotivo, somarParadas,
} from '../../domain/cronoanalise.js';
import { codigoPreferido, useMotivosParada } from '../../lib/motivosParada.js';
import { TOQUE_MINIMO_MS } from '../../domain/estatistica.js';
import { sincronizar } from '../../lib/api.js';
import { listarConferencias, marcarEnviadas, removerConferencia, salvarConferencia } from '../../lib/conferencias.js';
import { enfileirar, novoId } from '../../lib/filaOffline.js';
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
 *  - Nada vai para o servidor. Salvar (opcional, com o nome da peca)
 *    guarda a conferencia NESTE aparelho, numa lista na propria tela —
 *    memoria de bolso para comparar depois. Registro oficial, com tempo
 *    padrao, e' papel do estudo. A tela diz isso com todas as letras.
 *  - O resultado recalcula a cada tecla: preencheu os tres campos, a
 *    conta esta' na tela. Sem botao "calcular" — ele so' atrasaria.
 *  - A quantidade de pecas e' EDITAVEL tambem no resultado do cronometro,
 *    para quem cronometrou ao vivo mas contou pelo contador da maquina.
 *  - PARADAS entram no periodo: setup, falta de peca, manutencao. Sem elas,
 *    a mesma furadeira aparece lenta no dia de troca de lote e rapida no
 *    dia de lote longo — e o ritmo nunca fecha com o que o posto entrega.
 *    O ritmo sai do tempo em que a maquina RODOU; o do periodo inteiro
 *    continua na tela, porque e' ele que explica o que saiu no turno.
 *  - Mesma ergonomia da coleta: alvo gigante, vibracao, tema escuro,
 *    tela acesa enquanto cronometra.
 */
export default function ConferenciaRapida({ aoSair }) {
  // A lista vem do cadastro da fabrica (Ferramentas > Motivos de parada) e
  // cai nos motivos de fabrica quando ainda nao ha cadastro nem cache.
  const motivosParada = useMotivosParada();
  const [fase, setFase] = useState('pronto'); // pronto | rodando | resultado
  const [pecas, setPecas] = useState(0);
  const [duracaoFinal, setDuracaoFinal] = useState(0);
  const [pecasFinais, setPecasFinais] = useState('0');
  const [pulso, setPulso] = useState(0);

  // Formulario de horarios (caminho principal).
  const [horaInicial, setHoraInicial] = useState('');
  const [horaFinal, setHoraFinal] = useState('');
  const [pecasPeriodo, setPecasPeriodo] = useState('');

  // Paradas DENTRO do periodo conferido. Uma lista so' para os dois
  // caminhos (horarios e cronometro): a parada e' do PERIODO, nao do jeito
  // como ele foi medido.
  const [paradas, setParadas] = useState([]);
  const [emParada, setEmParada] = useState(null);      // {motivo, inicio} no ao vivo
  const [escolhendoMotivo, setEscolhendoMotivo] = useState(false);

  // Maquina, peca e memoria deste aparelho.
  const [maquina, setMaquina] = useState('');
  const [peca, setPeca] = useState('');
  const [historico, setHistorico] = useState(() => listarConferencias());
  const [salvo, setSalvo] = useState(null); // null | 'ok' | 'erro'

  // Mudou qualquer dado, a conferencia na tela ja' e' outra: libera salvar
  // de novo em vez de fingir que a alteracao tambem esta' guardada.
  useEffect(() => {
    setSalvo(null);
  }, [maquina, peca, horaInicial, horaFinal, pecasPeriodo, pecasFinais, paradas, fase]);

  // BACKFILL: conferencias salvas antes da sincronizacao existir (ou num
  // navegador em que a fila falhou) nao tem a marca `enviada`. Ao abrir a
  // tela elas entram na fila — o client_id torna qualquer repeticao
  // inofensiva no servidor — e passam a aparecer no relatorio do PC.
  useEffect(() => {
    const pendentes = listarConferencias()
      .filter((c) => !c.enviada && Number(c.duracaoMs) > 0 && Number(c.pecas) > 0);
    if (!pendentes.length) return;
    (async () => {
      try {
        for (const c of pendentes) {
          await enfileirar({
            tipo: 'conferencia',
            clientId: c.id,
            maquina: c.maquina || null,
            peca: c.peca || null,
            horaInicial: c.horaInicial || null,
            horaFinal: c.horaFinal || null,
            duracaoMs: Math.round(c.duracaoMs),
            pecas: c.pecas,
            paradas: c.paradas || [],
            salvoEm: c.salvoEm,
          });
        }
        setHistorico(marcarEnviadas(pendentes.map((c) => c.id)));
        sincronizar().catch(() => {});
      } catch { /* sem fila neste navegador: tenta de novo na proxima abertura */ }
    })();
  }, []);

  /**
   * Paradas em milissegundos, prontas para o calculo.
   *
   * O campo guarda MINUTO (e' assim que o analista pensa: "ficou 8 minutos
   * parada"), entao a conversao mora num lugar so'. Vazio e zero somem da
   * lista: linha recem-criada nao pode virar parada de 0 min no relatorio.
   */
  const paradasEmMs = useMemo(() => paradas
    .map((p) => ({
      motivo: p.motivo,
      duracaoMs: Math.round((Number(String(p.minutos).replace(',', '.')) || 0) * 60000),
    }))
    .filter((p) => p.duracaoMs > 0), [paradas]);
  const totalParada = useMemo(() => somarParadas(paradasEmMs), [paradasEmMs]);

  const adicionarParada = useCallback((motivo, minutos = '') => {
    setParadas((lista) => [...lista, { id: novoId(), motivo, minutos: String(minutos) }]);
    vibrar(30);
  }, []);

  const alterarParada = useCallback((id, campo, valor) => {
    setParadas((lista) => lista.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }, []);

  const removerParada = useCallback((id) => {
    setParadas((lista) => lista.filter((p) => p.id !== id));
    vibrar([25, 40, 25]);
  }, []);

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
    setParadas([]);
    setFase('rodando');
    iniciar();
    vibrar(45);
  }, [iniciar]);

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

  /**
   * Parada durante o cronometro ao vivo.
   *
   * O relogio do periodo NAO para — o periodo e' o que passou no relogio, e
   * a parada esta' dentro dele. O que a pausa faz e' registrar quanto desse
   * periodo a maquina passou parada, e por que.
   */
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
    if (ms >= 1000) adicionarParada(emParada.motivo, (ms / 60000).toFixed(2));
    setEmParada(null);
    vibrar(45);
  }, [emParada, adicionarParada]);

  const encerrar = useCallback(() => {
    // Encerrar com parada em curso fecha a parada primeiro: o tempo dela
    // ja' passou no relogio e nao pode virar tempo de maquina rodando.
    if (emParada) {
      const ms = performance.now() - emParada.inicio;
      if (ms >= 1000) adicionarParada(emParada.motivo, (ms / 60000).toFixed(2));
      setEmParada(null);
    }
    const total = parar();
    setDuracaoFinal(total);
    setPecasFinais(String(pecas));
    setFase('resultado');
    vibrar([30, 40, 30]);
  }, [parar, pecas, emParada, adicionarParada]);

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

  const parcial = useMemo(
    () => conferenciaRapida({ duracaoMs: decorrido, pecas, paradas: paradasEmMs }),
    [decorrido, pecas, paradasEmMs],
  );

  const resultado = useMemo(
    () => conferenciaRapida({ duracaoMs: duracaoFinal, pecas: pecasFinais, paradas: paradasEmMs }),
    [duracaoFinal, pecasFinais, paradasEmMs],
  );

  // A conta dos horarios sai a cada tecla: preencheu, apareceu.
  const duracaoHoras = useMemo(
    () => duracaoEntreHoras(horaInicial, horaFinal),
    [horaInicial, horaFinal],
  );
  const resultadoHoras = useMemo(
    () => (duracaoHoras > 0
      ? conferenciaRapida({ duracaoMs: duracaoHoras, pecas: pecasPeriodo, paradas: paradasEmMs })
      : null),
    [duracaoHoras, pecasPeriodo, paradasEmMs],
  );
  // Paradas maiores que o periodo: sobra zero de maquina rodando e nao ha
  // ritmo a calcular. A tela diz isso em vez de sumir com o resultado.
  const paradasExcedem = duracaoHoras > 0 && totalParada.totalMs >= duracaoHoras;
  const paradasExcedemVivo = duracaoFinal > 0 && totalParada.totalMs >= duracaoFinal;
  // Cronometro da parada em curso. Lido no render de proposito: quem faz a
  // tela repintar e' o cronometro do periodo, que segue correndo durante a
  // parada — nao ha' segundo temporizador para manter em sincronia.
  const tempoParadaAtual = emParada ? performance.now() - emParada.inicio : 0;

  const agoraHM = () => {
    const d = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  };

  const salvar = useCallback(async (calculado, horarios) => {
    const registro = salvarConferencia({
      maquina: maquina.trim(),
      peca: peca.trim(),
      horaInicial: horarios ? horaInicial : null,
      horaFinal: horarios ? horaFinal : null,
      duracaoMs: calculado.duracaoMs,
      pecas: calculado.pecas,
      paradas: paradasEmMs,
      pecasPorHora: calculado.pecasPorHora,
      pecasPorHoraBruto: calculado.pecasPorHoraBruto,
      paradaMs: calculado.paradaMs,
      produtivoMs: calculado.produtivoMs,
      cicloMedioMs: calculado.cicloMedioMs,
    });
    if (!registro) { setSalvo('erro'); return; }

    setHistorico(listarConferencias());
    setSalvo('ok');
    vibrar(45);

    // Mesmo padrao da coleta: disco primeiro, rede depois. O id local vira
    // clientId — reenvio nao duplica no servidor. Sem rede, fica na fila e a
    // sincronizacao automatica leva quando der; salvar nunca depende disso.
    try {
      await enfileirar({
        tipo: 'conferencia',
        clientId: registro.id,
        maquina: registro.maquina || null,
        peca: registro.peca || null,
        horaInicial: registro.horaInicial,
        horaFinal: registro.horaFinal,
        duracaoMs: Math.round(registro.duracaoMs),
        pecas: registro.pecas,
        paradas: registro.paradas,
        salvoEm: registro.salvoEm,
      });
      setHistorico(marcarEnviadas([registro.id]));
      sincronizar().catch(() => {});
    } catch { /* sem fila neste navegador: o backfill tenta na proxima abertura */ }
  }, [maquina, peca, horaInicial, horaFinal, paradasEmMs]);

  const remover = useCallback((id) => {
    setHistorico(removerConferencia(id));
    vibrar([25, 40, 25]);
  }, []);

  /**
   * Proxima peca na MESMA maquina: emenda o periodo (a nova hora inicial
   * e' a hora final da anterior — o analista continua parado no posto) e
   * limpa peca e quantidade. A maquina fica: trocar de peca nao e' trocar
   * de posto.
   */
  const outraPeca = useCallback(() => {
    setPeca('');
    setPecasPeriodo('');
    setHoraInicial(horaFinal || '');
    setHoraFinal('');
    // Parada e' do periodo que acabou: o proximo comeca sem nenhuma.
    setParadas([]);
    vibrar(30);
  }, [horaFinal]);

  return (
    <div style={{ ...est.tela, ...(rodando ? {} : est.telaRolavel) }}>
      <header style={est.cabecalho}>
        <button type="button" onClick={aoSair} style={est.botaoVoltar} aria-label="Voltar para a lista">
          ←
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* O posto vem no selo a direita, nao no titulo: "Conferência
              rápida · Furadeiras" nao cabe em tela de celular e sai cortado. */}
          <div style={est.titulo}>Ritmo da furadeira</div>
          <div style={est.subtitulo}>Peças/hora por posto · sem cadastro</div>
        </div>
        <span style={est.selo}>FURADEIRA</span>
      </header>

      {fase === 'pronto' && (
        <>
          <section style={est.formHoras} aria-label="Conferência por horários">
            <div style={est.linhaHoras}>
              <label style={est.campoHora}>
                <span style={est.rotuloCampo}>MÁQUINA</span>
                <input
                  type="text"
                  placeholder="Ex: Furadeira 03"
                  value={maquina}
                  onChange={(ev) => setMaquina(ev.target.value)}
                  style={est.inputTexto}
                  aria-label="Nome da máquina"
                />
              </label>
              <label style={est.campoHora}>
                <span style={est.rotuloCampo}>PEÇA</span>
                <input
                  type="text"
                  placeholder="Ex: Lateral Mesa"
                  value={peca}
                  onChange={(ev) => setPeca(ev.target.value)}
                  style={est.inputTexto}
                  aria-label="Nome da peça"
                />
              </label>
            </div>

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

            <Paradas
              motivos={motivosParada}
              paradas={paradas}
              resumo={totalParada}
              duracaoMs={duracaoHoras}
              aoAdicionar={adicionarParada}
              aoAlterar={alterarParada}
              aoRemover={removerParada}
            />
          </section>

          {paradasExcedem ? (
            <section style={est.avisoParada} role="alert">
              As paradas somam {formatarDuracao(totalParada.totalMs)} e o período tem
              {' '}{formatarDuracao(duracaoHoras)} — não sobra tempo de máquina rodando.
              Confira os horários ou os minutos de parada.
            </section>
          ) : resultadoHoras && resultadoHoras.pecas > 0 ? (
            <section style={est.painelHoras} aria-label="Resultado dos horários">
              <div style={est.destaqueRitmo} aria-label="Ritmo do período">
                <span style={est.valorRitmo}>{Math.round(resultadoHoras.pecasPorHora)}</span>
                <span style={est.sufixoRitmo}>
                  {resultadoHoras.paradaMs > 0 ? 'peças/hora com a máquina rodando' : 'peças/hora'}
                </span>
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
              <ComParadas calculado={resultadoHoras} />
              <BotaoSalvar salvo={salvo} aoSalvar={() => salvar(resultadoHoras, true)} />
              <button type="button" style={est.botaoOutraPeca} onClick={outraPeca}>
                ➜ COMEÇAR OUTRA PEÇA
              </button>
            </section>
          ) : (
            <section style={est.explicacao}>
              Passe pela máquina e toque <strong>Agora</strong> na chegada; na
              volta, toque <strong>Agora</strong> de novo, digite quantas peças
              saíram e a conta aparece aqui — peças/hora e ciclo médio. Também
              dá para digitar os horários depois, de cabeça. Se houve
              <strong> setup</strong> ou outra parada no meio, marque acima:
              o ritmo passa a sair do tempo em que a máquina rodou.
            </section>
          )}

          <div style={est.divisorOu}>
            <span style={est.traco} />
            <span style={est.textoOu}>ou fique no posto e conte peça a peça</span>
            <span style={est.traco} />
          </div>

          {/* onClick, nao onPointerDown: comecar troca a tela inteira, e o
              toque que ainda nao terminou cairia no botao que aparecer
              embaixo do dedo — "Parou" ou, pior, "Encerrar". Aqui uns
              milissegundos a mais nao custam nada: o periodo tem minutos. */}
          <button type="button" onClick={comecar} style={{ ...est.botaoGrande, ...est.botaoIniciar, ...est.botaoVivo }}>
            <span style={est.rotuloBotao}>▶ CRONOMETRAR AO VIVO</span>
          </button>

          {historico.length > 0 && (
            <section style={est.historico} aria-label="Conferências salvas neste aparelho">
              <div style={est.historicoTitulo}>SALVAS NESTE APARELHO</div>
              {historico.map((c) => (
                <div key={c.id} style={est.itemHistorico}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={est.itemPeca}>
                      {[c.maquina, c.peca].filter(Boolean).join(' · ') || 'Sem identificação'}
                    </div>
                    <div style={est.itemDetalhe}>
                      {[
                        c.horaInicial && c.horaFinal ? `${c.horaInicial}–${c.horaFinal}` : null,
                        formatarDuracao(c.duracaoMs),
                        `${c.pecas} pç`,
                        c.paradaMs > 0 ? `${formatarDuracao(c.paradaMs)} parada` : null,
                        dataCurta(c.salvoEm),
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={est.itemRitmo}>
                    {Math.round(c.pecasPorHora)}
                    <span style={est.itemRitmoSufixo}>pç/h</span>
                  </div>
                  <button
                    type="button"
                    style={est.itemRemover}
                    onClick={() => remover(c.id)}
                    aria-label={`Remover conferência ${c.peca || 'sem nome'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          )}

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
              <Parcial rotulo="Parado" valor={totalParada.totalMs > 0 ? formatarDuracao(totalParada.totalMs) : '—'} />
            </div>
          </section>

          {emParada ? (
            /* Maquina parada: o relogio do periodo segue correndo (a parada
               esta' DENTRO dele), mas contar peca fica bloqueado e a tela
               inteira vira o botao de voltar a produzir. */
            <button
              type="button"
              onPointerDown={encerrarParada}
              style={{ ...est.botaoGrande, ...est.botaoVoltarProduzir }}
              aria-label="Encerrar a parada e voltar a produzir"
            >
              <span style={est.rotuloParadaAtiva}>PARADA · {rotuloMotivo(emParada.motivo)}</span>
              <span style={est.contagem}>{formatarCronometro(Math.max(0, tempoParadaAtual))}</span>
              <span style={est.rotuloBotao}>▶ VOLTOU A PRODUZIR</span>
            </button>
          ) : (
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
          )}

          <nav style={est.barraInferiorTres} aria-label="Ações da conferência">
            <button type="button" style={est.botaoBarra} onClick={desfazer} disabled={!pecas || !!emParada}>
              <span style={est.iconeBarra}>↩</span>
              Desfazer
            </button>
            <button
              type="button"
              style={{ ...est.botaoBarra, ...est.botaoParou }}
              onClick={() => (emParada ? encerrarParada() : setEscolhendoMotivo(true))}
            >
              <span style={est.iconeBarra}>{emParada ? '▶' : '⏸'}</span>
              {emParada ? 'Voltou' : 'Parou'}
            </button>
            <button type="button" style={{ ...est.botaoBarra, ...est.botaoEncerrar }} onClick={encerrar}>
              <span style={est.iconeBarra}>■</span>
              Encerrar
            </button>
          </nav>

          {escolhendoMotivo && (
            <div style={est.folhaMotivos} role="dialog" aria-label="Por que a máquina parou">
              <div style={est.folhaCaixa}>
                <div style={est.folhaTitulo}>Por que parou?</div>
                <div style={est.gradeMotivos}>
                  {motivosParada.map((m) => (
                    <button
                      key={m.codigo}
                      type="button"
                      style={{ ...est.chipMotivo, ...(m.codigo === 'setup' ? est.chipSetup : {}) }}
                      onClick={() => iniciarParada(m.codigo)}
                    >
                      {m.rotulo}
                    </button>
                  ))}
                </div>
                <button type="button" style={est.botaoOutraPeca} onClick={() => setEscolhendoMotivo(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {fase === 'resultado' && !resultado && paradasExcedemVivo && (
        <section style={est.avisoParada} role="alert">
          As paradas somam {formatarDuracao(totalParada.totalMs)} e o período
          cronometrado tem {formatarDuracao(duracaoFinal)} — não sobra tempo de
          máquina rodando. Ajuste os minutos de parada abaixo.
          <Paradas
            motivos={motivosParada}
            paradas={paradas}
            resumo={totalParada}
            duracaoMs={duracaoFinal}
            aoAdicionar={adicionarParada}
            aoAlterar={alterarParada}
            aoRemover={removerParada}
          />
        </section>
      )}

      {fase === 'resultado' && resultado && (
        <>
          <section style={est.painelResultado} aria-label="Resultado da conferência">
            <div style={est.linhaResultado}>
              <label style={est.campoHora}>
                <span style={est.rotuloCampo}>MÁQUINA</span>
                <input
                  type="text"
                  placeholder="Ex: Furadeira 03"
                  value={maquina}
                  onChange={(ev) => setMaquina(ev.target.value)}
                  style={est.inputTexto}
                  aria-label="Nome da máquina"
                />
              </label>
              <label style={est.campoHora}>
                <span style={est.rotuloCampo}>PEÇA</span>
                <input
                  type="text"
                  placeholder="Ex: Lateral Mesa"
                  value={peca}
                  onChange={(ev) => setPeca(ev.target.value)}
                  style={est.inputTexto}
                  aria-label="Nome da peça"
                />
              </label>
            </div>

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
              <span style={est.sufixoRitmo}>
                {resultado.paradaMs > 0 ? 'peças/hora com a máquina rodando' : 'peças/hora'}
              </span>
            </div>

            <div style={est.linhaParcial}>
              <Parcial rotulo="Peças/min" valor={resultado.pecasPorMinuto.toFixed(1)} />
              <Parcial
                rotulo="Ciclo médio"
                valor={resultado.cicloMedioMs ? formatarSegundos(resultado.cicloMedioMs) : '—'}
                sufixo="s/pç"
              />
            </div>

            <ComParadas calculado={resultado} />

            {/* Editavel tambem aqui: parada esquecida no calor da coleta se
                corrige antes de salvar, sem refazer a conferencia. */}
            <Paradas
              motivos={motivosParada}
              paradas={paradas}
              resumo={totalParada}
              duracaoMs={duracaoFinal}
              aoAdicionar={adicionarParada}
              aoAlterar={alterarParada}
              aoRemover={removerParada}
            />

            {resultado.pecas > 0 && (
              <BotaoSalvar salvo={salvo} aoSalvar={() => salvar(resultado, false)} />
            )}
          </section>

          <section style={est.aviso}>
            Salvar guarda a conferência só neste aparelho. Para registrar
            ciclos e calcular o tempo padrão, crie um estudo.
          </section>

          <nav style={est.barraInferior} aria-label="Ações do resultado">
            <button type="button" style={est.botaoBarra} onClick={aoSair}>
              <span style={est.iconeBarra}>←</span>
              Sair
            </button>
            <button
              type="button"
              style={{ ...est.botaoBarra, ...est.botaoNova }}
              onClick={() => { setParadas([]); setFase('pronto'); }}
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

/**
 * Paradas do periodo — o painel que separa setup do resto.
 *
 * Fica junto dos campos do periodo porque e' isso que ele descreve: quanto
 * daquele intervalo a maquina NAO estava produzindo. Setup ganha botao
 * proprio porque e' a parada mais comum da furadeira (troca de gabarito,
 * programa, broca) e a unica que o processo exige — as outras entram pelo
 * segundo botao e viram escolha de motivo.
 *
 * O campo e' em MINUTOS: ninguem no chao de fabrica pensa em milissegundos.
 */
function Paradas({ motivos, paradas, resumo, duracaoMs, aoAdicionar, aoAlterar, aoRemover }) {
  const produtivoMs = duracaoMs > 0 ? duracaoMs - Math.min(resumo.totalMs, duracaoMs) : 0;

  return (
    <div style={est.blocoParadas} aria-label="Paradas no período">
      <span style={est.rotuloCampo}>PARADAS NO PERÍODO</span>

      <div style={est.linhaBotoesParada}>
        <button
          type="button" style={est.botaoSetup}
          onClick={() => aoAdicionar(codigoPreferido(motivos, 'setup'))}
        >
          + SETUP / TROCA
        </button>
        <button
          type="button" style={est.botaoParada}
          onClick={() => aoAdicionar(codigoPreferido(motivos, 'falta_material'))}
        >
          + OUTRA PARADA
        </button>
      </div>

      {paradas.length === 0 ? (
        <span style={est.dicaParada}>
          Nenhuma marcada — o período inteiro conta como máquina rodando.
        </span>
      ) : (
        <>
          {paradas.map((p) => (
            <div key={p.id} style={est.linhaParada}>
              <select
                value={p.motivo}
                onChange={(ev) => aoAlterar(p.id, 'motivo', ev.target.value)}
                style={est.selectMotivo}
                aria-label="Motivo da parada"
              >
                {motivos.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                placeholder="min"
                value={p.minutos}
                onChange={(ev) => aoAlterar(p.id, 'minutos', ev.target.value)}
                style={est.inputMinutos}
                aria-label={`Minutos parada — ${rotuloMotivo(p.motivo)}`}
              />
              <button
                type="button"
                style={est.itemRemover}
                onClick={() => aoRemover(p.id)}
                aria-label={`Remover parada ${rotuloMotivo(p.motivo)}`}
              >
                ×
              </button>
            </div>
          ))}

          {resumo.totalMs > 0 && (
            <span style={est.dicaParada}>
              Parado {formatarDuracao(resumo.totalMs)}
              {resumo.setupMs > 0 && ` (setup ${formatarDuracao(resumo.setupMs)})`}
              {duracaoMs > 0 && produtivoMs > 0 && ` · máquina rodando ${formatarDuracao(produtivoMs)}`}
            </span>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A linha que so' existe quando ha' parada marcada.
 *
 * Mostra o outro numero — o do periodo inteiro — porque os dois respondem
 * perguntas diferentes: o ritmo com a maquina rodando dimensiona capacidade;
 * o do periodo explica o que de fato saiu do posto naquelas horas.
 */
function ComParadas({ calculado }) {
  if (!calculado || !calculado.paradaMs) return null;
  return (
    <div style={est.linhaParcial}>
      <Parcial rotulo="Parado" valor={formatarDuracao(calculado.paradaMs)} />
      <Parcial rotulo="Rodando" valor={formatarDuracao(calculado.produtivoMs)} />
      <Parcial rotulo="No período" valor={String(Math.round(calculado.pecasPorHoraBruto))} sufixo="pç/h" />
    </div>
  );
}

/**
 * Botao de salvar com o proprio recibo: depois de guardar ele vira
 * "✓ SALVA" e trava, para o dedo apressado nao duplicar o registro.
 * Qualquer edicao nos dados libera de novo (ver o efeito sobre `salvo`).
 */
function BotaoSalvar({ salvo, aoSalvar }) {
  return (
    <>
      <button
        type="button"
        style={{ ...est.botaoSalvar, ...(salvo === 'ok' ? est.botaoSalvarFeito : {}) }}
        onClick={aoSalvar}
        disabled={salvo === 'ok'}
      >
        {salvo === 'ok' ? '✓ SALVA NESTE APARELHO' : 'SALVAR CONFERÊNCIA'}
      </button>
      {salvo === 'erro' && (
        <div style={est.erroSalvar}>
          Não foi possível salvar neste aparelho — verifique o espaço do navegador.
        </div>
      )}
    </>
  );
}

/** "26/08 10:45" — curto o bastante para caber na linha do historico. */
function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
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
  inputTexto: {
    width: '100%', minHeight: 48, padding: `0 ${espaco.md}px`,
    background: cores.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda,
    borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.corpo, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
  },
  botaoSalvar: {
    width: '100%', minHeight: ALVO_MINIMO,
    background: cores.vermelho, border: 'none', borderRadius: raio.md,
    color: '#fff', fontSize: tamanho.corpo, fontWeight: 700, letterSpacing: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSalvarFeito: { background: cores.ok, cursor: 'default' },
  botaoOutraPeca: {
    width: '100%', minHeight: 56,
    background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.md,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  erroSalvar: {
    padding: espaco.md, textAlign: 'center',
    fontSize: tamanho.legenda, color: cores.texto, lineHeight: 1.4,
    background: cores.criticoFundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.critico,
  },

  /* ---- conferencias salvas neste aparelho ---- */
  historico: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.sm,
    paddingTop: espaco.md,
  },
  historicoTitulo: { fontSize: 10, letterSpacing: 0.8, color: cores.textoFraco, textTransform: 'uppercase' },
  itemHistorico: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.sm}px ${espaco.md}px`,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.md,
  },
  itemPeca: {
    fontSize: tamanho.pequeno, fontWeight: 700,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  itemDetalhe: { fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2 },
  itemRitmo: {
    flexShrink: 0, fontSize: tamanho.destaque, fontWeight: 700, fontFamily: fonte.numero,
    fontVariantNumeric: 'tabular-nums',
  },
  itemRitmoSufixo: { fontSize: tamanho.legenda, color: cores.textoFraco, marginLeft: 3, fontWeight: 400 },
  itemRemover: {
    flexShrink: 0, width: 40, height: 40,
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: cores.textoFraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
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

  /* ---- paradas do periodo ---- */
  blocoParadas: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm, minWidth: 0,
    paddingTop: espaco.md,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: cores.borda,
  },
  linhaBotoesParada: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm },
  // Setup ganha destaque proprio: e' a parada que o analista mais marca na
  // furadeira, e procurar por ela num menu custaria mais que o toque.
  botaoSetup: {
    minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.atencao, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoParada: {
    minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 0.5,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  dicaParada: { fontSize: tamanho.legenda, color: cores.textoFraco, lineHeight: 1.4 },
  linhaParada: { display: 'flex', alignItems: 'center', gap: espaco.sm, minWidth: 0 },
  selectMotivo: {
    flex: 1, minWidth: 0, minHeight: 48, padding: `0 ${espaco.sm}px`,
    background: cores.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 600,
    fontFamily: 'inherit', outline: 'none', colorScheme: 'dark',
  },
  inputMinutos: {
    width: 84, flexShrink: 0, minHeight: 48, textAlign: 'center',
    background: cores.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.sm,
    color: cores.texto, fontSize: tamanho.titulo, fontWeight: 700,
    fontFamily: fonte.numero, outline: 'none',
  },
  avisoParada: {
    flexShrink: 0, display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, fontSize: tamanho.corpo, color: cores.texto, lineHeight: 1.5,
    background: cores.criticoFundo, borderRadius: raio.lg,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.critico,
  },

  /* ---- parada durante o cronometro ao vivo ---- */
  barraInferiorTres: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: espaco.sm, flexShrink: 0 },
  botaoParou: { borderColor: cores.atencao, color: cores.atencao },
  botaoVoltarProduzir: { background: `linear-gradient(160deg, ${cores.atencao}, #7C3A06)` },
  rotuloParadaAtiva: { fontSize: tamanho.pequeno, fontWeight: 700, letterSpacing: 1.5, opacity: 0.92 },
  folhaMotivos: {
    position: 'fixed', inset: 0, zIndex: 30,
    display: 'flex', alignItems: 'flex-end',
    background: 'rgba(0,0,0,0.6)', padding: espaco.md,
  },
  folhaCaixa: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: espaco.md,
    background: cores.superficie,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.lg,
    padding: espaco.lg, boxShadow: sombra.alta,
    maxHeight: '86dvh', overflowY: 'auto',
  },
  folhaTitulo: { fontSize: tamanho.titulo, fontWeight: 700 },
  gradeMotivos: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.sm },
  chipMotivo: {
    minHeight: 60, padding: `0 ${espaco.sm}px`,
    background: cores.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: cores.borda, borderRadius: raio.md,
    color: cores.texto, fontSize: tamanho.pequeno, fontWeight: 700, lineHeight: 1.25,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  chipSetup: { borderColor: cores.atencao },

  rodape: { flexShrink: 0, height: espaco.md },
};
