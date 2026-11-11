import { useState } from 'react';
import { formatarSegundos } from '../../../domain/cronoanalise.js';
import { explicacaoDaRegua, medidoXAlvo, semAlvo } from '../../../domain/tempoAlvo.js';
import { claro } from '../../../theme/tokensAnalise.js';
import { est } from './estilos.js';

const uep = (v) => (v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const quandoCurto = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

/**
 * O TEMPO-ALVO DE CADA PRODUTO E O MEDIDO (v2.106.0, PCP de 11/11: "só
 * preciso deixar claro como chegamos no tempo-alvo de cada produto" → "e os
 * produtos que já fizemos?").
 *
 * Em cima, a regua de todos os alvos por extenso (de onde saem os segundos
 * por UEP). Embaixo, produto a produto: a UEP do cadastro do painel, o alvo
 * (= UEP × segundos por UEP) e, para os ja' medidos no app nos ultimos dias
 * da lista, o "por volume no periodo" da ultima medicao — o mesmo numero do
 * veredito quando ela e' aberta — com a diferenca. Os medidos vem primeiro,
 * do mais acima do alvo para o mais abaixo; o resto do cadastro abre num
 * botao. Desenho: a conta e' medidoXAlvo (domain/tempoAlvo.js).
 */
export default function TempoAlvoDosProdutos({
  alvos, medicoes, periodoDe, dias,
}) {
  const [verTodos, setVerTodos] = useState(false);
  const lido = alvos?.lido;
  if (!lido || lido.estado !== 'ok') {
    return (
      <section style={est.painelBloco} aria-label="Tempo-alvo de cada produto">
        <h3 style={est.painelTitulo}>Tempo-alvo de cada produto</h3>
        <p style={est.painelDica}>
          {semAlvo(lido ? lido.estado : alvos?.semRede ? 'sem-rede' : 'carregando')}
        </p>
      </section>
    );
  }
  const m = medidoXAlvo(lido, medicoes, periodoDe);
  const semMedicao = m.todos.filter((l) => !l.medicao);
  const linhas = verTodos ? [...m.medidos, ...semMedicao] : m.medidos;
  const sUep = lido.ref.sUep.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Recolhido, com a regua no titulo: aberto, a tabela empurrava a lista de
     medicoes e o detalhe (o trabalho do dia nesta tela) para baixo. */
  return (
    <details style={est.painelBloco} aria-label="Tempo-alvo de cada produto">
      <summary style={{ ...est.painelTitulo, cursor: 'pointer' }}>
        Tempo-alvo de cada produto — como chegamos nele: a UEP do produto × {sUep} s por UEP
        {m.medidos.length > 0 ? ` · ${m.medidos.length} ${m.medidos.length === 1 ? 'medido' : 'medidos'}, com o medido ao lado` : ''}
        {m.medidos.some((l) => l.difPct > 0) ? ` · ${m.medidos.filter((l) => l.difPct > 0).length} acima do alvo` : ''}
      </summary>
      <p style={est.painelDica}>
        <strong>Tempo-alvo do produto = a UEP dele × {sUep} s por UEP.</strong> {explicacaoDaRegua(lido.ref)}
        {' '}A UEP é a do cadastro do painel, volume a volume (a média das cores; o produto inteiro, a média
        dos volumes). É o tempo que cada volume pode levar para a linha fazer a média sem hora extra.
      </p>
      <p style={est.painelDica}>
        {m.medidos.length > 0
          ? `Os ${m.medidos.length === 1 ? 'produto medido' : `${m.medidos.length} produtos medidos`} no app nos últimos ${dias} dias, `
            + 'com o tempo por volume da última medição (no período, paradas dentro — o número do veredito), do mais acima do alvo para o mais abaixo.'
          : `Nenhum produto da lista do painel medido no app nos últimos ${dias} dias.`}
        {m.foraDaLista > 0
          && ` ${m.foraDaLista === 1 ? '1 medição tem' : `${m.foraDaLista} medições têm`} produto fora da lista do painel (digitado à mão) e fica${m.foraDaLista === 1 ? '' : 'm'} sem alvo.`}
      </p>
      {linhas.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={est.tabela}>
            <thead>
              <tr>
                <th style={est.th}>Produto</th>
                <th style={est.thNum}>UEP</th>
                <th style={est.thNum}>Tempo-alvo</th>
                <th style={est.thNum}>Última medição</th>
                <th style={est.thNum}>Diferença</th>
                <th style={est.th}>Medições</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const acima = l.difPct != null && l.difPct > 0;
                return (
                  <tr key={l.rot}>
                    <td style={{ ...est.tdCurto, maxWidth: 360 }} title={l.rot}>{l.rot}</td>
                    <td style={est.tdNum}>{uep(l.uep)}</td>
                    <td style={est.tdNum} title={l.alvoMs ? `${uep(l.uep)} UEP × ${sUep} s` : 'sem UEP no painel'}>
                      {l.alvoMs ? `${formatarSegundos(l.alvoMs)} s` : 'sem UEP'}
                    </td>
                    <td style={est.tdNum}>{l.medicao ? `${formatarSegundos(l.medicao.periodoMs)} s` : '—'}</td>
                    <td
                      style={{
                        ...est.tdNum,
                        fontWeight: l.difPct != null ? 700 : 400,
                        color: l.difPct == null ? claro.textoFraco : acima ? claro.critico : claro.ok,
                      }}
                    >
                      {l.difPct == null ? '—' : `${acima ? '▲' : '✓'} ${Math.abs(Math.round(l.difPct))}% ${acima ? 'acima' : 'dentro'}`}
                    </td>
                    <td style={est.tdFraco}>
                      {l.medicao ? `${l.medicao.n} · última ${quandoCurto(l.medicao.quando)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {semMedicao.length > 0 && (
        <button type="button" style={est.botaoTexto} onClick={() => setVerTodos((v) => !v)}>
          {verTodos
            ? 'Mostrar só os medidos'
            : `Mostrar também os ${semMedicao.length} sem medição (o tempo-alvo de todo o cadastro do painel)`}
        </button>
      )}
    </details>
  );
}
