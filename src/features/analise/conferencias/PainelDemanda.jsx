import { comoDia, comoPeriodo, periodosDoPrograma } from '../../../domain/demandaSemanal.js';
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
  const {
    estado, semana, semanas, demanda, veredito, intervalo, semanasMedidas, programa, medicao,
    casadoPorData, setup, conta, paradas, escolhaAutomatica,
  } = leitura;

  /* O periodo de cada semana cadastrada, para o seletor dizer de que dias
     fala cada opcao. Trinta e seis linhas: conta barata, feita a cada
     desenho em vez de guardada em estado que pode envelhecer. */
  const periodoDe = new Map(
    periodosDoPrograma(semanas || []).map((x) => [x.semana.chave, comoPeriodo(x)]),
  );

  /* ---- os caminhos em que ainda nao ha' o que comparar ---- */
  if (estado !== 'pronto') {
    return (
      <section style={est.chamadaDemanda} aria-label="Programa da semana">
        <div style={est.chamadaTexto}>
          <strong>{titulo(estado)}</strong>{' '}
          {explicacao(estado, semana, demanda, grupoNome, programa, medicao)}
        </div>
        {/* O SELETOR TAMBEM AQUI. A janela de cada semana e' de sete dias
            fixos, e um dia util perdido num feriado longo fica sem programa
            de proposito — atribuir a demanda da semana anterior seria errar
            calado. Mas o preco so' e' justo se houver saida na mesma tela:
            sem o seletor, "escolha outra semana" era um conselho sem onde. */}
        {estado === 'sem-semana' && semanas?.length > 0 && (
          <label style={est.demandaSeletor}>
            <span style={est.comparativoRotulo}>Comparar com</span>
            <select
              style={est.demandaSelect}
              value=""
              onChange={(ev) => ev.target.value && aoTrocarSemana(ev.target.value)}
            >
              <option value="">escolha a semana</option>
              {[...semanas].reverse().map((s) => (
                <option key={s.chave} value={s.chave}>
                  {s.chave}{periodoDe.get(s.chave) ? ` · ${periodoDe.get(s.chave)}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {/* Com vários grupos em tela não há o que configurar: o que falta é
            escolher a máquina, e o botão levaria para o lugar errado. */}
        {estado !== 'varios-grupos' && (
          <button type="button" style={est.botaoSecundario} onClick={aoConfigurar}>
            {estado === 'sem-horas' ? 'Informar as horas' : (estado === 'setup-excede' ? 'Corrigir o setup' : 'Configurar demanda')}
          </button>
        )}
      </section>
    );
  }

  const v = veredito;
  const atende = v.atende;
  const precisa = v.maquinasNecessarias;
  // O que as paradas marcadas dizem vem pronto do dominio ('nenhuma',
  // 'so-setup', 'outras'): decidir aqui por diferenca de taxa errava com
  // parada pequena e contradizia a nota do setup logo abaixo.
  const paradaAlemDoSetup = paradas === 'outras';
  const soSetupMarcado = paradas === 'so-setup';
  const setupMedidoTexto = setup?.medidoMs >= 60000
    ? `${Math.round(setup.medidoMs / 60000)} min`
    : 'menos de 1 min';

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
                /* EM BRANCO quando ninguem escolheu: o seletor passa a
                   MOSTRAR de onde veio a semana, alem de deixar troca-la. */
                value={escolhaAutomatica ? '' : semana.chave}
                onChange={(ev) => aoTrocarSemana(ev.target.value)}
              >
                {/**
                 * A VOLTA PARA O AUTOMATICO, que nao existia.
                 *
                 * Escolher uma semana na mao gravava a escolha ate' trocar
                 * de grupo: quem conferiu a semana passada ficava presa
                 * nela, e o relatorio seguia comparando a medicao de hoje
                 * com o programa de outra semana — sem nada na tela
                 * dizendo que a escolha era manual. O dominio ja' separava
                 * os dois casos (`escolhaAutomatica`); faltava a tela
                 * oferecer o caminho de volta.
                 *
                 * A opcao leva o que ela FAZ escrito. Uma linha vazia num
                 * seletor de PCP nao diz se apaga a comparacao ou se a
                 * devolve ao normal.
                 */}
                <option value="">Automática · pela data da medição</option>
                {/* O PERIODO dentro da opcao. E' aqui que o usuario troca a
                    comparacao, e o codigo da semana sozinho nao diz de que
                    dias a linha fala — que e' o problema que esta tela inteira
                    existe para resolver. */}
                {[...semanas].reverse().map((s) => (
                  <option key={s.chave} value={s.chave}>
                    {s.chave}{periodoDe.get(s.chave) ? ` · ${periodoDe.get(s.chave)}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p style={est.comparativoDica}>
          {demanda.toLocaleString('pt-BR')} peças programadas
          {/* O PERIODO, sempre. A semana da fabrica nao e' a do calendario
              (a 034-26 e' rotulada S37 e roda de 31/08 a 04/09), entao o
              codigo sozinho nao permite conferir nada — a data permite. */}
          {intervalo && (
            <> para {casadoPorData ? 'o período de' : 'a semana de'}{' '}
              {comoPeriodo(intervalo, { ano: true })}</>
          )}
          , divididas entre <strong>{v.maquinas} máquina(s)</strong> do grupo.
        </p>
      </div>

      {/* O VEREDITO ANTES DOS NUMEROS. "Isso atende?" e' a pergunta que
          trouxe a pessoa ao relatorio; ela estava respondida em legenda
          cinza DEPOIS dos tres cartoes, e o leitor tinha de atravessar
          474, 612 e 4,6 para chegar nela. Agora os numeros sao a
          evidencia do que a faixa ja' afirmou — que e' a ordem em que a
          reuniao acontece. */}
      <div style={{ ...est.veredito, ...(atende ? est.vereditoAtende : est.vereditoFalha) }}>
        <p style={est.vereditoManchete}>
          {atende
            ? '✓ O grupo atende o programa desta semana.'
            : '⚠ O grupo não atende o programa desta semana.'}
        </p>
        <p style={est.vereditoTexto}>
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
            {paradaAlemDoSetup
              ? `${Math.round(v.ritmoRodando)} pç/h com a máquina rodando — a diferença é tempo parado`
              : (soSetupMarcado
                ? 'a única parada marcada foi troca/setup, já contada no setup planejado'
                : 'sem parada marcada no período: é também o ritmo com a máquina rodando')}
          </div>
          {/* POR QUE ESTE NUMERO NAO E' O DO QUADRO DE BAIXO. Com setup
              medido descontado, este relogio fica um ou dois pc/h acima do
              "Saiu no período" — dois numeros quase iguais, com o mesmo
              pc/min, que parecem erro de conta a quem le'. A razao estava
              so' no paragrafo de procedencia, tres blocos abaixo: longe
              demais de quem esta' comparando os dois. */}
          {setup?.medidoMs > 0 && (
            <div style={est.comparativoSub}>
              já sem o setup medido ({setupMedidoTexto}), que o planejado acima cobre
            </div>
          )}
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
              : (soSetupMarcado ? 'o setup marcado já está no planejado' : 'sem parada marcada para descontar')}
          </div>
        </div>
      </div>

      {/* COMO A CONTA E' FEITA, depois dos numeros. A conta do tempo por
          extenso — jornada, setup, produtivas — e' o que permite conferir
          "264 − 50 = 214" de cabeca, e e' o setup que decide a semana de
          pico. Mas e' METODO: antes da grade, eram quatro linhas de prosa
          entre o titulo e o primeiro numero. */}
      <p style={est.comparativoNota}>
        {setup && conta
          ? (setup.zerado
            ? (
              <>
                O grupo tem <strong>{conta.texto.jornada} horas-máquina</strong> na semana — está
                cadastrado <strong>sem troca de peça</strong> (setup zero).
              </>
            )
            : (
              <>
                O grupo tem <strong>{conta.texto.produtivas} horas-máquina produtivas</strong> na
                semana ({conta.texto.jornada} h de jornada − {conta.texto.setup} h de setup:{' '}
                {setup.setupsDia} por dia × {setup.dias} dias × {setup.minutos} min por máquina).
              </>
            ))
          : <>O grupo tem {conta?.texto.jornada ?? Math.round(v.horasDisponiveis)} horas-máquina na semana.</>}
        {semanasMedidas > 1 && (
          <> As medições em tela cobrem <strong>{semanasMedidas} semanas</strong> — o ritmo
            é o médio do período observado, não só o desta semana.</>
        )}
      </p>

      {/* DE QUANDO É O PROGRAMA. A conta pode estar certa e o veredito
          errado do mesmo jeito, se a demanda for de três meses atrás — e
          número sem idade não levanta suspeita em ninguém. */}
      {programa?.n > 0 && (
        <p style={est.comparativoNota}>
          Programa colado
          {programa.atualizadoEm
            ? ` em ${programa.atualizadoEm.toLocaleDateString('pt-BR')}`
            : ''}
          : {programa.n} semanas, de {comoOPcpEscreve(programa.primeira)} a{' '}
          {comoOPcpEscreve(programa.ultima)}. O veredito vale para a demanda desse
          programa — se o PCP reprogramou depois, cole a planilha de novo.
          {/* CASADO POR NUMERO e' o caso pior, e ele precisa aparecer: a
              semana da fabrica desloca por feriado e o rotulo da planilha
              corre a frente do calendario, entao o numero acerta por
              sorte. Com a coluna INICIO colada, casa por data e nao erra. */}
          {/* SETUP NAO INFORMADO e' a ressalva que mais pesa: a troca de peca
              acontece entre medicoes e o cronometro nao pega; sem o planejado,
              o veredito e' otimista pelo setup da semana inteira. */}
          {!setup && (
            <> <strong>Setup não informado</strong>: as horas acima são jornada cheia. A troca de
              peça acontece entre uma medição e outra e o cronômetro não pega — cada hora de
              setup da semana torna este veredito otimista. Informe setups por dia e minutos
              por setup na tela de demanda.</>
          )}
          {setup?.medidoMs > 0 && (
            <> As medições marcaram {setupMedidoTexto} de troca/setup;
              esse tempo saiu do ritmo de relógio para não contar duas vezes com o setup
              planejado.</>
          )}
          {!casadoPorData && (
            <> <strong>Esta semana está cadastrada sem data de início</strong>: o período
              acima é o do calendário, não o da planilha, e sem data a medição casa pelo
              NÚMERO da semana — que erra quando a semana da fábrica desloca por feriado.
              Cole a planilha com a coluna INÍCIO.</>
          )}
        </p>
      )}
    </section>
  );
}

const titulo = (estado) => ({
  'varios-grupos': 'Escolha uma máquina para ver o programa da semana.',
  'sem-demanda': 'Programa de produção não cadastrado.',
  // Sem numero: com casamento por data, a semana que falta pode estar
  // cadastrada com OUTRO numero — e mandar procurar por ele engana.
  'sem-semana': 'Sem programa para o período desta medição.',
  'sem-horas': 'Falta a jornada do grupo.',
  'setup-excede': 'O setup cadastrado come a jornada inteira.',
  'sem-ritmo': 'Sem ritmo medido no período.',
}[estado] || '');

/** "de S02 a S39" — a semana como o PCP escreve, não como o app guarda. */
const comoOPcpEscreve = (s) => (s ? `S${String(s.numero).padStart(2, '0')}` : '');

function cobertura(programa) {
  if (!programa?.n) return '';
  const ate = ` Cadastradas: ${programa.n} semanas, de ${comoOPcpEscreve(programa.primeira)} a ${comoOPcpEscreve(programa.ultima)}.`;
  return ate;
}

function explicacao(estado, semana, demanda, grupoNome, programa, medicao) {
  if (estado === 'varios-grupos') {
    /**
     * O quadro SUMIA calado quando a tela misturava grupos, e quem nunca
     * viu ele funcionando nao tinha como saber que precisava filtrar. A
     * comparacao exige um grupo: a demanda e' dele, e "exigido por
     * máquina" misturando furadeira com embalagem nao é de ninguém.
     */
    return 'O programa é de um grupo de máquina, e a tela está mostrando mais de um. Escolha uma máquina em MÁQUINAS, na lateral, e o quadro aparece com o exigido, o entregue e quantas máquinas o programa pede.';
  }
  if (estado === 'sem-demanda') {
    return `Sem a demanda${grupoNome ? ` de ${grupoNome}` : ''}, o relatório diz quanto o posto entrega, mas não se isso atende. O programa entra colando a planilha do PCP.`;
  }
  if (estado === 'sem-semana') {
    /**
     * Com programa POR DATA a falta e' de um DIA, nao de um numero: dizer
     * "a semana 36 nao esta' cadastrada" manda o PCP procurar uma linha
     * que pode existir com outro numero. A data ele acha na planilha.
     */
    const quando = programa?.temData && medicao ? ` de ${comoDia(medicao, { ano: true })}` : '';
    return `A medição mais recente${quando} não cai em nenhuma semana do programa cadastrado.${cobertura(programa)} Escolha a semana a comparar aqui mesmo, ou cole a semana que falta em Demanda semanal.`;
  }
  if (estado === 'setup-excede') {
    // As horas ESTAO informadas: mandar informa-las apontaria uma correcao
    // que nao corrige. O erro e' no setup (200 min no lugar de 20, por
    // exemplo), e e' isso que a tela tem de dizer.
    return 'Setups por dia × dias × minutos por setup dá mais horas do que a jornada da máquina — não sobra tempo para produzir, o que é cadastro errado (um zero a mais nos minutos, por exemplo). Confira os números do setup na tela de demanda.';
  }
  if (estado === 'sem-ritmo') {
    const quanto = demanda?.toLocaleString('pt-BR') ?? '';
    // Sem medicao NENHUMA e' diferente de medicao que nao rende ritmo — e
    // dizer "as medicoes em tela" quando nao ha' nenhuma e' afirmar o que
    // a tela mostra que nao existe.
    return medicao
      ? `Há ${quanto} peças programadas e a jornada do grupo está informada, mas as medições em tela não dão ritmo nenhum para comparar. Sem ritmo medido não há veredito — e inventar um a partir do programa seria comparar a demanda com ela mesma.`
      : `Há ${quanto} peças programadas nesta semana, mas não há medição em tela para comparar. O veredito aparece quando houver conferência no período — sem medição, o número acima é só o programa.`;
  }
  return `Há ${demanda?.toLocaleString('pt-BR') ?? ''} peças programadas para ${semana?.chave ?? 'a semana'}, mas o grupo não tem horas por semana informadas. Sem elas não há ritmo exigido: jornada é decisão de turno, e não presumo nenhuma.`;
}
