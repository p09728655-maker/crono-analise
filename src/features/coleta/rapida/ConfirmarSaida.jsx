import { est } from './estilos.js';

/**
 * A PERGUNTA ANTES DE PERDER A MEDICAO — o Voltar do tablet, a seta do topo
 * ou o Sair do resultado, com medicao que ainda nao foi salva (ver
 * useGuardaDaMedicao).
 *
 * Continuar e' o botao grande, em cima: quem chegou aqui quase sempre foi o
 * dedo na borda da tela, e a resposta certa para esse caso tem de ser a mais
 * facil de acertar de luva. Sair diz o preco — descartar — no proprio botao.
 */
export default function ConfirmarSaida({ aberta, cronometrando, aoContinuar, aoSair }) {
  if (!aberta) return null;
  return (
    <div style={{ ...est.folhaMotivos, ...est.folhaSaida }} role="dialog" aria-label="Sair da medição">
      <div style={est.folhaCaixa}>
        <div style={est.folhaTitulo}>Sair da medição?</div>
        <div style={est.folhaTempoParada}>
          {cronometrando
            ? 'O cronômetro está rodando. Saindo agora, esta medição se perde — nada fica salvo.'
            : 'Esta medição ainda não foi salva. Saindo agora, ela se perde.'}
        </div>
        <button type="button" style={est.botaoContinuarMedindo} onClick={aoContinuar}>
          {cronometrando ? 'CONTINUAR MEDINDO' : 'FICAR NO RESULTADO'}
        </button>
        <button type="button" style={est.botaoOutraPeca} onClick={aoSair}>
          Sair e descartar
        </button>
      </div>
    </div>
  );
}
