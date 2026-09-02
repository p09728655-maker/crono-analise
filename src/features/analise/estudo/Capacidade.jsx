import { claro } from '../../../theme/tokensAnalise.js';
import { est } from './estilos.js';

/**
 * CAPACIDADE — o que o Takt exige contra o que o gargalo entrega.
 *
 * O painel ja' dizia quanto a linha produz. Faltava a outra metade da
 * pergunta: se isso basta. Sem os dois lado a lado, "222 pc/h" e' um numero
 * sem veredito — e a conta de cabeca ("quanto mesmo a demanda pede?")
 * acontecia fora da tela, que e' onde ela erra.
 */
export function CapacidadeEsperadoReal({ capacidade, gargalo, aoDefinirTakt }) {
  const { esperado, real, atingimentoPct, diferenca } = capacidade;
  const atinge = atingimentoPct !== null && atingimentoPct >= 100;

  return (
    <section style={est.blocoTabela} aria-label="Capacidade esperada e real">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Capacidade — esperado × real</h2>
        {esperado === null && (
          <button type="button" style={est.botaoSecundario} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        )}
      </div>

      <div style={est.gradeKpi}>
        <Kpi
          rotuloKpi="Esperado (Takt)"
          valor={esperado !== null ? String(esperado) : '—'}
          unidade={esperado !== null ? 'pç/h' : ''}
          nota={esperado !== null ? 'o que a demanda exige' : 'defina o Takt Time para comparar'}
          cor={esperado === null ? claro.atencao : claro.borda}
        />
        <Kpi
          rotuloKpi="Real (gargalo)"
          valor={String(real)}
          unidade="pç/h"
          nota={gargalo ? `limitada por ${gargalo.nome}` : 'sem ciclos coletados'}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Atingimento"
          valor={atingimentoPct !== null ? `${atingimentoPct.toFixed(0)}%` : '—'}
          nota={atingimentoPct !== null ? (atinge ? 'a linha entrega o ritmo' : 'abaixo do ritmo exigido') : '—'}
          cor={atingimentoPct === null ? claro.borda : (atinge ? claro.ok : claro.critico)}
        />
        <Kpi
          rotuloKpi={diferenca !== null && diferenca < 0 ? 'Déficit' : 'Superávit'}
          valor={diferenca !== null ? `${diferenca > 0 ? '+' : ''}${diferenca}` : '—'}
          unidade={diferenca !== null ? 'pç/h' : ''}
          nota={diferenca === null ? '—' : (diferenca < 0 ? 'faltam por hora para fechar o Takt' : 'sobram por hora sobre o Takt')}
          cor={diferenca === null ? claro.borda : (diferenca < 0 ? claro.critico : claro.ok)}
        />
      </div>
    </section>
  );
}

/**
 * Cartao de numero com barra de acento.
 *
 * A cor da barra NUNCA vai sozinha: cada cartao tem rotulo em cima e uma
 * nota em palavras embaixo dizendo o que aquele numero significa.
 */
export function Kpi({ rotuloKpi, valor, unidade, nota, cor }) {
  return (
    <div style={{ ...est.cartaoKpi, borderLeftColor: cor }}>
      <span style={est.kpiRotulo}>{rotuloKpi}</span>
      <div style={est.kpiLinha}>
        <span style={est.kpiValor}>{valor}</span>
        {unidade && <span style={est.kpiUnidade}>{unidade}</span>}
      </div>
      <span style={est.kpiNota}>{nota}</span>
    </div>
  );
}

