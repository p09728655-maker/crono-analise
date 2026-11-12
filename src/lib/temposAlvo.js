/**
 * OS TEMPOS-ALVO no aparelho (v2.106.0) — o tempo-alvo de cada produto,
 * lido do painel pelo servidor (GET /api/maquinas?alvo=1) e GUARDADO no
 * aparelho, como o programa da semana (taktDaSemana.js): o tablet perde
 * rede e o alvo nao pode sumir junto com ela.
 *
 * Busca ao abrir e de novo a cada meia hora. A resposta que nao e' ok (o
 * painel calado, o .gs sem a leitura) NAO apaga o guardado: o alvo de 20 min
 * atras vale mais que nenhum. Sem guardado, a resposta diz o motivo, e a
 * tela o escreve (semAlvo).
 *
 * Revisao de 11/11/2026: falhou e nao ha' leitura ok neste aparelho → tenta
 * de novo em 1 min (o tablet novo no cold start do Apps Script ficava meia
 * hora sem cor). E so' e' "sem rede" o que nao chegou ao servidor: resposta
 * do nosso servidor com erro (401, 500, 504) e' erro, com a mensagem dele.
 */
import { useEffect, useState } from 'react';
import { alvoDoProduto } from '../domain/tempoAlvo.js';
import { ErroApi, listarTemposAlvo } from './api.js';

const CHAVE = 'ritmopatrimar.temposAlvo';

function lerCache() {
  try {
    const lido = JSON.parse(localStorage.getItem(CHAVE));
    return lido && lido.estado === 'ok' && Array.isArray(lido.produtos) ? lido : null;
  } catch { return null; }
}
function gravarCache(lido) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lido)); } catch { /* segue sem cache */ }
}

/** O numero da meia hora corrente: muda as :00 e as :30. */
const janelaAtual = () => Math.floor(Date.now() / 1800000);
/** Sem leitura ok no aparelho, a proxima tentativa vem em 1 min. */
const NOVA_TENTATIVA_MS = 60000;

/**
 * `alvoDe(peca, data)` devolve o alvo do produto (alvoDoProduto); `lido` e' o que
 * vale agora (o guardado ou a resposta), `semRede` diz que a ultima busca
 * nao chegou ao servidor.
 */
export function useTemposAlvo({ ativo = true } = {}) {
  const [lido, setLido] = useState(lerCache);
  const [semRede, setSemRede] = useState(false);
  const [janela, setJanela] = useState(janelaAtual);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setJanela(janelaAtual()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    let espera = null;
    // Sem nada ok neste aparelho, tenta de novo logo (nao na meia hora).
    const deNovo = () => {
      if (vivo && !lerCache()) espera = setTimeout(() => setTentativa((n) => n + 1), NOVA_TENTATIVA_MS);
    };
    listarTemposAlvo()
      .then((r) => {
        if (!vivo) return;
        setSemRede(false);
        if (r && r.estado === 'ok' && Array.isArray(r.produtos)) {
          gravarCache(r);
          setLido(r);
          return;
        }
        if (!lerCache()) setLido(r && typeof r === 'object' && r.estado ? r : { estado: 'erro' });
        deNovo();
      })
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof ErroApi) {
          // Chegou ao servidor: nao e' falta de rede, e' o erro que ele deu.
          setSemRede(false);
          if (!lerCache()) setLido({ estado: 'erro', mensagem: e.message });
        } else {
          setSemRede(true);
        }
        deNovo();
      });
    return () => { vivo = false; if (espera) clearTimeout(espera); };
  }, [ativo, janela, tentativa]);
  // `data` (v2.107.0): a semana da medicao, para a linha "a semana pede" — sem ela, a de agora.
  return { lido, semRede, alvoDe: (peca, data = null) => alvoDoProduto(lido, peca, { semRede, data }) };
}
