import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import {
  CRITERIOS_CONFERENCIA, conferenciaRapida, formatarDuracao, formatarSegundos, resumirConferencias,
} from '../../domain/cronoanalise.js';
import { listarConferenciasServidor } from '../../lib/api.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import Cabecalho from '../../components/Cabecalho.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';

/**
 * RELATORIO DE CONFERENCIAS — o estudo das furadeiras, no PC.
 *
 * As conferencias rapidas nascem no celular, sobem pela fila offline e
 * chegam aqui para virar leitura de gestao: cada MAQUINA vira um bloco de
 * resumo, e a tabela embaixo guarda o dado bruto, mais recente primeiro.
 *
 * O relatorio se autoavalia pelos CRITERIOS_CONFERENCIA, na tela e no
 * papel, ANTES dos numeros: minimo de conferencias, tempo total observado
 * e periodo por conferencia. Uma unica medicao de 1 minuto continua
 * visivel — mas carimbada de "amostra insuficiente", nunca de referencia.
 * (Mesma filosofia do estudo de ciclos: criterio declarado, nao trava.)
 *
 * O ritmo medio e' ponderado pelo tempo — soma de pecas sobre soma de
 * duracao — porque e' esse numero que aguenta decisao de capacidade;
 * media simples de taxas deixaria uma medicao de 5 minutos valer o mesmo
 * que uma de 2 horas.
 *
 * A impressao NAO e' a tela no papel: e' um documento proprio (A4), com
 * identificacao, criterios, resumo e o dado bruto — ver ImpressaoConferencias.
 */
export default function RelatorioConferencias({ aoVoltar }) {
  const [linhas, setLinhas] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setEstado('carregando');
    try {
      const r = await listarConferenciasServidor();
      setLinhas(r.conferencias || []);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  const resumo = useMemo(() => resumirConferencias(linhas), [linhas]);
  const visiveis = useMemo(
    () => (filtro ? linhas.filter((c) => (String(c.maquina || '').trim() || 'Sem máquina') === filtro) : linhas),
    [linhas, filtro],
  );

  return (
    <div style={est.tela}>
      <div className="somente-tela">
        <Cabecalho
          modo="analise"
          titulo="Conferências rápidas"
          subtitulo="Estudo por máquina"
          aoVoltar={aoVoltar}
          acoes={estado === 'pronto' && linhas.length > 0 && (
            <button type="button" style={est.botaoImprimir} onClick={() => window.print()}>
              Imprimir
            </button>
          )}
        />

        <main style={est.conteudo}>
          {estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando conferências" texto="Buscando as conferências sincronizadas." />
          )}

          {estado === 'erro' && (
            <EstadoVazio
              modo="analise"
              titulo="Não foi possível carregar"
              texto={erro}
              acao={(
                <button type="button" style={est.botaoImprimir} onClick={carregar}>
                  Tentar de novo
                </button>
              )}
            />
          )}

          {estado === 'pronto' && !linhas.length && (
            <EstadoVazio
              modo="analise"
              titulo="Nenhuma conferência sincronizada"
              texto="Salve conferências rápidas no celular (máquina, peça, horários) e elas aparecem aqui assim que o aparelho sincroniza."
            />
          )}

          {estado === 'pronto' && linhas.length > 0 && (
            <>
              {/* Filtro por maquina — so' aparece com mais de uma. */}
              {resumo.length > 1 && (
                <div style={est.filtro} role="group" aria-label="Filtrar por máquina">
                  <button
                    type="button"
                    onClick={() => setFiltro(null)}
                    aria-pressed={filtro === null}
                    style={{ ...est.filtroItem, ...(filtro === null ? est.filtroAtivo : {}) }}
                  >
                    Todas
                  </button>
                  {resumo.map((g) => (
                    <button
                      key={g.maquina}
                      type="button"
                      onClick={() => setFiltro(g.maquina === filtro ? null : g.maquina)}
                      aria-pressed={g.maquina === filtro}
                      style={{ ...est.filtroItem, ...(g.maquina === filtro ? est.filtroAtivo : {}) }}
                    >
                      {g.maquina}
                      <span style={est.filtroContagem}>{g.n}</span>
                    </button>
                  ))}
                </div>
              )}

              <section style={est.resumoGrade} aria-label="Resumo por máquina">
                {(filtro ? resumo.filter((g) => g.maquina === filtro) : resumo).map((g) => (
                  <div key={g.maquina} style={est.cartaoMaquina}>
                    <div style={est.cartaoTopo}>
                      <div style={est.cartaoTitulo}>{g.maquina}</div>
                      <span style={{ ...est.selo, ...(g.confiavel ? est.seloOk : est.seloAtencao) }}>
                        {g.confiavel ? 'Referência OK' : 'Amostra insuficiente'}
                      </span>
                    </div>
                    <div style={est.cartaoRitmo}>
                      {Math.round(g.ritmoMedio)}
                      <span style={est.cartaoRitmoSufixo}>pç/h médio</span>
                    </div>
                    <div style={est.cartaoLinhas}>
                      <span>{g.n} conferência(s) · {g.totalPecas} pç · {formatarDuracao(g.totalMs)}</span>
                      <span>
                        Ciclo médio: {formatarSegundos(g.cicloMedioMs)} s/pç
                        {g.cvPct != null && ` · CV entre conferências: ${g.cvPct.toFixed(1)}%`}
                      </span>
                      {g.n >= 2 && g.melhor && (
                        <span>
                          Melhor: {Math.round(g.melhor.ritmo)} pç/h{g.melhor.peca ? ` (${g.melhor.peca})` : ''}
                          {' · '}Pior: {Math.round(g.pior.ritmo)} pç/h{g.pior.peca ? ` (${g.pior.peca})` : ''}
                        </span>
                      )}
                    </div>
                    {!g.confiavel && (
                      <ul style={est.motivos}>
                        {g.motivos.map((m) => <li key={m} style={est.motivo}>{m}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </section>

              <section style={est.painel} aria-label="Todas as conferências">
                <table style={est.tabela}>
                  <thead>
                    <tr>
                      <th style={est.th}>Data</th>
                      <th style={est.th}>Máquina</th>
                      <th style={est.th}>Peça</th>
                      <th style={est.th}>Horários</th>
                      <th style={est.thNum}>Período</th>
                      <th style={est.thNum}>Peças</th>
                      <th style={est.thNum}>Peças/h</th>
                      <th style={est.thNum}>Ciclo (s/pç)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => {
                      const calc = conferenciaRapida({ duracaoMs: Number(c.duracao_ms), pecas: c.pecas });
                      return (
                        <tr key={c.id}>
                          <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                          <td style={est.tdCurto}>{c.maquina || '—'}</td>
                          <td style={est.tdCurto}>{c.peca || '—'}</td>
                          <td style={est.tdFraco}>
                            {c.hora_inicial && c.hora_final ? `${c.hora_inicial}–${c.hora_final}` : '—'}
                          </td>
                          <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                          <td style={est.tdNum}>{c.pecas}</td>
                          <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdNum}>{calc?.cicloMedioMs ? formatarSegundos(calc.cicloMedioMs) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </main>
      </div>

      {estado === 'pronto' && linhas.length > 0 && (
        <ImpressaoConferencias linhas={linhas} resumo={resumo} />
      )}
    </div>
  );
}

/**
 * Documento impresso — A4, no padrao da Folha de Analise do estudo.
 *
 * Ordem de relatorio tecnico: identificacao, CRITERIOS (antes dos
 * numeros), resumo por maquina, dado bruto, formula. Nada de cartao de
 * tela nem cor de interface: papel e' preto sobre branco.
 */
function ImpressaoConferencias({ linhas, resumo }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const crit = CRITERIOS_CONFERENCIA;

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Conferências Rápidas — Estudo por Máquina</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.secao}>
        <h2 style={imp.secaoTitulo}>Critérios de confiabilidade</h2>
        <p style={imp.texto}>
          Para o ritmo médio de uma máquina valer como referência, a amostra precisa de:
          no mínimo <strong>{crit.minConferencias} conferências</strong>, com
          {' '}<strong>{formatarDuracao(crit.minTempoTotalMs)}</strong> ou mais de tempo total
          observado, e nenhuma conferência com menos de
          {' '}<strong>{formatarDuracao(crit.minPeriodoMs)}</strong> (período curto mede rajada,
          não ritmo). Máquinas fora do critério aparecem mesmo assim — com a ressalva impressa,
          porque número sem contexto vira decisão errada.
        </p>
        <ul style={imp.listaCriterios}>
          {resumo.map((g) => (
            <li key={g.maquina} style={imp.itemCriterio}>
              <strong>{g.maquina}</strong>{' — '}
              {g.confiavel
                ? 'REFERÊNCIA OK: amostra atende aos critérios.'
                : `AMOSTRA INSUFICIENTE: ${g.motivos.join('; ')}.`}
            </li>
          ))}
        </ul>
      </section>

      <section style={imp.secao}>
        <h2 style={imp.secaoTitulo}>Resumo por máquina</h2>
        <table style={imp.tabela}>
          <thead>
            <tr>
              {['Máquina', 'Conf.', 'Peças', 'Tempo obs.', 'Ritmo médio (pç/h)', 'Ciclo médio (s/pç)', 'CV %', 'Situação']
                .map((h, i) => <th key={h} style={i === 0 ? imp.th : imp.thNum}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {resumo.map((g) => (
              <tr key={g.maquina}>
                <td style={imp.td}>{g.maquina}</td>
                <td style={imp.tdNum}>{g.n}</td>
                <td style={imp.tdNum}>{g.totalPecas}</td>
                <td style={imp.tdNum}>{formatarDuracao(g.totalMs)}</td>
                <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
                <td style={imp.tdNum}>{formatarSegundos(g.cicloMedioMs)}</td>
                <td style={imp.tdNum}>{g.cvPct != null ? g.cvPct.toFixed(1) : '—'}</td>
                <td style={imp.tdNum}>{g.confiavel ? 'Referência OK' : 'Insuficiente'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={imp.secao}>
        <h2 style={imp.secaoTitulo}>Conferências registradas ({linhas.length})</h2>
        <table style={imp.tabela}>
          <thead>
            <tr>
              {['Data', 'Máquina', 'Peça', 'Horários', 'Período', 'Peças', 'Peças/h', 'Ciclo (s/pç)']
                .map((h, i) => <th key={h} style={i < 4 ? imp.th : imp.thNum}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => {
              const calc = conferenciaRapida({ duracaoMs: Number(c.duracao_ms), pecas: c.pecas });
              return (
                <tr key={c.id}>
                  <td style={imp.td}>{formatarDataHora(c.salvo_em)}</td>
                  <td style={imp.td}>{c.maquina || '—'}</td>
                  <td style={imp.td}>{c.peca || '—'}</td>
                  <td style={imp.td}>{c.hora_inicial && c.hora_final ? `${c.hora_inicial}–${c.hora_final}` : '—'}</td>
                  <td style={imp.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                  <td style={imp.tdNum}>{c.pecas}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                  <td style={imp.tdNum}>{calc?.cicloMedioMs ? formatarSegundos(calc.cicloMedioMs) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer style={imp.rodape}>
        Ritmo médio ponderado pelo tempo: Σ peças ÷ Σ tempo observado. Conferência rápida mede
        vazão de posto (peças/hora); não substitui o estudo de tempos, que mede ciclo a ciclo
        com FR e tolerância e produz o tempo padrão.
      </footer>
    </div>
  );
}

const formatarDataHora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ estilos */

const t = claro;

const est = {
  tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
  conteudo: {
    maxWidth: 1400, margin: '0 auto',
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },

  filtro: {
    display: 'flex', gap: espaco.sm, marginBottom: espaco.xl,
    overflowX: 'auto', paddingBottom: espaco.xs,
  },
  filtroItem: {
    display: 'inline-flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0,
    minHeight: 34, padding: `0 ${espaco.md}px`,
    background: t.papel, borderRadius: raio.pill,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: `border-color ${transicao.rapida}, color ${transicao.rapida}`,
  },
  filtroAtivo: { borderColor: t.vermelho, color: t.texto },
  filtroContagem: {
    minWidth: 18, padding: '0 5px', borderRadius: raio.pill,
    background: t.fundo, color: t.textoFraco, ...tipo('micro'),
  },

  resumoGrade: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  cartaoMaquina: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.sm,
  },
  cartaoTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.md, flexWrap: 'wrap',
  },
  cartaoTitulo: { ...tipo('corpoF') },
  selo: {
    padding: '2px 10px', borderRadius: raio.pill,
    ...tipo('micro'), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    borderWidth: 1, borderStyle: 'solid',
  },
  seloOk: { color: t.ok, borderColor: t.ok, background: t.okFundo },
  seloAtencao: { color: t.atencao, borderColor: t.atencao, background: t.atencaoFundo },
  cartaoRitmo: {
    ...tipo('display'), ...numeros,
    display: 'flex', alignItems: 'baseline', gap: espaco.sm,
  },
  cartaoRitmoSufixo: { ...tipo('legenda'), color: t.textoFraco },
  cartaoLinhas: {
    display: 'flex', flexDirection: 'column', gap: 2,
    ...tipo('legenda'), color: t.textoMedio,
  },
  motivos: {
    margin: 0, paddingLeft: espaco.lg,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  motivo: { ...tipo('legenda'), color: t.atencao },

  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, overflowX: 'auto',
  },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
    ...rotulo(t.textoFraco), background: '#F8F9FB',
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdCurto: {
    padding: espaco.lg, ...tipo('corpo'), color: t.textoMedio,
    borderBottom: `1px solid ${t.borda}`,
    // Nome comprido nao pode empilhar uma palavra por linha.
    maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  tdFraco: {
    padding: espaco.lg, ...tipo('legenda'), color: t.textoFraco,
    borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNum: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpo'), ...numeros,
    color: t.textoMedio, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
  tdNumForte: {
    padding: espaco.lg, textAlign: 'right', ...tipo('corpoF'), ...numeros,
    color: t.texto, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
  },
};

/* Impressao: preto sobre branco, tamanhos em pt-espirito (px pequenos). */
const imp = {
  folha: { color: '#000', fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif", fontSize: 11 },
  cabecalho: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 16, borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12,
  },
  logo: { height: 28, width: 'auto', display: 'block', marginBottom: 6 },
  titulo: { fontSize: 16, fontWeight: 700, margin: 0 },
  emissao: { fontSize: 9, color: '#444', textAlign: 'right' },

  secao: { marginBottom: 14 },
  secaoTitulo: {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
    margin: '0 0 6px', borderBottom: '1px solid #999', paddingBottom: 3,
  },
  texto: { margin: '0 0 6px', lineHeight: 1.5 },
  listaCriterios: { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 },
  itemCriterio: { lineHeight: 1.5 },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 10 },
  th: {
    textAlign: 'left', padding: '4px 6px', fontWeight: 700,
    borderBottom: '1px solid #000', whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: '4px 6px', fontWeight: 700,
    borderBottom: '1px solid #000', whiteSpace: 'nowrap',
  },
  td: { padding: '3px 6px', borderBottom: '1px solid #CCC', verticalAlign: 'top' },
  tdNum: {
    padding: '3px 6px', borderBottom: '1px solid #CCC', textAlign: 'right',
    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },

  rodape: { marginTop: 10, paddingTop: 6, borderTop: '1px solid #999', fontSize: 9, color: '#444', lineHeight: 1.5 },
};
