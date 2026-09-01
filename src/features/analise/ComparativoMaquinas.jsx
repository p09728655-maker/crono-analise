import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import { constanciaTexto, lerGrupo } from '../../domain/comparativoMaquinas.js';

/**
 * COMPARATIVO ENTRE MAQUINAS — "qual esta' melhor?", respondido direito.
 *
 * A pergunta chega assim, solta, e a resposta errada e' facil de dar: um
 * ranking corrido de pecas/hora com todas as maquinas medidas. Esse ranking
 * poe seccionadora, furadeira e embalagem na mesma coluna e elege a
 * "melhor" — que e' so' a que faz a peca mais rapida de fazer. E' numero
 * com aparencia de verdade, e vai para reuniao.
 *
 * Este quadro compara DENTRO DO GRUPO do cadastro, porque e' o grupo que
 * declara quais maquinas fazem a mesma coisa. E separa a pergunta em
 * quatro, lado a lado, porque "rendimento" e' quatro perguntas:
 *
 *   RITMO         — quanto sai por hora COM A MAQUINA RODANDO.
 *   CICLOS/H      — acionamentos do motor por hora. So' aparece quando
 *                   alguma peca do grupo fura em mais de um ciclo; e' o que
 *                   torna pecas de furacao diferente comparaveis.
 *   RODANDO %     — quanto do periodo a maquina passou produzindo.
 *   CONSTANCIA e
 *   PROPRIO MELHOR— cada maquina contra ela mesma.
 *
 * A maquina que ganha em ritmo perde em rodando % com frequencia, e essa
 * divergencia e' a informacao mais util do quadro: ritmo baixo se trata na
 * maquina, tempo parado se trata na parada. Uma coluna so' esconderia isso.
 *
 * Quando o mix de pecas nao permite comparar, o quadro NAO elege vencedor —
 * diz o que medir para a comparacao existir. Ver comparativoMaquinas.js.
 */

const porMinuto = (pecasPorHora) => (pecasPorHora / 60).toFixed(1);

export default function ComparativoMaquinas({ comparativo }) {
  if (!comparativo) return null;
  /**
   * Duas ou mais maquinas medidas, cada uma sozinha no seu grupo: nao ha'
   * comparativo, e o quadro DIZ isso em vez de sumir. Sumindo, quem viu duas
   * maquinas no relatorio conclui que a comparacao falhou e vai procura-la.
   * Com uma maquina so' em vista (lateral filtrada) o quadro nao aparece:
   * ai' e' obvio que nao ha' com quem comparar.
   */
  const soAvulsas = !comparativo.grupos.length && comparativo.semPar.length >= 2;
  if (!comparativo.grupos.length && !soAvulsas) return null;

  if (soAvulsas) {
    return (
      <section style={est.painel} aria-label="Comparativo entre máquinas">
        <div style={est.topo}>
          <h2 style={est.titulo}>Comparativo entre máquinas</h2>
          <p style={est.dica}>
            Não há comparação a fazer: as {comparativo.semPar.length} máquinas medidas são de
            grupos diferentes — {comparativo.semPar.map((s) => `${s.maquina} (${s.grupo})`).join(', ')}.
            Postos de naturezas diferentes não disputam peças/hora entre si. Para comparar, meça
            outra máquina do mesmo grupo.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section style={est.painel} aria-label="Comparativo entre máquinas">
      <div style={est.topo}>
        <h2 style={est.titulo}>Comparativo entre máquinas</h2>
        <p style={est.dica}>
          A comparação é feita <strong>dentro de cada grupo</strong> do cadastro — máquinas que
          fazem a mesma coisa. Seccionadora não disputa peças/hora com furadeira: uma corta chapa,
          a outra fura peça.
        </p>
      </div>

      {comparativo.grupos.map((g) => (
        <div key={g.grupo} style={est.grupo}>
          <div style={est.grupoTopo}>
            <span style={est.grupoNome}>{g.grupo}</span>
            <span style={est.grupoContagem}>{g.linhas.length} máquinas medidas</span>
          </div>

          {/* O veredito — ou a recusa dele. Vem ANTES da tabela: quem abre o
              relatorio quer a resposta, e so' depois os numeros que a
              sustentam. As frases sao as MESMAS que saem no papel. */}
          <div style={g.comparavel ? est.leitura : est.leituraRessalva}>
            {lerGrupo(g).map((frase) => (
              <p key={frase} style={est.leituraLinha}>{frase}</p>
            ))}
          </div>

          <div style={est.rolagem}>
            <table style={est.tabela}>
              <thead>
                <tr>
                  <th style={est.th}>Máquina</th>
                  <th style={est.thNum}>Medições</th>
                  <th style={est.thNum}>Peças/hora</th>
                  <th style={est.thNum}>Peças/min</th>
                  <th
                    style={est.thNum}
                    title={g.comparavel
                      ? 'O ritmo desta máquina em % do ritmo da primeira do grupo'
                      : 'Sem peça medida em duas máquinas deste grupo, peças/hora não se compara'}
                  >
                    vs. líder
                  </th>
                  {g.temCiclos && (
                    <th style={est.thNum} title="Acionamentos do motor por hora — compara peças com furação diferente">
                      Ciclos/hora
                    </th>
                  )}
                  <th style={est.thNum} title="Quanto do período observado a máquina passou produzindo">
                    Rodando %
                  </th>
                  <th style={est.th} title="O quanto o ritmo se repete entre as medições">
                    Constância
                  </th>
                  <th style={est.thNum} title="A média dela em relação ao melhor período dela mesma">
                    Do próprio melhor
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map((l) => {
                  const lidera = g.comparavel && !g.empate && l.maquina === g.lider.maquina;
                  return (
                    <tr key={l.maquina} style={lidera ? est.trLider : undefined}>
                      <td style={est.td}>
                        <span style={est.nomeMaquina}>{l.maquina}</span>
                        {/* Selo de texto, nao de cor: sobrevive ao P&B e a
                            quem nao distingue matiz. */}
                        {lidera && <span style={est.seloLider}>maior ritmo</span>}
                        {!l.confiavel && <span style={est.seloMedindo}>ainda em medição</span>}
                      </td>
                      <td style={est.tdNum}>{l.n}</td>
                      <td style={est.tdNumForte}>{Math.round(l.ritmoMedio)}</td>
                      <td style={est.tdNum}>{porMinuto(l.ritmoMedio)}</td>
                      {/* Grupo incomparavel nao mostra o indice: a caixa
                          acima diz que peças/hora nao se compara aqui, e
                          "80%" logo abaixo desmentiria a propria ressalva —
                          quem le' em diagonal leva o numero, nao o aviso. */}
                      <td style={est.tdNum}>
                        {g.comparavel && l.indicePct != null
                          ? `${Math.round(l.indicePct)}%`
                          : <span style={est.vazio}>—</span>}
                      </td>
                      {g.temCiclos && (
                        <td style={est.tdNum}>{l.ciclosPorHora != null ? Math.round(l.ciclosPorHora) : '—'}</td>
                      )}
                      <td style={l.maquina === g.liderDisponibilidade?.maquina ? est.tdNumForte : est.tdNum}>
                        {Math.round(l.disponibilidadePct)}%
                      </td>
                      <td style={est.td}>
                        {constanciaTexto(l.cvPct) || <span style={est.vazio}>1 medição</span>}
                      </td>
                      <td style={est.tdNum}>
                        {l.aproveitamentoPct != null
                          ? `${Math.round(l.aproveitamentoPct)}%`
                          : <span style={est.vazio}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* O DUELO: a mesma peca medida em duas maquinas do grupo. E' a
              unica comparacao de ritmo sem ressalva que este relatorio
              consegue produzir — quando ela existe, ela manda sobre a
              tabela acima, que carrega o mix junto. */}
          {g.duelos.length > 0 && (
            <div style={est.duelos}>
              <span style={est.duelosRotulo}>MESMA PEÇA NAS DUAS — COMPARAÇÃO SEM RESSALVA</span>
              {g.duelos.map((d) => (
                <div key={d.peca} style={est.duelo}>
                  <span style={est.dueloPeca}>{d.peca}</span>
                  <span style={est.dueloNumeros}>
                    {d.linhas.map((l) => `${l.maquina} ${Math.round(l.ritmoMedio)} pç/h`).join(' · ')}
                  </span>
                  <span style={est.dueloVeredito}>
                    {d.empate
                      ? 'praticamente igual'
                      : `${d.lider.maquina} ${Math.round(d.difPct)}% mais rápido`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Sem nenhuma peca em comum o quadro se recusou a eleger vencedor
              la em cima; aqui fica o caminho pratico para destravar. */}
          {!g.comparavel && (
            <p style={est.dica}>
              Uma medição da mesma peça em cada máquina deste grupo já destrava a comparação
              direta — é a medição de maior retorno para o relatório agora.
            </p>
          )}
        </div>
      ))}

      {/* Maquina sozinha no grupo nao entra em comparativo nenhum. Dizer
          isso e' melhor do que deixar o usuario procurar a maquina dele
          numa tabela onde ela nunca vai aparecer. */}
      {comparativo.semPar.length > 0 && (
        <p style={est.rodape}>
          Fora do comparativo: {comparativo.semPar.map((s) => `${s.maquina} (única medida em ${s.grupo})`).join(', ')}
          {' — '}comparação só existe com outra máquina do mesmo grupo.
        </p>
      )}
    </section>
  );
}

const t = claro;

const est = {
  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.xl,
  },
  topo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  titulo: { ...tipo('corpoF'), margin: 0 },
  dica: { ...tipo('legenda'), color: t.textoMedio, margin: 0, maxWidth: 760 },

  grupo: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  grupoTopo: { display: 'flex', alignItems: 'baseline', gap: espaco.md, flexWrap: 'wrap' },
  grupoNome: { ...rotulo(t.texto) },
  grupoContagem: { ...tipo('legenda'), color: t.textoFraco },

  // A leitura em caixa propria: e' conclusao, nao legenda de tabela.
  leitura: {
    background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    borderLeftWidth: 3, borderLeftColor: t.grafite,
    padding: `${espaco.md}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // Comparacao que o dado NAO sustenta leva marca propria — a borda ambar
  // avisa antes da leitura, e o texto dentro dela diz o porque.
  leituraRessalva: {
    background: t.atencaoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
    borderLeftWidth: 3, borderLeftColor: t.atencao,
    padding: `${espaco.md}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  leituraLinha: { ...tipo('corpo'), color: t.texto, margin: 0 },

  // Tabela larga em monitor estreito rola dentro da propria caixa, sem
  // empurrar a pagina inteira para o lado.
  rolagem: { overflowX: 'auto' },
  tabela: { width: '100%', borderCollapse: 'collapse', ...tipo('corpo') },
  th: {
    textAlign: 'left', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoMedio), borderBottomWidth: 1, borderBottomStyle: 'solid',
    borderBottomColor: t.bordaForte, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.sm}px ${espaco.md}px`,
    ...rotulo(t.textoMedio), borderBottomWidth: 1, borderBottomStyle: 'solid',
    borderBottomColor: t.bordaForte, whiteSpace: 'nowrap',
  },
  td: {
    padding: `${espaco.sm}px ${espaco.md}px`,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
  },
  tdNum: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', ...numeros,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    whiteSpace: 'nowrap',
  },
  tdNumForte: {
    padding: `${espaco.sm}px ${espaco.md}px`, textAlign: 'right', ...numeros,
    fontWeight: 700,
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: t.borda,
    whiteSpace: 'nowrap',
  },
  trLider: { background: t.fundo },
  nomeMaquina: { ...tipo('corpoF') },
  seloLider: {
    marginLeft: espaco.sm, padding: '1px 8px', borderRadius: raio.pill,
    background: t.okFundo, color: t.ok, ...tipo('micro'), whiteSpace: 'nowrap',
  },
  seloMedindo: {
    marginLeft: espaco.sm, padding: '1px 8px', borderRadius: raio.pill,
    background: t.papel, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), whiteSpace: 'nowrap',
  },
  vazio: { color: t.textoFraco },

  duelos: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: `${espaco.md}px ${espaco.lg}px`, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  duelosRotulo: rotulo(t.textoFraco),
  duelo: {
    display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 2fr) auto',
    gap: espaco.md, alignItems: 'baseline', ...tipo('legenda'), ...numeros,
  },
  dueloPeca: { ...tipo('corpoF'), color: t.texto },
  dueloNumeros: { color: t.textoMedio },
  dueloVeredito: { ...tipo('corpoF'), color: t.texto, textAlign: 'right', whiteSpace: 'nowrap' },

  rodape: { ...tipo('legenda'), color: t.textoFraco, margin: 0 },
};
