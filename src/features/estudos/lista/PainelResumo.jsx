import { situacao } from '../../../domain/proximasAcoes.js';

/**
 * Painel de informacao ao lado da tabela.
 *
 * O espaco a direita estava vazio numa tela de 1440px. Em vez de esticar a
 * tabela — linha comprida demais e' pior de ler — ele responde o que o
 * analista pergunta antes de abrir estudo nenhum: quanto ja' foi medido e
 * em quais postos.
 *
 * O painel CONTA as pendencias; quem as NOMEIA e' a area de Proximas acoes,
 * abaixo da tabela, onde cada uma vem com o botao que a resolve. Enquanto os
 * dois listavam os mesmos estudos, a tela dizia duas vezes a mesma coisa —
 * e com cortes diferentes ("5 e mais 4" de um lado, "4 e mais 5" do outro).
 *
 * Tudo sai dos estudos ja' carregados: nenhuma requisicao a mais.
 */
export default function PainelResumo({ estudos, est }) {
  const totalCiclos = estudos.reduce((acc, e) => acc + (Number(e.total_observacoes) || 0), 0);
  const totalOperacoes = estudos.reduce((acc, e) => acc + (Number(e.total_operacoes) || 0), 0);
  // Mesma regra das Proximas acoes, num lugar so': o que manda e' o CICLO.
  // Estudo sem nenhum e' pendencia mesmo marcado 'concluido' — esse status
  // diz que ele saiu do tablet, nao que a medicao aconteceu.
  const pendencias = estudos.filter((e) => situacao(e) === 'pendente').length;

  // Postos ordenados por ciclos: onde a medicao realmente aconteceu.
  const porPosto = new Map();
  for (const e of estudos) {
    const chave = String(e.recurso || '').trim() || 'Sem posto';
    porPosto.set(chave, (porPosto.get(chave) || 0) + (Number(e.total_observacoes) || 0));
  }
  const postos = [...porPosto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const maior = estudos.reduce(
    (melhor, e) => (Number(e.total_observacoes) > Number(melhor?.total_observacoes ?? -1) ? e : melhor),
    null,
  );

  return (
    <aside style={est.painelInfo} aria-label="Visão geral">
      <div style={est.painelBloco}>
        <div style={est.painelRotulo}>Visão geral</div>
        {/* Quatro numeros em 2x2, nao tres numa fila: o quarto e' o unico que
            pede acao, e espremer quatro colunas em 280px deixaria cada valor
            menor que o rotulo embaixo dele. A pendencia so' ganha cor quando
            existe — "0" colorido treinaria o olho a ignorar a cor. */}
        <div style={est.painelNumeros}>
          {[
            ['Estudos', estudos.length, false],
            ['Ciclos', totalCiclos, false],
            ['Operações', totalOperacoes, false],
            ['Pendências', pendencias, pendencias > 0],
          ].map(([k, v, alerta]) => (
            <div key={k} style={est.painelNumero}>
              <span style={alerta ? est.painelValorAtencao : est.painelValor}>{v}</span>
              <span style={est.painelChave}>{k}</span>
            </div>
          ))}
        </div>
      </div>

      {postos.length > 0 && (
        <div style={est.painelBloco}>
          <div style={est.painelRotulo}>Ciclos por posto</div>
          {postos.map(([posto, n]) => (
            <div key={posto} style={est.painelLinha}>
              <span style={est.painelLinhaTexto}>{posto}</span>
              <span style={est.painelLinhaNum}>{n}</span>
            </div>
          ))}
        </div>
      )}

      {maior && Number(maior.total_observacoes) > 0 && (
        <div style={est.painelBloco}>
          <div style={est.painelRotulo}>Mais medido</div>
          <div style={est.painelDestaque}>{maior.nome}</div>
          <div style={est.painelNota}>
            {maior.total_observacoes} ciclo(s){maior.recurso ? ` · ${maior.recurso}` : ''}
          </div>
        </div>
      )}

    </aside>
  );
}

