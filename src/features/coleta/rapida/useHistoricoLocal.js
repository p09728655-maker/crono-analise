/**
 * AS CONFERENCIAS SALVAS NESTE APARELHO — e o caminho delas ate' o PC.
 *
 * Salvar (opcional, com o nome da peca) guarda a conferencia no aparelho
 * (localStorage, ate' 50) E a manda ao banco pelo mesmo caminho da coleta:
 * disco primeiro, rede depois. O id local vira clientId — reenvio nao
 * duplica no servidor. Sem rede, fica na fila e a sincronizacao automatica
 * leva quando der; salvar nunca depende disso.
 *
 * `naFila` sao as conferencias ainda NA FILA offline. A marca `enviada` diz
 * "entrou na fila"; quem confirma entrega e' o servidor, removendo da
 * fila. O rotulo "no PC" ja' mentiu uma vez — medicao presa por erro de
 * sync aparecia como entregue — entao a lista consulta a fila de verdade.
 */
import { useCallback, useEffect, useState } from 'react';
import { sincronizar } from '../../../lib/api.js';
import {
  listarConferencias, marcarEnviadas, removerConferencia, salvarConferencia,
} from '../../../lib/conferencias.js';
import { enfileirar, listarFila } from '../../../lib/filaOffline.js';
import { vibrar } from '../../../lib/hooks.js';

const paraFila = (c) => ({
  tipo: 'conferencia',
  clientId: c.id,
  maquina: c.maquina || null,
  peca: c.peca || null,
  horaInicial: c.horaInicial || null,
  horaFinal: c.horaFinal || null,
  duracaoMs: Math.round(c.duracaoMs),
  pecas: c.pecas,
  ciclosPorPeca: c.ciclosPorPeca || 1,
  paradas: c.paradas || [],
  salvoEm: c.salvoEm,
});

export function useHistoricoLocal({ aoGuardar } = {}) {
  const [historico, setHistorico] = useState(() => listarConferencias());
  const [salvo, setSalvo] = useState(null); // null | 'ok' | 'erro'
  const [naFila, setNaFila] = useState(() => new Set());

  useEffect(() => {
    let vivo = true;
    const olharFila = async () => {
      try {
        const fila = await listarFila();
        if (vivo) setNaFila(new Set(fila.filter((x) => x.tipo === 'conferencia').map((x) => x.clientId)));
      } catch { /* sem fila neste navegador: rotulo cai na marca local */ }
    };
    olharFila();
    const id = setInterval(olharFila, 5000);
    return () => { vivo = false; clearInterval(id); };
  }, []);

  // BACKFILL: conferencias salvas antes da sincronizacao existir (ou num
  // navegador em que a fila falhou) nao tem a marca `enviada`. Ao abrir a
  // tela elas entram na fila — o client_id torna qualquer repeticao
  // inofensiva no servidor — e passam a aparecer no relatorio do PC.
  useEffect(() => {
    // Abrir a tela tambem EMPURRA a fila. A barra de sincronizacao nao monta
    // aqui (tela cheia), entao uma conferencia que falhou no envio — servidor
    // fora, migracao pendente — ficava presa ate' o analista voltar a' lista.
    // Foi o caso real de 28/08: sync respondeu 500 por uns minutos e a
    // medicao so' subiria "sozinha" trocando de tela.
    sincronizar().catch(() => {});

    const pendentes = listarConferencias()
      .filter((c) => !c.enviada && Number(c.duracaoMs) > 0 && Number(c.pecas) > 0);
    if (!pendentes.length) return;
    (async () => {
      try {
        for (const c of pendentes) await enfileirar(paraFila(c));
        setHistorico(marcarEnviadas(pendentes.map((c) => c.id)));
        sincronizar().catch(() => {});
      } catch { /* sem fila neste navegador: tenta de novo na proxima abertura */ }
    })();
  }, []);

  const salvar = useCallback(async ({ calculado, maquina, peca, horaInicial, horaFinal, paradas }) => {
    const registro = salvarConferencia({
      maquina: maquina.trim(),
      peca: peca.trim(),
      horaInicial,
      horaFinal,
      duracaoMs: calculado.duracaoMs,
      pecas: calculado.pecas,
      ciclosPorPeca: calculado.ciclosPorPeca,
      paradas,
      pecasPorHora: calculado.pecasPorHora,
      pecasPorHoraBruto: calculado.pecasPorHoraBruto,
      paradaMs: calculado.paradaMs,
      produtivoMs: calculado.produtivoMs,
      cicloMedioMs: calculado.cicloMedioMs,
    });
    if (!registro) { setSalvo('erro'); return; }

    setHistorico(listarConferencias());
    setSalvo('ok');
    vibrar(45);
    aoGuardar?.(registro);

    try {
      await enfileirar(paraFila(registro));
      setHistorico(marcarEnviadas([registro.id]));
      // Na fila ate' o servidor confirmar: o rotulo mostra isso na hora,
      // sem esperar o proximo olhar periodico.
      setNaFila((f) => new Set(f).add(registro.id));
      sincronizar().catch(() => {});
    } catch { /* sem fila neste navegador: o backfill tenta na proxima abertura */ }
  }, [aoGuardar]);

  const remover = useCallback((id) => {
    setHistorico(removerConferencia(id));
    vibrar([25, 40, 25]);
  }, []);

  /** Mudou qualquer dado, a conferencia na tela ja' e' outra: libera salvar
      de novo em vez de fingir que a alteracao tambem esta' guardada. */
  const invalidar = useCallback(() => setSalvo(null), []);

  return { historico, naFila, salvo, salvar, remover, invalidar };
}
