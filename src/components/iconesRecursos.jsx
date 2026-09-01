import { claro } from '../theme/tokensAnalise.js';
import { espaco } from '../theme/escala.js';

/**
 * OS QUATRO ICONES DOS CARTOES — cheios, no disco.
 *
 * Sao a primeira coisa colorida da tela e apresentam o sistema a quem
 * chega: precisam ter PESO. Em traco fino de 1,6px eles sumiam entre o
 * titulo e a descricao do cartao, e a fileira lia-se como quatro caixas de
 * texto com um risco em cima.
 *
 * Traco grosso e partes solidas, num disco vermelho translucido: o disco
 * dá' a massa, o desenho dá' o significado. E' o oposto do que o MENU pede
 * — la' o icone acompanha um rotulo numa lista de dez, e peso vira ruido.
 * Dois pesos de icone no mesmo produto, cada um no seu lugar.
 */
function Disco({ children }) {
  return (
    <span style={disco}>
      <svg width="30" height="30" viewBox="0 0 24 24" role="img" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

/* Contorno grosso: o traco fino da tela some dentro do disco. */
const grosso = {
  fill: 'none', stroke: claro.vermelho, strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};
const solido = { fill: claro.vermelho, stroke: 'none' };

/** Cronometro: corpo vazado, coroa e botao solidos, ponteiro rodando. */
function Cronometro({ tamanho }) {
  // O mesmo desenho serve ao titulo da tela, em linha com o texto, onde
  // nao ha disco: ai' ele vem sem a moldura e do tamanho da fonte.
  const corpo = (
    <>
      <circle cx="12" cy="13.5" r="7.5" {...grosso} />
      <path d="M12 13.5V9.5" {...grosso} />
      <rect x="9.5" y="1.6" width="5" height="2.6" rx="1.1" {...solido} />
      <rect x="10.9" y="3.6" width="2.2" height="2.6" rx="0.9" {...solido} />
      <rect x="17.4" y="5.2" width="3.4" height="2.1" rx="1" {...solido} transform="rotate(45 19.1 6.2)" />
    </>
  );
  if (tamanho) {
    return (
      <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" role="img" aria-hidden="true">
        {corpo}
      </svg>
    );
  }
  return <Disco>{corpo}</Disco>;
}

/** Barras: o relatorio. Solidas, alturas diferentes, base alinhada. */
function Grafico() {
  return (
    <Disco>
      <rect x="3.6" y="12.5" width="4.2" height="8" rx="1.4" {...solido} />
      <rect x="9.9" y="7.5" width="4.2" height="13" rx="1.4" {...solido} />
      <rect x="16.2" y="10" width="4.2" height="10.5" rx="1.4" {...solido} />
    </Disco>
  );
}

/** Alvo: o tempo padrao — a referencia em que se mira. */
function Alvo() {
  return (
    <Disco>
      <circle cx="12" cy="12" r="8.3" {...grosso} />
      <circle cx="12" cy="12" r="4" {...grosso} />
      <circle cx="12" cy="12" r="1.7" {...solido} />
    </Disco>
  );
}

/** Subida: barras e a seta por cima — producao que cresce. */
function Subida() {
  return (
    <Disco>
      <rect x="3.4" y="15.4" width="3.6" height="5.2" rx="1.2" {...solido} />
      <rect x="10.2" y="12.6" width="3.6" height="8" rx="1.2" {...solido} />
      <rect x="17" y="9.4" width="3.6" height="11.2" rx="1.2" {...solido} />
      <path d="M4.2 9.6 9.4 5.2l3.4 2.8L19 3.2" {...grosso} />
      <path d="M19.4 7.4V2.9h-4.3" {...grosso} />
    </Disco>
  );
}


export const RECURSOS = [
  { titulo: 'Cronometragem', texto: 'Medição precisa de tempos', Icone: Cronometro },
  { titulo: 'Análise de dados', texto: 'Relatórios e indicadores', Icone: Grafico },
  { titulo: 'Padronização', texto: 'Tempo padrão e ciclos', Icone: Alvo },
  { titulo: 'Produtividade', texto: 'Ritmo, capacidade e perdas', Icone: Subida },
];

export { Cronometro, Grafico, Alvo, Subida };

// O disco por tras do icone: vermelho a 8%, o mesmo tom dos fundos de
// status do sistema — cor de marca rebaixada, nunca uma cor nova.
const disco = {
  width: 56, height: 56, borderRadius: '50%', marginBottom: espaco.sm,
  background: 'rgba(219, 33, 38, 0.08)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
