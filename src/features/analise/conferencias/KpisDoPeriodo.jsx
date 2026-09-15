import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * Os numeros do topo, em palavras que qualquer pessoa le. Seguem o filtro
 * da lateral — `painel` ja' chega cortado (resumoDoPeriodo, no dominio).
 *
 * A ORDEM E' A HISTORIA, e ela comeca pelo numero que DECIDE: o ritmo de
 * RELOGIO, com as paradas dentro. E' ele que se compara com a demanda e
 * ele que enche o caminhao — o proprio dominio diz isso no comentario de
 * `ritmoRelogio`, que era calculado e nao aparecia em lugar nenhum do
 * topo. A manchete era o ritmo de maquina RODANDO: o maior numero da
 * tela, no maior corpo, e o mais otimista dos dois. Quem passava o olho
 * num slide de diretoria levava o 750 e nao o 612.
 *
 * Os dois ritmos so' aparecem separados quando ha' parada marcada. Sem
 * parada eles sao o MESMO numero, e dois cartoes iguais lado a lado com
 * rotulos diferentes ensinariam a desconfiar dos dois.
 */
export default function KpisDoPeriodo({ painel }) {
  const { ritmoRelogio, ritmoMedio } = painel;
  // Parada marcada e' o que separa os dois ritmos. Sem ela, um cartao so'.
  const doisRitmos = painel.paradaMs > 0 && ritmoRelogio != null && ritmoMedio != null;

  const cartoes = doisRitmos
    ? [
      {
        rot: 'Ritmo no relógio',
        val: `${Math.round(ritmoRelogio)} pç/h`,
        sub: `${porMinuto(ritmoRelogio)} peças por minuto — com as paradas dentro, é o que se compara com a demanda`,
      },
      {
        // O potencial fica em segundo e diz que E' potencial. Sem a base
        // junto do numero, este cartao mostrava o mesmo valor do quadro
        // de baixo e um valor diferente do que saiu — a mesma confusao de
        // 10,3 x 13,2, agora dentro de uma tela so'.
        rot: 'Ritmo rodando',
        val: `${Math.round(ritmoMedio)} pç/h`,
        sub: `${porMinuto(ritmoMedio)} peças por minuto — só o tempo com a máquina rodando`,
      },
    ]
    : [
      {
        rot: 'Ritmo médio',
        val: ritmoRelogio != null ? `${Math.round(ritmoRelogio)} pç/h` : '—',
        sub: ritmoRelogio != null
          ? `${porMinuto(ritmoRelogio)} peças por minuto — sem parada marcada, é o ritmo de relógio e o de máquina rodando`
          : 'sem tempo de máquina rodando',
      },
    ];

  cartoes.push(
    {
      // O PERCENTUAL na frente, a duracao embaixo: e' a disponibilidade do
      // periodo, e percentual e' o que se acompanha no tempo. "18 min de
      // 30" obrigava quem le' a dividir de cabeca para chegar no mesmo
      // numero.
      rot: 'Máquina rodando',
      val: painel.totalMs > 0
        ? `${Math.round((painel.produtivoMs / painel.totalMs) * 100)}%`
        : '—',
      sub: `${formatarDuracao(painel.produtivoMs)} de ${formatarDuracao(painel.totalMs)} observados`,
    },
    {
      rot: 'Tempo parado',
      val: painel.paradaMs > 0 ? formatarDuracao(painel.paradaMs) : '—',
      sub: painel.pareto.setupMs > 0
        ? `${formatarDuracao(painel.pareto.setupMs)} em troca/setup`
        : 'nenhuma parada marcada',
    },
    // A PROCEDENCIA por ultimo: diz com que base os numeros acima existem,
    // e por isso se le' depois deles, nao antes.
    { rot: 'Medições', val: String(painel.n), sub: `${painel.maquinas} máquina(s) · ${painel.pecasTot} peças` },
  );

  return (
    <section style={est.kpis} aria-label="Resumo do período">
      {cartoes.map((k) => (
        <div key={k.rot} style={est.kpi}>
          <div style={est.kpiRotulo}>{k.rot}</div>
          <div style={est.kpiValor}>{k.val}</div>
          <div style={est.kpiSub}>{k.sub}</div>
        </div>
      ))}
    </section>
  );
}
