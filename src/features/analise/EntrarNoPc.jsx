import { useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { espaco, raio, tipo } from '../../theme/escala.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { entrar } from '../../lib/api.js';

/**
 * ENTRADA DO PC — a porta da analise.
 *
 * Antes o PC abria sem ninguem: a seguranca era um token embutido no
 * proprio site, ou seja, nenhuma. Agora quem abre a analise diz quem e',
 * e e' o banco — nao a tela — que decide o que cada um alcanca.
 *
 * So' o PC tem esta porta. O tablet do chao de fabrica se pareia uma vez
 * (ver PrepararAparelho) e entra sozinho: ninguem digita senha de luva.
 */
export default function EntrarNoPc({ aoEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(ev) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const usuario = await entrar(email.trim(), senha);
      aoEntrar?.(usuario);
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  }

  return (
    <div style={est.tela}>
      <form style={est.cartao} onSubmit={enviar} aria-label="Entrar no sistema">
        <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />
        <h1 style={est.titulo}>Ritmo Patrimar</h1>
        <p style={est.texto}>
          Entre com o e-mail e a senha do seu cadastro de analista.
        </p>

        <label style={est.campo}>
          <span style={est.rotulo}>E-mail</span>
          <input
            style={est.input} type="email" autoComplete="username" autoFocus
            value={email} onChange={(ev2) => setEmail(ev2.target.value)}
          />
        </label>
        <label style={est.campo}>
          <span style={est.rotulo}>Senha</span>
          <input
            style={est.input} type="password" autoComplete="current-password"
            value={senha} onChange={(ev2) => setSenha(ev2.target.value)}
          />
        </label>

        {erro && <p style={est.erro} role="alert">{erro}</p>}

        <button type="submit" style={est.botao} disabled={ocupado || !email.trim() || !senha}>
          {ocupado ? 'Entrando...' : 'Entrar'}
        </button>

        <p style={est.rodape}>
          Sem acesso? Peça ao administrador para cadastrar você em
          Ferramentas → Analistas, com e-mail e senha.
        </p>
      </form>
    </div>
  );
}

const t = claro;

const est = {
  tela: {
    minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: t.fundo, padding: espaco.xl, fontFamily: fonteAnalise.familia,
  },
  cartao: {
    width: '100%', maxWidth: 380, background: t.papel,
    border: `1px solid ${t.borda}`, borderTop: `3px solid ${t.vermelho}`,
    borderRadius: raio.lg, padding: espaco.xxl,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
    boxShadow: '0 8px 24px rgba(16,24,40,.08)',
  },
  logo: { width: 150, alignSelf: 'center' },
  titulo: { ...tipo('titulo'), color: t.texto, margin: 0, textAlign: 'center' },
  texto: { ...tipo('corpo'), color: t.textoMedio, margin: 0, textAlign: 'center' },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  rotulo: { ...tipo('micro'), textTransform: 'uppercase', color: t.textoFraco },
  input: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: t.papel,
    border: `1px solid ${t.bordaForte}`, borderRadius: raio.sm,
    color: t.texto, fontSize: 15, fontFamily: 'inherit',
  },
  erro: { ...tipo('corpoF'), color: t.critico, margin: 0 },
  botao: {
    minHeight: 46, border: 'none', borderRadius: raio.md,
    background: t.vermelho, color: '#fff', ...tipo('corpoF'),
    cursor: 'pointer', fontFamily: 'inherit',
  },
  rodape: { ...tipo('legenda'), color: t.textoFraco, margin: 0, textAlign: 'center' },
};
