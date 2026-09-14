import { Fragment } from 'react';
import {
  conferenciaRapida, faixaHoraria, formatarDuracao, somarParadas,
} from '../../../domain/cronoanalise.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * TODAS AS MEDICOES (ou as arquivadas), uma por linha, com as acoes de
 * cada uma: corrigir o nome da peca, marcar paradas, arquivar/restaurar,
 * excluir. E' a unica secao que continua na face das arquivadas.
 *
 * O cabecalho existe por causa do botao de LOTE: arquivar UMA maquina
 * inteira precisa ficar ao lado das linhas que vao sair, nao escondido
 * so' na lateral — o mesmo lugar do "Arquivar" de cada linha. O lote so'
 * existe com a maquina escolhida na lateral (ver loteDaMaquina).
 */
export default function TabelaMedicoes({
  linhas, escopo, filtro, verArquivadas, lote, ocupado,
  aoArquivarLote, aoRenomear, aoEditarParadas, aoAlternarArquivo, aoExcluir,
}) {
  /**
   * A frase do LOTE. Com um GRUPO escolhido ela nao pode ser "escolha uma
   * máquina em MÁQUINAS": o usuário acabou de escolher nessa mesma lateral,
   * e o título logo acima ja' diz o nome do que ele escolheu — as duas
   * frases ficam a 40px uma da outra. O lote e' por MAQUINA de propósito:
   * arquivar um grupo inteiro num clique nunca foi pedido.
   */
  let dicaLote;
  if (lote) {
    dicaLote = verArquivadas
      ? `${lote.ids.length} medição(ões) desta máquina — dá para restaurar todas de uma vez.`
      : `${lote.ids.length} medição(ões) desta máquina — dá para arquivar todas de uma vez.`;
  } else if (filtro) {
    dicaLote = 'Nenhuma medição desta máquina nesta lista.';
  } else if (escopo) {
    dicaLote = 'O lote é por máquina: escolha uma em MÁQUINAS, ao lado, para arquivar '
      + '(ou restaurar) todas as medições dela de uma vez.';
  } else {
    dicaLote = 'Escolha uma máquina em MÁQUINAS, ao lado, para arquivar (ou restaurar) '
      + 'todas as medições dela de uma vez.';
  }

  return (
    <section style={est.painel} aria-label={verArquivadas ? 'Medições arquivadas' : 'Todas as medições'}>
      <div style={est.painelTopo}>
        <div style={est.painelTopoTexto}>
          <h2 style={est.painelTitulo}>
            {verArquivadas ? 'Medições arquivadas' : 'Todas as medições'}
            {escopo ? ` · ${escopo.rotulo}` : ''}
          </h2>
          {/* De QUAL tempo saem os numeros. O celular mostra o peças/min
              do PERIODO (com as paradas dentro) e este relatorio mostra o
              de MAQUINA RODANDO: os dois estao certos, mas sem dizer isso
              pareciam contradicao. */}
          <p style={est.painelDica}>
            Peças/hora e peças/min saem do tempo com a MÁQUINA RODANDO — o tempo
            parado sai da conta. No celular, o número grande é a produção do período
            inteiro; o de máquina rodando fica na linha das paradas.
          </p>
          <p style={est.painelDica}>
            {dicaLote}
          </p>
        </div>
        {lote && (
          <button
            type="button"
            style={est.botaoLote}
            onClick={() => aoArquivarLote(lote)}
            disabled={ocupado === 'lote'}
          >
            {verArquivadas ? 'Restaurar esta máquina' : 'Arquivar esta máquina'}
          </button>
        )}
      </div>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Data</th>
            <th style={est.th}>Máquina</th>
            <th style={est.th}>Peça</th>
            <th style={est.th}>Horários</th>
            <th style={est.thNum}>Período</th>
            <th style={est.thNum}>Parado</th>
            <th style={est.thNum}>Rodando %</th>
            <th style={est.thNum}>Peças</th>
            <th style={est.thNum}>Peças/hora</th>
            <th style={est.thNum}>Peças/min</th>
            <th style={est.th} aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const calc = conferenciaRapida({
              duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
              ciclosPorPeca: c.ciclos_por_peca,
            });
            const par = somarParadas(c.paradas);
            const travada = ocupado === c.id;
            return (
              <Fragment key={c.id}>
              <tr>
                <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                <td style={est.tdCurto}>{c.maquina || '—'}</td>
                {/* O NOME DA PECA e' clicavel: e' texto digitado no aparelho,
                    e e' onde as grafias divergem. Corrigir onde o erro se ve'
                    e' mais curto do que caçar um botao de edicao no fim da
                    linha. */}
                <td style={est.tdCurto}>
                  <button
                    type="button"
                    style={est.botaoNome}
                    onClick={() => aoRenomear(c)}
                    disabled={travada}
                    title="Corrigir o nome da peça"
                  >
                    {c.peca || 'Sem nome'}
                  </button>
                  {/* Passante e' atributo da peca e muda a classe de
                      comparacao: precisa ser visivel na medicao, senao a
                      peca que "sumiu" da faixa dos 2 acionamentos e' um
                      misterio. */}
                  {c.furacao_passante && <span style={est.tagPassante}>passante</span>}
                </td>
                <td style={est.tdFraco}>
                  {faixaHoraria(c) || '—'}
                </td>
                <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={est.tdNum} title={par.porMotivo.map((m) => `${m.rotulo}: ${formatarDuracao(m.ms)}`).join(' · ')}>
                  {par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}
                </td>
                {/* Quanto do periodo a maquina passou produzindo — o mesmo
                    numero do cartao, medicao a medicao. */}
                <td style={est.tdNum} title="Quanto do período a máquina passou produzindo">
                  {calc ? `${Math.round(calc.disponibilidadePct)}%` : '—'}
                </td>
                <td style={est.tdNum}>{c.pecas}</td>
                <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                <td style={est.tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
                <td style={est.tdAcoes}>
                  <button
                    type="button"
                    style={est.botaoLinha}
                    onClick={() => aoEditarParadas(c)}
                    disabled={travada}
                    title="Marcar setup e outras paradas deste período"
                  >
                    {par.porMotivo.length ? `Paradas (${par.porMotivo.length})` : 'Paradas'}
                  </button>
                  <button
                    type="button"
                    style={est.botaoLinha}
                    onClick={() => aoAlternarArquivo(c)}
                    disabled={travada}
                    title={c.arquivada
                      ? 'Voltar para os cálculos'
                      : 'Tirar dos cálculos sem apagar (medição atípica)'}
                  >
                    {c.arquivada ? 'Restaurar' : 'Arquivar'}
                  </button>
                  <button
                    type="button"
                    style={est.botaoExcluir}
                    onClick={() => aoExcluir(c)}
                    disabled={travada}
                    aria-label={`Excluir medição de ${c.maquina || 'sem máquina'}`}
                    title="Excluir de vez (registro errado)"
                  >
                    ×
                  </button>
                </td>
              </tr>
              {/* A observacao escrita no aparelho, numa linha propria: e' o
                  contexto da medicao ("operador novo", "broca gasta"), e uma
                  12a coluna nao cabe. Fica embaixo, onde o olho ja' esta'. */}
              {c.observacao && (
                <tr>
                  <td style={est.tdObservacao} colSpan={11}>
                    <span style={est.rotuloObservacao}>Obs.</span>
                    {c.observacao}
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
