import { useEffect, useState } from 'react';
import { ALVO_MINIMO, cores as escuro } from '../../theme/tokens.js';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, numeros, raio, rotulo, tipo, transicao } from '../../theme/escala.js';
import { criarEstudo, listarEstudos, removerEstudo } from '../../lib/api.js';
import { formatarSegundos, taktTime } from '../../domain/cronoanalise.js';
import Cabecalho from '../../components/Cabecalho.jsx';
import EstadoVazio from '../../components/EstadoVazio.jsx';

/**
 * Lista de estudos — porta de entrada das duas experiencias.
 *
 *   coleta  (celular, no posto) — tema escuro, alvos grandes, cartoes.
 *   analise (PC, no escritorio) — tema claro igual ao do relatorio, tabela.
 */
export default function ListaEstudos({ aoAbrir, modo = 'coleta', aoTrocarModo }) {
  const [estudos, setEstudos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);
  const [removendo, setRemovendo] = useState(null);

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
    aoAbrir?.(r.estudo.id);
  }

  const temEstudos = estado === 'pronto' && estudos.length > 0;

  return (
    <div style={est.tela}>
      <Cabecalho
        modo={modo}
        titulo="RitmoPatrimar"
        subtitulo="Cronoanálise e estudo de tempos"
        aoTrocarModo={aoTrocarModo}
        /* O botao principal so' aparece aqui quando ja' ha' lista. No estado
           vazio ele vive no proprio bloco vazio — dois botoes identicos na
           mesma tela e' duplicacao, nao reforco. */
        acoes={temEstudos && (
          <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
            + Novo estudo
          </button>
        )}
      />

      <main style={est.conteudo}>
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

        {estado === 'pronto' && !estudos.length && (
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
            secundaria={analise ? 'Você cadastra aqui no PC e cronometra no celular.' : null}
          />
        )}

        {temEstudos && (
          analise
            ? <TabelaEstudos estudos={estudos} est={est} aoAbrir={aoAbrir} aoRemover={setRemovendo} />
            : <CartoesEstudos estudos={estudos} est={est} aoAbrir={aoAbrir} aoRemover={setRemovendo} />
        )}
      </main>

      {criando && <FormularioEstudo est={est} aoSalvar={criar} aoCancelar={() => setCriando(false)} />}

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

/** Marca grafica sobria para os estados vazios. Sem ilustracao decorativa. */
function Simbolo({ tipo: qual, cor }) {
  if (qual === 'alerta') {
    return (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9.25" stroke={cor} strokeWidth="1.5" />
        <path d="M12 7.5v5.5" stroke={cor} strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill={cor} />
      </svg>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
            <th style={est.th}>Produto</th>
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
              <td style={est.td}>{e.produto || '—'}</td>
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
                {[e.recurso, e.produto, e.analista].filter(Boolean).join(' · ') || 'Sem detalhes'}
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

function FormularioEstudo({ est, aoSalvar, aoCancelar }) {
  const [dados, setDados] = useState({
    nome: '', recurso: '', produto: '', analista: '', toleranciaPct: 15, metaObs: 12,
    taktSeg: '',
  });
  // Calculadora: quase ninguem sabe o Takt de cabeca, mas todo mundo sabe
  // quanto precisa produzir e quanto tempo tem para isso.
  const [calc, setCalc] = useState({ quantidade: '', horas: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const campo = (k) => ({
    value: dados[k],
    onChange: (ev) => setDados((d) => ({ ...d, [k]: ev.target.value })),
  });

  /** Recalcula o Takt sempre que quantidade ou horas mudam. */
  function aplicarCalculo(novo) {
    setCalc(novo);
    const qtd = Number(novo.quantidade);
    const horas = Number(novo.horas);
    if (qtd > 0 && horas > 0) {
      const ms = taktTime(horas * 3600, qtd);
      setDados((d) => ({ ...d, taktSeg: formatarSegundos(ms, 1) }));
    }
  }

  async function enviar(ev) {
    ev.preventDefault();
    if (!dados.nome.trim()) { setErro('Informe o nome do estudo.'); return; }
    setSalvando(true);
    setErro(null);
    const taktMs = dados.taktSeg ? Math.round(Number(dados.taktSeg) * 1000) : null;
    try { await aoSalvar({ ...dados, taktTimeMs: taktMs && taktMs > 0 ? taktMs : null }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Novo estudo">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={est.formTitulo}>Novo estudo</h2>

        <Campo est={est} label="Nome do estudo" obrigatorio dica="Ex: Furação lateral — linha 2">
          <input style={est.input} {...campo('nome')} autoFocus />
        </Campo>

        <div style={est.duasColunas}>
          <Campo est={est} label="Recurso / posto" dica="Ex: Furadeira 03">
            <input style={est.input} {...campo('recurso')} />
          </Campo>
          <Campo est={est} label="Produto ou referência">
            <input style={est.input} {...campo('produto')} />
          </Campo>
        </div>

        <Campo est={est} label="Analista">
          <input style={est.input} {...campo('analista')} />
        </Campo>

        <div style={est.duasColunas}>
          <Campo est={est} label="Tolerância (%)" dica="Fadiga e necessidades. Típica: 10 a 15.">
            <input type="number" min="0" max="100" style={est.input} {...campo('toleranciaPct')} />
          </Campo>
          <Campo est={est} label="Meta de ciclos" dica="Recomendado: 12 ou mais.">
            <input type="number" min="1" max="999" style={est.input} {...campo('metaObs')} />
          </Campo>
        </div>

        <fieldset style={est.bloco}>
          <legend style={est.rotuloCampo}>Takt Time</legend>
          <p style={est.dica}>
            Ritmo que a demanda exige. Sem ele o sistema calcula tempo padrão e
            capacidade, mas <strong>não dimensiona mão de obra</strong> nem desenha
            a linha de referência no Yamazumi.
          </p>

          <div style={est.duasColunas}>
            <Campo est={est} label="Quantidade por dia" dica="Peças que precisam sair.">
              <input
                type="number" min="1" style={est.input}
                value={calc.quantidade}
                onChange={(e) => aplicarCalculo({ ...calc, quantidade: e.target.value })}
              />
            </Campo>
            <Campo est={est} label="Horas disponíveis" dica="Tempo produtivo, já sem paradas planejadas.">
              <input
                type="number" min="0.1" step="0.1" style={est.input}
                value={calc.horas}
                onChange={(e) => aplicarCalculo({ ...calc, horas: e.target.value })}
              />
            </Campo>
          </div>

          <Campo est={est} label="Takt Time (segundos por peça)"
                 dica="Preenchido pela conta acima, ou digite direto se já souber.">
            <input type="number" min="0" step="0.1" style={est.input} {...campo('taktSeg')} />
          </Campo>

          {dados.taktSeg > 0 && (
            <p style={est.resultadoCalc}>
              Uma peça a cada <strong>{Number(dados.taktSeg).toFixed(1)} s</strong> para
              atender a demanda.
            </p>
          )}
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoPrimario, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar estudo'}
          </button>
        </div>
      </form>
    </div>
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
      padding: espaco.lg, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    cartaoTitulo: { ...tipo('corpoF'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoSub: { ...tipo('legenda'), color: t.fraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
    cartaoNumero: { ...tipo('destaque'), ...numeros },
    cartaoRotulo: rotulo(t.fraco),
    botaoRemoverCartao: {
      position: 'absolute', top: 6, right: 6, width: 36, height: 36,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },

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
    },
    formTitulo: { ...tipo('titulo'), margin: 0 },
    textoModal: { ...tipo('corpo'), margin: 0, color: t.medio },
    acoesModal: { display: 'flex', gap: espaco.md, marginTop: espaco.xs },
    duasColunas: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.lg },
    bloco: {
      border: 'none', padding: 0, margin: 0,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
      paddingTop: espaco.md, borderTop: `1px solid ${t.borda}`,
    },
    resultadoCalc: {
      margin: 0, padding: espaco.md, borderRadius: raio.sm,
      background: t.realce, ...tipo('legenda'), color: t.medio,
    },
    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    obrigatorio: { color: t.critico },
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
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
