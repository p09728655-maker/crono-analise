import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { formatarDuracao, formatarSegundos } from '../../domain/cronoanalise.js';
import { PRIORIDADES } from '../../domain/sugestoes.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';

/**
 * RESUMO EXECUTIVO — A4, UMA pagina.
 *
 * A Folha de Analise tem quatro paginas: identificacao, base estatistica,
 * resultado por operacao, paradas, evidencia grafica, formulas, assinatura.
 * E' o documento tecnico — o que se arquiva e o que sustenta uma revisao de
 * tempo padrao seis meses depois.
 *
 * Este e' o outro documento: o que se leva para a reuniao de dez minutos.
 * Responde tres coisas e para: quanto a linha entrega, onde esta o
 * gargalo, e o que fazer primeiro. Nada de formula, nada de CV por
 * operacao, nada de grafico — quem quiser o detalhe pede a Folha.
 *
 * Cabe numa pagina de proposito: o corte e' o que da' valor. As sugestoes
 * saem so' as de ALTA prioridade, no maximo tres.
 */
export default function ResumoExecutivo({ estudo, analise, leitura }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const dataEstudo = estudo.data_estudo
    ? new Date(estudo.data_estudo).toLocaleDateString('pt-BR')
    : '—';

  const { capacidade } = leitura;
  const altas = leitura.sugestoes.filter((s) => s.prioridade === 'alta').slice(0, 3);
  const atinge = capacidade.atingimentoPct !== null && capacidade.atingimentoPct >= 100;

  return (
    <div className="somente-impressao" style={est.folha}>
      <header style={est.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />
          <h1 style={est.titulo}>Resumo Executivo — Estudo de Tempos</h1>
          <div style={est.subtitulo}>{estudo.nome}</div>
        </div>
        <div style={est.emissao}>
          RitmoPatrimar v{VERSAO} · emitido em {hoje}
          <br />
          Estudo de {dataEstudo}
          {estudo.analista_nome || estudo.analista ? ` · ${estudo.analista_nome || estudo.analista}` : ''}
        </div>
      </header>

      <section style={est.identificacao}>
        {[
          ['Produto', estudo.produto || '—'],
          ['Recurso / posto', estudo.recurso || '—'],
          ['Operações', String(analise.operacoes.length)],
          ['Ciclos coletados', String(analise.totalCiclos)],
        ].map(([k, v]) => (
          <div key={k} style={est.campo}>
            <span style={est.campoRotulo}>{k}</span>
            <span style={est.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {/* A resposta primeiro. Quem le este documento quer sair da sala
          sabendo se a linha entrega — o resto e' fundamentacao. */}
      <section style={est.destaques}>
        <div style={est.destaque}>
          <span style={est.destaqueRotulo}>Capacidade da linha</span>
          <span style={est.destaqueValor}>{analise.capacidadeLinha || '—'}<small style={est.destaqueUnidade}>pç/h</small></span>
          <span style={est.destaqueNota}>
            {analise.gargalo ? `limitada por ${analise.gargalo.nome}` : 'sem ciclos coletados'}
          </span>
        </div>
        <div style={est.destaque}>
          <span style={est.destaqueRotulo}>Exigido pela demanda</span>
          <span style={est.destaqueValor}>
            {capacidade.esperado !== null ? capacidade.esperado : '—'}
            <small style={est.destaqueUnidade}>{capacidade.esperado !== null ? 'pç/h' : ''}</small>
          </span>
          <span style={est.destaqueNota}>
            {capacidade.esperado !== null
              ? `Takt de ${formatarSegundos(analise.taktMs)} s por peça`
              : 'Takt Time não configurado'}
          </span>
        </div>
        <div style={est.destaque}>
          <span style={est.destaqueRotulo}>Atingimento</span>
          <span style={est.destaqueValor}>
            {capacidade.atingimentoPct !== null ? `${capacidade.atingimentoPct.toFixed(0)}%` : '—'}
          </span>
          <span style={est.destaqueNota}>
            {capacidade.diferenca === null
              ? 'sem base de comparação'
              : `${capacidade.diferenca > 0 ? '+' : ''}${capacidade.diferenca} pç/h ${capacidade.diferenca < 0 ? 'de déficit' : 'de superávit'}`}
          </span>
        </div>
        <div style={est.destaque}>
          <span style={est.destaqueRotulo}>Operadores</span>
          <span style={est.destaqueValor}>
            {analise.operadores !== null ? Math.ceil(analise.operadores) : '—'}
          </span>
          <span style={est.destaqueNota}>
            {analise.operadores !== null
              ? `Σ TP ${formatarSegundos(analise.somaTp)} s ÷ Takt — exato ${analise.operadores.toFixed(2)}`
              : 'depende do Takt Time'}
          </span>
        </div>
      </section>

      <p style={est.veredito}>
        <strong>{atinge ? '✓ A linha atende o ritmo da demanda.' : (capacidade.esperado === null ? 'Sem Takt configurado, não há veredito de atendimento.' : '⚠ A linha não atende o ritmo da demanda.')}</strong>
        {' '}
        {analise.gargalo && capacidade.esperado !== null && !atinge && (
          <>O gargalo é <strong>{analise.gargalo.nome}</strong>, com {formatarSegundos(analise.gargalo.resultado.tpPorPeca)} s
          por peça contra {formatarSegundos(analise.taktMs)} s exigidos. Enquanto ele não ceder,
          melhoria em outro posto não muda a capacidade.</>
        )}
        {analise.paradas.n > 0 && (
          <> Foram registradas {analise.paradas.n} parada(s), somando {formatarDuracao(analise.paradas.totalMs)} —
          {' '}{analise.paradas.pctDoObservado.toFixed(1)}% do tempo com o cronômetro na mão.</>
        )}
      </p>

      <h2 style={est.tituloSecao}>Tempo padrão por operação</h2>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Operação</th>
            <th style={est.thNum}>Ciclos</th>
            <th style={est.thNum}>CV%</th>
            <th style={est.thNum}>TP peça (s)</th>
            <th style={est.thNum}>Cap/h</th>
            <th style={est.th}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {analise.operacoes.map((op) => {
            const r = op.resultado;
            return (
              <tr key={op.id}>
                <td style={est.td}>
                  {op.nome}
                  {analise.gargalo?.id === op.id && <strong> (gargalo)</strong>}
                </td>
                <td style={est.tdNum}>{r ? r.n : 0}</td>
                <td style={est.tdNum}>{r ? r.cvPct.toFixed(1) : '—'}</td>
                <td style={{ ...est.tdNum, fontWeight: 700 }}>{r ? formatarSegundos(r.tpPorPeca) : '—'}</td>
                <td style={est.tdNum}>{r ? r.cap : '—'}</td>
                <td style={est.td}>{r ? r.estabilidade.rotulo : 'Sem ciclos'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 style={{ ...est.tituloSecao, marginTop: 10 }}>
        O que tratar primeiro
        {leitura.sugestoes.length > altas.length && (
          <span style={est.tituloNota}>
            {' '}— {altas.length} de {leitura.sugestoes.length} sugestões; a lista completa está na Folha de Análise
          </span>
        )}
      </h2>
      {altas.length ? (
        <ol style={est.listaAcoes}>
          {altas.map((s) => (
            <li key={s.id} style={est.itemAcao}>
              <strong>{s.titulo}</strong>
              {s.operacao ? ` — ${s.operacao}` : ''}. {s.diagnostico}
              <br />
              <span style={est.acaoTexto}><strong>{PRIORIDADES[s.prioridade].rotulo} prioridade · Ação:</strong> {s.acao}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p style={est.semAcoes}>
          Nenhuma ação de alta prioridade: nenhum posto acima do Takt, variação
          dentro da faixa boa e nenhuma parada relevante registrada.
        </p>
      )}

      <section style={est.assinaturas}>
        {['Analista responsável', 'Coordenador PPCP'].map((papel) => (
          <div key={papel} style={est.assinatura}>
            <div style={est.linhaAssinatura} />
            <span style={est.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ estilos */
/* Papel: preto no branco, sem cor de interface. Mesma gramatica da Folha. */

const est = {
  folha: {
    fontFamily: fonteAnalise.familia,
    color: '#000',
    fontSize: 10,
    lineHeight: 1.35,
  },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 16, paddingBottom: 6, marginBottom: 10,
    borderBottom: `2px solid ${claro.vermelho}`,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { fontSize: 15, fontWeight: 700, margin: 0 },
  subtitulo: { fontSize: 11, marginTop: 2 },
  emissao: { fontSize: 8, color: '#444', textAlign: 'right', lineHeight: 1.5 },

  identificacao: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10,
  },
  campo: { display: 'flex', flexDirection: 'column', gap: 1, borderBottom: '1px solid #ccc', paddingBottom: 3 },
  campoRotulo: { fontSize: 7, letterSpacing: 0.5, textTransform: 'uppercase', color: '#666' },
  campoValor: { fontSize: 10, fontWeight: 600 },

  destaques: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 },
  destaque: {
    display: 'flex', flexDirection: 'column', gap: 1,
    padding: '6px 8px', border: '1px solid #999', borderRadius: 3,
  },
  destaqueRotulo: { fontSize: 7, letterSpacing: 0.5, textTransform: 'uppercase', color: '#666' },
  destaqueValor: { fontSize: 17, fontWeight: 700, fontFamily: fonteAnalise.numero, lineHeight: 1.1 },
  destaqueUnidade: { fontSize: 8, fontWeight: 400, marginLeft: 3 },
  destaqueNota: { fontSize: 8, color: '#444', lineHeight: 1.3 },

  veredito: {
    margin: '0 0 10px', padding: '6px 8px', fontSize: 9.5, lineHeight: 1.45,
    background: '#F2F3F5', borderLeft: `3px solid ${claro.vermelho}`,
  },

  tituloSecao: {
    fontSize: 11, fontWeight: 700, margin: '0 0 4px',
    paddingBottom: 2, borderBottom: '1px solid #999',
  },
  tituloNota: { fontSize: 8, fontWeight: 400, color: '#555' },

  tabela: { width: '100%', borderCollapse: 'collapse', marginBottom: 4 },
  th: {
    textAlign: 'left', padding: '3px 5px', fontSize: 7.5, letterSpacing: 0.4,
    textTransform: 'uppercase', borderBottom: '1px solid #999',
  },
  thNum: {
    textAlign: 'right', padding: '3px 5px', fontSize: 7.5, letterSpacing: 0.4,
    textTransform: 'uppercase', borderBottom: '1px solid #999',
  },
  td: { padding: '3px 5px', fontSize: 9, borderBottom: '1px solid #DDD' },
  tdNum: {
    padding: '3px 5px', fontSize: 9, textAlign: 'right',
    fontFamily: fonteAnalise.numero, borderBottom: '1px solid #DDD',
  },

  listaAcoes: { margin: '4px 0 0', paddingLeft: 16 },
  itemAcao: { fontSize: 9, lineHeight: 1.45, marginBottom: 5 },
  acaoTexto: { color: '#222' },
  semAcoes: { fontSize: 9, color: '#444', margin: '4px 0 0' },

  assinaturas: { display: 'flex', gap: 40, marginTop: 26 },
  assinatura: { flex: 1, textAlign: 'center' },
  linhaAssinatura: { borderTop: '1px solid #000', marginBottom: 3 },
  papelAssinatura: { fontSize: 8, color: '#444' },
};
