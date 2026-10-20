import { claro } from '../../../theme/tokensAnalise.js';
import { formatarSegundos } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';
import {
  diferencaExibida, exibirDiferenca, exibirPct, exibirPorHora, lerMedido, porHora, porUnidade, vereditoCapacidade,
} from './textosMedicao.js';

const COR_DO_NIVEL = { neutro: claro.borda, atencao: claro.atencao };
const COR_DO_TOM = { neutro: claro.borda, ok: claro.ok, atencao: claro.atencao, critico: claro.critico };

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
 * pelo tempo padrao — e ai' o cartao diz que a linha ATENDERIA, e que a
 * medicao ainda nao confirma, com o porque. Um 74% sem a base nao se le'.
 *
 * O terceiro da fileira de baixo e' o quanto a linha entrega do que o tempo
 * padrao permite: a distancia ate' 100% e' a perda que o estudo sozinho
 * nao ve' — o numero que diz ao PPCP se a conversa e' de metodo (tempo
 * padrao) ou de chao (parada, ritmo, espera). Sem medido ele fica no
 * lugar, vazio e dizendo o que falta: assim a grade e' sempre 3 + 3.
 *
 * Na embalagem o estudo mede o PRODUTO: todo numero por hora diz
 * "produtos/h" (`medido.unidadeEstudo`).
 */
export function CapacidadeEsperadoReal({
  capacidade, gargalo, medido, recurso, produto, taktMs, aoDefinirTakt,
}) {
  const { esperado, real, atingimentoPct, diferenca, base, pctDaCapacidade } = capacidade;
  const unidade = medido?.unidadeEstudo || 'peça';
  const u = porHora(unidade);
  const leitura = lerMedido(medido, { recurso, produto });
  const veredito = vereditoCapacidade(capacidade, leitura);
  const daBase = base === 'medido' ? 'base: medido na linha' : 'base: capacidade pelo tempo padrão';

  return (
    <section style={est.blocoTabela} aria-label="Capacidade: exigido, tempo padrão e medido">
      {/* Tres colunas iguais do laptop ao monitor largo: o auto-fit quebrava
          em 2 + 1 em 1024 px e deixava um cartao sozinho na linha de baixo.
          No celular, um embaixo do outro. */}
      <style>{'@media (max-width: 900px) { .grade-capacidade { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Capacidade — exigido × tempo padrão × medido</h2>
        {esperado === null && (
          <button type="button" style={est.botaoSecundario} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        )}
      </div>

      <div className="grade-capacidade" style={estLocal.grade}>
        <Kpi
          rotuloKpi="Exigido (takt)"
          valor={exibirPorHora(esperado)}
          unidade={esperado !== null ? u : ''}
          nota={esperado !== null
            ? `o que a demanda exige · takt de ${formatarSegundos(taktMs)} s ${porUnidade(unidade)}`
            : 'defina o Takt Time para comparar'}
          cor={esperado === null ? claro.atencao : claro.borda}
        />
        <Kpi
          rotuloKpi="Capacidade pelo tempo padrão"
          valor={exibirPorHora(real)}
          unidade={u}
          nota={gargalo ? `limitada por ${gargalo.nome}` : 'sem ciclos coletados'}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Medido na linha"
          valor={leitura.valor}
          unidade={leitura.unidade}
          nota={leitura.linhas.map((l) => <span key={l} style={estLocal.linhaNota}>{l}</span>)}
          cor={COR_DO_NIVEL[leitura.nivel] || claro.borda}
          acao={leitura.erro && medido?.recarregar ? (
            <button type="button" style={estLocal.botaoTentar} onClick={medido.recarregar}>
              Tentar de novo
            </button>
          ) : null}
        />

        {/* O veredito na fileira de baixo: os numeros em cima, a leitura
            embaixo, e cada leitura diz de qual numero saiu. */}
        <Kpi
          rotuloKpi="Atingimento"
          valor={exibirPct(atingimentoPct)}
          nota={veredito.nota}
          cor={COR_DO_TOM[veredito.tom] || claro.borda}
        />
        <Kpi
          rotuloKpi={diferenca !== null && diferenca < 0 ? 'Déficit' : 'Superávit'}
          valor={exibirDiferenca(diferencaExibida(capacidade))}
          unidade={diferenca !== null ? u : ''}
          nota={diferenca === null
            ? '—'
            : `${diferenca < 0 ? 'faltam por hora para fechar o Takt' : 'sobram por hora sobre o Takt'} · ${daBase}`}
          // Superavit pela capacidade do tempo padrao ainda nao foi confirmado
          // na linha: atencao, como o cartao do atingimento — verde so' medido.
          cor={diferenca === null ? claro.borda
            : (diferenca < 0 ? claro.critico : (base === 'medido' ? claro.ok : claro.atencao))}
        />
        <Kpi
          rotuloKpi="Do tempo padrão"
          valor={exibirPct(pctDaCapacidade)}
          nota={pctDaCapacidade !== null
            ? `a linha entrega ${exibirPct(pctDaCapacidade)} do que o tempo padrão permite`
            // O porque ja' esta' no cartao do medido e no do atingimento:
            // repetir pela terceira vez so' alongava o quadro.
            : (gargalo ? 'aparece com o medido na linha: é a perda entre o tempo padrão e o chão' : 'sem ciclos coletados')}
          cor={claro.borda}
        />
      </div>
    </section>
  );
}

/* So' o que este quadro acrescenta ao est do estudo. */
const estLocal = {
  // A grade de cartoes do estudo, com as colunas fixas em tres.
  grade: { ...est.gradeKpi, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  // Cada informacao da nota numa linha propria: e' lista, nao frase.
  linhaNota: { display: 'block' },
  botaoTentar: { ...est.botaoSecundario, alignSelf: 'flex-start', marginTop: 6 },
};

/**
 * Cartao de numero com barra de acento.
 *
 * A cor da barra NUNCA vai sozinha: cada cartao tem rotulo em cima e uma
 * nota em palavras embaixo dizendo o que aquele numero significa.
 */
export function Kpi({ rotuloKpi, valor, unidade, nota, cor, acao = null }) {
  return (
    <div style={{ ...est.cartaoKpi, borderLeftColor: cor }}>
      <span style={est.kpiRotulo}>{rotuloKpi}</span>
      <div style={est.kpiLinha}>
        <span style={est.kpiValor}>{valor}</span>
        {unidade && <span style={est.kpiUnidade}>{unidade}</span>}
      </div>
      <span style={est.kpiNota}>{nota}</span>
      {acao}
    </div>
  );
}
