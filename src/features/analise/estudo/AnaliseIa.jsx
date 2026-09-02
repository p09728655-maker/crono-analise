import { useEffect, useState } from 'react';
import { analisarComIa, obterConfigIa, removerChaveIa, salvarChaveIa } from '../../../lib/api.js';
import { est } from './estilos.js';

/**
 * Analise com IA.
 *
 * A chave da API e' salva UMA vez aqui e vive no servidor — o navegador
 * nunca a le de volta (o GET devolve so' os 4 ultimos caracteres). No app
 * antigo a chave morava no localStorage do chao de fabrica e vazou; este
 * fluxo existe para isso nao se repetir.
 */
export default function AnaliseIa({ estudo, analise }) {
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

