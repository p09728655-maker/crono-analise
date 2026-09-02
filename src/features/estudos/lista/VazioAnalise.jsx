import { Simbolo } from './Elementos.jsx';

/**
 * O VAZIO no PC. Ha' espaco para o vazio APRESENTAR o sistema: o cartao
 * central chama para a acao e a faixa abaixo explica, em tres passos, o
 * que acontece depois de criar o estudo.
 *
 * A tela responde, em ordem: onde estou, o que faco agora, e qual e' o
 * caminho depois disso. A acao principal fica sozinha no cartao; os tres
 * pilares vem DEPOIS e numerados, como sequencia do estudo — nao como
 * tres botoes concorrentes.
 */
export default function VazioAnalise({ est, t, arquivados, aoCriar }) {
  return (
    <div style={est.vazioArea}>
      <div style={est.vazioCartao}>
        <Simbolo tipo="cronometro" cor={t.fraco} />
        <div style={est.vazioRotulo}>Estudo de Tempos</div>
        <h2 style={est.vazioTitulo}>Nenhum estudo cadastrado</h2>
        <p style={est.vazioTexto}>
          {arquivados > 0
            ? `Crie um estudo novo — ou abra "Estudos arquivados" no menu ao lado para restaurar um dos ${arquivados} que saíram da lista. Nenhum ciclo foi perdido.`
            : 'Crie um estudo novo para começar. Ele reúne as operações de um posto e os ciclos cronometrados nele.'}
        </p>
        <button type="button" style={est.botaoGrande} onClick={aoCriar}>
          + Novo estudo
        </button>
      </div>

      <div style={est.fluxoRotulo}>Depois de criar, o caminho é este</div>
      <div style={est.vazioFaixa}>
        {[
          { icone: 'cronometro', titulo: 'Coleta', texto: 'Cronometre os ciclos das operações.' },
          { icone: 'grafico', titulo: 'Análise', texto: 'Calcule o tempo padrão e a performance.' },
          { icone: 'pessoas', titulo: 'Capacidade', texto: 'Dimensione o posto e a produção.' },
        ].map((bloco, i) => (
          <div key={bloco.titulo} style={est.fluxoEtapa}>
            {/* A seta ANTES da etapa, nao depois: assim a ultima nao fica
                apontando para lugar nenhum. */}
            {i > 0 && <span style={est.fluxoSeta} aria-hidden="true">→</span>}
            <div style={est.vazioBloco}>
              <span style={est.fluxoNumero}>{i + 1}</span>
              <Simbolo tipo={bloco.icone} cor={t.vermelho} tamanho={26} />
              <div>
                <div style={est.vazioBlocoTitulo}>{bloco.titulo}</div>
                <div style={est.vazioBlocoTexto}>{bloco.texto}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
