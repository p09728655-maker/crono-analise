import { Kpi } from './Capacidade.jsx';
import { claro } from '../../../theme/tokensAnalise.js';
import { PRIORIDADES, contarPorPrioridade } from '../../../domain/sugestoes.js';
import { est } from './estilos.js';

/**
 * SUGESTOES — o que fazer com os numeros.
 *
 * Cada item traz o diagnostico e A ACAO. Diagnostico sem acao vira numero
 * na parede; e' a acao que o supervisor consegue levar para o posto.
 *
 * Nenhuma sugestao manda coletar mais ciclos: a meta de amostra e' decisao
 * do analista, e o app declara a confiabilidade sem cobrar observacao.
 */
export default function PainelSugestoes({ sugestoes }) {
  const contagem = contarPorPrioridade(sugestoes);

  if (!sugestoes.length) {
    return (
      <section style={est.blocoTabela} aria-label="Sugestões de melhoria">
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Sugestões de melhoria</h2>
        </div>
        <p style={est.vazioParadas}>
          Nada a apontar nos números deste estudo: variação dentro da faixa boa,
          nenhuma parada registrada e nenhum posto acima do Takt. A lista aparece
          sozinha quando algum desses passar do limite.
        </p>
      </section>
    );
  }

  return (
    <section style={est.blocoTabela} aria-label="Sugestões de melhoria">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Sugestões de melhoria</h2>
        <span style={est.paradasResumo}>{sugestoes.length} no total</span>
      </div>

      <div style={est.gradeKpi}>
        {['alta', 'media', 'baixa'].map((nivel) => (
          <Kpi
            key={nivel}
            rotuloKpi={`Prioridade ${PRIORIDADES[nivel].rotulo.toLowerCase()}`}
            valor={String(contagem[nivel])}
            nota={PRIORIDADES[nivel].descricao}
            cor={{ alta: claro.critico, media: claro.atencao, baixa: claro.ok }[nivel]}
          />
        ))}
      </div>

      <div style={est.listaSugestoes}>
        {sugestoes.map((s) => (
          <div key={s.id} style={{ ...est.cartaoSugestao, borderLeftColor: { alta: claro.critico, media: claro.atencao, baixa: claro.ok }[s.prioridade] }}>
            <div style={est.sugestaoTopo}>
              <span style={{ ...est.selo, marginLeft: 0, background: { alta: claro.critico, media: claro.atencao, baixa: claro.ok }[s.prioridade] }}>
                {PRIORIDADES[s.prioridade].rotulo}
              </span>
              {s.operacao && <span style={est.sugestaoOperacao} title={s.operacao}>{s.operacao}</span>}
              <span style={est.sugestaoTitulo}>{s.titulo}</span>
            </div>
            <p style={est.sugestaoDiagnostico}>{s.diagnostico}</p>
            <p style={est.sugestaoAcao}><strong>Ação:</strong> {s.acao}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

