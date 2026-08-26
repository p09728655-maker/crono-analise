import { useEffect, useState } from 'react';
import { claro } from '../theme/tokensAnalise.js';
import { cores as escuro } from '../theme/tokens.js';
import { espaco, numeros, raio, tipo, transicao } from '../theme/escala.js';
import { HISTORICO, VERSAO } from '../versao.js';
import { estadoDaVersao, marcarVersaoVista, versaoVista } from '../lib/versaoVista.js';

/**
 * Faixa "app atualizado" — aparece UMA vez por versao, por aparelho.
 *
 * O deploy acontece sem o usuario pedir; a faixa da nome ao que mudou no
 * instante da surpresa e oferece o historico completo. Dispensar ou abrir
 * as novidades marca a versao como vista — o aviso nao insiste, porque
 * aviso que insiste vira ruido e passa a ser ignorado junto com os que
 * importam.
 */
export default function AvisoAtualizacao({ modo = 'coleta', aoVerNovidades }) {
  const [visivel, setVisivel] = useState(() => estadoDaVersao(versaoVista(), VERSAO) === 'nova');

  // Primeira visita: grava em silencio, sem faixa — ver estadoDaVersao.
  useEffect(() => {
    if (estadoDaVersao(versaoVista(), VERSAO) === 'primeira') marcarVersaoVista(VERSAO);
  }, []);

  if (!visivel) return null;

  const novidade = HISTORICO[0];
  const analise = modo === 'analise';
  const t = analise
    ? { superficie: claro.papel, borda: claro.borda, texto: claro.texto,
        fraco: claro.textoFraco, vermelho: claro.vermelho }
    : { superficie: escuro.superficie, borda: escuro.borda, texto: escuro.texto,
        fraco: escuro.textoFraco, vermelho: escuro.vermelho };
  const est = estilos(t, analise);

  const dispensar = () => { marcarVersaoVista(VERSAO); setVisivel(false); };
  const verNovidades = () => { dispensar(); aoVerNovidades?.(); };

  return (
    <div style={est.faixa} role="status" aria-label="Aviso de atualização">
      <div style={est.topo}>
        <span style={est.selo}>v{VERSAO}</span>
        <div style={est.titulo}>App atualizado — {novidade?.titulo}</div>
        <button
          type="button"
          style={est.botaoFechar}
          onClick={dispensar}
          aria-label="Dispensar aviso de atualização"
        >
          ×
        </button>
      </div>
      <div style={est.texto}>Chegou uma versão nova desde a sua última visita.</div>
      <button type="button" style={est.botaoVer} onClick={verNovidades}>
        Ver novidades
      </button>
    </div>
  );
}

function estilos(t, analise) {
  return {
    // Em coluna: titulo, texto e acao empilhados. Em linha unica o botao
    // espremia o titulo no celular ate' sobrar "App at...".
    faixa: {
      display: 'flex', flexDirection: 'column', gap: espaco.sm,
      padding: `${espaco.md}px ${espaco.lg}px`, marginBottom: espaco.xl,
      background: t.superficie,
      // Borda na cor da marca: e' noticia da casa, nao alerta de problema.
      borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
      borderRadius: raio.md, color: t.texto,
    },
    topo: { display: 'flex', alignItems: 'center', gap: espaco.md },
    selo: {
      flexShrink: 0, padding: '2px 8px', borderRadius: raio.pill,
      background: t.vermelho, color: '#fff',
      ...tipo('micro'), ...numeros, fontWeight: 700, letterSpacing: 0.5,
    },
    titulo: { flex: 1, minWidth: 0, ...tipo('corpoF') },
    texto: { ...tipo('legenda'), color: t.fraco },
    botaoVer: {
      alignSelf: 'flex-start', minHeight: analise ? 36 : 44, padding: `0 ${espaco.md}px`,
      background: 'transparent',
      borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
      color: t.texto, ...tipo('legenda'), fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      transition: `border-color ${transicao.rapida}`,
    },
    botaoFechar: {
      flexShrink: 0, width: analise ? 36 : 44, height: analise ? 36 : 44,
      background: 'transparent', border: 'none', borderRadius: raio.sm,
      color: t.fraco, fontSize: 20, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
    },
  };
}
