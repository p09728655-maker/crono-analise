import { useEffect, useRef, useState } from 'react';
import { ALVO_MINIMO, cores as escuro } from '../../theme/tokens.js';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import { criarEstudo, listarEstudos, removerEstudo } from '../../lib/api.js';
import { agruparPorProduto, produtosConhecidos, setoresConhecidos } from '../../domain/agrupamento.js';
import AvisoAtualizacao from '../../components/AvisoAtualizacao.jsx';
import Cabecalho from '../../components/Cabecalho.jsx';
import HistoricoVersoes from '../../components/HistoricoVersoes.jsx';
import RitmoDemanda, { CALC_PADRAO, taktMsDoCalculo } from '../../components/RitmoDemanda.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';
import ImportarRoteiro from './ImportarRoteiro.jsx';
import { VERSAO } from '../../versao.js';

/**
 * Lista de estudos — porta de entrada das duas experiencias.
 *
 *   coleta  (celular, no posto) — tema escuro, alvos grandes, cartoes.
 *   analise (PC, no escritorio) — tema claro igual ao do relatorio, tabela.
 */
export default function ListaEstudos({ aoAbrir, modo = 'coleta', aoTrocarModo, aoConferirRapido, aoVerConferencias }) {
  const [estudos, setEstudos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [removendo, setRemovendo] = useState(null);
  const [filtro, setFiltro] = useState(null);
  const [verVersoes, setVerVersoes] = useState(false);

  const analise = modo === 'analise';
  const t = tema(analise);
  const est = estilos(t, analise);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setEstado('carregando');
    try {
      const r = await listarEstudos();
      setEstudos(r.estudos || []);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  async function criar(dados) {
    const r = await criarEstudo(dados);
    setCriando(false);
    await carregar();
    // No celular, criar e' o primeiro passo da coleta: segue para o estudo.
    // No PC, um estudo recem-criado nao tem o que analisar — cair no painel
    // cheio de avisos de amostra vazia so' estranha. Fica na lista, com o
    // estudo aparecendo no grupo do produto.
    if (!analise) aoAbrir?.(r.estudo.id);
  }

  const temEstudos = estado === 'pronto' && estudos.length > 0;

  // Um estudo pertence a um produto; a lista plana misturava tudo.
  const grupos = agruparPorProduto(estudos);
  const visiveis = filtro ? grupos.filter((g) => g.chave === filtro) : grupos;

  return (
    <div style={est.tela}>
      <Cabecalho
        modo={modo}
        titulo="RitmoPatrimar"
        subtitulo="Estudo de Tempos"
        versao={VERSAO}
        aoVerVersao={() => setVerVersoes(true)}
        aoTrocarModo={aoTrocarModo}
        /* O botao principal so' aparece aqui quando ja' ha' lista. No estado
           vazio ele vive no proprio bloco vazio — dois botoes identicos na
           mesma tela e' duplicacao, nao reforco. Importar roteiro e' tarefa
           de escritorio: so' existe na Analise — na Coleta nao se importa
           nada, so' se cronometra. */
        acoes={estado === 'pronto' && (
          <>
            {analise && aoVerConferencias && (
              <button type="button" style={est.botaoSecundario} onClick={aoVerConferencias}>
                Conferências
              </button>
            )}
            {analise && (
              <button type="button" style={est.botaoSecundario} onClick={() => setImportando(true)}>
                Importar
              </button>
            )}
            {temEstudos && (
              <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
                + Novo estudo
              </button>
            )}
          </>
        )}
      />

      <main style={est.conteudo}>
        {/* Acima de tudo: o aviso explica por que a tela amanheceu diferente,
            entao precisa vir antes do que mudou. Some ao ser visto. */}
        <AvisoAtualizacao modo={modo} aoVerNovidades={() => setVerVersoes(true)} />

        {/* Atalho da conferencia rapida — SEMPRE visivel na coleta, mesmo com
            a lista carregando ou com erro: ela nao depende do servidor, e o
            analista que so' quer conferir um ritmo nao pode ficar refem da
            rede nem de cadastro. */}
        {!analise && aoConferirRapido && (
          <button type="button" style={est.atalhoRapida} onClick={aoConferirRapido}>
            <Simbolo tipo="cronometro" cor={t.vermelho} tamanho={28} />
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={est.atalhoTitulo}>Conferência rápida</div>
              <div style={est.atalhoTexto}>
                Hora inicial, hora final e peças — o ritmo sai na hora, sem cadastro.
              </div>
            </div>
            <span style={est.atalhoSeta} aria-hidden="true">→</span>
          </button>
        )}

        {estado === 'carregando' && (
          <EstadoVazio
            modo={modo}
            titulo="Carregando estudos"
            texto="Buscando os estudos cadastrados no servidor."
          />
        )}

        {estado === 'erro' && (
          <EstadoVazio
            modo={modo}
            marca={<Simbolo tipo="alerta" cor={t.critico} />}
            titulo="Não foi possível carregar"
            texto={erro}
            acao={(
              <button type="button" style={est.botaoPrimario} onClick={carregar}>
                Tentar de novo
              </button>
            )}
          />
        )}

        {estado === 'pronto' && !estudos.length && (analise ? (
          /* No PC ha' espaco para o vazio APRESENTAR o sistema: o cartao
             central chama para a acao e a faixa abaixo explica, em tres
             passos, o que acontece depois de criar o estudo. */
          <div style={est.vazioArea}>
            <div style={est.vazioCartao}>
              <Simbolo tipo="cronometro" cor={t.fraco} />
              <h2 style={est.vazioTitulo}>Nenhum estudo cadastrado</h2>
              <p style={est.vazioTexto}>
                Crie seu primeiro estudo para começar a coletar ciclos e calcular
                o tempo padrão.
              </p>
              <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
                + Novo estudo
              </button>
            </div>

            <div style={est.vazioFaixa}>
              {[
                { icone: 'cronometro', titulo: 'Coleta', texto: 'Cronometre os ciclos das operações.' },
                { icone: 'grafico', titulo: 'Análise', texto: 'Calcule o tempo padrão e a performance.' },
                { icone: 'pessoas', titulo: 'Capacidade', texto: 'Dimensione o posto e a produção.' },
              ].map((bloco, i) => (
                <div key={bloco.titulo} style={{ ...est.vazioBloco, ...(i > 0 ? est.vazioBlocoDivisa : {}) }}>
                  <Simbolo tipo={bloco.icone} cor={t.vermelho} tamanho={26} />
                  <div>
                    <div style={est.vazioBlocoTitulo}>{bloco.titulo}</div>
                    <div style={est.vazioBlocoTexto}>{bloco.texto}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EstadoVazio
            modo={modo}
            marca={<Simbolo tipo="cronometro" cor={t.fraco} />}
            titulo="Nenhum estudo ainda"
            texto="Um estudo reúne as operações de um posto e os ciclos cronometrados nele. Depois de coletar, ele vira tempo padrão, capacidade e dimensionamento."
            acao={(
              <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
                + Criar primeiro estudo
              </button>
            )}
          />
        ))}

        {temEstudos && (
          <>
            {/* Filtro so' aparece quando ha' mais de um produto: com um so',
                ele seria um controle que nao controla nada. */}
            {grupos.length > 1 && (
              <FiltroProduto grupos={grupos} filtro={filtro} aoFiltrar={setFiltro} est={est} />
            )}

            {visiveis.map((grupo) => (
              <section key={grupo.chave} style={est.grupo}>
                <div style={est.grupoCabecalho}>
                  <h2 style={{ ...est.grupoTitulo, ...(grupo.semProduto ? est.grupoTituloVazio : {}) }}>
                    {grupo.rotulo}
                  </h2>
                  <span style={est.grupoResumo}>
                    {grupo.estudos.length} estudo(s) · {grupo.totalCiclos} ciclo(s)
                  </span>
                </div>

                {analise
                  ? <TabelaEstudos estudos={grupo.estudos} est={est} aoAbrir={aoAbrir} aoRemover={setRemovendo} />
                  : <CartoesEstudos estudos={grupo.estudos} est={est} aoAbrir={aoAbrir} aoRemover={setRemovendo} />}
              </section>
            ))}
          </>
        )}
      </main>

      {verVersoes && (
        <HistoricoVersoes modo={modo} aoFechar={() => setVerVersoes(false)} />
      )}

      {importando && (
        <ImportarRoteiro
          t={t}
          analise={analise}
          produtosExistentes={produtosConhecidos(estudos)}
          setoresConhecidos={setoresConhecidos(estudos)}
          aoConcluir={async (id) => { setImportando(false); await carregar(); if (!analise) aoAbrir?.(id); }}
          aoCancelar={() => setImportando(false)}
        />
      )}

      {criando && (
        <FormularioEstudo
          est={est}
          t={t}
          analise={analise}
          produtos={produtosConhecidos(estudos)}
          setores={setoresConhecidos(estudos)}
          aoSalvar={criar}
          aoCancelar={() => setCriando(false)}
        />
      )}

      {removendo && (
        <ConfirmarRemocao
          est={est}
          estudo={removendo}
          aoConfirmar={async () => { await removerEstudo(removendo.id); setRemovendo(null); await carregar(); }}
          aoCancelar={() => setRemovendo(null)}
        />
      )}
    </div>
  );
}

/**
 * Filtro por produto.
 *
 * Uma linha de opcoes, nao um menu: com poucos produtos, esconder a lista
 * atras de um clique custa mais que mostra-la. Acima de um limite ela vira
 * rolagem horizontal em vez de crescer para baixo e empurrar o conteudo.
 */
function FiltroProduto({ grupos, filtro, aoFiltrar, est }) {
  const total = grupos.reduce((acc, g) => acc + g.estudos.length, 0);

  return (
    <div style={est.filtro} role="group" aria-label="Filtrar por produto">
      <button
        type="button"
        onClick={() => aoFiltrar(null)}
        aria-pressed={filtro === null}
        style={{ ...est.filtroItem, ...(filtro === null ? est.filtroAtivo : {}) }}
      >
        Todos
        <span style={est.filtroContagem}>{total}</span>
      </button>

      {grupos.map((g) => (
        <button
          key={g.chave}
          type="button"
          onClick={() => aoFiltrar(g.chave === filtro ? null : g.chave)}
          aria-pressed={g.chave === filtro}
          style={{ ...est.filtroItem, ...(g.chave === filtro ? est.filtroAtivo : {}) }}
        >
          {g.rotulo}
          <span style={est.filtroContagem}>{g.estudos.length}</span>
        </button>
      ))}
    </div>
  );
}

/** Marca grafica sobria, linear, sem ilustracao decorativa. */
function Simbolo({ tipo: qual, cor, tamanho = 36 }) {
  const base = { width: tamanho, height: tamanho, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (qual === 'alerta') {
    return (
      <svg {...base}>
        <circle cx="12" cy="12" r="9.25" stroke={cor} strokeWidth="1.5" />
        <path d="M12 7.5v5.5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill={cor} />
      </svg>
    );
  }
  if (qual === 'grafico') {
    return (
      <svg {...base}>
        <path d="M5 19.5v-6M12 19.5V6.5M19 19.5v-9" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <path d="M3.5 21.5h17" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (qual === 'pessoas') {
    return (
      <svg {...base}>
        <circle cx="9" cy="8.5" r="3.25" stroke={cor} strokeWidth="1.5" />
        <path d="M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.5 5.7a3.25 3.25 0 1 1 0 5.7M17 14.7c2.1.5 3.5 2.2 3.5 4.8" stroke={cor} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...base}>
      <circle cx="12" cy="13.5" r="8" stroke={cor} strokeWidth="1.5" />
      <path d="M12 9.5v4l2.5 1.8" stroke={cor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 3h5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TabelaEstudos({ estudos, est, aoAbrir, aoRemover }) {
  const [sobre, setSobre] = useState(null);

  return (
    <div style={est.painel}>
      <table style={est.tabela}>
        <thead>
          <tr>
            <th style={est.th}>Estudo</th>
            <th style={est.th}>Recurso</th>
            <th style={est.th}>Analista</th>
            <th style={est.thNum}>Operações</th>
            <th style={est.thNum}>Ciclos</th>
            <th style={est.th}>Atualizado</th>
            <th style={est.th} aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {estudos.map((e) => (
            <tr
              key={e.id}
              style={{ ...est.linha, ...(sobre === e.id ? est.linhaSobre : {}) }}
              onMouseEnter={() => setSobre(e.id)}
              onMouseLeave={() => setSobre(null)}
            >
              <td style={est.tdNome}>{e.nome}</td>
              <td style={est.td}>{e.recurso || '—'}</td>
              <td style={est.td}>{e.analista || '—'}</td>
              <td style={est.tdNum}>{e.total_operacoes}</td>
              <td style={est.tdNum}>{e.total_observacoes}</td>
              <td style={est.tdFraco}>{formatarData(e.atualizado_em)}</td>
              <td style={est.tdAcoes}>
                <button type="button" style={est.botaoLinha} onClick={() => aoAbrir?.(e.id)}>
                  Analisar
                </button>
                <button
                  type="button"
                  style={est.botaoRemover}
                  onClick={() => aoRemover?.(e)}
                  title={Number(e.total_observacoes) > 0 ? 'Arquivar estudo' : 'Excluir estudo'}
                  aria-label={`Remover ${e.nome}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CartoesEstudos({ estudos, est, aoAbrir, aoRemover }) {
  return (
    <ul style={est.lista}>
      {estudos.map((e) => (
        <li key={e.id} style={est.itemLista}>
          <button type="button" style={est.cartao} onClick={() => aoAbrir?.(e.id)}>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={est.cartaoTitulo}>{e.nome}</div>
              <div style={est.cartaoSub}>
                {/* Sem o produto: ele ja' nomeia o grupo logo acima. */}
                {[e.recurso, e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
              </div>
            </div>
            <div style={est.cartaoNumeros}>
              <span style={est.cartaoNumero}>{e.total_observacoes}</span>
              <span style={est.cartaoRotulo}>ciclos</span>
            </div>
          </button>
          {/* Fora do cartao: encostado no alvo principal, o dedo removeria por engano. */}
          <button
            type="button"
            style={est.botaoRemoverCartao}
            onClick={() => aoRemover?.(e)}
            aria-label={`Remover ${e.nome}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConfirmarRemocao({ est, estudo, aoConfirmar, aoCancelar }) {
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState(null);
  const ciclos = Number(estudo.total_observacoes) || 0;
  const temDados = ciclos > 0;

  async function executar() {
    setProcessando(true);
    setErro(null);
    try { await aoConfirmar(); }
    catch (e) { setErro(e.message); setProcessando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Confirmar remoção">
      <div style={est.formulario}>
        <h2 style={est.formTitulo}>{temDados ? 'Arquivar estudo?' : 'Excluir estudo?'}</h2>
        <p style={est.textoModal}><strong>{estudo.nome}</strong></p>
        <p style={est.textoModal}>
          {temDados ? (
            <>
              Este estudo tem <strong>{ciclos} ciclo(s) cronometrado(s)</strong>. Ele sai da
              lista mas <strong>não é apagado</strong> — os dados continuam no banco.
              Tempo de cronometragem não se refaz.
            </>
          ) : (
            <>Nenhum ciclo foi coletado, então não há nada a preservar. O estudo
            será <strong>apagado definitivamente</strong>.</>
          )}
        </p>
        {erro && <div style={est.erroForm}>{erro}</div>}
        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={processando}>
            Cancelar
          </button>
          <button type="button" style={{ ...est.botaoPerigo, flex: 1 }} onClick={executar} disabled={processando}>
            {processando ? 'Removendo...' : (temDados ? 'Arquivar' : 'Excluir')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Novo estudo em tres etapas visuais: quem e' (identificacao), como coletar
 * (meta e tolerancia) e que ritmo a demanda exige (Takt).
 *
 * As etapas nao sao paginas de assistente — tudo fica visivel de uma vez,
 * e o indicador no topo acompanha onde o usuario esta digitando. Esconder
 * campos atras de "proximo" so' faria o analista clicar mais para conferir
 * o que ja' preencheu.
 *
 * O Takt NAO e' campo editavel: e' resultado. Quase ninguem sabe o Takt de
 * cabeca, mas todo mundo sabe quanto precisa produzir e em quanto tempo —
 * entao o formulario pede esses dois numeros e mostra o ritmo calculado.
 * (Quem souber o Takt direto ajusta depois, em Ajustes do estudo.)
 */
function FormularioEstudo({ est, t, analise, produtos = [], setores = [], aoSalvar, aoCancelar }) {
  const [dados, setDados] = useState({
    nome: '', setor: '', recurso: '', produto: '', analista: '', toleranciaPct: 15, metaObs: 12,
  });
  const [calc, setCalc] = useState({ ...CALC_PADRAO });
  const [etapa, setEtapa] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const refNome = useRef(null);
  const refMeta = useRef(null);
  const refQtd = useRef(null);

  const campo = (k) => ({
    value: dados[k],
    onChange: (ev) => setDados((d) => ({ ...d, [k]: ev.target.value })),
  });

  function irParaEtapa(n) {
    setEtapa(n);
    ({ 1: refNome, 2: refMeta, 3: refQtd })[n]?.current?.focus();
  }

  async function enviar(ev) {
    ev.preventDefault();
    if (!dados.nome.trim()) { setErro('Informe o nome do estudo.'); irParaEtapa(1); return; }
    setSalvando(true);
    setErro(null);
    try { await aoSalvar({ ...dados, taktTimeMs: taktMsDoCalculo(calc) }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Novo estudo">
      <form
        style={{ ...est.formulario, ...(analise ? est.formularioLargo : {}) }}
        onSubmit={enviar}
      >
        <div style={est.formCabecalho}>
          <h2 style={est.formTitulo}>Novo estudo</h2>
          <Etapas etapa={etapa} aoIr={irParaEtapa} est={est} compacto={!analise} />
        </div>

        <div style={analise ? est.formCorpoDuplo : est.formCorpo}>
          <div style={est.formEsquerda}>
            <section style={est.secao} onFocusCapture={() => setEtapa(1)}>
              <div style={est.secaoRotulo}>Identificação</div>
              <div style={analise ? est.duasColunas : est.umaColuna}>
                <div style={analise ? est.campoLargo : undefined}>
                  <Campo est={est} label="Nome do estudo" obrigatorio dica="Ex: Furação lateral — linha 2">
                    <input ref={refNome} style={est.input} {...campo('nome')} autoFocus />
                  </Campo>
                </div>
                <Campo est={est} label="Setor" dica="Ex: Usinagem">
                  {/* Sugere setores ja usados: "USINAGEM" ao lado de
                      "Usinagem" fragmentaria filtro e relatorio. */}
                  <input style={est.input} list="setores-conhecidos" {...campo('setor')} />
                  <datalist id="setores-conhecidos">
                    {setores.map((nome) => <option key={nome} value={nome} />)}
                  </datalist>
                </Campo>
                <Campo est={est} label="Recurso / Posto" dica="Ex: Furadeira 03">
                  <input style={est.input} {...campo('recurso')} />
                </Campo>
                <Campo est={est} label="Produto / Referência"
                       dica={produtos.length ? 'Escolha um já usado para agrupar corretamente.' : 'Ex: Mesa Cabeceira Sleep'}>
                  {/* datalist sugere sem impedir texto novo: o analista continua
                      livre para cadastrar produto inedito, mas nao cria "SLEEP
                      BASE" ao lado de "Sleep Base" por descuido. */}
                  <input style={est.input} list="produtos-conhecidos" {...campo('produto')} />
                  <datalist id="produtos-conhecidos">
                    {produtos.map((nome) => <option key={nome} value={nome} />)}
                  </datalist>
                </Campo>
                <Campo est={est} label="Analista" dica="Quem conduz o estudo.">
                  <input style={est.input} {...campo('analista')} />
                </Campo>
              </div>
            </section>

            <section style={est.secaoSeparada} onFocusCapture={() => setEtapa(2)}>
              <div style={est.secaoRotulo}>Configuração da coleta</div>
              <div style={est.duasColunas}>
                <Campo est={est} label="Meta de ciclos" dica="Recomendado: 12 ciclos ou mais.">
                  <input ref={refMeta} type="number" min="1" max="999" style={est.input} {...campo('metaObs')} />
                </Campo>
                <Campo est={est} label="Tolerância (%)" dica="Fadiga e necessidades. Faixa típica: 10 a 15%.">
                  <input type="number" min="0" max="100" style={est.input} {...campo('toleranciaPct')} />
                </Campo>
              </div>
            </section>
          </div>

          <RitmoDemanda
            t={t}
            analise={analise}
            calc={calc}
            aoMudar={setCalc}
            refQuantidade={refQtd}
            aoFocar={() => setEtapa(3)}
          />
        </div>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoPrimario, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : (analise ? 'Criar estudo' : 'Criar e iniciar coleta →')}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Indicador 1 → 2 → 3 do topo do formulario. Clique leva ao primeiro campo.
 * No celular so a etapa ativa carrega rotulo — tres rotulos completos
 * quebram em duas linhas com um traco orfao no comeco da segunda.
 */
function Etapas({ etapa, aoIr, est, compacto = false }) {
  return (
    <ol style={est.etapas}>
      {['Identificação', 'Coleta', 'Ritmo / Demanda'].map((nome, i) => {
        const n = i + 1;
        const ativa = etapa === n;
        return (
          <li key={nome} style={est.etapaItem}>
            {i > 0 && <span style={est.etapaTraco} aria-hidden="true" />}
            <button
              type="button"
              onClick={() => aoIr(n)}
              aria-current={ativa ? 'step' : undefined}
              aria-label={nome}
              style={est.etapaBotao}
            >
              <span style={{ ...est.etapaNumero, ...(ativa ? est.etapaNumeroAtivo : {}) }}>{n}</span>
              {(!compacto || ativa) && (
                <span style={{ ...est.etapaRotulo, ...(ativa ? est.etapaRotuloAtivo : {}) }}>{nome}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Campo({ est, label, obrigatorio, dica, children }) {
  return (
    <label style={est.campo}>
      <span style={est.rotuloCampo}>
        {label}
        {obrigatorio && <span style={est.obrigatorio}> *</span>}
      </span>
      {children}
      {dica && <span style={est.dica}>{dica}</span>}
    </label>
  );
}

const formatarData = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

/* -------------------------------------------------------------------- tema */

function tema(analise) {
  return analise
    ? { fundo: claro.fundo, superficie: claro.papel, borda: claro.borda, realce: '#F8F9FB',
        texto: claro.texto, medio: claro.textoMedio, fraco: claro.textoFraco,
        vermelho: claro.vermelho, critico: claro.critico, criticoFundo: claro.criticoFundo,
        sombra: elevacao.baixa }
    : { fundo: escuro.fundo, superficie: escuro.superficie, borda: escuro.borda, realce: escuro.superficieAlta,
        texto: escuro.texto, medio: escuro.textoFraco, fraco: escuro.textoFraco,
        vermelho: escuro.vermelho, critico: escuro.critico, criticoFundo: escuro.criticoFundo,
        sombra: elevacao.escuraMedia };
}

function estilos(t, analise) {
  const alvo = analise ? 40 : ALVO_MINIMO;

  return {
    tela: { minHeight: '100dvh', background: t.fundo, color: t.texto },
    conteudo: {
      maxWidth: 1400, margin: '0 auto',
      padding: analise ? `${espaco.xl}px ${espaco.xl}px ${espaco.gigante}px` : espaco.lg,
    },

    botaoPrimario: {
      minHeight: analise ? 40 : ALVO_MINIMO, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
      boxShadow: analise ? elevacao.baixa : 'none',
      transition: `filter ${transicao.rapida}`,
    },
    botaoSecundario: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoPerigo: {
      minHeight: alvo, padding: `0 ${espaco.lg}px`, background: t.critico,
      border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- atalho da conferencia rapida (so' coleta) ---- */
    atalhoRapida: {
      width: '100%', minHeight: ALVO_MINIMO,
      display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.lg, marginBottom: espaco.xl,
      background: t.superficie,
      // Borda na cor da marca para destacar do resto da lista sem gritar:
      // e' a unica acao da tela que funciona sem rede e sem cadastro.
      borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
      borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    atalhoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    atalhoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },
    atalhoSeta: { fontSize: 20, color: t.vermelho, flexShrink: 0 },

    /* ---- agrupamento por produto ---- */
    filtro: {
      display: 'flex', gap: espaco.sm, marginBottom: espaco.xl,
      overflowX: 'auto', paddingBottom: espaco.xs,
    },
    filtroItem: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.sm, flexShrink: 0,
      minHeight: analise ? 34 : 44, padding: `0 ${espaco.md}px`,
      background: t.superficie, borderRadius: raio.pill,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.medio, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `border-color ${transicao.rapida}, color ${transicao.rapida}`,
    },
    filtroAtivo: { borderColor: t.vermelho, color: t.texto },
    filtroContagem: {
      minWidth: 18, padding: '0 5px', borderRadius: raio.pill,
      background: t.realce, color: t.fraco, ...tipo('micro'),
      textTransform: 'none', letterSpacing: 0,
    },
    grupo: { marginBottom: espaco.xxl },
    grupoCabecalho: {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap', marginBottom: espaco.md,
    },
    grupoTitulo: { ...tipo('destaque'), margin: 0, color: t.texto },
    grupoTituloVazio: { color: t.fraco, fontStyle: 'italic' },
    grupoResumo: { ...tipo('legenda'), color: t.fraco },

    /* ---- tabela (analise) ---- */
    painel: {
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      border: `1px solid ${t.borda}`, overflow: 'hidden',
    },
    tabela: { width: '100%', borderCollapse: 'collapse' },
    th: {
      textAlign: 'left', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    thNum: {
      textAlign: 'right', padding: `${espaco.md}px ${espaco.lg}px`,
      ...rotulo(t.fraco), background: t.realce,
      borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap',
    },
    linha: { transition: `background ${transicao.rapida}` },
    linhaSobre: { background: t.realce },
    td: { padding: `${espaco.lg}px`, ...tipo('corpo'), color: t.medio, borderBottom: `1px solid ${t.borda}` },
    tdNome: { padding: `${espaco.lg}px`, ...tipo('corpoF'), color: t.texto, borderBottom: `1px solid ${t.borda}` },
    tdFraco: { padding: `${espaco.lg}px`, ...tipo('legenda'), color: t.fraco, borderBottom: `1px solid ${t.borda}`, whiteSpace: 'nowrap' },
    tdNum: {
      padding: `${espaco.lg}px`, textAlign: 'right', ...tipo('corpoF'), ...numeros,
      color: t.texto, borderBottom: `1px solid ${t.borda}`,
    },
    tdAcoes: {
      padding: `${espaco.sm}px ${espaco.lg}px`, textAlign: 'right', whiteSpace: 'nowrap',
      borderBottom: `1px solid ${t.borda}`,
    },
    botaoLinha: {
      minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoRemover: {
      width: 32, height: 32, marginLeft: espaco.xs, background: 'transparent', border: 'none',
      borderRadius: raio.sm, color: t.fraco, fontSize: 18, lineHeight: 1,
      cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- cartoes (coleta) ---- */
    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
    itemLista: { position: 'relative' },
    cartao: {
      width: '100%', minHeight: 76, display: 'flex', alignItems: 'center', gap: espaco.md,
      // Faixa reservada a direita para o botao de remover. Sem ela o × cai
      // em cima da contagem de ciclos — o absolute nao empurra conteudo.
      padding: espaco.lg, paddingRight: 56,
      background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    cartaoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
    cartaoNumero: { ...tipo('destaque'), ...numeros },
    cartaoRotulo: rotulo(t.fraco),
    botaoRemoverCartao: {
      // Centralizado na faixa reservada, nao no canto: no canto ele disputa
      // espaco com o numero e fica menor que o dedo precisa.
      position: 'absolute', top: '50%', right: espaco.sm, transform: 'translateY(-50%)',
      width: 40, height: 40,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },

    /* ---- estado vazio estruturado (PC) ---- */
    vazioArea: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xl,
      paddingTop: espaco.xxxl,
    },
    vazioCartao: {
      width: '100%', maxWidth: 560,
      padding: `${espaco.xxxl}px ${espaco.xxl}px`,
      background: t.superficie, borderRadius: raio.lg, boxShadow: t.sombra,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: espaco.md, textAlign: 'center',
    },
    vazioTitulo: { ...tipo('titulo'), margin: 0 },
    vazioTexto: { ...tipo('corpo'), margin: 0, color: t.medio, maxWidth: 400 },
    vazioFaixa: {
      width: '100%', maxWidth: 1080, marginTop: espaco.lg,
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      background: t.superficie, borderRadius: raio.lg,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    vazioBloco: { display: 'flex', alignItems: 'center', gap: espaco.md, padding: espaco.xl },
    vazioBlocoDivisa: { borderLeftWidth: 1, borderLeftStyle: 'solid', borderLeftColor: t.borda },
    vazioBlocoTitulo: { ...tipo('corpoF') },
    vazioBlocoTexto: { ...tipo('legenda'), color: t.fraco, marginTop: 2 },

    /* ---- modal ---- */
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    formulario: {
      width: '100%', maxWidth: 520, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
      maxHeight: '92dvh', overflowY: 'auto',
    },
    formularioLargo: { maxWidth: 960 },
    formTitulo: { ...tipo('titulo'), margin: 0 },
    textoModal: { ...tipo('corpo'), margin: 0, color: t.medio },
    acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },
    // minmax(0, 1fr): input tem largura minima intrinseca e, sem o 0, a
    // coluna recusa encolher e estoura o painel no celular.
    duasColunas: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: espaco.lg },
    umaColuna: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: espaco.lg },

    /* ---- novo estudo em etapas ---- */
    formCabecalho: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: espaco.lg, flexWrap: 'wrap',
    },
    formCorpo: { display: 'flex', flexDirection: 'column', gap: espaco.xl },
    formCorpoDuplo: {
      display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: espaco.xl,
      alignItems: 'start',
    },
    formEsquerda: { display: 'flex', flexDirection: 'column', gap: espaco.xl, minWidth: 0 },
    secao: { display: 'flex', flexDirection: 'column', gap: espaco.md },
    campoLargo: { gridColumn: '1 / -1' },
    secaoSeparada: {
      display: 'flex', flexDirection: 'column', gap: espaco.md,
      paddingTop: espaco.lg,
      borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    },
    secaoRotulo: rotulo(t.fraco),

    etapas: {
      display: 'flex', alignItems: 'center', gap: espaco.sm,
      listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap',
    },
    etapaItem: { display: 'flex', alignItems: 'center', gap: espaco.sm },
    etapaTraco: { width: 18, height: 1, background: t.borda },
    etapaBotao: {
      display: 'inline-flex', alignItems: 'center', gap: espaco.xs,
      background: 'transparent', border: 'none', padding: 2,
      cursor: 'pointer', fontFamily: 'inherit',
    },
    etapaNumero: {
      width: 22, height: 22, borderRadius: raio.pill,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: t.realce, borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      color: t.fraco, ...tipo('micro'), fontWeight: 700,
    },
    etapaNumeroAtivo: { background: t.vermelho, borderColor: t.vermelho, color: '#fff' },
    etapaRotulo: { ...tipo('legenda'), fontWeight: 600, color: t.fraco },
    etapaRotuloAtivo: { color: t.texto },

    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    obrigatorio: { color: t.critico },
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
      transition: `border-color ${transicao.rapida}`,
    },
    erroForm: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
    },
  };
}
