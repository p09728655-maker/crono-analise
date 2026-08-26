import { useEffect, useMemo, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  CRITERIOS_CONFERENCIA, conferenciaRapida, formatarDuracao, formatarSegundos,
  resumirConferencias, rotuloMotivo, somarParadas,
} from '../../domain/cronoanalise.js';
import { codigoPreferido, useMotivosParada } from '../../lib/motivosParada.js';
import {
  analisarConferenciasComIa, arquivarConferencia, excluirConferencia, listarConferenciasServidor,
  salvarParadasConferencia,
} from '../../lib/api.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import { GraficoRitmoMaquinas } from './graficos.jsx';
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
 * O ritmo medio e' ponderado pelo tempo — soma de pecas sobre soma do
 * tempo PRODUTIVO — porque e' esse numero que aguenta decisao de
 * capacidade; media simples de taxas deixaria uma medicao de 5 minutos
 * valer o mesmo que uma de 2 horas.
 *
 * PARADAS (setup, falta de material, manutencao) saem do tempo produtivo.
 * Elas chegam do aparelho junto com a conferencia, e tambem podem ser
 * CADASTRADAS aqui: quem confere no corredor nem sempre marca o setup na
 * hora, e reconstituir depois — olhando o apontamento — e' trabalho de
 * escritorio. Marcar a parada e' melhor que arquivar a medicao: o ritmo
 * fica certo e o dado continua contando.
 *
 * A impressao NAO e' a tela no papel: e' um documento proprio (A4), com
 * identificacao, criterios, resumo e o dado bruto — ver ImpressaoConferencias.
 */
/* Id do item "Todas" na lateral. Filtro nenhum e' `null` no estado; a
   lateral precisa de um id de verdade para marcar o ativo. */
const TODAS = '__todas';

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
  const visiveis = useMemo(
    () => (filtro ? linhas.filter((c) => (String(c.maquina || '').trim() || 'Sem máquina') === filtro) : linhas),
    [linhas, filtro],
  );

  /* A mesma lateral da lista e do estudo. O filtro por maquina vai para
     dentro dela pelo mesmo motivo que os produtos foram na lista: e'
     navegacao, nao um controle do conteudo. */
  const secoes = resumo.length > 1
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
            subtitulo: 'Ritmo por máquina · peças/hora do posto',
          }}
          acaoPrimaria={estado === 'pronto' && linhas.length > 0 && !verArquivadas
            ? { rotulo: 'Imprimir', aoClicar: () => window.print() }
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
            <EstadoVazio modo="analise" titulo="Carregando conferências" texto="Buscando as conferências sincronizadas." />
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
              titulo="Nenhuma conferência sincronizada"
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
                      {g.totalParadaMs > 0 && (
                        <span>
                          Parado: {formatarDuracao(g.totalParadaMs)}
                          {g.totalSetupMs > 0 && ` (setup ${formatarDuracao(g.totalSetupMs)})`}
                          {' · '}Disponibilidade: {g.disponibilidadePct.toFixed(0)}%
                          {' · '}No período: {Math.round(g.ritmoBruto)} pç/h
                        </span>
                      )}
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

              {!verArquivadas && resumo.length > 0 && (
                <section style={est.painelGrafico} aria-label="Ritmo por máquina">
                  <GraficoRitmoMaquinas maquinas={filtro ? resumo.filter((g) => g.maquina === filtro) : resumo} />
                </section>
              )}

              {!verArquivadas && <AnaliseIaConferencias resumo={resumo} />}

              <section style={est.painel} aria-label={verArquivadas ? 'Conferências arquivadas' : 'Todas as conferências'}>
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
                      <th style={est.thNum}>Peças/h</th>
                      <th style={est.thNum}>Ciclo (s/pç)</th>
                      <th style={est.th} aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((c) => {
                      const calc = conferenciaRapida({
                        duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
                      });
                      const par = somarParadas(c.paradas);
                      return (
                        <tr key={c.id}>
                          <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                          <td style={est.tdCurto}>{c.maquina || '—'}</td>
                          <td style={est.tdCurto}>{c.peca || '—'}</td>
                          <td style={est.tdFraco}>
                            {c.hora_inicial && c.hora_final ? `${c.hora_inicial}–${c.hora_final}` : '—'}
                          </td>
                          <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                          <td style={est.tdNum} title={par.porMotivo.map((m) => `${m.rotulo}: ${formatarDuracao(m.ms)}`).join(' · ')}>
                            {par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}
                          </td>
                          <td style={est.tdNum}>{c.pecas}</td>
                          <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                          <td style={est.tdNum}>{calc?.cicloMedioMs ? formatarSegundos(calc.cicloMedioMs) : '—'}</td>
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
                              aria-label={`Excluir conferência de ${c.maquina || 'sem máquina'}`}
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
          <div style={est.modal} role="dialog" aria-label="Excluir conferência">
            <div style={est.caixaModal}>
              <h2 style={est.tituloModal}>Excluir conferência?</h2>
              <p style={est.textoModal}>
                <strong>{[confirmando.maquina, confirmando.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
                {confirmando.hora_inicial && confirmando.hora_final
                  ? ` · ${confirmando.hora_inicial}–${confirmando.hora_final}`
                  : ''}
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
        <ImpressaoConferencias linhas={linhas} resumo={resumo} />
      )}
    </div>
  );
}

/**
 * CADASTRO DE PARADAS de uma conferencia — no PC.
 *
 * Quem confere no corredor raramente para para digitar o setup; quem monta
 * o relatorio, sim. Aqui a parada e' reconstituida depois, com o
 * apontamento na mao: motivo, minutos e uma observacao livre.
 *
 * A lista e' gravada INTEIRA (nao incremental): o que esta na tela vira o
 * estado final das paradas daquela conferencia, entao corrigir um numero e
 * apagar uma linha usam o mesmo caminho e o mesmo botao.
 *
 * A soma nao pode alcancar o periodo: sem tempo de maquina rodando nao ha
 * ritmo, e a conferencia sairia dos calculos sem dizer por que. O aviso
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
    <div style={est.modal} role="dialog" aria-label="Paradas da conferência">
      <div style={{ ...est.caixaModal, maxWidth: 620 }}>
        <h2 style={est.tituloModal}>Paradas do período</h2>
        <p style={est.textoModal}>
          <strong>{[conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação'}</strong>
          {conferencia.hora_inicial && conferencia.hora_final
            ? ` · ${conferencia.hora_inicial}–${conferencia.hora_final}`
            : ''}
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
 * Analise com IA das conferencias.
 *
 * Mesma secao do painel do estudo, com um contrato diferente: o que sobe e'
 * o resumo POR MAQUINA — incluindo `confiavel` e os motivos —, entao a IA
 * sabe quais numeros ainda nao servem de referencia e diz isso em vez de
 * tirar conclusao de capacidade de uma medicao de um minuto.
 */
function AnaliseIaConferencias({ resumo }) {
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);

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
    <section style={est.painelIa} aria-label="Análise com IA das conferências">
      <div style={est.iaTopo}>
        <div style={{ minWidth: 0 }}>
          <h2 style={est.iaTitulo}>Análise com IA</h2>
          <p style={est.iaTexto}>
            Leitura dos ritmos, diferenças entre máquinas e o que falta medir.
          </p>
        </div>
        <button type="button" style={est.botaoImprimir} onClick={analisar} disabled={rodando}>
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
 * FOLHA DE CONFERENCIAS — A4 retrato.
 *
 * Mesmo documento que a Folha de Analise do estudo, na mesma ordem que um
 * relatorio tecnico exige: identificacao, confiabilidade ANTES do resultado,
 * resumo, dado bruto, legenda em palavras e assinaturas. Nao e' a tela no
 * papel — a tela tem filtro, botao e cor de interface; o papel tem contexto
 * e responsavel.
 *
 * A confiabilidade vem antes dos numeros pelo mesmo motivo do estudo: o
 * documento circula em reuniao, e numero sem contexto vira decisao errada.
 */
function ImpressaoConferencias({ linhas, resumo }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const crit = CRITERIOS_CONFERENCIA;
  const semReferencia = resumo.filter((g) => !g.confiavel);

  const datas = linhas.map((c) => new Date(c.salvo_em)).filter((d) => !Number.isNaN(d.getTime()));
  const periodo = datas.length
    ? `${new Date(Math.min(...datas)).toLocaleDateString('pt-BR')} a ${new Date(Math.max(...datas)).toLocaleDateString('pt-BR')}`
    : '—';
  const totalPecas = resumo.reduce((acc, g) => acc + g.totalPecas, 0);
  const totalMs = resumo.reduce((acc, g) => acc + g.totalMs, 0);
  const totalParadaMs = resumo.reduce((acc, g) => acc + g.totalParadaMs, 0);
  const totalSetupMs = resumo.reduce((acc, g) => acc + g.totalSetupMs, 0);

  return (
    <div className="somente-impressao" style={imp.folha}>
      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>Ritmo das Furadeiras — Folha por Máquina</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          ['Tipo de medição', 'Ritmo do posto (vazão)'],
          ['Período coberto', periodo],
          ['Máquinas', String(resumo.length)],
          ['Conferências', String(linhas.length)],
          ['Total de peças', String(totalPecas)],
          ['Tempo observado', formatarDuracao(totalMs)],
          ['Tempo parado', totalParadaMs > 0
            ? `${formatarDuracao(totalParadaMs)}${totalSetupMs > 0 ? ` (setup ${formatarDuracao(totalSetupMs)})` : ''}`
            : 'Nenhuma parada marcada'],
          ['Critério mínimo', `${crit.minConferencias} conf. · ${formatarDuracao(crit.minTempoTotalMs)}`],
          ['Período mínimo', formatarDuracao(crit.minPeriodoMs)],
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={imp.campoRotulo}>{k}</span>
            <span style={imp.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {/* Confiabilidade ANTES do resultado — igual a folha do estudo. */}
      <section style={semReferencia.length ? imp.ressalva : imp.validacao}>
        <strong>
          {semReferencia.length
            ? '⚠ Máquinas com amostra insuficiente'
            : '✓ Todas as máquinas atendem aos critérios'}
        </strong>
        {semReferencia.length ? (
          <>
            <p style={imp.ressalvaTexto}>
              As máquinas abaixo não atingiram os critérios mínimos de amostra. Os ritmos
              apresentados servem como indício, mas <strong>não devem embasar
              dimensionamento de capacidade</strong> enquanto a amostra não fechar.
            </p>
            <ul style={imp.ressalvaLista}>
              {semReferencia.map((g) => (
                <li key={g.maquina}><strong>{g.maquina}</strong> — {g.motivos.join('; ')}.</li>
              ))}
            </ul>
          </>
        ) : (
          <p style={imp.ressalvaTexto}>
            Todas as máquinas atingiram o mínimo de conferências, de tempo total observado e
            de período por conferência. O CV% entre conferências está na tabela como
            referência de estabilidade do posto.
          </p>
        )}
      </section>

      <h2 style={imp.tituloSecao}>Resumo por máquina</h2>
      <table style={imp.tabela}>
        <thead>
          <tr>
            <th style={imp.th}>Máquina</th>
            <th style={imp.thNum}>Conf.</th>
            <th style={imp.thNum}>Peças</th>
            <th style={imp.thNum}>Tempo obs.</th>
            <th style={imp.thNum}>Parado</th>
            <th style={imp.thNum}>Ritmo (pç/h)</th>
            <th style={imp.thNum}>Ciclo (s/pç)</th>
            <th style={imp.thNum}>CV%</th>
            <th style={imp.thNum}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {resumo.map((g) => (
            <tr key={g.maquina}>
              <td style={imp.td}>{g.maquina}</td>
              <td style={imp.tdNum}>{g.n}</td>
              <td style={imp.tdNum}>{g.totalPecas}</td>
              <td style={imp.tdNum}>{formatarDuracao(g.totalMs)}</td>
              <td style={imp.tdNum}>{g.totalParadaMs > 0 ? formatarDuracao(g.totalParadaMs) : '—'}</td>
              <td style={{ ...imp.tdNum, fontWeight: 700 }}>{Math.round(g.ritmoMedio)}</td>
              <td style={imp.tdNum}>{formatarSegundos(g.cicloMedioMs)}</td>
              <td style={imp.tdNum}>{g.cvPct != null ? g.cvPct.toFixed(1) : '—'}</td>
              <td style={imp.tdNum}>{g.confiavel ? 'Referência' : 'Insuficiente'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ ...imp.tituloSecao, marginTop: 14 }}>Conferências registradas ({linhas.length})</h2>
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
            <th style={imp.thNum}>Peças/h</th>
            <th style={imp.thNum}>Ciclo (s/pç)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => {
            const calc = conferenciaRapida({
              duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas,
            });
            const par = somarParadas(c.paradas);
            return (
              <tr key={c.id}>
                <td style={imp.td}>{formatarDataHora(c.salvo_em)}</td>
                <td style={imp.td}>{c.maquina || '—'}</td>
                <td style={imp.td}>{c.peca || '—'}</td>
                <td style={imp.td}>{c.hora_inicial && c.hora_final ? `${c.hora_inicial}–${c.hora_final}` : '—'}</td>
                <td style={imp.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={imp.tdNum}>{par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}</td>
                <td style={imp.tdNum}>{c.pecas}</td>
                <td style={{ ...imp.tdNum, fontWeight: 700 }}>{calc ? Math.round(calc.pecasPorHora) : '—'}</td>
                <td style={imp.tdNum}>{calc?.cicloMedioMs ? formatarSegundos(calc.cicloMedioMs) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legenda em PALAVRAS: o documento circula em reuniao e nao pode
          depender de quem escreveu para ser entendido. */}
      <section style={imp.legenda}>
        <strong>Legenda</strong>
        <div style={imp.gradeLegenda}>
          {[
            ['Conferência', 'um período observado no posto: hora inicial, hora final e peças produzidas.'],
            ['Período', 'tempo decorrido entre a hora inicial e a hora final.'],
            ['Parado', 'tempo em que a máquina não produziu dentro do período: setup/troca, falta de material, manutenção, ajuste.'],
            ['Peças/h', 'ritmo com a máquina rodando: peças ÷ (período − parado) × 3.600. Sem parada marcada, é o ritmo do período.'],
            ['Ritmo médio', 'ponderado pelo tempo: Σ peças ÷ Σ tempo com a máquina rodando — não é a média das taxas.'],
            ['Ciclo (s/pç)', 'segundos por peça (tempo ÷ peças).'],
            ['CV%', 'variação do ritmo entre conferências da mesma máquina — quanto maior, mais instável.'],
            ['Referência', 'amostra atende aos critérios mínimos declarados acima.'],
            ['Insuficiente', 'amostra ainda não sustenta decisão de capacidade.'],
          ].map(([sigla, texto]) => (
            <div key={sigla} style={imp.itemLegenda}>
              <strong style={{ whiteSpace: 'nowrap' }}>{sigla}:</strong>
              <span>{texto}</span>
            </div>
          ))}
        </div>
        <p style={imp.nota}>
          A medição de ritmo do posto mede <strong>vazão</strong> (peças/hora). Não substitui o
          estudo de tempos, que mede ciclo a ciclo com fator de ritmo e tolerância e produz o
          tempo padrão.
        </p>
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
    flex: 1, minWidth: 0, maxWidth: 1400,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
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
  iaTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: t.textoFraco, margin: '2px 0 0' },
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

  validacao: { border: '1px solid #15803D', background: '#F2F9F4', padding: 8, marginBottom: 12, breakInside: 'avoid' },
  ressalva: { border: '1px solid #B45309', background: '#FDF6EC', padding: 8, marginBottom: 12, breakInside: 'avoid' },
  ressalvaTexto: { margin: '4px 0 0', fontSize: 9.5, lineHeight: 1.5 },
  ressalvaLista: { margin: '4px 0 0', paddingLeft: 16, fontSize: 9.5, lineHeight: 1.5 },

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
