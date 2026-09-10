import { useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { definirSenhaComToken } from '../../lib/supabase.js';

/**
 * A VOLTA DO LINK DE RECUPERACAO — onde a senha nova e' escrita.
 *
 * Esta tela so' existe enquanto ha' um token de recuperacao vindo do
 * fragmento da URL (ver recuperacaoPendente em src/lib/supabase.js). Nao
 * tem endereco proprio de proposito: rota /nova-senha ficaria acessivel a
 * qualquer um, sem token, e a unica coisa que ela poderia fazer e' dar erro.
 *
 * Sem a apresentacao da tela de entrada: quem chega aqui veio de um e-mail
 * para resolver UMA coisa. Cartao no meio da tela, dois campos, pronto.
 *
 * O MINIMO DE 8 CARACTERES e' o mesmo que o cadastro de analistas cobra
 * (MIN_SENHA em api/usuarios.js). Duas regras diferentes para a mesma senha
 * seria a pessoa criar no link uma senha que o cadastro recusa depois.
 */
const MIN_SENHA = 8;

export default function DefinirNovaSenha({ dados, aoConcluir }) {
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Conferir aqui, e nao so' no servidor, e' o que evita a pessoa descobrir
  // que digitou diferente DEPOIS de o token ter sido gasto.
  const curta = senha.length > 0 && senha.length < MIN_SENHA;
  const diferentes = repetir.length > 0 && senha !== repetir;
  const podeEnviar = senha.length >= MIN_SENHA && senha === repetir && !ocupado;

  async function enviar(ev) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await definirSenhaComToken(dados, senha);
      // A sessao ja' esta guardada: quem trocou a senha entra direto, sem
      // digitar de novo o que acabou de criar.
      aoConcluir?.();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  }

  return (
    <div style={est.tela}>
      <main style={est.cartao}>
        <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />

        <div>
          <h1 style={est.titulo}>Definir nova senha</h1>
          <p style={est.texto}>
            Escolha uma senha de pelo menos {MIN_SENHA} caracteres. Ao confirmar,
            você já entra no sistema.
          </p>
        </div>

        <form style={est.form} onSubmit={enviar} aria-label="Definir nova senha">
          <label style={est.campo}>
            <span style={est.rotulo}>Nova senha</span>
            <input
              style={est.input} type="password" autoComplete="new-password" autoFocus
              value={senha} onChange={(ev) => setSenha(ev.target.value)}
            />
          </label>

          <label style={est.campo}>
            <span style={est.rotulo}>Repita a nova senha</span>
            <input
              style={est.input} type="password" autoComplete="new-password"
              value={repetir} onChange={(ev) => setRepetir(ev.target.value)}
            />
          </label>

          {/* Aviso enquanto digita, nao depois de clicar: o erro aparece
              onde ainda da' para corrigir sem perder o que foi escrito. */}
          {curta && (
            <p style={est.dica} role="status">
              Faltam {MIN_SENHA - senha.length} caractere(s) para o mínimo.
            </p>
          )}
          {diferentes && (
            <p style={est.dica} role="status">As duas senhas não são iguais.</p>
          )}
          {erro && <p style={est.erro} role="alert">{erro}</p>}

          <button type="submit" style={est.botao} disabled={!podeEnviar}>
            {ocupado ? 'Salvando...' : 'Salvar e entrar'}
            <span aria-hidden="true" style={est.seta}>→</span>
          </button>
        </form>

        <p style={est.rodape}>
          O link vale por uma hora e serve uma vez só. Se expirar, peça outro em
          &quot;Esqueci minha senha&quot; na tela de entrada.
        </p>
      </main>
    </div>
  );
}

const t = claro;

const est = {
  tela: {
    minHeight: '100dvh', background: t.fundo, color: t.texto,
    fontFamily: fonteAnalise.familia,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: espaco.lg,
  },
  cartao: {
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
    width: '100%', maxWidth: 420,
    padding: `${espaco.xxxl}px ${espaco.xl}px`,
    background: t.papel, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    boxShadow: elevacao.baixa,
  },
  logo: { width: 120, height: 'auto' },
  titulo: { ...tipo('titulo'), color: t.texto, margin: 0 },
  texto: { ...tipo('corpo'), color: t.textoMedio, margin: `${espaco.sm}px 0 0` },

  form: { display: 'flex', flexDirection: 'column', gap: espaco.md },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  rotulo: rotulo(t.textoFraco),
  input: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  dica: { ...tipo('legenda'), color: t.atencao, margin: 0 },
  erro: { ...tipo('corpoF'), color: t.critico, margin: 0 },
  botao: {
    minHeight: 48, border: 'none', borderRadius: raio.md,
    background: t.vermelho, color: '#fff', ...tipo('corpoF'),
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: espaco.md,
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },
  seta: { fontSize: 18, lineHeight: 1 },
  rodape: { ...tipo('legenda'), color: t.textoFraco, margin: 0 },
};
