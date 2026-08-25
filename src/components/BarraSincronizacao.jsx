import { useCallback, useEffect, useState } from 'react';
import { cores, espaco, fonte, raio, tamanho } from '../theme/tokens.js';
import { contarFila } from '../lib/filaOffline.js';
import { sincronizar } from '../lib/api.js';
import { useOnline } from '../lib/hooks.js';

/**
 * Estado da sincronizacao.
 *
 * So' aparece quando ha' algo a dizer. Barra permanente vira ruido e o
 * analista para de enxergar — que e' justamente quando ela precisaria ser
 * vista. O numero de ciclos pendentes e' mostrado sempre que existir, porque
 * o analista precisa saber se pode sair da fabrica sem perder dado.
 */
export default function BarraSincronizacao() {
  const [pendentes, setPendentes] = useState(0);
  const [estado, setEstado] = useState('ocioso');
  const [erro, setErro] = useState(null);
  const online = useOnline();

  const atualizarContagem = useCallback(async () => {
    try { setPendentes(await contarFila()); } catch { /* fila indisponivel */ }
  }, []);

  const enviar = useCallback(async () => {
    if (!online) return;
    setEstado('enviando');
    setErro(null);
    try {
      await sincronizar();
      setEstado('ocioso');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    } finally {
      atualizarContagem();
    }
  }, [online, atualizarContagem]);

  useEffect(() => {
    atualizarContagem();
    const id = setInterval(atualizarContagem, 5000);
    return () => clearInterval(id);
  }, [atualizarContagem]);

  // Esvazia a fila sozinha assim que ha' o que enviar E rede para isso —
  // seja a rede voltando, seja a fila aparecendo com a rede ja' boa. A
  // versao anterior so' reagia a rede mudar: com wifi estavel, o ciclo
  // ficava pendente ate' alguem clicar em "Enviar agora".
  // Depois de um erro, o proximo gatilho e' manual ou a rede oscilar —
  // sem retentar em loop contra um servidor que acabou de falhar.
  useEffect(() => {
    if (online && pendentes > 0 && estado === 'ocioso' && !erro) enviar();
  }, [online, pendentes, estado, erro, enviar]);

  if (pendentes === 0 && estado === 'ocioso' && online) return null;

  const { cor, texto } = descrever({ online, pendentes, estado, erro });

  return (
    <div style={{ ...est.barra, borderBottomColor: cor, color: cor }} role="status">
      <span style={{ ...est.ponto, background: cor }} />
      <span style={est.texto}>{texto}</span>
      {pendentes > 0 && online && estado !== 'enviando' && (
        <button type="button" style={est.botao} onClick={enviar}>Enviar agora</button>
      )}
    </div>
  );
}

function descrever({ online, pendentes, estado, erro }) {
  if (estado === 'enviando') return { cor: cores.neutro, texto: 'Enviando ciclos...' };
  if (estado === 'erro') return { cor: cores.critico, texto: `Falha ao enviar: ${erro}. Os ciclos seguem salvos no aparelho.` };
  if (!online) {
    return {
      cor: cores.atencao,
      texto: pendentes > 0
        ? `Sem rede · ${pendentes} ciclo(s) salvos no aparelho, aguardando conexao`
        : 'Sem rede · a coleta continua funcionando normalmente',
    };
  }
  if (pendentes > 0) return { cor: cores.atencao, texto: `${pendentes} ciclo(s) aguardando envio` };
  return { cor: cores.ok, texto: 'Tudo sincronizado' };
}

const est = {
  barra: {
    display: 'flex', alignItems: 'center', gap: espaco.sm,
    padding: `${espaco.sm}px ${espaco.lg}px`,
    background: cores.superficie,
    // borderColor vem do estado; longhand evita conflito com a shorthand.
    borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: cores.borda,
    fontFamily: fonte.familia, fontSize: tamanho.legenda,
  },
  ponto: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  texto: { flex: 1, minWidth: 0 },
  botao: {
    minHeight: 36, padding: `0 ${espaco.md}px`, background: 'transparent',
    border: '1px solid currentColor', borderRadius: raio.sm, color: 'inherit',
    fontSize: tamanho.legenda, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
};
