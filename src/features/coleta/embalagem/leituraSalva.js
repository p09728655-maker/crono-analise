/**
 * O RESULTADO DE UMA MEDICAO SALVA NESTE APARELHO (v2.100.0) — a leitura
 * volume a volume que o PC faz, sobre a copia guardada no tablet.
 *
 * Pedido do chao de fabrica: depois do "Nova medicao", o resultado sumia
 * e so' dava para ver no PC. As contas sao as MESMAS do painel do PC
 * (useVolumeAVolume): periodoPorPeca, leituraPecaAPeca, deixouDeEmbalar e
 * roubadosPelasParadas, com o takt da semana DA medicao. Uma conta propria
 * do tablet acabaria num segundo numero para a mesma medicao.
 *
 * O que muda e' de onde vem o dado: o registro local (camelCase, ver
 * useHistoricoLocal), nao o banco. Por isso ele e' posto na forma do banco
 * antes de entrar no dominio — e por isso a tela avisa que correcao feita
 * no PC (produto, paradas) nao volta para ca'.
 */
import { leituraPecaAPeca, periodoPorPeca } from '../../../domain/cronoanalise.js';
import { deixouDeEmbalar, roubadosPelasParadas } from '../../../domain/volumeAVolume.js';
import { descontaSetup } from '../../../domain/tempoAlvo.js';

/**
 * O instante em que a medicao comecou, como o servidor grava o
 * iniciado_em do cronometro ao vivo: o salvo menos a duracao. E' a data que
 * acha a semana do takt — a mesma que o PC usa.
 */
export function inicioDaSalva(registro) {
  const fim = new Date(registro?.salvoEm).getTime();
  if (!Number.isFinite(fim)) return null;
  return new Date(fim - (Number(registro?.duracaoMs) || 0)).toISOString();
}

/** O registro do aparelho na forma do banco, a que o dominio le. */
export const comoConferencia = (registro) => ({
  id: registro?.id ?? null,
  duracao_ms: Number(registro?.duracaoMs) || 0,
  pecas: Number(registro?.pecas) || 0,
  paradas: registro?.paradas || [],
});

/**
 * A leitura da medicao salva, com o takt da semana dela (a carga, e o setup
 * planejado do grupo, que sai do periodo) e o TEMPO-ALVO do produto (a
 * regua do veredito, v2.106.0).
 *
 * As marcas so' valem com a contagem que elas explicam — a mesma regra do
 * banco (uma marca por volume). Contagem corrigida a' mao ou medicao por
 * horarios nao tem marca: `leitura` sai null e a tela mostra so' o que a
 * medicao inteira diz (volumes/hora e paradas).
 */
export function leituraDaSalva(registro, takt = {}, alvo = {}) {
  const conferencia = comoConferencia(registro);
  const marcas = Array.isArray(registro?.marcasMs) ? registro.marcasMs.map(Number) : null;
  const comMarcas = Boolean(marcas) && marcas.length >= 2 && marcas.length === conferencia.pecas;
  const relogio = registro?.marcasRelogioMs ?? null;
  const periodoPorPecaMs = comMarcas
    ? periodoPorPeca({
      relogioEntreMarcasMs: relogio,
      volumes: marcas.length,
      setupNoTrechoMs: registro.marcasSetupMs,
      setupPlanejado: descontaSetup(alvo, takt),
    })
    : null;
  const leitura = comMarcas
    ? leituraPecaAPeca({
      marcasMs: marcas, taktMs: takt.taktMs, alvoMs: alvo.alvoMs, periodoPorPecaMs,
    })
    : null;
  const roubo = roubadosPelasParadas(conferencia);
  return {
    conferencia,
    comMarcas,
    leitura,
    // O total num passo so' (v2.99.6); null sem leitura ou sem o relogio.
    deixou: comMarcas ? deixouDeEmbalar([{ conferencia, marcas, relogio }], leitura) : null,
    // So' com parada marcada (ver roubadosPelasParadas).
    roubo,
  };
}
