/**
 * O que os quatro graficos dividem: a medida do container, a escala, as
 * texturas e a legenda.
 *
 * Identidade nunca depende so' de cor — e' por isso que `Texturas` e
 * `Legenda` moram aqui e nao em cada grafico: a serie hachurada e a
 * legenda de duas series sao a MESMA decisao em todos eles, e uma copia
 * por arquivo e' como elas deixariam de ser iguais.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { claro, serie } from '../../../theme/tokensAnalise.js';
import { elevacao } from '../../../theme/escala.js';
import { est } from './estilos.js';

export const EIXO = { esq: 52, dir: 16, topo: 16, base: 44 };

/**
 * Largura real do container.
 *
 * Um viewBox de proporcao fixa dentro de um elemento largo e' centralizado
 * e letterboxed pelo preserveAspectRatio, deixando o grafico pequeno no meio
 * de um vazio. Medindo o container e usando a largura medida como dominio do
 * viewBox, o grafico ocupa o espaco disponivel sem distorcer texto.
 */
export function useLarguraContainer(minimo = 320) {
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
export const escala = (valor, max, tamanho) => (max <= 0 ? 0 : (valor / max) * tamanho);

/** Passo de grade "redondo" para o eixo Y. */
export function passoAgradavel(max, alvo = 5) {
  if (max <= 0) return 1;
  const bruto = max / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const passo = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return passo * mag;
}

/* ------------------------------------------------------------- textura P&B */

export function Texturas({ id }) {
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

export function Legenda({ itens }) {
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

export function VazioGrafico({ texto }) {
  return <div style={est.vazio}>{texto}</div>;
}

export const EIXO_MINI = { esq: 40, dir: 12, topo: 10, base: 22 };

export const COR_TOM = { ok: claro.ok, atencao: claro.atencao, neutro: claro.neutro };

/* Acabamento SO' DE TELA dos quadros de tendencia. Os estilos inline abaixo
   sao os mesmos que a folha A4 usa (RelatorioImpressao e ImpressaoConferencias
   importam este mesmo componente), entao qualquer pixel a mais aqui mudaria a
   paginacao do relatorio. Por classe e sob @media screen, a folha nao ve nada
   disto. !important onde o inline ja' define a mesma propriedade. */
export const ESTILO_TELA_MINI = `
  @media screen {
    .mini-tendencia { border-radius: 10px !important; transition: box-shadow 160ms ease; }
    .mini-tendencia:hover { box-shadow: ${elevacao.media}; }
    .mini-tendencia .mini-topo { margin-bottom: 8px !important; }
    .mini-tendencia .mini-selo { font-size: 11px !important; padding: 2px 9px !important; }
    .mini-tendencia .mini-leitura {
      margin-top: 10px !important; padding-top: 10px; border-top: 1px solid ${claro.borda};
    }
  }
`;
