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
 *
 * `somenteLeitura`: o programa que vem da planilha do PCP (a embalagem) nao
 * se apaga aqui — a proxima leitura o traria de volta, e o botao mentiria.
 * So' a semana COLADA (sem `dias`) desse grupo tem Apagar: e' o caminho para
 * a semana da planilha que ficou de fora por ter o mesmo numero.
 *
 * DIAS: a semana da planilha traz os dias programados, e o exigido e o takt
 * dela usam as horas so' desses dias (fracaoDaSemana) — os mesmos numeros
 * do takt da medicao. A coluna so' aparece quando alguma semana os traz. Os
 * dias da jornada sao os DIGITADOS em Tempo disponivel, como as horas e o
 * setup: a tabela mostra o efeito do numero antes de salvar.
 */
import { useMemo, useState } from 'react';
import {
  chaveSemana, comoPeriodo, faixaDeSemanas, fracaoDaSemana, nomeDaSemana, periodosDoPrograma,
  resumoDaDemanda, ritmoExigido, rotuloDaSemana,
} from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

export default function ProgramaGravado({
  semanas, horasNum, maquinasDoGrupo, setupHoras, ocupado, aoApagarSemana, aoApagarTudo,
  somenteLeitura = false, diasDaJornada = null,
}) {
  const comDias = (semanas || []).some((s) => s.dias != null);
  const apagavel = (s) => !somenteLeitura || s.dias == null;
  const comAcoes = (semanas || []).some(apagavel);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  /* A variacao compara semanas INTEIRAS: a de Finados (4 dias) e a que o
     PCP ainda esta' programando (1 dia) nao sao semanas fracas, sao semanas
     pela metade — e "da menor para a maior sao 11x" mediria isso. A semana
     da planilha sem a jornada em dias nao se sabe se e' inteira: fica de fora. */
  const inteiras = useMemo(
    () => (semanas || []).filter((s) => fracaoDaSemana(s, diasDaJornada).fator === 1),
    [semanas, diasDaJornada],
  );
  const emParte = (semanas || []).length - inteiras.length;
  const resumo = useMemo(() => resumoDaDemanda(inteiras), [inteiras]);
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
          {resumo.n} {emParte > 0 ? 'semanas inteiras' : 'semanas'}, {faixaDeSemanas(resumo.primeira, resumo.ultima)}
          {emParte > 0 && ` (fora ${emParte} ${emParte === 1 ? 'programada' : 'programadas'} só em parte)`}.
          Média de <strong>{Math.round(resumo.media).toLocaleString('pt-BR')}</strong> peças,
          variação de <strong>{resumo.cvPct.toFixed(1)}%</strong> —
          da menor ({nomeDaSemana(resumo.menor)}, {resumo.menor.pecas.toLocaleString('pt-BR')})
          para a maior ({nomeDaSemana(resumo.maior)}, {resumo.maior.pecas.toLocaleString('pt-BR')})
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
              {comDias && (
                <th style={est.thNum} title="Dias com lote programado na semana: as horas do takt são as desses dias">
                  Dias
                </th>
              )}
              <th style={est.thNum} title="Peças por hora que cada máquina do grupo precisa fazer">
                Exigido por máquina
              </th>
              <th style={est.thNum} title="Tempo que cada máquina tem para cada peça">Takt</th>
              {comAcoes && <th style={est.th} aria-label="Ações" />}
            </tr>
          </thead>
          <tbody>
            {[...semanas].reverse().map((s) => {
              const fracao = fracaoDaSemana(s, diasDaJornada);
              // Semana da planilha sem a jornada em dias: sem exigido nem takt.
              const r = fracao.fator != null && ritmoExigido({
                pecas: s.pecas, horas: horasNum * fracao.fator, maquinas: maquinasDoGrupo,
                setupHoras: (setupHoras ?? 0) * fracao.fator,
              });
              return (
                <tr key={s.chave}>
                  <td style={est.td}>{rotuloDaSemana(s)}</td>
                  <td style={est.tdPeriodo}>
                    {comoPeriodo(periodos.get(s.chave)) || 'sem data'}
                  </td>
                  <td style={est.tdNum}>{s.pecas.toLocaleString('pt-BR')}</td>
                  {comDias && (
                    <td style={est.tdNum}>
                      {fracao.programados
                        ? `${fracao.programados}${fracao.daJornada ? ` de ${fracao.daJornada}` : ''}`
                        : '—'}
                    </td>
                  )}
                  <td style={est.tdNum}>
                    {r ? `${Math.round(r.pecasPorHoraMaquina).toLocaleString('pt-BR')} pç/h` : '—'}
                  </td>
                  <td style={est.tdNum}>{r ? `${(r.taktMs / 1000).toFixed(1)}s` : '—'}</td>
                  {comAcoes && (
                    <td style={est.tdAcoes}>
                      {apagavel(s) && (
                        <button
                          type="button" style={est.botaoTexto} disabled={ocupado}
                          onClick={() => aoApagarSemana(s)}
                        >
                          Apagar
                        </button>
                      )}
                    </td>
                  )}
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
      {comDias && !(Number(diasDaJornada) > 0) && (
        <p style={est.blocoAviso}>
          Nas semanas lidas da planilha, o takt também precisa dos dias de produção do
          grupo: é com eles que se sabe que parte da semana são os dias programados.
        </p>
      )}
      {!somenteLeitura && (
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
      )}
    </div>
  );
}
