import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  faixaHoraria, formatarDuracao, leituraPecaAPeca, periodoPorPeca, somarParadas, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../../domain/demandaSemanal.js';
import { frasesVolumeAVolume, numerosDaLeitura } from '../../../domain/volumeAVolume.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { listarDemanda, marcasDaConferencia } from '../../../lib/api.js';
import { dataDoArquivo, imprimirComo, nomeDoArquivo } from '../../../lib/impressao.js';
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
 * contagem por toque), NA PROPRIA PAGINA, logo abaixo da lista — nao numa
 * janela por cima: a lista continua a vista para trocar de medicao, e a
 * tela larga do PC deixa de sobrar vazia. O ritmo da medicao ja' estava no
 * relatorio; o que este painel acrescenta e' COMO ele saiu — regular,
 * lento ou aos trancos.
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

/** A cor do veredito, levada ao cartao do numero que ele julga. */
const COR_DO_TOM = { atende: claro.ok, falha: claro.critico, atencao: claro.atencao };

export default function VolumeAVolume({
  conferencia, grupo, maquinasDoGrupo, aoFechar,
}) {
  const unidade = unidadeDoPosto(grupo?.nome);
  const r = useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo });
  const titulo = `${capital(unidade.singular)} a ${unidade.singular}`;
  const pronto = r.estado === 'pronto';
  const frases = pronto ? frasesVolumeAVolume({ ...r, unidade, nomeGrupo: grupo?.nome }) : null;
  const quando = conferencia.iniciado_em || conferencia.salvo_em;
  const meta = [
    formatarDataHora(quando),
    faixaHoraria(conferencia),
    `${formatarDuracao(Number(conferencia.duracao_ms))} de medição`,
  ].filter(Boolean);

  // Selecionou outra medicao: a leitura dela aparece logo abaixo da lista,
  // e a pagina rola ate' ela — com trinta medicoes, o detalhe nasceria
  // fora da vista.
  const refPainel = useRef(null);
  useEffect(() => {
    refPainel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [conferencia.id]);

  return (
    <>
      <section ref={refPainel} style={est.vavPainel} aria-label={`${titulo} da medição`}>
        {/* 1. IDENTIFICACAO — o produto e' o titulo: e' por ele que o PCP
            procura a medicao (e o que da' nome ao PDF). */}
        <header style={est.vavTopo}>
          <div style={est.vavIdentidade}>
            <span style={est.vavSobretitulo}>{titulo}</span>
            <h2 style={est.vavTitulo}>{conferencia.peca || 'Produto não informado'}</h2>
            <p style={est.vavMeta}>
              <span style={est.vavMetaForte}>{conferencia.maquina || 'Máquina não informada'}</span>
              {meta.map((m) => (
                <Fragment key={m}>
                  <span style={est.vavMetaSeparador} aria-hidden="true">·</span>
                  <span>{m}</span>
                </Fragment>
              ))}
            </p>
          </div>
          <div style={est.vavAcoes}>
            {pronto && (
              /* O PDF sai com o nome da folha — "Takt Time - Rack Sirius 1.6 -
                 EMBALAGEM 01 - 19-10-2026 13h36" —, nao com o do sistema. */
              <button
                type="button"
                style={est.botaoSecundario}
                onClick={() => imprimirComo(nomeDoArquivo(
                  'Takt Time',
                  conferencia.peca || 'sem produto',
                  conferencia.maquina,
                  dataDoArquivo(quando),
                ))}
              >
                Imprimir
              </button>
            )}
            <button type="button" style={est.botaoSecundario} onClick={aoFechar}>Fechar</button>
          </div>
        </header>

        <div style={est.vavCorpo}>
          {/* A nota do analista ("faltou caixa 9h10") e' muitas vezes a
              explicacao da lacuna: precisa estar onde a lacuna aparece. */}
          {conferencia.observacao && (
            <p style={est.vavObs}>
              <span style={est.vavObsRotulo}>Obs. do analista</span>
              {conferencia.observacao}
            </p>
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
              {/* 2. INDICADORES */}
              <Indicadores
                conferencia={conferencia} leitura={r.leitura} takt={r.takt} unidade={unidade} tom={frases.tom}
              />

              {/* 3. GRAFICO */}
              <GraficoIntervalos leitura={r.leitura} unidade={unidade} altura={300} />

              {/* 4. EXPLICACAO — o veredito em palavras e onde a linha parou. */}
              <div style={est.vavLeituraGrade}>
                <section aria-label="Leitura da medição">
                  <h3 style={est.vavSecaoTitulo}>Leitura da medição</h3>
                  <div style={{ ...est.veredito, ...TOM[frases.tom] }}>
                    <p style={est.vereditoManchete}>{frases.manchete}</p>
                    <ul style={est.vavLista}>
                      {frases.linhas.map((l) => <li key={l} style={est.vereditoTexto}>{l}</li>)}
                    </ul>
                  </div>
                </section>
                {r.leitura.suficiente && r.leitura.lacunas.length > 0 && (
                  <TabelaLacunas leitura={r.leitura} unidade={unidade} />
                )}
              </div>

              <ComoLer leitura={r.leitura} unidade={unidade} />
            </>
          )}
        </div>
      </section>

      {pronto && (
        <FolhaVolumeAVolume
          conferencia={conferencia} leitura={r.leitura} takt={r.takt} frases={frases}
          unidade={unidade}
        />
      )}
    </>
  );
}

/**
 * OS NUMEROS DA MEDICAO. Em destaque, os cinco que o lider le primeiro:
 * quantos volumes, os dois tempos por volume (periodo e linha rodando, lado
 * a lado — a diferenca entre eles e' o peso das paradas), quanto se parou
 * marcando e quantas lacunas. Na faixa de apoio, os que completam a
 * leitura. Todos saem de numerosDaLeitura e de somarParadas — os mesmos
 * da folha A4; nenhum numero novo nasce aqui.
 */
function Indicadores({
  conferencia, leitura, takt, unidade, tom,
}) {
  const numeros = numerosDaLeitura(leitura, takt, unidade);
  const doDominio = Object.fromEntries(numeros.map((k) => [k.chave, k]));
  const par = somarParadas(conferencia.paradas);
  const volumes = {
    chave: 'volumes',
    rotulo: capital(unidade.plural),
    valor: String(conferencia.pecas),
    sub: `${leitura.n} ${leitura.n === 1 ? 'intervalo medido' : 'intervalos medidos'}`,
  };
  // A soma das paradas marcadas na medicao inteira — o mesmo numero da
  // coluna "Parado" da lista e do "Parado (marcado)" da folha.
  const paradas = {
    chave: 'paradas',
    rotulo: 'Paradas marcadas',
    valor: par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—',
    sub: par.n > 0
      ? `${par.n} ${par.n === 1 ? 'parada' : 'paradas'} na medição`
      : 'nenhuma parada marcada',
  };
  const principais = leitura.suficiente
    ? [volumes, doDominio.periodo, doDominio.rodando, paradas, doDominio.lacunas]
    : [volumes, ...numeros, paradas];
  const apoio = leitura.suficiente ? [doDominio.normal, doDominio.takt] : [];
  const corVeredito = COR_DO_TOM[tom];

  return (
    <>
      <div style={est.vavKpis}>
        {principais.map((k) => (
          <div
            key={k.chave}
            style={k.chave === 'periodo' && corVeredito
              ? { ...est.vavKpi, boxShadow: `inset 0 3px 0 ${corVeredito}` }
              : est.vavKpi}
          >
            <div style={est.vavKpiRotulo}>{k.rotulo}</div>
            <ValorComUnidade valor={k.valor} />
            {k.sub && <div style={est.vavKpiSub}>{k.sub}</div>}
          </div>
        ))}
      </div>
      {apoio.length > 0 && (
        <div style={est.vavApoio}>
          {apoio.map((k) => (
            <span key={k.chave}>
              <span style={est.vavApoioRotulo}>{k.rotulo}</span>
              {/* Sem valor, so' o porque ("sem programa para comparar"). */}
              {k.valor !== '—' && <span style={est.vavApoioValor}>{k.valor}</span>}
              {k.sub ? `${k.valor !== '—' ? ' · ' : ''}${k.sub}` : ''}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** "77.0 s" -> 77.0 grande e o "s" menor ao lado; o resto sai inteiro. */
function ValorComUnidade({ valor }) {
  const m = /^(\d[\d.,]*) (s|min|h)$/.exec(valor);
  if (!m) return <div style={est.vavKpiValor}>{valor}</div>;
  return (
    <div style={est.vavKpiValor}>
      {m[1]}{' '}<span style={est.vavKpiUnidade}>{m[2]}</span>
    </div>
  );
}

/**
 * O criterio, por extenso — o mesmo da nota da folha A4, item por item.
 * Contra o takt vai o relogio entre o primeiro e o ultimo toque dividido
 * pelos INTERVALOS (volumes - 1), como faz periodoPorPeca.
 */
function definicoes(leitura, unidade) {
  const toque = unidade.singular === 'volume' ? 'volume' : 'toque';
  const { fatorLacuna, minIntervalos } = leitura.criterios;
  return [
    ['Intervalo', `tempo de um ${toque} até o seguinte, com a linha rodando. As paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) continuam dentro. O primeiro toque não tem intervalo — o cronômetro começa num instante qualquer.`],
    [`Por ${unidade.singular} no período`, 'relógio do primeiro ao último toque, com as paradas dentro, dividido pelo número de intervalos. É o que vai contra o takt — a mesma régua do programa da semana.'],
    [`Por ${unidade.singular} com a linha rodando`, 'soma dos intervalos dividida pela quantidade de intervalos.'],
    ['Lacuna', `intervalo maior que ${fatorLacuna}× o normal — a média dos intervalos que não são lacuna (o "sem as lacunas"). Parada marcada e passo lento não viram lacuna.`],
    ['Leitura', `a partir de ${minIntervalos} intervalos.${unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é colado em volumes.' : ''}`],
  ];
}

function ComoLer({ leitura, unidade }) {
  return (
    <section aria-label="Como ler estes números">
      <h3 style={est.vavSecaoTitulo}>Como ler estes números</h3>
      <dl style={est.vavComoLer}>
        {definicoes(leitura, unidade).map(([termo, texto]) => (
          <div key={termo} style={est.vavComoLerItem}>
            <dt style={{ display: 'inline', ...est.vavComoLerTermo }}>{termo}: </dt>
            <dd style={{ display: 'inline', margin: 0 }}>{texto}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function notaDoCriterio(leitura, unidade) {
  return `Intervalo = tempo de um ${unidade.singular === 'volume' ? 'volume' : 'toque'} até o seguinte, com a linha rodando: `
    + 'as paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) '
    + 'continuam dentro dos intervalos. O primeiro toque não tem intervalo — o cronômetro começa num instante '
    + 'qualquer. Contra o takt vai o relógio do primeiro ao último toque ÷ intervalos, com as paradas dentro — '
    + 'a mesma régua do programa da semana. '
    + 'Com a linha rodando = soma dos intervalos ÷ quantidade. '
    + `Lacuna = intervalo maior que ${leitura.criterios.fatorLacuna}× o normal — a média dos intervalos que não são lacuna. `
    + `Leitura a partir de ${leitura.criterios.minIntervalos} intervalos.`
    + (unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é colado em volumes.' : '');
}

function TabelaLacunas({ leitura, unidade }) {
  return (
    <section aria-label="Lacunas">
      <h3 style={est.vavSecaoTitulo}>Onde a linha parou sem parada marcada</h3>
      <p style={est.vavSecaoDica}>
        Intervalos acima de {leitura.criterios.fatorLacuna}× o normal ({emSegundos(leitura.normalMs)}),
        na ordem em que aconteceram.
      </p>
      <div style={est.vavTabelaMoldura}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.vavTh}>{capital(unidade.singular)} nº</th>
              <th style={est.vavTh}>Intervalo</th>
              <th style={est.vavTh}>Além do normal</th>
            </tr>
          </thead>
          <tbody>
            {leitura.lacunas.map((l) => (
              <tr key={l.indice}>
                <td style={est.vavTd}>{l.indice + 2}</td>
                <td style={est.vavTdForte}>{emSegundos(l.ms)}</td>
                <td style={est.vavTd}>{emSegundos(l.ms - leitura.normalMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * A FOLHA A4 — num portal, como a do cadastro de maquinas: enquanto a
 * janela esta' aberta, o resto do app some do papel; fechou, o relatorio
 * volta a ser o que imprime.
 */
function FolhaVolumeAVolume({
  conferencia, leitura, takt, frases, unidade,
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
          {/* Mesmo nome do arquivo: o que esta' escrito na folha bate com o
              nome do PDF na pasta. */}
          <h1 style={imp.titulo}>
            Takt Time — {[conferencia.peca || 'sem produto', conferencia.maquina].filter(Boolean).join(' · ')}
          </h1>
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
