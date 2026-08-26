import { useCallback, useEffect, useMemo, useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import MenuLateral from '../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import { VERSAO } from '../../versao.js';
import {
  amostraSuficiente, calcularOperacao, comparativoCapacidade, dimensionarOperadores,
  formatarDuracao, formatarSegundos, FR_PRESETS, resumirParadasDoEstudo,
  operadoresNecessarios, taktTime,
} from '../../domain/cronoanalise.js';
import { PRIORIDADES, contarPorPrioridade, sugerirMelhorias } from '../../domain/sugestoes.js';
import {
  analisarComIa, atualizarEstudo, criarOperacao, listarUsuarios, obterConfigIa, obterEstudo,
  removerChaveIa, removerOperacao, salvarChaveIa,
} from '../../lib/api.js';
import { GraficoYamazumi } from './graficos.jsx';
import RelatorioImpressao from './RelatorioImpressao.jsx';
import ResumoExecutivo from './ResumoExecutivo.jsx';

/**
 * PAINEL DE ANALISE — desktop.
 *
 * Usuario: analista sentado, no escritorio, decidindo dimensionamento ou
 * levando o resultado para uma reuniao.
 *
 * Perguntas que a tela precisa responder, nesta ordem:
 *   1. O estudo tem base estatistica para decidir?
 *   2. Onde esta o gargalo?
 *   3. Quantos operadores a linha precisa — e como isso se compara com o
 *      time que existe hoje?
 *   4. Qual operacao esta instavel e por que?
 *   5. O que fazer com isso (sugestoes com acao, priorizadas).
 */
export default function PainelAnalise({ estudoId, aoVoltar, aoColetar }) {
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [adicionandoOp, setAdicionandoOp] = useState(false);

  /**
   * Dois documentos, um botao cada.
   *
   * A Folha de Analise e' o tecnico (quatro paginas, formulas, assinatura);
   * o Resumo Executivo e' o de reuniao (uma pagina: entrega, gargalo, o que
   * tratar primeiro). Qual deles vai ao papel e' escolha no momento de
   * imprimir — o outro nem e' renderizado, para nao sair junto.
   *
   * O print() nao acontece no clique: espera o efeito, depois do commit, ou
   * o navegador imprimiria o documento anterior.
   */
  const [documento, setDocumento] = useState('folha');
  const [imprimindo, setImprimindo] = useState(false);
  const [verVersoes, setVerVersoes] = useState(false);
  // Cadastro de analistas, para a edicao do estudo poder LIGAR um estudo
  // antigo — que e' como as tres grafias de uma pessoa so' se resolvem.
  const [analistas, setAnalistas] = useState([]);
  useEffect(() => {
    listarUsuarios().then((l) => setAnalistas(l.filter((u) => u.ativo))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!imprimindo) return;
    window.print();
    setImprimindo(false);
  }, [imprimindo]);

  const imprimir = useCallback((qual) => {
    setDocumento(qual);
    setImprimindo(true);
  }, []);
  // ?editar=1 abre a edicao direto: e' como a lista manda o analista
  // consertar um nome errado sem precisar descobrir onde fica o botao.
  const [editandoEstudo, setEditandoEstudo] = useState(
    () => new URLSearchParams(window.location.search).get('editar') === '1',
  );
  // Aba na URL: recarregar e compartilhar link preservam a vista.
  const [aba, setAba] = useState(() => {
    const q = new URLSearchParams(window.location.search).get('aba');
    return ['yamazumi', 'operacoes', 'operadores', 'paradas', 'sugestoes'].includes(q) ? q : 'yamazumi';
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
      // Paradas registradas na coleta (botao Parada, com motivo). Ja' eram
      // descontadas do ciclo para nao inflar o TO; faltava mostra-las.
      paradas: resumirParadasDoEstudo(dados.operacoes),
      pendencias: operacoes
        .map((o) => ({ op: o, s: amostraSuficiente(o.resultado, dados.estudo.meta_obs) }))
        .filter((x) => !x.s.ok),
    };
  }, [dados]);

  /**
   * Sugestoes e comparativos saem de um segundo passo porque dependem do
   * primeiro inteiro — gargalo, Takt e paradas ja' resolvidos.
   */
  const leitura = useMemo(() => {
    if (!analise) return null;
    return {
      capacidade: comparativoCapacidade({
        taktMs: analise.taktMs, capacidadeLinha: analise.capacidadeLinha,
      }),
      sugestoes: sugerirMelhorias({
        operacoes: analise.operacoes,
        taktMs: analise.taktMs,
        gargalo: analise.gargalo,
        paradas: analise.paradas,
      }),
    };
  }, [analise]);

  if (estado === 'carregando') return <Estado texto="Carregando estudo..." />;
  if (estado === 'erro') return <Estado texto={`Falha ao carregar: ${erro}`} acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />;

  const { estudo } = dados;

  return (
    <div style={est.tela}>
      {/* Versao de impressao: escondida na tela, e' a unica coisa visivel no papel. */}
      {documento === 'resumo'
        ? <ResumoExecutivo estudo={estudo} analise={analise} leitura={leitura} />
        : <RelatorioImpressao estudo={estudo} analise={analise} leitura={leitura} />}

      <div className="somente-tela" style={est.telaComLateral}>
        {/* A MESMA navegacao da primeira tela: lateral fixa, com o estudo
            aberto no lugar onde a lista mostra os produtos. As secoes da
            analise eram abas horizontais no topo, logo abaixo de uma barra
            que ja' trazia voltar, titulo e tres botoes — duas faixas de
            navegacao empilhadas, nenhuma delas igual a tela anterior. */}
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Estudos"
          contexto={{
            rotulo: 'Estudo aberto',
            titulo: estudo.nome,
            subtitulo: [estudo.recurso, estudo.produto, estudo.analista_nome || estudo.analista]
              .filter(Boolean).join(' · ') + ` · Tolerância ${analise.tolerancia}%`,
          }}
          acaoPrimaria={{ rotulo: 'Imprimir relatório', aoClicar: () => imprimir('folha') }}
          secoes={analise.operacoes.length ? [
            { id: 'yamazumi', rotulo: 'Yamazumi' },
            { id: 'operacoes', rotulo: 'Operações', contador: analise.operacoes.length },
            { id: 'operadores', rotulo: 'Operadores' },
            { id: 'paradas', rotulo: 'Paradas', contador: analise.paradas.n },
            { id: 'sugestoes', rotulo: 'Sugestões', contador: leitura.sugestoes.length },
          ] : []}
          secaoAtiva={aba}
          aoTrocarSecao={trocarAba}
          acoes={[
            { rotulo: 'Editar estudo', aoClicar: () => setEditandoEstudo(true) },
            { rotulo: 'Resumo executivo', aoClicar: () => imprimir('resumo') },
          ]}
        />

        <main style={est.conteudoLateral}>
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
              ['Tempo parado', analise.paradas.totalMs ? formatarDuracao(analise.paradas.totalMs) : '—', ''],
            ].map(([rot, valor, sufixo]) => (
              <div key={rot} style={est.contextoItem}>
                <span style={est.contextoRotulo}>{rot}</span>
                <span style={est.contextoValor}>{valor}{sufixo}</span>
              </div>
            ))}
          </section>

          {/* A resposta fica ACIMA da secao escolhida, nunca dentro dela.
              Se ela sumisse enquanto o analista olha o Yamazumi, ele perderia
              a conclusao justo ao examinar a evidencia dela. Cada secao ja'
              se apresenta com o proprio titulo — nao ha' cabecalho aqui. */}

          {aba === 'yamazumi' && (
            <>
              <GraficoYamazumi operacoes={analise.comDados} taktMs={analise.taktMs} />
              <CapacidadeEsperadoReal
                capacidade={leitura.capacidade}
                gargalo={analise.gargalo}
                aoDefinirTakt={() => setEditandoEstudo(true)}
              />
            </>
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

          {aba === 'operadores' && (
            <PainelOperadores estudoId={estudoId} analise={analise} aoDefinirTakt={() => setEditandoEstudo(true)} />
          )}

          {aba === 'paradas' && <PainelParadas resumo={analise.paradas} />}

          {aba === 'sugestoes' && <PainelSugestoes sugestoes={leitura.sugestoes} />}

          <AnaliseIa estudo={estudo} analise={analise} />
            </>
          )}
        </main>

        {verVersoes && (
          <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />
        )}

        {editandoEstudo && (
          <AjustesDoEstudo
            estudo={estudo}
            analistas={analistas}
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
function AjustesDoEstudo({ estudo, analistas = [], aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState(estudo.nome || '');
  const [produto, setProduto] = useState(estudo.produto || '');
  const [recurso, setRecurso] = useState(estudo.recurso || '');
  const [setor, setSetor] = useState(estudo.setor || '');
  const [analista, setAnalista] = useState(estudo.analista || '');
  const [analistaId, setAnalistaId] = useState(estudo.analista_id || '');
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
    if (!nome.trim()) { setErro('O estudo precisa de um nome.'); setSalvando(false); return; }
    try {
      await aoSalvar({
        nome: nome.trim(),
        produto: produto.trim() || null,
        recurso: recurso.trim() || null,
        setor: setor.trim() || null,
        analista: analista.trim() || null,
        analistaId: analistaId || null,
        toleranciaPct: Number(tolerancia),
        metaObs: Number(metaObs),
        taktTimeMs: ms && ms > 0 ? ms : null,
      });
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Ajustes do estudo">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, ...tipo('titulo') }}>Editar estudo</h2>
        <p style={est.dica}>
          Corrija a identificação ou os parâmetros. Os ciclos já coletados não são
          afetados — nome digitado errado se conserta aqui, sem refazer nada.
        </p>

        {/* Nome, produto e recurso: um erro de digitação na criação ficava
            para sempre no relatório impresso, e recriar o estudo custaria
            os ciclos já cronometrados. */}
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Nome do estudo</span>
          <input style={est.input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Produto / Referência</span>
            <input style={est.input} value={produto} onChange={(e) => setProduto(e.target.value)} />
            <span style={est.dica}>Agrupa os estudos na lista.</span>
          </label>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Recurso / Posto</span>
            <input style={est.input} value={recurso} onChange={(e) => setRecurso(e.target.value)} />
            <span style={est.dica}>Ex: Furadeira 03. Sai no relatório impresso.</span>
          </label>
        </div>

        {/* Setor e analista saem impressos na folha de análise — um estudo
            criado sem eles imprimia "—" e não havia onde corrigir. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg }}>
          <label style={est.campo}>
            <span style={est.rotuloCampo}>Setor</span>
            <input style={est.input} value={setor}
                   onChange={(e) => setSetor(e.target.value)} />
            <span style={est.dica}>Ex: Usinagem. Sai no relatório impresso.</span>
          </label>
          {/* Com cadastro, aqui e' onde um estudo ANTIGO se liga ao
              analista de verdade — e' o caminho para desfazer as tres
              grafias de uma pessoa so'. O nome digitado continua a mostra
              embaixo enquanto o vinculo nao existir: sem ele nao daria para
              saber a quem o estudo se refere. */}
          {analistas.length > 0 ? (
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Analista</span>
              <select style={est.input} value={analistaId}
                      onChange={(e) => setAnalistaId(e.target.value)}>
                <option value="">
                  {analista ? `Sem vínculo — digitado: ${analista}` : 'Escolha o analista'}
                </option>
                {analistas.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
              <span style={est.dica}>
                {analistaId
                  ? 'Assina a folha de análise.'
                  : 'Escolher aqui liga este estudo ao cadastro — é o que junta as grafias diferentes da mesma pessoa.'}
              </span>
            </label>
          ) : (
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Analista</span>
              <input style={est.input} value={analista}
                     onChange={(e) => setAnalista(e.target.value)} />
              <span style={est.dica}>Assina a folha de análise.</span>
            </label>
          )}
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
  const [removendo, setRemovendo] = useState(false);
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

  /**
   * Remover a chave. Diferente de trocar: sem chave a analise por IA para
   * de funcionar, entao a confirmacao diz isso antes — e o botao so'
   * aparece para a chave salva no app. A do ambiente e' do administrador.
   */
  async function remover() {
    setSalvando(true);
    setErro(null);
    try {
      setConfig(await removerChaveIa());
      setRemovendo(false);
      setTrocando(false);
      setChave('');
      setResposta(null);
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
        // Paradas por motivo: sem elas a IA so' ve o tempo do ciclo e nao
        // tem como apontar a perda que esta' fora dele.
        paradas: analise.paradas.porMotivo.map((m) => ({
          motivo: m.rotulo,
          minutos: +(m.ms / 60000).toFixed(1),
          ocorrencias: m.n,
        })),
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
              <>
                <button type="button" style={est.iaBotaoTexto} onClick={() => setTrocando(true)}>
                  Trocar chave
                </button>
                <button type="button" style={est.iaBotaoTexto} onClick={() => setRemovendo(true)}>
                  Remover
                </button>
              </>
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

      {removendo && (
        <div style={est.iaConfirmar} role="alert">
          <span>
            Remover apaga a chave do servidor. A análise por IA para de funcionar
            até você salvar outra — nenhum estudo é afetado.
          </span>
          <div style={est.iaConfirmarAcoes}>
            <button type="button" style={est.iaBotaoTexto} onClick={() => setRemovendo(false)}>
              Cancelar
            </button>
            <button type="button" style={est.botaoPerigo} onClick={remover} disabled={salvando}>
              {salvando ? 'Removendo...' : 'Remover chave'}
            </button>
          </div>
        </div>
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

/**
 * CAPACIDADE — o que o Takt exige contra o que o gargalo entrega.
 *
 * O painel ja' dizia quanto a linha produz. Faltava a outra metade da
 * pergunta: se isso basta. Sem os dois lado a lado, "222 pc/h" e' um numero
 * sem veredito — e a conta de cabeca ("quanto mesmo a demanda pede?")
 * acontecia fora da tela, que e' onde ela erra.
 */
function CapacidadeEsperadoReal({ capacidade, gargalo, aoDefinirTakt }) {
  const { esperado, real, atingimentoPct, diferenca } = capacidade;
  const atinge = atingimentoPct !== null && atingimentoPct >= 100;

  return (
    <section style={est.blocoTabela} aria-label="Capacidade esperada e real">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Capacidade — esperado × real</h2>
        {esperado === null && (
          <button type="button" style={est.botaoSecundario} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        )}
      </div>

      <div style={est.gradeKpi}>
        <Kpi
          rotuloKpi="Esperado (Takt)"
          valor={esperado !== null ? String(esperado) : '—'}
          unidade={esperado !== null ? 'pç/h' : ''}
          nota={esperado !== null ? 'o que a demanda exige' : 'defina o Takt Time para comparar'}
          cor={esperado === null ? claro.atencao : claro.borda}
        />
        <Kpi
          rotuloKpi="Real (gargalo)"
          valor={String(real)}
          unidade="pç/h"
          nota={gargalo ? `limitada por ${gargalo.nome}` : 'sem ciclos coletados'}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Atingimento"
          valor={atingimentoPct !== null ? `${atingimentoPct.toFixed(0)}%` : '—'}
          nota={atingimentoPct !== null ? (atinge ? 'a linha entrega o ritmo' : 'abaixo do ritmo exigido') : '—'}
          cor={atingimentoPct === null ? claro.borda : (atinge ? claro.ok : claro.critico)}
        />
        <Kpi
          rotuloKpi={diferenca !== null && diferenca < 0 ? 'Déficit' : 'Superávit'}
          valor={diferenca !== null ? `${diferenca > 0 ? '+' : ''}${diferenca}` : '—'}
          unidade={diferenca !== null ? 'pç/h' : ''}
          nota={diferenca === null ? '—' : (diferenca < 0 ? 'faltam por hora para fechar o Takt' : 'sobram por hora sobre o Takt')}
          cor={diferenca === null ? claro.borda : (diferenca < 0 ? claro.critico : claro.ok)}
        />
      </div>
    </section>
  );
}

/**
 * Cartao de numero com barra de acento.
 *
 * A cor da barra NUNCA vai sozinha: cada cartao tem rotulo em cima e uma
 * nota em palavras embaixo dizendo o que aquele numero significa.
 */
function Kpi({ rotuloKpi, valor, unidade, nota, cor }) {
  return (
    <div style={{ ...est.cartaoKpi, borderLeftColor: cor }}>
      <span style={est.kpiRotulo}>{rotuloKpi}</span>
      <div style={est.kpiLinha}>
        <span style={est.kpiValor}>{valor}</span>
        {unidade && <span style={est.kpiUnidade}>{unidade}</span>}
      </div>
      <span style={est.kpiNota}>{nota}</span>
    </div>
  );
}

/**
 * QUANTOS OPERADORES — necessario x atual.
 *
 * A formula fica escrita na tela de proposito. Este e' o numero que vai a'
 * reuniao pedir ou devolver gente, e quem defende precisa mostrar a conta,
 * nao so' o resultado.
 *
 * O "quantos voce tem hoje" e' um E-SE do analista, nao um cadastro: fica
 * neste navegador (localStorage), por estudo, e nao sobe para o banco.
 */
function PainelOperadores({ estudoId, analise, aoDefinirTakt }) {
  const chave = `ritmopatrimar.operadores.${estudoId}`;
  const [atuais, setAtuais] = useState(() => {
    try { return localStorage.getItem(chave) || ''; } catch { return ''; }
  });

  useEffect(() => {
    try {
      if (atuais) localStorage.setItem(chave, atuais);
      else localStorage.removeItem(chave);
    } catch { /* navegador sem storage: o e-se vale so' nesta sessao */ }
  }, [chave, atuais]);

  const dim = dimensionarOperadores({
    somaTpMs: analise.somaTp, taktMs: analise.taktMs, operadoresAtuais: atuais,
  });

  if (!dim) {
    return (
      <section style={est.blocoTabela} aria-label="Dimensionamento de operadores">
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Quantos operadores preciso?</h2>
          <button type="button" style={est.botaoImprimir} onClick={aoDefinirTakt}>
            Definir Takt Time
          </button>
        </div>
        <p style={est.vazioParadas}>
          O dimensionamento é <strong>Σ TP ÷ Takt Time</strong>: sem o Takt não há
          ritmo exigido com que comparar o tempo padrão, e o número de operadores
          não existe. O Takt sai da demanda do período — quantas peças, em quantas
          horas — e se configura em <strong>Editar estudo</strong>.
        </p>
      </section>
    );
  }

  const maiorTp = Math.max(...analise.comDados.map((o) => o.resultado.tpPorPeca), 1);

  return (
    <section style={est.blocoTabela} aria-label="Dimensionamento de operadores">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Quantos operadores preciso?</h2>
      </div>

      <div style={est.blocoFormula}>
        <div style={est.formulaTitulo}>N° de operadores = Σ TP ÷ Takt Time</div>
        <div style={est.formulaConta}>
          {formatarSegundos(analise.somaTp)} s ÷ {formatarSegundos(analise.taktMs)} s
          {' = '}{dim.exato.toFixed(2)} → arredonda para cima ={' '}
          <strong style={est.formulaResultado}>{dim.necessarios}</strong>
        </div>
      </div>

      <div style={est.gradeKpi}>
        <Kpi
          rotuloKpi="Operadores necessários"
          valor={String(dim.necessarios)}
          nota={`cálculo exato: ${dim.exato.toFixed(2)} — meio operador não existe no posto`}
          cor={claro.vermelho}
        />
        <Kpi
          rotuloKpi="Ocupação com esse nº"
          valor={`${dim.eficienciaPct.toFixed(1)}%`}
          nota={dim.eficienciaPct >= 85 ? 'time bem aproveitado' : 'sobra tempo do arredondamento'}
          cor={dim.eficienciaPct >= 85 ? claro.ok : claro.atencao}
        />
        <Kpi
          rotuloKpi="Σ Tempo padrão"
          valor={formatarSegundos(analise.somaTp)}
          unidade="s"
          nota={`${analise.comDados.length} operação(ões) somadas`}
          cor={claro.borda}
        />
        <Kpi
          rotuloKpi="Takt Time"
          valor={formatarSegundos(analise.taktMs)}
          unidade="s"
          nota="ritmo exigido pela demanda"
          cor={claro.borda}
        />
      </div>

      <div style={est.listaContribuicao} aria-label="Contribuição de cada operação">
        <span style={est.rotuloBloco}>Contribuição de cada operação</span>
        {analise.comDados.map((o) => {
          const ops = o.resultado.tpPorPeca / analise.taktMs;
          return (
            <div key={o.id} style={est.linhaContribuicao}>
              <span style={est.contribNome} title={o.nome}>{o.nome}</span>
              <span style={est.contribTempo}>{formatarSegundos(o.resultado.tpPorPeca)} s</span>
              <div style={est.barraTrilho}>
                <div style={{ ...est.barraValor, width: `${Math.max(2, (o.resultado.tpPorPeca / maiorTp) * 100)}%`, background: claro.textoMedio }} />
              </div>
              <span style={est.contribOps}>{ops.toFixed(2)} op</span>
            </div>
          );
        })}
      </div>

      <div style={est.blocoAtual}>
        <label style={est.rotuloBloco} htmlFor="operadores-hoje">Quantos operadores você tem hoje?</label>
        <div style={est.linhaAtual}>
          <input
            id="operadores-hoje"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="—"
            value={atuais}
            onChange={(ev) => setAtuais(ev.target.value)}
            style={est.inputOperadores}
          />
          {dim.diferenca !== null && <VereditoTime dim={dim} />}
        </div>
        <span style={est.notaAtual}>
          Fica guardado neste computador, por estudo. É simulação do analista — não
          vai para o banco nem sai no relatório.
        </span>
      </div>
    </section>
  );
}

/** O veredito do time atual: sobra, falta ou fecha. */
function VereditoTime({ dim }) {
  const sobra = dim.diferenca > 0;
  const fecha = dim.diferenca === 0;
  const cor = fecha ? claro.ok : (sobra ? claro.atencao : claro.critico);

  return (
    <div style={{ ...est.veredito, borderColor: cor }} role="status">
      <strong style={{ color: cor }}>
        {fecha && 'Time dimensionado'}
        {sobra && `Sobra${dim.diferenca > 1 ? 'm' : ''} ${dim.diferenca} operador${dim.diferenca > 1 ? 'es' : ''}`}
        {!fecha && !sobra && `Falta${dim.diferenca < -1 ? 'm' : ''} ${Math.abs(dim.diferenca)} operador${dim.diferenca < -1 ? 'es' : ''}`}
      </strong>
      <span style={est.vereditoTexto}>
        Tem {dim.atuais}, precisa de {dim.necessarios}.
        {' '}Ocupação do time atual: {dim.eficienciaAtualPct.toFixed(1)}%.
        {sobra && ' Avalie realocar — ou rever o Takt, se a demanda usada no cálculo já não é a atual.'}
        {!fecha && !sobra && ' Com esse time a linha não atinge o ritmo da demanda.'}
      </span>
    </div>
  );
}

/**
 * SUGESTOES — o que fazer com os numeros.
 *
 * Cada item traz o diagnostico e A ACAO. Diagnostico sem acao vira numero
 * na parede; e' a acao que o supervisor consegue levar para o posto.
 *
 * Nenhuma sugestao manda coletar mais ciclos: a meta de amostra e' decisao
 * do analista, e o app declara a confiabilidade sem cobrar observacao.
 */
function PainelSugestoes({ sugestoes }) {
  const contagem = contarPorPrioridade(sugestoes);

  if (!sugestoes.length) {
    return (
      <section style={est.blocoTabela} aria-label="Sugestões de melhoria">
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Sugestões de melhoria</h2>
        </div>
        <p style={est.vazioParadas}>
          Nada a apontar nos números deste estudo: variação dentro da faixa boa,
          nenhuma parada registrada e nenhum posto acima do Takt. A lista aparece
          sozinha quando algum desses passar do limite.
        </p>
      </section>
    );
  }

  return (
    <section style={est.blocoTabela} aria-label="Sugestões de melhoria">
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Sugestões de melhoria</h2>
        <span style={est.paradasResumo}>{sugestoes.length} no total</span>
      </div>

      <div style={est.gradeKpi}>
        {['alta', 'media', 'baixa'].map((nivel) => (
          <Kpi
            key={nivel}
            rotuloKpi={`Prioridade ${PRIORIDADES[nivel].rotulo.toLowerCase()}`}
            valor={String(contagem[nivel])}
            nota={PRIORIDADES[nivel].descricao}
            cor={{ alta: claro.critico, media: claro.atencao, baixa: claro.ok }[nivel]}
          />
        ))}
      </div>

      <div style={est.listaSugestoes}>
        {sugestoes.map((s) => (
          <div key={s.id} style={{ ...est.cartaoSugestao, borderLeftColor: { alta: claro.critico, media: claro.atencao, baixa: claro.ok }[s.prioridade] }}>
            <div style={est.sugestaoTopo}>
              <span style={{ ...est.selo, marginLeft: 0, background: { alta: claro.critico, media: claro.atencao, baixa: claro.ok }[s.prioridade] }}>
                {PRIORIDADES[s.prioridade].rotulo}
              </span>
              {s.operacao && <span style={est.sugestaoOperacao} title={s.operacao}>{s.operacao}</span>}
              <span style={est.sugestaoTitulo}>{s.titulo}</span>
            </div>
            <p style={est.sugestaoDiagnostico}>{s.diagnostico}</p>
            <p style={est.sugestaoAcao}><strong>Ação:</strong> {s.acao}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * PARADAS DO ESTUDO — a perda que a coleta ja' media e ninguem via.
 *
 * A tela de coleta registra a parada com motivo e desconta do ciclo, para o
 * tempo parado nao inflar o TO. Sem esta aba o dado morria no banco: o
 * analista parava o cronometro, escolhia "Falta de material", e nunca mais
 * reencontrava aquilo — a perda ficava sem dono e sem acao.
 *
 * A leitura e' de Pareto: motivo, quanto custou, quanto representa do
 * parado, e A ACAO que ele pede. Motivo sem acao nao vira melhoria; e' por
 * isso que a acao vem na mesma linha, e nao num anexo.
 *
 * O percentual e' sobre o tempo com o CRONOMETRO NA MAO (ciclos + paradas),
 * nunca sobre o turno: o estudo nao observou o turno, e usar essa base
 * daria um numero que parece OEE sem ser.
 */
function PainelParadas({ resumo }) {
  if (!resumo.n) {
    return (
      <section style={est.blocoTabela}>
        <div style={est.cabecalhoSecao}>
          <h2 style={est.tituloSecao}>Paradas</h2>
        </div>
        <p style={est.vazioParadas}>
          Nenhuma parada registrada neste estudo. Durante a coleta, no celular,
          o botão <strong>Parada</strong> pergunta o motivo e cronometra o tempo
          parado — ele sai do ciclo (não infla o tempo observado) e aparece aqui,
          por motivo, com a ação que cada um pede. Nas furadeiras, onde não se
          cronometra ciclo a ciclo, as paradas ficam em
          <strong> Furadeiras → Ritmo por máquina</strong>.
        </p>
      </section>
    );
  }

  const maior = resumo.porMotivo[0]?.ms || 1;

  return (
    <section style={est.blocoTabela}>
      <div style={est.cabecalhoSecao}>
        <h2 style={est.tituloSecao}>Paradas registradas na coleta</h2>
        <span style={est.paradasResumo}>
          {formatarDuracao(resumo.totalMs)} em {resumo.n} parada(s) ·{' '}
          {resumo.pctDoObservado.toFixed(1)}% do tempo observado
        </span>
      </div>

      <div style={est.listaMotivos}>
        {resumo.porMotivo.map((m) => (
          <div key={m.motivo} style={est.linhaMotivo}>
            <div style={est.motivoTopo}>
              <span style={est.motivoNome}>{m.rotulo}</span>
              <span style={est.motivoNumero}>
                {formatarDuracao(m.ms)}
                <span style={est.meta}> · {m.n}× · {m.pct.toFixed(0)}%</span>
              </span>
            </div>
            {/* Barra so' para ordenar a leitura: o numero ja' esta escrito ao
                lado, entao ela nunca e' a unica portadora da informacao. */}
            <div style={est.barraTrilho}>
              <div style={{ ...est.barraValor, width: `${Math.max(2, (m.ms / maior) * 100)}%` }} />
            </div>
            <span style={est.motivoAcao}>{m.acao}</span>
          </div>
        ))}
      </div>

      {resumo.porOperacao.length > 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={est.tabela}>
            <thead>
              <tr>
                <th style={est.th}>Operação</th>
                <th style={est.thNum}>Paradas</th>
                <th style={est.thNum}>Tempo parado</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porOperacao.map((o) => (
                <tr key={o.id}>
                  <td style={est.td}>{o.nome}</td>
                  <td style={est.tdNum}>{o.n}</td>
                  <td style={est.tdNum}>{formatarDuracao(o.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={est.notaParadas}>
        O tempo parado <strong>não entra</strong> no tempo observado: ele é
        descontado do ciclo na hora da coleta, para não virar lentidão da
        operação. Ele é perda a tratar — por isso aparece separado, com a ação
        de cada motivo.
      </p>
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
              <th style={est.thNum} title="Tempo parado registrado nesta operação — não entra no TO">Parado</th>
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
                  <td style={est.tdNum}>
                    {r && r.totalParada > 0 ? (
                      <>
                        {formatarDuracao(r.totalParada)}
                        <span style={est.meta}> ({r.nParadas})</span>
                      </>
                    ) : '—'}
                  </td>
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
  // Lateral fixa + conteudo rolando — mesmo esqueleto da lista de estudos.
  telaComLateral: { minHeight: '100dvh', display: 'flex', alignItems: 'flex-start' },
  conteudoLateral: {
    flex: 1, minWidth: 0, maxWidth: 1400,
    padding: `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px`,
  },

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
  iaConfirmar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: espaco.md, borderRadius: raio.md,
    background: claro.atencaoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.atencao,
    ...tipo('legenda'), color: claro.texto, lineHeight: 1.5,
  },
  iaConfirmarAcoes: { display: 'flex', alignItems: 'center', gap: espaco.md, flexShrink: 0 },
  // Laranja queimado, nao o vermelho da marca: aqui e' status, e o vermelho
  // deste app e' identidade.
  botaoPerigo: {
    minHeight: 34, padding: `0 ${espaco.md}px`, background: claro.critico,
    border: 'none', borderRadius: raio.sm, color: '#fff',
    ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },

  /* ---- cartoes de numero (capacidade, operadores, sugestoes) ---- */
  gradeKpi: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: espaco.lg, padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  // Barra de acento a esquerda. A cor nunca informa sozinha: o rotulo esta
  // em cima e a nota, em palavras, embaixo.
  cartaoKpi: {
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.fundo, borderRadius: raio.md,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: claro.borda,
  },
  kpiRotulo: { ...rotulo(claro.textoFraco) },
  kpiLinha: { display: 'flex', alignItems: 'baseline', gap: espaco.xs, minWidth: 0 },
  kpiValor: { ...tipo('titulo'), ...numeros, fontFamily: fonteAnalise.numero, color: claro.texto },
  kpiUnidade: { ...tipo('legenda'), color: claro.textoFraco },
  kpiNota: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.4 },

  /* ---- dimensionamento de operadores ---- */
  blocoFormula: {
    margin: `${espaco.lg}px ${espaco.xl}px 0`, padding: espaco.lg,
    background: claro.fundo, borderRadius: raio.md,
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
  },
  formulaTitulo: { ...tipo('corpoF'), color: claro.texto },
  formulaConta: {
    ...tipo('corpo'), ...numeros, fontFamily: fonteAnalise.numero,
    color: claro.textoMedio,
  },
  formulaResultado: { color: claro.vermelho, fontSize: 16 },
  rotuloBloco: { ...rotulo(claro.textoFraco) },
  listaContribuicao: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  linhaContribuicao: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 64px minmax(120px, 2fr) 68px',
    alignItems: 'center', gap: espaco.md,
  },
  contribNome: {
    ...tipo('corpo'), color: claro.texto, minWidth: 0,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  contribTempo: { ...tipo('corpo'), ...numeros, color: claro.textoMedio, textAlign: 'right' },
  contribOps: { ...tipo('legenda'), ...numeros, color: claro.textoFraco, textAlign: 'right' },
  blocoAtual: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: `${espaco.lg}px ${espaco.xl}px`,
    borderTop: `1px solid ${claro.borda}`,
  },
  linhaAtual: { display: 'flex', alignItems: 'stretch', gap: espaco.lg, flexWrap: 'wrap' },
  inputOperadores: {
    width: 110, flexShrink: 0, minHeight: 56, textAlign: 'center',
    background: claro.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda, borderRadius: raio.md,
    color: claro.texto, ...tipo('titulo'), ...numeros, fontFamily: fonteAnalise.numero,
  },
  notaAtual: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.45 },
  veredito: {
    flex: '1 1 320px', minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: `${espaco.md}px ${espaco.lg}px`, borderRadius: raio.md,
    background: claro.fundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: claro.borda,
  },
  vereditoTexto: { ...tipo('legenda'), color: claro.textoMedio, lineHeight: 1.5 },

  /* ---- sugestoes de melhoria ---- */
  listaSugestoes: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  cartaoSugestao: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    padding: `${espaco.md}px ${espaco.lg}px`,
    background: claro.fundo, borderRadius: raio.md,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: claro.borda,
  },
  sugestaoTopo: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap', minWidth: 0 },
  sugestaoOperacao: {
    maxWidth: 320, padding: `2px ${espaco.sm}px`, borderRadius: raio.sm,
    background: claro.papel, ...tipo('legenda'), color: claro.textoMedio,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  sugestaoTitulo: { ...tipo('corpoF'), color: claro.texto },
  sugestaoDiagnostico: { ...tipo('corpo'), color: claro.textoMedio, margin: 0, lineHeight: 1.5 },
  sugestaoAcao: {
    ...tipo('corpo'), color: claro.texto, margin: 0, lineHeight: 1.5,
    padding: `${espaco.sm}px ${espaco.md}px`, borderRadius: raio.sm,
    background: claro.papel,
  },

  /* ---- paradas do estudo ---- */
  paradasResumo: { ...tipo('legenda'), color: claro.textoMedio },
  vazioParadas: {
    margin: 0, padding: `${espaco.xl}px`, ...tipo('corpo'),
    color: claro.textoMedio, lineHeight: 1.6, maxWidth: 720,
  },
  listaMotivos: {
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
    padding: `${espaco.lg}px ${espaco.xl}px`,
  },
  linhaMotivo: { display: 'flex', flexDirection: 'column', gap: espaco.xs, minWidth: 0 },
  motivoTopo: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    gap: espaco.md, minWidth: 0,
  },
  motivoNome: { ...tipo('corpoF'), color: claro.texto },
  motivoNumero: { ...tipo('corpo'), ...numeros, color: claro.texto, whiteSpace: 'nowrap' },
  barraTrilho: { height: 8, borderRadius: raio.pill, background: claro.fundo, overflow: 'hidden' },
  // Laranja de atencao, nao o vermelho da marca: parada e' perda a tratar,
  // e o vermelho aqui e' identidade, nunca status.
  barraValor: { height: '100%', background: claro.atencao, borderRadius: raio.pill },
  motivoAcao: { ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.45 },
  notaParadas: {
    margin: 0, padding: `${espaco.lg}px ${espaco.xl}px`,
    borderTop: `1px solid ${claro.borda}`,
    ...tipo('legenda'), color: claro.textoFraco, lineHeight: 1.5,
  },
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
