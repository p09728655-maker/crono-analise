import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { claro, referencia, serie } from '../../theme/tokensAnalise.js';
import { formatarSegundos } from '../../domain/cronoanalise.js';

/**
 * Graficos de cronoanalise em SVG inline.
 *
 * Sem biblioteca de charts: sao tres formas conhecidas, o SVG e' nativo, e o
 * resultado imprime com nitidez de vetor. Uma dependencia aqui custaria mais
 * KB que todo o resto do app.
 *
 * Identidade nunca depende so' de cor:
 *  - legenda sempre presente (2 series);
 *  - a serie de tolerancia leva TEXTURA hachurada, entao continua distinguivel
 *    em impressao P&B e para quem tem daltonismo;
 *  - gargalo e ponto fora de controle levam forma + rotulo, nao so' cor.
 */

const EIXO = { esq: 52, dir: 16, topo: 16, base: 44 };

/**
 * Largura real do container.
 *
 * Um viewBox de proporcao fixa dentro de um elemento largo e' centralizado
 * e letterboxed pelo preserveAspectRatio, deixando o grafico pequeno no meio
 * de um vazio. Medindo o container e usando a largura medida como dominio do
 * viewBox, o grafico ocupa o espaco disponivel sem distorcer texto.
 */
function useLarguraContainer(minimo = 320) {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);

  const medir = useCallback(() => {
    const l = ref.current?.clientWidth ?? 0;
    if (l > 0) setLargura(Math.max(minimo, l));
  }, [minimo]);

  useEffect(() => {
    medir();
    if (!ref.current || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(medir);
    obs.observe(ref.current);
    // A impressao muda a largura util sem disparar resize em todo navegador.
    const antesDeImprimir = () => setTimeout(medir, 0);
    window.addEventListener('beforeprint', antesDeImprimir);
    return () => { obs.disconnect(); window.removeEventListener('beforeprint', antesDeImprimir); };
  }, [medir]);

  return [ref, largura];
}

/** Escala linear de dominio para faixa de pixels. */
const escala = (valor, max, tamanho) => (max <= 0 ? 0 : (valor / max) * tamanho);

/** Passo de grade "redondo" para o eixo Y. */
function passoAgradavel(max, alvo = 5) {
  if (max <= 0) return 1;
  const bruto = max / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const passo = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return passo * mag;
}

/* ------------------------------------------------------------- textura P&B */

function Texturas({ id }) {
  return (
    <defs>
      {/* Hachura a 45 graus: o que separa as series quando a cor some. */}
      <pattern id={`${id}-hachura`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill={serie.tolerancia} />
        <line x1="0" y1="0" x2="0" y2="6" stroke={claro.papel} strokeWidth="2.5" opacity="0.55" />
      </pattern>
    </defs>
  );
}

function Legenda({ itens }) {
  return (
    <div style={est.legenda}>
      {itens.map((i) => (
        <span key={i.rotulo} style={est.legendaItem}>
          <span style={{ ...est.legendaMarca, background: i.cor, backgroundImage: i.hachura }} />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Yamazumi */

/**
 * Yamazumi — carga de trabalho por operacao contra o Takt.
 *
 * Cada barra empilha TN (trabalho efetivo) + o acrescimo de tolerancia,
 * somando o TP. A separacao importa: mostra quanto do tempo padrao e' esforco
 * real e quanto e' fadiga/necessidades, que se tratam de formas diferentes.
 */
export function GraficoYamazumi({ operacoes, taktMs, altura = 340 }) {
  const id = useId().replace(/:/g, '');
  const [ativo, setAtivo] = useState(null);
  const [refContainer, larguraContainer] = useLarguraContainer(360);

  const dados = operacoes.filter((o) => o.resultado);
  if (!dados.length) {
    return <VazioGrafico texto="Colete ciclos para gerar o Yamazumi." />;
  }

  const maiorTp = Math.max(...dados.map((o) => o.resultado.tpVal));
  const maxDominio = Math.max(maiorTp, taktMs || 0) * 1.12;
  const passo = passoAgradavel(maxDominio / 1000);

  // Largura minima por barra garante rotulo legivel; acima disso, ocupa tudo.
  const larguraMinima = dados.length * 96 + EIXO.esq + EIXO.dir;
  const largura = Math.max(larguraMinima, larguraContainer || larguraMinima);
  const alturaPlot = altura - EIXO.topo - EIXO.base;
  const larguraBanda = (largura - EIXO.esq - EIXO.dir) / dados.length;
  const larguraBarra = Math.min(56, larguraBanda * 0.62);

  const linhas = [];
  for (let v = 0; v <= maxDominio / 1000; v += passo) linhas.push(v);

  const yDe = (ms) => EIXO.topo + alturaPlot - escala(ms, maxDominio, alturaPlot);
  const yTakt = taktMs ? yDe(taktMs) : null;

  return (
    <figure style={est.figura}>
      <figcaption style={est.titulo}>
        Yamazumi — carga por operação
        <span style={est.subtitulo}>Tempo padrão de cada operação frente ao ritmo exigido pela demanda</span>
      </figcaption>

      <Legenda
        itens={[
          { rotulo: 'Tempo normal', cor: serie.tn },
          { rotulo: 'Tolerância', cor: serie.tolerancia, hachura: `repeating-linear-gradient(45deg, ${serie.tolerancia} 0 3px, rgba(255,255,255,.55) 3px 5px)` },
          ...(taktMs ? [{ rotulo: 'Takt Time', cor: referencia.linha }] : []),
        ]}
      />

      <div style={est.rolagem} ref={refContainer}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width={largura}
          height={altura}
          style={{ maxWidth: '100%', height: altura, display: 'block' }}
          role="img"
          aria-label={`Yamazumi de ${dados.length} operações`}
        >
          <Texturas id={id} />

          {/* Grade recessiva */}
          {linhas.map((v) => (
            <g key={v}>
              <line
                x1={EIXO.esq} x2={largura - EIXO.dir}
                y1={yDe(v * 1000)} y2={yDe(v * 1000)}
                stroke={claro.borda} strokeWidth="1"
              />
              <text x={EIXO.esq - 8} y={yDe(v * 1000) + 4} textAnchor="end" style={est.rotuloEixo}>
                {v}
              </text>
            </g>
          ))}
          <text x={12} y={EIXO.topo + alturaPlot / 2} style={est.tituloEixo}
                transform={`rotate(-90 12 ${EIXO.topo + alturaPlot / 2})`}>
            segundos
          </text>

          {dados.map((op, i) => {
            const r = op.resultado;
            const x = EIXO.esq + i * larguraBanda + (larguraBanda - larguraBarra) / 2;
            const alturaTn = escala(r.tnMed, maxDominio, alturaPlot);
            const alturaTol = escala(r.tpVal - r.tnMed, maxDominio, alturaPlot);
            const destaque = ativo === i;

            return (
              <g key={op.id} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}>
                {/* Alvo de hover maior que a marca */}
                <rect x={EIXO.esq + i * larguraBanda} y={EIXO.topo}
                      width={larguraBanda} height={alturaPlot} fill="transparent" />

                {/* Tolerancia (topo da pilha, cantos arredondados) */}
                <rect
                  x={x} y={yDe(r.tpVal)} width={larguraBarra} height={Math.max(0, alturaTol)}
                  fill={`url(#${id}-hachura)`} rx="4"
                  opacity={destaque ? 1 : 0.94}
                />
                {/* Gap de 2px entre segmentos empilhados */}
                <rect
                  x={x} y={yDe(r.tnMed)} width={larguraBarra} height={Math.max(0, alturaTn)}
                  fill={serie.tn} rx="4"
                  opacity={destaque ? 1 : 0.94}
                />
                <rect x={x} y={yDe(r.tnMed) - 1} width={larguraBarra} height="2" fill={claro.papel} />

                {/* Valor direto no topo — sem obrigar leitura no eixo */}
                <text
                  x={x + larguraBarra / 2} y={altura - EIXO.base + 16}
                  textAnchor="middle" style={est.rotuloCategoria}
                >
                  {op.nome.length > 12 ? `${op.nome.slice(0, 11)}…` : op.nome}
                </text>
              </g>
            );
          })}

          {/* Linha de Takt por cima das barras, com rotulo direto */}
          {yTakt !== null && (
            <g>
              <line
                x1={EIXO.esq} x2={largura - EIXO.dir} y1={yTakt} y2={yTakt}
                stroke={referencia.linha} strokeWidth="2" strokeDasharray={referencia.traco}
              />
              <rect x={largura - EIXO.dir - 92} y={yTakt - 18} width="88" height="16" rx="3" fill={claro.papel} opacity="0.9" />
              <text x={largura - EIXO.dir - 6} y={yTakt - 6} textAnchor="end" style={est.rotuloReferencia}>
                TAKT {formatarSegundos(taktMs)}s
              </text>
            </g>
          )}

          {/* Rotulos DEPOIS da linha de Takt: desenhados antes, sairiam
              riscados pelo tracejado sempre que o TP ficasse perto do Takt. */}
          {dados.map((op, i) => {
            const r = op.resultado;
            const x = EIXO.esq + i * larguraBanda + (larguraBanda - larguraBarra) / 2;
            const cx = x + larguraBarra / 2;
            const gargalo = taktMs > 0 && r.tpVal > taktMs;
            return (
              <g key={`rotulo-${op.id}`} pointerEvents="none">
                <text
                  x={cx} y={yDe(r.tpVal) - 8} textAnchor="middle" style={est.valorBarra}
                  stroke={claro.papel} strokeWidth="3.5" paintOrder="stroke"
                >
                  {formatarSegundos(r.tpVal)}s
                </text>
                {/* Gargalo marcado por FORMA, nao so' por cor. */}
                {gargalo && (
                  <g>
                    <polygon
                      points={`${cx},${yDe(r.tpVal) - 26} ${cx - 6},${yDe(r.tpVal) - 16} ${cx + 6},${yDe(r.tpVal) - 16}`}
                      fill={claro.critico} stroke={claro.papel} strokeWidth="1.5"
                    />
                    <title>Acima do Takt Time — gargalo</title>
                  </g>
                )}
              </g>
            );
          })}

          <line x1={EIXO.esq} x2={largura - EIXO.dir} y1={EIXO.topo + alturaPlot} y2={EIXO.topo + alturaPlot}
                stroke={claro.bordaForte} strokeWidth="1" />
        </svg>
      </div>

      {ativo !== null && dados[ativo] && <Tooltip operacao={dados[ativo]} taktMs={taktMs} />}
    </figure>
  );
}

function Tooltip({ operacao, taktMs }) {
  const r = operacao.resultado;
  const ocupacao = taktMs > 0 ? (r.tpVal / taktMs) * 100 : null;
  return (
    <div style={est.tooltip} role="status">
      <strong>{operacao.nome}</strong>
      <span>TN {formatarSegundos(r.tnMed)}s · Tolerância {formatarSegundos(r.tpVal - r.tnMed)}s</span>
      <span>TP {formatarSegundos(r.tpVal)}s · {r.cap} pç/h · {r.n} ciclos</span>
      {ocupacao !== null && (
        <span>
          Ocupação {ocupacao.toFixed(0)}% do Takt
          {ocupacao > 100 ? ' — gargalo' : ''}
        </span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- carta controle */

/**
 * Carta de controle +-3 sigma sobre a ordem de coleta.
 *
 * Atencao ao ler: com n <= 10 esta carta NAO consegue sinalizar ponto algum,
 * porque max|x-media|/sigma <= (n-1)/raiz(n), que vale 2,85 para n=10. O
 * componente avisa isso na tela em vez de dar falsa sensacao de controle.
 */
export function CartaControle({ operacao, altura = 260 }) {
  const id = useId().replace(/:/g, '');
  const [refContainer, larguraContainer] = useLarguraContainer(360);
  const r = operacao?.resultado;
  if (!r || r.n < 2) return <VazioGrafico texto="São necessários ao menos 2 ciclos." />;

  const tempos = operacao.tempos.filter((t) => t > 200);
  const { carta, outliers } = r;
  const idxOutliers = new Set(outliers.map((o) => o.indice));

  const maxDominio = Math.max(carta.lsc, ...tempos) * 1.08;
  const minDominio = Math.max(0, Math.min(carta.lic, ...tempos) * 0.92);
  const faixa = maxDominio - minDominio || 1;

  const larguraMinima = Math.max(360, tempos.length * 26 + EIXO.esq + EIXO.dir);
  const largura = Math.max(larguraMinima, larguraContainer || larguraMinima);
  const alturaPlot = altura - EIXO.topo - EIXO.base;
  const yDe = (ms) => EIXO.topo + alturaPlot - ((ms - minDominio) / faixa) * alturaPlot;
  const xDe = (i) => EIXO.esq + (tempos.length === 1 ? 0 : (i / (tempos.length - 1)) * (largura - EIXO.esq - EIXO.dir));

  const caminho = tempos.map((t, i) => `${i === 0 ? 'M' : 'L'} ${xDe(i)} ${yDe(t)}`).join(' ');
  const cartaCega = r.n <= 10;

  return (
    <figure style={est.figura}>
      <figcaption style={est.titulo}>
        Carta de controle — {operacao.nome}
        <span style={est.subtitulo}>Sequência dos ciclos frente aos limites de ±3σ</span>
      </figcaption>

      {cartaCega && (
        <p style={est.alerta}>
          <strong>Leitura limitada.</strong> Com {r.n} ciclos, a carta ±3σ não consegue
          sinalizar ponto algum — o teto matemático é (n−1)/√n = {((r.n - 1) / Math.sqrt(r.n)).toFixed(2)}, menor que 3.
          Colete ao menos 11 ciclos para que ela passe a funcionar.
        </p>
      )}

      <div style={est.rolagem} ref={refContainer}>
        <svg viewBox={`0 0 ${largura} ${altura}`} width={largura} height={altura}
             style={{ maxWidth: '100%', height: altura, display: 'block' }}
             role="img" aria-label={`Carta de controle de ${operacao.nome}`}>
          {[
            { v: carta.lsc, rotulo: 'LSC', traco: '5 4' },
            { v: carta.media, rotulo: 'Média', traco: null },
            { v: carta.lic, rotulo: 'LIC', traco: '5 4' },
          ].map((l) => (
            <g key={l.rotulo}>
              <line x1={EIXO.esq} x2={largura - EIXO.dir} y1={yDe(l.v)} y2={yDe(l.v)}
                    stroke={l.traco ? claro.bordaForte : claro.textoMedio}
                    strokeWidth={l.traco ? 1.5 : 2} strokeDasharray={l.traco || undefined} />
              <text x={EIXO.esq - 8} y={yDe(l.v) + 4} textAnchor="end" style={est.rotuloEixo}>
                {l.rotulo}
              </text>
            </g>
          ))}

          <path d={caminho} fill="none" stroke={serie.tn} strokeWidth="2" strokeLinejoin="round" />

          {tempos.map((t, i) => {
            const fora = idxOutliers.has(i);
            return fora ? (
              // Fora de controle: forma diferente + titulo, nao apenas cor.
              <g key={i}>
                <polygon
                  points={`${xDe(i)},${yDe(t) - 6} ${xDe(i) - 6},${yDe(t) + 5} ${xDe(i) + 6},${yDe(t) + 5}`}
                  fill={claro.critico} stroke={claro.papel} strokeWidth="2"
                />
                <title>{`Ciclo ${i + 1}: ${formatarSegundos(t)}s — fora de controle`}</title>
              </g>
            ) : (
              <circle key={i} cx={xDe(i)} cy={yDe(t)} r="4.5" fill={serie.tn} stroke={claro.papel} strokeWidth="2">
                <title>{`Ciclo ${i + 1}: ${formatarSegundos(t)}s`}</title>
              </circle>
            );
          })}

          <text x={largura / 2} y={altura - 8} textAnchor="middle" style={est.rotuloCategoria}>
            ordem de coleta
          </text>
        </svg>
      </div>
    </figure>
  );
}

function VazioGrafico({ texto }) {
  return <div style={est.vazio}>{texto}</div>;
}

/* ------------------------------------------------------------------ estilos */

const est = {
  figura: { margin: 0, background: claro.papel, border: `1px solid ${claro.borda}`, borderRadius: 10, padding: 20 },
  titulo: { display: 'block', fontSize: 15, fontWeight: 700, color: claro.texto, marginBottom: 4 },
  subtitulo: { display: 'block', fontSize: 12, fontWeight: 400, color: claro.textoFraco, marginTop: 2 },
  legenda: { display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0', fontSize: 12, color: claro.textoMedio },
  legendaItem: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  legendaMarca: { width: 12, height: 12, borderRadius: 3, display: 'inline-block' },
  rolagem: { overflowX: 'auto' },
  rotuloEixo: { fontSize: '11px', fill: claro.textoFraco },
  tituloEixo: { fontSize: '11px', fill: claro.textoFraco },
  rotuloCategoria: { fontSize: '11px', fill: claro.textoMedio },
  rotuloReferencia: { fontSize: '10px', fill: claro.grafite, fontWeight: 700, letterSpacing: '0.5px' },
  valorBarra: { fontSize: '11px', fill: claro.texto, fontWeight: 700 },
  tooltip: {
    marginTop: 12, padding: '10px 14px', background: claro.fundo,
    border: `1px solid ${claro.borda}`, borderRadius: 6,
    display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: claro.textoMedio,
  },
  alerta: {
    margin: '12px 0', padding: '10px 14px', fontSize: 12, lineHeight: 1.5,
    background: claro.atencaoFundo, border: `1px solid ${claro.atencao}`,
    borderRadius: 6, color: claro.texto,
  },
  vazio: {
    padding: 40, textAlign: 'center', color: claro.textoFraco, fontSize: 13,
    background: claro.papel, border: `1px dashed ${claro.borda}`, borderRadius: 10,
  },
};
