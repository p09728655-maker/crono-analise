import { useEffect, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  atualizarUsuario, criarUsuario, entrar, gerarCodigoPareamento, listarUsuarios, quemSouEu,
  removerUsuario, sair,
} from '../../lib/api.js';

/**
 * ANALISTAS — quem mede, quem esta neste computador, e os tablets pareados.
 *
 * Nasceu de um numero: os estudos gravavam o analista em texto livre, e a
 * mesma pessoa apareceu como "ODERLI", "ODERLI GARCIA" e "ODERLI SERGIO
 * GARCIA". Indicador por pessoa contava o Oderli como tres. Com o cadastro,
 * o nome do estudo passa a ser escolhido de uma lista.
 *
 * Desde a mudanca para o Supabase Auth este cadastro TAMBEM e' o controle
 * de acesso: cada linha e' uma conta de verdade, o PC exige entrar, e as
 * politicas do banco (RLS) decidem o que cada papel alcanca. A SENHA
 * continua opcional — analista que so' precisa ser escolhido num estudo
 * nao entra no sistema, e exigir senha de quem nao usa so' produziria
 * senha anotada em post-it ao lado do monitor.
 *
 * O TABLET nao aparece como pessoa: ele e' um APARELHO pareado (papel
 * 'coletor'), com secao propria. Parear gera um codigo de 15 minutos que
 * alguem digita no tablet uma unica vez; revogar e' desativa-lo aqui.
 */
export default function Analistas({ aoFechar, aoTrocarUsuario }) {
  const [usuarios, setUsuarios] = useState(null);
  const [eu, setEu] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(null);
  const [criando, setCriando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [codigo, setCodigo] = useState(null);

  useEffect(() => {
    Promise.all([listarUsuarios(), quemSouEu()])
      .then(([lista, usuario]) => { setUsuarios(lista); setEu(usuario); })
      .catch((e) => setErro(e.message));
  }, []);

  /** Devolve se deu certo — o formulario so' fecha quando deu. */
  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try {
      await fn();
      setUsuarios(await listarUsuarios());
      const usuario = await quemSouEu();
      setEu(usuario);
      aoTrocarUsuario?.(usuario);
    } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const naoCarregou = usuarios == null && erro;
  // Pessoa e aparelho moram na mesma tabela (mesma identidade, mesmas
  // politicas), mas sao coisas diferentes na tela.
  const pessoas = usuarios?.filter((u) => u.papel !== 'coletor') ?? null;
  const aparelhos = usuarios?.filter((u) => u.papel === 'coletor') ?? [];
  const ativos = pessoas?.filter((u) => u.ativo).length ?? 0;

  async function parearTablet() {
    setOcupado(true);
    setErro(null);
    try { setCodigo(await gerarCodigoPareamento()); } catch (e) { setErro(e.message); }
    setOcupado(false);
  }

  return (
    <div style={est.modal} role="dialog" aria-label="Analistas">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Analistas</h2>
        <p style={est.texto}>
          Quem aparece como analista nos estudos. Cadastre uma vez e escolha
          da lista — é o que impede a mesma pessoa de virar três no relatório.
        </p>

        {/* Quem esta' neste PC. Fica no topo porque e' a pergunta que a tela
            responde primeiro para quem abriu ela. */}
        <div style={est.euBloco}>
          <div style={est.euRotulo}>Neste computador</div>
          {eu ? (
            <div style={est.euLinha}>
              <span style={est.euNome}>{eu.nome}</span>
              <button type="button" style={est.botaoTexto} onClick={() => aplicar(() => sair())}>
                Sair
              </button>
            </div>
          ) : entrando ? (
            <FormularioEntrada
              ocupado={ocupado}
              aoCancelar={() => setEntrando(false)}
              aoEntrar={async (email, senha) => {
                if (await aplicar(() => entrar(email, senha))) setEntrando(false);
              }}
            />
          ) : (
            <div style={est.euLinha}>
              <span style={est.euVazio}>Ninguém identificado</span>
              <button type="button" style={est.botaoTexto} onClick={() => setEntrando(true)}>
                Entrar
              </button>
            </div>
          )}
        </div>

        {usuarios == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {pessoas?.length === 0 && !naoCarregou && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhum analista cadastrado</div>
            <p style={est.vazioTexto}>
              Enquanto estiver vazio, o campo Analista do estudo continua sendo
              texto livre — que é como as três grafias apareceram. Cadastre
              quem mede e o campo vira uma lista.
            </p>
          </div>
        )}

        {pessoas?.length > 0 && (
          <div style={est.lista}>
            {pessoas.map((u) => (
              editando === u.id ? (
                <FormularioAnalista
                  key={u.id}
                  usuario={u}
                  ocupado={ocupado}
                  aoCancelar={() => setEditando(null)}
                  aoSalvar={async (dados) => {
                    if (await aplicar(() => atualizarUsuario(u.id, dados))) setEditando(null);
                  }}
                />
              ) : (
                <div key={u.id} style={{ ...est.linha, ...(u.ativo ? {} : est.linhaInativa) }}>
                  <div style={est.linhaCorpo}>
                    <div style={est.linhaTopo}>
                      <span style={est.linhaNome}>{u.nome}</span>
                      {!u.ativo && <span style={est.selo}>Desativado</span>}
                      {u.tem_senha && <span style={est.selo} title="Consegue se identificar no PC">com senha</span>}
                    </div>
                    <span style={est.linhaDetalhe}>
                      {[
                        u.email,
                        u.papel,
                        u.estudos > 0 ? `${u.estudos} estudo(s)` : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div style={est.linhaBotoes}>
                    <button
                      type="button" style={est.botaoTexto}
                      onClick={() => setEditando(u.id)} aria-label={`Editar ${u.nome}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aplicar(() => atualizarUsuario(u.id, { ativo: !u.ativo }))}
                      aria-label={`${u.ativo ? 'Desativar' : 'Reativar'} ${u.nome}`}
                    >
                      {u.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aplicar(() => removerUsuario(u.id))}
                      aria-label={`Excluir ${u.nome}`}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {criando ? (
          <FormularioAnalista
            ocupado={ocupado}
            aoCancelar={() => setCriando(false)}
            aoSalvar={async (dados) => {
              if (await aplicar(() => criarUsuario(dados))) setCriando(false);
            }}
          />
        ) : usuarios != null && !naoCarregou && (
          <button type="button" style={est.botaoSecundario} onClick={() => setCriando(true)}>
            + Novo analista
          </button>
        )}

        {erro && <div style={est.erro} role="alert">{erro}</div>}

        {pessoas?.length > 0 && (
          <p style={est.rodapeTexto}>
            {ativos} analista(s) na lista de escolha. Quem tem e-mail e senha
            entra no PC; o papel decide o que cada um pode fazer.
          </p>
        )}

        {/* Tablets pareados: os aparelhos do chao de fabrica. Cada um tem
            identidade propria — revogar aqui corta o acesso daquele tablet
            sem mexer em nenhum outro. */}
        {usuarios != null && !naoCarregou && (
          <div style={est.euBloco}>
            <div style={est.euRotulo}>Tablets pareados</div>
            {aparelhos.length === 0 && (
              <p style={est.texto}>
                Nenhum tablet pareado ainda. Gere um código e digite-o no
                aparelho, na tela “Preparar este aparelho”.
              </p>
            )}
            {aparelhos.map((a) => (
              <div key={a.id} style={est.euLinha}>
                <span style={a.ativo ? est.euNome : est.euVazio}>
                  {a.nome}{a.ativo ? '' : ' · revogado'}
                </span>
                <span style={est.linhaBotoes}>
                  <button
                    type="button" style={est.botaoTexto} disabled={ocupado}
                    onClick={() => aplicar(() => atualizarUsuario(a.id, { ativo: !a.ativo }))}
                    aria-label={`${a.ativo ? 'Revogar' : 'Reativar'} ${a.nome}`}
                  >
                    {a.ativo ? 'Revogar' : 'Reativar'}
                  </button>
                  {!a.ativo && (
                    <button
                      type="button" style={est.botaoTexto} disabled={ocupado}
                      onClick={() => aplicar(() => removerUsuario(a.id))}
                      aria-label={`Excluir ${a.nome}`}
                    >
                      Excluir
                    </button>
                  )}
                </span>
              </div>
            ))}
            {codigo ? (
              <div style={est.codigoBloco}>
                <div style={est.codigo}>{codigo.codigo}</div>
                <p style={est.texto}>
                  Digite este código no tablet em até {codigo.minutos} minutos.
                  Ele vale para UM aparelho; para outro tablet, gere de novo.
                </p>
              </div>
            ) : (
              <button type="button" style={est.botaoSecundario} disabled={ocupado} onClick={parearTablet}>
                Parear tablet
              </button>
            )}
          </div>
        )}

        <div style={est.acoes}>
          <button type="button" style={{ ...est.botaoSecundario, flex: 1 }} onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Entrar: e-mail e senha, conferidos pelo Supabase Auth. */
function FormularioEntrada({ ocupado, aoEntrar, aoCancelar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  return (
    <form
      style={est.form}
      onSubmit={(ev) => { ev.preventDefault(); aoEntrar(email.trim(), senha); }}
    >
      <label style={est.campo}>
        <span style={est.rotuloCampo}>E-mail</span>
        <input
          type="email" value={email} onChange={(ev) => setEmail(ev.target.value)}
          style={est.input} autoComplete="username" autoFocus
        />
      </label>
      <label style={est.campo}>
        <span style={est.rotuloCampo}>Senha</span>
        <input
          type="password" value={senha} onChange={(ev) => setSenha(ev.target.value)}
          style={est.input} autoComplete="current-password"
        />
      </label>
      <div style={est.formAcoes}>
        <button type="button" style={est.botaoTexto} onClick={aoCancelar}>Cancelar</button>
        <button type="submit" style={est.botaoPrimario} disabled={ocupado || !email.trim() || !senha}>
          {ocupado ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </form>
  );
}

/**
 * Cadastro de um analista — o mesmo formulario para criar e editar.
 *
 * Na edicao o campo de senha fica vazio e so' age se for preenchido: abrir
 * para corrigir um e-mail nao pode apagar a senha de ninguem por omissao.
 */
function FormularioAnalista({ usuario, ocupado, aoSalvar, aoCancelar }) {
  const [nome, setNome] = useState(usuario?.nome || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [papel, setPapel] = useState(usuario?.papel || 'analista');
  const [senha, setSenha] = useState('');
  const novo = !usuario;

  return (
    <form
      style={est.form}
      onSubmit={(ev) => {
        ev.preventDefault();
        const dados = { nome: nome.trim(), email: email.trim() || null, papel };
        if (senha) dados.senha = senha;
        aoSalvar(dados);
      }}
    >
      <label style={est.campo}>
        <span style={est.rotuloCampo}>Nome</span>
        <input
          type="text" value={nome} onChange={(ev) => setNome(ev.target.value)}
          placeholder="Ex: Oderli Sergio Garcia" style={est.input} maxLength={200} autoFocus
        />
        <span style={est.dica}>
          É este nome que vai aparecer no estudo e no relatório impresso.
        </span>
      </label>

      <div style={est.linhaCampos}>
        <label style={est.campo}>
          <span style={est.rotuloCampo}>E-mail</span>
          <input
            type="email" value={email} onChange={(ev) => setEmail(ev.target.value)}
            placeholder="opcional" style={est.input} maxLength={200} autoComplete="off"
          />
        </label>
        <label style={est.campo}>
          <span style={est.rotuloCampo}>Papel</span>
          <select value={papel} onChange={(ev) => setPapel(ev.target.value)} style={est.input}>
            <option value="analista">Analista</option>
            <option value="admin">Administrador</option>
            <option value="leitor">Leitor</option>
          </select>
        </label>
      </div>

      <label style={est.campo}>
        <span style={est.rotuloCampo}>
          {novo ? 'Senha' : usuario.tem_senha ? 'Trocar a senha' : 'Definir uma senha'}
        </span>
        <input
          type="password" value={senha} onChange={(ev) => setSenha(ev.target.value)}
          placeholder="opcional · mínimo 8 caracteres" style={est.input} autoComplete="new-password"
        />
        <span style={est.dica}>
          Senha (com e-mail) é o que abre o sistema no PC. Quem apenas
          assina estudos pode ficar sem as duas coisas.
          {!novo && ' Em branco, a senha atual não muda.'}
        </span>
      </label>

      <div style={est.formAcoes}>
        <button type="button" style={est.botaoTexto} onClick={aoCancelar}>Cancelar</button>
        <button type="submit" style={est.botaoPrimario} disabled={ocupado || !nome.trim()}>
          {ocupado ? 'Salvando...' : novo ? 'Adicionar analista' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

const t = claro;

const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  caixa: {
    width: '100%', maxWidth: 640, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },
  rodapeTexto: { ...tipo('legenda'), margin: 0, color: t.textoFraco },

  euBloco: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.md, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  euRotulo: rotulo(t.textoFraco),
  euLinha: { display: 'flex', alignItems: 'center', gap: espaco.md, justifyContent: 'space-between' },
  euNome: { ...tipo('corpoF'), color: t.texto },
  euVazio: { ...tipo('corpo'), color: t.textoFraco, fontStyle: 'italic' },

  codigoBloco: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm, alignItems: 'center',
    padding: espaco.md, background: t.papel, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.bordaForte,
  },
  // Grande e espacado: vai ser lido daqui e digitado no tablet, de pe'.
  codigo: {
    fontSize: 34, fontWeight: 700, letterSpacing: '0.3em', color: t.texto,
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },

  lista: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  linha: {
    display: 'flex', alignItems: 'flex-start', gap: espaco.md,
    padding: espaco.md, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  linhaInativa: { opacity: 0.62 },
  linhaCorpo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  linhaTopo: { display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap' },
  linhaNome: { ...tipo('corpoF'), color: t.texto },
  linhaDetalhe: { ...tipo('legenda'), color: t.textoFraco },
  linhaBotoes: { display: 'flex', gap: espaco.md, flexShrink: 0, alignItems: 'center' },
  selo: {
    padding: '1px 6px', borderRadius: raio.pill, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'),
  },

  form: {
    display: 'flex', flexDirection: 'column', gap: espaco.md,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  linhaCampos: { display: 'flex', gap: espaco.md, flexWrap: 'wrap' },
  campo: { display: 'flex', flexDirection: 'column', gap: espaco.xs, flex: 1, minWidth: 180 },
  rotuloCampo: rotulo(t.textoFraco),
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic' },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },
  formAcoes: { display: 'flex', gap: espaco.md, justifyContent: 'flex-end', alignItems: 'center' },

  botaoPrimario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`,
    background: t.vermelho, border: 'none', borderRadius: raio.md, color: '#fff',
    ...tipo('corpoF'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoSecundario: {
    minHeight: 40, padding: `0 ${espaco.lg}px`, background: 'transparent',
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.md,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoTexto: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
  },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  acoes: { display: 'flex', gap: espaco.md },
};
