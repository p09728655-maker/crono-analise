/**
 * O PROGRAMA JA' GRAVADO, semana a semana, com o ritmo que cada uma exige.
 *
 * Uma linha por SEMANA, e nao um numero fixo. E' o proprio programa que
 * justifica: nas 36 semanas de 2026 as furadeiras foram de 64.750 a
 * 134.586 pecas. Um valor cravado na media erra 66% na semana fraca, e
 * erra calado — por isso a variacao aparece ao lado da media.
 *
 * O PERIODO de cada semana e' a unica conferencia possivel contra a coluna
 * INICIO vir da celula errada na planilha: o PCP tem a planilha aberta ao
 * lado e ve' na hora se a 034-26 aqui diz 31/08 a 04/09 ou outra coisa.
 * Numero de semana ninguem confere de cabeca; data, sim.
 */
import { useMemo, useState } from 'react';
import {
  chaveSemana, comoPeriodo, periodosDoPrograma, resumoDaDemanda, ritmoExigido,
} from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

export default function ProgramaGravado({
  semanas, horasNum, maquinasDoGrupo, setupHoras, ocupado, aoApagarSemana, aoApagarTudo,
}) {
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  const resumo = useMemo(() => resumoDaDemanda(semanas || []), [semanas]);
  const periodos = useMemo(
    () => new Map(periodosDoPrograma(semanas || []).map((x) => [chaveSemana(x.semana), x])),
    [semanas],
  );

  async function apagarTudo() {
    const ok = await aoApagarTudo();
    if (ok) setConfirmarLimpeza(false);
  }

  return (
    <div style={est.bloco}>
      <div style={est.blocoTitulo}>Programa gravado</div>
      {resumo && (
        <p style={est.blocoTexto}>
          {resumo.n} semanas, de {resumo.primeira.chave} a {resumo.ultima.chave}.
          Média de <strong>{Math.round(resumo.media).toLocaleString('pt-BR')}</strong> peças,
          variação de <strong>{resumo.cvPct.toFixed(1)}%</strong> —
          da menor ({resumo.menor.chave}, {resumo.menor.pecas.toLocaleString('pt-BR')})
          para a maior ({resumo.maior.chave}, {resumo.maior.pecas.toLocaleString('pt-BR')})
          são {(resumo.maior.pecas / resumo.menor.pecas).toFixed(2)}x.
          {resumo.cvPct >= 10 && ' É essa variação que impede um takt fixo: o número tem de vir com a semana.'}
        </p>
      )}
      <div style={est.tabelaBox}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.th}>Semana</th>
              <th style={est.th} title="Os dias que essa semana do programa cobre na fábrica">
                Período
              </th>
              <th style={est.thNum}>Peças</th>
              <th style={est.thNum} title="Peças por hora que cada máquina do grupo precisa fazer">
                Exigido por máquina
              </th>
              <th style={est.thNum} title="Tempo que cada máquina tem para cada peça">Takt</th>
              <th style={est.th} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => {
              const r = ritmoExigido({
                pecas: s.pecas, horas: horasNum, maquinas: maquinasDoGrupo,
                setupHoras: setupHoras ?? 0,
              });
              return (
                <tr key={s.chave}>
                  <td style={est.td}>{s.chave}</td>
                  <td style={est.tdPeriodo}>
                    {comoPeriodo(periodos.get(s.chave)) || 'sem data'}
                  </td>
                  <td style={est.tdNum}>{s.pecas.toLocaleString('pt-BR')}</td>
                  <td style={est.tdNum}>
                    {r ? `${Math.round(r.pecasPorHoraMaquina).toLocaleString('pt-BR')} pç/h` : '—'}
                  </td>
                  <td style={est.tdNum}>{r ? `${(r.taktMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td style={est.tdAcoes}>
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aoApagarSemana(s)}
                    >
                      Apagar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!(horasNum > 0 && maquinasDoGrupo > 0) && (
        <p style={est.blocoAviso}>
          O ritmo exigido e o takt aparecem quando o grupo tiver horas por semana e
          pelo menos uma máquina ativa.
        </p>
      )}
      <div style={est.acoes}>
        {confirmarLimpeza ? (
          <>
            <span style={est.blocoTexto}>Apagar o programa inteiro deste grupo?</span>
            <button type="button" style={est.botaoPerigo} onClick={apagarTudo} disabled={ocupado}>
              Apagar tudo
            </button>
            <button type="button" style={est.botaoTexto} onClick={() => setConfirmarLimpeza(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" style={est.botaoTexto} onClick={() => setConfirmarLimpeza(true)}>
            Apagar o programa deste grupo
          </button>
        )}
      </div>
    </div>
  );
}
