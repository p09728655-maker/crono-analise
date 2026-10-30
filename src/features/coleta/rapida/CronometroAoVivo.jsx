import {
  formatarCronometro, formatarDuracao, formatarSegundos, rotuloMotivo,
} from '../../../domain/cronoanalise.js';
import { Parcial } from './Indicadores.jsx';
import { est } from './estilos.js';

/**
 * A TELA DO CRONOMETRO RODANDO: o tempo, o alvo gigante e a barra de
 * acoes. Sem rolagem e sem distracao — e' a mesma postura da coleta: em
 * pe', as vezes de luva, olhando a maquina e nao o celular.
 */
export default function CronometroAoVivo({
  crono, parcial, totalParadaMs, motivos, unidade,
  // Embalagem Takt Time: o tempo POR VOLUME do periodo ate' aqui (paradas
  // dentro — a regua do takt, ver periodoPorPeca) contra o takt, em
  // segundos; e, de apoio, volumes, volumes/hora e o ULTIMO intervalo.
  modoTakt = false, taktMs = null, porVolumeMs = null,
}) {
  const {
    decorrido, pecas, pulso, emParada, tempoParadaAtual, escolhendoMotivo, setEscolhendoMotivo,
    contarPeca, desfazer, iniciarParada, encerrarParada, encerrar, ultimoIntervaloMs,
    aguardandoLargada,
  } = crono;
  /* O aviso vai no tempo por volume do PERIODO, nao no ultimo intervalo: o
     rack de dois volumes sai com os dois colados (25 s, 100 s...), e o
     ultimo passaria do takt a cada dois volumes numa linha que atende. E
     com as paradas dentro: marcar "Parou" nao pode apagar o aviso. */
  const acimaDoTakt = modoTakt && taktMs > 0 && porVolumeMs > taktMs;
  // Na embalagem a barra de baixo cresce junto com o painel (v2.98.1):
  // com o resto grande, os 64 px de Desfazer, Parou e Encerrar ficaram miudos.
  const barra = modoTakt ? { ...est.botaoBarra, ...est.botaoBarraTakt } : est.botaoBarra;
  const icone = modoTakt ? est.iconeBarraTakt : est.iconeBarra;

  const painel = modoTakt ? (
    /* EMBALAGEM: os numeros grandes e o alvo menor (v2.98.0, ver
       painelTempoTakt). Em cima o que decide — o tempo por volume
       contra o takt —, embaixo o apoio. O parado sai daqui (a parada
       em curso ocupa o alvo inteiro) e volta no resultado. */
    <section style={est.painelTempoTakt} aria-label="Tempo decorrido">
      <span className="takt-rotulo-tempo" style={est.rotuloTempoTela}>TEMPO</span>
      <span className="takt-tempo" style={est.tempoCorridoTela}>{formatarCronometro(decorrido)}</span>
      <div style={est.gradeTaktPrincipal}>
        {/* Acima do takt, ganha SETA no rotulo e fundo: a cor sozinha
            nao serve a quem olha de longe, de luva, com sol. */}
        <Parcial
          escala="grande"
          rotulo={acimaDoTakt ? 'Por vol ▲ takt' : 'Por volume'}
          valor={porVolumeMs ? formatarSegundos(porVolumeMs) : '—'}
          sufixo="s"
          tom={acimaDoTakt ? 'atencao' : null}
        />
        <Parcial escala="grande" rotulo="Takt" valor={taktMs > 0 ? formatarSegundos(taktMs) : '—'} sufixo="s" />
      </div>
      <div style={est.gradeTaktApoio}>
        {/* Na embalagem o toque conta VOLUME — e a tela diz isso, porque
            o programa da embalagem tambem vem em volumes. */}
        <Parcial escala="media" rotulo={maiuscula(unidade.plural)} valor={String(pecas)} />
        {/* Volumes/hora do PERIODO ate' o ultimo toque, paradas dentro
            (a conta do resultado e da lista do PC, ate' o ultimo volume
            em vez de ate' o Encerrar). Parado entre um toque e outro:
            nao e' velocimetro. O rotulo diz "periodo" porque nao e' o da
            linha rodando — com parada marcada, os dois diferem. Com um
            volume so', o "por volume" ainda espera; este tambem. */}
        <Parcial
          escala="media"
          rotulo={`${unidade.abrev}/h período`}
          valor={parcial && pecas >= 2 ? String(Math.round(parcial.pecasPorHoraBruto)) : '—'}
        />
        <Parcial
          escala="media"
          rotulo="Último"
          valor={ultimoIntervaloMs ? formatarSegundos(ultimoIntervaloMs) : '—'}
          sufixo="s"
        />
      </div>
    </section>
  ) : (
    <section style={est.painelTempo} aria-label="Tempo decorrido">
      <span style={est.rotuloTempo}>TEMPO</span>
      <span style={est.tempoCorrido}>{formatarCronometro(decorrido)}</span>
      <div style={est.linhaParcial}>
        <Parcial rotulo={maiuscula(unidade.plural)} valor={String(pecas)} />
        <Parcial rotulo="Ritmo" valor={parcial && pecas > 0 ? String(Math.round(parcial.pecasPorHora)) : '—'} sufixo={`${unidade.abrev}/h`} />
        <Parcial rotulo="Parado" valor={totalParadaMs > 0 ? formatarDuracao(totalParadaMs) : '—'} />
      </div>
    </section>
  );

  const alvo = emParada ? (
    /* Maquina parada: o relogio do periodo segue correndo (a parada
       esta' DENTRO dele), mas contar peca fica bloqueado e a tela
       inteira vira o botao de voltar a produzir. */
    <button
      type="button"
      onPointerDown={encerrarParada}
      style={{ ...est.botaoGrande, ...(modoTakt ? est.botaoGrandeTakt : {}), ...est.botaoVoltarProduzir }}
      aria-label="Encerrar a parada e voltar a produzir"
    >
      <span style={est.rotuloParadaAtiva}>PARADA · {rotuloMotivo(emParada.motivo)}</span>
      <span className={modoTakt ? 'contagem-takt' : undefined} style={est.contagem}>
        {formatarCronometro(Math.max(0, tempoParadaAtual))}
      </span>
      <span style={est.rotuloBotao}>▶ VOLTOU A PRODUZIR</span>
    </button>
  ) : aguardandoLargada ? (
    /* Armado: o relogio abre neste toque, que nao conta volume (ver
       useCronometroAoVivo). Outra cor, para ninguem confundir de longe
       com o alvo que ja' esta' contando. */
    <button
      type="button"
      onPointerDown={contarPeca}
      style={{ ...est.botaoGrande, ...(modoTakt ? est.botaoGrandeTakt : {}), ...est.botaoIniciar }}
      aria-label="Largada: abrir o relógio"
    >
      <span style={est.iconeIniciar}>▶</span>
      <span style={est.rotuloBotao}>TOQUE QUANDO FECHAR UM {unidade.singular.toUpperCase()}</span>
      <span style={est.dicaBotao}>o relógio começa neste toque · ele não conta {unidade.singular}</span>
    </button>
  ) : (
    <button
      type="button"
      onPointerDown={contarPeca}
      style={{ ...est.botaoGrande, ...(modoTakt ? est.botaoGrandeTakt : {}), ...est.botaoContar }}
      aria-label={`Contar ${unidade.comArtigo}`}
    >
      <span key={pulso} className={modoTakt ? 'contagem-takt' : undefined} style={est.contagem}>{pecas}</span>
      <span style={est.rotuloBotao}>TOQUE A CADA {unidade.singular.toUpperCase()}</span>
      {/* Na embalagem, digitar o total no fim perde o intervalo de cada
          volume — que e' o motivo da tela. A dica nao convida a isso. */}
      <span style={est.dicaBotao}>
        {modoTakt ? 'o horário de cada toque é gravado sozinho' : 'ou só cronometre e digite o total no fim'}
      </span>
    </button>
  );

  return (
    <>
      {modoTakt ? (
        /* O corpo da embalagem: painel e alvo dividem o espaco — um em cima
           do outro em pe', lado a lado deitado (v2.98.2). Deitado, um em
           cima do outro nao cabia: a barra de baixo saia da tela. */
        <div className="corpo-takt" style={est.corpoTakt}>
          <style>{ESTILO_TAKT}</style>
          {painel}
          {alvo}
        </div>
      ) : (
        <>
          {painel}
          {alvo}
        </>
      )}

      <nav style={est.barraInferiorTres} aria-label="Ações da conferência">
        <button type="button" style={barra} onClick={desfazer} disabled={!pecas || !!emParada}>
          <span style={icone}>↩</span>
          Desfazer
        </button>
        {/* Antes da largada nao ha' periodo para a parada caber dentro. */}
        <button
          type="button"
          style={{ ...barra, ...est.botaoParou }}
          onClick={() => (emParada ? encerrarParada() : setEscolhendoMotivo(true))}
          disabled={aguardandoLargada}
        >
          <span style={icone}>{emParada ? '▶' : '⏸'}</span>
          {emParada ? 'Voltou' : 'Parou'}
        </button>
        {/* Sem largada nada foi medido: o botao volta ao comeco, e diz isso. */}
        <button type="button" style={{ ...barra, ...est.botaoEncerrar }} onClick={encerrar}>
          <span style={icone}>{aguardandoLargada ? '✕' : '■'}</span>
          {aguardandoLargada ? 'Cancelar' : 'Encerrar'}
        </button>
      </nav>

      {escolhendoMotivo && (
        <div style={est.folhaMotivos} role="dialog" aria-label="Por que a máquina parou">
          <div style={est.folhaCaixa}>
            <div style={est.folhaTitulo}>Por que parou?</div>
            <div style={est.gradeMotivos}>
              {motivos.map((m) => (
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
  );
}

const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * O QUE O ESTILO INLINE NAO ALCANCA na tela da embalagem (ver corpoTakt):
 *
 *  - DEITADO: painel a' esquerda, alvo a' direita; o relogio do alvo (72 px
 *    fixos) encolhe para caber na meia largura — com 100 min de parada
 *    "101:00.0" saia pela borda.
 *  - PAINEL BAIXO (celular deitado com a barra do navegador a' vista):
 *    some primeiro o rotulo TEMPO, depois o relogio — o que decide (por
 *    volume, takt) e a linha de apoio ficam inteiros, nunca fatiados.
 *  - RESERVA para navegador sem dvh (Chrome < 108) e sem container query
 *    (Chrome < 105, Safari < 16): o estilo inline com dvh/cq e' invalido
 *    nele e e' descartado; estas classes, que perdem para o inline quando
 *    ele vale, assumem. Sem a altura reserva a tela perdia a altura e o
 *    alvo ficava com 2 px (revisao de 30/10).
 */
const ESTILO_TAKT = `
  .tela-takt { height: 100vh; }
  .takt-tempo { font-size: clamp(40px, 9vw, 72px); }
  .takt-grande { font-size: clamp(36px, 10vw, 84px); }
  .takt-media { font-size: clamp(24px, 6vw, 52px); }
  .takt-rotulo, .takt-rotulo-tempo { font-size: clamp(10px, 1.9vw, 16px); }
  .takt-sufixo { font-size: clamp(11px, 2vw, 20px); }
  @media (orientation: landscape) {
    .corpo-takt { flex-direction: row !important; }
    .corpo-takt .contagem-takt { font-size: clamp(40px, 6vw, 72px) !important; }
    .takt-tempo { font-size: clamp(24px, min(4.5vw, 9vh), 72px); }
    .takt-grande { font-size: clamp(26px, min(5vw, 12vh), 84px); }
    .takt-media { font-size: clamp(20px, min(3.2vw, 8vh), 52px); }
  }
  @container (max-height: 175px) { .takt-rotulo-tempo { display: none; } }
  @container (max-height: 140px) { .takt-tempo { display: none; } }
`;
