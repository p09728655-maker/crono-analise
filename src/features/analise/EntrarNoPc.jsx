import { useState } from 'react';
import { claro, fonteAnalise } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import { entrar } from '../../lib/api.js';
import { pedirRecuperacao } from '../../lib/supabase.js';
import { Cronometro, RECURSOS } from '../../components/iconesRecursos.jsx';

/**
 * ENTRADA DO PC — a porta da analise.
 *
 * Antes o PC abria sem ninguem: a seguranca era um token embutido no
 * proprio site, ou seja, nenhuma. Agora quem abre a analise diz quem e',
 * e e' o banco — nao a tela — que decide o que cada um alcanca.
 *
 * So' o PC tem esta porta. O tablet do chao de fabrica se pareia uma vez
 * (ver PrepararAparelho) e entra sozinho: ninguem digita senha de luva.
 *
 * POR QUE A APRESENTACAO MORA AQUI, e nao numa tela de boas-vindas propria.
 * A porta ja' existe e ja' custa um passo — vestir ELA nao cobra nada a
 * mais de quem abre o sistema todo dia. Uma tela de abertura DEPOIS do
 * login cobraria um clique diario para sempre, e clique diario para ler o
 * que ja' se sabe vira atrito em duas semanas: o analista aprende a
 * atravessar sem ler, e a tela deixa de informar qualquer coisa.
 *
 * O QUE ESTA TELA NAO MOSTRA — e por que. Contadores de estudos, ciclos e
 * afins ficam de fora: aqui ninguem se identificou ainda, e numero da
 * fabrica antes da senha e' informacao entregue a quem nao entrou. Os
 * indicadores vivem do outro lado da porta, onde ha' sessao e ha' a quem
 * responder.
 */
export default function EntrarNoPc({ aoEntrar, aviso }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(aviso || null);
  const [ocupado, setOcupado] = useState(false);
  /**
   * 'entrar' e' a porta; 'recuperar' e' o pedido de link por e-mail.
   *
   * Os dois modos moram na MESMA tela de proposito: o que muda entre eles
   * e' um campo a menos e o texto do botao. Uma rota propria para
   * recuperar custaria arquivo, endereco e caminho de volta — e ninguem
   * chega ali por link direto, so' por este botao.
   */
  const [modo, setModo] = useState('entrar');
  const [enviado, setEnviado] = useState(false);

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

  async function recuperar(ev) {
    ev.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      await pedirRecuperacao(email.trim());
      setEnviado(true);
    } catch (e) {
      setErro(e.message);
    }
    setOcupado(false);
  }

  function irPara(destino) {
    setModo(destino);
    setErro(null);
    setEnviado(false);
  }

  return (
    <div style={est.tela}>
      {/* Estilo inline nao faz media query, e esta tela precisa de uma: o
          painel da direita e' decoracao, e decoracao nao pode espremer o
          formulario numa janela estreita. Mesma tecnica que o cadastro de
          maquinas ja' usa para a folha impressa. */}
      <style>{`
        @media (max-width: 900px) {
          .entrada-arte { display: none !important; }
          .entrada-grade { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .entrada-recursos { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div className="entrada-grade" style={est.grade}>
        <main style={est.coluna}>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={est.logo} />

          <div>
            <p style={est.saudacao}>Bem-vindo ao</p>
            <h1 style={est.titulo}>
              RitmoPatrimar
              <span style={est.subtitulo}>
                <Cronometro tamanho={26} />
                Cronoanálise
              </span>
            </h1>
          </div>

          <p style={est.texto}>
            Sistema para estudos de tempos e movimentos, padronização de operações
            e melhoria contínua.
          </p>
          <span style={est.regua} aria-hidden="true" />

          {/* O que o sistema faz, em quatro palavras que o chao de fabrica
              usa. Nao e' propaganda: e' o mapa do que ha' do outro lado. */}
          <div className="entrada-recursos" style={est.recursos}>
            {RECURSOS.map((r) => (
              <div key={r.titulo} style={est.recurso}>
                <r.Icone />
                <span style={est.recursoTitulo}>{r.titulo}</span>
                <span style={est.recursoTexto}>{r.texto}</span>
              </div>
            ))}
          </div>

          {modo === 'entrar' ? (
            <form style={est.form} onSubmit={enviar} aria-label="Entrar no sistema">
              <div style={est.campos}>
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
              </div>

              {erro && <p style={est.erro} role="alert">{erro}</p>}

              <button type="submit" style={est.botao} disabled={ocupado || !email.trim() || !senha}>
                {ocupado ? 'Entrando...' : 'Iniciar sessão'}
                <span aria-hidden="true" style={est.seta}>→</span>
              </button>

              <button type="button" style={est.link} onClick={() => irPara('recuperar')}>
                Esqueci minha senha
              </button>

              <p style={est.rodapeForm}>
                Sem acesso? Peça ao administrador para cadastrar você em
                Ferramentas → Analistas, com e-mail e senha.
              </p>
            </form>
          ) : (
            <form style={est.form} onSubmit={recuperar} aria-label="Recuperar senha">
              <p style={est.textoForm}>
                Informe o e-mail do seu cadastro. Enviamos um link para você criar uma
                senha nova — ele vale por uma hora.
              </p>

              <label style={est.campo}>
                <span style={est.rotulo}>E-mail</span>
                <input
                  style={est.input} type="email" autoComplete="username" autoFocus
                  value={email} onChange={(ev2) => setEmail(ev2.target.value)}
                />
              </label>

              {/* Nunca "enviamos para voce": o servidor responde igual para
                  e-mail cadastrado e nao cadastrado, e a tela nao pode
                  afirmar o que ela nao sabe — nem entregar, pela diferenca
                  de resposta, quem tem acesso ao sistema. */}
              {enviado && (
                <p style={est.sucesso} role="status">
                  Se este e-mail estiver cadastrado, o link já está a caminho.
                  Verifique também a caixa de spam.
                </p>
              )}
              {erro && <p style={est.erro} role="alert">{erro}</p>}

              <button type="submit" style={est.botao} disabled={ocupado || !email.trim()}>
                {ocupado ? 'Enviando...' : 'Enviar link de recuperação'}
                <span aria-hidden="true" style={est.seta}>→</span>
              </button>

              <button type="button" style={est.link} onClick={() => irPara('entrar')}>
                Voltar para a entrada
              </button>
            </form>
          )}
        </main>

        <aside className="entrada-arte" style={est.arte} aria-hidden="true">
          <ArteCronometro />
        </aside>
      </div>

      <footer style={est.rodape}>
        <span style={est.selo}>
          <Cadeado />
          <span>
            <strong style={est.seloTitulo}>Seguro · Confiável · Integrado</strong>
            <span style={est.seloTexto}>Cada medição responde a quem a registrou.</span>
          </span>
        </span>
        <span style={est.versao}>RitmoPatrimar Cronoanálise v{VERSAO}</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------- desenhos */

/**
 * Icones em SVG inline, desenhados aqui. Uma biblioteca de icones custaria
 * mais KB que toda esta tela, e sao quatro formas simples.
 */
const traco = {
  fill: 'none', stroke: claro.vermelho, strokeWidth: 1.6,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};

function Cadeado() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="10" width="14" height="10" rx="2" {...traco} stroke={claro.textoMedio} />
      <path d="M8 10V7a4 4 0 018 0v3" {...traco} stroke={claro.textoMedio} />
    </svg>
  );
}


/**
 * O painel da direita. Sem foto: uma imagem de fabrica pesaria centenas de
 * KB no primeiro carregamento — e esta e' a primeira tela que abre, na rede
 * da empresa. O cronometro em SVG e' vetor, escala em qualquer monitor e
 * custa alguns bytes.
 */
function ArteCronometro() {
  return (
    <svg
      viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice"
      style={est.svgArte} role="img" aria-hidden="true"
    >
      <defs>
        <linearGradient id="entrada-fundo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EFF1F4" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#entrada-fundo)" />

      {/* Malha de pontos: textura discreta, o mesmo cinza das bordas. */}
      <g fill={claro.borda} opacity="0.75">
        {Array.from({ length: 19 }, (_, l) => Array.from({ length: 19 }, (_, c) => (
          <circle key={`${l}-${c}`} cx={20 + c * 20} cy={20 + l * 20} r="1.3" />
        )))}
      </g>

      {/* Cronometro: o objeto da cronoanalise, em tracado limpo. */}
      <g transform="translate(200 205)">
        <circle r="104" fill="none" stroke={claro.bordaForte} strokeWidth="1.2" opacity="0.7" />
        <circle r="84" fill={claro.papel} stroke={claro.bordaForte} strokeWidth="2" />
        {/* Marcas de minuto: as quatro cardeais em vermelho. */}
        {Array.from({ length: 12 }, (_, i) => {
          const ang = (i * 30 * Math.PI) / 180;
          const forte = i % 3 === 0;
          const r1 = forte ? 64 : 71;
          return (
            <line
              key={i}
              x1={Math.sin(ang) * r1} y1={-Math.cos(ang) * r1}
              x2={Math.sin(ang) * 78} y2={-Math.cos(ang) * 78}
              stroke={forte ? claro.vermelho : claro.bordaForte}
              strokeWidth={forte ? 3 : 1.5} strokeLinecap="round"
            />
          );
        })}
        {/* Ponteiro parado em 1/4 de volta: cronometro rodando, nao zerado. */}
        <line x1="0" y1="0" x2="50" y2="-35" stroke={claro.grafite} strokeWidth="4" strokeLinecap="round" />
        <circle r="5" fill={claro.vermelho} />
        {/* Coroa e botao, em cima. */}
        <rect x="-12" y="-110" width="24" height="13" rx="4" fill={claro.grafite} />
        <rect x="-5" y="-121" width="10" height="13" rx="3" fill={claro.vermelho} />
      </g>
    </svg>
  );
}

const t = claro;

const est = {
  tela: {
    minHeight: '100dvh', background: t.papel, color: t.texto,
    fontFamily: fonteAnalise.familia,
    display: 'flex', flexDirection: 'column',
  },
  grade: {
    flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 0.85fr)',
    alignItems: 'stretch',
  },
  coluna: {
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
    padding: `${espaco.xxxl}px ${espaco.gigante}px`,
    maxWidth: 720, width: '100%', justifyContent: 'center', margin: '0 auto',
  },
  logo: { width: 132, height: 'auto', alignSelf: 'flex-start' },

  saudacao: { ...tipo('corpo'), color: t.textoMedio, margin: 0 },
  titulo: { ...tipo('display'), color: t.texto, margin: 0, display: 'flex', flexDirection: 'column' },
  // O nome do metodo, em vermelho e com o cronometro: e' o que diferencia
  // esta tela de qualquer outro sistema da casa.
  subtitulo: {
    color: t.vermelho, display: 'flex', alignItems: 'center', gap: espaco.sm,
  },
  texto: { ...tipo('corpo'), color: t.textoMedio, margin: 0, maxWidth: 460 },
  regua: { display: 'block', width: 48, height: 3, borderRadius: 2, background: t.vermelho },

  recursos: {
    display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: espaco.md,
  },
  recurso: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: espaco.xs,
    padding: `${espaco.lg}px ${espaco.md}px`, background: t.papel, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    boxShadow: elevacao.baixa, textAlign: 'center',
  },
  // Reserva duas linhas: 'Análise de dados' quebra e 'Padronização' nao,
  // e sem a reserva as descricoes dos quatro cartoes saem em alturas
  // diferentes — a fileira parece desalinhada sem nada estar errado.
  recursoTitulo: { ...tipo('corpoF'), color: t.texto, minHeight: 45 },
  recursoTexto: { ...tipo('legenda'), color: t.textoFraco, lineHeight: 1.45 },

  form: { display: 'flex', flexDirection: 'column', gap: espaco.md, maxWidth: 460 },
  campos: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: espaco.md },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs },
  rotulo: rotulo(t.textoFraco),
  input: {
    minHeight: 44, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.bordaForte, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  textoForm: { ...tipo('corpo'), color: t.textoMedio, margin: 0 },
  erro: { ...tipo('corpoF'), color: t.critico, margin: 0 },
  sucesso: {
    ...tipo('corpo'), color: t.ok, margin: 0,
    padding: `${espaco.md}px`, background: t.okFundo, borderRadius: raio.sm,
  },
  botao: {
    minHeight: 48, border: 'none', borderRadius: raio.md,
    background: t.vermelho, color: '#fff', ...tipo('corpoF'),
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: espaco.md,
    cursor: 'pointer', fontFamily: 'inherit', boxShadow: elevacao.baixa,
  },
  seta: { fontSize: 18, lineHeight: 1 },
  // Acao secundaria com cara de link: quem entra todo dia digita a senha e
  // nem olha para ela — so' quem esqueceu procura, e ai' precisa achar.
  link: {
    alignSelf: 'flex-start', padding: 0, border: 'none', background: 'none',
    color: t.vermelho, ...tipo('corpoF'), fontFamily: 'inherit',
    cursor: 'pointer', textDecoration: 'underline',
  },
  rodapeForm: { ...tipo('legenda'), color: t.textoFraco, margin: 0 },

  arte: { background: t.fundo, position: 'relative', overflow: 'hidden' },
  svgArte: { width: '100%', height: '100%', display: 'block', objectFit: 'cover' },

  rodape: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: espaco.lg, flexWrap: 'wrap',
    padding: `${espaco.lg}px ${espaco.gigante}px`,
    borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: t.borda,
    background: t.papel,
  },
  selo: { display: 'flex', alignItems: 'center', gap: espaco.md },
  seloTitulo: { ...tipo('legenda'), fontWeight: 700, color: t.texto, display: 'block' },
  seloTexto: { ...tipo('legenda'), color: t.textoFraco, display: 'block' },
  versao: { ...tipo('legenda'), color: t.textoFraco },
};
