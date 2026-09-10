import { GraficoTendencia } from '../graficos.jsx';
import { MIN_CICLOS_TENDENCIA } from '../../../domain/tendenciaColeta.js';
import { est } from './estilos.js';

/**
 * TENDENCIA — a ordem dos ciclos, que a media apaga.
 *
 * O TO e' a media da coleta inteira. Se o operador comecou devagar e
 * acelerou (aprendizado), ou comecou bem e foi cansando (fadiga), a media
 * representa um ritmo que nao existiu em momento nenhum — e o tempo padrao
 * herda o erro. As sugestoes ja' avisavam em texto; aqui esta' a curva.
 *
 * Um quadro por operacao. A leitura em palavras vem do dominio
 * (lerTendencia): a tela e a folha A4 dizem as mesmas frases sobre os
 * mesmos ciclos.
 */
export default function PainelTendencia({ operacoes }) {
  const comDados = (operacoes || []).filter((o) => o.resultado);
  const curtas = comDados.filter((o) => o.resultado.n < MIN_CICLOS_TENDENCIA).length;

  return (
    <section style={est.blocoTabela} aria-label="Tendência ao longo da coleta">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Tendência ao longo da coleta</h2>
        <span style={est.paradasResumo}>
          {comDados.length} operação(ões)
          {curtas ? ` · ${curtas} com menos de ${MIN_CICLOS_TENDENCIA} ciclos` : ''}
        </span>
      </div>

      <p style={est.vazioParadas}>
        O tempo padrão é a <strong>média</strong> da coleta. Se os ciclos subiram do começo para o
        fim, houve fadiga, ferramenta gastando ou abastecimento piorando; se caíram, o operador
        ainda estava pegando o ritmo e a média sai inflada. Nos dois casos a reta mostra
        <strong> onde</strong> o ritmo mudou — coisa que a média esconde.
      </p>

      <div style={est.corpoTendencia}>
        <GraficoTendencia operacoes={comDados} altura={170} />
      </div>
    </section>
  );
}
