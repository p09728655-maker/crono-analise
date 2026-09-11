import { useState } from 'react';
import { formatarData } from './formato.js';

export default function TabelaEstudos({
  estudos, est, aoAbrir, aoEditar, aoRemover, aoTrocarColeta, aoImprimir,
}) {
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
          {/* Acoes: quatro botoes de novo, e por isso de volta a 320px.
              Em 240 o quarto quebrava para a linha de baixo e cada linha da
              tabela ficava com uma altura. O nome fica com o que sobra — ele
              corta com reticencias e tem o texto inteiro no title. */}
          <col style={{ width: 320 }} />
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
              {/* O NOME abre a analise. Continua sendo o caminho de quem
                  quer VER o estudo — o botao Imprimir, na ponta da linha,
                  e' o de quem quer o PAPEL.

                  Ja' houve um "Analisar" aqui, removido porque Proximas
                  acoes oferecia o mesmo destino. So' que oferecia apenas
                  para estudo CONCLUIDO: em andamento o cartao mostra
                  "Continuar medicao", e o estudo ficava sem nenhum botao
                  que levasse ao relatorio — era preciso adivinhar que o
                  nome era clicavel.

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
                {/* A FOLHA DE ANALISE em um clique: abre o painel com a
                    impressao ja' disparada. Fica em todas as linhas, medido
                    ou nao — botao que aparece e some conforme o estado e'
                    justamente o que fez a impressao virar adivinhacao. Quem
                    quer o Resumo Executivo o encontra no painel, ao lado. */}
                <button
                  type="button"
                  style={est.botaoLinha}
                  onClick={() => aoImprimir?.(e.id)}
                  title={`Imprimir a Folha de Análise de ${e.nome}`}
                >
                  Imprimir
                </button>
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

