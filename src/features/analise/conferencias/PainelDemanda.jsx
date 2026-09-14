import { est } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * O PROGRAMA DA SEMANA contra o que o grupo entrega.
 *
 * E' o quadro que faz o relatorio sair de "quanto o posto rende" para
 * "isso atende?" — a pergunta da reuniao de producao. Tudo o que ele
 * mostra vem pronto de leituraDaDemanda (dominio): a tela nao decide
 * semana, nao arredonda criterio e nao inventa jornada.
 *
 * DUAS DECISOES QUE O QUADRO EXPOE:
 *
 *  - O que decide e' o ritmo de RELOGIO (paradas dentro), nao o de maquina
 *    rodando. Comparar a demanda com o ritmo rodando dá um veredito
 *    otimista exatamente do tamanho da parada — e a peca que nao saiu
 *    porque a maquina estava parada tambem nao entrou no caminhao.
 *  - O numero que fecha a conversa e' QUANTAS MAQUINAS o programa pede ao
 *    ritmo medido, ao lado de quantas o grupo tem. "Falta 8% de ritmo" nao
 *    se decide; "precisa de 3,3 furadeiras e existem 3" se decide.
 *
 * Quando falta dado, o quadro NAO some: ele diz o que falta e oferece o
 * caminho. Sumir com o quadro esconde a funcao de quem nunca a configurou.
 */
export default function PainelDemanda({ leitura, grupoNome, aoConfigurar, aoTrocarSemana }) {
  const { estado, semana, semanas, demanda, veredito, intervalo, semanasMedidas } = leitura;

  /* ---- os tres caminhos em que ainda nao ha' o que comparar ---- */
  if (estado !== 'pronto') {
    return (
      <section style={est.chamadaDemanda} aria-label="Programa da semana">
        <div style={est.chamadaTexto}>
          <strong>{titulo(estado, semana)}</strong>{' '}
          {explicacao(estado, semana, demanda, grupoNome)}
        </div>
        <button type="button" style={est.botaoSecundario} onClick={aoConfigurar}>
          {estado === 'sem-horas' ? 'Informar as horas' : 'Configurar demanda'}
        </button>
      </section>
    );
  }

  const v = veredito;
  const atende = v.atende;
  const precisa = v.maquinasNecessarias;

  return (
    <section style={est.comparativo} aria-label="Programa da semana">
      <div style={est.comparativoTopo}>
        <div style={est.demandaTopoLinha}>
          <h2 style={est.comparativoTitulo}>
            O programa da semana {semana.chave}
            {grupoNome ? ` — ${grupoNome}` : ''}
          </h2>
          {semanas.length > 1 && (
            <label style={est.demandaSeletor}>
              <span style={est.comparativoRotulo}>Semana</span>
              <select
                style={est.demandaSelect}
                value={semana.chave}
                onChange={(ev) => aoTrocarSemana(ev.target.value)}
              >
                {[...semanas].reverse().map((s) => (
                  <option key={s.chave} value={s.chave}>{s.chave}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p style={est.comparativoDica}>
          {demanda.toLocaleString('pt-BR')} peças programadas
          {intervalo && (
            <> para a semana de {intervalo.inicio.toLocaleDateString('pt-BR')} a{' '}
              {intervalo.fim.toLocaleDateString('pt-BR')}</>
          )}
          , divididas entre <strong>{v.maquinas} máquina(s)</strong> do grupo com{' '}
          {Math.round(v.horasDisponiveis).toLocaleString('pt-BR')} horas-máquina na semana.
          {semanasMedidas > 1 && (
            <> As medições em tela cobrem <strong>{semanasMedidas} semanas</strong> — o ritmo
              é o médio do período observado, não só o desta semana.</>
          )}
        </p>
      </div>

      <div style={est.comparativoGrade}>
        <div style={est.comparativoCaixa}>
          <div style={est.comparativoRotulo}>Exigido por máquina</div>
          <div style={est.comparativoValor}>
            {Math.round(v.pecasPorHoraMaquina)}
            <span style={est.comparativoUnidade}>pç/h</span>
          </div>
          <div style={est.comparativoSub}>
            {porMinuto(v.pecasPorHoraMaquina)} pç/min · takt {(v.taktMs / 1000).toFixed(1)}s por peça
          </div>
          <div style={est.comparativoSub}>
            o ritmo que a demanda pede de cada máquina, hora de relógio
          </div>
        </div>

        <div style={est.comparativoCaixa}>
          <div style={est.comparativoRotulo}>Entregue no relógio</div>
          <div style={est.comparativoValor}>
            {Math.round(v.ritmoRelogio)}
            <span style={est.comparativoUnidade}>pç/h</span>
          </div>
          <div style={est.comparativoSub}>
            {porMinuto(v.ritmoRelogio)} pç/min · medido no período observado
          </div>
          <div style={est.comparativoSub}>
            {v.ritmoRodando && v.ritmoRodando > v.ritmoRelogio
              ? `${Math.round(v.ritmoRodando)} pç/h com a máquina rodando — a diferença é tempo parado`
              : 'sem parada marcada no período: é também o ritmo com a máquina rodando'}
          </div>
        </div>

        {/* O destaque so' e' CRITICO quando nao atende: pintar de vermelho
            um grupo que da' conta ensinaria a ignorar a cor. */}
        <div style={atende ? est.comparativoCaixa : est.comparativoCaixaDestaque}>
          <div style={atende ? est.comparativoRotulo : est.comparativoRotuloDestaque}>
            Máquinas necessárias
          </div>
          <div style={atende ? est.comparativoValor : est.comparativoValorDestaque}>
            {precisa.toFixed(1).replace('.', ',')}
            <span style={est.comparativoUnidade}>ao ritmo medido</span>
          </div>
          <div style={atende ? est.comparativoSub : est.comparativoSubDestaque}>
            o grupo tem {v.maquinas}
          </div>
          <div style={atende ? est.comparativoSub : est.comparativoSubDestaque}>
            {v.maquinasSeNaoParasse && v.maquinasSeNaoParasse < precisa
              ? `sem as paradas seriam ${v.maquinasSeNaoParasse.toFixed(1).replace('.', ',')}`
              : 'sem parada marcada para descontar'}
          </div>
        </div>
      </div>

      <p style={est.comparativoNota}>
        <strong>
          {atende
            ? '✓ O grupo atende o programa desta semana.'
            : '⚠ O grupo não atende o programa desta semana.'}
        </strong>{' '}
        {atende
          ? `Sobram ${Math.abs(v.folgaPct).toFixed(0)}% de ritmo sobre o exigido.`
          : `Falta ${Math.abs(v.folgaPct).toFixed(0)}% de ritmo em cada máquina.`}
        {!atende && v.maquinasSeNaoParasse && v.maquinasSeNaoParasse <= v.maquinas && (
          <>
            {' '}<strong>Antes de falar em máquina nova:</strong> ao ritmo com a máquina
            rodando o programa caberia nas {v.maquinas} que existem. O que falta é tempo
            parado, não capacidade — trate a parada primeiro.
          </>
        )}
        {!atende && v.maquinasSeNaoParasse && v.maquinasSeNaoParasse > v.maquinas && (
          <>
            {' '}Mesmo sem nenhuma parada o programa pediria{' '}
            {v.maquinasSeNaoParasse.toFixed(1).replace('.', ',')} máquinas: aqui falta
            capacidade de verdade, não só disponibilidade.
          </>
        )}
      </p>
    </section>
  );
}

const titulo = (estado, semana) => ({
  'sem-demanda': 'Programa de produção não cadastrado.',
  'sem-semana': `Sem programa para a semana ${semana?.chave ?? ''}.`,
  'sem-horas': 'Falta a jornada do grupo.',
}[estado] || '');

function explicacao(estado, semana, demanda, grupoNome) {
  if (estado === 'sem-demanda') {
    return `Sem a demanda${grupoNome ? ` de ${grupoNome}` : ''}, o relatório diz quanto o posto entrega, mas não se isso atende. O programa entra colando a planilha do PCP.`;
  }
  if (estado === 'sem-semana') {
    return 'As medições em tela são desta semana, e ela não está no programa cadastrado. Cole a semana que falta — ou escolha outra na tela de demanda.';
  }
  return `Há ${demanda?.toLocaleString('pt-BR') ?? ''} peças programadas para ${semana?.chave ?? 'a semana'}, mas o grupo não tem horas por semana informadas. Sem elas não há ritmo exigido: jornada é decisão de turno, e não presumo nenhuma.`;
}
