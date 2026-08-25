import { useEffect, useState } from 'react';
import { cores, espaco, fonte, raio, tamanho, ALVO_MINIMO } from '../../theme/tokens.js';
import { criarEstudo, listarEstudos } from '../../lib/api.js';

export default function ListaEstudos({ aoAbrir }) {
  const [estudos, setEstudos] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [criando, setCriando] = useState(false);

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
        <div>
          <h1 style={est.titulo}>Estudos de tempos</h1>
          <p style={est.subtitulo}>Cronoanalise · Patrimar Moveis</p>
        </div>
        <button type="button" style={est.botaoPrimario} onClick={() => setCriando(true)}>
          + Novo estudo
        </button>
      </header>

      {estado === 'carregando' && <Estado texto="Carregando estudos..." />}

      {estado === 'erro' && (
        <Estado
          texto={`Nao foi possivel carregar: ${erro}`}
          acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }}
        />
      )}

      {estado === 'pronto' && !estudos.length && (
        <Estado
          texto="Nenhum estudo cadastrado. Crie o primeiro para comecar a cronometrar."
          acao={{ rotulo: '+ Novo estudo', aoClicar: () => setCriando(true) }}
        />
      )}

      {estado === 'pronto' && estudos.length > 0 && (
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
      )}

      {criando && <FormularioEstudo aoSalvar={criar} aoCancelar={() => setCriando(false)} />}
    </div>
  );
}

function FormularioEstudo({ aoSalvar, aoCancelar }) {
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

        <Campo rotulo="Nome do estudo" obrigatorio dica="Ex: Furacao lateral — linha 2">
          <input style={est.input} {...campo('nome')} autoFocus />
        </Campo>

        <Campo rotulo="Recurso / posto" dica="Ex: Furadeira 03">
          <input style={est.input} {...campo('recurso')} />
        </Campo>

        <Campo rotulo="Produto ou referencia">
          <input style={est.input} {...campo('produto')} />
        </Campo>

        <Campo rotulo="Analista">
          <input style={est.input} {...campo('analista')} />
        </Campo>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.md }}>
          <Campo rotulo="Tolerancia (%)" dica="Fadiga e necessidades. Tipico: 10 a 15.">
            <input type="number" min="0" max="100" style={est.input} {...campo('toleranciaPct')} />
          </Campo>
          <Campo rotulo="Meta de ciclos" dica="Recomendado: 12 ou mais.">
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

function Campo({ rotulo, obrigatorio, dica, children }) {
  return (
    <label style={est.campo}>
      <span style={est.rotulo}>
        {rotulo}
        {obrigatorio && <span style={{ color: cores.critico, marginLeft: 4 }}>*</span>}
      </span>
      {children}
      {dica && <span style={est.dica}>{dica}</span>}
    </label>
  );
}

function Estado({ texto, acao }) {
  return (
    <div style={est.estado}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{texto}</p>
      {acao && (
        <button type="button" style={est.botaoPrimario} onClick={acao.aoClicar}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

const est = {
  tela: {
    minHeight: '100dvh', background: cores.fundo, color: cores.texto,
    fontFamily: fonte.familia, padding: espaco.lg,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  cabecalho: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: espaco.md, flexWrap: 'wrap' },
  titulo: { margin: 0, fontSize: tamanho.destaque, fontWeight: 700 },
  subtitulo: { margin: '4px 0 0', fontSize: tamanho.legenda, color: cores.textoFraco },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
  cartao: {
    width: '100%', minHeight: 72, display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: espaco.md, background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.md, color: cores.texto, cursor: 'pointer', fontFamily: 'inherit',
  },
  cartaoTitulo: { fontSize: tamanho.corpo, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cartaoSub: { fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cartaoNumeros: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  cartaoNumero: { fontSize: tamanho.titulo, fontWeight: 700, fontFamily: fonte.numero },
  cartaoRotulo: { fontSize: 10, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.6 },
  botaoPrimario: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.xl}px`,
    background: cores.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    fontSize: tamanho.corpo, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.xl}px`,
    background: 'transparent', border: `1px solid ${cores.borda}`, borderRadius: raio.md,
    color: cores.textoFraco, fontSize: tamanho.corpo, cursor: 'pointer', fontFamily: 'inherit',
  },
  estado: {
    padding: espaco.xxl, textAlign: 'center', color: cores.textoFraco, fontSize: tamanho.pequeno,
    background: cores.superficie, border: `1px dashed ${cores.borda}`, borderRadius: raio.lg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.lg,
  },
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(10,12,14,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg, overflowY: 'auto',
  },
  formulario: {
    width: '100%', maxWidth: 480, background: cores.superficie,
    border: `1px solid ${cores.borda}`, borderRadius: raio.lg, padding: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  formTitulo: { margin: 0, fontSize: tamanho.titulo, fontWeight: 700 },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  rotulo: { fontSize: tamanho.legenda, fontWeight: 600, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5 },
  dica: { fontSize: 11, color: cores.textoFraco, fontStyle: 'italic' },
  input: {
    minHeight: 48, padding: `0 ${espaco.md}px`, background: cores.fundo,
    border: `1px solid ${cores.borda}`, borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.corpo, fontFamily: 'inherit', outline: 'none',
  },
  erroForm: {
    padding: espaco.md, background: cores.criticoFundo, border: `1px solid ${cores.critico}`,
    borderRadius: raio.sm, fontSize: tamanho.pequeno, color: cores.texto,
  },
};
