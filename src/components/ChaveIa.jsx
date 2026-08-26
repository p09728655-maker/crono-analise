import { useEffect, useState } from 'react';
import { claro } from '../theme/tokensAnalise.js';
import { cores as escuro } from '../theme/tokens.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../theme/escala.js';
import { obterConfigIa, salvarChaveIa } from '../lib/api.js';

/**
 * Chave da API de IA — configuracao do APP, nao de um estudo.
 *
 * Ela nasceu dentro do painel de analise, onde e' usada. So' que ali ela
 * fica atras de um estudo aberto: com a lista vazia (todos arquivados, por
 * exemplo) nao havia como chegar nela — configuracao do app escondida
 * atras de um dado que pode nao existir. Por isso este modal, aberto pelo
 * proprio cabecalho da lista.
 *
 * O comportamento e' o mesmo dos dois lugares, porque o estado real vive no
 * servidor: a chave e' enviada uma vez e nunca volta para o navegador — o
 * GET devolve so' os 4 ultimos caracteres, para reconhecer qual esta ativa.
 */
export default function ChaveIa({ modo = 'analise', aoFechar }) {
  const [config, setConfig] = useState(null);
  const [chave, setChave] = useState('');
  const [trocando, setTrocando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    obterConfigIa()
      .then((c) => setConfig(c || { configurada: false }))
      .catch((e) => { setErro(e.message); setConfig({ configurada: false }); });
  }, []);

  const analise = modo === 'analise';
  const est = estilos(analise);
  const configurada = Boolean(config?.configurada);
  const doAmbiente = config?.origem === 'ambiente';
  const mostrarForm = config && (!configurada || trocando);

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

  return (
    <div style={est.modal} role="dialog" aria-label="Chave da IA">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Chave da IA</h2>
        <p style={est.texto}>
          Usada pela <strong>Análise com IA</strong> dentro de cada estudo. Vale para
          o app inteiro — configure uma vez.
        </p>

        {!config && <p style={est.texto}>Verificando...</p>}

        {configurada && !trocando && (
          <div style={est.estadoAtual}>
            <span style={est.selo}>chave {config.resumo}</span>
            <span style={est.textoFraco}>
              {doAmbiente
                ? 'Definida pelo administrador na Vercel (ANTHROPIC_API_KEY) — não dá para trocar por aqui.'
                : 'Salva no servidor. Nunca volta para o navegador.'}
            </span>
            {!doAmbiente && (
              <button type="button" style={est.botaoTexto} onClick={() => setTrocando(true)}>
                Trocar chave
              </button>
            )}
          </div>
        )}

        {mostrarForm && (
          <form style={est.form} onSubmit={salvar}>
            <label style={est.campo}>
              <span style={est.rotuloCampo}>Chave da API Anthropic</span>
              <input
                type="password"
                placeholder="sk-ant-..."
                style={est.input}
                value={chave}
                onChange={(ev) => setChave(ev.target.value)}
                autoComplete="off"
                autoFocus
              />
              <span style={est.dica}>
                Gere em console.anthropic.com. A chave fica guardada no servidor — não
                neste computador — e não aparece de volta depois de salva.
              </span>
            </label>
            <div style={est.formAcoes}>
              {trocando && (
                <button type="button" style={est.botaoTexto} onClick={() => { setTrocando(false); setChave(''); }}>
                  Cancelar
                </button>
              )}
              <button type="submit" style={est.botaoPrimario} disabled={salvando || !chave.trim()}>
                {salvando ? 'Salvando...' : 'Salvar chave'}
              </button>
            </div>
          </form>
        )}

        {erro && <div style={est.erro}>{erro}</div>}

        <div style={est.acoes}>
          <button type="button" style={{ ...est.botaoSecundario, flex: 1 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function estilos(analise) {
  const t = analise
    ? { superficie: claro.papel, fundo: claro.fundo, borda: claro.borda, realce: '#F8F9FB',
        texto: claro.texto, medio: claro.textoMedio, fraco: claro.textoFraco,
        vermelho: claro.vermelho, critico: claro.critico, criticoFundo: claro.criticoFundo }
    : { superficie: escuro.superficie, fundo: escuro.fundo, borda: escuro.borda, realce: escuro.superficieAlta,
        texto: escuro.texto, medio: escuro.textoFraco, fraco: escuro.textoFraco,
        vermelho: escuro.vermelho, critico: escuro.critico, criticoFundo: escuro.criticoFundo };

  return {
    modal: {
      position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: espaco.lg, overflowY: 'auto',
    },
    caixa: {
      width: '100%', maxWidth: 520, background: t.superficie,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
      padding: espaco.xxl, boxShadow: elevacao.alta,
      display: 'flex', flexDirection: 'column', gap: espaco.lg,
    },
    titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
    texto: { ...tipo('corpo'), margin: 0, color: t.medio },
    textoFraco: { ...tipo('legenda'), color: t.fraco },

    estadoAtual: {
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: espaco.sm,
      padding: espaco.md, background: t.realce, borderRadius: raio.md,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    },
    selo: { ...tipo('corpoF'), color: t.texto },

    form: { display: 'flex', flexDirection: 'column', gap: espaco.md },
    campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
    rotuloCampo: rotulo(t.fraco),
    dica: { ...tipo('legenda'), color: t.fraco, fontStyle: 'italic' },
    input: {
      width: '100%', minHeight: 44, padding: `0 ${espaco.md}px`, background: t.fundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
    },
    formAcoes: { display: 'flex', gap: espaco.md, justifyContent: 'flex-end', alignItems: 'center' },

    botaoPrimario: {
      minHeight: analise ? 40 : 48, padding: `0 ${espaco.lg}px`,
      background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
      ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoSecundario: {
      minHeight: analise ? 40 : 48, padding: `0 ${espaco.lg}px`, background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
      color: t.medio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
    },
    botaoTexto: {
      minHeight: 32, padding: 0, background: 'transparent', border: 'none',
      color: t.medio, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
    },

    erro: {
      padding: espaco.md, background: t.criticoFundo,
      borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
      borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
    },
    acoes: { display: 'flex', gap: espaco.md },
  };
}
