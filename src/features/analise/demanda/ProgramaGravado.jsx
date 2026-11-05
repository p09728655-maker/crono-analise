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
 * `somenteLeitura`: a semana lida da planilha do PCP (a embalagem) nao se
 * apaga aqui — so' a planilha a muda, e o servidor recusa. So' a semana
 * COLADA (sem `dias`) desse grupo tem Apagar: e' o caminho para a semana da
 * planilha que ficou de fora por ter o mesmo numero. `apagarTudo` decide o
 * "Apagar o programa deste grupo" (fora com a leitura configurada e semana
 * lida: levaria a historia que a planilha nao regrava).
 *
 * DIAS: a semana da planilha traz os dias programados, e o exigido e o takt
 * dela usam as horas so' desses dias (fracaoDaSemana) — os mesmos numeros
 * do takt da medicao. A coluna so' aparece quando alguma semana os traz. Os
 * dias da jornada sao os DIGITADOS em Tempo disponivel, como as horas e o
 * setup: a tabela mostra o efeito do numero antes de salvar. A semana
 * DIGITADA tambem pode ter dias (v2.101.0: feriado), com o mesmo efeito.
 *
 * EDITAR (v2.101.0): a semana digitada ou colada tem "Editar", que a leva
 * ao formulario de Incluir uma semana com os valores gravados. A da
 * planilha nao: so' a planilha a muda.
 */
import { useMemo, useState } from 'react';
import {
  chaveSemana, comoPeriodo, faixaDeSemanas, fracaoDaSemana, nomeDaSemana, periodosDoPrograma,
  resumoDaDemanda, ritmoExigido, rotuloDaSemana,
} from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

export default function ProgramaGravado({
  semanas, horasNum, maquinasDoGrupo, setupHoras, ocupado, aoApagarSemana, aoApagarTudo,
  somenteLeitura = false, apagarTudo: podeApagarTudo = true, diasDaJornada = null,
  // A unidade do grupo (unidadeDoPosto): volumes na embalagem (v2.100.2).
  unidade = { singular: 'peça', plural: 'peças', abrev: 'pç' },
  // Leva a semana ao formulario (DemandaSemanal). Sem ele, sem o botao.
  aoEditar = null,
}) {
  // A coluna Dias: semana da planilha ou digitada com feriado (v2.101.0).
  const comDias = (semanas || []).some((s) => s.dias != null || s.diasProducao != null);
  const daPlanilha = (semanas || []).some((s) => s.dias != null);
  const editavel = (s) => Boolean(aoEditar) && !somenteLeitura && s.dias == null;
  const apagavel = (s) => !somenteLeitura || s.dias == null;
  const comAcoes = (semanas || []).some(apagavel);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);

  /* A variacao compara semanas INTEIRAS: a de Finados (4 dias) e a que o
     PCP ainda esta' programando (1 dia) nao sao semanas fracas, sao semanas
     pela metade — e "da menor para a maior sao 11x" mediria isso. A semana
     da planilha sem a jornada em dias nao se sabe se e' inteira: fica de
     fora tambem, e o texto diz por que (nao e' por ser "em parte"). */
  const { inteiras, emParte, semDias, semDiasDigitadas } = useMemo(() => {
    const fracoes = (semanas || []).map((s) => [s, fracaoDaSemana(s, diasDaJornada).fator]);
    return {
      inteiras: fracoes.filter(([, f]) => f === 1).map(([s]) => s),
      emParte: fracoes.filter(([, f]) => f != null && f < 1).length,
      // Sem os dias da jornada: a da planilha e a digitada com dias ficam de
      // fora pelo mesmo motivo, e o texto diz de qual se trata.
      semDias: fracoes.filter(([s, f]) => f == null && s.dias != null).length,
      semDiasDigitadas: fracoes.filter(([s, f]) => f == null && s.dias == null).length,
    };
  }, [semanas, diasDaJornada]);
  const resumo = useMemo(() => resumoDaDemanda(inteiras), [inteiras]);
  const deFora = [
    emParte > 0 && `${emParte} ${emParte === 1 ? 'programada' : 'programadas'} só em parte`,
    semDias > 0 && `${semDias} da planilha, que sem os dias de produção do grupo não se sabe se ${semDias === 1 ? 'é inteira' : 'são inteiras'}`,
    semDiasDigitadas > 0 && `${semDiasDigitadas} com dias de produção digitados, que sem os dias da jornada (em Tempo disponível) não se sabe que parte da semana ${semDiasDigitadas === 1 ? 'é' : 'são'}`,
  ].filter(Boolean);
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
      {/* Uma semana so' nao tem media nem variacao: "da menor para a maior
          sao 1,00x" seria conta sem assunto. */}
      {resumo?.n === 1 && (
        <p style={est.blocoTexto}>
          1 semana{deFora.length > 0 && ' inteira'}, a {nomeDaSemana(resumo.primeira)}, com{' '}
          {resumo.primeira.pecas.toLocaleString('pt-BR')} {unidade.plural}
          {deFora.length > 0 && ` (fora ${deFora.join(' e ')})`}.
        </p>
      )}
      {resumo?.n > 1 && (
        <p style={est.blocoTexto}>
          {resumo.n} semanas{deFora.length > 0 && ' inteiras'}, {faixaDeSemanas(resumo.primeira, resumo.ultima)}
          {deFora.length > 0 && ` (fora ${deFora.join(' e ')})`}.
          Média de <strong>{Math.round(resumo.media).toLocaleString('pt-BR')}</strong> {unidade.plural},
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
              <th style={est.thNum}>{unidade.plural.charAt(0).toUpperCase()}{unidade.plural.slice(1)}</th>
              {comDias && (
                <th style={est.thNum} title="Dias com lote programado na semana: as horas do takt são as desses dias">
                  Dias
                </th>
              )}
              <th style={est.thNum} title={`${unidade.plural.charAt(0).toUpperCase()}${unidade.plural.slice(1)} por hora que cada máquina do grupo precisa fazer`}>
                Exigido por máquina
              </th>
              <th style={est.thNum} title={`Tempo que cada máquina tem para cada ${unidade.singular}`}>Takt</th>
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
                    {r ? `${Math.round(r.pecasPorHoraMaquina).toLocaleString('pt-BR')} ${unidade.abrev}/h` : '—'}
                  </td>
                  <td style={est.tdNum}>{r ? `${(r.taktMs / 1000).toFixed(1)}s` : '—'}</td>
                  {comAcoes && (
                    <td style={est.tdAcoes}>
                      {editavel(s) && (
                        <button
                          type="button" style={est.botaoTexto} disabled={ocupado}
                          onClick={() => aoEditar(s)}
                        >
                          Editar
                        </button>
                      )}
                      {editavel(s) && apagavel(s) && ' · '}
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
          {daPlanilha
            ? 'Nas semanas lidas da planilha, o takt também precisa dos dias de produção do grupo: é com eles que se sabe que parte da semana são os dias programados.'
            : 'Nas semanas com dias de produção informados, o takt também precisa dos dias de produção do grupo (Tempo disponível): é com eles que se sabe que parte da semana esses dias são.'}
        </p>
      )}
      {podeApagarTudo && (
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
