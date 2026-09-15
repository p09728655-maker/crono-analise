import { useId } from 'react';
import { claro, referencia, serie } from '../../../theme/tokensAnalise.js';
import { lerTendenciaPeriodo, tendenciasDoPeriodo } from '../../../domain/tendenciaPeriodo.js';
import {
  COR_TOM, EIXO_MINI, ESTILO_TELA_MINI, Legenda, Texturas, passoAgradavel, useLarguraContainer,
} from './comuns.jsx';
import { est } from './estilos.js';

/* ------------------------------------------------- tendencia no periodo */

/**
 * Tendencia do ritmo NO TEMPO — um quadro por maquina.
 *
 * Irma do GraficoTendencia, com outro eixo e outra pergunta. La' o X e' a
 * ordem dos ciclos de UMA cronometragem (fadiga, aquecimento); aqui o X e'
 * a DATA, e a pergunta e' se a maquina esta' rendendo mais ou menos que
 * semana passada (broca, ajuste, abastecimento).
 *
 * O X e' o tempo REAL, nao a ordem da medicao: quatro medicoes numa manha
 * e uma dez dias depois nao sao cinco passos iguais, e espacar por ordem
 * inventaria uma queda suave onde houve um salto entre duas datas.
 *
 * A reta e' desenhada sobre o ritmo BRUTO — o numero que o analista
 * conhece —, mas so' aparece CHEIA quando a tendencia sobrevive a
 * correcao pela peca (ver tendenciaPeriodo.js). Tracejada, ela diz "e' o
 * que os pontos fazem", nao "a maquina mudou".
 */
export function GraficoTendenciaPeriodo({ conferencias, resumo, altura = 160, larguraFixa, colunas }) {
  const series = tendenciasDoPeriodo(conferencias, resumo).filter((s) => s.n > 0);
  if (!series.length) return null;

  return (
    <figure style={est.figuraQuebravel}>
      <figcaption style={est.titulo}>
        Tendência do ritmo no tempo
        <span style={est.subtitulo}>
          Cada medição na data em que foi feita — o posto está rendendo mais ou menos que antes
        </span>
      </figcaption>

      <Legenda
        itens={[
          { rotulo: 'Medição', cor: serie.tn },
          {
            rotulo: 'Medição curta (menos de 5 min rodando)',
            cor: serie.tolerancia,
            hachura: `repeating-linear-gradient(45deg, ${serie.tolerancia} 0 3px, rgba(255,255,255,.55) 3px 5px)`,
          },
          { rotulo: 'Reta do período (tracejada = não confirmada)', cor: referencia.linha },
        ]}
      />

      <style>{ESTILO_TELA_MINI}</style>
      <div style={{ ...est.gradeTendencia, ...(colunas ? { gridTemplateColumns: `repeat(${colunas}, 1fr)` } : {}) }}>
        {series.map((s) => (
          <MiniPeriodo key={s.maquina} serie={s} altura={altura} larguraFixa={larguraFixa} />
        ))}
      </div>
    </figure>
  );
}

const dataCurta = (ts) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function MiniPeriodo({ serie: s, altura, larguraFixa }) {
  const [refContainer, larguraMedida] = useLarguraContainer(240);
  const largura = larguraFixa || larguraMedida || 240;
  const id = useId().replace(/:/g, '');

  const leitura = lerTendenciaPeriodo(s);
  const { pontos, reta, n } = s;

  const ritmos = pontos.map((p) => p.ritmo);
  const minR = Math.min(...ritmos, ...(reta ? [reta.inicio, reta.fim] : []));
  const maxR = Math.max(...ritmos, ...(reta ? [reta.inicio, reta.fim] : []));
  const media = ritmos.reduce((a, v) => a + v, 0) / n;
  const faixa = Math.max(maxR - minR, media * 0.1);
  const lo = Math.max(0, minR - faixa * 0.2);
  const hi = maxR + faixa * 0.2;

  const alturaPlot = altura - EIXO_MINI.topo - EIXO_MINI.base;
  const larguraPlot = largura - EIXO_MINI.esq - EIXO_MINI.dir;
  const yDe = (v) => EIXO_MINI.topo + alturaPlot - ((v - lo) / (hi - lo)) * alturaPlot;

  // Eixo do TEMPO. Todas as medicoes no mesmo instante: distribui por ordem
  // para os pontos nao empilharem num risco vertical.
  const t0 = pontos[0].ts;
  const span = pontos[n - 1].ts - t0;
  const xDe = (i) => (span > 0
    ? EIXO_MINI.esq + ((pontos[i].ts - t0) / span) * larguraPlot
    : EIXO_MINI.esq + (n > 1 ? (i / (n - 1)) * larguraPlot : larguraPlot / 2));

  const passo = passoAgradavel(hi - lo, 4);
  const grades = [];
  for (let k = Math.ceil(lo / passo); k * passo <= hi; k += 1) grades.push(k * passo);

  const pct = Math.round(s.direcao === 'estavel' ? s.pctBruto : s.pct);
  const sinal = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const corTom = COR_TOM[leitura.tom] || claro.neutro;

  return (
    <div style={est.miniTendencia} className="mini-tendencia">
      <div style={est.miniTopo} className="mini-topo">
        <span style={est.miniNome} title={s.maquina}>{s.maquina}</span>
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
          aria-label={`Tendência no tempo de ${s.maquina}: ${leitura.rotulo}, ${n} medição(ões)`}
        >
          <Texturas id={id} />

          {grades.map((v) => (
            <g key={v}>
              <line
                x1={EIXO_MINI.esq} x2={largura - EIXO_MINI.dir} y1={yDe(v)} y2={yDe(v)}
                stroke={claro.borda} strokeWidth="1"
              />
              <text x={EIXO_MINI.esq - 6} y={yDe(v) + 3.5} textAnchor="end" style={est.rotuloEixo}>
                {Math.round(v)}
              </text>
            </g>
          ))}

          {reta && (
            <line
              x1={EIXO_MINI.esq} y1={yDe(reta.inicio)}
              x2={largura - EIXO_MINI.dir} y2={yDe(reta.fim)}
              stroke={referencia.linha} strokeWidth="2" strokeLinecap="round"
              strokeDasharray={s.direcao === 'estavel' ? referencia.traco : undefined}
            />
          )}

          {pontos.map((p, i) => (
            <circle
              key={p.chave}
              cx={xDe(i)} cy={yDe(p.ritmo)} r="3.8"
              fill={p.confiavel ? serie.tn : `url(#${id}-hachura)`}
              stroke={claro.papel} strokeWidth="1.5"
            >
              <title>
                {`${dataCurta(p.ts)} · ${p.peca}: ${Math.round(p.ritmo)} pç/h`}
                {p.confiavel ? '' : ' (medição curta)'}
              </title>
            </circle>
          ))}

          <line
            x1={EIXO_MINI.esq} x2={largura - EIXO_MINI.dir}
            y1={EIXO_MINI.topo + alturaPlot} y2={EIXO_MINI.topo + alturaPlot}
            stroke={claro.bordaForte} strokeWidth="1"
          />
          <text x={EIXO_MINI.esq} y={altura - 6} style={est.rotuloEixo}>{dataCurta(t0)}</text>
          <text x={largura - EIXO_MINI.dir} y={altura - 6} textAnchor="end" style={est.rotuloEixo}>
            {dataCurta(pontos[n - 1].ts)}
          </text>
          <text x={EIXO_MINI.esq - 6} y={EIXO_MINI.topo - 1} textAnchor="end" style={est.rotuloEixo}>pç/h</text>
        </svg>
      </div>

      <p style={est.miniLeitura} className="mini-leitura">{leitura.frase}</p>
    </div>
  );
}
