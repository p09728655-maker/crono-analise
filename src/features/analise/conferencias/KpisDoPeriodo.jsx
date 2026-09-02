import { formatarDuracao } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * Os numeros do topo, em palavras que qualquer pessoa le: ritmo medio
 * (pecas/hora E pecas/minuto), quantas medicoes, quanto tempo a maquina
 * rodou e quanto ficou parada. Seguem o filtro da lateral — `painel` ja'
 * chega cortado (resumoDoPeriodo, no dominio).
 */
export default function KpisDoPeriodo({ painel }) {
  const cartoes = [
    {
      rot: 'Ritmo médio',
      val: painel.ritmoMedio != null ? `${Math.round(painel.ritmoMedio)} pç/h` : '—',
      // A BASE junto do numero: sem ela, este cartao mostra o mesmo valor
      // do POTENCIAL do quadro abaixo e um valor diferente do que saiu —
      // a mesma confusao de 10,3 x 13,2, agora dentro de uma tela so'.
      sub: painel.ritmoMedio != null
        ? `${porMinuto(painel.ritmoMedio)} peças por minuto — só o tempo com a máquina rodando`
        : 'sem tempo de máquina rodando',
    },
    { rot: 'Medições', val: String(painel.n), sub: `${painel.maquinas} máquina(s) · ${painel.pecasTot} peças` },
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
  ];

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
