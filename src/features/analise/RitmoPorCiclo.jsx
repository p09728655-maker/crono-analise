import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import { lerClasse } from '../../domain/ritmoPorCiclo.js';

/**
 * RITMO POR CICLO — a régua que o relatório tinha e perdeu.
 *
 * A coleta pergunta, medicao a medicao, quantas vezes o motor e' acionado
 * para furar UMA peca (1, 2 ou 3). O dado sobe, e' gravado e entra na conta
 * — mas o redesenho de 31/08 tirou da tela tudo que soava a jargao, e levou
 * junto o ciclo do motor, que nao e' jargao: e' a unica coisa que torna
 * pecas diferentes comparaveis. Ficou um relatorio que respondia "as pecas
 * sao diferentes, nao da' para comparar" tendo em maos exatamente o que
 * resolvia isso.
 *
 * Aqui ele volta na linguagem do modelo basico — nao como coluna
 * "cicloMotorMs (s)", e sim como a leitura que o encarregado ja' faz de
 * cabeca: as pecas de UM acionamento desta furadeira saem entre 23 e 25
 * por minuto; esta aqui sai a 15, e a furacao e' a mesma.
 *
 * O QUE ESTE QUADRO NAO DIZ. Que a peca fora da faixa esta' errada. O tempo
 * de uma peca e' manuseio + furacao, e so' a furacao escala com o ciclo:
 * peca grande demora mais para posicionar sem a maquina ter culpa. Por isso
 * o texto sempre aponta o manuseio como o primeiro lugar a olhar, e nunca
 * fecha diagnostico — quem conhece a peca decide.
 */
export default function RitmoPorCiclo({ classes, mistas }) {
  const comFaixa = (classes || []).filter((c) => c.temFaixa);
  if (!comFaixa.length && !mistas?.length) return null;

  return (
    <section style={est.painel} aria-label="Ritmo por ciclo do motor">
      <div style={est.topo}>
        <h2 style={est.titulo}>Ritmo por acionamento do motor</h2>
        <p style={est.dica}>
          Peças que pedem o <strong>mesmo número de acionamentos</strong> deveriam sair em ritmo
          parecido: a furação é a mesma. Quando uma foge da faixa, o tempo foi para o manuseio —
          tamanho da peça, gabarito, batente, abastecimento —, não para a máquina.
        </p>
      </div>

      {comFaixa.map((c) => (
        <div key={`${c.maquina}-${c.ciclos}`} style={est.classe}>
          <div style={est.classeTopo}>
            <span style={est.classeNome}>
              {c.maquina} · {c.ciclos === 1 ? '1 acionamento' : `${c.ciclos} acionamentos`} por peça
            </span>
            <span style={est.classeFaixa}>
              {c.faixaPorMinuto.min.toFixed(1)} a {c.faixaPorMinuto.max.toFixed(1)} pç/min
            </span>
          </div>

          {/* A leitura vem do dominio (lerClasse): a tela e o papel dizem as
              mesmas frases sobre os mesmos numeros. */}
          <div style={c.foraDaFaixa.length ? est.leituraAtencao : est.leitura}>
            {lerClasse(c).map((frase) => (
              <p key={frase} style={est.leituraLinha}>{frase}</p>
            ))}
          </div>

          <div style={est.rolagem}>
            <table style={est.tabela}>
              <thead>
                <tr>
                  <th style={est.th}>Peça</th>
                  <th style={est.thNum}>Medições</th>
                  <th style={est.thNum}>Peças/min</th>
                  <th style={est.thNum}>Peças/hora</th>
                  <th style={est.thNum} title="Tempo de um acionamento do motor nesta peça">
                    Por acionamento
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.itens.map((i) => {
                  const fora = c.foraDaFaixa.find((f) => f.peca === i.peca);
                  return (
                    <tr key={i.peca} style={fora ? est.trFora : undefined}>
                      <td style={est.td}>
                        <span style={est.nomePeca}>{i.peca}</span>
                        {/* Selo de TEXTO com o numero: cor sozinha nao
                            informa, e "fora da faixa" sem o quanto nao
                            move ninguem. */}
                        {fora && (
                          <span style={est.selo}>
                            {fora.desvioPct < 0 ? '−' : '+'}{Math.abs(Math.round(fora.desvioPct))}%
                          </span>
                        )}
                      </td>
                      <td style={est.tdNum}>{i.n}</td>
                      <td style={est.tdNumForte}>{i.pecasPorMinuto.toFixed(1)}</td>
                      <td style={est.tdNum}>{Math.round(i.ritmoMedio)}</td>
                      <td style={est.tdNum}>
                        {i.cicloMotorMs != null ? `${(i.cicloMotorMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Peca gravada ora com 1 acionamento, ora com 2: nao entra em classe
          nenhuma ate' o dado ser corrigido. Sumir com ela em silencio faria
          o analista procurar uma peca que o relatorio engoliu. */}
      {mistas?.length > 0 && (
        <p style={est.rodape}>
          Fora desta leitura:{' '}
          {mistas.map((m) => `${m.peca} na ${m.maquina} (gravada com ${m.ciclosVistos.join(' e ')} acionamentos)`).join(', ')}
          {' — '}o mesmo produto não pode pedir dois números de acionamento. Corrija na medição
          para a peça entrar na comparação.
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

  classe: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  classeTopo: {
    display: 'flex', alignItems: 'baseline', gap: espaco.md,
    justifyContent: 'space-between', flexWrap: 'wrap',
  },
  classeNome: { ...rotulo(t.texto) },
  classeFaixa: { ...tipo('legenda'), ...numeros, color: t.textoMedio },

  leitura: {
    background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    borderLeftWidth: 3, borderLeftColor: t.grafite,
    padding: `${espaco.md}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  // Peca fora da faixa e' pergunta a fazer, nao erro provado: ambar de
  // atencao, nunca o critico.
  leituraAtencao: {
    background: t.atencaoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
    borderLeftWidth: 3, borderLeftColor: t.atencao,
    padding: `${espaco.md}px ${espaco.lg}px`,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  leituraLinha: { ...tipo('corpo'), color: t.texto, margin: 0 },

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
  trFora: { background: t.atencaoFundo },
  nomePeca: { ...tipo('corpoF') },
  selo: {
    marginLeft: espaco.sm, padding: '1px 8px', borderRadius: raio.pill,
    background: t.papel, borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
    color: t.atencao, ...tipo('micro'), ...numeros, whiteSpace: 'nowrap',
  },

  rodape: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },
};
