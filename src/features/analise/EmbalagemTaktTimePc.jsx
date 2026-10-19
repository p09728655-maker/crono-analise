import { Fragment, useEffect, useMemo, useState } from 'react';
import { VERSAO } from '../../versao.js';
import {
  conferenciaRapida, faixaHoraria, formatarDuracao, formatarSegundos, nomeChave, somarParadas,
  unidadeDoPosto,
} from '../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../domain/demandaSemanal.js';
import { filtrarPorPeriodo, formatarDataHora } from '../../domain/relatorioConferencias.js';
import { listarCadastroMaquinas, listarConferenciasServidor, listarDemanda } from '../../lib/api.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import VolumeAVolume from './conferencias/VolumeAVolume.jsx';
import Produtos from './Produtos.jsx';
import MotivosParada from './MotivosParada.jsx';
import { est } from './conferencias/estilos.js';

/** Janela padrao, a mesma do relatorio de ritmo: o que esta' acontecendo agora. */
const DIAS = 30;
const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';

/**
 * EMBALAGEM TAKT TIME — no PC.
 *
 * Funcao PROPRIA, separada do relatorio de Ritmo por maquina, a pedido do
 * PPCP. As medicoes sao as mesmas (a embalagem tambem aparece no relatorio
 * de ritmo, como qualquer posto); o que muda e' a pergunta: aqui nao se
 * compara maquina com maquina, se olha cada medicao volume a volume contra
 * o takt da semana em que ela foi feita, em segundos.
 *
 * No topo, o TAKT DESTA SEMANA — e' o numero que o chao precisa ter na
 * cabeca. Abaixo, as medicoes da embalagem; as que foram tocadas volume a
 * volume abrem o detalhe (grafico, lacunas, folha A4) logo abaixo da lista.
 */
export default function EmbalagemTaktTimePc({ aoVoltar, aoVerInicio }) {
  const [verVersoes, setVerVersoes] = useState(false);
  const [carga, setCarga] = useState({ estado: 'carregando' });
  const [aberta, setAberta] = useState(null);
  // Os dois cadastros que a embalagem pede no tablet: o que se embala e por
  // que a linha para. Aqui a um clique, sem caçar no menu de outra tela.
  const [cadastroAberto, setCadastroAberto] = useState(null); // 'produtos' | 'motivos' | null

  useEffect(() => {
    let vivo = true;
    Promise.all([
      listarCadastroMaquinas(),
      listarConferenciasServidor(),
      // As arquivadas so' para CONTAR: arquivada no relatorio de ritmo some
      // daqui tambem, e a tela precisa dizer isso em vez de "nenhuma".
      listarConferenciasServidor({ arquivadas: true }).catch(() => ({ conferencias: [] })),
    ])
      .then(async ([cadastro, lista, arquivadas]) => {
        const grupos = (cadastro.grupos || []).filter(ehEmbalagem);
        // O programa de cada grupo da embalagem (hoje, um so'). Falha do
        // programa nao derruba a tela: o takt aparece como indisponivel.
        const programas = await Promise.all(grupos.map((g) => listarDemanda(g.id).catch(() => null)));
        if (vivo) {
          setCarga({
            estado: 'pronto', cadastro, grupos, conferencias: lista.conferencias || [],
            arquivadas: arquivadas.conferencias || [],
            demandas: new Map(grupos.map((g, i) => [g.id, programas[i]])),
          });
        }
      })
      .catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, []);

  const leitura = useMemo(() => {
    if (carga.estado !== 'pronto') return null;
    const idsGrupos = new Set(carga.grupos.map((g) => g.id));
    const maquinas = (carga.cadastro.maquinas || []).filter((m) => idsGrupos.has(m.grupo_id));
    const grupoDaMaquina = new Map(maquinas.map((m) => [nomeChave(m.nome), m.grupo_id]));
    const ativasDoGrupo = (id) => maquinas.filter((m) => m.grupo_id === id && m.ativa).length;
    const medicoes = filtrarPorPeriodo(
      carga.conferencias.filter((c) => grupoDaMaquina.has(nomeChave(c.maquina))),
      DIAS,
    );
    const taktHoje = carga.grupos.map((g) => ({
      grupo: g,
      ...(carga.demandas.get(g.id) === null
        ? { taktMs: null, estado: 'erro-programa', semana: null }
        : taktDaMedicao({
          demandas: carga.demandas.get(g.id),
          horas: g.horas_semana,
          maquinas: ativasDoGrupo(g.id),
          setup: { setupsDia: g.setups_dia, dias: g.dias_semana, minutos: g.setup_min },
          data: new Date().toISOString(),
          pecas: 1,
          duracaoMs: 3600000,
        })),
    }));
    const arquivadas = carga.arquivadas.filter((c) => grupoDaMaquina.has(nomeChave(c.maquina))).length;
    return {
      medicoes, taktHoje, ativasDoGrupo, arquivadas,
      grupoDe: (maquina) => carga.grupos.find((g) => g.id === grupoDaMaquina.get(nomeChave(maquina))) || null,
    };
  }, [carga]);

  const grupoAberto = aberta && leitura ? leitura.grupoDe(aberta.maquina) : null;

  return (
    <div style={est.tela}>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Estudos"
          aoVerInicio={aoVerInicio}
          contexto={{
            rotulo: 'Embalagem',
            titulo: 'Embalagem Takt Time',
            subtitulo: 'Cada volume contra o takt da semana, em segundos',
          }}
        />

        <main style={est.conteudoLateral}>
          {carga.estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando a embalagem" texto="Buscando o cadastro, o programa e as medições." />
          )}
          {carga.estado === 'erro' && (
            <div style={est.faixaErro} role="alert">Não deu para carregar: {carga.erro}</div>
          )}

          {leitura && (
            <>
              <div style={est.barraCadastros}>
                <button type="button" style={est.botaoLinha} onClick={() => setCadastroAberto('produtos')}>
                  Produtos da embalagem
                </button>
                <button type="button" style={est.botaoLinha} onClick={() => setCadastroAberto('motivos')}>
                  Motivos de parada
                </button>
              </div>
              <div style={est.kpis}>
                {leitura.taktHoje.length === 0 && (
                  <div style={est.kpi}>
                    <div style={est.kpiRotulo}>Takt desta semana</div>
                    <div style={est.kpiValor}>—</div>
                    <div style={est.kpiSub}>
                      Nenhum grupo EMBALAGEM no cadastro (Ferramentas → Máquinas).
                    </div>
                  </div>
                )}
                {leitura.taktHoje.map((t) => (
                  <div key={t.grupo.id} style={est.kpi}>
                    <div style={est.kpiRotulo}>Takt desta semana · {t.grupo.nome}</div>
                    <div style={est.kpiValor}>
                      {t.taktMs > 0 ? `${formatarSegundos(t.taktMs)} s` : '—'}
                    </div>
                    <div style={est.kpiSub}>
                      {t.taktMs > 0 ? `por volume · semana ${t.semana}` : semTaktCurto(t.estado)}
                    </div>
                  </div>
                ))}
                <div style={est.kpi}>
                  <div style={est.kpiRotulo}>Medições em {DIAS} dias</div>
                  <div style={est.kpiValor}>{leitura.medicoes.length}</div>
                  <div style={est.kpiSub}>
                    {leitura.medicoes.filter((c) => c.com_marcas).length} volume a volume
                    {leitura.arquivadas > 0
                      ? ` · ${leitura.arquivadas} ${leitura.arquivadas === 1 ? 'arquivada' : 'arquivadas'} fora da conta`
                      : ''}
                  </div>
                </div>
              </div>

              {leitura.medicoes.length === 0 ? (
                <EstadoVazio
                  modo="analise"
                  titulo="Nenhuma medição da embalagem"
                  texto={`Nos últimos ${DIAS} dias.${leitura.arquivadas > 0
                    ? ` ${leitura.arquivadas === 1 ? 'Há 1 medição da embalagem arquivada' : `Há ${leitura.arquivadas} medições da embalagem arquivadas`} — restaure no relatório Ritmo por máquina, em Arquivadas.`
                    : ''} A medição nasce no tablet, em Embalagem Takt Time: um toque a cada volume embalado.`}
                />
              ) : (
                <TabelaEmbalagem
                  medicoes={leitura.medicoes}
                  abertaId={aberta?.id ?? null}
                  // Clicar de novo na medicao aberta fecha o painel.
                  aoAbrir={(c) => setAberta((atual) => (atual?.id === c.id ? null : c))}
                />
              )}

              {/* A medicao selecionada abre AQUI, abaixo da lista. */}
              {aberta && (
                <VolumeAVolume
                  conferencia={aberta}
                  grupo={grupoAberto}
                  maquinasDoGrupo={grupoAberto ? leitura.ativasDoGrupo(grupoAberto.id) : 0}
                  aoFechar={() => setAberta(null)}
                />
              )}

              <p style={est.painelDica}>
                O takt é o programa da semana do grupo EMBALAGEM — colado em VOLUMES, não em
                produtos — dividido pelas horas da semana, descontado o setup planejado. Um
                produto que sai em dois volumes conta dois.
              </p>
            </>
          )}
        </main>
      </div>

      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
      {cadastroAberto === 'produtos' && (
        <Produtos grupoInicial={leitura?.taktHoje[0]?.grupo.id || null} aoFechar={() => setCadastroAberto(null)} />
      )}
      {cadastroAberto === 'motivos' && <MotivosParada aoFechar={() => setCadastroAberto(null)} />}
    </div>
  );
}

function semTaktCurto(estado) {
  switch (estado) {
    case 'sem-demanda': return 'sem programa da embalagem cadastrado';
    case 'sem-semana': return 'o programa não cobre esta semana';
    case 'sem-horas': return 'faltam as horas da semana do grupo';
    case 'setup-excede': return 'setup cadastrado passa da jornada';
    case 'erro-programa': return 'não deu para carregar o programa';
    default: return 'sem takt para esta semana';
  }
}

/**
 * As medicoes da embalagem, uma por linha. So' as tocadas volume a volume
 * abrem o detalhe: as feitas por horarios nao tem intervalo, e o botao
 * desabilitado diria isso pior do que uma frase.
 */
function TabelaEmbalagem({ medicoes, abertaId, aoAbrir }) {
  return (
    <section style={est.painel} aria-label="Medições da embalagem">
      <div style={est.painelTopo}>
        <div style={est.painelTopoTexto}>
          <h2 style={est.painelTitulo}>Medições da embalagem</h2>
          <p style={est.painelDica}>
            Volumes/hora do período inteiro, com as paradas dentro — o que de fato saiu.
            Em “Volume a volume”, a medição abre aqui embaixo, com cada volume.
          </p>
        </div>
      </div>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Data</th>
            <th style={est.th}>Máquina</th>
            <th style={est.th}>Produto</th>
            <th style={est.th}>Horários</th>
            <th style={est.thNum}>Período</th>
            <th style={est.thNum}>Parado</th>
            <th style={est.thNum}>Volumes</th>
            <th style={est.thNum}>Volumes/hora</th>
            <th style={est.th} aria-label="Detalhe" />
          </tr>
        </thead>
        <tbody>
          {medicoes.map((c) => {
            const calc = conferenciaRapida({ duracaoMs: Number(c.duracao_ms), pecas: c.pecas, paradas: c.paradas });
            const par = somarParadas(c.paradas);
            const selecionada = c.id === abertaId;
            return (
              <Fragment key={c.id}>
              <tr style={selecionada ? est.linhaSelecionada : undefined}>
                <td style={est.tdFraco}>{formatarDataHora(c.salvo_em)}</td>
                <td style={est.tdCurto}>{c.maquina || '—'}</td>
                <td style={est.tdCurto}>{c.peca || '—'}</td>
                <td style={est.tdFraco}>{faixaHoraria(c) || '—'}</td>
                <td style={est.tdNum}>{formatarDuracao(Number(c.duracao_ms))}</td>
                <td style={est.tdNum}>{par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'}</td>
                <td style={est.tdNum}>{c.pecas}</td>
                <td style={est.tdNumForte}>{calc ? Math.round(calc.pecasPorHoraBruto) : '—'}</td>
                <td style={est.tdAcoes}>
                  {c.com_marcas ? (
                    <button
                      type="button"
                      style={selecionada ? est.botaoLinhaAtivo : est.botaoLinha}
                      aria-pressed={selecionada}
                      onClick={() => aoAbrir(c)}
                    >
                      Volume a volume
                    </button>
                  ) : (
                    <span style={est.textoFraco} title="Medida por horários ou com a contagem corrigida à mão">
                      sem toques
                    </span>
                  )}
                </td>
              </tr>
              {/* A nota do analista, numa linha propria — como no relatorio
                  de ritmo. E' muitas vezes a explicacao da lacuna. */}
              {c.observacao && (
                <tr style={selecionada ? est.linhaSelecionada : undefined}>
                  <td style={est.tdObservacao} colSpan={9}>
                    <span style={est.rotuloObservacao}>Obs.</span>
                    {c.observacao}
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
