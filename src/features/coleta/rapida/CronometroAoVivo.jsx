import { useRef } from 'react';
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
  // dentro, ver periodoPorPeca) contra o TEMPO-ALVO DO PRODUTO (v2.106.0),
  // em segundos; e, de apoio, volumes, volumes/hora e o ULTIMO intervalo. O
  // takt da semana fica numa linha, sem cor: a carga, nao o veredito.
  modoTakt = false, taktMs = null, alvoMs = null, porVolumeMs = null,
  // v2.107.0: o que a semana pede NESTE produto ({ taktMs, pede }, de
  // alvoDoProduto) — um NUMERO na fileira de apoio, sem cor (PPCP: a linha
  // escrita, pequena, nao se via de longe e o verde parecia "tudo bem").
  // Sem ela, a linha do takt por volume de antes.
  semana = null,
  // O produto escolhido antes do INICIAR, no topo do painel da embalagem.
  produto = '',
}) {
  const {
    decorrido, pecas, pulso, emParada, tempoParadaAtual, escolhendoMotivo, paradaFechada,
    contarPeca, desfazer, iniciarParada, encerrarParada, encerrar, ultimoIntervaloMs,
    aguardandoLargada, escolherMotivo, adiarMotivo, cancelarParada,
  } = crono;
  // Na embalagem a barra de baixo cresce junto com o painel (v2.98.1):
  // com o resto grande, os 64 px de Desfazer, Parou e Encerrar ficaram miudos.
  const barra = modoTakt ? { ...est.botaoBarra, ...est.botaoBarraTakt } : est.botaoBarra;
  const icone = modoTakt ? est.iconeBarraTakt : est.iconeBarra;

  const painel = modoTakt ? (
    <PainelTakt
      produto={produto} decorridoMs={decorrido} volumes={pecas} unidade={unidade}
      porVolumeMs={porVolumeMs} alvoMs={alvoMs}
      volHora={parcial && pecas >= 2 ? Math.round(parcial.pecasPorHoraBruto) : null}
      ultimoMs={ultimoIntervaloMs} semana={semana} taktMs={taktMs}
    />
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
      {/* Sem motivo ainda, a parada ja' conta — o motivo e' perguntado no
          Voltou, e a tela avisa para ninguem achar que ficou sem registro. */}
      <span style={est.rotuloParadaAtiva}>
        PARADA · {emParada.motivo ? rotuloMotivo(emParada.motivo) : 'MOTIVO NA VOLTA'}
      </span>
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
        {/* Antes da largada nao ha' periodo para a parada caber dentro.
            O Parou ja' comeca a parada: o motivo vem depois. */}
        <button
          type="button"
          style={{ ...barra, ...est.botaoParou }}
          onClick={() => (emParada ? encerrarParada() : iniciarParada())}
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
            {/* O tempo da parada na propria lista: ela conta desde o Parou,
                nao desde a escolha — e quem le' a lista ve' isso. */}
            <div style={est.folhaTempoParada} role="timer">
              {paradaFechada
                ? `Parada de ${formatarCronometro(paradaFechada.ms)} — escolha o motivo para ${paradaFechada.encerrando ? 'ver o resultado' : 'seguir medindo'}.`
                : `A parada já está contando: ${formatarCronometro(Math.max(0, tempoParadaAtual))}`}
            </div>
            <div style={est.gradeMotivos}>
              {motivos.map((m) => (
                <BotaoDaFolha
                  key={m.codigo}
                  style={{ ...est.chipMotivo, ...(m.codigo === 'setup' ? est.chipSetup : {}) }}
                  aoTocar={() => escolherMotivo(m.codigo)}
                >
                  {m.rotulo}
                </BotaoDaFolha>
              ))}
            </div>
            {/* Na volta (ou no Encerrar) a parada ja' fechou: o motivo e' a
                saida. Antes disso, da' para deixar o motivo para a volta —
                ou desfazer o Parou tocado sem querer. */}
            {!paradaFechada && (
              <div style={est.linhaBotoesParada}>
                <BotaoDaFolha style={est.botaoOutraPeca} aoTocar={adiarMotivo}>
                  Motivo na volta
                </BotaoDaFolha>
                <BotaoDaFolha style={est.botaoOutraPeca} aoTocar={cancelarParada}>
                  Não parou
                </BotaoDaFolha>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * O PAINEL DA EMBALAGEM RODANDO: o produto, o tempo, o tempo por volume
 * contra o tempo-alvo (o que decide) e o apoio. Usado pelo cronometro do
 * tablet e, desde a v2.108.0, pelo Cronometrar por video do PC, com o
 * relogio do video — a mesma visao nos dois, para quem mede ler igual.
 *
 * O tamanho das letras sai do PROPRIO painel (containerType 'size', ver
 * painelTempoTakt): quem o usa da' a ele uma altura definida. No tablet,
 * o corpo da tela; no PC, uma caixa de altura fixa.
 *
 * volHora: volumes/hora do periodo ate' o ultimo volume, ja' arredondado
 * (null com menos de 2 volumes). ultimoMs: o intervalo entre as duas
 * ultimas marcas, no relogio da linha rodando.
 */
export function PainelTakt({
  produto = '', decorridoMs, volumes, unidade, porVolumeMs = null, alvoMs = null,
  volHora = null, ultimoMs = null, semana = null, taktMs = null,
}) {
  /* O aviso vai no tempo por volume do PERIODO, nao no ultimo intervalo: o
     rack de dois volumes sai com os dois colados (25 s, 100 s...), e o
     ultimo passaria do takt a cada dois volumes numa linha que atende. E
     com as paradas dentro: marcar "Parou" nao pode apagar o aviso.
     O QUADRO fica VERMELHO acima do alvo e VERDE quando chega nele (pedido
     do PPCP, 05/11): o fundo ambar claro de antes nao se via de longe. A
     regua e' o TEMPO-ALVO DO PRODUTO (v2.106.0, PPCP 11/11): com o takt, um
     numero so' para todo volume, o produto pesado ficava sempre vermelho.
     Sem alvo (produto sem UEP) ou sem tempo por volume ainda (menos de 2
     volumes), nem um nem outro: nao ha' o que comparar — e o takt NUNCA
     entra no lugar do alvo. */
  const semanaMs = semana?.taktMs > 0 ? semana.taktMs : null;
  const comparaAlvo = alvoMs > 0 && porVolumeMs > 0;
  const acimaDoAlvo = comparaAlvo && porVolumeMs > alvoMs;
  const tomPorVolume = comparaAlvo ? (acimaDoAlvo ? 'foraDoTakt' : 'noTakt') : null;
  const nomeProduto = String(produto || '').trim();
  return (
    /* EMBALAGEM: os numeros grandes e o alvo menor (v2.98.0, ver
       painelTempoTakt). Em cima o que decide — o tempo por volume
       contra o takt —, embaixo o apoio. O parado sai daqui (a parada
       em curso ocupa o alvo inteiro) e volta no resultado. */
    <section style={est.painelTempoTakt} aria-label="Tempo decorrido">
      {/* O QUE ESTA' SENDO MEDIDO, no topo: quem passa pela linha (ou o
          tablet preso nela) ve' de longe se o produto na esteira ainda e'
          o da medicao — trocou o produto, e' hora de encerrar, senao o
          tempo por volume sai misturado de dois produtos sob o nome de um.
          Sem produto, diz isso: ele ainda pode ser informado no resultado,
          antes de salvar. Painel baixo: uma linha, depois some (ESTILO_TAKT). */}
      <span
        className="takt-produto"
        style={{ ...est.produtoTela, ...(nomeProduto ? {} : est.produtoTelaVazio) }}
        title={nomeProduto || undefined}
      >
        {nomeProduto || 'Produto não informado'}
      </span>
      <span className="takt-rotulo-tempo" style={est.rotuloTempoTela}>TEMPO</span>
      <span className="takt-tempo" style={est.tempoCorridoTela}>{formatarCronometro(decorridoMs)}</span>
      <div style={est.gradeTaktPrincipal}>
        {/* Acima do alvo, o quadro fica vermelho E o rotulo ganha a SETA:
            a cor sozinha nao serve a quem nao distingue vermelho de verde,
            nem a quem olha de longe, de luva, com sol. Dentro, o ✓. */}
        <Parcial
          escala="grande"
          rotulo={acimaDoAlvo ? 'Por vol ▲ alvo' : comparaAlvo ? 'Por volume ✓ alvo' : 'Por volume'}
          valor={porVolumeMs ? formatarSegundos(porVolumeMs) : '—'}
          sufixo="s"
          tom={tomPorVolume}
        />
        {/* O TEMPO-ALVO do produto: o que ele pode levar para a linha fazer
            a media sem hora extra (UEP × segundos por UEP). */}
        <Parcial escala="grande" rotulo="Tempo-alvo" valor={alvoMs > 0 ? formatarSegundos(alvoMs) : '—'} sufixo="s" />
      </div>
      <div
        className={semanaMs > 0 ? 'takt-apoio4' : undefined}
        style={semanaMs > 0 ? { ...est.gradeTaktApoio, ...est.gradeTaktApoio4 } : est.gradeTaktApoio}
      >
        {/* Na embalagem o toque conta VOLUME — e a tela diz isso, porque
            o programa da embalagem tambem vem em volumes. */}
        <Parcial escala="media" rotulo={maiuscula(unidade.plural)} valor={String(volumes)} />
        {/* Volumes/hora do PERIODO ate' o ultimo toque, paradas dentro
            (a conta do resultado e da lista do PC, ate' o ultimo volume
            em vez de ate' o Encerrar). Parado entre um toque e outro:
            nao e' velocimetro. O rotulo diz "periodo" porque nao e' o da
            linha rodando — com parada marcada, os dois diferem. Com um
            volume so', o "por volume" ainda espera; este tambem. */}
        <Parcial
          escala="media"
          rotulo={`${unidade.abrev}/h período`}
          valor={volHora != null ? String(volHora) : '—'}
        />
        <Parcial
          escala="media"
          rotulo="Último"
          valor={ultimoMs ? formatarSegundos(ultimoMs) : '—'}
          sufixo="s"
        />
        {/* O que a semana pede NESTE produto: a carga, sem cor — a cor e' do
            tempo-alvo (os dois ficam a ~5%, o erro de uma medicao). */}
        {semanaMs > 0 && (
          <Parcial escala="media" rotulo="A semana pede" valor={formatarSegundos(semanaMs)} sufixo="s" />
        )}
      </div>
      {/* O takt da semana: a CARGA, igual para todo volume — escrito, sem
          cor e sem julgar. Some no painel baixo (ESTILO_TAKT). */}
      {semanaMs > 0 ? (
        <span className="takt-carga" style={est.linhaCarga}>
          {semana.pede > 0
            ? `a programação da semana pede ${Number(semana.pede).toFixed(1)}% da média da linha${semana.pede > 100 ? ': no tempo-alvo, ela não fecha' : ''}`
            : 'o que a programação da semana pede neste produto'} — não julga o produto
        </span>
      ) : taktMs > 0 && (
        <span className="takt-carga" style={est.linhaCarga}>
          carga da semana: takt {formatarSegundos(taktMs)} s — não julga o produto
        </span>
      )}
    </section>
  );
}

/**
 * BOTAO DA LISTA DE MOTIVOS: so' vale o toque que COMECOU nele.
 *
 * O VOLTOU sem motivo abre a lista no pointerdown; o click do mesmo toque,
 * no soltar do dedo, caia no motivo que ficou debaixo dele — deitado, o
 * tablet gravava "Problema de qualidade" sem ninguem escolher (revisao de
 * 05/11). Com o toque comecado em outro lugar, o click e' ignorado. O
 * click do teclado (detail 0) nao tem pointerdown e continua valendo.
 */
function BotaoDaFolha({ aoTocar, style, children }) {
  const comecouAqui = useRef(false);
  return (
    <button
      type="button"
      style={style}
      onPointerDown={() => { comecouAqui.current = true; }}
      onPointerCancel={() => { comecouAqui.current = false; }}
      onClick={(ev) => {
        if (!comecouAqui.current && ev.detail !== 0) return;
        comecouAqui.current = false;
        aoTocar();
      }}
    >
      {children}
    </button>
  );
}

/**
 * O QUE O ESTILO INLINE NAO ALCANCA na tela da embalagem (ver corpoTakt):
 *
 *  - DEITADO: painel a' esquerda, alvo a' direita; o relogio do alvo (72 px
 *    fixos) encolhe para caber na meia largura — com 100 min de parada
 *    "101:00.0" saia pela borda.
 *  - PAINEL BAIXO (celular deitado com a barra do navegador a' vista):
 *    o produto cai para uma linha, some o rotulo TEMPO, depois o relogio
 *    e, por ultimo, o produto — o que decide (por volume, takt) e a linha
 *    de apoio ficam inteiros, nunca fatiados. Os limites sairam de uma
 *    varredura de 640 a 1024 px de largura por 250 a 620 de altura, com
 *    nome vazio, curto e de 2 linhas: cada um com folga sobre o ultimo
 *    painel que ainda cortava.
 *  - RESERVA para navegador sem dvh (Chrome < 108) e sem container query
 *    (Chrome < 105, Safari < 16): o estilo inline com dvh/cq e' invalido
 *    nele e e' descartado; estas classes, que perdem para o inline quando
 *    ele vale, assumem. Sem a altura reserva a tela perdia a altura e o
 *    alvo ficava com 2 px (revisao de 30/10). Sem container query nada
 *    some por altura do painel: o produto fica em uma linha e, em tela
 *    baixa ou em pe' quase quadrada, sai (@supports) — ele identifica,
 *    nao decide, e nao pode empurrar os numeros para fora.
 */
export const ESTILO_TAKT = `
  .tela-takt { height: 100vh; }
  .takt-tempo { font-size: clamp(40px, 9vw, 72px); }
  .takt-grande { font-size: clamp(36px, 10vw, 84px); }
  .takt-media { font-size: clamp(24px, 6vw, 52px); }
  .takt-rotulo, .takt-rotulo-tempo { font-size: clamp(10px, 1.9vw, 16px); }
  .takt-produto {
    font-size: clamp(14px, 4.4vw, 34px);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  }
  .takt-sufixo { font-size: clamp(11px, 2vw, 20px); }
  .takt-carga { font-size: clamp(11px, 1.8vw, 16px); }
  @media (orientation: landscape) {
    .corpo-takt { flex-direction: row !important; }
    .corpo-takt .contagem-takt { font-size: clamp(40px, 6vw, 72px) !important; }
    .takt-tempo { font-size: clamp(24px, min(4.5vw, 9vh), 72px); }
    .takt-grande { font-size: clamp(26px, min(5vw, 12vh), 84px); }
    .takt-media { font-size: clamp(20px, min(3.2vw, 8vh), 52px); }
    .takt-produto { font-size: clamp(14px, min(2.6vw, 6vh), 34px); }
  }
  @container (max-height: 230px) { .takt-carga { display: none; } }
  /* v2.107.0: quatro numeros de apoio (com A SEMANA PEDE). Medido deitado no
     celular (740 x 360): cada celula com 72 px e o rotulo "VOL/H PERIODO" com
     77 — menos espaco entre as letras; no painel estreito (ate' 340 px: 667 x
     325, 640 x 300, 360 x 740) a letra do rotulo desce a 9 px, sem espaco
     entre as letras, e o rotulo fica numa linha. Quebrar em duas (v2.107.0
     antes da revisao) cortava 5 px dos numeros de baixo a 667 x 325. */
  .takt-apoio4 .takt-rotulo { letter-spacing: 0.2px !important; }
  @container (max-width: 340px) {
    .takt-apoio4 .takt-rotulo { font-size: 9px !important; letter-spacing: 0 !important; }
  }
  @container (max-height: 185px) { .takt-produto { -webkit-line-clamp: 1; } }
  @container (max-height: 175px) { .takt-rotulo-tempo { display: none; } }
  @container (max-height: 140px) { .takt-tempo { display: none; } }
  @container (max-height: 100px) { .takt-produto { display: none; } }
  @supports not (container-type: size) {
    .takt-produto { -webkit-line-clamp: 1; }
    /* Tela baixa, ou em pe' quase quadrada (as letras seguem a largura e
       o painel fica baixo): sem o produto, como era antes dele. */
    @media (max-height: 600px), (orientation: portrait) and (min-aspect-ratio: 4/5) {
      .takt-produto, .takt-carga { display: none; }
    }
  }
`;
