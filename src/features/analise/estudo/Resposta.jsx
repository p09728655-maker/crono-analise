import { formatarSegundos } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * O que o analista veio saber.
 *
 * Um estudo de tempos existe para responder duas perguntas: quanto a linha
 * produz por hora, e quantos operadores ela precisa. Tudo o mais — media,
 * CV, carta de controle — e' o caminho ate' essas duas respostas, nao a
 * resposta.
 *
 * A capacidade e' ditada pelo GARGALO, nao pela media das operacoes. Por
 * isso o gargalo aparece nomeado aqui em cima, e nao escondido numa celula.
 */
export default function Resposta({ analise }) {
  const { capacidadeLinha, gargalo, operadores, taktMs } = analise;
  const semDados = !gargalo;

  if (semDados) {
    return (
      <section style={est.resposta}>
        <p style={est.respostaVazia}>
          Ainda não há ciclos suficientes para calcular capacidade.
          Cronometre as operações para obter o resultado.
        </p>
      </section>
    );
  }

  const ocupacao = taktMs > 0 ? (gargalo.resultado.tpPorPeca / taktMs) * 100 : null;

  return (
    <section style={est.resposta} aria-label="Resultado do estudo">
      <div style={est.respostaBloco}>
        <span style={est.respostaRotulo}>Capacidade da linha</span>
        <div style={est.respostaNumeroLinha}>
          <span style={est.respostaNumero}>{capacidadeLinha}</span>
          <span style={est.respostaUnidade}>peças/hora</span>
        </div>
        <p style={est.respostaExplica}>
          Limitada por <strong>{gargalo.nome}</strong>, com{' '}
          {formatarSegundos(gargalo.resultado.tpPorPeca)} s por peça
          {gargalo.resultado.ciclosPorPeca > 1 && (
            <> ({formatarSegundos(gargalo.resultado.tpVal)} s × {gargalo.resultado.ciclosPorPeca} ciclos)</>
          )}.
          {ocupacao !== null && ocupacao > 100 && (
            <> Esta operação está <strong>{(ocupacao - 100).toFixed(0)}% acima do Takt</strong>.</>
          )}
        </p>
      </div>

      <div style={est.respostaDivisor} />

      <div style={est.respostaBloco}>
        <span style={est.respostaRotulo}>Operadores necessários</span>
        {operadores !== null ? (
          <>
            <div style={est.respostaNumeroLinha}>
              <span style={est.respostaNumero}>{Math.ceil(operadores)}</span>
              <span style={est.respostaUnidade}>operadores</span>
            </div>
            <p style={est.respostaExplica}>
              Cálculo exato: {operadores.toFixed(2)}. Arredondar para cima —
              meio operador não existe no chão de fábrica.
            </p>
          </>
        ) : (
          <p style={est.respostaExplica}>
            Informe o <strong>Takt Time</strong> em <em>Ajustes do estudo</em> para
            dimensionar a mão de obra e ver a linha de referência no Yamazumi.
          </p>
        )}
      </div>
    </section>
  );
}

