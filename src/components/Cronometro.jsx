import { claro } from '../theme/tokensAnalise.js';

/**
 * O CRONOMETRO — o desenho que diz "cronoanálise" sem escrever a palavra.
 *
 * Mora aqui, e nao em cada tela, porque tem dois usos que precisam sair
 * identicos: a porta do sistema e a faixa de abertura do Inicio. Dois
 * desenhos parecidos em telas vizinhas leem-se como descuido.
 *
 * SVG inline, nao icone de biblioteca: uma dependencia de icones custaria
 * mais KB que todas as telas que o usam, e aqui e' uma forma so'.
 */
export default function Cronometro({ tamanho = 22, cor = claro.vermelho, espessura = 1.6 }) {
  const traco = {
    fill: 'none', stroke: cor, strokeWidth: espessura,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  return (
    <svg
      width={tamanho} height={tamanho} viewBox="0 0 24 24"
      role="img" aria-hidden="true" style={{ display: 'block' }}
    >
      <circle cx="12" cy="13" r="8" {...traco} />
      {/* Ponteiro ao alto, coroa e botao: e' o que separa um cronometro de
          um relogio qualquer. */}
      <path d="M12 13V9M9.5 2h5M12 5V2" {...traco} />
    </svg>
  );
}
