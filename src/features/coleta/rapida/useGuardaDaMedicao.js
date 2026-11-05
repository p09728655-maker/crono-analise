/**
 * A MEDICAO NAO SE PERDE POR UM VOLTAR SEM QUERER (pedido do PPCP, 05/11).
 *
 * O cronometro ao vivo guarda tudo na memoria da tela ate' o Salvar. O
 * Voltar do tablet (a seta ou o gesto na borda da tela, no Android) trocava
 * a rota, a tela desmontava e a medicao sumia: meia hora de cronometragem
 * perdida por um dedo na borda. O beforeunload nao ajuda aqui — ele so'
 * cobre recarregar e fechar a aba, e o Voltar dentro do app nao passa por ele.
 *
 * Enquanto `ativa` (cronometrando, ou com o resultado ainda nao salvo), uma
 * entrada a mais no historico, no MESMO endereco, segura o Voltar: ele tira
 * so' essa entrada, a tela fica onde esta', a entrada volta e a pergunta
 * abre. A seta do topo e o Sair do resultado perguntam igual (pedirSaida).
 * E' o mesmo mecanismo que ja' faz o Voltar fechar o resultado salvo da
 * Embalagem Takt Time (v2.100.0).
 *
 * Sair de verdade tira a entrada ANTES de navegar, e a medicao deixando de
 * precisar de guarda (salva, nova, cancelada) tira a entrada sozinha: o
 * historico fica como se ela nunca tivesse existido, sem um Voltar "morto"
 * que nao muda nada na tela.
 *
 * O que isto NAO cobre: o navegador fechado pelo sistema (memoria) ou
 * forcado a fechar. Ai' a medicao ainda se perde — ela so' existe na tela.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CHAVE = 'medicaoEmAndamento';

const comGuarda = () => Boolean(window.history.state?.[CHAVE]);
const porGuarda = () => window.history.pushState({ ...(window.history.state || {}), [CHAVE]: true }, '');

export function useGuardaDaMedicao({ ativa, aoSair }) {
  const [perguntando, setPerguntando] = useState(false);
  const ativaRef = useRef(ativa);
  ativaRef.current = ativa;
  const aoSairRef = useRef(aoSair);
  aoSairRef.current = aoSair;
  // Os Voltar que esta tela mesma deu (tirar a guarda): o popstate deles nao
  // e' o usuario voltando. `sairDepois`: o que tirou a guarda para sair.
  const proprios = useRef(0);
  const sairDepois = useRef(false);

  // Poe a guarda quando a medicao comeca; tira quando ela deixa de precisar.
  // Tirar so' com a guarda no TOPO: senao o Voltar levaria a outra entrada.
  useEffect(() => {
    if (ativa) {
      if (!comGuarda()) porGuarda();
      return;
    }
    setPerguntando(false);
    if (comGuarda()) {
      proprios.current += 1;
      window.history.back();
    }
  }, [ativa]);

  useEffect(() => {
    const caminho = window.location.pathname;
    const aoNavegar = () => {
      if (proprios.current > 0) {
        proprios.current -= 1;
        if (sairDepois.current) {
          sairDepois.current = false;
          aoSairRef.current?.();
        }
        return;
      }
      // O Voltar que ja' saiu da tela e' do App, nao daqui.
      if (window.location.pathname !== caminho) return;
      if (!ativaRef.current || comGuarda()) return;
      // O Voltar tirou a guarda: a tela nao saiu. A guarda volta e a
      // pergunta abre — um segundo Voltar sem querer tambem nao sai.
      porGuarda();
      setPerguntando(true);
    };
    window.addEventListener('popstate', aoNavegar);
    return () => window.removeEventListener('popstate', aoNavegar);
  }, []);

  /** A seta do topo e o Sair do resultado: com medicao a perder, pergunta. */
  const pedirSaida = useCallback(() => {
    if (ativaRef.current) setPerguntando(true);
    else aoSairRef.current?.();
  }, []);

  const continuar = useCallback(() => setPerguntando(false), []);

  /** Sair e descartar: tira a guarda e so' entao sai (ver aoNavegar). */
  const sair = useCallback(() => {
    setPerguntando(false);
    if (comGuarda()) {
      proprios.current += 1;
      sairDepois.current = true;
      window.history.back();
    } else {
      aoSairRef.current?.();
    }
  }, []);

  return { perguntando, pedirSaida, continuar, sair };
}
