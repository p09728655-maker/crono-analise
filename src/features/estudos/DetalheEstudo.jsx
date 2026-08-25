import { useCallback, useEffect, useState } from 'react';
import { ALVO_MINIMO, cores, espaco, fonte, raio, tamanho } from '../../theme/tokens.js';
import { calcularOperacao, formatarSegundos, FR_PRESETS } from '../../domain/cronoanalise.js';
import { amostraSuficiente } from '../../domain/cronoanalise.js';
import { criarOperacao, obterEstudo, removerOperacao } from '../../lib/api.js';

export default function DetalheEstudo({ estudoId, aoColetar, aoVoltar }) {
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [adicionando, setAdicionando] = useState(false);

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

  if (estado === 'carregando') return <Aviso texto="Carregando estudo..." />;
  if (estado === 'erro') return <Aviso texto={`Falha: ${erro}`} acao={{ rotulo: 'Tentar de novo', aoClicar: carregar }} />;

  const { estudo, operacoes } = dados;
  const tolerancia = Number(estudo.tolerancia_pct);

  return (
    <div style={est.tela}>
      <header style={est.cabecalho}>
        <button type="button" onClick={aoVoltar} style={est.botaoVoltar} aria-label="Voltar">←</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={est.titulo}>{estudo.nome}</h1>
          <p style={est.subtitulo}>
            {[estudo.recurso, estudo.produto].filter(Boolean).join(' · ')} · Tolerancia {tolerancia}% · Meta {estudo.meta_obs} ciclos
          </p>
        </div>
      </header>

      {!operacoes.length ? (
        <Aviso
          texto="Cadastre a primeira operacao para comecar a cronometrar."
          acao={{ rotulo: '+ Adicionar operacao', aoClicar: () => setAdicionando(true) }}
        />
      ) : (
        <ul style={est.lista}>
          {operacoes.map((op) => (
            <LinhaOperacao
              key={op.id}
              operacao={op}
              tolerancia={tolerancia}
              metaObs={estudo.meta_obs}
              aoColetar={() => aoColetar(estudo, op)}
              aoRemover={async () => {
                if (!window.confirm(`Remover a operacao "${op.nome}" e todos os seus ciclos?`)) return;
                await removerOperacao(op.id);
                carregar();
              }}
            />
          ))}
        </ul>
      )}

      {operacoes.length > 0 && (
        <button type="button" style={est.botaoSecundario} onClick={() => setAdicionando(true)}>
          + Adicionar operacao
        </button>
      )}

      {adicionando && (
        <FormularioOperacao
          aoCancelar={() => setAdicionando(false)}
          aoSalvar={async (d) => {
            await criarOperacao({ ...d, estudoId, ordem: operacoes.length });
            setAdicionando(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function LinhaOperacao({ operacao, tolerancia, metaObs, aoColetar, aoRemover }) {
  const r = calcularOperacao(operacao, tolerancia);
  const suficiencia = amostraSuficiente(r, metaObs);

  return (
    <li style={est.cartao}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={est.cartaoTitulo}>{operacao.nome}</div>
        <div style={est.cartaoSub}>
          FR {Number(operacao.fr_pct)}% ·{' '}
          {r ? `${r.n} ciclos · TP ${formatarSegundos(r.tpVal)}s · ${r.cap} pc/h` : 'Sem ciclos coletados'}
        </div>
        <div style={{ ...est.selo, ...(suficiencia.ok ? est.seloOk : est.seloAtencao) }}>
          {suficiencia.ok ? '✓' : '!'} {suficiencia.motivo}
        </div>
      </div>
      <div style={{ display: 'flex', gap: espaco.sm, flexShrink: 0 }}>
        <button type="button" style={est.botaoColetar} onClick={aoColetar}>
          CRONOMETRAR
        </button>
        <button type="button" style={est.botaoRemover} onClick={aoRemover} aria-label={`Remover ${operacao.nome}`}>
          ×
        </button>
      </div>
    </li>
  );
}

function FormularioOperacao({ aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState('');
  const [frPct, setFrPct] = useState(100);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  async function enviar(ev) {
    ev.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome da operacao.'); return; }
    setSalvando(true);
    try { await aoSalvar({ nome, frPct }); }
    catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Nova operacao">
      <form style={est.formulario} onSubmit={enviar}>
        <h2 style={{ margin: 0, fontSize: tamanho.titulo }}>Nova operacao</h2>

        <label style={est.campo}>
          <span style={est.rotulo}>Nome da operacao *</span>
          <input style={est.input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          <span style={est.dica}>Ex: Furar lateral direita</span>
        </label>

        <fieldset style={est.fieldset}>
          <legend style={est.rotulo}>Fator de ritmo (FR)</legend>
          <div style={est.grupoFr}>
            {FR_PRESETS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setFrPct(p.valor)}
                style={{ ...est.botaoFr, ...(frPct === p.valor ? est.botaoFrAtivo : {}) }}
              >
                <strong>{p.valor}%</strong>
                <span style={{ fontSize: 10 }}>{p.rotulo}</span>
              </button>
            ))}
          </div>
          <span style={est.dica}>
            Avalie o ritmo do operador com honestidade: FR errado distorce todo o estudo.
          </span>
        </fieldset>

        {erro && <div style={est.erroForm}>{erro}</div>}

        <div style={{ display: 'flex', gap: espaco.md }}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...est.botaoColetar, flex: 1 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Aviso({ texto, acao }) {
  return (
    <div style={est.aviso}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{texto}</p>
      {acao && <button type="button" style={est.botaoColetar} onClick={acao.aoClicar}>{acao.rotulo}</button>}
    </div>
  );
}

const est = {
  tela: {
    minHeight: '100dvh', background: cores.fundo, color: cores.texto,
    fontFamily: fonte.familia, padding: espaco.lg,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  cabecalho: { display: 'flex', alignItems: 'center', gap: espaco.md },
  botaoVoltar: {
    width: 44, height: 44, flexShrink: 0, background: cores.superficie,
    border: `1px solid ${cores.borda}`, borderRadius: raio.md, color: cores.texto,
    fontSize: 20, cursor: 'pointer',
  },
  titulo: { margin: 0, fontSize: tamanho.titulo, fontWeight: 700 },
  subtitulo: { margin: '2px 0 0', fontSize: tamanho.legenda, color: cores.textoFraco },
  lista: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: espaco.sm },
  cartao: {
    display: 'flex', alignItems: 'center', gap: espaco.md, padding: espaco.md,
    background: cores.superficie, border: `1px solid ${cores.borda}`, borderRadius: raio.md,
  },
  cartaoTitulo: { fontSize: tamanho.corpo, fontWeight: 700 },
  cartaoSub: { fontSize: tamanho.legenda, color: cores.textoFraco, marginTop: 2 },
  selo: {
    display: 'inline-block', marginTop: espaco.sm, padding: '3px 8px',
    borderRadius: raio.sm, fontSize: 10, fontWeight: 700, border: '1px solid',
  },
  seloOk: { color: cores.ok, borderColor: cores.ok, background: cores.okFundo },
  seloAtencao: { color: cores.atencao, borderColor: cores.atencao, background: cores.atencaoFundo },
  botaoColetar: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.lg}px`, background: cores.vermelho,
    border: 'none', borderRadius: raio.md, color: '#fff', fontSize: tamanho.pequeno,
    fontWeight: 700, letterSpacing: 0.8, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoRemover: {
    width: 44, minHeight: ALVO_MINIMO, background: 'transparent',
    border: `1px solid ${cores.borda}`, borderRadius: raio.md, color: cores.textoFraco,
    fontSize: 20, cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.xl}px`, background: 'transparent',
    border: `1px solid ${cores.borda}`, borderRadius: raio.md, color: cores.textoFraco,
    fontSize: tamanho.corpo, cursor: 'pointer', fontFamily: 'inherit',
  },
  aviso: {
    padding: espaco.xxl, textAlign: 'center', color: cores.textoFraco, fontSize: tamanho.pequeno,
    background: cores.superficie, border: `1px dashed ${cores.borda}`, borderRadius: raio.lg,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.lg,
  },
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(10,12,14,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: espaco.lg, overflowY: 'auto',
  },
  formulario: {
    width: '100%', maxWidth: 480, background: cores.superficie, border: `1px solid ${cores.borda}`,
    borderRadius: raio.lg, padding: espaco.xl, display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  campo: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldset: { border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: espaco.sm },
  rotulo: { fontSize: tamanho.legenda, fontWeight: 600, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5 },
  dica: { fontSize: 11, color: cores.textoFraco, fontStyle: 'italic', lineHeight: 1.4 },
  input: {
    minHeight: 48, padding: `0 ${espaco.md}px`, background: cores.fundo,
    border: `1px solid ${cores.borda}`, borderRadius: raio.sm, color: cores.texto,
    fontSize: tamanho.corpo, fontFamily: 'inherit', outline: 'none',
  },
  grupoFr: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: espaco.sm },
  botaoFr: {
    minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: cores.fundo, border: `1px solid ${cores.borda}`, borderRadius: raio.sm,
    color: cores.textoFraco, cursor: 'pointer', fontFamily: 'inherit', fontSize: tamanho.pequeno,
  },
  botaoFrAtivo: { borderColor: cores.vermelho, color: cores.texto, background: 'rgba(219,33,38,0.12)' },
  erroForm: {
    padding: espaco.md, background: cores.criticoFundo, border: `1px solid ${cores.critico}`,
    borderRadius: raio.sm, fontSize: tamanho.pequeno,
  },
};
