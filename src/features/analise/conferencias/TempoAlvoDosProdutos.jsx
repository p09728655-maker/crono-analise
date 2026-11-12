import { useState } from 'react';
import { formatarSegundos } from '../../../domain/cronoanalise.js';
import {
  explicacaoDaRegua, idadeDoAlvo, medidoXAlvo, semAlvo, vereditoDaSemana,
} from '../../../domain/tempoAlvo.js';
import { claro } from '../../../theme/tokensAnalise.js';
import { est } from './estilos.js';

// Com ponto, como os segundos do app (ver domain/tempoAlvo.js).
const uep = (v) => (v > 0 ? v.toFixed(2) : '—');
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
          {semAlvo(lido ? lido.estado : alvos?.semRede ? 'sem-rede' : 'carregando', lido?.mensagem)}
        </p>
      </section>
    );
  }
  const m = medidoXAlvo(lido, medicoes, periodoDe);
  const semMedicao = m.todos.filter((l) => !l.medicao);
  const linhas = verTodos ? [...m.medidos, ...semMedicao] : m.medidos;
  const sUep = lido.ref.sUep.toFixed(2);
  const idade = idadeDoAlvo(lido.lidoEm);
  // v2.111.0 (.gs v5.65): o alvo pela ESTEIRA ÷ a eficiencia da embalagem; a semana so' em %
  const esteira = m.esteira;
  const ef = esteira ? `${lido.ref.eficiencia}%` : '';
  // v2.107.0: o que ESTA semana pede em cada produto (a coluna PELO TAKT do painel)
  const sem = m.semana;
  const semTit = sem && !esteira
    ? `O que a programação da semana de ${sem.de.slice(0, 5)} pede no produto: ${sem.sUep.toFixed(2)} s por UEP × a UEP dele. `
      + `A programação pede ${sem.pede != null ? `${sem.pede.toFixed(1)}%` : '—'} da média da linha. É a carga, não julga o produto.`
    : '';
  const colunaSemana = sem && !esteira;

  /* Recolhido, com a regua no titulo: aberto, a tabela empurrava a lista de
     medicoes e o detalhe (o trabalho do dia nesta tela) para baixo. */
  return (
    <details style={est.painelBloco} aria-label="Tempo-alvo de cada produto">
      <summary style={{ ...est.painelTitulo, cursor: 'pointer' }}>
        Tempo-alvo de cada produto — como chegamos nele: {esteira ? `a esteira do produto ÷ ${ef}` : `a UEP do produto × ${sUep} s por UEP`}
        {m.medidos.length > 0 ? ` · ${m.medidos.length} ${m.medidos.length === 1 ? 'medido' : 'medidos'}, com o medido ao lado` : ''}
        {m.medidos.some((l) => l.difPct > 0) ? ` · ${m.medidos.filter((l) => l.difPct > 0).length} acima do alvo` : ''}
      </summary>
      {esteira ? (
        <p style={est.painelDica}>
          <strong>{explicacaoDaRegua(lido.ref)}</strong>
          {' '}A medida, a velocidade e o entre-peças são os de cada código na PRODUTO_CODIGO do painel (a média das
          cores; o produto inteiro, a média por caixa dos volumes); a eficiência é a do ⚙ do painel.
          {' '}É o de hoje: a medição antiga é lida com a caixa e a eficiência de agora.{idade ? ` ${idade}` : ''}
        </p>
      ) : (
        <p style={est.painelDica}>
          <strong>Tempo-alvo do produto = a UEP dele × {sUep} s por UEP.</strong> {explicacaoDaRegua(lido.ref)}
          {' '}A UEP é a do cadastro do painel, volume a volume (a média das cores; o produto inteiro, a média
          dos volumes). É o tempo que cada volume pode levar para a linha fazer a média sem hora extra.
          {' '}É o de hoje: a medição antiga é lida com a UEP e a média de agora.{idade ? ` ${idade}` : ''}
        </p>
      )}
      {sem && esteira && (
        <p style={est.painelDica}>
          <strong>A programação da semana de {sem.de.slice(0, 5)} pede {sem.pede.toFixed(1)}% da média da linha</strong>
          {vereditoDaSemana(sem, { esteira: true }) ? ` — ${vereditoDaSemana(sem, { esteira: true })}` : ''}. É a carga da
          semana, pela UEP e pela META UEP do painel: não julga o produto, e não vira segundos no produto — o
          tempo-alvo é com o produto rodando, a média do dia tem as trocas e as esperas dentro.
        </p>
      )}
      {colunaSemana && (
        <p style={est.painelDica}>
          <strong>Esta semana pede {sem.sUep.toFixed(2)} s por UEP</strong> (a programação da semana de {sem.de.slice(0, 5)}
          {sem.pede != null ? ` pede ${sem.pede.toFixed(1)}% da média da linha` : ''}
          {vereditoDaSemana(sem) ? `: ${vereditoDaSemana(sem)}` : ''}). A coluna ao lado do tempo-alvo é
          o que ela pede em cada produto — a carga, sem cor: quem julga a medição é o tempo-alvo.
        </p>
      )}
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
                <th style={est.thNum}>{esteira ? 'Esteira' : 'UEP'}</th>
                <th style={est.thNum}>Tempo-alvo</th>
                {colunaSemana && <th style={est.thNum} title={semTit}>Esta semana pede</th>}
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
                    <td style={est.tdNum}>{esteira ? (l.esteiraMs ? `${formatarSegundos(l.esteiraMs)} s` : '—') : uep(l.uep)}</td>
                    <td
                      style={est.tdNum}
                      title={esteira
                        ? (l.alvoMs ? `${formatarSegundos(l.esteiraMs)} s de esteira ÷ ${ef}` : 'sem a medida da caixa ou a velocidade no painel')
                        : (l.alvoMs ? `${uep(l.uep)} UEP × ${sUep} s` : 'sem UEP no painel')}
                    >
                      {l.alvoMs ? `${formatarSegundos(l.alvoMs)} s` : esteira ? 'sem medida' : 'sem UEP'}
                    </td>
                    {colunaSemana && (
                      <td style={{ ...est.tdNum, color: claro.textoFraco }} title={semTit}>
                        {l.semanaMs ? `${formatarSegundos(l.semanaMs)} s` : '—'}
                      </td>
                    )}
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
