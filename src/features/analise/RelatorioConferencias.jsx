import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  CRITERIOS_CONFERENCIA, conferenciaRapida, faixaHoraria, formatarDuracao,
  nomeChave, resumirConferencias, rotuloMotivo, somarParadas,
} from '../../domain/cronoanalise.js';
import { analisarConferencias } from '../../domain/analiseConferencias.js';
import { codigoPreferido, useMotivosParada } from '../../lib/motivosParada.js';
import {
  analisarConferenciasComIa, arquivarConferencia, excluirConferencia, listarCadastroMaquinas,
  listarConferenciasServidor, salvarParadasConferencia,
} from '../../lib/api.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import { GraficoRitmoMaquinas } from './graficos.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';

/**
 * RELATORIO DAS FURADEIRAS — modelo BASICO, no PC.
 *
 * As medicoes nascem no celular, sobem pela fila offline e chegam aqui.
 * Redesenho de ago/2026, a pedido de quem usa: o relatorio anterior
 * carimbava "AMOSTRA INSUFICIENTE" em quase tudo e falava em CV%, ciclo do
 * motor e criterios — jargao que so' o analista lia. Este aqui responde as
 * perguntas de qualquer pessoa da fabrica, em portugues:
 *
 *   - quantas pecas por hora (e POR MINUTO) cada maquina faz;
 *   - quantas pecas por hora cada PECA faz em cada maquina;
 *   - quanto tempo a maquina rodou e quanto ficou parada, e por que.
 *
 * O criterio de amostra NAO sumiu do calculo (resumirConferencias segue se
 * autoavaliando) — ele virou uma nota discreta em cinza ("ainda em
 * medicao"), nunca um carimbo na frente do numero.
 *
 * O FILTRO por maquina, na lateral, vale para o relatorio INTEIRO:
 * numeros do topo, cartoes, quadros, grafico E a folha impressa. O que
 * esta' na tela e' o que sai no papel — e' assim que se imprime o relatorio
 * de uma maquina so'.
 *
 * O ritmo medio e' ponderado pelo tempo (soma de pecas sobre soma do tempo
 * com a maquina rodando): media simples de taxas deixaria uma medicao de
 * 5 minutos valer o mesmo que uma de 2 horas.
 */
/* Id do item "Todas" na lateral. Filtro nenhum e' `null` no estado; a
   lateral precisa de um id de verdade para marcar o ativo. */
const TODAS = '__todas';

/** Pecas por minuto a partir do ritmo em pecas/hora — pedido de 31/08. */
const porMinuto = (pecasPorHora) => (pecasPorHora / 60).toFixed(1);

export default function RelatorioConferencias({ aoVoltar }) {
  const [linhas, setLinhas] = useState([]);
  const [outras, setOutras] = useState(0);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [editandoParadas, setEditandoParadas] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  useEffect(() => { carregar(verArquivadas); }, [verArquivadas]);

  /**
   * O GRUPO da maquina (0002 · FURADEIRA) vem do cadastro, ligado pelo
   * nome — a medicao grava texto, e a ligacao usa a mesma chave
   * normalizada do agrupamento. Falha de carga nao derruba o relatorio:
   * sem cadastro, as maquinas simplesmente aparecem sem grupo.
   */
  const [mapaGrupos, setMapaGrupos] = useState(() => new Map());
  useEffect(() => {
    listarCadastroMaquinas()
      .then(({ maquinas }) => {
        const mapa = new Map();
        for (const m of maquinas) {
          if (m.grupo_codigo) mapa.set(nomeChave(m.nome), `${m.grupo_codigo} · ${m.grupo_nome}`);
        }
        setMapaGrupos(mapa);
      })
      .catch(() => {});
  }, []);
  const grupoDe = (maquina) => mapaGrupos.get(nomeChave(maquina)) || null;

  async function carregar(arquivadas = verArquivadas) {
    setEstado('carregando');
    try {
      const r = await listarConferenciasServidor({ arquivadas });
      setLinhas(r.conferencias || []);
      setOutras(r.outras || 0);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  async function alternarArquivo(c) {
    setOcupado(c.id);
    setErro(null);
    try { await arquivarConferencia(c.id, !c.arquivada); await carregar(); }
    catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  async function gravarParadas(c, paradas) {
    setOcupado(c.id);
    setErro(null);
    try {
      await salvarParadasConferencia(c.id, paradas);
      setEditandoParadas(null);
      await carregar();
    } catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  async function excluir(c) {
    setOcupado(c.id);
    setErro(null);
    try { await excluirConferencia(c.id); setConfirmando(null); await carregar(); }
    catch (e) { setErro(e.message); }
    setOcupado(null);
  }

  const resumo = useMemo(() => resumirConferencias(linhas), [linhas]);
  // Ritmo POR PECA: mesmo calculo, agrupado por peca x maquina — e' o
  // numero que dimensiona carga e lote. Ver resumirConferencias.
  const resumoPecas = useMemo(() => resumirConferencias(linhas, { porPeca: true }), [linhas]);

  /**
   * O filtro da lateral corta o relatorio INTEIRO — medicoes, resumos,
   * numeros do topo e a folha impressa. Uma unica regra ("o que esta' na
   * tela e' o que imprime") e' mais facil de entender do que um filtro que
   * vale para umas secoes e nao para outras.
   */
  const visiveis = useMemo(
    () => (filtro
      ? linhas.filter((c) => nomeChave(String(c.maquina || '').trim() || 'Sem máquina') === nomeChave(filtro))
      : linhas),
    [linhas, filtro],
  );
  const resumoVisivel = useMemo(
    () => (filtro ? resumo.filter((g) => nomeChave(g.maquina) === nomeChave(filtro)) : resumo),
    [resumo, filtro],
  );
  const resumoPecasVisivel = useMemo(
    () => (filtro ? resumoPecas.filter((g) => nomeChave(g.maquina) === nomeChave(filtro)) : resumoPecas),
    [resumoPecas, filtro],
  );

  /**
   * Com a lateral filtrada numa maquina, o grafico abre POR MEDICAO:
   * uma barra por medicao, com a peca embaixo — e' assim que se enxerga
   * qual peca puxa o ritmo para cima ou para baixo. Sem filtro, cada
   * maquina e' uma barra so' (a media ponderada), porque duas barras da
   * mesma maquina nao se comparam com a barra unica da vizinha.
   *
   * Da esquerda para a direita, da mais antiga para a mais recente: e' a
   * ordem em que o posto foi medido. A hachura aqui marca MEDICAO CURTA
   * (menos de 5 min de maquina rodando) — a legenda que vai junto diz isso.
   */
  const barrasDoFiltro = useMemo(() => {
    if (!filtro) return null;
    return [...visiveis].reverse().map((c) => {
      const calc = conferenciaRapida({
        duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
        ciclosPorPeca: c.ciclos_por_peca,
      });
      if (!calc || !(calc.pecasPorHora > 0)) return null;
      const peca = String(c.peca || '').trim();
      return {
        chave: c.id,
        rotulo: faixaHoraria(c) || formatarDataHora(c.salvo_em),
        nota: peca ? (peca.length > 20 ? `${peca.slice(0, 19)}…` : peca) : null,
        ritmoMedio: calc.pecasPorHora,
        confiavel: calc.produtivoMs >= CRITERIOS_CONFERENCIA.minPeriodoMs,
        maquina: filtro,
      };
    }).filter(Boolean);
  }, [filtro, visiveis]);

  /**
   * Os numeros do topo, em palavras que qualquer pessoa le: ritmo medio
   * (pecas/hora E pecas/minuto), quantas medicoes, quanto tempo a maquina
   * rodou e quanto ficou parada. Seguem o filtro da lateral.
   */
  const painel = useMemo(() => {
    if (!visiveis.length) return null;
    let totalMs = 0; let paradaMs = 0; let pecasTot = 0;
    const todasParadas = [];
    for (const c of visiveis) {
      const dur = Number(c.duracao_ms) || 0;
      const par = somarParadas(c.paradas);
      totalMs += dur;
      paradaMs += Math.min(par.totalMs, dur);
      pecasTot += Number(c.pecas) || 0;
      if (c.paradas?.length) todasParadas.push(...c.paradas);
    }
    const produtivoMs = totalMs - paradaMs;
    return {
      n: visiveis.length,
      maquinas: resumoVisivel.length,
      pecasTot,
      totalMs,
      produtivoMs,
      paradaMs,
      ritmoMedio: produtivoMs > 0 ? (pecasTot * 3600000) / produtivoMs : null,
      pareto: somarParadas(todasParadas),
    };
  }, [visiveis, resumoVisivel]);

  /* A mesma lateral da lista e do estudo. O filtro por maquina vai para
     dentro dela pelo mesmo motivo que os produtos foram na lista: e'
     navegacao, nao um controle do conteudo.

     O bloco aparece MESMO com uma maquina so' (mudanca de 31/08): ele
     sumia com uma unica maquina medida, e o usuario nao achava onde
     filtrar para imprimir — controle que aparece e some nao se aprende. */
  const secoes = resumo.length
    ? [{ id: TODAS, rotulo: 'Todas', contador: linhas.length },
       ...resumo.map((g) => ({ id: g.maquina, rotulo: g.maquina, contador: g.n }))]
    : [];

  return (
    <div style={est.tela}>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Estudos"
          contexto={{
            rotulo: 'Relatório',
            titulo: 'Furadeiras',
            subtitulo: 'Ritmo por máquina · peças/hora e peças/minuto',
          }}
          acaoPrimaria={estado === 'pronto' && linhas.length > 0 && !verArquivadas
            ? {
                // O rotulo diz O QUE vai sair no papel: com uma maquina
                // escolhida na lateral, imprime so' ela.
                rotulo: secoes.length ? (filtro ? 'Imprimir esta máquina' : 'Imprimir todas') : 'Imprimir',
                aoClicar: () => window.print(),
              }
            : undefined}
          secoes={secoes}
          secoesRotulo="Máquinas"
          secaoAtiva={filtro ?? TODAS}
          aoTrocarSecao={(id) => setFiltro(id === TODAS ? null : id)}
          acoes={estado === 'pronto' && (verArquivadas || outras > 0)
            ? [{
                rotulo: verArquivadas ? 'Ver ativas' : `Arquivadas ${outras}`,
                aoClicar: () => { setFiltro(null); setVerArquivadas((v) => !v); },
              }]
            : []}
          acoesRotulo="Este relatório"
        />

        <main style={est.conteudoLateral}>
          {estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando medições" texto="Buscando as medições sincronizadas." />
          )}

          {estado === 'erro' && (
            <EstadoVazio
              modo="analise"
              titulo="Não foi possível carregar"
              texto={erro}
              acao={(
                <button type="button" style={est.botaoImprimir} onClick={() => carregar()}>
                  Tentar de novo
                </button>
              )}
            />
          )}

          {estado === 'pronto' && !linhas.length && (
            <EstadoVazio
              modo="analise"
              titulo="Nenhuma medição sincronizada"
              texto="Esta é a tela das furadeiras: no celular, abra Ritmo da furadeira, informe máquina, peça e horários, e a medição aparece aqui assim que o aparelho sincroniza. Para embalagem — ciclo a ciclo, com tempo padrão — use um estudo de tempos."
            />
          )}

          {/* Falha de acao (arquivar, excluir) precisa APARECER: antes ela era
              gravada no estado e nunca renderizada — o clique nao fazia nada
              visivel, e o usuario concluia que o botao estava quebrado. */}
          {erro && estado === 'pronto' && (
            <div style={est.faixaErro} role="alert">
              <span style={{ flex: 1, minWidth: 0 }}>{erro}</span>
              <button type="button" style={est.botaoLinha} onClick={() => setErro(null)}>
                Fechar
              </button>
            </div>
          )}

          {estado === 'pronto' && linhas.length > 0 && (
            <>
              {!verArquivadas && painel && (
                <section style={est.kpis} aria-label="Resumo do período">
                  {[
                    {
                      rot: 'Ritmo médio',
                      val: painel.ritmoMedio != null ? `${Math.round(painel.ritmoMedio)} pç/h` : '—',
                      sub: painel.ritmoMedio != null
                        ? `${porMinuto(painel.ritmoMedio)} peças por minuto`
                        : 'sem tempo de máquina rodando',
                    },
                    { rot: 'Medições', val: String(painel.n), sub: `${painel.maquinas} máquina(s) · ${painel.pecasTot} peças` },
                    { rot: 'Tempo rodando', val: formatarDuracao(painel.produtivoMs), sub: `de ${formatarDuracao(painel.totalMs)} observados` },
                    {
                      rot: 'Tempo parado',
                      val: painel.paradaMs > 0 ? formatarDuracao(painel.paradaMs) : '—',
                      sub: painel.pareto.setupMs > 0
                        ? `${formatarDuracao(painel.pareto.setupMs)} em troca/setup`
                        : 'nenhuma parada marcada',
                    },
                  ].map((k) => (
                    <div key={k.rot} style={est.kpi}>
                      <div style={est.kpiRotulo}>{k.rot}</div>
                      <div style={est.kpiValor}>{k.val}</div>
                      <div style={est.kpiSub}>{k.sub}</div>
                    </div>
                  ))}
                </section>
              )}

              <section style={est.resumoGrade} aria-label="Resumo por máquina">
                {resumoVisivel.map((g) => (
                  <div key={g.maquina} style={est.cartaoMaquina}>
                    <div style={est.cartaoTopo}>
                      <div style={est.cartaoTitulo}>
                        {g.maquina}
                        {grupoDe(g.maquina) && <span style={est.cartaoGrupo}>{grupoDe(g.maquina)}</span>}
                      </div>
                    </div>
                    <div style={est.cartaoRitmo}>
                      {Math.round(g.ritmoMedio)}
                      <span style={est.cartaoRitmoSufixo}>peças por hora</span>
                    </div>
                    <div style={est.cartaoRitmoMinuto}>{porMinuto(g.ritmoMedio)} peças por minuto</div>
                    <div style={est.cartaoLinhas}>
                      <span>{g.n} medição(ões) · {g.totalPecas} peças · {formatarDuracao(g.totalProdutivoMs)} rodando</span>
                      {g.totalParadaMs > 0 && (
                        <span>
                          Parado: {formatarDuracao(g.totalParadaMs)}
                          {g.totalSetupMs > 0 && ` (troca/setup ${formatarDuracao(g.totalSetupMs)})`}
                        </span>
                      )}
                      {g.n >= 2 && g.melhor && (
                        <span>
                          Melhor: {Math.round(g.melhor.ritmo)} pç/h{g.melhor.peca ? ` (${g.melhor.peca})` : ''}
                          {' · '}Pior: {Math.round(g.pior.ritmo)} pç/h{g.pior.peca ? ` (${g.pior.peca})` : ''}
                        </span>
                      )}
                    </div>
                    {/* Nota em cinza, nunca carimbo: o numero ja' e' o
                        resultado — a nota so' lembra que ele ainda assenta. */}
                    {!g.confiavel && (
                      <div style={est.notaPoucas}>
                        Ainda em medição — o número fica mais certeiro com mais medições.
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {/* Ritmo POR PECA — o numero que planeja carga e lote.
                  So' na visao ativa: ritmo nao sai de arquivadas. */}
              {!verArquivadas && resumoPecasVisivel.length > 0 && (
                <section style={est.painel} aria-label="Ritmo por peça">
                  {/* O mesmo respiro das celulas: sem ele o titulo encosta na
                      borda do cartao e parece cortado (apontado em 28/08). */}
                  <div style={{ padding: `${espaco.lg}px ${espaco.lg}px ${espaco.sm}px` }}>
                    <h2 style={est.iaTitulo}>Ritmo por peça</h2>
                    <p style={est.iaTexto}>
                      Quantas peças saem por hora e por minuto, peça a peça, com a máquina rodando.
                    </p>
                  </div>
                  <table style={est.tabela}>
                    <thead>
                      <tr>
                        <th style={est.th}>Peça</th>
                        <th style={est.th}>Máquina</th>
                        <th style={est.thNum}>Medições</th>
                        <th style={est.thNum}>Peças</th>
                        <th style={est.thNum}>Tempo rodando</th>
                        <th style={est.thNum}>Peças/hora</th>
                        <th style={est.thNum}>Peças/min</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoPecasVisivel.map((g) => (
                        <tr key={`${g.maquina}·${g.peca}`}>
                          <td style={est.tdCurto}>{g.peca}</td>
                          <td style={est.tdCurto}>{g.maquina}</td>
                          <td style={est.tdNum}>{g.n}</td>
                          <td style={est.tdNum}>{g.totalPecas}</td>
                          <td style={est.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                          <td style={est.tdNumForte}>{Math.round(g.ritmoMedio)}</td>
                          <td style={est.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {!verArquivadas && resumoVisivel.length > 0 && (
                <section style={est.painelGrafico} aria-label="Ritmo por máquina">
                  {filtro && barrasDoFiltro?.length ? (
                    <GraficoRitmoMaquinas
                      maquinas={barrasDoFiltro}
                      titulo={`Medições — ${filtro}`}
                      subtitulo="Peças/hora de cada medição, da mais antiga para a mais recente"
                      rotuloOk="Medição"
                      rotuloFraco="Medição curta (menos de 5 min rodando)"
                      notaFraca="medição curta"
                    />
                  ) : (
                    <GraficoRitmoMaquinas
                      maquinas={resumoVisivel}
                      subtitulo="Peças por hora de cada máquina, com a máquina rodando"
                      rotuloOk="Ritmo medido"
                      rotuloFraco="Ainda em medição"
                      notaFraca="ainda em medição"
                    />
                  )}
                </section>
              )}

              {!verArquivadas && painel && painel.pareto.totalMs > 0 && (
                <div style={est.duasColunas}>
                  <section style={est.painelMiolo} aria-label="Paradas do período">
                    <h2 style={est.iaTitulo}>Paradas</h2>
                    <p style={est.iaTexto}>
                      {formatarDuracao(painel.pareto.totalMs)} de máquina parada — os maiores motivos primeiro
                    </p>
                    <div style={{ display: 'grid', gap: espaco.md, marginTop: espaco.md }}>
                      {painel.pareto.porMotivo.map((m) => (
                        <div key={m.motivo} style={est.paretoLinha}>
                          <span>{m.rotulo}</span>
                          <span style={est.paretoTrilha}>
                            <i style={{ ...est.paretoBarra, width: `${Math.max(4, m.pct)}%` }} />
                          </span>
                          <b style={{ whiteSpace: 'nowrap' }}>{formatarDuracao(m.ms)}</b>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}

              {!verArquivadas && (
                <AnalisePeriodo
                  resumo={resumoVisivel}
                  resumoPecas={resumoPecasVisivel}
                  conferencias={visiveis}
                />
              )}

              <section style={est.painel} aria-label={verArquivadas ? 'Medições arquivadas' : 'Todas as medições'}>
                <table style={est.tabela}>
                  <thead>
                    <tr>
                      <th style={est.th}>Data</th>
                      <th style={est.th}>Máquina</th>
                      <th style={est.th}>Peça</th>
                      <th style={est.th}>Horários</th>
                      <th style={est.thNum}>Período</th>
                      <th style={est.thNum}>Parado</th>
                      <th style={est.thNum}>Peças</th>
                      <th style={est.thNum}>Peças/hora</th>
                      <th style={est.thNum}>Peças/min</th>
                      <th style={est.th} aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => {
                      const calc = conferenciaRapida({
                        duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
                        ciclosPorPeca: c.ciclos_por_peca,
                      });
                      const par = somarParadas(c.paradas);
                      return (
                        <tr key={c.id}>
                          <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                          <td style={est.tdCurto}>{c.maquina || '—'}</td>
                          <td style={est.tdCurto}>{c.peca || '—'}</td>
                          <td style={est.tdFraco}>
                            {faixaHoraria(c) || '—'}
                          </td>
                          <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                          <td style={est.tdNum} title={par.porMotivo.map((m) => `${m.rotulo}: ${formatarDuracao(m.ms)}`).join(' · ')}>
                            {par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}
                          </td>
                          <td style={est.tdNum}>{c.pecas}</td>
                          <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdNum}>{calc ? porMinuto(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdAcoes}>
                            <button
                              type="button"
                              style={est.botaoLinha}
                              onClick={() => setEditandoParadas(c)}
                              disabled={ocupado === c.id}
                              title="Marcar setup e outras paradas deste período"
                            >
                              {par.porMotivo.length ? `Paradas (${par.porMotivo.length})` : 'Paradas'}
                            </button>
                            <button
                              type="button"
                              style={est.botaoLinha}
                              onClick={() => alternarArquivo(c)}
                              disabled={ocupado === c.id}
                              title={c.arquivada
                                ? 'Voltar para os cálculos'
                                : 'Tirar dos cálculos sem apagar (medição atípica)'}
                            >
                              {c.arquivada ? 'Restaurar' : 'Arquivar'}
                            </button>
                            <button
                              type="button"
                              style={est.botaoExcluir}
                              onClick={() => setConfirmando(c)}
                              disabled={ocupado === c.id}
                              aria-label={`Excluir medição de ${c.maquina || 'sem máquina'}`}
                              title="Excluir de vez (registro errado)"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </main>

        {verVersoes && (
          <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />
        )}

        {editandoParadas && (
          <EditorParadas
            conferencia={editandoParadas}
            erro={erro}
            ocupado={ocupado === editandoParadas.id}
            aoFechar={() => { setErro(null); setEditandoParadas(null); }}
            aoGravar={(paradas) => gravarParadas(editandoParadas, paradas)}
          />
        )}

        {confirmando && (
          <div style={est.modal} role="dialog" aria-label="Excluir medição">
            <div style={est.caixaModal}>
              <h2 style={est.tituloModal}>Excluir medição?</h2>
              <p style={est.textoModal}>
                <strong>{[confirmando.maquina, confirmando.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
                {faixaHoraria(confirmando) ? ` · ${faixaHoraria(confirmando)}` : ''}
                {' · '}{confirmando.pecas} pç
              </p>
              <p style={est.textoModal}>
                A exclusão é <strong>definitiva</strong>. Se a medição é real mas atípica
                (setup no meio do período, por exemplo), prefira <strong>Arquivar</strong>:
                ela sai dos cálculos e continua guardada.
              </p>
              {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

              <div style={est.acoesModal}>
                <button type="button" style={est.botaoSecundario} onClick={() => { setErro(null); setConfirmando(null); }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  style={{ ...est.botaoPerigo, flex: 1 }}
                  onClick={() => excluir(confirmando)}
                  disabled={ocupado === confirmando.id}
                >
                  {ocupado === confirmando.id ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {estado === 'pronto' && linhas.length > 0 && (
        <ImpressaoConferencias
          linhas={visiveis}
          resumo={resumoVisivel}
          resumoPecas={resumoPecasVisivel}
          grupoDe={grupoDe}
          filtro={filtro}
        />
      )}
    </div>
  );
}

/**
 * CADASTRO DE PARADAS de uma medicao — no PC.
 *
 * Quem confere no corredor raramente para para digitar o setup; quem monta
 * o relatorio, sim. Aqui a parada e' reconstituida depois, com o
 * apontamento na mao: motivo, minutos e uma observacao livre.
 *
 * A lista e' gravada INTEIRA (nao incremental): o que esta na tela vira o
 * estado final das paradas daquela medicao, entao corrigir um numero e
 * apagar uma linha usam o mesmo caminho e o mesmo botao.
 *
 * A soma nao pode alcancar o periodo: sem tempo de maquina rodando nao ha
 * ritmo, e a medicao sairia dos calculos sem dizer por que. O aviso
 * aparece antes de gravar — o servidor recusa igual, mas errar no botao e'
 * pior que errar antes dele.
 */
function EditorParadas({ conferencia, erro, ocupado, aoFechar, aoGravar }) {
  const motivos = useMotivosParada();
  const duracaoMs = Number(conferencia.duracao_ms) || 0;
  const [linhas, setLinhas] = useState(() => (conferencia.paradas || []).map((p, i) => ({
    chave: `p${i}`,
    motivo: p.motivo || 'outro',
    minutos: String(+((Number(p.duracaoMs ?? p.duracao_ms) || 0) / 60000).toFixed(2)),
    observacao: p.observacao || '',
  })));
  const [proxima, setProxima] = useState(0);

  const limpas = linhas
    .map((l) => ({
      motivo: l.motivo,
      duracaoMs: Math.round((Number(String(l.minutos).replace(',', '.')) || 0) * 60000),
      observacao: l.observacao.trim() || null,
    }))
    .filter((l) => l.duracaoMs > 0);

  const somaMs = limpas.reduce((acc, l) => acc + l.duracaoMs, 0);
  const excede = somaMs >= duracaoMs;
  const produtivoMs = Math.max(0, duracaoMs - somaMs);

  const adicionar = (motivo) => {
    setLinhas((l) => [...l, { chave: `n${proxima}`, motivo, minutos: '', observacao: '' }]);
    setProxima((n) => n + 1);
  };
  const alterar = (chave, campo, valor) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, [campo]: valor } : x)));
  const remover = (chave) => setLinhas((l) => l.filter((x) => x.chave !== chave));

  return (
    <div style={est.modal} role="dialog" aria-label="Paradas da medição">
      <div style={{ ...est.caixaModal, maxWidth: 620 }}>
        <h2 style={est.tituloModal}>Paradas do período</h2>
        <p style={est.textoModal}>
          <strong>{[conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
          {faixaHoraria(conferencia) ? ` · ${faixaHoraria(conferencia)}` : ''}
          {' · '}{formatarDuracao(duracaoMs)} · {conferencia.pecas} pç
        </p>
        <p style={est.textoModal}>
          Marque quanto tempo a máquina ficou parada dentro deste período. O ritmo
          passa a ser calculado sobre o tempo em que ela <strong>rodou</strong> — e a
          medição continua contando, em vez de ser arquivada.
        </p>

        <div style={est.linhaBotoesParada}>
          <button
            type="button" style={est.botaoSetup}
            onClick={() => adicionar(codigoPreferido(motivos, 'setup'))}
          >
            + Setup / troca
          </button>
          <button
            type="button" style={est.botaoSecundario}
            onClick={() => adicionar(codigoPreferido(motivos, 'falta_material'))}
          >
            + Outra parada
          </button>
        </div>

        {linhas.length === 0 ? (
          <p style={est.textoModal}>
            Nenhuma parada marcada — o período inteiro conta como máquina rodando.
          </p>
        ) : (
          <div style={est.listaParadas}>
            {linhas.map((l) => (
              <div key={l.chave} style={est.linhaParada}>
                <select
                  value={l.motivo}
                  onChange={(ev) => alterar(l.chave, 'motivo', ev.target.value)}
                  style={est.selectMotivo}
                  aria-label="Motivo da parada"
                >
                  {motivos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={l.minutos}
                  onChange={(ev) => alterar(l.chave, 'minutos', ev.target.value)}
                  style={est.inputMinutos}
                  aria-label={`Minutos parada — ${rotuloMotivo(l.motivo)}`}
                />
                <span style={est.sufixoMinutos}>min</span>
                <input
                  type="text"
                  placeholder="Observação (opcional)"
                  value={l.observacao}
                  onChange={(ev) => alterar(l.chave, 'observacao', ev.target.value)}
                  style={est.inputObs}
                  aria-label="Observação da parada"
                />
                <button
                  type="button"
                  style={est.botaoExcluir}
                  onClick={() => remover(l.chave)}
                  aria-label={`Remover parada ${rotuloMotivo(l.motivo)}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={est.textoModal}>
          Período {formatarDuracao(duracaoMs)} · parado {somaMs > 0 ? formatarDuracao(somaMs) : '—'}
          {' · '}máquina rodando {produtivoMs > 0 ? formatarDuracao(produtivoMs) : '—'}
        </p>

        {excede && (
          <div style={est.faixaErro} role="alert">
            As paradas somam o período inteiro — não sobraria tempo de máquina rodando.
          </div>
        )}
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...est.botaoImprimir, flex: 1 }}
            onClick={() => aoGravar(limpas)}
            disabled={ocupado || excede}
          >
            {ocupado ? 'Gravando...' : 'Gravar paradas'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ANALISE DO PERIODO — o algoritmo primeiro, a IA como opcao.
 *
 * Ate' 31/08 a leitura dos numeros so' existia via IA: cada clique gastava
 * a chave do usuario para dizer o que os proprios numeros ja' diziam. A
 * analise agora e' GERADA POR REGRA (analisarConferencias, no dominio):
 * aparece na hora, de graca, offline — e identica para os mesmos numeros.
 *
 * A IA continua como botao OPCIONAL, discreto, para quem quer uma segunda
 * leitura em texto corrido: sobe o mesmo resumo por maquina de sempre
 * (incluindo `confiavel` e os motivos). Ambas seguem o filtro da lateral.
 */
function AnalisePeriodo({ resumo, resumoPecas, conferencias }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);

  const secoes = useMemo(
    () => analisarConferencias({ maquinas: resumo, pecas: resumoPecas, conferencias }),
    [resumo, resumoPecas, conferencias],
  );

  async function analisar() {
    setRodando(true);
    setErro(null);
    try {
      setResposta(await analisarConferenciasComIa({
        maquinas: resumo.map((g) => ({
          maquina: g.maquina,
          n: g.n,
          pecas: g.totalPecas,
          minutos: +(g.totalMs / 60000).toFixed(1),
          minutosProdutivos: +(g.totalProdutivoMs / 60000).toFixed(1),
          minutosParados: +(g.totalParadaMs / 60000).toFixed(1),
          minutosSetup: +(g.totalSetupMs / 60000).toFixed(1),
          disponibilidadePct: +g.disponibilidadePct.toFixed(1),
          paradas: g.paradasPorMotivo.map((m) => ({ motivo: m.rotulo, minutos: +(m.ms / 60000).toFixed(1) })),
          ritmo: +g.ritmoMedio.toFixed(1),
          cicloSeg: +(g.cicloMedioMs / 1000).toFixed(2),
          acionamentos: g.totalAcionamentos,
          cicloMotorSeg: +(g.cicloMotorMs / 1000).toFixed(2),
          cvPct: g.cvPct != null ? +g.cvPct.toFixed(1) : null,
          melhor: g.melhor ? +g.melhor.ritmo.toFixed(1) : null,
          pior: g.pior ? +g.pior.ritmo.toFixed(1) : null,
          confiavel: g.confiavel,
          motivos: g.motivos,
        })),
      }));
    } catch (e) { setErro(e.message); }
    setRodando(false);
  }

  return (
    <section style={est.painelIa} aria-label="Análise do período">
      <div style={{ minWidth: 0 }}>
        <h2 style={est.iaTitulo}>Análise do período</h2>
        <p style={est.iaTexto}>
          Gerada na hora pelos números deste relatório — sem IA, sem custo, funciona sem internet.
        </p>
      </div>

      {secoes.map((s) => (
        <div key={s.titulo} style={est.analiseSecao}>
          <h3 style={est.analiseTitulo}>{s.titulo}</h3>
          {s.linhas.map((l) => (
            <p key={l} style={est.analiseLinha}>{l}</p>
          ))}
        </div>
      ))}

      {/* A IA vira opcao, atras de um botao discreto: quem quiser uma
          segunda leitura em texto corrido paga o token; ninguem mais
          precisa da chave para ter analise. */}
      <div style={est.iaOpcional}>
        <span style={est.iaTexto}>
          Quer uma segunda leitura, em texto corrido? Opcional — usa a chave da IA.
        </span>
        <button type="button" style={est.botaoSecundario} onClick={analisar} disabled={rodando}>
          {rodando ? 'Analisando...' : 'Analisar com IA'}
        </button>
      </div>

      {erro && <div style={est.iaErro}>{erro}</div>}

      {resposta && (
        <div style={est.iaResposta}>
          <div style={est.iaRespostaTexto}>{resposta.analise}</div>
          <div style={est.iaMeta}>
            Gerada por {resposta.modelo}
            {resposta.uso?.saida ? ` · ${resposta.uso.saida} tokens` : ''} — confira antes de
            decidir: a IA lê os números, não o posto.
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * FOLHA DAS FURADEIRAS — A4 retrato, modelo basico.
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
function ImpressaoConferencias({ linhas, resumo, resumoPecas, grupoDe, filtro }) {
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

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Ritmo das Furadeiras{filtro ? ` — ${filtro}` : ''}</h1>
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

      {/* Ritmo por peca: o numero que o PCP leva para dimensionar carga e lote. */}
      {resumoPecas?.length > 0 && (
        <>
          <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Ritmo por peça</h2>
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.th}>Peça</th>
                <th style={imp.th}>Máquina</th>
                <th style={imp.thNum}>Medições</th>
                <th style={imp.thNum}>Peças</th>
                <th style={imp.thNum}>Tempo rodando</th>
                <th style={imp.thNum}>Peças/hora</th>
                <th style={imp.thNum}>Peças/min</th>
              </tr>
            </thead>
            <tbody>
              {resumoPecas.map((g) => (
                <tr key={`${g.maquina}·${g.peca}`}>
                  <td style={imp.td}>{g.peca}</td>
                  <td style={imp.td}>{g.maquina}</td>
                  <td style={imp.tdNum}>{g.n}</td>
                  <td style={imp.tdNum}>{g.totalPecas}</td>
                  <td style={imp.tdNum}>{formatarDuracao(g.totalProdutivoMs)}</td>
                  <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
                  <td style={imp.tdNum}>{porMinuto(g.ritmoMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {['Analista responsável', 'Supervisão / PCP'].map((papel) => (
          <div key={papel} style={imp.assinatura}>
            <div style={imp.linhaAssinatura} />
            <span style={imp.papelAssinatura}>{papel}</span>
          </div>
        ))}
      </section>
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
  telaComLateral: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start' },
  conteudoLateral: {
    // Sem max-width: em monitor largo o relatorio ocupa a tela toda em vez
    // de deixar uma faixa vazia a direita (apontado em 28/08).
    flex: 1, minWidth: 0,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },

  /* ---- faixa de numeros do topo ---- */
  kpis: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(172px, 1fr))',
    gap: espaco.md, marginBottom: espaco.xl,
  },
  kpi: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  kpiRotulo: { ...rotulo(t.textoFraco) },
  kpiValor: { ...tipo('display'), ...numeros, lineHeight: 1.15, marginTop: 2 },
  kpiSub: { ...tipo('legenda'), color: t.textoMedio, marginTop: 2 },

  /* ---- paradas (pareto) ---- */
  duasColunas: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: espaco.lg, marginBottom: espaco.xl,
  },
  painelMiolo: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, padding: espaco.xl,
  },
  paretoLinha: {
    display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto',
    gap: espaco.md, alignItems: 'center', ...tipo('corpo'), ...numeros,
  },
  paretoTrilha: { height: 10, background: '#EDF0F3', borderRadius: raio.pill, overflow: 'hidden' },
  paretoBarra: { display: 'block', height: '100%', borderRadius: raio.pill, background: '#D97706' },

  resumoGrade: {
    // auto-FIT, nao auto-fill: com uma maquina filtrada, o cartao ESTICA e
    // ocupa a tela em vez de deixar um buraco a direita (apontado em 28/08).
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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
  cartaoGrupo: {
    display: 'block', ...tipo('micro'), color: t.textoFraco,
    letterSpacing: 1, marginTop: 2,
  },
  cartaoTitulo: { ...tipo('corpoF') },
  cartaoRitmo: {
    ...tipo('display'), ...numeros,
    display: 'flex', alignItems: 'baseline', gap: espaco.sm,
  },
  cartaoRitmoSufixo: { ...tipo('legenda'), color: t.textoFraco },
  // Pedido de 31/08: o mesmo ritmo em pecas por MINUTO, logo abaixo do
  // numero grande — e' a escala em que o posto pensa (contador de pecas).
  cartaoRitmoMinuto: { ...tipo('corpoF'), ...numeros, color: t.textoMedio },
  cartaoLinhas: {
    display: 'flex', flexDirection: 'column', gap: 2,
    ...tipo('legenda'), color: t.textoMedio,
  },
  // Nota discreta, em cinza: informa sem carimbar o numero de "errado".
  notaPoucas: { ...tipo('legenda'), color: t.textoFraco, lineHeight: 1.5 },

  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoLinha: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoExcluir: {
    width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
    borderRadius: raio.sm, color: t.textoFraco, fontSize: 18, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  tdAcoes: {
    padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right', whiteSpace: 'nowrap',
    borderBottom: `1px solid ${t.borda}`,
  },

  painelGrafico: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
  },

  painelIa: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, padding: espaco.xl, marginBottom: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: t.textoFraco, margin: '2px 0 0' },
  /* ---- analise automatica (por regra, sem IA) ---- */
  analiseSecao: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  analiseTitulo: { ...rotulo(t.textoFraco), margin: 0 },
  analiseLinha: { ...tipo('corpo'), color: t.textoMedio, margin: 0, lineHeight: 1.55 },
  // A opcao de IA fica depois da analise, separada por um fio: presente
  // para quem quiser, invisivel para quem nao precisa.
  iaOpcional: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    paddingTop: espaco.md, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
  },
  iaErro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  iaResposta: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  iaRespostaTexto: { ...tipo('corpo'), color: t.texto, whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  iaMeta: { ...tipo('legenda'), color: t.textoFraco },

  faixaErro: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md, marginBottom: espaco.lg,
    background: t.criticoFundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    ...tipo('legenda'), color: t.texto,
  },

  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg,
  },
  caixaModal: {
    width: '100%', maxWidth: 520, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  tituloModal: { ...tipo('titulo'), margin: 0 },
  textoModal: { ...tipo('corpo'), margin: 0, color: t.textoMedio },
  acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },

  /* ---- cadastro de paradas ---- */
  linhaBotoesParada: { display: 'flex', gap: espaco.sm, flexWrap: 'wrap' },
  // Setup com borda de atencao: e' a parada mais marcada e a unica que o
  // processo exige. Cor sozinha nao identifica nada aqui — o rotulo diz.
  botaoSetup: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  listaParadas: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    maxHeight: '38vh', overflowY: 'auto',
  },
  linhaParada: { display: 'flex', alignItems: 'center', gap: espaco.sm, minWidth: 0 },
  selectMotivo: {
    flex: '0 0 200px', minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },
  inputMinutos: {
    width: 72, flexShrink: 0, minHeight: 38, textAlign: 'right',
    padding: `0 ${espaco.sm}px`, background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpoF'), ...numeros, fontFamily: 'inherit',
  },
  sufixoMinutos: { flexShrink: 0, ...tipo('legenda'), color: t.textoFraco },
  inputObs: {
    flex: 1, minWidth: 0, minHeight: 38, padding: `0 ${espaco.sm}px`,
    background: t.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit',
  },

  painel: {
    background: t.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${t.borda}`, overflowX: 'auto', marginBottom: espaco.xl,
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

/* Impressao: mesmos valores da Folha de Analise do estudo — o papel dos dois
   relatorios precisa parecer da mesma casa. */
const imp = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45,
           fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif" },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555', textAlign: 'right' },

  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },

  tituloSecao: { fontSize: 12, fontWeight: 700, margin: '0 0 6px', paddingBottom: 3, borderBottom: '1px solid #999' },

  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5, breakInside: 'avoid' },
  th: { textAlign: 'left', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  thNum: { textAlign: 'right', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  td: { padding: '3px 5px', borderBottom: '1px solid #DDD', verticalAlign: 'top' },
  tdNum: { padding: '3px 5px', borderBottom: '1px solid #DDD', textAlign: 'right',
           fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },

  legenda: { marginTop: 14, border: '1px solid #DDD', padding: 8, breakInside: 'avoid' },
  gradeLegenda: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 16px', marginTop: 6 },
  itemLegenda: { display: 'flex', gap: 6, fontSize: 9, lineHeight: 1.45, breakInside: 'avoid' },
  nota: { margin: '8px 0 0', fontSize: 9, color: '#555', lineHeight: 1.5 },

  assinaturas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: 32, breakInside: 'avoid' },
  assinatura: { textAlign: 'center' },
  linhaAssinatura: { borderTop: '1px solid #000', marginBottom: 4 },
  papelAssinatura: { fontSize: 9, color: '#555' },
};
