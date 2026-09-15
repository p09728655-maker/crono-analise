import { claro, referencia, serie } from '../../../theme/tokensAnalise.js';
import { formatarSegundos } from '../../../domain/cronoanalise.js';
import { lerTendencia, serieDeTendencia } from '../../../domain/tendenciaColeta.js';
import {
  COR_TOM, EIXO_MINI, ESTILO_TELA_MINI, Legenda, VazioGrafico, passoAgradavel, useLarguraContainer,
} from './comuns.jsx';
import { est } from './estilos.js';

/* --------------------------------------------------------------- tendencia */

/**
 * Tendencia ao longo da coleta — pequenos multiplos, um por operacao.
 *
 * Cada quadro traz os ciclos NA ORDEM em que foram cronometrados e a reta
 * ajustada sobre eles. E' a evidencia da sugestao "tempos subindo": mostra
 * ONDE subiram — do meio para o fim (fadiga), so' no comeco (aquecimento)
 * ou nada disso (dispersao que a reta resume mal).
 *
 * Um quadro por operacao, em vez de todas as curvas juntas: as operacoes
 * tem escalas diferentes (4 s contra 10 s) e a reta de uma esmagaria a da
 * outra. Cada quadro tem o proprio eixo, com o zero FORA: o que se le' e' a
 * inclinacao, e um eixo desde zero achataria uma subida de 12% a um fio.
 * Por isso o eixo leva os valores escritos — a escala nunca fica implicita.
 *
 * `larguraFixa` serve a' folha A4: la' o container esta' oculto na tela e
 * a medicao devolveria zero; a largura util do papel e' conhecida.
 */
export function GraficoTendencia({ operacoes, altura = 150, larguraFixa, colunas }) {
  const dados = (operacoes || []).filter((o) => o.resultado);
  if (!dados.length) {
    return <VazioGrafico texto="Colete ciclos para ver a tendência de cada operação." />;
  }

  return (
    /* A figura PODE quebrar de pagina: cada quadro segura a propria quebra
       (est.miniTendencia). Com 9+ operacoes o bloco inteiro passa de uma
       folha A4, e o "nao quebrar figura" global do index.html o empurraria
       para uma pagina nova e ainda o partiria. */
    <figure style={est.figuraQuebravel}>
      <figcaption style={est.titulo}>
        Tendência ao longo da coleta
        <span style={est.subtitulo}>
          Cada ciclo na ordem em que foi cronometrado, com a reta de tendência — subindo é fadiga ou
          ferramenta; caindo é curva de aprendizado
        </span>
      </figcaption>

      <Legenda
        itens={[
          { rotulo: 'Ciclo cronometrado', cor: serie.tn },
          { rotulo: 'Reta de tendência', cor: referencia.linha },
        ]}
      />

      <style>{ESTILO_TELA_MINI}</style>
      <div style={{ ...est.gradeTendencia, ...(colunas ? { gridTemplateColumns: `repeat(${colunas}, 1fr)` } : {}) }}>
        {dados.map((op) => (
          <MiniTendencia key={op.id} operacao={op} altura={altura} larguraFixa={larguraFixa} />
        ))}
      </div>
    </figure>
  );
}

function MiniTendencia({ operacao, altura, larguraFixa }) {
  const [refContainer, larguraMedida] = useLarguraContainer(240);
  const largura = larguraFixa || larguraMedida || 240;

  const s = serieDeTendencia(operacao.tempos);
  const leitura = lerTendencia(s);
  const { ciclos, n, reta } = s;

  /* Dominio do eixo Y: a faixa dos ciclos com folga, nunca desde zero (ver
     o comentario do grafico). A folga minima e' 10% da media, para uma
     serie quase constante nao virar serra por causa de 50 ms de ruido. */
  // A reta entra no dominio: ajustada, ela pode passar dos pontos (toque
  // acidental no fim de ciclos longos) e sumiria cortada pelo viewBox.
  const minC = Math.min(...ciclos, ...(reta ? [reta.inicio, reta.fim] : []));
  const maxC = Math.max(...ciclos, ...(reta ? [reta.inicio, reta.fim] : []));
  const media = ciclos.reduce((a, v) => a + v, 0) / n;
  const faixa = Math.max(maxC - minC, media * 0.1);
  const lo = Math.max(0, minC - faixa * 0.2);
  const hi = maxC + faixa * 0.2;

  const alturaPlot = altura - EIXO_MINI.topo - EIXO_MINI.base;
  const larguraPlot = largura - EIXO_MINI.esq - EIXO_MINI.dir;
  const yDe = (ms) => EIXO_MINI.topo + alturaPlot - ((ms - lo) / (hi - lo)) * alturaPlot;
  // Um ciclo so': ponto no centro; dois ou mais: do primeiro ao ultimo.
  const xDe = (i) => EIXO_MINI.esq + (n > 1 ? (i / (n - 1)) * larguraPlot : larguraPlot / 2);

  /* Linhas de grade "redondas" dentro da faixa, em segundos. Alvo de 4
     para uma faixa estreita (4,1 s a 4,3 s) ainda ganhar mais de uma linha.
     O laco anda em INTEIROS: somar 0,1 repetidamente produz 4,2000000001
     e o rotulo sairia com o lixo do ponto flutuante. */
  const passo = passoAgradavel((hi - lo) / 1000, 4);
  const casas = passo >= 1 ? 0 : passo >= 0.1 ? 1 : 2;
  const grades = [];
  for (let k = Math.ceil(lo / 1000 / passo); k * passo * 1000 <= hi; k += 1) {
    grades.push(Number((k * passo).toFixed(casas)));
  }

  const pct = Math.round(s.pctExibida);
  const sinal = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const corTom = COR_TOM[leitura.tom] || claro.neutro;

  return (
    <div style={est.miniTendencia} className="mini-tendencia">
      <div style={est.miniTopo} className="mini-topo">
        <span style={est.miniNome} title={operacao.nome}>{operacao.nome}</span>
        {/* Selo de TEXTO com o numero: cor sozinha nao informa. */}
        <span style={{ ...est.miniSelo, color: corTom, borderColor: corTom }} className="mini-selo">
          {leitura.rotulo}{reta && leitura.mostrarPct ? ` · ${sinal}${Math.abs(pct)}%` : ''}
        </span>
      </div>

      <div ref={refContainer}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width={largura}
          height={altura}
          style={{ maxWidth: '100%', height: altura, display: 'block' }}
          role="img"
          aria-label={`Tendência de ${operacao.nome}: ${leitura.rotulo}, ${n} ciclo(s)`}
        >
          {grades.map((v) => (
            <g key={v}>
              <line
                x1={EIXO_MINI.esq} x2={largura - EIXO_MINI.dir}
                y1={yDe(v * 1000)} y2={yDe(v * 1000)}
                stroke={claro.borda} strokeWidth="1"
              />
              <text x={EIXO_MINI.esq - 6} y={yDe(v * 1000) + 3.5} textAnchor="end" style={est.rotuloEixo}>
                {v.toFixed(casas)}s
              </text>
            </g>
          ))}

          {/* Ligacao fina entre ciclos: mostra a ORDEM sem competir com a reta. */}
          {n > 1 && (
            <polyline
              points={ciclos.map((c, i) => `${xDe(i)},${yDe(c)}`).join(' ')}
              fill="none" stroke={serie.tn} strokeWidth="1.5" opacity="0.35"
            />
          )}

          {/* A reta por baixo dos pontos: e' resumo, nao dado. TRACEJADA
              quando a direcao nao foi confirmada — reta cheia e' afirmacao,
              e uma reta cheia sobre ruido convence do que nao ha'. */}
          {reta && (
            <line
              x1={xDe(0)} y1={yDe(reta.inicio)} x2={xDe(n - 1)} y2={yDe(reta.fim)}
              stroke={referencia.linha} strokeWidth="2" strokeLinecap="round"
              strokeDasharray={s.direcao === 'estavel' ? referencia.traco : undefined}
            />
          )}

          {ciclos.map((c, i) => (
            <circle
              key={i}
              cx={xDe(i)} cy={yDe(c)} r="3.5"
              fill={serie.tn} stroke={claro.papel} strokeWidth="1.5"
            >
              <title>{`Ciclo ${i + 1}: ${formatarSegundos(c)} s`}</title>
            </circle>
          ))}

          <line
            x1={EIXO_MINI.esq} x2={largura - EIXO_MINI.dir}
            y1={EIXO_MINI.topo + alturaPlot} y2={EIXO_MINI.topo + alturaPlot}
            stroke={claro.bordaForte} strokeWidth="1"
          />
          <text x={EIXO_MINI.esq} y={altura - 6} style={est.rotuloEixo}>1º ciclo</text>
          <text x={largura - EIXO_MINI.dir} y={altura - 6} textAnchor="end" style={est.rotuloEixo}>
            {n}º
          </text>
        </svg>
      </div>

      <p style={est.miniLeitura} className="mini-leitura">{leitura.frase}</p>
    </div>
  );
}
