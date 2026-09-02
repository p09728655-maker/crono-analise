/**
 * PARADAS DENTRO DO PERIODO conferido — setup, falta de peca, manutencao.
 *
 * Uma lista so' para os dois caminhos (horarios e cronometro): a parada e'
 * do PERIODO, nao do jeito como ele foi medido. Sem elas, a mesma
 * furadeira aparece lenta no dia de troca de lote e rapida no dia de lote
 * longo — e o ritmo nunca fecha com o que o posto entrega.
 *
 * O campo guarda MINUTO (e' assim que o analista pensa: "ficou 8 minutos
 * parada"); a conversao para milissegundos mora aqui, num lugar so'.
 * Vazio e zero somem de `emMs`: linha recem-criada nao pode virar parada
 * de 0 min no relatorio.
 *
 * O SETUP CRONOMETRADO e' do caminho dos horarios: o setup era o unico
 * numero digitado de cabeca numa tela onde tudo e' medido — agora um
 * toque marca o inicio da troca e o segundo grava os minutos exatos.
 */
import { useCallback, useMemo, useState } from 'react';
import { numeroDecimal, somarParadas } from '../../../domain/cronoanalise.js';
import { codigoPreferido } from '../../../lib/motivosParada.js';
import { novoId } from '../../../lib/filaOffline.js';
import { vibrar } from '../../../lib/hooks.js';

/**
 * As linhas da tela (minutos digitados, com virgula ou ponto) em
 * milissegundos, prontas para o calculo. Vazio e zero somem: linha
 * recem-criada nao pode virar parada de 0 min no relatorio.
 */
export function paradasEmMilissegundos(paradas) {
  return paradas
    .map((p) => ({
      motivo: p.motivo,
      duracaoMs: Math.round(numeroDecimal(p.minutos) * 60000),
    }))
    .filter((p) => p.duracaoMs > 0);
}

export function useParadasDoPeriodo(motivos) {
  const [paradas, setParadas] = useState([]);
  const [setupCrono, setSetupCrono] = useState(null);

  const emMs = useMemo(() => paradasEmMilissegundos(paradas), [paradas]);
  const total = useMemo(() => somarParadas(emMs), [emMs]);

  const adicionar = useCallback((motivo, minutos = '') => {
    setParadas((lista) => [...lista, { id: novoId(), motivo, minutos: String(minutos) }]);
    vibrar(30);
  }, []);

  const alterar = useCallback((id, campo, valor) => {
    setParadas((lista) => lista.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }, []);

  const remover = useCallback((id) => {
    setParadas((lista) => lista.filter((p) => p.id !== id));
    vibrar([25, 40, 25]);
  }, []);

  /** Periodo novo comeca sem parada: a parada e' do periodo que acabou.
      Um setup que estivesse correndo pertencia ao periodo anterior. */
  const limpar = useCallback(() => {
    setParadas([]);
    setSetupCrono(null);
  }, []);

  /** Do rascunho: so' se a lista ainda estiver vazia (ver useRascunho). */
  const restaurar = useCallback((lista) => {
    setParadas((v) => (v.length ? v : (Array.isArray(lista) ? lista : [])));
  }, []);

  const iniciarSetup = useCallback(() => {
    setSetupCrono({ inicio: performance.now() });
    vibrar([30, 40, 30]);
  }, []);

  const encerrarSetup = useCallback(() => {
    if (!setupCrono) return;
    const ms = performance.now() - setupCrono.inicio;
    // Menos de 1s e' toque errado, nao setup — mesma regra da parada ao
    // vivo. Duas casas no minuto pelo mesmo motivo de la': 45s viram 0,75.
    if (ms >= 1000) adicionar(codigoPreferido(motivos, 'setup'), (ms / 60000).toFixed(2));
    setSetupCrono(null);
    vibrar(45);
  }, [setupCrono, adicionar, motivos]);

  return {
    paradas, emMs, total, adicionar, alterar, remover, limpar, restaurar,
    setupCrono, iniciarSetup, encerrarSetup,
  };
}
