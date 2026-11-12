import { Fragment, useEffect, useMemo, useState } from 'react';
import { VERSAO } from '../../versao.js';
import { formatarDuracao, formatarSegundos, unidadeDoPosto } from '../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../domain/demandaSemanal.js';
import { rotuloMotivo } from '../../domain/crono/paradas.js';
import {
  MOTIVO_SEM_DEFINICAO, horaExtraDaSemana, relatorioDePerdas,
} from '../../domain/perdasEmbalagem.js';
import { lerDemanda, listarCadastroMaquinas, listarMedicoesDoGrupo } from '../../lib/api.js';
import { carregarMotivos } from '../../lib/motivosParada.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import { est } from './conferencias/estilos.js';
import { ep } from './embalagem/estilos.js';

const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';
const PERIODOS = [7, 30, 90];
const PRIMEIROS = 15;
const DIA_MS = 86400000;
const nVolumes = (n) => Math.round(n).toLocaleString('pt-BR');
const pct = (n) => `${Number(n).toFixed(1)}%`;
const horas = (h) => formatarDuracao(h * 3600000);

/**
 * PERDAS DA EMBALAGEM (v2.110.0) — onde a linha deixa de produzir e o que
 * isso custa em horas na semana, a partir das medicoes (tablet e video).
 *
 * Primeiro o que pede atencao: quanto do tempo medido ficou sem produzir e
 * a hora extra que isso explica; depois POR QUE parou (os motivos marcados,
 * com o "Outro" apontado) e ONDE (os produtos, do que mais perdeu ao que
 * menos). As contas sao as do volume a volume (ver perdasEmbalagem.js).
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
      const grupos = (cadastro.grupos || []).filter(ehEmbalagem);
      const porGrupo = await Promise.all(grupos.map(async (g) => {
        const [lista, programa] = await Promise.all([
          listarMedicoesDoGrupo({ grupoId: g.id, dias }),
          // Sem o programa, o relatorio sai sem a hora extra — nao sem tudo.
          lerDemanda(g.id).catch(() => null),
        ]);
        return { grupo: g, medicoes: lista.conferencias || [], demandas: programa?.demandas ?? null };
      }));
      if (vivo) setCarga({ estado: 'pronto', cadastro, grupos: porGrupo });
    })().catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, [dias]);

  const r = useMemo(() => {
    if (carga.estado !== 'pronto') return null;
    return relatorioDePerdas(carga.grupos.flatMap((x) => x.medicoes));
  }, [carga]);

  /* A HORA EXTRA de cada grupo, esta semana e a proxima: o programa no
     ritmo medido contra as horas da linha (as do takt: jornada menos o
     setup planejado), e o mesmo programa no ritmo normal. */
  const semanas = useMemo(() => {
    if (carga.estado !== 'pronto' || !r?.total) return [];
    const maquinas = carga.cadastro.maquinas || [];
    return carga.grupos.flatMap(({ grupo: g, demandas }) => {
      if (!demandas) return [];
      const ativas = maquinas.filter((m) => m.grupo_id === g.id && m.ativa).length || 1;
      return [0, 7].map((somar) => {
        const takt = taktDaMedicao({
          demandas,
          horas: g.horas_semana,
          maquinas: ativas,
          setup: { setupsDia: g.setups_dia, dias: g.dias_semana, minutos: g.setup_min },
          data: new Date(Date.now() + somar * DIA_MS).toISOString(),
          pecas: 1,
          duracaoMs: 3600000,
        });
        return {
          chave: `${g.id}-${somar}`,
          rotulo: `${somar ? 'Próxima semana' : 'Esta semana'}${takt.semana ? ` (${takt.semana})` : ''}`,
          estado: takt.estado,
          conta: horaExtraDaSemana({
            demanda: takt.demanda,
            horasPorMaquina: takt.horasPorMaquina,
            maquinas: ativas,
            periodoMs: r.total.periodoMs,
            normalMs: r.total.normalMs,
          }),
        };
      }).filter((s) => s.conta);
    });
  }, [carga, r]);

  const total = r?.total;
  const produtos = r ? (todos ? r.porProduto : r.porProduto.slice(0, PRIMEIROS)) : [];

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
        />
        <main style={est.conteudoLateral}>
          <div style={ep.topo}>
            <div>
              <h1 style={ep.titulo}>Perdas da embalagem</h1>
              <p style={ep.subtitulo}>
                A partir das medições do tablet e do vídeo: o tempo em que a linha ficou sem produzir — paradas
                marcadas e lacunas (intervalos acima do dobro do normal, paradas que ninguém marcou) — por motivo e
                por produto.
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
                {total.medicoes} medições · {nVolumes(total.volumes)} volumes · {horas(total.horasMedidas)} de linha
                medida nos últimos {dias} dias
                {r.sobrepostas > 0 && ` · ${r.sobrepostas} medição(ões) do mesmo trecho (tablet e vídeo) contada(s) uma vez só`}
              </p>

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
                  <div style={est.kpiSub}>com motivo no tablet ou no vídeo</div>
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

              {semanas.length > 0 && (
                <section style={{ ...est.painelMiolo, marginBottom: 24 }} aria-label="Hora extra da semana">
                  <h2 style={ep.secaoTitulo}>Por que ainda precisa de hora extra</h2>
                  <p style={ep.secaoDica}>
                    O programa da semana feito no ritmo medido, contra as horas da linha (jornada menos o setup
                    planejado — as mesmas do takt). E o mesmo programa no ritmo normal: a diferença é o que as paradas
                    e as lacunas custam. Estimativa: o ritmo é o das medições, com o mix de produtos delas.
                  </p>
                  {/* Uma coluna de rotulo e UMA POR SEMANA, fixas: com auto-fit, uma
                      semana so' espalhava rotulo e valor pelas colunas. */}
                  <div
                    style={{ ...ep.horaGrade, gridTemplateColumns: `minmax(240px, max-content) repeat(${semanas.length}, minmax(170px, max-content))` }}
                    role="table"
                  >
                    <span style={ep.horaRotulo} />
                    {semanas.map((s) => <span key={s.chave} style={ep.horaCabeca}>{s.rotulo}</span>)}
                    <span style={ep.horaRotulo}>Programa</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValor}>{nVolumes(s.conta.demanda)} volumes</span>)}
                    <span style={ep.horaRotulo}>Horas da linha</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.horasDisponiveis)}</span>)}
                    <span style={ep.horaRotulo}>Precisa no ritmo medido ({formatarSegundos(total.periodoMs)} s)</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.precisaPeriodo)}</span>)}
                    <span style={ep.horaRotulo}>Hora extra estimada</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValorForte}>{s.conta.horaExtra > 0 ? horas(s.conta.horaExtra) : 'nenhuma'}</span>)}
                    <span style={ep.horaRotulo}>Precisa no ritmo normal ({formatarSegundos(total.normalMs)} s)</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValor}>{horas(s.conta.precisaNormal)}</span>)}
                    <span style={ep.horaRotulo}>Hora extra sem as perdas</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValor}>{s.conta.horaExtraSemPerdas > 0 ? horas(s.conta.horaExtraSemPerdas) : 'nenhuma'}</span>)}
                    <span style={ep.horaRotulo}>O que as perdas custam</span>
                    {semanas.map((s) => <span key={s.chave} style={ep.horaValorForte}>{horas(s.conta.custoDasPerdas)}</span>)}
                  </div>
                </section>
              )}

              {r.porMotivo.length > 0 && (
                <section style={{ ...est.painelMiolo, marginBottom: 24 }} aria-label="Paradas por motivo">
                  <h2 style={ep.secaoTitulo}>Por que a linha parou</h2>
                  <p style={ep.secaoDica}>
                    {formatarDuracao(r.totalMotivosMs)} de paradas marcadas, os maiores motivos primeiro. As lacunas
                    ({formatarDuracao(total.lacunasMs)}) não têm motivo: ninguém marcou a parada.
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
                        <td style={est.tdCurto} title={p.produto}>{p.produto}</td>
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
                    pode passar um pouco das paradas do resumo.
                  </li>
                  <li>
                    O mesmo produto com nomes diferentes (digitado à mão) aparece em linhas separadas: corrija o produto na
                    lista da Embalagem Takt Time (Editar produto) e ele se junta aqui.
                  </li>
                  {total.curtas > 0 && (
                    <li>
                      {total.curtas} medição(ões) com menos de 10 intervalos não separam lacuna: nelas só as paradas
                      marcadas contam.
                    </li>
                  )}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
    </div>
  );
}
