/**
 * ÍCONES DO MENU — SVG inline, desenhados aqui.
 *
 * Uma biblioteca de icones custaria mais KB que todas as telas que os usam,
 * e sao oito formas simples. Todos no mesmo grid de 24, com o mesmo traco:
 * icone que muda de peso entre um item e outro deixa a lista irregular sem
 * ninguem saber dizer por que.
 *
 * O ICONE NAO SUBSTITUI O ROTULO. Cada item do menu leva os dois — nome e
 * desenho. Sozinho, o icone obriga a decorar, e "Motivos de parada" nao tem
 * desenho universal nenhum. Ele serve para BATER O OLHO e achar o item ja'
 * conhecido mais rapido, nao para dizer o que a coisa e'.
 */
function Icone({ children, cor = 'currentColor' }) {
  return (
    <svg
      width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke={cor} strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {children}
    </svg>
  );
}

/** Casa — o Inicio. */
export const IconeInicio = () => (
  <Icone><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></Icone>
);

/** Prancheta — o estudo de tempos, que e' folha e caneta no posto. */
export const IconeEstudos = () => (
  <Icone>
    <path d="M9 4h6v3H9z" />
    <path d="M15 5.5h2.5A1.5 1.5 0 0 1 19 7v12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V7a1.5 1.5 0 0 1 1.5-1.5H9" />
    <path d="M9 12h6M9 16h4" />
  </Icone>
);

/** Cronometro — o ritmo por maquina. Mesma forma da marca. */
export const IconeRitmo = () => (
  <Icone><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V10M9.5 3h5M12 6V3" /></Icone>
);

/** Caixa arquivo. */
export const IconeArquivados = () => (
  <Icone>
    <path d="M3.5 7.5h17v3h-17z" />
    <path d="M5 10.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8.5" />
    <path d="M10 14h4" />
  </Icone>
);

/** Folha com seta entrando — importar roteiro. */
export const IconeImportar = () => (
  <Icone>
    <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
    <path d="M14 3v4h4" />
    <path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" />
  </Icone>
);

/** Duas pessoas — os analistas. */
export const IconeAnalistas = () => (
  <Icone>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5.8M17 14.5a5.5 5.5 0 0 1 3.5 5.5" />
  </Icone>
);

/** Sinal de pausa — a parada da maquina. */
export const IconeParadas = () => (
  <Icone><circle cx="12" cy="12" r="8.5" /><path d="M10 9.5v5M14 9.5v5" /></Icone>
);

/** Engrenagem simplificada — o cadastro de maquinas. */
export const IconeMaquinas = () => (
  <Icone>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" />
  </Icone>
);

/** Chave — a chave da IA. */
export const IconeChave = () => (
  <Icone>
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12H20M17 12v3M14.5 12v2.5" />
  </Icone>
);
