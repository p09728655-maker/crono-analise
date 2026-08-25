import { useCallback, useEffect, useMemo, useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import Cabecalho from '../../components/Cabecalho.jsx';
import Abas from '../../components/Abas.jsx';
import {
  amostraSuficiente, calcularOperacao, formatarSegundos, FR_PRESETS,
  operadoresNecessarios, taktTime,
} from '../../domain/cronoanalise.js';
import {
  analisarComIa, atualizarEstudo, criarOperacao, obterConfigIa, obterEstudo,
  removerOperacao, salvarChaveIa,
} from '../../lib/api.js';
import { CartaControle, GraficoYamazumi } from './graficos.jsx';
import RelatorioImpressao from './RelatorioImpressao.jsx';

/**
 * PAINEL DE ANALISE — desktop.
 *
 * Usuario: analista sentado, no escritorio, decidindo dimensionamento ou
 * levando o resultado para uma reuniao.
 *
 * Perguntas que a tela precisa responder, nesta ordem:
 *   1. O estudo tem base estatistica para decidir?
 *   2. Onde esta o gargalo?
 *   3. Quantos operadores a linha precisa?
 *   4. Qual operacao esta instavel e por que?
 */
export default function PainelAnalise({ estudoId, aoVoltar, aoColetar }) {
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [opSelecionada, setOpSelecionada] = useState(null);
  const [adicionandoOp, setAdicionandoOp] = useState(false);
  const [editandoEstudo, setEditandoEstudo] = useState(false);
  // Aba na URL: recarregar e compartilhar link preservam a vista.
  const [aba, setAba] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('aba');
    return ['yamazumi', 'operacoes', 'carta'].includes(q) ? q : 'yamazumi';
  });

  const trocarAba = useCallback((id) => {
    setAba(id);
    const url = new URL(window.location.href);
    url.searchParams.set('aba', id);
    // replaceState: aba e' vista do mesmo estudo, nao lugar por onde se passou.
    window.history.replaceState({}, '', url);
  }, []);

  const carregar = useCallback(async () => {
    setEstado('carregando');
    try {
      setDados(await obterEstudo(estudoId));
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }, [estudoId]);

  useEffect(() => { carregar(); }, [carregar]);

  const analise = useMemo(() => {
    if (!dados) return null;
    const tolerancia = Number(dados.estudo.tolerancia_pct);
    const taktMs = dados.estudo.takt_time_ms ? Number(dados.estudo.takt_time_ms) : 0;

    const operacoes = dados.operacoes.map((op) => ({
      ...op,
      resultado: calcularOperacao(
        { ...op, fr: Number(op.fr_pct), ciclosPorPeca: Number(op.ciclos_por_peca) || 1 },
        tolerancia,
      ),
    }));

    const comDados = operacoes.filter((o) => o.resultado);
    // Tudo que se compara com o Takt usa o tempo POR PECA: o Takt e' o ritmo
    // que a demanda exige em pecas, nao em ciclos de maquina.
    const somaTp = comDados.reduce((acc, o) => acc + o.resultado.tpPorPeca, 0);
    const gargalo = comDados.reduce(
      (pior, o) => (!pior || o.resultado.tpPorPeca > pior.resultado.tpPorPeca ? o : pior), null,
    );

    return {
      tolerancia,
      taktMs,
      operacoes,
      comDados,
      somaTp,
      gargalo,
      // Capacidade da linha e' ditada pelo gargalo, nao pela media.
      capacidadeLinha: gargalo ? gargalo.resultado.cap : 0,
      operadores: taktMs > 0 ? operadoresNecessarios(somaTp, taktMs) : null,
      totalCiclos: comDados.reduce((acc, o) => acc + o.resultado.n, 0),
      pendencias: operacoes
        .map((o) => ({ op: o, s: amostraSuficiente(o.resultado, dados.estudo.meta_obs) }))
        .filter((x) => !x.s.ok),
    };
  }, [dados]);

  useEffect(() => {
    if (analise?.comDados.length && !opSelecionada) setOpSelecionada(analise.comDados[0].id);
  }, [analise, opSelecionada]);

  if (estado === 'carregando') return <Estado texto="Carregando estudo..." />;
  if (estado === 'erro') return <Estado texto={`Falha ao carregar: ${erro}`} acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />;

  const { estudo } = dados;
  const opCarta = analise.comDados.find((o) => o.id === opSelecionada) || analise.comDados[0];

  return (
    <div style={est.tela}>
      {/* Versao de impressao: escondida na tela, e' a unica coisa visivel no papel. */}
      <RelatorioImpressao estudo={estudo} analise={analise} />

      <div className="somente-tela" style={est.envoltorio}>
        <Cabecalho
          modo="analise"
          aoVoltar={aoVoltar}
          titulo={estudo.nome}
          subtitulo={[estudo.recurso, estudo.produto, estudo.analista]
            .filter(Boolean).join(' · ') + ` · Tolerância ${analise.tolerancia}%`}
          acoes={(
            <>
              <button type="button" onClick={() => setEditandoEstudo(true)} style={est.botaoSecundario}>
                Ajustes do estudo
              </button>
              <button type="button" onClick={() => window.print()} style={est.botaoImprimir}>
                Imprimir relatório
              </button>
            </>
          )}
        />

        {/* Ressalva importante, mas e' ressalva — nao pode competir com o
            resultado. Uma linha, com o detalhe sob demanda. */}
        {analise.pendencias.length > 0 && (
          <details style={est.avisoAmostra}>
            <summary style={est.avisoResumo}>
              <span style={est.avisoIcone} aria-hidden="true">!</span>
              {analise.pendencias.length} operação(ões) ainda sem amostra suficiente —
              os números orientam, mas não fecham dimensionamento
            </summary>
            <ul style={est.listaPendencias}>
              {analise.pendencias.map(({ op, s: suf }) => (
                <li key={op.id} style={est.itemPendencia}>
                  <strong>{op.nome}</strong> — {suf.motivo}
                  {aoColetar && (
                    <button type="button" style={est.linkColeta} onClick={() => aoColetar(estudo, op)}>
                      cronometrar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {!analise.operacoes.length ? (
          <div style={est.primeiroPasso}>
            <h2 style={est.primeiroPassoTitulo}>Este estudo ainda não tem operações</h2>
            <p style={est.primeiroPassoTexto}>
              Cadastre aqui as operações que serão cronometradas — é trabalho de
              escritório, não de chão de fábrica. Depois, no celular, o analista
              abre a operação no posto e coleta os ciclos.
            </p>
            <button type="button" style={est.botaoImprimir} onClick={() => setAdicionandoOp(true)}>
              + Cadastrar primeira operação
            </button>
          </div>
        ) : (
          <>
        <Resposta analise={analise} />

        <section style={est.contexto} aria-label="Números de apoio">
          {[
            ['Operações', analise.operacoes.length, ''],
            ['Ciclos coletados', analise.totalCiclos, ''],
            ['Σ TP por peça', formatarSegundos(analise.somaTp), ' s'],
            ['Takt Time', analise.taktMs ? formatarSegundos(analise.taktMs) : '—', analise.taktMs ? ' s' : ''],
          ].map(([rot, valor, sufixo]) => (
            <div key={rot} style={est.contextoItem}>
              <span style={est.contextoRotulo}>{rot}</span>
              <span style={est.contextoValor}>{valor}{sufixo}</span>
            </div>
          ))}
        </section>

        {/* A resposta fica ACIMA das abas, nunca dentro de uma.
            Se ela sumisse enquanto o analista olha o Yamazumi, ele perderia
            a conclusao justo ao examinar a evidencia dela. */}
        <Abas
          ativa={aba}
          aoTrocar={trocarAba}
          abas={[
            { id: 'yamazumi', rotulo: 'Yamazumi' },
            { id: 'operacoes', rotulo: 'Operações', contador: analise.operacoes.length },
            { id: 'carta', rotulo: 'Carta de controle' },
          ]}
        />

        {aba === 'yamazumi' && (
          <GraficoYamazumi operacoes={analise.comDados} taktMs={analise.taktMs} />
        )}

        {aba === 'operacoes' && (
          <TabelaOperacoes
            analise={analise}
            metaObs={estudo.meta_obs}
            estudo={estudo}
            aoAdicionar={() => setAdicionandoOp(true)}
            aoColetar={aoColetar}
            aoRemover={async (op) => {
              if (!window.confirm(`Remover a operação "${op.nome}" e todos os seus ciclos?`)) return;
              await removerOperacao(op.id);
              carregar();
            }}
          />
        )}

        {aba === 'carta' && (
          analise.comDados.length > 0 ? (
            <section>
              <div style={est.seletor}>
                <span style={est.seletorRotulo}>Operação:</span>
                {analise.comDados.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setOpSelecionada(o.id)}
                    style={{ ...est.aba, ...(o.id === opCarta?.id ? est.abaAtiva : {}) }}
                  >
                    {o.nome}
                  </button>
                ))}
              </div>
              {opCarta && <CartaControle operacao={opCarta} />}
            </section>
          ) : (
            <p style={est.semDados}>
              Nenhuma operação tem ciclos coletados ainda. A carta de controle
              aparece quando houver pelo menos dois.
            </p>
          )
        )}

        <AnaliseIa estudo={estudo} analise={analise} />
          </>
        )}

        {editandoEstudo && (
          <AjustesDoEstudo
            estudo={estudo}
            aoCancelar={() => setEditandoEstudo(false)}
            aoSalvar={async (dados) => {
              await atualizarEstudo(estudoId, dados);
              setEditandoEstudo(false);
              carregar();
            }}
          />
        )}

        {adicionandoOp && (
          <FormularioOperacao
            aoCancelar={() => setAdicionandoOp(false)}
            aoSalvar={async (dados) => {
              await criarOperacao({ ...dados, estudoId, ordem: analise.operacoes.length });
              setAdicionandoOp(false);
              carregar();
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Ajustes do estudo.
 *
 * Existe porque tolerancia, meta de observacoes e Takt Time sao decisoes que
 * mudam DEPOIS de comecar a coletar: o analista descobre a demanda real, ou
 * revisa a tolerancia ao ver as condicoes do posto. Sem isto, corrigir um
 * desses campos exigiria recriar o estudo e perder os ciclos ja coletados.
 */
function AjustesDoEstudo({ estudo, aoSalvar, aoCancelar }) {
  const [setor, setSetor] = useState(estudo.setor || '');
  const [analista, setAnalista] = useState(estudo.analista || '');
  const [tolerancia, setTolerancia] = useState(Number(estudo.tolerancia_pct) || 15);
  const [metaObs, setMetaObs] = useState(Number(estudo.meta_obs) || 12);
  const [taktSeg, setTaktSeg] = useState(
    estudo.takt_time_ms ? formatarSegundos(Number(estudo.takt_time_ms), 1) : '',
  );
  const [calc, setCalc] = useState({ quantidade: '', horas: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  function aplicarCalculo(novo) {
    setCalc(novo);
    const qtd = Number(novo.quantidade);
    const horas = Number(novo.horas);
    if (qtd > 0 && horas > 0) setTaktSeg(formatarSegundos(taktTime(horas * 3600, qtd), 1));
  }

  async function enviar(ev) {
    ev.preventDefault();
    setSalvando(true);
    setErro(null);
    const ms = taktSeg ? Math.round(Number(taktSeg) * 1000) : null;
    try {
      await aoSalvar({
        setor: setor.trim() || null,
        analista: analista.trim() || null,
        toleranciaPct: Number(tolerancia),
        metaObs: Number(metaObs),
        taktTimeMs: ms && ms > 0 ? ms : null,
      });
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Ajustes do estudo">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, ...tipo('titulo') }}>Ajustes do estudo</h2>
        <p style={est.dica}>
          Estes valores recalculam os indicadores. Os ciclos já coletados não são afetados.
        </p>

        {/* Setor e analista saem impressos na folha de análise — um estudo
            criado sem eles imprimia "—" e não havia onde corrigir. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Setor</span>
            <input style={est.input} value={setor}
                   onChange={(e) => setSetor(e.target.value)} />
            <span style={est.dica}>Ex: Usinagem. Sai no relatório impresso.</span>
          </label>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Analista</span>
            <input style={est.input} value={analista}
                   onChange={(e) => setAnalista(e.target.value)} />
            <span style={est.dica}>Assina a folha de análise.</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Tolerância (%)</span>
            <input type="number" min="0" max="100" style={est.input}
                   value={tolerancia} onChange={(e) => setTolerancia(e.target.value)} />
            <span style={est.dica}>Fadiga e necessidades. Típica: 10 a 15.</span>
          </label>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Meta de ciclos</span>
            <input type="number" min="1" max="999" style={est.input}
                   value={metaObs} onChange={(e) => setMetaObs(e.target.value)} />
            <span style={est.dica}>Recomendado: 12 ou mais.</span>
          </label>
        </div>

        <fieldset style={est.fieldset}>
          <legend style={est.rotuloCampo}>Takt Time</legend>
          <p style={est.dica}>
            Ritmo que a demanda exige. É o que permite dimensionar mão de obra
            e desenhar a linha de referência no Yamazumi.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Quantidade por dia</span>
              <input type="number" min="1" style={est.input} value={calc.quantidade}
                     onChange={(e) => aplicarCalculo({ ...calc, quantidade: e.target.value })} />
            </label>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Horas disponíveis</span>
              <input type="number" min="0.1" step="0.1" style={est.input} value={calc.horas}
                     onChange={(e) => aplicarCalculo({ ...calc, horas: e.target.value })} />
            </label>
          </div>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Takt Time (segundos por peça)</span>
            <input type="number" min="0" step="0.1" style={est.input}
                   value={taktSeg} onChange={(e) => setTaktSeg(e.target.value)} />
            <span style={est.dica}>Preenchido pela conta acima, ou digite direto.</span>
          </label>
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: espaco.md }}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoImprimir, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar ajustes'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Cadastro de operacao — no PC, de proposito.
 *
 * Definir o que sera cronometrado e avaliar o fator de ritmo exige olhar o
 * processo com calma. E' trabalho de escritorio. O celular no posto serve
 * para coletar ciclo, nao para montar estudo.
 */
function FormularioOperacao({ aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [frPct, setFrPct] = useState(100);
  const [ciclosPorPeca, setCiclosPorPeca] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar(ev) {
    ev.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome da operação.'); return; }
    setSalvando(true);
    setErro(null);
    try { await aoSalvar({ nome, descricao, frPct, ciclosPorPeca: Number(ciclosPorPeca) || 1 }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Nova operacao">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nova operação</h2>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Nome da operação *</span>
          <input style={est.input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <span style={est.dica}>Ex: Furar lateral direita</span>
        </label>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Descrição</span>
          <input style={est.input} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <span style={est.dica}>Onde começa e onde termina o ciclo. Evita medir coisas diferentes.</span>
        </label>

        <label style={est.campo}>
          <span style={est.rotuloCampo}>Ciclos por peça</span>
          <input
            type="number" min="1" max="999" style={est.input}
            value={ciclosPorPeca}
            onChange={(e) => setCiclosPorPeca(e.target.value)}
          />
          <span style={est.dica}>
            Quantas vezes esta operação se repete para produzir <strong>uma peça</strong>.
            Uma peça com 3 furações leva 3× o tempo de uma com 1 — sem isso a
            capacidade sai superestimada.
          </span>
        </label>

        <fieldset style={est.fieldset}>
          <legend style={est.rotuloCampo}>Fator de ritmo (FR)</legend>
          <div style={est.grupoFr}>
            {FR_PRESETS.map((preset) => (
              <button
                key={preset.valor}
                type="button"
                onClick={() => setFrPct(preset.valor)}
                style={{ ...est.botaoFr, ...(frPct === preset.valor ? est.botaoFrAtivo : {}) }}
              >
                <strong>{preset.valor}%</strong>
                <span style={{ fontSize: 10 }}>{preset.rotulo}</span>
              </button>
            ))}
          </div>
          <span style={est.dica}>
            Avalie o ritmo do operador com honestidade. FR errado distorce o estudo inteiro:
            ele multiplica direto o tempo observado.
          </span>
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoImprimir, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Adicionar operação'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * O que o analista veio saber.
 *
 * Um estudo de tempos existe para responder duas perguntas: quanto a linha
 * produz por hora, e quantos operadores ela precisa. Tudo o mais — media,
 * CV, carta de controle — e' o caminho ate' essas duas respostas, nao a
 * resposta.
 *
 * A capacidade e' ditada pelo GARGALO, nao pela media das operacoes. Por
 * isso o gargalo aparece nomeado aqui em cima, e nao escondido numa celula.
 */
/**
 * Analise com IA.
 *
 * A chave da API e' salva UMA vez aqui e vive no servidor — o navegador
 * nunca a le de volta (o GET devolve so' os 4 ultimos caracteres). No app
 * antigo a chave morava no localStorage do chao de fabrica e vazou; este
 * fluxo existe para isso nao se repetir.
 */
function AnaliseIa({ estudo, analise }) {
  const [config, setConfig] = useState(null);
  const [chave, setChave] = useState('');
  const [trocando, setTrocando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    obterConfigIa()
      .then((c) => setConfig(c || { configurada: false }))
      .catch(() => setConfig({ configurada: false }));
  }, []);

  const configurada = Boolean(config?.configurada);
  const mostrarForm = config && (!configurada || trocando);
  const temDados = analise.comDados.length > 0;

  async function salvar(ev) {
    ev.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      setConfig(await salvarChaveIa(chave.trim()));
      setChave('');
      setTrocando(false);
    } catch (e) { setErro(e.message); }
    setSalvando(false);
  }

  async function analisar() {
    setRodando(true);
    setErro(null);
    try {
      setResposta(await analisarComIa({
        estudo: estudo.nome,
        produto: estudo.produto,
        recurso: estudo.recurso,
        toleranciaPct: Number(estudo.tolerancia_pct) || 0,
        taktTimeSeg: analise.taktMs ? analise.taktMs / 1000 : null,
        operacoes: analise.comDados.map((op) => {
          const r = op.resultado;
          return {
            nome: op.nome,
            n: r.n,
            toSeg: +(r.toMed / 1000).toFixed(2),
            tnSeg: +(r.tnMed / 1000).toFixed(2),
            tpSeg: +(r.tpPorPeca / 1000).toFixed(2),
            cvPct: +r.cvPct.toFixed(1),
            cap: r.cap,
            frPct: Number(op.fr_pct) || 100,
            paradasSeg: Math.round((r.totalParada || 0) / 1000),
          };
        }),
      }));
    } catch (e) { setErro(e.message); }
    setRodando(false);
  }

  return (
    <section style={est.ia} aria-label="Análise com IA">
      <div style={est.iaTopo}>
        <div style={{ minWidth: 0 }}>
          <h2 style={est.iaTitulo}>Análise com IA</h2>
          <p style={est.iaTexto}>
            Diagnóstico, gargalo e ações recomendadas a partir dos números deste estudo.
          </p>
        </div>
        {configurada && !trocando && (
          <div style={est.iaAcoes}>
            {config.resumo && <span style={est.iaChave}>chave {config.resumo}</span>}
            {config.origem === 'banco' && (
              <button type="button" style={est.iaBotaoTexto} onClick={() => setTrocando(true)}>
                Trocar chave
              </button>
            )}
            <button
              type="button"
              style={est.iaBotao}
              onClick={analisar}
              disabled={rodando || !temDados}
              title={temDados ? undefined : 'Colete ciclos antes de analisar'}
            >
              {rodando ? 'Analisando...' : 'Analisar com IA'}
            </button>
          </div>
        )}
      </div>

      {mostrarForm && (
        <form style={est.iaForm} onSubmit={salvar}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Chave da API Anthropic</span>
            <input
              type="password"
              placeholder="sk-ant-..."
              style={est.input}
              value={chave}
              onChange={(ev) => setChave(ev.target.value)}
              autoComplete="off"
            />
            <span style={est.dica}>
              Gere em console.anthropic.com. A chave fica guardada no servidor — não
              neste computador — e não aparece de volta depois de salva.
            </span>
          </label>
          <div style={est.iaFormAcoes}>
            {trocando && (
              <button type="button" style={est.iaBotaoTexto} onClick={() => { setTrocando(false); setChave(''); }}>
                Cancelar
              </button>
            )}
            <button type="submit" style={est.iaBotao} disabled={salvando || !chave.trim()}>
              {salvando ? 'Salvando...' : 'Salvar chave'}
            </button>
          </div>
        </form>
      )}

      {erro && <div style={est.iaErro}>{erro}</div>}

      {resposta && (
        <div style={est.iaResposta}>
          <div style={est.iaRespostaTexto}>{resposta.analise}</div>
          <div style={est.iaMeta}>
            Gerada por {resposta.modelo}
            {resposta.uso?.saida ? ` · ${resposta.uso.saida} tokens` : ''} — confira antes de decidir:
            a IA lê os números, não o posto.
          </div>
        </div>
      )}
    </section>
  );
}

function Resposta({ analise }) {
  const { capacidadeLinha, gargalo, operadores, taktMs } = analise;
  const semDados = !gargalo;

  if (semDados) {
    return (
      <section style={est.resposta}>
        <p style={est.respostaVazia}>
          Ainda não há ciclos suficientes para calcular capacidade.
          Cronometre as operações para obter o resultado.
        </p>
      </section>
    );
  }

  const ocupacao = taktMs > 0 ? (gargalo.resultado.tpPorPeca / taktMs) * 100 : null;

  return (
    <section style={est.resposta} aria-label="Resultado do estudo">
      <div style={est.respostaBloco}>
        <span style={est.respostaRotulo}>Capacidade da linha</span>
        <div style={est.respostaNumeroLinha}>
          <span style={est.respostaNumero}>{capacidadeLinha}</span>
          <span style={est.respostaUnidade}>peças/hora</span>
        </div>
        <p style={est.respostaExplica}>
          Limitada por <strong>{gargalo.nome}</strong>, com{' '}
          {formatarSegundos(gargalo.resultado.tpPorPeca)} s por peça
          {gargalo.resultado.ciclosPorPeca > 1 && (
            <> ({formatarSegundos(gargalo.resultado.tpVal)} s × {gargalo.resultado.ciclosPorPeca} ciclos)</>
          )}.
          {ocupacao !== null && ocupacao > 100 && (
            <> Esta operação está <strong>{(ocupacao - 100).toFixed(0)}% acima do Takt</strong>.</>
          )}
        </p>
      </div>

      <div style={est.respostaDivisor} />

      <div style={est.respostaBloco}>
        <span style={est.respostaRotulo}>Operadores necessários</span>
        {operadores !== null ? (
          <>
            <div style={est.respostaNumeroLinha}>
              <span style={est.respostaNumero}>{Math.ceil(operadores)}</span>
              <span style={est.respostaUnidade}>operadores</span>
            </div>
            <p style={est.respostaExplica}>
              Cálculo exato: {operadores.toFixed(2)}. Arredondar para cima —
              meio operador não existe no chão de fábrica.
            </p>
          </>
        ) : (
          <p style={est.respostaExplica}>
            Informe o <strong>Takt Time</strong> em <em>Ajustes do estudo</em> para
            dimensionar a mão de obra e ver a linha de referência no Yamazumi.
          </p>
        )}
      </div>
    </section>
  );
}

function TabelaOperacoes({ analise, metaObs, aoAdicionar, aoRemover, aoColetar, estudo }) {
  return (
    <section style={est.blocoTabela}>
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Operações</h2>
        {aoAdicionar && (
          <button type="button" style={est.botaoSecundario} onClick={aoAdicionar}>
            + Adicionar operação
          </button>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={est.tabela}>
          <thead>
            <tr>
              <th style={est.th}>Operação</th>
              <th style={est.thNum}>Ciclos</th>
              <th style={est.thNum}>FR</th>
              <th style={est.thNum}>TO (s)</th>
              <th style={est.thNum}>TN (s)</th>
              <th style={est.thNum} title="Quantas vezes a operação roda por peça">Cic/pç</th>
              <th style={est.thNum}>TP ciclo (s)</th>
              <th style={est.thNum}>TP peça (s)</th>
              <th style={est.thNum}>CV%</th>
              <th style={est.thNum}>Cap/h</th>
              <th style={est.th}>Estabilidade</th>
              <th style={est.th} aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {analise.operacoes.map((op) => {
              const r = op.resultado;
              const ehGargalo = analise.gargalo?.id === op.id;
              return (
                <tr key={op.id} style={ehGargalo ? est.linhaGargalo : undefined}>
                  <td style={est.td}>
                    {op.nome}
                    {ehGargalo && <span style={est.selo}>GARGALO</span>}
                  </td>
                  <td style={est.tdNum}>
                    {r ? r.n : 0}
                    <span style={est.meta}>/{metaObs}</span>
                  </td>
                  <td style={est.tdNum}>{Number(op.fr_pct)}%</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.toMed) : '—'}</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.tnMed) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.ciclosPorPeca : Number(op.ciclos_por_peca) || 1}</td>
                  <td style={est.tdNum}>{r ? formatarSegundos(r.tpVal) : '—'}</td>
                  <td style={{ ...est.tdNum, fontWeight: 700 }}>{r ? formatarSegundos(r.tpPorPeca) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.cvPct.toFixed(1) : '—'}</td>
                  <td style={est.tdNum}>{r ? r.cap : '—'}</td>
                  <td style={est.td}>
                    {r ? (
                      <span style={est.estabilidade}>
                        <span style={{ ...est.ponto, background: corNivel(r.estabilidade.nivel) }} />
                        {r.estabilidade.rotulo}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ ...est.td, whiteSpace: 'nowrap' }}>
                    {/* Cronometrar e a acao frequente; Remover e destrutiva.
                        Com o mesmo peso visual, o clique errado fica barato
                        demais — por isso o Remover e' so' um icone discreto,
                        com rotulo acessivel e confirmacao. */}
                    {aoColetar && (
                      <button type="button" style={est.botaoAcaoLinha}
                              onClick={() => aoColetar(estudo, op)}>
                        Cronometrar
                      </button>
                    )}
                    {aoRemover && (
                      <button type="button" style={est.botaoRemoverOp}
                              onClick={() => aoRemover(op)}
                              title={`Remover ${op.nome}`}
                              aria-label={`Remover operação ${op.nome}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Estado({ texto, acao }) {
  return (
    <div style={est.estadoVazio}>
      <p>{texto}</p>
      {acao && <button type="button" style={est.botaoImprimir} onClick={acao.aoClicar}>{acao.rotulo}</button>}
    </div>
  );
}

const corNivel = (n) => ({ estavel: claro.ok, atencao: claro.atencao, critico: claro.critico }[n] || claro.neutro);



const est = {
  tela: { minHeight: '100vh', background: claro.fundo, color: claro.texto, fontFamily: fonteAnalise.familia },
  envoltorio: { paddingBottom: espaco.gigante },
  conteudo: { maxWidth: 1400, margin: '0 auto', padding: `${espaco.xl}px` },

  botaoImprimir: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: claro.vermelho, border: 'none',
    borderRadius: raio.md, color: '#fff', ...tipo('corpoF'),
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },
  botaoSecundario: {
    minHeight: 36, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  /* --- ressalva de amostra: uma linha, detalhe sob demanda --- */
  avisoAmostra: {
    maxWidth: 1400, margin: `0 auto ${espaco.lg}px`, padding: `${espaco.md}px ${espaco.lg}px`,
    ...tipo('corpo'), background: claro.atencaoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.atencao,
    borderRadius: raio.md, color: claro.texto,
  },
  avisoResumo: {
    display: 'flex', alignItems: 'center', gap: espaco.sm, cursor: 'pointer',
    listStyle: 'none', fontWeight: 600,
  },
  avisoIcone: {
    width: 20, height: 20, flexShrink: 0, borderRadius: '50%',
    background: claro.atencao, color: '#fff', fontSize: 13, fontWeight: 700,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  listaPendencias: { margin: `${espaco.sm}px 0 0`, paddingLeft: espaco.xxl },
  itemPendencia: { marginTop: espaco.xs },
  linkColeta: {
    marginLeft: espaco.sm, padding: '2px 8px', background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.bordaForte, borderRadius: raio.sm,
    ...tipo('micro'), textTransform: 'none', cursor: 'pointer',
    fontFamily: 'inherit', color: claro.textoMedio,
  },

  /* --- a resposta --- */
  resposta: {
    maxWidth: 1400, margin: `0 auto ${espaco.lg}px`, padding: espaco.xl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.media,
    borderLeft: `4px solid ${claro.vermelho}`,
    display: 'flex', gap: espaco.xxl, flexWrap: 'wrap',
  },
  respostaBloco: { flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: espaco.xs },
  respostaDivisor: { width: 1, alignSelf: 'stretch', background: claro.borda },
  respostaRotulo: rotulo(claro.textoFraco),
  respostaNumeroLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.sm },
  respostaNumero: { ...tipo('display'), ...numeros, fontFamily: fonteAnalise.numero },
  respostaUnidade: { ...tipo('corpo'), color: claro.textoMedio },
  respostaExplica: { ...tipo('corpo'), margin: `${espaco.xs}px 0 0`, color: claro.textoMedio },
  respostaVazia: { ...tipo('corpo'), margin: 0, color: claro.textoFraco },

  /* --- numeros de apoio --- */
  contexto: {
    maxWidth: 1400, margin: `0 auto ${espaco.xl}px`, padding: `${espaco.md}px ${espaco.xl}px`,
    display: 'flex', gap: espaco.xxl, flexWrap: 'wrap',
    borderTop: `1px solid ${claro.borda}`, borderBottom: `1px solid ${claro.borda}`,
  },
  contextoItem: { display: 'flex', alignItems: 'baseline', gap: espaco.sm },
  contextoRotulo: { ...tipo('legenda'), color: claro.textoFraco },
  contextoValor: { ...tipo('corpoF'), ...numeros, fontFamily: fonteAnalise.numero },

  /* --- primeiro passo --- */
  primeiroPasso: {
    maxWidth: 640, margin: `${espaco.xxl}px auto`, padding: espaco.xxl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    border: `1px solid ${claro.borda}`,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: espaco.md,
  },
  primeiroPassoTitulo: { ...tipo('titulo'), margin: 0 },
  primeiroPassoTexto: { ...tipo('corpo'), margin: 0, color: claro.textoMedio },

  /* --- tabela de operacoes --- */
  blocoTabela: {
    maxWidth: 1400, margin: `${espaco.xl}px auto`, background: claro.papel,
    borderRadius: raio.lg, boxShadow: elevacao.baixa, border: `1px solid ${claro.borda}`,
    overflow: 'hidden',
  },
  cabecalhoSecao: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.md, padding: `${espaco.lg}px ${espaco.xl}px`,
    borderBottom: `1px solid ${claro.borda}`,
  },
  tituloSecao: { ...tipo('destaque'), margin: 0 },
  tabela: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`, ...rotulo(claro.textoFraco),
    background: '#F8F9FB', borderBottom: `1px solid ${claro.borda}`, whiteSpace: 'nowrap',
  },
  thNum: {
    textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`, ...rotulo(claro.textoFraco),
    background: '#F8F9FB', borderBottom: `1px solid ${claro.borda}`, whiteSpace: 'nowrap',
  },
  td: { padding: `${espaco.lg}px`, ...tipo('corpo'), color: claro.textoMedio, borderBottom: `1px solid ${claro.borda}` },
  tdNum: {
    padding: `${espaco.lg}px`, textAlign: 'right', ...tipo('corpo'), ...numeros,
    fontFamily: fonteAnalise.numero, color: claro.texto, borderBottom: `1px solid ${claro.borda}`,
  },
  linhaGargalo: { background: 'rgba(194, 65, 12, 0.05)' },
  selo: {
    marginLeft: espaco.sm, padding: '2px 7px', background: claro.critico, color: '#fff',
    borderRadius: raio.sm, ...tipo('micro'), fontSize: 10,
  },
  meta: { color: claro.textoFraco, ...tipo('legenda') },
  estabilidade: { display: 'inline-flex', alignItems: 'center', gap: espaco.sm, ...tipo('corpo') },
  ponto: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  botaoAcaoLinha: {
    minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.sm,
    color: claro.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoRemoverOp: {
    width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
    borderRadius: raio.sm, color: claro.textoFraco, fontSize: 18, lineHeight: 1,
    cursor: 'pointer', fontFamily: 'inherit',
  },

  /* --- seletor da carta --- */
  seletor: {
    maxWidth: 1400, margin: `${espaco.xl}px auto ${espaco.md}px`,
    display: 'flex', gap: espaco.sm, alignItems: 'center', flexWrap: 'wrap',
  },
  seletorRotulo: rotulo(claro.textoFraco),
  aba: {
    minHeight: 34, padding: `0 ${espaco.md}px`, background: claro.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    ...tipo('legenda'), cursor: 'pointer', fontFamily: 'inherit', color: claro.textoMedio,
    transition: `border-color ${transicao.rapida}, color ${transicao.rapida}`,
  },
  abaAtiva: { borderColor: claro.vermelho, color: claro.texto, fontWeight: 700 },

  /* --- modal de operacao --- */
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: espaco.lg, overflowY: 'auto',
  },
  formulario: {
    width: '100%', maxWidth: 540, background: claro.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  /* ---- analise com IA ---- */
  ia: {
    marginTop: espaco.xxl, padding: espaco.xl,
    background: claro.papel, borderRadius: raio.lg, boxShadow: elevacao.baixa,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  iaTopo: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
  },
  iaTitulo: { ...tipo('destaque'), margin: 0 },
  iaTexto: { ...tipo('legenda'), color: claro.textoFraco, margin: '2px 0 0' },
  iaAcoes: { display: 'flex', alignItems: 'center', gap: espaco.md, flexWrap: 'wrap' },
  iaChave: { ...tipo('legenda'), ...numeros, color: claro.textoFraco },
  iaBotao: {
    minHeight: 40, padding: `0 ${espaco.xl}px`,
    background: claro.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  iaBotaoTexto: {
    minHeight: 40, padding: `0 ${espaco.md}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  iaForm: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: '#F8F9FB',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    maxWidth: 560,
  },
  iaFormAcoes: { display: 'flex', justifyContent: 'flex-end', gap: espaco.md },
  iaErro: {
    padding: espaco.md, background: claro.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: claro.texto,
  },
  iaResposta: {
    padding: espaco.lg, background: '#F8F9FB',
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  iaRespostaTexto: { ...tipo('corpo'), whiteSpace: 'pre-wrap', lineHeight: 1.55 },
  iaMeta: { ...tipo('micro'), color: claro.textoFraco },

  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  fieldset: { border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: espaco.sm },
  rotuloCampo: rotulo(claro.textoFraco),
  dica: { ...tipo('legenda'), color: claro.textoFraco, fontStyle: 'italic' },
  input: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: claro.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.sm,
    color: claro.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  grupoFr: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: espaco.sm },
  botaoFr: {
    minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: claro.fundo, borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
    borderRadius: raio.sm, color: claro.textoMedio, cursor: 'pointer', fontFamily: 'inherit',
    ...tipo('legenda'),
    transition: `border-color ${transicao.rapida}, background ${transicao.rapida}`,
  },
  botaoFrAtivo: { borderColor: claro.vermelho, color: claro.texto, background: 'rgba(219, 33, 38, 0.07)' },
  erroForm: {
    padding: espaco.md, background: claro.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.critico,
    borderRadius: raio.sm, ...tipo('legenda'),
  },
  semDados: {
    maxWidth: 1400, margin: `${espaco.xxl}px auto`, padding: espaco.xxl,
    textAlign: 'center', ...tipo('corpo'), color: claro.textoFraco,
    background: claro.papel, border: `1px dashed ${claro.borda}`, borderRadius: raio.lg,
  },
  estadoVazio: {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: espaco.lg,
    background: claro.fundo, color: claro.textoMedio, fontFamily: fonteAnalise.familia,
  },
};
