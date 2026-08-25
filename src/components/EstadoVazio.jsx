import { claro } from '../theme/tokensAnalise.js';
import { cores as escuro } from '../theme/tokens.js';
import { espaco, raio, tipo } from '../theme/escala.js';

/**
 * Estado vazio.
 *
 * Antes era uma caixa tracejada que ocupava a largura toda com duas linhas
 * de texto perdidas no centro — um retangulo enorme cuja unica funcao era
 * dizer que nao havia nada. O vazio ficava maior e mais chamativo que o
 * conteudo que ele substitui.
 *
 * Aqui o bloco tem largura de leitura, e' centrado no espaco disponivel e
 * carrega UMA acao. Explica o que a coisa e', nao so' que ela falta: quem
 * abre o app pela primeira vez nao sabe o que e' um "estudo".
 */
export default function EstadoVazio({
  modo = 'analise', marca, titulo, texto, acao, secundaria,
}) {
  const analise = modo === 'analise';
  const t = analise
    ? { fundo: claro.papel, borda: claro.borda, texto: claro.texto, fraco: claro.textoMedio, tenue: claro.textoFraco }
    : { fundo: escuro.superficie, borda: escuro.borda, texto: escuro.texto, fraco: escuro.textoFraco, tenue: escuro.textoFraco };

  return (
    <div style={est.area}>
      <div style={{ ...est.bloco, background: t.fundo, borderColor: t.borda }}>
        {marca && <div style={{ ...est.marca, color: t.tenue }}>{marca}</div>}
        <h2 style={{ ...est.titulo, color: t.texto }}>{titulo}</h2>
        <p style={{ ...est.texto, color: t.fraco }}>{texto}</p>
        {acao && <div style={est.acao}>{acao}</div>}
        {secundaria && <div style={{ ...est.secundaria, color: t.tenue }}>{secundaria}</div>}
      </div>
    </div>
  );
}

const est = {
  area: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: `${espaco.gigante}px ${espaco.xl}px`,
  },
  bloco: {
    width: '100%', maxWidth: 460,
    padding: `${espaco.xxl}px ${espaco.xl}px`,
    borderWidth: 1, borderStyle: 'solid', borderRadius: raio.lg,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: espaco.md, textAlign: 'center',
  },
  marca: { marginBottom: espaco.xs },
  titulo: { ...tipo('titulo'), margin: 0 },
  // Largura de leitura confortavel; texto centrado longo cansa.
  texto: { ...tipo('corpo'), margin: 0, maxWidth: 380 },
  acao: { marginTop: espaco.sm },
  secundaria: { ...tipo('legenda'), marginTop: espaco.xs },
};
