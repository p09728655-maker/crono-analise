import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  faixaHoraria, formatarDuracao, leituraPecaAPeca, periodoPorPeca, somarParadas, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../../domain/demandaSemanal.js';
import { frasesVolumeAVolume, numerosDaLeitura } from '../../../domain/volumeAVolume.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { listarDemanda, marcasDaConferencia } from '../../../lib/api.js';
import { claro } from '../../../theme/tokensAnalise.js';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { GraficoIntervalos } from '../graficos/Intervalos.jsx';
import { est, imp } from './estilos.js';
import { emSegundos } from './formato.js';

/** Lacunas listadas na folha A4: as maiores. A tela mostra todas. */
const MAX_LACUNAS_PAPEL = 15;

/**
 * VOLUME A VOLUME — o intervalo de cada volume de UMA medicao, contra o
 * takt da semana em que ela foi feita.
 *
 * Abre pela linha da medicao (so' as que tem marcas: cronometro ao vivo,
 * contagem por toque). O ritmo da medicao ja' estava no relatorio; o que
 * esta janela acrescenta e' COMO ele saiu — regular, lento ou aos trancos.
 *
 * O TAKT vem de taktDaMedicao: o mesmo programa, a mesma jornada e o mesmo
 * setup planejado do quadro "Programa da semana", na semana DESTA medicao.
 * Na embalagem o programa e' colado em VOLUMES, e e' por volume que o takt
 * sai — a mesma unidade do toque.
 *
 * O VEREDITO usa a mesma regua do quadro do programa — relogio, paradas
 * dentro —, no trecho entre o primeiro e o ultimo toque (periodoPorPeca).
 * As barras do grafico sao da linha RODANDO: mostram o passo e onde ela
 * parou sem ninguem marcar. Frases e numeros moram em
 * domain/volumeAVolume.js, os mesmos na tela e na folha.
 */
export function useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo }) {
  const [carga, setCarga] = useState({ estado: 'carregando' });

  useEffect(() => {
    let vivo = true;
    setCarga({ estado: 'carregando' });
    Promise.all([
      // As marcas e o relogio entre o primeiro e o ultimo toque.
      marcasDaConferencia(conferencia.id),
      // Sem grupo nao ha' programa — e falha do programa nao derruba o
      // grafico: os intervalos continuam valendo sem a linha do takt.
      grupo ? listarDemanda(grupo.id).catch(() => null) : Promise.resolve([]),
    ])
      .then(([toques, demandas]) => { if (vivo) setCarga({ estado: 'pronto', ...toques, demandas }); })
      .catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, [conferencia.id, grupo?.id]);

  return useMemo(() => {
    if (carga.estado !== 'pronto') return carga;
    const takt = !grupo
      ? { taktMs: null, estado: 'sem-grupo', semana: null }
      : carga.demandas === null
        ? { taktMs: null, estado: 'erro-programa', semana: null }
        : taktDaMedicao({
          demandas: carga.demandas,
          horas: grupo.horas_semana,
          maquinas: maquinasDoGrupo,
          setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
          data: conferencia.iniciado_em || conferencia.salvo_em,
          pecas: conferencia.pecas,
          duracaoMs: Number(conferencia.duracao_ms),
        });
    // O veredito e' do PERIODO, paradas dentro, entre o primeiro e o ultimo
    // toque (ver periodoPorPeca).
    const periodoPorPecaMs = periodoPorPeca({
      relogioEntreMarcasMs: carga.relogio,
      volumes: (carga.marcas || []).length,
      setupNoTrechoMs: carga.setup,
      setupPlanejado: Boolean(takt.setupPlanejado),
    });
    const leitura = leituraPecaAPeca({ marcasMs: carga.marcas, taktMs: takt.taktMs, periodoPorPecaMs });
    return { estado: leitura ? 'pronto' : 'sem-marcas', leitura, takt };
  }, [carga, grupo, maquinasDoGrupo, conferencia]);
}

const TOM = {
  atende: est.vereditoAtende,
  falha: est.vereditoFalha,
  atencao: { background: claro.atencaoFundo, borderLeftColor: claro.atencao },
  neutro: { background: claro.fundo, borderLeftColor: claro.neutro },
};

export default function VolumeAVolume({
  conferencia, grupo, maquinasDoGrupo, aoFechar,
}) {
  const unidade = unidadeDoPosto(grupo?.nome);
  const r = useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo });
  const titulo = `${capital(unidade.singular)} a ${unidade.singular}`;
  const identificacao = [conferencia.maquina, conferencia.peca].filter(Boolean).join(' · ') || 'Sem identificação';
  const pronto = r.estado === 'pronto';
  const frases = pronto ? frasesVolumeAVolume({ ...r, unidade, nomeGrupo: grupo?.nome }) : null;

  return (
    <div style={est.modal} role="dialog" aria-label={`${titulo} da medição`}>
      <div style={{ ...est.caixaModal, maxWidth: 980, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={est.tituloModal}>{titulo}</h2>
        <p style={est.textoModal}>
          <strong>{identificacao}</strong>
          {' · '}{formatarDataHora(conferencia.iniciado_em || conferencia.salvo_em)}
          {faixaHoraria(conferencia) ? ` · ${faixaHoraria(conferencia)}` : ''}
          {' · '}{conferencia.pecas} {unidade.plural} em {formatarDuracao(Number(conferencia.duracao_ms))}
        </p>
        {/* A nota do analista ("faltou caixa 9h10") e' muitas vezes a
            explicacao da lacuna: precisa estar onde a lacuna aparece. */}
        {conferencia.observacao && (
          <p style={est.textoModal}><strong>Obs. do analista:</strong> {conferencia.observacao}</p>
        )}

        {r.estado === 'carregando' && <p style={est.textoModal}>Carregando os toques desta medição…</p>}
        {r.estado === 'erro' && (
          <div style={est.faixaErro} role="alert">Não deu para carregar esta medição: {r.erro}</div>
        )}
        {r.estado === 'sem-marcas' && (
          <p style={est.textoModal}>
            Esta medição não tem toques suficientes para mostrar intervalo — é preciso pelo
            menos dois.
          </p>
        )}

        {pronto && (
          <>
            <div style={{ ...est.veredito, ...TOM[frases.tom] }}>
              <p style={est.vereditoManchete}>{frases.manchete}</p>
              {frases.linhas.map((l) => <p key={l} style={est.vereditoTexto}>{l}</p>)}
            </div>

            <div style={{ ...est.kpis, marginBottom: 0 }}>
              {numerosDaLeitura(r.leitura, r.takt, unidade).map((k) => (
                <div key={k.rotulo} style={est.kpi}>
                  <div style={est.kpiRotulo}>{k.rotulo}</div>
                  <div style={{ ...est.kpiValor, fontSize: 24 }}>{k.valor}</div>
                  {k.sub && <div style={est.kpiSub}>{k.sub}</div>}
                </div>
              ))}
            </div>

            <GraficoIntervalos leitura={r.leitura} unidade={unidade} />

            {r.leitura.suficiente && r.leitura.lacunas.length > 0 && (
              <TabelaLacunas leitura={r.leitura} unidade={unidade} />
            )}

            <p style={est.painelDica}>{notaDoCriterio(r.leitura, unidade)}</p>
          </>
        )}

        <div style={est.acoesModal}>
          {pronto && (
            <button type="button" style={est.botaoSecundario} onClick={() => window.print()}>
              Imprimir
            </button>
          )}
          <button type="button" style={est.botaoSecundario} onClick={aoFechar}>Fechar</button>
        </div>
      </div>

      {pronto && (
        <FolhaVolumeAVolume
          conferencia={conferencia} leitura={r.leitura} takt={r.takt} frases={frases}
          unidade={unidade} titulo={titulo} identificacao={identificacao}
        />
      )}
    </div>
  );
}

function notaDoCriterio(leitura, unidade) {
  return `Intervalo = tempo de um ${unidade.singular === 'volume' ? 'volume' : 'toque'} até o seguinte, com a linha rodando: `
    + 'as paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) '
    + 'continuam dentro dos intervalos. O primeiro toque não tem intervalo — o cronômetro começa num instante '
    + 'qualquer. Contra o takt vai o período ÷ volumes, com as paradas dentro — a mesma régua do programa da semana. '
    + 'Com a linha rodando = soma dos intervalos ÷ quantidade. '
    + `Lacuna = intervalo maior que ${leitura.criterios.fatorLacuna}× o normal — a média dos intervalos que não são lacuna. `
    + `Leitura a partir de ${leitura.criterios.minIntervalos} intervalos.`
    + (unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é colado em volumes.' : '');
}

function TabelaLacunas({ leitura, unidade }) {
  return (
    <section aria-label="Lacunas">
      <h3 style={{ ...est.painelTitulo, margin: '0 0 4px' }}>Onde a linha parou sem parada marcada</h3>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.thNum}>{capital(unidade.singular)} nº</th>
            <th style={est.thNum}>Intervalo</th>
            <th style={est.thNum}>Além do normal</th>
          </tr>
        </thead>
        <tbody>
          {leitura.lacunas.map((l) => (
            <tr key={l.indice}>
              <td style={est.tdNum}>{l.indice + 2}</td>
              <td style={est.tdNumForte}>{emSegundos(l.ms)}</td>
              <td style={est.tdNum}>{emSegundos(l.ms - leitura.normalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * A FOLHA A4 — num portal, como a do cadastro de maquinas: enquanto a
 * janela esta' aberta, o resto do app some do papel; fechou, o relatorio
 * volta a ser o que imprime.
 */
function FolhaVolumeAVolume({
  conferencia, leitura, takt, frases, unidade, titulo, identificacao,
}) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const par = somarParadas(conferencia.paradas);
  const lacunas = [...(leitura.lacunas || [])]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAX_LACUNAS_PAPEL)
    .sort((a, b) => a.indice - b.indice);
  const restantes = (leitura.lacunas || []).length - lacunas.length;

  return createPortal(
    <div className="somente-impressao" style={imp.folha}>
      <style>{'@media print { #raiz { display: none !important } }'}</style>

      <header style={imp.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={imp.logo} />
          <h1 style={imp.titulo}>{titulo} — {identificacao}</h1>
        </div>
        <div style={imp.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={imp.identificacao}>
        {[
          ['Medição', formatarDataHora(conferencia.iniciado_em || conferencia.salvo_em)],
          ['Período', faixaHoraria(conferencia) || formatarDuracao(Number(conferencia.duracao_ms))],
          [capital(unidade.plural), String(conferencia.pecas)],
          ['Parado (marcado)', par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—'],
        ].map(([k, v]) => (
          <div key={k} style={imp.campo}>
            <span style={imp.campoRotulo}>{k}</span>
            <span style={imp.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      {conferencia.observacao && (
        <p style={{ margin: '0 0 10px' }}><strong>Obs. do analista:</strong> {conferencia.observacao}</p>
      )}

      {/* O destaque no papel e' a borda grossa, nao a cor: a impressora da
          fabrica e' P&B. */}
      <section style={{ border: '2px solid #000', padding: '6px 8px', marginBottom: 12, breakInside: 'avoid' }}>
        <p style={{ margin: 0, fontWeight: 700 }}>{frases.manchete}</p>
        {frases.linhas.map((l) => <p key={l} style={{ margin: '4px 0 0' }}>{l}</p>)}
      </section>

      <section style={{ ...imp.identificacao, gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {numerosDaLeitura(leitura, takt, unidade).map((k) => (
          <div key={k.rotulo} style={imp.campo}>
            <span style={imp.campoRotulo}>{k.rotulo}</span>
            <span style={imp.campoValor}>{k.valor}</span>
            {k.sub && <span style={{ fontSize: 8, color: '#555' }}>{k.sub}</span>}
          </div>
        ))}
      </section>

      <GraficoIntervalos leitura={leitura} unidade={unidade} larguraFixa={700} altura={240} />

      {lacunas.length > 0 && (
        <section style={{ marginTop: 10 }}>
          <h2 style={imp.tituloSecao}>Onde a linha parou sem parada marcada</h2>
          <table style={imp.tabela}>
            <thead>
              <tr>
                <th style={imp.thNum}>{capital(unidade.singular)} nº</th>
                <th style={imp.thNum}>Intervalo</th>
                <th style={imp.thNum}>Além do normal</th>
                <th style={imp.th}>O que aconteceu</th>
              </tr>
            </thead>
            <tbody>
              {lacunas.map((l) => (
                <tr key={l.indice}>
                  <td style={imp.tdNum}>{l.indice + 2}</td>
                  <td style={imp.tdNum}>{emSegundos(l.ms)}</td>
                  <td style={imp.tdNum}>{emSegundos(l.ms - leitura.normalMs)}</td>
                  {/* Em branco de proposito: e' para preencher a caneta na
                      conversa com a lideranca da linha. */}
                  <td style={{ ...imp.td, width: '45%' }} />
                </tr>
              ))}
            </tbody>
          </table>
          {restantes > 0 && (
            <p style={imp.nota}>E mais {restantes} lacuna(s) menores — a lista completa está na tela.</p>
          )}
        </section>
      )}

      <p style={imp.nota}>{notaDoCriterio(leitura, unidade)}</p>
    </div>,
    document.body,
  );
}

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
