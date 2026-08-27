import { useState } from 'react';
import { ALVO_MINIMO, cores as escuro, espaco, raio } from '../../theme/tokens.js';
import { tipo } from '../../theme/escala.js';
import { LOGO_PATRIMAR_CLARO } from '../../theme/logo.js';
import { parearAparelho } from '../../lib/api.js';

/**
 * PREPARAR ESTE APARELHO — acontece UMA vez por tablet.
 *
 * O tablet nao pede senha por turno: quem opera esta' de luva, em pe',
 * diante da furadeira. Em vez disso o aparelho ganha identidade propria —
 * o administrador gera um codigo no PC (Ferramentas → Analistas), alguem o
 * digita aqui, e pronto: o tablet entra sozinho dali em diante, ate' ser
 * revogado na mesma tela do PC.
 */
export default function PrepararAparelho({ aoParear }) {
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(ev) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await parearAparelho(codigo.trim(), nome.trim() || 'Tablet');
      aoParear?.();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  }

  return (
    <div style={est.tela}>
      <form style={est.cartao} onSubmit={enviar} aria-label="Preparar este aparelho">
        <img src={LOGO_PATRIMAR_CLARO} alt="Patrimar Móveis" style={est.logo} />
        <h1 style={est.titulo}>Preparar este aparelho</h1>
        <p style={est.texto}>
          No PC, abra <b>Ferramentas → Analistas → Parear tablet</b> e digite
          aqui o código que aparecer. Só precisa uma vez.
        </p>

        <label style={est.campo}>
          <span style={est.rotulo}>Código de pareamento</span>
          <input
            style={est.inputCodigo} inputMode="text" autoCapitalize="characters"
            autoComplete="one-time-code" maxLength={6} autoFocus
            value={codigo}
            onChange={(ev2) => setCodigo(ev2.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </label>
        <label style={est.campo}>
          <span style={est.rotulo}>Nome do aparelho</span>
          <input
            style={est.input} placeholder="Ex: Tablet furadeiras"
            value={nome} onChange={(ev2) => setNome(ev2.target.value)}
          />
        </label>

        {erro && <p style={est.erro} role="alert">{erro}</p>}

        <button type="submit" style={est.botao} disabled={ocupado || codigo.length < 6}>
          {ocupado ? 'Preparando...' : 'Preparar aparelho'}
        </button>
      </form>
    </div>
  );
}

const est = {
  tela: {
    minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: escuro.fundo, padding: espaco.xl,
    fontFamily: "'Calibri', 'Carlito', 'Segoe UI', system-ui, sans-serif",
  },
  cartao: {
    width: '100%', maxWidth: 420, background: escuro.superficie,
    border: `1px solid ${escuro.borda}`, borderTop: `3px solid ${escuro.vermelho}`,
    borderRadius: raio.lg, padding: espaco.xl,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  logo: { width: 150, alignSelf: 'center' },
  titulo: { ...tipo('titulo'), color: escuro.texto, margin: 0, textAlign: 'center' },
  texto: { ...tipo('corpo'), color: escuro.textoFraco, margin: 0 },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  rotulo: { ...tipo('micro'), textTransform: 'uppercase', color: escuro.textoFraco },
  // Codigo grande e espacado: e' lido de outra tela e digitado de pe'.
  inputCodigo: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.md}px`, background: escuro.fundo,
    border: `1px solid ${escuro.borda}`, borderRadius: raio.md,
    color: escuro.texto, fontSize: 30, letterSpacing: '0.35em', textAlign: 'center',
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  input: {
    minHeight: ALVO_MINIMO, padding: `0 ${espaco.md}px`, background: escuro.fundo,
    border: `1px solid ${escuro.borda}`, borderRadius: raio.md,
    color: escuro.texto, fontSize: 17, fontFamily: 'inherit',
  },
  erro: { ...tipo('corpoF'), color: escuro.critico, margin: 0 },
  botao: {
    minHeight: ALVO_MINIMO, border: 'none', borderRadius: raio.md,
    background: escuro.vermelho, color: '#fff', ...tipo('destaque'),
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
