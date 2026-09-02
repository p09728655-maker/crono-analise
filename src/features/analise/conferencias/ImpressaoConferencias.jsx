import {
  comparativoDeParadas, conferenciaRapida, faixaHoraria, formatarDuracao, ritmoPorHoraDoDia,
  somarParadas,
} from '../../../domain/cronoanalise.js';
import { constanciaTexto, lerGrupo } from '../../../domain/comparativoMaquinas.js';
import { lerClasse } from '../../../domain/ritmoPorCiclo.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { imp } from './estilos.js';
import { porMinuto } from './formato.js';

/**
 * FOLHA DO RITMO POR MAQUINA — A4 retrato, modelo basico.
 *
 * Nao e' a tela no papel — a tela tem filtro, botao e cor de interface; o
 * papel tem contexto e responsavel. Recebe os dados JA' FILTRADOS pela
 * lateral: com uma maquina escolhida, sai a folha daquela maquina, com o
 * nome dela no titulo e na identificacao.
 *
 * Sem jargao (decisao de 31/08): nada de CV%, ciclo do motor ou criterio
 * de amostra carimbado. Os numeros sao pecas/hora e pecas/minuto; maquina
 * medida ha' pouco tempo leva uma NOTA em texto corrido, nao um selo.
 */
export default function ImpressaoConferencias({ linhas, resumo, resumoPecas, grupoDe, filtro, analise, entreMaquinas, porCiclo }) {
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
  // A curva do dia no papel e' TABELA, nao grafico: a folha nao tem nenhuma
  // outra imagem, e a hora com o numero ao lado le-se melhor impressa.
  // So' com UMA maquina, pelo mesmo motivo da tela: misturando postos, a
  // hora fraca seria a hora da maquina mais lenta, nao uma hora fraca.
  const curvaDoDia = resumo.length === 1 ? ritmoPorHoraDoDia(linhas) : [];

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Ritmo por Máquina{filtro ? ` — ${filtro}` : ''}</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          filtro ? ['Máquina', filtro] : ['Máquinas', String(resumo.length)],
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
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Peça</th>
                <th style={imp.th}>Máquina</th>
                <th style={imp.thNum}>Acion.</th>
                <th style={imp.thNum}>Medições</th>
                <th style={imp.thNum}>Peças</th>
                <th style={imp.thNum}>Tempo rodando</th>
                <th style={imp.thNum}>Peças/hora</th>
                <th style={imp.thNum}>Peças/min</th>
                <th style={imp.thNum}>Por acion.</th>
              </tr>
            </thead>
            <tbody>
              {resumoPecas.map((g) => (
                <tr key={`${g.maquina}·${g.peca}`}>
                  <td style={imp.td}>{g.peca}</td>
                  <td style={imp.td}>{g.maquina}</td>
                  <td style={imp.tdNum}>{g.ciclosMistos ? g.ciclosVistos.join('/') : g.ciclosPorPeca}</td>
                  <td style={imp.tdNum}>{g.n}</td>
                  <td style={imp.tdNum}>{g.totalPecas}</td>
                  <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{(g.cicloMotorMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={imp.nota}>
            ACION.: quantas vezes o motor é acionado para fazer uma peça. Peça de mais
            acionamentos rende menos peças/hora sem a máquina estar mais lenta — POR ACION. é o
            número comparável entre peças de furação diferente.
          </p>

          {/* A REGUA DO CICLO no papel: pecas de mesmo acionamento deveriam
              sair na mesma faixa, e quem foge dela aponta para o manuseio.
              As frases sao as mesmas da tela (lerClasse, no dominio). */}
          {porCiclo?.classes.some((c) => c.temFaixa) && (
            <>
              <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por acionamento do motor</h2>
              {porCiclo.classes.filter((c) => c.temFaixa).map((c) => (
                <div key={`${c.maquina}-${c.ciclos}`} style={imp.grupoBloco}>
                  <div style={imp.grupoNome}>
                    {c.maquina} · {c.ciclos === 1 ? '1 acionamento' : `${c.ciclos} acionamentos`} por peça
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
              {porCiclo.mistas.map((m) => `${m.peca} na ${m.maquina} (gravada com ${m.ciclosVistos.join(' e ')})`).join(', ')}
              {' — '}o mesmo produto não pode pedir dois números de acionamento; corrija na medição.
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
            return (
              <tr key={c.id}>
                <td style={imp.td}>{formatarDataHora(c.salvo_em)}</td>
                <td style={imp.td}>{c.maquina || '—'}</td>
                <td style={imp.td}>{c.peca || '—'}</td>
                <td style={imp.td}>{faixaHoraria(c) || '—'}</td>
                <td style={imp.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={imp.tdNum}>{par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}</td>
                <td style={imp.tdNum}>{c.pecas}</td>
                <td style={{ ...imp.tdNum, fontWeight: 700 }}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                <td style={imp.tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
              </tr>
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
            ['Ritmo médio', 'total de peças dividido pelo tempo total com a máquina rodando.'],
            ['Máquina rodando', 'quanto do período observado a máquina passou produzindo. '
              + 'É a DISPONIBILIDADE do período — 100% menos o tempo parado.'],
            ['Deixou de sair', 'peças que teriam saído no MESMO período se a máquina não tivesse '
              + 'parado, ao ritmo que ela própria fez rodando. Não é meta nem capacidade de catálogo.'],
            ['Grupo', 'grupo do cadastro de máquinas, com o código da fábrica (ex: 0002 · FURADEIRA).'],
            ['Ainda em medição', 'máquina medida poucas vezes ou por pouco tempo — o número pode mudar com mais medições.'],
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
