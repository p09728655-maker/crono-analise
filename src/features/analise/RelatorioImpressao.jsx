import { claro } from '../../theme/tokensAnalise.js';
import { formatarDuracao, formatarSegundos } from '../../domain/cronoanalise.js';
import { GraficoYamazumi } from './graficos.jsx';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';

/**
 * RELATORIO IMPRESSO — A4 retrato.
 *
 * Nao e' "a tela com CSS de impressao": e' um documento proprio, com a
 * informacao na ordem que um relatorio tecnico exige — identificacao, base
 * estatistica, resultado, evidencia grafica, assinatura.
 *
 * O relatorio sai da fabrica e circula em reuniao. Por isso ele declara a
 * propria confiabilidade: se a amostra nao fecha a meta, isso vai impresso,
 * nao escondido. Um numero sem contexto vira decisao errada.
 */
export default function RelatorioImpressao({ estudo, analise }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const dataEstudo = estudo.data_estudo
    ? new Date(estudo.data_estudo).toLocaleDateString('pt-BR')
    : '—';

  return (
    <div className="somente-impressao" style={est.folha}>
      <header style={est.cabecalho}>
        <div>
          {/* Base64: o relatorio nunca sai sem a marca por causa de uma
              requisicao que falhou justamente na hora de imprimir. */}
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />
          <h1 style={est.titulo}>Estudo de Tempos — Folha de Análise</h1>
        </div>
        <div style={est.emissao}>
          RitmoPatrimar v{VERSAO} · emitido em {hoje}
        </div>
      </header>

      <section style={est.identificacao}>
        {[
          ['Estudo', estudo.nome],
          ['Produto / referência', estudo.produto || '—'],
          ['Recurso / posto', estudo.recurso || '—'],
          ['Setor', estudo.setor || '—'],
          ['Analista', estudo.analista || '—'],
          ['Data do estudo', dataEstudo],
          ['Tolerância aplicada', `${analise.tolerancia}%`],
          ['Takt Time', analise.taktMs ? `${formatarSegundos(analise.taktMs)} s` : 'não informado'],
        ].map(([k, v]) => (
          <div key={k} style={est.campo}>
            <span style={est.campoRotulo}>{k}</span>
            <span style={est.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {/* Confiabilidade vem ANTES do resultado: quem le precisa saber o peso
          do numero antes de olhar o numero. */}
      <section style={analise.pendencias.length ? est.ressalva : est.validacao}>
        <strong>
          {analise.pendencias.length
            ? '⚠ Estudo com amostra incompleta'
            : '✓ Meta de observações atingida'}
        </strong>
        {analise.pendencias.length ? (
          <>
            <p style={est.ressalvaTexto}>
              As operações abaixo não atingiram a meta de observações definida para o
              estudo. Os tempos padrão apresentados servem como orientação, mas não devem
              embasar dimensionamento definitivo de mão de obra.
            </p>
            <ul style={est.ressalvaLista}>
              {analise.pendencias.map(({ op, s }) => (
                <li key={op.id}><strong>{op.nome}</strong> — {s.motivo}</li>
              ))}
            </ul>
          </>
        ) : (
          <p style={est.ressalvaTexto}>
            Todas as operações atingiram a meta de observações definida para o estudo.
            O CV% de cada operação está na tabela como referência de estabilidade.
          </p>
        )}
      </section>

      <section style={est.resumo}>
        {[
          ['Operações', analise.operacoes.length, ''],
          ['Ciclos coletados', analise.totalCiclos, ''],
          ['Σ TP por peça', formatarSegundos(analise.somaTp), 's'],
          ['Capacidade da linha', analise.capacidadeLinha || '—', 'pç/h'],
          ['Operadores', analise.operadores !== null ? analise.operadores.toFixed(2) : '—', ''],
          ['Tempo parado', analise.paradas?.totalMs ? formatarDuracao(analise.paradas.totalMs) : '—', ''],
        ].map(([k, v, s]) => (
          <div key={k} style={est.resumoItem}>
            <span style={est.resumoRotulo}>{k}</span>
            <span style={est.resumoValor}>{v}{s && <small style={est.resumoSufixo}>{s}</small>}</span>
          </div>
        ))}
      </section>

      {analise.gargalo && (
        <p style={est.gargalo}>
          <strong>Gargalo:</strong> {analise.gargalo.nome}, com{' '}
          {formatarSegundos(analise.gargalo.resultado.tpPorPeca)} s por peça
          {analise.gargalo.resultado.ciclosPorPeca > 1
            && ` (${formatarSegundos(analise.gargalo.resultado.tpVal)} s por ciclo × ${analise.gargalo.resultado.ciclosPorPeca} ciclos)`}. A capacidade da linha é
          limitada por esta operação — {analise.gargalo.resultado.cap} peças/hora.
          {analise.operadores !== null && (
            <> O dimensionamento indica {analise.operadores.toFixed(2)} operadores
            (arredondar para {Math.ceil(analise.operadores)}).</>
          )}
        </p>
      )}

      <h2 style={est.tituloSecao}>Resultados por operação</h2>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Operação</th>
            <th style={est.thNum}>Obs.</th>
            <th style={est.thNum}>FR</th>
            <th style={est.thNum}>TO (s)</th>
            <th style={est.thNum}>TN (s)</th>
            <th style={est.thNum}>Cic/pç</th>
            <th style={est.thNum}>TP peça (s)</th>
            <th style={est.thNum}>CV%</th>
            <th style={est.thNum}>Cap/h</th>
            <th style={est.thNum}>Parado</th>
          </tr>
        </thead>
        <tbody>
          {analise.operacoes.map((op) => {
            const r = op.resultado;
            return (
              <tr key={op.id}>
                <td style={est.td}>{op.nome}</td>
                <td style={est.tdNum}>{r ? r.n : 0}</td>
                <td style={est.tdNum}>{Number(op.fr_pct)}%</td>
                <td style={est.tdNum}>{r ? formatarSegundos(r.toMed) : '—'}</td>
                <td style={est.tdNum}>{r ? formatarSegundos(r.tnMed) : '—'}</td>
                <td style={est.tdNum}>{r ? r.ciclosPorPeca : 1}</td>
                <td style={{ ...est.tdNum, fontWeight: 700 }}>{r ? formatarSegundos(r.tpPorPeca) : '—'}</td>
                <td style={est.tdNum}>{r ? r.cvPct.toFixed(1) : '—'}</td>
                <td style={est.tdNum}>{r ? r.cap : '—'}</td>
                <td style={est.tdNum}>{r?.totalParada ? formatarDuracao(r.totalParada) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* PARADAS — a perda medida durante a coleta.
          Vai no papel porque e' aqui que ela vira pauta: o relatorio circula
          em reuniao, e "40 min em falta de material" e' o item que muda
          decisao. Quando nao ha registro, o documento DIZ que nao ha, em vez
          de omitir a secao — ausencia de registro nao e' ausencia de parada. */}
      <h2 style={{ ...est.tituloSecao, marginTop: 12 }}>Paradas registradas na coleta</h2>
      {analise.paradas?.n ? (
        <>
          <p style={est.notaParadas}>
            {formatarDuracao(analise.paradas.totalMs)} em {analise.paradas.n} parada(s) —{' '}
            {analise.paradas.pctDoObservado.toFixed(1)}% do tempo com o cronômetro na mão.
            O tempo parado é descontado do ciclo e <strong>não entra</strong> no tempo
            observado: é perda a tratar, não lentidão da operação.
          </p>
          <table style={est.tabela}>
            <thead>
              <tr>
                <th style={est.th}>Motivo</th>
                <th style={est.thNum}>Ocorr.</th>
                <th style={est.thNum}>Tempo</th>
                <th style={est.thNum}>% do parado</th>
                <th style={est.th}>Ação recomendada</th>
              </tr>
            </thead>
            <tbody>
              {analise.paradas.porMotivo.map((m) => (
                <tr key={m.motivo}>
                  <td style={est.td}>{m.rotulo}</td>
                  <td style={est.tdNum}>{m.n}</td>
                  <td style={{ ...est.tdNum, fontWeight: 700 }}>{formatarDuracao(m.ms)}</td>
                  <td style={est.tdNum}>{m.pct.toFixed(0)}%</td>
                  <td style={est.td}>{m.acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p style={est.notaParadas}>
          Nenhuma parada foi registrada durante esta coleta. Isso não significa
          que o posto não parou — significa que não houve registro no
          cronômetro. Para medir a perda, use o botão <strong>Parada</strong> na
          tela de coleta.
        </p>
      )}

      <div style={est.quebraPagina} />

      <h2 style={est.tituloSecao}>Evidência gráfica</h2>
      <div style={est.grafico}>
        <GraficoYamazumi operacoes={analise.comDados} taktMs={analise.taktMs} altura={300} />
      </div>
      {/* Legenda em PALAVRAS, nao so formula: o relatorio circula em reuniao
          com gente que nao vive de cronoanalise — "TO (s)" precisa dizer o
          que e' sem ninguem perguntar. A formula vai junto, entre parenteses,
          para quem quiser conferir a conta. */}
      <section style={est.formulas}>
        <strong>Legenda</strong>
        <div style={est.gradeLegenda}>
          {[
            ['Obs.', 'Observações', 'ciclos cronometrados válidos da operação.'],
            ['FR', 'Fator de Ritmo', 'avaliação do ritmo do operador; 100% é o ritmo normal.'],
            ['TO (s)', 'Tempo Observado', 'média dos ciclos cronometrados, em segundos.'],
            ['TN (s)', 'Tempo Normal', 'tempo observado corrigido pelo ritmo (TN = TO × FR ÷ 100).'],
            ['Cic/pç', 'Ciclos por peça', 'quantas vezes a operação se repete em cada peça — peça com 2 furações conta 2.'],
            ['TP peça (s)', 'Tempo Padrão da peça', 'tempo normal com tolerância, vezes os ciclos por peça (TN × (1 + Tolerância) × ciclos). É o tempo que vale para o planejamento.'],
            ['CV%', 'Coeficiente de Variação', 'quanto os ciclos variaram entre si (desvio ÷ média × 100); menor = mais estável.'],
            ['Cap/h', 'Capacidade por hora', 'peças por hora no tempo padrão (3.600 ÷ TP da peça).'],
            ['Parado', 'Tempo parado', 'tempo registrado com a produção parada (setup, falta de material, manutenção). Descontado do ciclo: não entra no TO.'],
            ['Σ TP', 'Soma dos tempos padrão', 'tempo padrão total do produto neste posto, somando as operações.'],
            ['Takt Time', 'Ritmo da demanda', 'tempo disponível por peça para atender a produção do dia (tempo ÷ quantidade). Operadores = Σ TP ÷ Takt.'],
          ].map(([sigla, nome, texto]) => (
            <div key={sigla} style={est.itemLegenda}>
              <span style={est.legendaSigla}>{sigla}</span>
              <span style={est.legendaTexto}><strong>{nome}</strong> — {texto}</span>
            </div>
          ))}
        </div>
        <p style={est.nota}>
          Desvio padrão amostral (n−1). Ciclos abaixo de 200 ms são descartados como
          toque acidental. A dispersão é reportada pelo CV% — ciclo que fugiu do
          padrão é sinalizado ao analista durante a própria coleta, enquanto ainda
          dá tempo de conferir o que aconteceu no posto.
        </p>
      </section>

      <section style={est.assinaturas}>
        {['Analista responsável', 'Supervisão / PCP'].map((papel) => (
          <div key={papel} style={est.assinatura}>
            <div style={est.linhaAssinatura} />
            <span style={est.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

const est = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45 },
  cabecalho: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14 },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555' },
  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },
  validacao: { padding: 9, border: '1px solid #15803D', borderLeft: '4px solid #15803D', marginBottom: 12, fontSize: 9.5 },
  ressalva: { padding: 9, border: '1px solid #B45309', borderLeft: '4px solid #B45309', marginBottom: 12, fontSize: 9.5 },
  ressalvaTexto: { margin: '4px 0 0' },
  ressalvaLista: { margin: '4px 0 0', paddingLeft: 16 },
  resumo: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 },
  resumoItem: { border: '1px solid #ccc', padding: '6px 8px', textAlign: 'center' },
  resumoRotulo: { display: 'block', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#666' },
  resumoValor: { display: 'block', fontSize: 16, fontWeight: 700, fontFamily: "'Consolas', monospace" },
  resumoSufixo: { fontSize: 8, fontWeight: 400, marginLeft: 2 },
  gargalo: { padding: 9, background: '#f4f4f4', borderLeft: `4px solid ${claro.grafite}`, margin: '0 0 14px', fontSize: 9.5 },
  tituloSecao: { fontSize: 12, fontWeight: 700, margin: '0 0 6px', paddingBottom: 3, borderBottom: '1px solid #999' },
  notaParadas: { fontSize: 9, lineHeight: 1.45, margin: '0 0 6px', color: '#333' },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5, marginBottom: 14 },
  th: { textAlign: 'left', padding: '5px 6px', borderBottom: '1.5px solid #333', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  thNum: { textAlign: 'right', padding: '5px 6px', borderBottom: '1.5px solid #333', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { padding: '4px 6px', borderBottom: '1px solid #ddd' },
  tdNum: { padding: '4px 6px', borderBottom: '1px solid #ddd', textAlign: 'right', fontFamily: "'Consolas', monospace" },
  quebraPagina: { breakBefore: 'page', pageBreakBefore: 'always' },
  grafico: { marginBottom: 12, breakInside: 'avoid', pageBreakInside: 'avoid' },
  formulas: { border: '1px solid #ccc', padding: 9, marginBottom: 16, breakInside: 'avoid' },
  gradeLegenda: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', marginTop: 6 },
  itemLegenda: { display: 'flex', gap: 6, fontSize: 9, lineHeight: 1.45, breakInside: 'avoid' },
  legendaSigla: { flexShrink: 0, width: 58, fontWeight: 700, color: '#1F2328' },
  legendaTexto: { color: '#444' },
  nota: { margin: '8px 0 0', fontSize: 8.5, color: '#555', lineHeight: 1.5 },
  assinaturas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 32, breakInside: 'avoid' },
  assinatura: { textAlign: 'center' },
  linhaAssinatura: { borderTop: '1px solid #000', marginBottom: 4 },
  papelAssinatura: { fontSize: 8.5, color: '#555' },
};
