import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  faixaHoraria, formatarDuracao, leituraPecaAPeca, periodoPorPeca, somarParadas, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { taktDaMedicao } from '../../../domain/demandaSemanal.js';
import { frasesVolumeAVolume, numerosDaLeitura } from '../../../domain/volumeAVolume.js';
import { formatarDataHora } from '../../../domain/relatorioConferencias.js';
import { listarDemanda, marcasDaConferencia, salvarAnaliseConferencia } from '../../../lib/api.js';
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
 * contagem por toque), NA PROPRIA PAGINA, no lugar da lista e com a
 * largura toda — nao numa janela por cima. "Voltar a' lista" (aoFechar)
 * devolve a lista; quem troca a lista por este painel e' a tela. O ritmo
 * da medicao ja' estava no relatorio; o que este painel acrescenta e' COMO
 * ele saiu — regular, lento ou aos trancos.
 *
 * O TAKT vem de taktDaMedicao: o mesmo programa, a mesma jornada e o mesmo
 * setup planejado do quadro "Programa da semana", na semana DESTA medicao.
 * Na embalagem o programa e' em VOLUMES, e e' por volume que o takt
 * sai — a mesma unidade do toque.
 *
 * O VEREDITO usa a mesma regua do quadro do programa — relogio, paradas
 * dentro —, no trecho entre o primeiro e o ultimo toque (periodoPorPeca).
 * As barras do grafico sao da linha RODANDO: mostram o passo e onde ela
 * parou sem ninguem marcar. Frases e numeros moram em
 * domain/volumeAVolume.js, os mesmos na tela e na folha.
 *
 * A ANALISE DO PCP: lida a medicao, o PCP salva (com a conclusao, se
 * quiser) e volta para a lista. E' o que tira a medicao de "a analisar".
 * O botao mora no TOPO, ao lado de Imprimir e Voltar a' lista: o topo gruda
 * e esta' sempre a' vista. O fundo do painel nao — com a pagina no alto,
 * ele fica abaixo da dobra, e um botao ali seria um botao escondido.
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

/**
 * ANALISE DO PCP — a nota digitada, o "Salvando…" e a recusa de CADA
 * medicao, guardados pela TELA, nao pelo painel.
 *
 * Por medicao, porque o PCP compara: escreve em uma, abre outra, escreve,
 * volta — e cada nota tem de estar onde foi deixada. Na tela, porque o
 * painel some ao voltar a' lista: guardado nele, voltar apagava a nota
 * digitada. Aqui a nota nao salva sobrevive a voltar e reabrir, e a recusa
 * fica com a medicao (a linha da lista avisa) ate' a proxima tentativa. O rascunho
 * vive enquanto a TELA esta' aberta: saiu dela, ele se vai — por isso a
 * linha avisa quando ha' nota digitada e nao salva.
 *
 * `aplicar(atualizada, { fechar })` e' quem muda a lista e volta para ela.
 * Sem rascunho, o campo comeca na nota salva — a que ficou ao reabrir.
 */
export function useAnalisesDoPcp(aplicar) {
  const [rascunhos, setRascunhos] = useState({}); // id -> texto
  const [salvando, setSalvando] = useState({}); // id -> true
  const [falhas, setFalhas] = useState({}); // id -> { mensagem, reabrir }
  const sem = (mapa, id) => {
    if (!(id in mapa)) return mapa;
    const resto = { ...mapa };
    delete resto[id];
    return resto;
  };
  const notaDe = (c) => (c.id in rascunhos ? rascunhos[c.id] : (c.analise_nota || ''));
  // Digitada e diferente da salva, numa medicao ainda nao analisada: e' o
  // que se perde ao sair da tela. A que esta' indo para o servidor nao
  // conta — ela ja' saiu; se for recusada, volta a contar.
  const notaNaoSalva = (c) => {
    const digitada = c.id in rascunhos ? rascunhos[c.id].trim() : null;
    return !c.analisada_em && !salvando[c.id] && digitada !== null && digitada !== (c.analise_nota || '').trim();
  };

  async function salvar(conferencia, analisar) {
    const { id } = conferencia;
    setSalvando((m) => ({ ...m, [id]: true }));
    setFalhas((m) => sem(m, id));
    try {
      const atualizada = await salvarAnaliseConferencia(id, {
        analisada: analisar, nota: notaDe(conferencia).trim(),
      });
      // Salvo, o rascunho cumpriu o papel: o campo volta a ler o banco.
      setRascunhos((m) => sem(m, id));
      // Volta a' lista so' ao salvar; reabrir deixa o painel aberto, com a nota.
      aplicar(atualizada, { fechar: analisar });
    } catch (e) {
      setFalhas((m) => ({ ...m, [id]: { mensagem: e.message, reabrir: !analisar } }));
    } finally {
      setSalvando((m) => sem(m, id));
    }
  }

  return {
    /** Ha' alguma analise indo para o servidor (a tela nao deve sair). */
    ocupado: Object.keys(salvando).length > 0,
    notaNaoSalva,
    /**
     * O que a LINHA precisa avisar de uma medicao fechada: a recusa (de
     * salvar ou de reabrir — reabrir recusado deixa a analise salva, e o
     * aviso nao pode dizer o contrario) ou a nota digitada e nao salva.
     */
    pendencia: (c) => {
      if (falhas[c.id]) return falhas[c.id].reabrir ? 'reabrir-recusado' : 'salvar-recusado';
      return notaNaoSalva(c) ? 'nota-nao-salva' : null;
    },
    /** O que o painel da medicao `c` precisa. */
    da: (c) => ({
      nota: notaDe(c),
      mudarNota: (texto) => setRascunhos((m) => ({ ...m, [c.id]: texto })),
      salvando: Boolean(salvando[c.id]),
      erro: falhas[c.id]?.mensagem || null,
      salvar: (analisar) => salvar(c, analisar),
    }),
  };
}

/**
 * O clique que e' o SEGUNDO de um duplo clique nao vale. O painel abre no
 * lugar da lista, debaixo do cursor: quem abria a linha com duplo clique
 * acertava "Salvar análise e voltar" com o segundo, e a medicao ficava
 * analisada sem ninguem ler. O mesmo vale ao contrario — o Voltar devolve
 * a lista, e o segundo clique abria outra linha. Teclado (detail 0) e
 * clique simples passam.
 */
export const cliqueSimples = (fazer) => (ev) => {
  if (ev.detail > 1) return;
  fazer(ev);
};

const TOM = {
  atende: est.vereditoAtende,
  falha: est.vereditoFalha,
  atencao: { background: claro.atencaoFundo, borderLeftColor: claro.atencao },
  neutro: { background: claro.fundo, borderLeftColor: claro.neutro },
};

/** A cor do veredito, levada ao cartao do numero que ele julga. */
const COR_DO_TOM = { atende: claro.ok, falha: claro.critico, atencao: claro.atencao };

export default function VolumeAVolume({
  conferencia, grupo, maquinasDoGrupo, aoFechar, analise,
}) {
  const unidade = unidadeDoPosto(grupo?.nome);
  const r = useVolumeAVolume({ conferencia, grupo, maquinasDoGrupo });
  const titulo = `${capital(unidade.singular)} a ${unidade.singular}`;
  const pronto = r.estado === 'pronto';
  const frases = pronto ? frasesVolumeAVolume({ ...r, unidade, nomeGrupo: grupo?.nome }) : null;
  // So' com a leitura na tela: nao se analisa o que nao carregou. O estado
  // da analise (nota digitada, "Salvando…", recusa) vem da tela — ver
  // useAnalisesDoPcp.
  const podeAnalisar = pronto && Boolean(analise);
  const analisada = Boolean(conferencia.analisada_em);
  const salvando = Boolean(analise?.salvando);
  const quando = conferencia.iniciado_em || conferencia.salvo_em;
  const meta = [
    formatarDataHora(quando),
    faixaHoraria(conferencia),
    `${formatarDuracao(Number(conferencia.duracao_ms))} de medição`,
  ].filter(Boolean);

  return (
    <>
      <section style={est.vavPainel} aria-label={`${titulo} da medição`}>
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
            {analisada && (
              <p style={est.vavAnaliseSelo}>
                {['✓ Analisada', conferencia.analisada_por, `em ${formatarDataHora(conferencia.analisada_em)}`]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div style={est.vavAcoes}>
            {/* Salvar volta para a lista; reabrir deixa o painel aberto, com a nota no
                campo para corrigir (e desfaz o clique errado). */}
            {podeAnalisar && (analisada ? (
              <button
                type="button" style={est.botaoSecundario}
                onClick={cliqueSimples(() => analise.salvar(false))} disabled={salvando}
              >
                {salvando ? 'Reabrindo…' : 'Reabrir análise'}
              </button>
            ) : (
              <button
                type="button" style={est.botaoSalvarAnalise}
                onClick={cliqueSimples(() => analise.salvar(true))} disabled={salvando}
              >
                {salvando ? 'Salvando…' : 'Salvar análise e voltar'}
              </button>
            ))}
            {pronto && (
              /* O PDF sai com o nome da folha — "Takt Time - Rack Sirius 1.6 -
                 EMBALAGEM 01 - 19-10-2026 13h36" —, nao com o do sistema. */
              <button
                type="button"
                style={est.botaoSecundario}
                onClick={cliqueSimples(() => imprimirComo(nomeDoArquivo(
                  'Takt Time',
                  conferencia.peca || 'sem produto',
                  conferencia.maquina,
                  dataDoArquivo(quando),
                )))}
              >
                Imprimir
              </button>
            )}
            {/* Travado enquanto salva: de volta a' lista no meio, o painel nao
                estaria aqui para dizer se o servidor recusou. */}
            <button type="button" style={est.botaoSecundario} onClick={cliqueSimples(aoFechar)} disabled={salvando}>
              Voltar à lista
            </button>
          </div>
          {/* A recusa aparece colada ao botao, e o painel NAO volta para a
              lista: voltar seria dizer que salvou. */}
          {analise?.erro && (
            <div style={est.vavAnaliseErro} role="alert">
              {analisada ? 'Não deu para reabrir' : 'Não deu para salvar'}: {analise.erro}
            </div>
          )}
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

              {/* 5. A CONCLUSAO DO PCP — logo depois da leitura, que e' a que
                  ela responde. Salva pelo botao do topo. */}
              {podeAnalisar && (
                <section aria-label="Análise do PCP">
                  <h3 style={est.vavSecaoTitulo}>Análise do PCP</h3>
                  {analisada ? (
                    <p style={conferencia.analise_nota ? est.vavAnaliseNota : est.vavSecaoDica}>
                      {conferencia.analise_nota || 'Salva sem comentário.'}
                    </p>
                  ) : (
                    <>
                      <p style={est.vavSecaoDica}>
                        Opcional. Vai junto quando você clica em Salvar análise e voltar, no alto da página.
                      </p>
                      <textarea
                        aria-label="Análise do PCP"
                        rows={3}
                        maxLength={2000}
                        value={analise.nota}
                        onChange={(ev) => analise.mudarNota(ev.target.value)}
                        // O que se digitasse durante o envio nao iria junto.
                        disabled={salvando}
                        placeholder="Ex.: lacunas por falta de caixa às 9h; abastecer antes da troca de turno"
                        style={est.vavAnaliseEntrada}
                      />
                    </>
                  )}
                </section>
              )}

              {/* Os termos definidos so' aparecem com a leitura completa. */}
              {r.leitura.suficiente && <ComoLer leitura={r.leitura} unidade={unidade} />}
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
    // Com a leitura insuficiente, o cartao "Intervalos tocados" ja' diz isso.
    sub: leitura.suficiente ? `${leitura.n} ${leitura.n === 1 ? 'intervalo medido' : 'intervalos medidos'}` : null,
  };
  // A soma das paradas marcadas na medicao INTEIRA — o mesmo numero da
  // coluna "Parado" da lista e do "Parado (marcado)" da folha. Inclui a
  // troca antes do 1o toque, que os dois tempos por volume nao contem: o
  // subtitulo diz isso, para a diferenca entre eles nao ser lida como ela.
  const paradas = {
    chave: 'paradas',
    rotulo: 'Paradas marcadas',
    valor: par.totalMs > 0 ? formatarDuracao(par.totalMs) : '—',
    sub: par.n > 0
      ? `${par.n} ${par.n === 1 ? 'parada' : 'paradas'} na medição inteira, também fora dos toques`
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
 * pelos INTERVALOS (volumes - 1), menos o setup marcado no trecho quando ha'
 * setup planejado — exatamente periodoPorPeca.
 */
function definicoes(leitura, unidade) {
  const toque = unidade.singular === 'volume' ? 'volume' : 'toque';
  const { fatorLacuna, minIntervalos } = leitura.criterios;
  return [
    ['Intervalo', `tempo de um ${toque} até o seguinte, com a linha rodando. As paradas marcadas no cronômetro já saíram; as marcadas depois (no resultado do tablet ou aqui no PC) continuam dentro. O primeiro toque não tem intervalo: o intervalo vai de um toque ao seguinte, e o tempo antes do primeiro toque não entra.`],
    [`Por ${unidade.singular} no período`, 'relógio do primeiro ao último toque, com as paradas dentro, dividido pelo número de intervalos. Só o setup marcado entre os toques sai do relógio, e só quando o grupo tem setup planejado (ele já saiu das horas do takt). É o que vai contra o takt — a mesma régua do programa da semana.'],
    [`Por ${unidade.singular} com a linha rodando`, 'soma dos intervalos dividida pela quantidade de intervalos.'],
    ['Lacuna', `intervalo maior que ${fatorLacuna}× o normal — a média dos intervalos que não são lacuna (o "sem as lacunas"). Parada marcada e passo lento não viram lacuna.`],
    ['Leitura', `a partir de ${minIntervalos} intervalos.${unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é em volumes, e o takt usa as horas dos dias programados.' : ''}`],
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
    + 'continuam dentro dos intervalos. O primeiro toque não tem intervalo: o intervalo vai de um toque ao '
    + 'seguinte, e o tempo antes do primeiro toque não entra. Contra o takt vai o relógio do primeiro ao último toque ÷ intervalos, com as paradas dentro '
    + '(sem o setup marcado entre os toques, quando o grupo tem setup planejado) — a mesma régua do programa da semana. '
    + 'Com a linha rodando = soma dos intervalos ÷ quantidade. '
    + `Lacuna = intervalo maior que ${leitura.criterios.fatorLacuna}× o normal — a média dos intervalos que não são lacuna. `
    + `Leitura a partir de ${leitura.criterios.minIntervalos} intervalos.`
    + (unidade.singular === 'volume' ? ' Na embalagem, o programa da semana é em volumes, e o takt usa as horas dos dias programados.' : '');
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
      {/* A analise salva vai junto: a folha que chega a' reuniao diz se o
          PCP ja' leu a medicao, e o que concluiu. */}
      {conferencia.analisada_em && (
        <p style={{ margin: '0 0 10px', whiteSpace: 'pre-line' }}>
          <strong>Análise do PCP</strong>
          {' '}({[conferencia.analisada_por, formatarDataHora(conferencia.analisada_em)].filter(Boolean).join(', ')})
          {conferencia.analise_nota ? `: ${conferencia.analise_nota}` : ''}
        </p>
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
