import { useId } from 'react';
import { claro, serie } from '../../../theme/tokensAnalise.js';
import { EIXO, Legenda, Texturas, VazioGrafico, passoAgradavel, useLarguraContainer } from './comuns.jsx';
import { est } from './estilos.js';

/**
 * Ritmo por maquina — barras de pecas/hora das conferencias rapidas.
 *
 * O relatorio de conferencias precisava do mesmo tratamento do estudo: numero
 * sozinho numa tabela nao mostra que uma maquina roda ao dobro da outra.
 *
 * Identidade nunca depende so' de cor: a barra ainda em medicao leva
 * TEXTURA hachurada e um rotulo em palavras embaixo do valor — continua
 * legivel em impressao P&B e para quem tem daltonismo. E' a mesma regra do
 * Yamazumi, e aqui ela importa mais ainda: e' exatamente a barra que ainda
 * nao assentou como referencia.
 *
 * Os textos sao em portugues de fabrica (decisao de 31/08): "amostra
 * insuficiente" virou "ainda em medicao" — mesmo criterio, sem jargao.
 */
export function GraficoRitmoMaquinas({
  maquinas, altura = 300,
  /* A MESMA moldura serve para duas leituras: por maquina (padrao) e, com a
     lateral filtrada, uma barra POR MEDICAO da maquina escolhida. Os
     textos viram props para a legenda nao mentir na segunda leitura — la'
     a hachura marca medicao curta, nao poucas medicoes. Cada item
     aceita `rotulo` (padrao: maquina), `nota` (linha pequena sob o rotulo;
     padrao: aviso quando nao confiavel) e `chave` (padrao: maquina). */
  titulo = 'Ritmo por máquina',
  subtitulo = 'Peças por hora com a máquina rodando',
  rotuloOk = 'Ritmo medido',
  rotuloFraco = 'Ainda em medição',
  notaFraca = 'ainda em medição',
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
