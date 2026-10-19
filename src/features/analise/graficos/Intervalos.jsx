import { useId } from 'react';
import { claro, referencia, serie } from '../../../theme/tokensAnalise.js';
import { emSegundos } from '../conferencias/formato.js';
import { EIXO, Legenda, Texturas, VazioGrafico, passoAgradavel, useLarguraContainer } from './comuns.jsx';
import { est } from './estilos.js';

/** Barras cortadas no teto que ganham o valor escrito: as maiores, ate' aqui. */
const MAX_ROTULOS_CORTE = 6;

/**
 * VOLUME A VOLUME — uma barra por intervalo, contra a linha do takt.
 *
 * E' o grafico que separa "a linha e' lenta" de "a linha para": com o takt
 * tracejado atravessando, as barras regulares acima dele dizem ritmo; a
 * barra solitaria que dispara diz lacuna, e lacuna se trata com outra
 * pergunta ("o que aconteceu ali?").
 *
 * LACUNA leva HACHURA, nao so' cor — sai na impressora P&B da fabrica e
 * para quem tem daltonismo, como a barra "ainda em medicao" do Ritmo por
 * maquina. As duas linhas de referencia tem rotulo escrito ao lado: takt
 * (grafite, tracejado) e tipico (a mediana, pontilhado mais fraco).
 *
 * O TETO do eixo e' tres vezes o tipico (ou um pouco acima do takt, o que
 * for maior). Uma lacuna de vinte minutos numa linha de um minuto achataria
 * todas as outras barras numa faixa de dois pixels — e sao elas que mostram
 * o ritmo. A barra que passa do teto e' cortada com um entalhe, e as
 * maiores ganham o valor real escrito em cima: nada some, so' nao manda
 * na escala.
 *
 * `larguraFixa` e' o caminho da folha A4: o papel nao tem container que se
 * mede, e tooltip nao imprime.
 */
export function GraficoIntervalos({
  leitura, unidade, altura = 260, larguraFixa = null,
}) {
  const id = useId().replace(/:/g, '');
  const [refContainer, larguraContainer] = useLarguraContainer(360);

  const intervalos = leitura?.intervalos || [];
  if (!intervalos.length) return <VazioGrafico texto="Sem intervalos para desenhar." />;

  const n = intervalos.length;
  const takt = leitura.taktMs || 0;
  const tipico = leitura.suficiente ? leitura.medianaMs : 0;
  const maior = Math.max(...intervalos);
  const tetoDesejado = tipico > 0 ? Math.max(tipico * 3, takt * 1.25) : 0;
  const cortar = tetoDesejado > 0 && maior > tetoDesejado;
  const maxY = cortar ? tetoDesejado : Math.max(maior, takt) * 1.12;
  const passoY = passoAgradavel(maxY / 1000) * 1000;

  // Ao menos 4px por barra: abaixo disso a barra vira risco e o hover some.
  const larguraMinima = n * 4 + EIXO.esq + EIXO.dir;
  const largura = larguraFixa || Math.max(larguraMinima, larguraContainer || larguraMinima);
  const alturaPlot = altura - EIXO.topo - EIXO.base;
  const banda = (largura - EIXO.esq - EIXO.dir) / n;
  // Vao de 2px entre barras so' quando ha' espaco para ele.
  const vao = banda >= 6 ? 2 : 0;
  const larguraBarra = Math.max(1, Math.min(28, banda - vao));

  const yDe = (ms) => EIXO.topo + alturaPlot - (Math.min(ms, maxY) / maxY) * alturaPlot;
  const base = EIXO.topo + alturaPlot;

  const grades = [];
  for (let v = 0; v <= maxY; v += passoY) grades.push(v);

  // O volume que FECHOU cada intervalo: o primeiro intervalo termina no 2o.
  const passoX = Math.max(1, Math.round(passoAgradavel(n, 8)));
  const lacunas = new Set((leitura.lacunas || []).map((l) => l.indice));
  const cortadas = cortar
    ? intervalos
      .map((ms, i) => ({ ms, i }))
      .filter((x) => x.ms > maxY)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, MAX_ROTULOS_CORTE)
      .map((x) => x.i)
    : [];
  const rotularCorte = new Set(cortadas);

  const descricao = (ms, i) => {
    const partes = [`${capital(unidade.singular)} ${i + 2}: ${emSegundos(ms)}`];
    if (lacunas.has(i)) partes.push('lacuna');
    else if (takt && ms > takt) partes.push('acima do takt');
    return partes.join(' — ');
  };

  const linhasDeReferencia = [
    takt > 0 && takt <= maxY && {
      chave: 'takt', ms: takt, rotulo: `Takt ${emSegundos(takt)}`,
      cor: referencia.linha, traco: referencia.traco, espessura: 2,
    },
    tipico > 0 && {
      chave: 'tipico', ms: tipico, rotulo: `Típico ${emSegundos(tipico)}`,
      cor: claro.textoMedio, traco: '2 3', espessura: 1.5,
    },
  ].filter(Boolean);

  return (
    <figure style={est.figura}>
      <figcaption style={est.titulo}>
        Intervalo entre {unidade.plural}
        <span style={est.subtitulo}>
          Tempo de cada {unidade.singular} até a seguinte, com a linha rodando
        </span>
      </figcaption>

      <Legenda
        itens={[
          { rotulo: 'Intervalo', cor: serie.tn },
          {
            rotulo: 'Lacuna — mais que o dobro do típico',
            cor: serie.tolerancia,
            hachura: `repeating-linear-gradient(45deg, ${serie.tolerancia} 0 3px, rgba(255,255,255,.55) 3px 5px)`,
          },
        ]}
      />

      <div style={est.rolagem} ref={larguraFixa ? undefined : refContainer}>
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width={largura}
          height={altura}
          style={{ maxWidth: '100%', height: altura, display: 'block' }}
          role="img"
          aria-label={`Intervalo entre ${unidade.plural}: ${n} intervalos`
            + `${tipico ? `, típico de ${emSegundos(tipico)}` : ''}`
            + `${takt ? `, takt de ${emSegundos(takt)}` : ''}`
            + `, ${lacunas.size} lacuna(s)`}
        >
          <Texturas id={id} />

          {grades.map((v) => (
            <g key={v}>
              <line
                x1={EIXO.esq} x2={largura - EIXO.dir} y1={yDe(v)} y2={yDe(v)}
                stroke={claro.borda} strokeWidth="1"
              />
              <text x={EIXO.esq - 8} y={yDe(v) + 4} textAnchor="end" fontSize="11" fill={claro.textoFraco}>
                {v > 0 ? emSegundos(v) : '0'}
              </text>
            </g>
          ))}

          {intervalos.map((ms, i) => {
            const x = EIXO.esq + banda * i + (banda - larguraBarra) / 2;
            const y = yDe(ms);
            const alturaBarra = Math.max(1, base - y);
            const lacuna = lacunas.has(i);
            const cortada = ms > maxY;
            return (
              <g key={i}>
                <rect
                  x={x} y={y} width={larguraBarra} height={alturaBarra}
                  fill={lacuna ? serie.tolerancia : serie.tn}
                  rx={larguraBarra >= 6 ? 2 : 0}
                />
                {lacuna && (
                  <rect x={x} y={y} width={larguraBarra} height={alturaBarra} fill={`url(#${id}-hachura)`} />
                )}
                {cortada && (
                  /* O entalhe: a barra nao acaba ali, foi cortada no teto. */
                  <path
                    d={`M${x - 1},${y + 9} l${larguraBarra / 2 + 1},-4 l${larguraBarra / 2 + 1},4`}
                    fill="none" stroke={claro.papel} strokeWidth="2"
                  />
                )}
                {cortada && rotularCorte.has(i) && (
                  <text
                    x={x + larguraBarra / 2} y={y - 4} textAnchor="middle"
                    fontSize="10" fontWeight="700" fill={claro.texto}
                  >
                    {emSegundos(ms)}
                  </text>
                )}
                {/* Alvo de hover maior que a barra: a banda inteira, de alto
                    a baixo. O <title> e' o tooltip nativo — tambem lido por
                    leitor de tela. */}
                {!larguraFixa && (
                  <rect x={EIXO.esq + banda * i} y={EIXO.topo} width={banda} height={alturaPlot} fill="transparent">
                    <title>{descricao(ms, i)}</title>
                  </rect>
                )}
              </g>
            );
          })}

          {linhasDeReferencia.map((r) => (
            <g key={r.chave}>
              <line
                x1={EIXO.esq} x2={largura - EIXO.dir} y1={yDe(r.ms)} y2={yDe(r.ms)}
                stroke={r.cor} strokeWidth={r.espessura} strokeDasharray={r.traco}
              />
              <text
                x={largura - EIXO.dir - 4} y={posicaoRotulo(r, linhasDeReferencia, yDe)} textAnchor="end"
                fontSize="11" fontWeight="700" fill={claro.texto}
                stroke={claro.papel} strokeWidth="3" paintOrder="stroke"
              >
                {r.rotulo}
              </text>
            </g>
          ))}

          {intervalos.map((_, i) => ((i + 2) % passoX === 0 || i === 0) && (
            <text
              key={`x${i}`}
              x={EIXO.esq + banda * (i + 0.5)} y={base + 16}
              textAnchor="middle" fontSize="10" fill={claro.textoFraco}
            >
              {i + 2}
            </text>
          ))}
          <text
            x={EIXO.esq + (largura - EIXO.esq - EIXO.dir) / 2} y={altura - 6}
            textAnchor="middle" fontSize="11" fill={claro.textoMedio}
          >
            {capital(unidade.singular)} nº
          </text>

          <line x1={EIXO.esq} x2={largura - EIXO.dir} y1={base} y2={base} stroke={claro.textoFraco} strokeWidth="1.5" />
        </svg>
      </div>
    </figure>
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Onde escrever o rotulo de uma linha de referencia. Por padrao, logo acima
 * dela; quando takt e tipico ficam a menos de uma linha de texto um do
 * outro, o de BAIXO desce para baixo da propria linha — senao os dois se
 * escrevem um por cima do outro, justamente quando estao perto (que e'
 * quando a comparacao mais importa).
 */
function posicaoRotulo(r, todas, yDe) {
  const y = yDe(r.ms);
  const outra = todas.find((x) => x.chave !== r.chave);
  if (!outra) return y - 5;
  const yOutra = yDe(outra.ms);
  return Math.abs(y - yOutra) < 16 && y > yOutra ? y + 14 : y - 5;
}
