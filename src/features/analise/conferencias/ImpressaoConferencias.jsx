import { Fragment } from 'react';
import {
  comparativoDeParadas, conferenciaRapida, faixaHoraria, formatarDuracao, ritmoPorHoraDoDia,
  somarParadas,
} from '../../../domain/cronoanalise.js';
import { comoPeriodo } from '../../../domain/demandaSemanal.js';
import { constanciaTexto, lerGrupo } from '../../../domain/comparativoMaquinas.js';
import { lerClasse } from '../../../domain/ritmoPorCiclo.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { GraficoTendenciaPeriodo } from '../graficos.jsx';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { imp } from './estilos.js';
import { porMinuto, porPeca } from './formato.js';

/**
 * FOLHA DO RITMO POR MAQUINA — A4 retrato, modelo basico.
 *
 * Nao e' a tela no papel — a tela tem filtro, botao e cor de interface; o
 * papel tem contexto e responsavel. Recebe os dados JA' FILTRADOS pela
 * lateral, e o `escopo` diz o que a lateral escolheu: com uma maquina, sai
 * a folha daquela maquina; com um GRUPO, a folha das maquinas dele — nos
 * dois casos com o nome no titulo e na identificacao, porque folha que
 * circula na reuniao sem dizer de quem e' vira discussao sobre o dado.
 *
 * Sem jargao (decisao de 31/08): nada de CV%, ciclo do motor ou criterio
 * de amostra carimbado. Os numeros sao pecas/hora e pecas/minuto; maquina
 * medida ha' pouco tempo leva uma NOTA em texto corrido, nao um selo.
 */
export default function ImpressaoConferencias({
  linhas, resumo, resumoPecas, grupoDe, escopo, analise, entreMaquinas, porCiclo,
  demanda, grupoNome,
}) {
  // Grupos cobertos pelo periodo, na ordem dos codigos — vao na identificacao.
  const gruposCobertos = [...new Set(resumo.map((g) => grupoDe?.(g.maquina)).filter(Boolean))].sort();
  const hoje = new Date().toLocaleDateString('pt-BR');
  const emMedicao = resumo.filter((g) => !g.confiavel);

  const datas = linhas.map((c) => new Date(c.salvo_em)).filter((d) => !Number.isNaN(d.getTime()));
  const periodo = datas.length
    ? `${new Date(Math.min(...datas)).toLocaleDateString('pt-BR')} a ${new Date(Math.max(...datas)).toLocaleDateString('pt-BR')}`
    : '—';
  const totalPecas = resumo.reduce((acc, g) => acc + g.totalPecas, 0);
  const totalMs = resumo.reduce((acc, g) => acc + g.totalMs, 0);
  const totalProdutivoMs = resumo.reduce((acc, g) => acc + g.totalProdutivoMs, 0);
  const totalParadaMs = resumo.reduce((acc, g) => acc + g.totalParadaMs, 0);
  const totalSetupMs = resumo.reduce((acc, g) => acc + g.totalSetupMs, 0);
  const ritmoGeral = totalProdutivoMs > 0 ? (totalPecas * 3600000) / totalProdutivoMs : null;
  // O mesmo comparativo da tela — o papel e' o que vai para a reuniao, e e'
  // la' que a pergunta "quanto isso custou?" e' feita.
  const comparativo = comparativoDeParadas(resumo);
  // A curva do dia no papel e' TABELA, nao grafico: a hora com o numero ao
  // lado le-se melhor impressa, e sao poucas linhas. (A folha tem UMA
  // imagem, a tendencia no tempo — la' a forma da linha e' a informacao.)
  // So' com UMA maquina, pelo mesmo motivo da tela: misturando postos, a
  // hora fraca seria a hora da maquina mais lenta, nao uma hora fraca.
  const curvaDoDia = resumo.length === 1 ? ritmoPorHoraDoDia(linhas) : [];
  /* Quadro "Ritmo por peça": a regua por acionamento so' diz algo quando
     alguma peca pede mais de um — a mesma regra da tela. */
  const temPorAcion = resumoPecas.some((g) => g.ciclosPorPeca > 1);

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Ritmo por Máquina{escopo ? ` — ${escopo.rotulo}` : ''}</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          /* Com o GRUPO escolhido, a folha diz o grupo E quantas maquinas
             dele entraram: "0002 · FURADEIRA" sozinho nao permite conferir
             se a maquina que faltou foi filtrada ou simplesmente nao foi
             medida no periodo. */
          escopo?.tipo === 'maquina'
            ? ['Máquina', escopo.rotulo]
            : ['Máquinas', String(resumo.length)],
          ['Grupos de máquina', gruposCobertos.length ? gruposCobertos.join(' · ') : '—'],
          ['Período coberto', periodo],
          ['Medições', String(linhas.length)],
          ['Total de peças', String(totalPecas)],
          ['Tempo rodando', formatarDuracao(totalProdutivoMs)],
          ['Tempo parado', totalParadaMs > 0
            ? `${formatarDuracao(totalParadaMs)}${totalSetupMs > 0 ? ` (troca/setup ${formatarDuracao(totalSetupMs)})` : ''}`
            : 'Nenhuma parada marcada'],
          ['Máquina rodando', totalMs > 0
            ? `${Math.round((totalProdutivoMs / totalMs) * 100)}% do período observado`
            : '—'],
          ['Ritmo médio', ritmoGeral != null
            ? `${Math.round(ritmoGeral)} pç/h · ${porMinuto(ritmoGeral)} pç/min`
            : '—'],
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={imp.campoRotulo}>{k}</span>
            <span style={imp.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {/* O PROGRAMA DA SEMANA no papel, antes de tudo: o documento circula
          na reuniao, e a primeira pergunta e' se atende. So' sai quando ha'
          veredito — quadro de "falta configurar" e' conversa de tela, nao
          de folha impressa. */}
      {demanda?.estado === 'pronto' && demanda.veredito && (
        <section style={imp.comparativo}>
          {/* O PERIODO no papel, nao so' o codigo. E' a folha que vai para a
              reuniao, e o codigo da semana sozinho nao permite conferir nada:
              a semana da fabrica desloca por feriado e o rotulo da planilha
              corre a frente do calendario. Com as datas, o PCP confere. */}
          <h2 style={imp.tituloSecao}>
            O programa da semana {demanda.semana.chave}
            {/* SO' O PERIODO DA PLANILHA. Sem a coluna INICIO, o intervalo que
                a leitura devolve e' o da semana ISO do calendario — e a 036-26
                da fabrica rodou de 24/08 a 28/08, uma semana inteira longe da
                semana 36 do calendario. Afirmar essa data no titulo da folha
                que vai para a reuniao e' pior que nao dizer data nenhuma. */}
            {demanda.periodo ? ` · ${comoPeriodo(demanda.periodo, { ano: true })}` : ''}
            {grupoNome ? ` — ${grupoNome}` : ''}
          </h2>
          <div style={imp.comparativoGrade}>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Exigido por máquina</span>
              <span style={imp.comparativoValor}>
                {Math.round(demanda.veredito.pecasPorHoraMaquina)} pç/h
              </span>
              <span style={imp.comparativoSub}>
                takt {(demanda.veredito.taktMs / 1000).toFixed(1)}s por peça
              </span>
            </div>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Entregue no relógio</span>
              <span style={imp.comparativoValor}>
                {Math.round(demanda.veredito.ritmoRelogio)} pç/h
              </span>
              <span style={imp.comparativoSub}>
                {demanda.paradas === 'outras' && demanda.veredito.ritmoRodando
                  ? `${Math.round(demanda.veredito.ritmoRodando)} pç/h com a máquina rodando`
                  : (demanda.paradas === 'so-setup' ? 'só troca/setup marcado, já no planejado' : 'sem parada marcada no período')}
              </span>
            </div>
            <div style={demanda.veredito.atende ? imp.comparativoCaixa : imp.comparativoCaixaDestaque}>
              <span style={imp.comparativoRotulo}>Máquinas necessárias</span>
              <span style={imp.comparativoValor}>
                {demanda.veredito.maquinasNecessarias.toFixed(1).replace('.', ',')}
              </span>
              <span style={imp.comparativoSub}>
                o grupo tem {demanda.veredito.maquinas}
                {demanda.veredito.maquinasSeNaoParasse
                  && demanda.veredito.maquinasSeNaoParasse < demanda.veredito.maquinasNecessarias
                  ? ` · sem as paradas, ${demanda.veredito.maquinasSeNaoParasse.toFixed(1).replace('.', ',')}`
                  : ''}
              </span>
            </div>
          </div>
          <p style={imp.comparativoNota}>
            {demanda.demanda.toLocaleString('pt-BR')} peças programadas, divididas entre
            {' '}{demanda.veredito.maquinas} máquina(s) com
            {' '}{demanda.conta ? demanda.conta.texto.produtivas : Math.round(demanda.veredito.horasDisponiveis)} horas-máquina
            {demanda.setup && demanda.conta && !demanda.setup.zerado
              ? ` produtivas (${demanda.conta.texto.jornada} h de jornada − ${demanda.conta.texto.setup} h de setup: ${demanda.setup.setupsDia}/dia × ${demanda.setup.dias} dias × ${demanda.setup.minutos} min por máquina)`
              : ''}
            {demanda.setup?.zerado ? ' (grupo cadastrado sem troca de peça: setup zero)' : ''}
            {' '}na semana. O veredito usa o ritmo de RELÓGIO (paradas dentro
            {demanda.setup?.medidoMs > 0
              ? `, exceto ${demanda.setup.medidoMs >= 60000 ? `${Math.round(demanda.setup.medidoMs / 60000)} min` : 'menos de 1 min'} de troca/setup marcados nas medições — já contados no setup planejado, saíram do relógio para não contar duas vezes`
              : ''}
            ): é o que sai do posto por
            hora de presença. {demanda.veredito.atende
              ? `O grupo ATENDE o programa, com ${Math.abs(demanda.veredito.folgaPct).toFixed(0)}% de folga.`
              : `O grupo NÃO ATENDE: falta ${Math.abs(demanda.veredito.folgaPct).toFixed(0)}% de ritmo em cada máquina.`}
            {/* A RESSALVA vai junto para o papel. E' a folha que circula na
                reuniao, e um veredito casado por numero da semana tem margem
                de erro que a tela mostra e o papel calava. */}
            {!demanda.setup && (
              <> <strong>Setup não informado</strong>: horas de jornada cheia — a troca de peça
                entre medições não está na conta, e o veredito é otimista por ela.</>
            )}
            {!demanda.casadoPorData && (
              <> Semana cadastrada <strong>sem data de início</strong>: casada pelo número,
                que erra quando a semana da fábrica desloca por feriado.</>
            )}
          </p>
        </section>
      )}

      {comparativo && (
        <section style={imp.comparativo}>
          <h2 style={imp.tituloSecao}>O que a parada custou</h2>
          <div style={imp.comparativoGrade}>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Saiu no período</span>
              <span style={imp.comparativoValor}>{comparativo.pecas} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ritmoPeriodo)} pç/h · {porMinuto(comparativo.ritmoPeriodo)} pç/min
              </span>
            </div>
            <div style={imp.comparativoCaixa}>
              <span style={imp.comparativoRotulo}>Teria saído no mesmo tempo</span>
              <span style={imp.comparativoValor}>{comparativo.potencial} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ritmoPotencial)} pç/h · {porMinuto(comparativo.ritmoPotencial)} pç/min
              </span>
            </div>
            <div style={imp.comparativoCaixaDestaque}>
              <span style={imp.comparativoRotulo}>Deixou de sair</span>
              <span style={imp.comparativoValor}>{comparativo.perdidas} peças</span>
              <span style={imp.comparativoSub}>
                {Math.round(comparativo.ganhoPct)}% a mais no mesmo tempo
              </span>
            </div>
          </div>
          <p style={imp.comparativoNota}>
            Período observado de {formatarDuracao(comparativo.duracaoMs)}, com
            {' '}{formatarDuracao(comparativo.paradaMs)} de máquina parada. O potencial é calculado
            MÁQUINA POR MÁQUINA e somado — cada uma no ritmo que ela própria fez com ela rodando,
            aplicado ao período dela. Não é meta nem capacidade de catálogo.
          </p>
        </section>
      )}

      <h2 style={imp.tituloSecao}>Ritmo por máquina</h2>
      <table style={imp.tabela}>
        <thead>
          <tr>
            <th style={imp.th}>Máquina</th>
            <th style={imp.th}>Grupo</th>
            <th style={imp.thNum}>Medições</th>
            <th style={imp.thNum}>Peças</th>
            <th style={imp.thNum}>Tempo rodando</th>
            <th style={imp.thNum}>Parado</th>
            <th style={imp.thNum}>Rodando %</th>
            <th style={imp.thNum}>Peças/hora</th>
            <th style={imp.thNum}>Peças/min</th>
          </tr>
        </thead>
        <tbody>
          {resumo.map((g) => (
            <tr key={g.maquina}>
              <td style={imp.td}>{g.maquina}</td>
              <td style={imp.td}>{grupoDe?.(g.maquina) || '—'}</td>
              <td style={imp.tdNum}>{g.n}</td>
              <td style={imp.tdNum}>{g.totalPecas}</td>
              <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
              <td style={imp.tdNum}>{g.totalParadaMs > 0 ? formatarDuracao(g.totalParadaMs) : '—'}</td>
              <td style={imp.tdNum}>{Math.round(g.disponibilidadePct)}%</td>
              <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
              <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Nota em texto corrido, nao carimbo: o numero ja' saiu na tabela. */}
      {emMedicao.length > 0 && (
        <p style={{ ...imp.nota, margin: '6px 0 0' }}>
          Ainda em medição: {emMedicao.map((g) => g.maquina).join(', ')} — o ritmo
          {emMedicao.length > 1 ? ' dessas máquinas' : ' desta máquina'} fica mais
          certeiro com mais medições.
        </p>
      )}

      {/* A TENDENCIA NO TEMPO, no papel.
          A tabela acima da' UM numero por maquina — a media do periodo. Ela
          esconde a deriva: o posto que fazia 780 pc/h em agosto e faz 700
          agora sai como 740, e a queda so' aparece medicao contra medicao,
          na data de cada uma. E' a leitura que sustenta "a furadeira esta'
          caindo" numa reuniao, entao precisa estar na folha que circula.
          UNICA imagem do documento (o resto e' tabela, inclusive a curva do
          dia): aqui a forma da linha E' a informacao, um numero por data nao
          mostra deriva. Largura fixa porque na tela o bloco esta' oculto e a
          medicao automatica devolveria zero. */}
      {/* Sem <h2> proprio: o grafico ja' traz o titulo no figcaption, e os
          dois juntos imprimiam "Tendencia do ritmo no tempo" duas vezes
          seguidas. Mesmo arranjo do irmao no estudo. */}
      {resumo.length > 0 && (
        <section style={imp.tendencia}>
          <GraficoTendenciaPeriodo
            conferencias={linhas}
            resumo={resumo}
            altura={130}
            larguraFixa={resumo.length > 1 ? 312 : 640}
            colunas={resumo.length > 1 ? 2 : 1}
          />
        </section>
      )}

      {/* QUAL MAQUINA ESTA' MELHOR, no papel.
          E' a pergunta que a reuniao faz diante da folha, e a folha precisa
          responder sozinha — inclusive a RECUSA, quando o mix de pecas nao
          deixa comparar. As frases sao as mesmas da tela (lerGrupo, no
          dominio): papel e tela dizendo coisas diferentes sobre os mesmos
          numeros e' o comeco de uma discussao inutil na reuniao. */}
      {entreMaquinas?.grupos.length > 0 && (
        <section style={imp.entreMaquinas}>
          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Comparativo entre máquinas</h2>
          <p style={{ ...imp.nota, margin: '0 0 6px' }}>
            Comparação feita DENTRO DE CADA GRUPO do cadastro — máquinas que fazem a mesma
            coisa. Postos de grupos diferentes não disputam peças/hora.
          </p>

          {entreMaquinas.grupos.map((g) => (
            <div key={g.grupo} style={imp.grupoBloco}>
              <div style={imp.grupoNome}>{g.grupo}</div>
              {lerGrupo(g).map((frase) => (
                <p key={frase} style={imp.analiseLinha}>{frase}</p>
              ))}
              <table style={{ ...imp.tabela, marginTop: 4 }}>
                <thead>
                  <tr>
                    <th style={imp.th}>Máquina</th>
                    <th style={imp.thNum}>Medições</th>
                    <th style={imp.thNum}>Peças/hora</th>
                    <th style={imp.thNum}>vs. líder</th>
                    {g.temCiclos && <th style={imp.thNum}>Ciclos/hora</th>}
                    <th style={imp.thNum}>Rodando %</th>
                    <th style={imp.th}>Constância</th>
                    <th style={imp.thNum}>Do próprio melhor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.maquina}>
                      <td style={imp.td}>
                        {l.maquina}
                        {!l.confiavel && ' (ainda em medição)'}
                      </td>
                      <td style={imp.tdNum}>{l.n}</td>
                      <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(l.ritmoMedio)}</td>
                      {/* Mesmo motivo da tela: grupo incomparavel nao
                          imprime indice — o numero desmentiria a ressalva. */}
                      <td style={imp.tdNum}>
                        {g.comparavel && l.indicePct != null ? `${Math.round(l.indicePct)}%` : '—'}
                      </td>
                      {g.temCiclos && (
                        <td style={imp.tdNum}>{l.ciclosPorHora != null ? Math.round(l.ciclosPorHora) : '—'}</td>
                      )}
                      <td style={imp.tdNum}>{Math.round(l.disponibilidadePct)}%</td>
                      <td style={imp.td}>{constanciaTexto(l.cvPct) || '—'}</td>
                      <td style={imp.tdNum}>
                        {l.aproveitamentoPct != null ? `${Math.round(l.aproveitamentoPct)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* O que medir para destravar — a folha e' o que vai para a
                  mao de quem mede. Sem esta linha, o papel dizia "nao da'
                  para comparar" e nao dizia o caminho: quem le' fica sabendo
                  do problema e nao da solucao. */}
              {!g.comparavel && (
                <p style={{ ...imp.nota, margin: '4px 0 0' }}>
                  Uma medição da mesma peça em cada máquina deste grupo já destrava a comparação
                  direta — é a medição de maior retorno para o relatório agora.
                </p>
              )}

              {g.duelos.length > 0 && (
                <p style={{ ...imp.nota, margin: '5px 0 0' }}>
                  <strong>Mesma peça nas duas</strong> (comparação sem ressalva):{' '}
                  {g.duelos.map((d) => (
                    `${d.peca} — ${d.linhas.map((l) => `${l.maquina} ${Math.round(l.ritmoMedio)} pç/h`).join(' x ')}`
                    + `${d.empate ? ' (praticamente igual)' : ` (${d.lider.maquina} ${Math.round(d.difPct)}% mais rápido)`}`
                  )).join(' · ')}
                </p>
              )}
            </div>
          ))}

          {entreMaquinas.semPar.length > 0 && (
            <p style={{ ...imp.nota, margin: '5px 0 0' }}>
              Fora do comparativo:{' '}
              {entreMaquinas.semPar.map((s) => `${s.maquina} (única medida em ${s.grupo})`).join(', ')}
              {' — '}comparação só existe com outra máquina do mesmo grupo.
            </p>
          )}
        </section>
      )}

      {/* A ANALISE no papel e' OPCAO, marcada na tela ("Sair na impressão"):
          o papel circula em reuniao, e a leitura pronta poupa quem le — mas
          quem quer so' os numeros imprime como sempre. A nota diz que ela e'
          automatica: leitura de regra, para conferir, nao parecer de gente. */}
      {analise?.length > 0 && (
        <>
          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Análise do período</h2>
          <p style={{ ...imp.nota, margin: '0 0 6px' }}>
            Gerada automaticamente pelos números deste relatório — confira antes de decidir.
          </p>
          {analise.map((s) => (
            <div key={s.titulo} style={imp.analiseBloco}>
              <div style={imp.analiseTitulo}>{s.titulo}</div>
              {s.linhas.map((l) => (
                <p key={l} style={imp.analiseLinha}>{l}</p>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Ritmo por peca: o numero que o PCP leva para dimensionar carga e lote. */}
      {resumoPecas?.length > 0 && (
        <>
          {curvaDoDia.length >= 2 && (
            <>
              <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por hora do dia</h2>
              <table style={imp.tabela}>
                <thead>
                  <tr>
                    <th style={imp.th}>Hora</th>
                    <th style={imp.thNum}>Medições</th>
                    <th style={imp.thNum}>Peças</th>
                    <th style={imp.thNum}>Tempo rodando</th>
                    <th style={imp.thNum}>Peças/hora</th>
                    <th style={imp.thNum}>Peças/min</th>
                  </tr>
                </thead>
                <tbody>
                  {curvaDoDia.map((h) => (
                    <tr key={h.chave}>
                      <td style={imp.td}>{h.rotulo}</td>
                      <td style={imp.tdNum}>{h.n}</td>
                      <td style={imp.tdNum}>{h.pecas}</td>
                      <td style={imp.tdNum}>{formatarDuracao(h.produtivoMs)}</td>
                      <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(h.ritmoMedio)}</td>
                      <td style={imp.tdNum}>{porMinuto(h.ritmoMedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={imp.nota}>
                Cada medição entra na hora em que começou, e as medições da mesma hora somam
                entre si, mesmo de datas diferentes — é a curva do turno.
              </p>
            </>
          )}

          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por peça</h2>
          {/* A MESMA regra da tela (TabelaRitmoPorPeca): com toda peca de um
              acionamento so', "Por acion." repetiria "Por peça" numero por
              numero. O que esta' na tela e' o que sai no papel. */}
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Peça</th>
                <th style={imp.th}>Máquina</th>
                <th style={imp.thNum}>Acion.</th>
                <th style={imp.th}>Furação</th>
                <th style={imp.thNum}>Medições</th>
                <th style={imp.thNum}>Peças</th>
                <th style={imp.thNum}>Tempo rodando</th>
                <th style={imp.thNum}>Peças/hora</th>
                <th style={imp.thNum}>Peças/min</th>
                <th style={imp.thNum}>Por peça</th>
                {temPorAcion && <th style={imp.thNum}>Por acion.</th>}
              </tr>
            </thead>
            <tbody>
              {resumoPecas.map((g) => (
                <tr key={`${g.maquina}·${g.peca}`}>
                  <td style={imp.td}>{g.peca}</td>
                  <td style={imp.td}>{g.maquina}</td>
                  <td style={imp.tdNum}>{g.ciclosMistos ? g.ciclosVistos.join('/') : g.ciclosPorPeca}</td>
                  <td style={imp.td}>{g.passanteMista ? 'mista' : g.furacaoPassante ? 'passante' : '—'}</td>
                  <td style={imp.tdNum}>{g.n}</td>
                  <td style={imp.tdNum}>{g.totalPecas}</td>
                  <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{porPeca(g.cicloMedioMs)}</td>
                  {temPorAcion && (
                    <td style={imp.tdNum}>{g.ciclosMistos ? '—' : porPeca(g.cicloMotorMs)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={imp.nota}>
            ACION.: quantas vezes o motor é acionado para fazer uma peça. Peça de mais
            acionamentos rende menos peças/hora sem a máquina estar mais lenta. POR PEÇA é o
            tempo cheio de uma peça — manuseio e furação juntos — medido COM A MÁQUINA
            RODANDO: quem for multiplicar por uma quantidade planejada precisa somar o tempo
            parado do posto, senão a carga sai menor que a realidade.
            {' '}
            {temPorAcion
              ? 'POR ACION. é esse mesmo tempo dividido pelos acionamentos: é ele que compara peças de furação diferente.'
              : 'Toda peça aqui é de um acionamento só — o tempo por acionamento seria o mesmo da coluna POR PEÇA, e a tabela não repete o número.'}
          </p>

          {/* A REGUA DO CICLO no papel: pecas de mesmo acionamento deveriam
              sair na mesma faixa, e quem foge dela aponta para o manuseio.
              As frases sao as mesmas da tela (lerClasse, no dominio). */}
          {porCiclo?.classes.some((c) => c.temFaixa) && (
            <>
              <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por acionamento do motor</h2>
              {porCiclo.classes.filter((c) => c.temFaixa).map((c) => (
                <div key={`${c.maquina}-${c.ciclos}-${c.passante}`} style={imp.grupoBloco}>
                  <div style={imp.grupoNome}>
                    {c.maquina} · {c.ciclos === 1 ? '1 acionamento' : `${c.ciclos} acionamentos`} por peça
                    {c.passante ? ' · furação passante' : ''}
                  </div>
                  {lerClasse(c).map((frase) => (
                    <p key={frase} style={imp.analiseLinha}>{frase}</p>
                  ))}
                </div>
              ))}
              <p style={imp.nota}>
                Peça fora da faixa da própria classe não é peça errada: o tempo de uma peça é
                MANUSEIO mais FURAÇÃO, e só a furação depende do acionamento. Peça grande demora
                mais para posicionar sem a máquina ter culpa — é aí que se procura primeiro.
              </p>
            </>
          )}

          {porCiclo?.mistas.length > 0 && (
            <p style={imp.nota}>
              Fora da leitura por acionamento:{' '}
              {porCiclo.mistas.map((m) => `${m.peca} na ${m.maquina} (${m.motivo})`).join(', ')}
              {' — '}o mesmo produto não pode estar gravado de dois jeitos; corrija na medição.
            </p>
          )}
        </>
      )}

      <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Medições registradas ({linhas.length})</h2>
      <table style={imp.tabela}>
        <thead>
          <tr>
            <th style={imp.th}>Data</th>
            <th style={imp.th}>Máquina</th>
            <th style={imp.th}>Peça</th>
            <th style={imp.th}>Horários</th>
            <th style={imp.thNum}>Período</th>
            <th style={imp.thNum}>Parado</th>
            <th style={imp.thNum}>Peças</th>
            <th style={imp.thNum}>Peças/hora</th>
            <th style={imp.thNum}>Peças/min</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const calc = conferenciaRapida({
              duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
              ciclosPorPeca: c.ciclos_por_peca,
            });
            const par = somarParadas(c.paradas);
            // No papel nao ha' cor para agrupar a nota com a medicao dela: os
            // dois filetes iguais faziam a observacao parecer nota da linha de
            // BAIXO. Com observacao, a medicao nao fecha o proprio filete — o
            // par inteiro fecha no fim da nota.
            const td = c.observacao ? { ...imp.td, borderBottom: 'none' } : imp.td;
            const tdNum = c.observacao ? { ...imp.tdNum, borderBottom: 'none' } : imp.tdNum;
            return (
              <Fragment key={c.id}>
              <tr>
                <td style={td}>{formatarDataHora(c.salvo_em)}</td>
                <td style={td}>{c.maquina || '—'}</td>
                <td style={td}>{c.peca || '—'}</td>
                <td style={td}>{faixaHoraria(c) || '—'}</td>
                <td style={tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={tdNum}>{par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}</td>
                <td style={tdNum}>{c.pecas}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                <td style={tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
              </tr>
              {c.observacao && (
                <tr>
                  <td style={imp.tdObservacao} colSpan={9}>Obs.: {c.observacao}</td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Legenda em PALAVRAS: o documento circula em reuniao e nao pode
          depender de quem escreveu para ser entendido. */}
      <section style={imp.legenda}>
        <strong>Como ler este relatório</strong>
        <div style={imp.gradeLegenda}>
          {[
            ['Medição', 'um período observado no posto: hora inicial, hora final e as peças produzidas.'],
            ['Período', 'tempo entre a hora inicial e a hora final.'],
            ['Parado', 'tempo em que a máquina não produziu dentro do período: troca/setup, falta de material, manutenção.'],
            ['Peças/hora', 'quantas peças saem em uma hora com a máquina rodando.'],
            ['Peças/min', 'o mesmo ritmo, em peças por minuto.'],
            ['Por peça', 'tempo cheio de UMA peça no posto — manuseio e furação juntos — '
              + 'medido com a máquina rodando. Para planejar carga, some o tempo parado do posto.'],
            ['Ritmo médio', 'total de peças dividido pelo tempo total com a máquina rodando.'],
            ['Máquina rodando', 'quanto do período observado a máquina passou produzindo. '
              + 'É a DISPONIBILIDADE do período — 100% menos o tempo parado.'],
            ['Deixou de sair', 'peças que teriam saído no MESMO período se a máquina não tivesse '
              + 'parado, ao ritmo que ela própria fez rodando. Não é meta nem capacidade de catálogo.'],
            ['Grupo', 'grupo do cadastro de máquinas, com o código da fábrica (ex: 0002 · FURADEIRA).'],
            ['Ainda em medição', 'máquina medida poucas vezes ou por pouco tempo — o número pode mudar com mais medições.'],
            ['Obs.', 'observação escrita pelo analista no aparelho, na hora da medição: o que o contador não registra.'],
          ].map(([sigla, texto]) => (
            <div key={sigla} style={imp.itemLegenda}>
              <strong style={{ whiteSpace: 'nowrap' }}>{sigla}:</strong>
              <span>{texto}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={imp.assinaturas}>
        {['Analista responsável', 'Coordenador PPCP'].map((papel) => (
          <div key={papel} style={imp.assinatura}>
            <div style={imp.linhaAssinatura} />
            <span style={imp.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
