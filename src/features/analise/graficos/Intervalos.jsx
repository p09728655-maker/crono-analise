import { useId } from 'react';
import { claro, referencia, serie } from '../../../theme/tokensAnalise.js';
import { emSegundos } from '../conferencias/formato.js';
import { EIXO, Legenda, Texturas, VazioGrafico, passoAgradavel, useLarguraContainer } from './comuns.jsx';
import { est } from './estilos.js';
import { larguraDoTexto, rotulosSemColisao } from './rotulos.js';

/** Barras que ganham o valor escrito em cima (lacunas e cortadas): as maiores, ate' aqui. */
const MAX_ROTULOS_VALOR = 6;

/** Distancia minima entre os nomes dos volumes no eixo de baixo, em px. */
const ESPACO_ROTULO_X = 28;
const PASSOS_X = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

/** Cor do numero da lacuna no eixo: o laranja da barra escurecido, para ler em fundo branco. */
const COR_TEXTO_LACUNA = claro.critico;

/**
 * VOLUME A VOLUME — uma barra por intervalo, contra a linha do takt.
 *
 * E' o grafico que separa "a linha e' lenta" de "a linha para": com o takt
 * tracejado atravessando, as barras regulares acima dele dizem ritmo; a
 * barra solitaria que dispara diz lacuna, e lacuna se trata com outra
 * pergunta ("o que aconteceu ali?").
 *
 * A linha pontilhada e' a MEDIA das barras (a linha rodando). Barra por
 * barra nao se compara com o takt: com volume em par (rack de dois volumes
 * saindo colados) metade passa do takt numa linha que atende. O veredito,
 * com as paradas dentro, esta' no texto da leitura.
 *
 * LACUNA leva HACHURA, nao so' cor — sai na impressora P&B da fabrica e
 * para quem tem daltonismo, como a barra "ainda em medicao" do Ritmo por
 * maquina. Leva tambem o valor escrito em cima e o numero do volume em
 * destaque no eixo: e' o volume que se procura na tabela das lacunas.
 *
 * As linhas de referencia tem contorno branco por baixo (para nao sumirem
 * dentro das barras azuis) e entrada propria na legenda, com o VALOR ao
 * lado ("Takt da semana: 17.2 s") — sem calha a' direita, que tomava 100 px
 * do grafico (v2.100.2). Numero escrito no grafico nunca encosta em
 * outro (rotulos.js): o que nao cabe sai inteiro.
 *
 * O TETO do eixo e' tres vezes o ritmo normal (ou um pouco acima do takt, o que
 * for maior). Uma lacuna de vinte minutos numa linha de um minuto achataria
 * todas as outras barras numa faixa de dois pixels — e sao elas que mostram
 * o ritmo. A barra que passa do teto e' cortada com um entalhe, e as
 * maiores ganham o valor real escrito em cima: nada some, so' nao manda
 * na escala.
 *
 * `larguraFixa` e' o caminho da folha A4: o papel nao tem container que se
 * mede, e tooltip nao imprime.
 *
 * `segmentos` e' a JUNCAO de medicoes ([{ inicio, rotulo }]: o indice do
 * primeiro intervalo de cada medicao e a hora dela): uma linha vertical
 * separa uma medicao da seguinte, com a hora em cima, e o volume no eixo e'
 * o numero DENTRO da medicao — o mesmo da tabela de lacunas. O tempo entre
 * medicoes nao e' intervalo, e o grafico nao finge que e'.
 */
export function GraficoIntervalos({
  leitura, unidade, altura = 260, larguraFixa = null, segmentos = null,
  // O piso da largura medida. 360 e' o do PC; no celular (resultado salvo
  // no tablet, v2.100.0) o espaco e' menor, e com o piso maior que ele o
  // desenho encolhia por inteiro, com letra miuda e faixas vazias.
  pisoLargura = 360,
  /* LETRA MAIOR NO PAPEL (v2.101.0, pedido do PCP): a folha A4 deitada
     passa 1,15 — titulo, legenda, eixos e valores crescem juntos, e a
     colisao dos rotulos e o limite da borda usam o tamanho novo. A tela
     segue em 1. */
  escalaTexto = 1,
}) {
  const fs = (n) => Math.round(n * escalaTexto * 10) / 10;
  const id = useId().replace(/:/g, '');
  const [refContainer, larguraContainer] = useLarguraContainer(pisoLargura);

  const intervalos = leitura?.intervalos || [];
  if (!intervalos.length) return <VazioGrafico texto="Sem intervalos para desenhar." />;

  const n = intervalos.length;
  const segs = segmentos?.length > 1 ? segmentos : null;
  const segmentoDe = (i) => segs && segs.reduce((achado, x) => (i >= x.inicio ? x : achado), segs[0]);
  // O volume que fecha o intervalo i: o primeiro intervalo termina no 2o.
  const volumeDe = (i) => (segs ? i - segmentoDe(i).inicio + 2 : i + 2);
  const takt = leitura.taktMs || 0;
  const mediaMs = leitura.suficiente ? leitura.mediaMs : 0;
  const normal = leitura.suficiente ? leitura.normalMs : 0;
  /* O PERIODO (v2.101.0, pedido do PCP com print): o tempo por volume do
     primeiro ao ultimo toque, COM as paradas — o numero do veredito. Com a
     linha dele no grafico, a historia se le' sem texto: rodando abaixo do
     takt, periodo acima — o que tira a linha do takt sao as paradas. */
  /* Sem parada marcada entre os toques, periodo e rodando sao o MESMO
     numero: a linha continua cobriria a pontilhada e diria duas vezes a
     mesma coisa — so' aparece quando difere (mais de 1%). */
  const periodoMs = leitura.suficiente && leitura.periodoMs > 0 && mediaMs > 0
    && Math.abs(leitura.periodoMs - mediaMs) / mediaMs > 0.01
    ? leitura.periodoMs : 0;
  const maior = Math.max(...intervalos);
  /* O TETO NAO SOBE pelo periodo (revisao de 05/11): com uma hora de parada
     o periodo ia a 197 s e esmagava barras, takt e rodando nos 10% de
     baixo — contra a regra do teto, que existe para as barras mostrarem o
     ritmo. Ate' o teto de sempre ele entra na escala; acima, a linha fica
     PRESA NO TOPO e a legenda diz o valor e que passou do topo. */
  const tetoDesejado = normal > 0 ? Math.max(normal * 3, mediaMs * 1.25, takt * 1.25) : 0;
  const cortar = tetoDesejado > 0 && maior > tetoDesejado;
  const maxY = cortar
    ? tetoDesejado
    : Math.max(maior, takt, Math.min(periodoMs, tetoDesejado || periodoMs)) * 1.12;
  const periodoAcimaDoTopo = periodoMs > maxY;
  const passoY = passoAgradavel(maxY / 1000) * 1000;

  const linhasDeReferencia = [
    takt > 0 && takt <= maxY && {
      chave: 'takt', ms: takt, nome: 'Takt', cor: referencia.linha, traco: referencia.traco, espessura: 2,
    },
    // Continua e mais grossa: no papel P&B se separa do takt (tracejado) e
    // do rodando (pontilhado) pelo traco, nao pela cor.
    // Vermelha so' quando passa do takt (a mesma cor da lacuna diz "atencao");
    // dentro dele, a cor do texto. Acima do topo, desenhada no topo.
    periodoMs > 0 && {
      chave: 'periodo', ms: Math.min(periodoMs, maxY), valor: periodoMs, nome: 'No período',
      cor: takt > 0 && periodoMs > takt ? claro.critico : claro.texto, traco: null, espessura: 3,
    },
    mediaMs > 0 && mediaMs <= maxY && {
      chave: 'media', ms: mediaMs, nome: 'Rodando', cor: claro.texto, traco: '2 3', espessura: 2,
    },
  ].filter(Boolean);

  const margem = {
    esq: EIXO.esq,
    /* SEM CALHA A' DIREITA (v2.100.2, pedido do PCP com print): o valor
       das linhas ("Takt 17.2 s", "Rodando 15.2 s") morava numa faixa de
       100 px fora das barras, que tomava a largura do grafico na tela e na
       folha. O valor foi para a LEGENDA, ao lado da amostra da linha — o
       grafico ganha a largura, e o rotulo continua sem cobrir barra. */
    dir: EIXO.dir,
    // Com medicoes separadas, a hora de cada uma mora acima das barras.
    topo: segs ? 36 : 22,
    base: EIXO.base,
  };

  // Ao menos 4px por barra: abaixo disso a barra vira risco e o hover some.
  const larguraMinima = n * 4 + margem.esq + margem.dir;
  const largura = larguraFixa || Math.max(larguraMinima, larguraContainer || larguraMinima);
  const alturaPlot = altura - margem.topo - margem.base;
  const banda = (largura - margem.esq - margem.dir) / n;
  // Vao entre barras so' quando ha' espaco para ele.
  const vao = banda >= 10 ? 3 : banda >= 6 ? 2 : 0;
  const larguraBarra = Math.max(1, Math.min(28, banda - vao));

  const yDe = (ms) => margem.topo + alturaPlot - (Math.min(ms, maxY) / maxY) * alturaPlot;
  const xCentro = (i) => margem.esq + banda * (i + 0.5);
  const base = margem.topo + alturaPlot;

  const grades = [];
  for (let v = 0; v <= maxY + 1e-6; v += passoY) grades.push(v);

  const lacunas = new Set((leitura.lacunas || []).map((l) => l.indice));
  // Lacunas e cortadas, da maior para a menor: e' a ordem de prioridade
  // quando dois rotulos disputam o mesmo lugar.
  const destaques = intervalos
    .map((ms, i) => ({ ms, i }))
    .filter((x) => lacunas.has(x.i) || x.ms > maxY)
    .sort((a, b) => b.ms - a.ms);

  // Valor escrito em cima: das lacunas e das barras cortadas no teto, as
  // maiores primeiro, sem dois no mesmo lugar (ver rotulos.js).
  const rotularValor = rotulosSemColisao(
    destaques.map((x) => ({ chave: x.i, x: xCentro(x.i), largura: larguraDoTexto(emSegundos(x.ms), fs(10.5)) })),
    { maximo: MAX_ROTULOS_VALOR },
  );

  // O EIXO DE BAIXO conta VOLUMES: o primeiro intervalo termina no 2o
  // volume. Primeiro o numero de cada lacuna (a maior vence a vizinha),
  // depois os redondos a cada passo que caiba, por ultimo o primeiro
  // volume — o que encostaria num ja' escrito sai.
  const passoX = PASSOS_X.find((p) => p * banda >= ESPACO_ROTULO_X) || PASSOS_X[PASSOS_X.length - 1];
  const candidatoX = (i) => ({ chave: i, x: xCentro(i), largura: larguraDoTexto(volumeDe(i), fs(10.5)) });
  const comRotuloX = rotulosSemColisao([
    ...destaques.filter((x) => lacunas.has(x.i)).map((x) => candidatoX(x.i)),
    ...intervalos.map((_, i) => i).filter((i) => volumeDe(i) % passoX === 0).map(candidatoX),
    ...(segs ? segs.map((x) => candidatoX(x.inicio)) : [candidatoX(0)]),
  ]);
  const rotulosX = [...comRotuloX];

  const descricao = (ms, i) => {
    const partes = [`${segs ? `${segmentoDe(i).rotulo} · ` : ''}${capital(unidade.singular)} ${volumeDe(i)}: ${emSegundos(ms)}`];
    if (lacunas.has(i)) partes.push('lacuna');
    return partes.join(' — ');
  };

  /* DENTRO DA FIGURA, sempre (v2.100.2). Sem a calha de 100 px a' direita,
     o texto que cresce para a direita — a hora da ultima medicao da
     junção, o valor da barra mais a' direita — passava da borda e saia
     cortado ("08:4" no lugar de "08:49", achado da revisao). O x e' puxado
     para dentro so' o necessario; no meio do grafico nada muda. */
  const limiteDireito = largura - 2;
  const xDoInicio = (x, texto, fonte) => Math.min(x, limiteDireito - larguraDoTexto(texto, fonte));
  const xDoCentro = (x, texto, fonte) => {
    const meia = larguraDoTexto(texto, fonte) / 2;
    return Math.max(meia + 2, Math.min(x, limiteDireito - meia));
  };

  const tituloEixoY = (v) => (Math.abs(v / 1000 - Math.round(v / 1000)) < 1e-6
    ? `${Math.round(v / 1000)} s`
    : emSegundos(v));

  return (
    /* No PAPEL (larguraFixa) a moldura respira menos: os 40 px de folga
       interna eram o que faltava para o grafico ficar na 1a pagina com a
       letra maior da v2.101.0. */
    <figure style={larguraFixa ? { ...est.figura, padding: '8px 12px' } : est.figura}>
      <figcaption style={escalaTexto === 1 ? est.titulo : { ...est.titulo, fontSize: fs(15) }}>
        Intervalo entre {unidade.plural}
        <span style={escalaTexto === 1 ? est.subtitulo : { ...est.subtitulo, fontSize: fs(12) }}>
          Tempo de cada {unidade.singular} até {unidade.comArtigo.startsWith('uma') ? 'a seguinte' : 'o seguinte'},
          {' '}com a linha rodando — as paradas marcadas no cronômetro ficam fora
          {segs && '. As medições lado a lado, separadas por uma linha: o intervalo não passa de uma para a outra'}
        </span>
      </figcaption>

      <Legenda
        estilo={escalaTexto === 1 ? null : { fontSize: fs(12) }}
        itens={[
          { rotulo: 'Intervalo', cor: serie.tn },
          {
            rotulo: `Lacuna — mais que ${leitura.criterios?.fatorLacuna ?? 2}× o normal`,
            cor: serie.tolerancia,
            hachura: `repeating-linear-gradient(45deg, ${serie.tolerancia} 0 3px, rgba(255,255,255,.55) 3px 5px)`,
          },
          ...linhasDeReferencia.map((r) => ({
            rotulo: {
              media: `Rodando — média dos intervalos: ${emSegundos(r.ms)}`,
              periodo: `No período, com as paradas: ${emSegundos(r.valor)}${periodoAcimaDoTopo ? ' (acima do topo do gráfico)' : ''}`,
              takt: `Takt da semana: ${emSegundos(r.ms)}`,
            }[r.chave],
            cor: r.cor,
            linha: { media: 'dotted', periodo: 'solid', takt: 'dashed' }[r.chave],
            espessura: r.espessura,
          })),
          ...(segs ? [{ rotulo: 'Início de outra medição', cor: claro.texto, linha: 'solid' }] : []),
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
            + `${mediaMs ? `, média de ${emSegundos(mediaMs)}` : ''}`
            + `${periodoMs ? `, ${emSegundos(periodoMs)} no período com as paradas` : ''}`
            + `${takt ? `, takt de ${emSegundos(takt)}` : ''}`
            + `, ${lacunas.size} lacuna(s)`
            + `${segs ? `, em ${segs.length} medições` : ''}`}
        >
          {/* Realce da coluna sob o mouse — so' na tela (o papel nao tem
              os alvos de hover). */}
          <style>{`.alvo-intervalo-${id}:hover { fill: rgba(20, 23, 26, 0.06); }`}</style>
          <Texturas id={id} />

          {grades.map((v) => (
            <g key={v}>
              <line
                x1={margem.esq} x2={largura - margem.dir} y1={yDe(v)} y2={yDe(v)}
                stroke={claro.borda} strokeWidth="1" strokeOpacity={v > 0 ? 0.7 : 0}
              />
              <text x={margem.esq - 8} y={yDe(v) + 4} textAnchor="end" fontSize={fs(11)} fill={claro.textoMedio}>
                {v > 0 ? tituloEixoY(v) : '0'}
              </text>
            </g>
          ))}

          {intervalos.map((ms, i) => {
            const x = margem.esq + banda * i + (banda - larguraBarra) / 2;
            const y = yDe(ms);
            const alturaBarra = Math.max(1, base - y);
            const lacuna = lacunas.has(i);
            const cortada = ms > maxY;
            return (
              <g key={i}>
                {!larguraFixa && (
                  /* Alvo de hover maior que a barra: a banda inteira, de
                     alto a baixo. O <title> e' o tooltip nativo — tambem
                     lido por leitor de tela. */
                  <rect
                    className={`alvo-intervalo-${id}`}
                    x={margem.esq + banda * i} y={margem.topo} width={banda} height={alturaPlot} fill="transparent"
                  >
                    <title>{descricao(ms, i)}</title>
                  </rect>
                )}
                <rect
                  x={x} y={y} width={larguraBarra} height={alturaBarra}
                  fill={lacuna ? serie.tolerancia : serie.tn}
                  rx={larguraBarra >= 6 ? 2 : 0}
                  pointerEvents="none"
                />
                {lacuna && (
                  <rect
                    x={x} y={y} width={larguraBarra} height={alturaBarra}
                    fill={`url(#${id}-hachura)`} pointerEvents="none"
                  />
                )}
                {cortada && (
                  /* O entalhe: a barra nao acaba ali, foi cortada no teto. */
                  <path
                    d={`M${x - 1},${y + 9} l${larguraBarra / 2 + 1},-4 l${larguraBarra / 2 + 1},4`}
                    fill="none" stroke={claro.papel} strokeWidth="2" pointerEvents="none"
                  />
                )}
                {rotularValor.has(i) && (
                  <text
                    x={xDoCentro(x + larguraBarra / 2, emSegundos(ms), fs(10.5))} y={y - 5} textAnchor="middle"
                    fontSize={fs(10.5)} fontWeight="700" fill={lacuna ? COR_TEXTO_LACUNA : claro.texto}
                    stroke={claro.papel} strokeWidth="3" paintOrder="stroke" pointerEvents="none"
                  >
                    {emSegundos(ms)}
                  </text>
                )}
              </g>
            );
          })}

          {/* A divisa entre medicoes: depois das barras (nao some atras
              delas) e antes das linhas de referencia, que atravessam tudo. */}
          {segs && segs.map((x, k) => {
            const xDivisa = margem.esq + banda * x.inicio;
            return (
              <g key={`seg-${x.inicio}`} pointerEvents="none">
                {k > 0 && (
                  <line x1={xDivisa} x2={xDivisa} y1={margem.topo - 14} y2={base} stroke={claro.texto} strokeWidth="1.5" />
                )}
                <text
                  x={xDoInicio(xDivisa + 4, x.rotulo, fs(11))} y={margem.topo - 18} fontSize={fs(11)} fontWeight="700" fill={claro.texto}
                  stroke={claro.papel} strokeWidth="3" paintOrder="stroke"
                >
                  {x.rotulo}
                </text>
              </g>
            );
          })}

          {/* Contorno branco por baixo das linhas, TODOS antes de qualquer
              linha: a linha atravessa as barras azuis sem sumir dentro
              delas, e o contorno de uma nao apaga a outra quando as duas
              estao a um pixel (takt e rodando juntos — justamente quando a
              comparacao mais importa). O takt e' desenhado por ultimo. */}
          {linhasDeReferencia.map((r) => (
            <line
              key={`contorno-${r.chave}`} pointerEvents="none"
              x1={margem.esq} x2={largura - margem.dir} y1={yDe(r.ms)} y2={yDe(r.ms)}
              stroke={claro.papel} strokeWidth={r.espessura + 3} strokeOpacity="0.85"
            />
          ))}
          {[...linhasDeReferencia].reverse().map((r) => (
            <line
              key={r.chave} pointerEvents="none"
              x1={margem.esq} x2={largura - margem.dir} y1={yDe(r.ms)} y2={yDe(r.ms)}
              stroke={r.cor} strokeWidth={r.espessura} strokeDasharray={r.traco}
            />
          ))}

          {/* O PERIODO ACIMA DO TOPO: a linha encosta no topo do eixo, e o
              topo tem um rotulo que nao e' o dela (100 s quando ela vale
              197 s). O valor vai escrito NA linha, com a seta para cima. */}
          {periodoAcimaDoTopo && (
            <text
              x={largura - margem.dir - 2} y={yDe(maxY) + fs(11) + 3} textAnchor="end"
              fontSize={fs(11)} fontWeight="700" fill={takt > 0 && periodoMs > takt ? claro.critico : claro.texto}
              stroke={claro.papel} strokeWidth="3" paintOrder="stroke" pointerEvents="none"
            >
              ↑ {emSegundos(periodoMs)} no período
            </text>
          )}

          <line x1={margem.esq} x2={largura - margem.dir} y1={base} y2={base} stroke={claro.textoFraco} strokeWidth="1.5" />

          {/* Marca de cada volume no eixo, quando a banda comporta. */}
          {banda >= 5 && intervalos.map((_, i) => (
            <line
              key={`m${i}`}
              x1={xCentro(i)} x2={xCentro(i)} y1={base} y2={base + (comRotuloX.has(i) ? 5 : 3)}
              stroke={claro.textoFraco} strokeWidth="1"
            />
          ))}
          {rotulosX.map((i) => (
            <text
              key={`x${i}`}
              x={xCentro(i)} y={base + 17}
              textAnchor="middle" fontSize={fs(10.5)}
              fontWeight={lacunas.has(i) ? 700 : 400}
              fill={lacunas.has(i) ? COR_TEXTO_LACUNA : claro.textoMedio}
            >
              {volumeDe(i)}
            </text>
          ))}
          <text
            x={margem.esq + (largura - margem.esq - margem.dir) / 2} y={altura - 6}
            textAnchor="middle" fontSize={fs(11)} fill={claro.textoMedio}
          >
            {capital(unidade.singular)} nº{segs ? ', medição a medição' : ''}
          </text>
        </svg>
      </div>
    </figure>
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
