import { useCallback, useEffect, useState } from 'react';
import { cores as escuro, espaco, raio, ALVO_MINIMO } from '../theme/tokens.js';
import { elevacao, tipo, rotulo } from '../theme/escala.js';
import { LOGO_PATRIMAR_CLARO } from '../theme/logo.js';
import { contarFila } from '../lib/filaOffline.js';
import { sincronizar } from '../lib/api.js';
import { useOnline } from '../lib/hooks.js';

/**
 * SAIR DO SISTEMA — so' no tablet.
 *
 * No PC o app vive numa aba do navegador: fechar e' o X que ja' esta' la'.
 * No tablet ele roda INSTALADO, em tela cheia, sem barra de endereco nem
 * botao de fechar — quem termina o turno nao tinha por onde sair, e o
 * aparelho ficava aberto no app ate' a bateria acabar.
 *
 * A saida nao pode ser um clique seco. O ciclo cronometrado vive na fila
 * local ate' o wifi voltar (ver lib/filaOffline.js): sair com a fila cheia
 * nao perde nada — o dado esta' gravado no aparelho —, mas o proximo envio
 * so' acontece quando alguem abrir o app de novo. Por isso a confirmacao
 * MOSTRA quantos registros faltam e oferece enviar antes.
 */
export default function ConfirmarSaida({ aoCancelar, aoConfirmar }) {
  const [pendentes, setPendentes] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const online = useOnline();

  const contar = useCallback(async () => {
    try { setPendentes(await contarFila()); } catch { setPendentes(0); }
  }, []);

  useEffect(() => { contar(); }, [contar]);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try { await sincronizar(); } catch (e) { setErro(e.message); }
    await contar();
    setEnviando(false);
  }

  const temPendencia = pendentes > 0;

  return (
    <div style={est.modal} role="dialog" aria-label="Sair do sistema">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Sair do sistema</h2>

        {pendentes == null ? (
          <p style={est.texto}>Conferindo se há registro para enviar...</p>
        ) : temPendencia ? (
          <div style={est.alerta} role="alert">
            <span style={est.alertaTitulo}>
              {pendentes} registro(s) ainda não enviados
            </span>
            <span style={est.alertaTexto}>
              Estão gravados neste aparelho e não se perdem ao sair. Só não
              aparecem no PC enquanto não subirem.
              {online
                ? ' Como há rede, dá para enviar agora.'
                : ' Sem rede agora: eles sobem sozinhos na próxima vez que o app abrir conectado.'}
            </span>
          </div>
        ) : (
          <p style={est.texto}>
            Tudo sincronizado — nada esperando envio neste aparelho.
          </p>
        )}

        {erro && <div style={est.erro}>{erro}</div>}

        <div style={est.acoes}>
          <button type="button" style={est.botaoSecundario} onClick={aoCancelar}>
            Continuar no app
          </button>
          {temPendencia && online && (
            <button type="button" style={est.botaoEnviar} onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar agora'}
            </button>
          )}
          <button type="button" style={est.botaoSair} onClick={aoConfirmar} disabled={enviando}>
            {temPendencia ? 'Sair mesmo assim' : 'Sair do sistema'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tela de sistema encerrado.
 *
 * window.close() so' fecha janela aberta por script — num app instalado ele
 * as vezes fecha, as vezes nao, e isso varia com o navegador do tablet.
 * Contar com ele seria entregar uma saida que funciona em metade dos
 * aparelhos. Entao a tela e' a saida de verdade: o app fica num estado
 * inequivoco de "encerrado", e o fechamento e' um bonus quando o sistema
 * permite. Quem chega no proximo turno toca em Entrar.
 */
export function SistemaEncerrado({ aoEntrar }) {
  useEffect(() => {
    // Sem try/catch nao ha' o que capturar — o navegador que recusa apenas
    // ignora a chamada e registra um aviso no console.
    try { window.close(); } catch { /* segue na tela de encerrado */ }
  }, []);

  return (
    <div style={est.encerrado}>
      <img src={LOGO_PATRIMAR_CLARO} alt="Patrimar Móveis" style={est.logo} />
      <div style={est.encerradoRotulo}>RitmoPatrimar</div>
      <h1 style={est.encerradoTitulo}>Sistema encerrado</h1>
      <p style={est.encerradoTexto}>
        Pode deixar o tablet na bancada. Nenhuma coleta foi perdida: o que
        estava gravado continua no aparelho e sobe sozinho no próximo acesso
        com rede.
      </p>
      <button type="button" style={est.botaoEntrar} onClick={aoEntrar}>
        Entrar de novo
      </button>
    </div>
  );
}

const t = escuro;

const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(9, 11, 14, 0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: espaco.lg, overflowY: 'auto',
  },
  caixa: {
    width: '100%', maxWidth: 520, background: t.superficie,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.escuraAlta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoFraco },

  alerta: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.md, borderRadius: raio.md, background: t.atencaoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.atencao,
  },
  alertaTitulo: { ...tipo('corpoF'), color: t.texto },
  alertaTexto: { ...tipo('legenda'), color: t.textoFraco },
  erro: {
    padding: espaco.md, borderRadius: raio.sm, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    ...tipo('legenda'), color: t.texto,
  },

  // Alvo de tablet: dedo com luva, aparelho preso na bancada.
  acoes: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  botaoSecundario: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoEnviar: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.lg}px`, background: t.superficieAlta,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.texto, ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  // Sair usa o laranja de estado, nao o vermelho da marca: vermelho aqui e'
  // identidade Patrimar, nao "cuidado".
  botaoSair: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.lg}px`, background: t.critico,
    border: 'none', borderRadius: raio.md,
    color: '#fff', ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },

  encerrado: {
    minHeight: '100dvh', background: t.fundo, color: t.texto,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: espaco.md, padding: espaco.xxl, textAlign: 'center',
    fontFamily: "'Calibri', 'Carlito', 'Segoe UI', system-ui, sans-serif",
  },
  logo: { height: 34, width: 'auto', display: 'block', marginBottom: espaco.md },
  encerradoRotulo: rotulo(t.textoFraco),
  encerradoTitulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  encerradoTexto: { ...tipo('corpo'), margin: 0, maxWidth: 420, color: t.textoFraco },
  botaoEntrar: {
    minHeight: ALVO_MINIMO, minWidth: 240, marginTop: espaco.lg, padding: `0 ${espaco.xl}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md,
    color: '#fff', ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
};
