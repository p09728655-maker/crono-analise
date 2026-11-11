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
 */
import { useEffect, useState } from 'react';
import { alvoDoProduto } from '../domain/tempoAlvo.js';
import { listarTemposAlvo } from './api.js';

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

/**
 * `alvoDe(peca)` devolve o alvo do produto (alvoDoProduto); `lido` e' o que
 * vale agora (o guardado ou a resposta), `semRede` diz que a ultima busca
 * nao chegou ao servidor.
 */
export function useTemposAlvo({ ativo = true } = {}) {
  const [lido, setLido] = useState(lerCache);
  const [semRede, setSemRede] = useState(false);
  const [janela, setJanela] = useState(janelaAtual);
  useEffect(() => {
    const id = setInterval(() => setJanela(janelaAtual()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    listarTemposAlvo()
      .then((r) => {
        if (!vivo) return;
        setSemRede(false);
        if (r && r.estado === 'ok' && Array.isArray(r.produtos)) {
          gravarCache(r);
          setLido(r);
        } else if (!lerCache()) {
          setLido(r && typeof r === 'object' ? r : { estado: 'erro' });
        }
      })
      .catch(() => { if (vivo) setSemRede(true); });
    return () => { vivo = false; };
  }, [ativo, janela]);
  return { lido, semRede, alvoDe: (peca) => alvoDoProduto(lido, peca, { semRede }) };
}
