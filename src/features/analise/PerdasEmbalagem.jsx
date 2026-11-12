import { Fragment, useEffect, useMemo, useState } from 'react';
import { VERSAO } from '../../versao.js';
import { formatarDuracao, formatarSegundos, unidadeDoPosto } from '../../domain/cronoanalise.js';
import { rotuloMotivo } from '../../domain/crono/paradas.js';
import {
  MOTIVO_SEM_DEFINICAO, horaExtraDosGrupos, relatorioDePerdas, setupPlanejadoDoCadastro,
} from '../../domain/perdasEmbalagem.js';
import { lerDemanda, listarCadastroMaquinas, listarMedicoesDoGrupo } from '../../lib/api.js';
import { carregarMotivos } from '../../lib/motivosParada.js';
import { dataDoArquivo, imprimirComo, nomeDoArquivo } from '../../lib/impressao.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import { est } from './conferencias/estilos.js';
import { ep } from './embalagem/estilos.js';
import ImpressaoPerdas from './embalagem/ImpressaoPerdas.jsx';

const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';
const PERIODOS = [7, 30, 90];
const PRIMEIROS = 15;
const nVolumes = (n) => Math.round(n).toLocaleString('pt-BR');
const pct = (n) => `${Number(n).toFixed(1)}%`;
const horas = (h) => formatarDuracao(h * 3600000);
const nomeDoGrupo = (g) => [g.codigo, g.nome].filter(Boolean).join(' · ');

/**
 * PERDAS DA EMBALAGEM (v2.110.0) — onde a linha deixa de produzir e o que
 * isso custa em horas na semana, a partir das medicoes (tablet e video).
 *
 * Primeiro o que pede atencao: quanto do tempo medido ficou sem produzir e
 * a hora extra que isso explica; depois POR QUE parou (os motivos marcados,
 * com o "Outro" apontado) e ONDE (os produtos, do que mais perdeu ao que
 * menos). As contas sao as do volume a volume (ver perdasEmbalagem.js). O
 * setup planejado fica fora pela regua das HORAS DA LINHA (o cadastro do
 * grupo), nao pela do tempo-alvo: o relatorio compara com as horas, e as
 * duas pontas precisam da mesma regra (revisao da v2.110.1).
 */
export default function PerdasEmbalagem({ aoVoltar, aoVerInicio }) {
  const [verVersoes, setVerVersoes] = useState(false);
  const [dias, setDias] = useState(30);
  const [carga, setCarga] = useState({ estado: 'carregando' });
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarga({ estado: 'carregando' });
    (async () => {
      // Os rotulos dos motivos cadastrados (o rotuloMotivo le' o catalogo).
      const [cadastro] = await Promise.all([listarCadastroMaquinas(), carregarMotivos().catch(() => null)]);
      const maquinas = cadastro.maquinas || [];
      const grupos = (cadastro.grupos || []).filter(ehEmbalagem);
      const porGrupo = await Promise.all(grupos.map(async (g) => {
        const [lista, programa] = await Promise.all([
          listarMedicoesDoGrupo({ grupoId: g.id, dias }),
          // Sem o programa, o relatorio sai sem a hora extra — nao sem tudo;
          // e a tela diz POR QUE ela nao saiu (revisao da v2.110.0).
          lerDemanda(g.id).then((x) => ({ demandas: x.demandas }), (e) => ({ erro: e.message || 'erro' })),
        ]);
        return {
          grupo: g,
          ativas: maquinas.filter((m) => m.grupo_id === g.id && m.ativa).length || 1,
          medicoes: lista.conferencias || [],
          truncado: Boolean(lista.truncado),
          demandas: programa.demandas ?? null,
          erroPrograma: programa.erro || null,
        };
      }));
      if (vivo) setCarga({ estado: 'pronto', grupos: porGrupo });
    })().catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, [dias]);

  /* O SETUP PLANEJADO de cada medicao sai do trecho quando o cadastro do
     grupo dela tem setup planejado — a mesma condicao que tira o setup das
     horas da linha. */
  const descontarSetupDe = useMemo(() => {
    if (carga.estado !== 'pronto') return () => false;
    const doGrupo = new Map();
    for (const x of carga.grupos) for (const c of x.medicoes) doGrupo.set(c.id, x.grupo);
    return (c) => setupPlanejadoDoCadastro(doGrupo.get(c.id));
  }, [carga]);

  const r = useMemo(() => {
    if (carga.estado !== 'pronto') return null;
    return relatorioDePerdas(carga.grupos.flatMap((x) => x.medicoes), { descontarSetupDe });
  }, [carga, descontarSetupDe]);

  /* A HORA EXTRA de CADA GRUPO com o ritmo DELE, esta semana e a proxima
     (horaExtraDosGrupos). Semana sem conta vira aviso com o porque. */
  const horaExtra = useMemo(() => {
    if (carga.estado !== 'pronto' || !r?.total) return { colunas: [], avisos: [] };
    return horaExtraDosGrupos(carga.grupos);
  }, [carga, r]);

  const total = r?.total;
  const produtos = r ? (todos ? r.porProduto : r.porProduto.slice(0, PRIMEIROS)) : [];
  const truncado = carga.estado === 'pronto' && carga.grupos.some((x) => x.truncado);
  // Para a folha: de que dias sao as medicoes (nao so' a janela) e o grupo.
  const periodo = useMemo(() => {
    if (carga.estado !== 'pronto') return null;
    const ts = carga.grupos.flatMap((x) => x.medicoes)
      .map((c) => new Date(c.iniciado_em || c.salvo_em).getTime()).filter(Number.isFinite);
    if (!ts.length) return null;
    const dia = (t) => new Date(t).toLocaleDateString('pt-BR');
    return `${dia(Math.min(...ts))} a ${dia(Math.max(...ts))}`;
  }, [carga]);
  const nomesGrupos = carga.estado === 'pronto' ? carga.grupos.map((x) => nomeDoGrupo(x.grupo)) : [];
  const porMaquina = horaExtra.colunas.some((c) => c.ativas > 1);
  // Uma regua so' por linha da grade: com um grupo, o ritmo dele no rotulo.
  const umRitmo = horaExtra.colunas.length > 0 && horaExtra.colunas.every((c) => c.periodoMs === horaExtra.colunas[0].periodoMs);

  return (
    <div style={est.tela}>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Embalagem"
          aoVerInicio={aoVerInicio}
          contexto={{
            rotulo: 'Embalagem',
            titulo: 'Perdas da embalagem',
            subtitulo: 'Onde a linha deixa de produzir e quanto isso custa em horas',
          }}
          // v2.110.1: a folha A4 (ImpressaoPerdas), com o nome do arquivo
          // dizendo o que e' e de quando — o PDF nao sai "RitmoPatrimar.pdf".
          acaoPrimaria={total ? {
            rotulo: 'Imprimir',
            aoClicar: () => imprimirComo(nomeDoArquivo(
              'Perdas da embalagem', `últimos ${dias} dias`, dataDoArquivo(new Date().toISOString()),
            )),
          } : undefined}
        />
        <main style={est.conteudoLateral}>
          <div style={ep.topo}>
            <div>
              <h1 style={ep.titulo}>Perdas da embalagem</h1>
              <p style={ep.subtitulo}>
                A partir das medições do tablet e do vídeo: o tempo em que a linha ficou sem produzir — paradas
                marcadas no cronômetro e lacunas (intervalos acima do dobro do normal: paradas que o cronômetro não
                tirou) — por motivo e por produto.
              </p>
            </div>
            <label style={est.demandaSeletor}>
              <span style={est.comparativoRotulo}>Período</span>
              <select style={est.demandaSelect} value={String(dias)} onChange={(e) => setDias(Number(e.target.value))}>
                {PERIODOS.map((d) => <option key={d} value={String(d)}>Últimos {d} dias</option>)}
              </select>
            </label>
          </div>

          {carga.estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando" texto="Buscando as medições da embalagem." />
          )}
          {carga.estado === 'erro' && <div style={est.faixaErro} role="alert">Não deu para carregar: {carga.erro}</div>}
          {carga.estado === 'pronto' && !carga.grupos.length && (
            <EstadoVazio
              modo="analise"
              titulo="Nenhum grupo de embalagem"
              texto="Cadastre o grupo e a máquina da embalagem em Ferramentas → Máquinas."
            />
          )}
          {carga.estado === 'pronto' && carga.grupos.length > 0 && !total && (
            <EstadoVazio
              modo="analise"
              titulo={`Nenhuma medição com volumes marcados nos últimos ${dias} dias`}
              texto="O relatório usa as medições do tablet e do Cronometrar por vídeo da embalagem."
            />
          )}

          {total && (
            <>
              <p style={{ ...ep.secaoDica, marginBottom: 12 }} aria-label="Base do relatório">
                {total.medicoes === 1 ? '1 medição' : `${total.medicoes} medições`} · {nVolumes(total.volumes)} volumes · {horas(total.horasMedidas)} de linha
                medida nos últimos {dias} dias
                {r.sobrepostas === 1 && ' · 1 medição do mesmo trecho (tablet e vídeo) contada uma vez só'}
                {r.sobrepostas > 1 && ` · ${r.sobrepostas} medições do mesmo trecho (tablet e vídeo) contadas uma vez só`}
                {total.setupMs > 0 && ` · ${formatarDuracao(total.setupMs)} de setup planejado no trecho fica fora da conta, como no takt`}
              </p>
              {truncado && (
                <div style={est.faixaErro} role="alert">
                  O período tem mais medições do que o relatório lê de uma vez (1.000): os números são das mais recentes.
                  Escolha um período menor.
                </div>
              )}

              <section style={est.kpis} aria-label="Resumo das perdas">
                <div style={{ ...est.kpi, ...ep.kpiDestaque }}>
                  <div style={est.kpiRotulo}>Sem produzir</div>
                  <div style={est.kpiValor}>{pct(total.perdaPct)}</div>
                  <div style={est.kpiSub}>{formatarDuracao(total.semProduzirMs)} do tempo medido</div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Por volume no período</div>
                  <div style={est.kpiValor}>{formatarSegundos(total.periodoMs)} s</div>
                  <div style={est.kpiSub}>o que saiu, com as paradas dentro</div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Por volume rodando</div>
                  <div style={est.kpiValor}>{formatarSegundos(total.normalMs)} s</div>
                  <div style={est.kpiSub}>o ritmo normal, sem paradas e lacunas</div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Paradas marcadas</div>
                  <div style={est.kpiValor}>{formatarDuracao(total.paradasMs)}</div>
                  <div style={est.kpiSub}>
                    no cronômetro, com motivo (tablet ou vídeo)
                  </div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Paradas não marcadas</div>
                  <div style={est.kpiValor}>{formatarDuracao(total.lacunasMs)}</div>
                  <div style={est.kpiSub}>{total.nLacunas} {total.nLacunas === 1 ? 'lacuna' : 'lacunas'} entre volumes</div>
                </div>
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Volumes que deixaram de sair</div>
                  <div style={est.kpiValor}>{nVolumes(total.volumesPerdidos)}</div>
                  <div style={est.kpiSub}>no tempo parado, no ritmo normal</div>
                </div>
              </section>

              {(horaExtra.colunas.length > 0 || horaExtra.avisos.length > 0) && (
                <section style={{ ...est.painelMiolo, marginBottom: 24 }} aria-label="Hora extra da semana">
                  <h2 style={ep.secaoTitulo}>Por que ainda precisa de hora extra</h2>
                  <p style={ep.secaoDica}>
                    O programa da semana feito no ritmo medido, contra as horas da linha (jornada menos o setup
                    planejado — as mesmas do takt). E o mesmo programa no ritmo normal: a diferença é o que as paradas
                    e as lacunas custam. Estimativa: o ritmo é o das medições, com o mix de produtos delas.
                  </p>
                  {horaExtra.colunas.length > 0 && (
                    /* Uma coluna de rotulo e UMA POR SEMANA, fixas: com auto-fit, uma
                       semana so' espalhava rotulo e valor pelas colunas. */
                    <div
                      style={{ ...ep.horaGrade, gridTemplateColumns: `minmax(240px, max-content) repeat(${horaExtra.colunas.length}, minmax(170px, max-content))` }}
                      role="table"
                    >
                      <span style={ep.horaRotulo} />
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaCabeca}>{s.rotulo}</span>)}
                      <span style={ep.horaRotulo}>Programa</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValor}>{nVolumes(s.conta.demanda)} volumes</span>)}
                      <span style={ep.horaRotulo}>{porMaquina ? 'Horas de cada máquina' : 'Horas da linha'}</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.horasDisponiveis)}</span>)}
                      <span style={ep.horaRotulo}>Precisa no ritmo medido{umRitmo ? ` (${formatarSegundos(horaExtra.colunas[0].periodoMs)} s)` : ''}</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.precisaPeriodo)}</span>)}
                      <span style={ep.horaRotulo}>Hora extra estimada</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValorForte}>{s.conta.horaExtra > 0 ? horas(s.conta.horaExtra) : 'nenhuma'}</span>)}
                      <span style={ep.horaRotulo}>Precisa no ritmo normal{umRitmo ? ` (${formatarSegundos(horaExtra.colunas[0].normalMs)} s)` : ''}</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.precisaNormal)}</span>)}
                      <span style={ep.horaRotulo}>Hora extra sem as perdas</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValor}>{s.conta.horaExtraSemPerdas > 0 ? horas(s.conta.horaExtraSemPerdas) : 'nenhuma'}</span>)}
                      <span style={ep.horaRotulo}>O que as perdas custam</span>
                      {horaExtra.colunas.map((s) => <span key={s.chave} style={ep.horaValorForte}>{horas(s.conta.custoDasPerdas)}</span>)}
                    </div>
                  )}
                  {horaExtra.avisos.map((a) => <p key={a} style={ep.avisoOutro} role="status">{a}</p>)}
                </section>
              )}

              {r.porMotivo.length > 0 && (
                <section style={{ ...est.painelMiolo, marginBottom: 24 }} aria-label="Paradas por motivo">
                  <h2 style={ep.secaoTitulo}>Por que a linha parou</h2>
                  <p style={ep.secaoDica}>
                    {formatarDuracao(r.totalMotivosMs)} de paradas marcadas, os maiores motivos primeiro. As lacunas
                    ({formatarDuracao(total.lacunasMs)}) são as paradas que o cronômetro não tirou: a anotada depois, no
                    resultado, aparece aqui com o motivo, mas o tempo dela está nas lacunas.
                    {r.setupForaMs > 0 && ` O setup planejado marcado entre os volumes (${formatarDuracao(r.setupForaMs)}) fica fora, como na conta.`}
                  </p>
                  {r.semDefinicaoPct >= 20 && (
                    <p style={ep.avisoOutro} role="status">
                      <b>{pct(r.semDefinicaoPct)} do tempo parado está em “{rotuloMotivo(MOTIVO_SEM_DEFINICAO)}”.</b> Sem
                      o motivo não dá para atacar a causa: cadastre os motivos que aparecem (Motivos de parada) e
                      escolha-os no tablet.
                    </p>
                  )}
                  <div style={est.paretoGrade}>
                    {r.porMotivo.map((m) => {
                      const rotulo = rotuloMotivo(m.motivo);
                      const outro = m.motivo === MOTIVO_SEM_DEFINICAO;
                      return (
                        <Fragment key={m.motivo}>
                          <span style={{ ...est.paretoRotulo, ...(outro ? ep.rotuloOutro : {}) }} title={rotulo}>{rotulo}</span>
                          <span style={est.paretoTrilha}>
                            <i style={{ ...est.paretoBarra, width: `${Math.max(2, m.pct)}%` }} />
                          </span>
                          <b style={est.paretoValor}>
                            {formatarDuracao(m.ms)} · {pct(m.pct)}
                            <span style={ep.vezes}>{m.vezes}×</span>
                          </b>
                        </Fragment>
                      );
                    })}
                  </div>
                </section>
              )}

              <section style={est.painel} aria-label="Perdas por produto">
                <div style={{ padding: '16px 24px 0' }}>
                  <h2 style={ep.secaoTitulo}>Onde a linha mais perde tempo</h2>
                  <p style={ep.secaoDica}>
                    Por produto, do que mais ficou sem produzir ao que menos. Volumes perdidos: o que daria para ter
                    saído no tempo parado, no ritmo normal do próprio produto.
                  </p>
                </div>
                <table style={est.tabela}>
                  <thead>
                    <tr>
                      <th style={est.th}>Produto</th>
                      <th style={est.thNum}>Medições</th>
                      <th style={est.thNum}>Volumes</th>
                      <th style={est.thNum}>Por vol. período</th>
                      <th style={est.thNum}>Por vol. rodando</th>
                      <th style={est.thNum}>Paradas</th>
                      <th style={est.thNum}>Lacunas</th>
                      <th style={est.thNum}>Sem produzir</th>
                      <th style={est.thNum}>Vol. perdidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map((p) => (
                      <tr key={p.produto}>
                        <td style={ep.tdProduto}>{p.produto}</td>
                        <td style={est.tdNum}>{p.medicoes}</td>
                        <td style={est.tdNum}>{nVolumes(p.volumes)}</td>
                        <td style={est.tdNum}>{formatarSegundos(p.periodoMs)} s</td>
                        <td style={est.tdNum}>{formatarSegundos(p.normalMs)} s</td>
                        <td style={est.tdNum}>{formatarDuracao(p.paradasMs)}</td>
                        <td style={est.tdNum}>{formatarDuracao(p.lacunasMs)}</td>
                        <td style={est.tdNumForte}>{formatarDuracao(p.semProduzirMs)} · {pct(p.perdaPct)}</td>
                        <td style={est.tdNum}>{nVolumes(p.volumesPerdidos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {r.porProduto.length > PRIMEIROS && (
                  <button type="button" style={ep.verTodos} onClick={() => setTodos((x) => !x)}>
                    {todos ? `Mostrar só os ${PRIMEIROS} primeiros` : `Ver todos os ${r.porProduto.length} produtos`}
                  </button>
                )}
              </section>

              <section style={{ ...est.painelMiolo, marginBottom: 24 }} aria-label="Como ler">
                <h2 style={ep.secaoTitulo}>Como ler</h2>
                <ul style={ep.notas}>
                  <li>
                    O tempo de cada medição vai do 1º ao último volume. Ele se divide em três: os volumes no ritmo normal,
                    as paradas marcadas e as lacunas. As contas são as do volume a volume da Embalagem Takt Time.
                  </li>
                  <li>
                    As medições são amostras escolhidas por quem mediu, e a medição curta costuma pegar o trecho em que a
                    linha está rodando bem: a perda real do dia tende a ser MAIOR que a daqui. O vídeo longo, sem escolher
                    trecho, é o que mais se aproxima do dia.
                  </li>
                  <li>
                    As paradas por motivo incluem as marcadas antes do 1º volume ou depois do último; por isso a soma delas
                    pode ficar um pouco diferente das paradas do resumo.
                  </li>
                  <li>
                    A parada anotada depois, no resultado ou no PC, não foi tirada pelo cronômetro: o tempo dela fica nas
                    lacunas, como no volume a volume, e o motivo aparece em “Por que a linha parou”. Pelo mesmo motivo, o
                    setup anotado depois não sai da conta: só o marcado no cronômetro entre os volumes sai.
                  </li>
                  <li>
                    O mesmo produto com nomes diferentes (digitado à mão) aparece em linhas separadas: corrija o produto na
                    lista da Embalagem Takt Time (Editar produto) e ele se junta aqui.
                  </li>
                  {total.curtas > 0 && (
                    <li>
                      {total.curtas === 1
                        ? '1 medição com menos de 10 intervalos não separa lacuna: nela só as paradas marcadas contam.'
                        : `${total.curtas} medições com menos de 10 intervalos não separam lacuna: nelas só as paradas marcadas contam.`}
                    </li>
                  )}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
      {total && (
        <ImpressaoPerdas
          dias={dias} r={r} colunas={horaExtra.colunas} avisos={horaExtra.avisos} periodo={periodo} grupos={nomesGrupos}
          porMaquina={porMaquina} umRitmo={umRitmo} truncado={truncado}
        />
      )}
      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
    </div>
  );
}
