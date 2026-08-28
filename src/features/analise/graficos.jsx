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
    if (l <= 0) return;
    const nova = Math.max(minimo, l);
    // Diferenca de 1px vira ruido: arredondamento de subpixel podia
    // realimentar o ResizeObserver e redesenhar o grafico sem parar.
    setLargura((atual) => (Math.abs(atual - nova) > 1 ? nova : atual));
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

  const maiorTp = Math.max(...dados.map((o) => o.resultado.tpPorPeca));
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
            // As barras mostram o tempo POR PECA: e' o que se compara ao Takt.
            const tnPeca = r.tnMed * r.ciclosPorPeca;
            const alturaTn = escala(tnPeca, maxDominio, alturaPlot);
            const alturaTol = escala(r.tpPorPeca - tnPeca, maxDominio, alturaPlot);
            const destaque = ativo === i;

            return (
              <g key={op.id} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}>
                {/* Alvo de hover maior que a marca */}
                <rect x={EIXO.esq + i * larguraBanda} y={EIXO.topo}
                      width={larguraBanda} height={alturaPlot} fill="transparent" />

                {/* Tolerancia (topo da pilha, cantos arredondados) */}
                <rect
                  x={x} y={yDe(r.tpPorPeca)} width={larguraBarra} height={Math.max(0, alturaTol)}
                  fill={`url(#${id}-hachura)`} rx="4"
                  opacity={destaque ? 1 : 0.94}
                />
                {/* Gap de 2px entre segmentos empilhados */}
                <rect
                  x={x} y={yDe(tnPeca)} width={larguraBarra} height={Math.max(0, alturaTn)}
                  fill={serie.tn} rx="4"
                  opacity={destaque ? 1 : 0.94}
                />
                <rect x={x} y={yDe(tnPeca) - 1} width={larguraBarra} height="2" fill={claro.papel} />

                {/* Valor direto no topo — sem obrigar leitura no eixo */}
                {/* Truncar por medida, nao por numero fixo: com o grafico
                    ocupando a largura toda ha' espaco de sobra, e cortar
                    "Furar later..." sem necessidade so' atrapalha a leitura.
                    ~6,2px por caractere a 11px nesta familia. */}
                <text
                  x={x + larguraBarra / 2} y={altura - EIXO.base + 16}
                  textAnchor="middle" style={est.rotuloCategoria}
                >
                  {(() => {
                    const cabem = Math.floor((larguraBanda - 8) / 6.2);
                    return op.nome.length <= cabem ? op.nome : `${op.nome.slice(0, cabem - 1)}…`;
                  })()}
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
            const gargalo = taktMs > 0 && r.tpPorPeca > taktMs;
            return (
              <g key={`rotulo-${op.id}`} pointerEvents="none">
                <text
                  x={cx} y={yDe(r.tpPorPeca) - 8} textAnchor="middle" style={est.valorBarra}
                  stroke={claro.papel} strokeWidth="3.5" paintOrder="stroke"
                >
                  {formatarSegundos(r.tpPorPeca)}s
                </text>
                {/* Gargalo marcado por FORMA, nao so' por cor. */}
                {gargalo && (
                  <g>
                    <polygon
                      points={`${cx},${yDe(r.tpPorPeca) - 26} ${cx - 6},${yDe(r.tpPorPeca) - 16} ${cx + 6},${yDe(r.tpPorPeca) - 16}`}
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

      {/* A area do detalhe existe SEMPRE, com ou sem barra sob o cursor.
          Aparecer e sumir mudava a altura da pagina a cada passada de
          mouse — e era isso que fazia a tela tremer quando o conteudo
          estava no limite da rolagem. Vazia ela ainda ensina o gesto. */}
      {ativo !== null && dados[ativo]
        ? <Tooltip operacao={dados[ativo]} taktMs={taktMs} />
        : <div style={est.tooltipVazio} aria-hidden="true">Passe o mouse sobre uma barra para ver o detalhe da operação.</div>}
    </figure>
  );
}

function Tooltip({ operacao, taktMs }) {
  const r = operacao.resultado;
  const ocupacao = taktMs > 0 ? (r.tpPorPeca / taktMs) * 100 : null;
  return (
    <div style={est.tooltip} role="status">
      <strong>{operacao.nome}</strong>
      <span>TP por ciclo {formatarSegundos(r.tpVal)}s · {r.ciclosPorPeca} ciclo(s) por peça</span>
      <span>TP por peça {formatarSegundos(r.tpPorPeca)}s · {r.cap} pç/h · {r.n} ciclos coletados</span>
      {ocupacao !== null && (
        <span>
          Ocupação {ocupacao.toFixed(0)}% do Takt
          {ocupacao > 100 ? ' — gargalo' : ''}
        </span>
      )}
    </div>
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
    // Quatro linhas de 2px de gap: a altura nao pode depender do conteudo,
    // senao o layout volta a pular entre ter e nao ter detalhe.
    minHeight: 86, boxSizing: 'border-box',
  },
  tooltipVazio: {
    marginTop: 12, padding: '10px 14px', background: claro.fundo,
    border: `1px dashed ${claro.borda}`, borderRadius: 6,
    display: 'flex', alignItems: 'center', fontSize: 12, color: claro.textoFraco,
    minHeight: 86, boxSizing: 'border-box',
  },
  vazio: {
    padding: 40, textAlign: 'center', color: claro.textoFraco, fontSize: 13,
    background: claro.papel, border: `1px dashed ${claro.borda}`, borderRadius: 10,
  },
};

/**
 * Ritmo por maquina — barras de pecas/hora das conferencias rapidas.
 *
 * O relatorio de conferencias precisava do mesmo tratamento do estudo: numero
 * sozinho numa tabela nao mostra que uma maquina roda ao dobro da outra.
 *
 * Identidade nunca depende so' de cor: a barra de amostra insuficiente leva
 * TEXTURA hachurada e o rotulo "amostra insuficiente" embaixo do valor —
 * continua legivel em impressao P&B e para quem tem daltonismo. E' a mesma
 * regra do Yamazumi, e aqui ela importa mais ainda: e' exatamente a barra
 * que NAO pode ser lida como referencia.
 */
export function GraficoRitmoMaquinas({
  maquinas, altura = 300,
  /* A MESMA moldura serve para duas leituras: por maquina (padrao) e, com a
     lateral filtrada, uma barra POR CONFERENCIA da maquina escolhida. Os
     textos viram props para a legenda nao mentir na segunda leitura — la'
     a hachura marca periodo curto, nao amostra insuficiente. Cada item
     aceita `rotulo` (padrao: maquina), `nota` (linha pequena sob o rotulo;
     padrao: aviso quando nao confiavel) e `chave` (padrao: maquina). */
  titulo = 'Ritmo por máquina',
  subtitulo = 'Peças/hora médias, ponderadas pelo tempo observado',
  rotuloOk = 'Referência OK',
  rotuloFraco = 'Amostra insuficiente',
  notaFraca = 'amostra insuficiente',
}) {
  const id = useId().replace(/:/g, '');
  const [refContainer, larguraContainer] = useLarguraContainer(360);

  if (!maquinas?.length) return <VazioGrafico texto="Sem conferências para comparar." />;

  const maxRitmo = Math.max(...maquinas.map((m) => m.ritmoMedio)) * 1.15;
  const passo = passoAgradavel(maxRitmo);

  const larguraMinima = maquinas.length * 120 + EIXO.esq + EIXO.dir;
  const largura = Math.max(larguraMinima, larguraContainer || larguraMinima);
  const alturaPlot = altura - EIXO.topo - EIXO.base;
  const larguraBanda = (largura - EIXO.esq - EIXO.dir) / maquinas.length;
  const larguraBarra = Math.min(72, larguraBanda * 0.6);

  const grades = [];
  for (let v = 0; v <= maxRitmo; v += passo) grades.push(v);

  const yDe = (valor) => EIXO.topo + alturaPlot - (valor / maxRitmo) * alturaPlot;

  return (
    <figure style={est.figura}>
      <figcaption style={est.titulo}>
        {titulo}
        <span style={est.subtitulo}>{subtitulo}</span>
      </figcaption>

      <Legenda
        itens={[
          { rotulo: rotuloOk, cor: serie.tn },
          {
            rotulo: rotuloFraco,
            cor: serie.tolerancia,
            hachura: `repeating-linear-gradient(45deg, ${serie.tolerancia} 0 3px, rgba(255,255,255,.55) 3px 5px)`,
          },
        ]}
      />

      <div style={est.rolagem} ref={refContainer}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width={largura}
          height={altura}
          style={{ maxWidth: '100%', height: altura, display: 'block' }}
          role="img"
          aria-label={`${titulo}: ${maquinas.length} barra(s), em peças por hora`}
        >
          <Texturas id={id} />

          {grades.map((v) => (
            <g key={v}>
              <line
                x1={EIXO.esq} x2={largura - EIXO.dir} y1={yDe(v)} y2={yDe(v)}
                stroke={claro.borda} strokeWidth="1"
              />
              <text x={EIXO.esq - 8} y={yDe(v) + 4} textAnchor="end" fontSize="11" fill={claro.textoFraco}>
                {Math.round(v)}
              </text>
            </g>
          ))}

          {maquinas.map((m, i) => {
            const centro = EIXO.esq + larguraBanda * (i + 0.5);
            const x = centro - larguraBarra / 2;
            const y = yDe(m.ritmoMedio);
            const alturaBarra = Math.max(1, EIXO.topo + alturaPlot - y);
            const rotuloBarra = m.rotulo ?? m.maquina;
            const nota = m.nota ?? (!m.confiavel ? notaFraca : null);
            return (
              <g key={m.chave ?? m.maquina}>
                <rect
                  x={x} y={y} width={larguraBarra} height={alturaBarra}
                  fill={m.confiavel ? serie.tn : serie.tolerancia}
                  rx="3"
                />
                {!m.confiavel && (
                  <rect x={x} y={y} width={larguraBarra} height={alturaBarra} fill={`url(#${id}-hachura)`} rx="3" />
                )}
                <text x={centro} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={claro.texto}>
                  {Math.round(m.ritmoMedio)}
                </text>
                <text x={centro} y={altura - EIXO.base + 16} textAnchor="middle" fontSize="11" fill={claro.textoMedio}>
                  {rotuloBarra.length > 16 ? `${rotuloBarra.slice(0, 15)}…` : rotuloBarra}
                </text>
                {nota && (
                  <text
                    x={centro} y={altura - EIXO.base + 30} textAnchor="middle" fontSize="9"
                    fill={m.confiavel ? claro.textoFraco : claro.atencao}
                  >
                    {nota}
                  </text>
                )}
              </g>
            );
          })}

          <line
            x1={EIXO.esq} x2={largura - EIXO.dir}
            y1={EIXO.topo + alturaPlot} y2={EIXO.topo + alturaPlot}
            stroke={claro.textoFraco} strokeWidth="1.5"
          />
        </svg>
      </div>
    </figure>
  );
}
