import { useId, useState } from 'react';
import { claro, referencia, serie } from '../../../theme/tokensAnalise.js';
import { formatarSegundos } from '../../../domain/cronoanalise.js';
import { EIXO, Legenda, Texturas, VazioGrafico, escala, passoAgradavel, useLarguraContainer } from './comuns.jsx';
import { est } from './estilos.js';

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
