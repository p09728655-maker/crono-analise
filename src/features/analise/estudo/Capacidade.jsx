import { claro } from '../../../theme/tokensAnalise.js';
import { espaco } from '../../../theme/escala.js';
import { est } from './estilos.js';
import { lerMedido } from './textosMedicao.js';

const COR_DO_NIVEL = { neutro: claro.borda, atencao: claro.atencao };

/**
 * CAPACIDADE — os tres numeros por hora, cada um com o nome do que e'.
 *
 *   Exigido (takt)                o que a demanda pede;
 *   Capacidade pelo tempo padrao  o que o gargalo do estudo permite — e'
 *                                 conta, nao medicao (era o "Real", nome
 *                                 que fazia ler o estudo como se fosse o
 *                                 chao de fabrica);
 *   Medido na linha               o que o posto entregou, medido no
 *                                 tablet, no relogio (paradas dentro).
 *
 * O veredito (atingimento e deficit) vem embaixo e diz a BASE: o medido
 * quando ha' medicao suficiente na unidade do estudo, senao a capacidade
 * pelo tempo padrao, como sempre foi. Um 74% sem a base nao se le'.
 *
 * Com medido, o quanto a linha entrega do que o tempo padrao permite: a
 * distancia ate' 100% e' a perda que o estudo sozinho nao ve' — e' o numero
 * que diz ao PPCP se a conversa e' de metodo (tempo padrao) ou de chao
 * (parada, ritmo, espera).
 */
export function CapacidadeEsperadoReal({ capacidade, gargalo, medido, recurso, produto, aoDefinirTakt }) {
  const { esperado, real, atingimentoPct, diferenca, base, pctDaCapacidade } = capacidade;
  const atinge = atingimentoPct !== null && atingimentoPct >= 100;
  const leitura = lerMedido(medido, { recurso, produto });
  const daBase = base === 'medido' ? 'base: medido na linha' : 'base: capacidade pelo tempo padrão';

  return (
    <section style={est.blocoTabela} aria-label="Capacidade: exigido, tempo padrão e medido">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Capacidade — exigido × tempo padrão × medido</h2>
        {esperado === null && (
          <button type="button" style={est.botaoSecundario} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        )}
      </div>

      <div style={est.gradeKpi}>
        <Kpi
          rotuloKpi="Exigido (takt)"
          valor={esperado !== null ? String(esperado) : '—'}
          unidade={esperado !== null ? 'pç/h' : ''}
          nota={esperado !== null ? 'o que a demanda exige' : 'defina o Takt Time para comparar'}
          cor={esperado === null ? claro.atencao : claro.borda}
        />
        <Kpi
          rotuloKpi="Capacidade pelo tempo padrão"
          valor={String(real)}
          unidade="pç/h"
          nota={gargalo ? `limitada por ${gargalo.nome}` : 'sem ciclos coletados'}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Medido na linha"
          valor={leitura.valor}
          unidade={leitura.unidade}
          nota={leitura.linhas.map((l) => <span key={l} style={estLocal.linhaNota}>{l}</span>)}
          cor={COR_DO_NIVEL[leitura.nivel] || claro.borda}
        />
      </div>

      {/* O veredito numa segunda fileira: os numeros em cima, a leitura
          embaixo. Numa grade so', o quinto cartao caia sozinho na linha de
          baixo no laptop, e nada dizia que o atingimento e' de um deles. */}
      <div style={estLocal.gradeVeredito}>
        <Kpi
          rotuloKpi="Atingimento"
          valor={atingimentoPct !== null ? `${atingimentoPct.toFixed(0)}%` : '—'}
          nota={atingimentoPct !== null
            ? `${atinge ? 'a linha entrega o ritmo' : 'abaixo do ritmo exigido'} · ${daBase}`
            : '—'}
          cor={atingimentoPct === null ? claro.borda : (atinge ? claro.ok : claro.critico)}
        />
        <Kpi
          rotuloKpi={diferenca !== null && diferenca < 0 ? 'Déficit' : 'Superávit'}
          valor={diferenca !== null ? `${diferenca > 0 ? '+' : ''}${diferenca}` : '—'}
          unidade={diferenca !== null ? 'pç/h' : ''}
          nota={diferenca === null
            ? '—'
            : `${diferenca < 0 ? 'faltam por hora para fechar o Takt' : 'sobram por hora sobre o Takt'} · ${daBase}`}
          cor={diferenca === null ? claro.borda : (diferenca < 0 ? claro.critico : claro.ok)}
        />
        {pctDaCapacidade !== null && (
          <Kpi
            rotuloKpi="Do tempo padrão"
            valor={`${pctDaCapacidade.toFixed(0)}%`}
            nota={`a linha entrega ${pctDaCapacidade.toFixed(0)}% do que o tempo padrão permite`}
            cor={claro.borda}
          />
        )}
      </div>
    </section>
  );
}

/* So' o que este quadro acrescenta ao est do estudo. */
const estLocal = {
  // A mesma grade, colada na de cima: o respiro de cima ja' veio dela.
  gradeVeredito: { ...est.gradeKpi, padding: `0 ${espaco.xl}px ${espaco.lg}px` },
  // Cada informacao da nota numa linha propria: e' lista, nao frase.
  linhaNota: { display: 'block' },
};

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
