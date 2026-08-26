import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import {
  conferenciaRapida, formatarDuracao, formatarSegundos, resumirConferencias,
} from '../../domain/cronoanalise.js';
import { listarConferenciasServidor } from '../../lib/api.js';
import Cabecalho from '../../components/Cabecalho.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';

/**
 * RELATORIO DE CONFERENCIAS — o estudo das furadeiras, no PC.
 *
 * As conferencias rapidas nascem no celular, sobem pela fila offline e
 * chegam aqui para virar leitura de gestao: cada MAQUINA vira um bloco de
 * resumo (medicoes, ritmo medio ponderado, melhor e pior registro com a
 * peca), e a tabela embaixo guarda o dado bruto, mais recente primeiro.
 *
 * O ritmo medio e' ponderado pelo tempo — soma de pecas sobre soma de
 * duracao — porque e' esse numero que aguenta decisao de capacidade;
 * media simples de taxas deixaria uma medicao de 5 minutos valer o mesmo
 * que uma de 2 horas.
 *
 * Imprimir usa a propria tela: o tema claro da analise ja' e' o do papel.
 * Cabecalho e filtros ficam fora do papel (.somente-tela); o titulo de
 * impressao entra no lugar (.somente-impressao).
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
      </div>

      <div className="somente-impressao" style={est.tituloImpressao}>
        <div style={est.tituloImpressaoNome}>Patrimar Móveis — Conferências rápidas</div>
        <div style={est.tituloImpressaoSub}>
          Estudo por máquina · impresso em {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

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
              <div className="somente-tela" style={est.filtro} role="group" aria-label="Filtrar por máquina">
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
                  <div style={est.cartaoTitulo}>{g.maquina}</div>
                  <div style={est.cartaoRitmo}>
                    {Math.round(g.ritmoMedio)}
                    <span style={est.cartaoRitmoSufixo}>pç/h médio</span>
                  </div>
                  <div style={est.cartaoLinhas}>
                    <span>{g.n} conferência(s) · {g.totalPecas} pç · {formatarDuracao(g.totalMs)}</span>
                    <span>Ciclo médio: {formatarSegundos(g.cicloMedioMs)} s/pç</span>
                    {g.melhor && (
                      <span>
                        Melhor: {Math.round(g.melhor.ritmo)} pç/h{g.melhor.peca ? ` (${g.melhor.peca})` : ''}
                        {' · '}Pior: {Math.round(g.pior.ritmo)} pç/h{g.pior.peca ? ` (${g.pior.peca})` : ''}
                      </span>
                    )}
                  </div>
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
                        <td style={est.td}>{c.maquina || '—'}</td>
                        <td style={est.td}>{c.peca || '—'}</td>
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

  tituloImpressao: { padding: `${espaco.lg}px 0 0`, textAlign: 'center' },
  tituloImpressaoNome: { ...tipo('titulo') },
  tituloImpressaoSub: { ...tipo('legenda'), color: t.textoFraco, marginTop: 2 },

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
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  cartaoMaquina: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.sm,
    // Um cartao cortado no meio da pagina impressa nao informa nada.
    breakInside: 'avoid',
  },
  cartaoTitulo: { ...tipo('corpoF') },
  cartaoRitmo: {
    ...tipo('display'), ...numeros,
    display: 'flex', alignItems: 'baseline', gap: espaco.sm,
  },
  cartaoRitmoSufixo: { ...tipo('legenda'), color: t.textoFraco },
  cartaoLinhas: {
    display: 'flex', flexDirection: 'column', gap: 2,
    ...tipo('legenda'), color: t.textoMedio,
  },

  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, overflow: 'hidden',
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
  td: { padding: espaco.lg, ...tipo('corpo'), color: t.textoMedio, borderBottom: `1px solid ${t.borda}` },
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
