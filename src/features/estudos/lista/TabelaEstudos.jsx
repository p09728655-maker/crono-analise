import { useState } from 'react';
import { formatarData } from './formato.js';

export default function TabelaEstudos({ estudos, est, aoAbrir, aoEditar, aoRemover, aoTrocarColeta }) {
  const [sobre, setSobre] = useState(null);

  return (
    <div style={est.painel}>
      <table style={est.tabela}>
        {/* Cada produto e' uma tabela sua, e com largura automatica cada uma
            media as proprias colunas: "EMBALGEM" empurrava Recurso num grupo
            e "FUR16" encolhia no outro, e as colunas de dois grupos vizinhos
            nao se alinhavam. Com colgroup + table-layout fixo, a grade e' a
            mesma em toda a lista — o olho desce a coluna sem tropecar. */}
        <colgroup>
          {/* O nome do estudo fica com o que sobra: e' o unico texto que
              cresce de verdade, e as demais colunas tem tamanho conhecido. */}
          <col />
          <col style={{ width: 140 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 100 }} />
          <col style={{ width: 84 }} />
          <col style={{ width: 112 }} />
          {/* Acoes: eram quatro botoes em 320px. "Analisar" mudou-se para o
              proprio nome do estudo, na primeira coluna, e os tres que
              sobraram cabem com folga em 240 — a largura que sobra vai para
              o nome, que e' o texto que de fato cresce. */}
          <col style={{ width: 240 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={est.th}>Estudo</th>
            <th style={est.th}>Recurso</th>
            <th style={est.th}>Analista</th>
            <th style={est.thNum}>Operações</th>
            <th style={est.thNum}>Ciclos</th>
            <th style={est.th}>Atualizado</th>
            <th style={est.th} aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {estudos.map((e) => (
            <tr
              key={e.id}
              style={{ ...est.linha, ...(sobre === e.id ? est.linhaSobre : {}) }}
              onMouseEnter={() => setSobre(e.id)}
              onMouseLeave={() => setSobre(null)}
            >
              {/* O NOME e' o caminho para a analise — nao um botao a mais na
                  ponta da linha. O botao "Analisar" saiu daqui quando a area
                  de Proximas acoes passou a oferecer o mesmo destino logo
                  abaixo: eram dois alvos identicos para o mesmo estudo. Mas
                  a area so' mostra os primeiros; sem isto, todo estudo fora
                  dela ficaria sem porta de entrada.

                  title: com largura fixa o nome longo corta com reticencias,
                  e o texto inteiro tem de continuar alcancavel. */}
              <td style={est.tdNome}>
                <button
                  type="button"
                  style={{ ...est.linkNome, ...(sobre === e.id ? est.linkNomeSobre : {}) }}
                  onClick={() => aoAbrir?.(e.id)}
                  title={`Analisar ${e.nome}`}
                >
                  {e.nome}
                </button>
              </td>
              <td style={est.td} title={e.recurso || ''}>{e.recurso || '—'}</td>
              <td style={est.td} title={e.analista_nome || e.analista || ''}>{e.analista_nome || e.analista || '—'}</td>
              <td style={est.tdNum}>{e.total_operacoes}</td>
              <td style={est.tdNum}>{e.total_observacoes}</td>
              <td style={est.tdFraco}>{formatarData(e.atualizado_em)}</td>
              <td style={est.tdAcoes}>
                <span style={est.acoesLinha}>
                {/* Editar leva ao mesmo painel com a edicao ja aberta: nome
                    digitado errado tinha de ser descoberto la dentro. */}
                <button type="button" style={est.botaoLinha} onClick={() => aoEditar?.(e.id)}>
                  Editar
                </button>
                {/* Quem decide o que o TABLET ve e' o PC. Concluido some da
                    coleta; este botao e' o unico caminho de ida e volta. */}
                <button
                  type="button"
                  style={est.botaoLinha}
                  onClick={() => aoTrocarColeta?.(e)}
                  title={e.status === 'coletando'
                    ? 'O estudo some da lista do tablet e fica só na análise'
                    : 'O estudo volta à lista do tablet para coletar mais tempos'}
                >
                  {/* Texto curto de proposito: com "Enviar ao tablet" os quatro
                      botoes nao cabiam na linha e quebravam em duas, deixando
                      cada linha da tabela com altura diferente. O title diz o
                      resto, e o rotulo diz ONDE o estudo passa a viver. */}
                  {e.status === 'coletando' ? 'Só no PC' : 'Ao tablet'}
                </button>
                <button
                  type="button"
                  style={est.botaoRemover}
                  onClick={() => aoRemover?.(e)}
                  title={Number(e.total_observacoes) > 0 ? 'Arquivar estudo' : 'Excluir estudo'}
                  aria-label={`Remover ${e.nome}`}
                >
                  ×
                </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

