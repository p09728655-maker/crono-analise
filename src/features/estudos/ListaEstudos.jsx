import { useEffect, useState } from 'react';
import { ALVO_MINIMO, cores as escuro, espaco, fonte, raio, tamanho } from '../../theme/tokens.js';
import { claro } from '../../theme/tokensAnalise.js';
import { LOGO_PATRIMAR, LOGO_PATRIMAR_CLARO } from '../../theme/logo.js';
import { criarEstudo, listarEstudos } from '../../lib/api.js';

/**
 * Lista de estudos — porta de entrada das DUAS experiencias.
 *
 * A tela muda de acordo com o modo, e isso e' proposital:
 *
 *  coleta  (celular, no posto) — tema escuro, alvos grandes, pouca coisa na
 *          tela. O analista esta em pe, com as maos ocupadas.
 *  analise (PC, no escritorio) — tema claro igual ao do relatorio impresso,
 *          em tabela densa com analista, data e progresso da amostra.
 *
 * Antes as duas eram identicas aqui. O resultado e' que no PC nao dava para
 * saber em qual experiencia voce estava ate' abrir um estudo — e se nao
 * houvesse estudo nenhum, nunca dava.
 */
export default function ListaEstudos({ aoAbrir, modo = 'coleta', aoTrocarModo }) {
  const [estudos, setEstudos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);

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

  return (
    <div style={est.tela}>
      <header style={est.cabecalho}>
        <div style={est.marcaBloco}>
          <img src={analise ? LOGO_PATRIMAR : LOGO_PATRIMAR_CLARO} alt="Patrimar Móveis" style={est.logo} />
          <div>
            <h1 style={est.titulo}>RitmoPatrimar</h1>
            <p style={est.subtitulo}>Cronoanálise e estudo de tempos</p>
          </div>
        </div>

        <div style={est.acoesCabecalho}>
          {/* O modo agora e' visivel e trocavel, nao um estado invisivel. */}
          <span style={est.selo}>
            {analise ? 'Modo análise · PC' : 'Modo coleta · celular'}
          </span>
          {aoTrocarModo && (
            <button type="button" style={est.botaoTrocar} onClick={aoTrocarModo}>
              {analise ? 'Ir para coleta' : 'Ir para análise'}
            </button>
          )}
          <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
            + Novo estudo
          </button>
        </div>
      </header>

      {estado === 'carregando' && <Estado est={est} texto="Carregando estudos..." />}

      {estado === 'erro' && (
        <Estado est={est} texto={`Não foi possível carregar: ${erro}`}
                acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />
      )}

      {estado === 'pronto' && !estudos.length && (
        <Estado est={est} texto="Nenhum estudo cadastrado. Crie o primeiro para começar a cronometrar."
                acao={{ rotulo: '+ Novo estudo', aoClicar: () => setCriando(true) }} />
      )}

      {estado === 'pronto' && estudos.length > 0 && (
        analise
          ? <TabelaEstudos estudos={estudos} est={est} aoAbrir={aoAbrir} />
          : <CartoesEstudos estudos={estudos} est={est} aoAbrir={aoAbrir} />
      )}

      {criando && <FormularioEstudo est={est} aoSalvar={criar} aoCancelar={() => setCriando(false)} />}
    </div>
  );
}

/** Densidade e colunas extras: no PC ha' espaco e o analista quer comparar. */
function TabelaEstudos({ estudos, est, aoAbrir }) {
  return (
    <div style={est.blocoTabela}>
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
            <tr key={e.id} style={est.linha}>
              <td style={{ ...est.td, fontWeight: 700 }}>{e.nome}</td>
              <td style={est.td}>{e.recurso || '—'}</td>
              <td style={est.td}>{e.produto || '—'}</td>
              <td style={est.td}>{e.analista || '—'}</td>
              <td style={est.tdNum}>{e.total_operacoes}</td>
              <td style={est.tdNum}>{e.total_observacoes}</td>
              <td style={est.td}>{formatarData(e.atualizado_em)}</td>
              <td style={est.td}>
                <button type="button" style={est.botaoLinha} onClick={() => aoAbrir?.(e.id)}>
                  Analisar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** No celular, cartao com alvo grande: o dedo nao acerta linha de tabela. */
function CartoesEstudos({ estudos, est, aoAbrir }) {
  return (
    <ul style={est.lista}>
      {estudos.map((e) => (
        <li key={e.id}>
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
        </li>
      ))}
    </ul>
  );
}

function FormularioEstudo({ est, aoSalvar, aoCancelar }) {
  const [dados, setDados] = useState({
    nome: '', recurso: '', produto: '', analista: '', toleranciaPct: 15, metaObs: 12,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const campo = (k) => ({
    value: dados[k],
    onChange: (ev) => setDados((d) => ({ ...d, [k]: ev.target.value })),
  });

  async function enviar(ev) {
    ev.preventDefault();
    if (!dados.nome.trim()) { setErro('Informe o nome do estudo.'); return; }
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(dados);
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Novo estudo">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={est.formTitulo}>Novo estudo</h2>

        <Campo est={est} rotulo="Nome do estudo" obrigatorio dica="Ex: Furação lateral — linha 2">
          <input style={est.input} {...campo('nome')} autoFocus />
        </Campo>

        <Campo est={est} rotulo="Recurso / posto" dica="Ex: Furadeira 03">
          <input style={est.input} {...campo('recurso')} />
        </Campo>

        <Campo est={est} rotulo="Produto ou referência">
          <input style={est.input} {...campo('produto')} />
        </Campo>

        <Campo est={est} rotulo="Analista">
          <input style={est.input} {...campo('analista')} />
        </Campo>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.md }}>
          <Campo est={est} rotulo="Tolerância (%)" dica="Fadiga e necessidades. Típica: 10 a 15.">
            <input type="number" min="0" max="100" style={est.input} {...campo('toleranciaPct')} />
          </Campo>
          <Campo est={est} rotulo="Meta de ciclos" dica="Recomendado: 12 ou mais.">
            <input type="number" min="1" max="999" style={est.input} {...campo('metaObs')} />
          </Campo>
        </div>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: espaco.md, marginTop: espaco.md }}>
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

function Campo({ est, rotulo, obrigatorio, dica, children }) {
  return (
    <label style={est.campo}>
      <span style={est.rotulo}>
        {rotulo}
        {obrigatorio && <span style={{ color: est.corObrigatorio, marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {dica && <span style={est.dica}>{dica}</span>}
    </label>
  );
}

function Estado({ est, texto, acao }) {
  return (
    <div style={est.estado}>
      <p style={{ margin: 0, lineHeight: 1.5, maxWidth: 520 }}>{texto}</p>
      {acao && (
        <button type="button" style={est.botaoPrimario} onClick={acao.aoClicar}>
          {acao.rotulo}
        </button>
      )}
    </div>
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
    ? { fundo: claro.fundo, superficie: claro.papel, borda: claro.borda,
        texto: claro.texto, fraco: claro.textoFraco, medio: claro.textoMedio,
        vermelho: claro.vermelho, critico: claro.critico, criticoFundo: claro.criticoFundo }
    : { fundo: escuro.fundo, superficie: escuro.superficie, borda: escuro.borda,
        texto: escuro.texto, fraco: escuro.textoFraco, medio: escuro.textoFraco,
        vermelho: escuro.vermelho, critico: escuro.critico, criticoFundo: escuro.criticoFundo };
}

function estilos(t, analise) {
  // No PC o alvo pode ser menor; no celular o dedo (as vezes de luva) manda.
  const alvo = analise ? 40 : ALVO_MINIMO;

  return {
    corObrigatorio: t.critico,
    tela: {
      minHeight: '100dvh', background: t.fundo, color: t.texto,
      fontFamily: fonte.familia, padding: analise ? espaco.xl : espaco.lg,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
    },
    cabecalho: {
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: espaco.md, flexWrap: 'wrap',
      maxWidth: analise ? 1400 : 'none', width: '100%', margin: analise ? '0 auto' : 0,
    },
    marcaBloco: { display: 'flex', alignItems: 'center', gap: espaco.lg, flexWrap: 'wrap' },
    logo: { height: 38, width: 'auto', display: 'block' },
    titulo: { margin: 0, fontSize: tamanho.destaque, fontWeight: 700, letterSpacing: -0.3 },
    subtitulo: { margin: '4px 0 0', fontSize: tamanho.legenda, color: t.fraco },
    acoesCabecalho: { display: 'flex', alignItems: 'center', gap: espaco.md, flexWrap: 'wrap' },
    selo: {
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, padding: '5px 10px',
      borderRadius: raio.pill, color: t.medio,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    botaoTrocar: {
      minHeight: alvo, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, fontSize: tamanho.pequeno, cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoPrimario: {
      minHeight: analise ? 44 : ALVO_MINIMO, padding: `0 ${espaco.xl}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      fontSize: tamanho.corpo, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoSecundario: {
      minHeight: analise ? 44 : ALVO_MINIMO, padding: `0 ${espaco.xl}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.fraco, fontSize: tamanho.corpo, cursor: 'pointer', fontFamily: 'inherit',
    },

    // --- tabela (analise) ---
    blocoTabela: {
      maxWidth: 1400, width: '100%', margin: '0 auto', background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderRadius: raio.lg, padding: espaco.lg, overflowX: 'auto',
    },
    tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: {
      textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase',
      letterSpacing: 0.5, color: t.fraco, borderBottom: `2px solid ${t.borda}`,
    },
    thNum: {
      textAlign: 'right', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase',
      letterSpacing: 0.5, color: t.fraco, borderBottom: `2px solid ${t.borda}`,
    },
    linha: {},
    td: { padding: '10px', borderBottom: `1px solid ${t.borda}` },
    tdNum: { padding: '10px', borderBottom: `1px solid ${t.borda}`, textAlign: 'right', fontFamily: fonte.numero },
    botaoLinha: {
      minHeight: 34, padding: `0 ${espaco.md}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    },

    // --- cartoes (coleta) ---
    lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
    cartao: {
      width: '100%', minHeight: 72, display: 'flex', alignItems: 'center', gap: espaco.md,
      padding: espaco.md, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderRadius: raio.md, color: t.texto, cursor: 'pointer', fontFamily: 'inherit',
    },
    cartaoTitulo: { fontSize: tamanho.corpo, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoSub: { fontSize: tamanho.legenda, color: t.fraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
    cartaoNumero: { fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero },
    cartaoRotulo: { fontSize: 10, color: t.fraco, textTransform: 'uppercase', letterSpacing: 0.6 },

    estado: {
      maxWidth: analise ? 1400 : 'none', width: '100%', margin: analise ? '0 auto' : 0,
      padding: espaco.xxxl, textAlign: 'center', color: t.fraco, fontSize: tamanho.pequeno,
      background: t.superficie, border: `1px dashed ${t.borda}`, borderRadius: raio.lg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.lg,
    },
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(10,12,14,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg, overflowY: 'auto',
    },
    formulario: {
      width: '100%', maxWidth: 480, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderRadius: raio.lg, padding: espaco.xl,
      display: 'flex', flexDirection: 'column', gap: espaco.md,
    },
    formTitulo: { margin: 0, fontSize: tamanho.titulo, fontWeight: 700 },
    campo: { display: 'flex', flexDirection: 'column', gap: 4 },
    rotulo: { fontSize: tamanho.legenda, fontWeight: 600, color: t.fraco, textTransform: 'uppercase', letterSpacing: 0.5 },
    dica: { fontSize: 11, color: t.fraco, fontStyle: 'italic' },
    input: {
      minHeight: 48, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
      borderRadius: raio.sm, color: t.texto,
      fontSize: tamanho.corpo, fontFamily: 'inherit', outline: 'none',
    },
    erroForm: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, fontSize: tamanho.pequeno, color: t.texto, lineHeight: 1.5,
    },
  };
}
