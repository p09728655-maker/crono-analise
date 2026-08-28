import { useEffect, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  atualizarGrupoMaquina, atualizarMaquina, criarGrupoMaquina, criarMaquina,
  listarCadastroMaquinas, removerGrupoMaquina, removerMaquina, semearMaquinasDasConferencias,
} from '../../lib/api.js';
import { adotarMaquinas } from '../../lib/maquinas.js';

/**
 * CADASTRO DE MAQUINAS E GRUPOS — trabalho de PC.
 *
 * Maquina era texto livre no celular, e o mesmo posto saia escrito de tres
 * jeitos. Com o cadastro preenchido, o celular OFERECE as maquinas e
 * digitar vira excecao. Os GRUPOS levam o CODIGO da fabrica (padrao ERP):
 * 0001 SECCIONADORA, 0002 FURADEIRA... — o codigo identifica e ordena, o
 * nome aparece.
 *
 * Decisoes que a tela expoe de proposito:
 *  - Maquina com conferencia registrada nao se exclui, se DESATIVA. O
 *    servidor recusa a exclusao e explica.
 *  - Excluir um grupo NAO apaga maquina: ela so' fica sem grupo.
 *  - Renomear vale para as PROXIMAS medicoes; as antigas ficam com o nome
 *    gravado — a dica diz isso antes de a pessoa descobrir sozinha.
 */
export default function Maquinas({ aoFechar }) {
  const [maquinas, setMaquinas] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const [editando, setEditando] = useState(null);        // {id, nome, grupoId}
  const [editandoGrupo, setEditandoGrupo] = useState(null); // {id, codigo, nome}
  const [novoNome, setNovoNome] = useState('');
  const [novoGrupoId, setNovoGrupoId] = useState('');
  const [novoGrupo, setNovoGrupo] = useState(null);      // {codigo, nome} | null

  // Falha de carga deixa null: "nenhuma cadastrada" e "nao deu para saber"
  // sao afirmacoes diferentes (mesma decisao do cadastro de motivos).
  useEffect(() => {
    listarCadastroMaquinas()
      .then((c) => { setMaquinas(c.maquinas); setGrupos(c.grupos); })
      .catch((e) => setErro(e.message));
  }, []);

  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try {
      await fn();
      const c = await listarCadastroMaquinas();
      setMaquinas(c.maquinas);
      setGrupos(c.grupos);
      adotarMaquinas(c);
    } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const recarregar = () => aplicar(() => Promise.resolve());

  async function criar(ev) {
    ev.preventDefault();
    if (!novoNome.trim()) return;
    // O grupo escolhido FICA: cadastrar as furadeiras em sequencia nao
    // deve exigir escolher "Furadeira" a cada uma.
    if (await aplicar(() => criarMaquina({ nome: novoNome.trim(), grupoId: novoGrupoId || null }))) setNovoNome('');
  }

  // Sugestao do proximo codigo livre: maior codigo numerico + 1, com zeros.
  const proximoCodigo = () => {
    const maior = grupos.reduce((acc, g) => Math.max(acc, parseInt(g.codigo, 10) || 0), 0);
    return String(maior + 1).padStart(4, '0');
  };

  const rotuloGrupo = (g) => `${g.codigo} · ${g.nome}`;
  const naoCarregou = maquinas == null && erro;
  const vazio = maquinas?.length === 0;

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de máquinas">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Máquinas</h2>
        <p style={est.texto}>
          A lista que o celular oferece no Ritmo da furadeira. Com ela preenchida,
          o nome sai igual em toda medição. Os <strong>grupos</strong> levam o
          código da fábrica (0001 SECCIONADORA, 0002 FURADEIRA...) e organizam a
          escolha — e, adiante, a leitura por grupo nos relatórios.
        </p>

        {maquinas == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {maquinas != null && (
          <section style={est.bloco} aria-label="Grupos de máquina">
            <span style={est.blocoRotulo}>GRUPOS</span>
            {grupos.length === 0 && !novoGrupo && (
              <p style={est.dica}>Nenhum grupo ainda — as máquinas podem existir sem grupo.</p>
            )}
            {grupos.map((g) => (
              editandoGrupo?.id === g.id ? (
                <form
                  key={g.id} style={est.formGrupo}
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    if (await aplicar(() => atualizarGrupoMaquina(g.id, {
                      codigo: editandoGrupo.codigo.trim(), nome: editandoGrupo.nome.trim(),
                    }))) setEditandoGrupo(null);
                  }}
                >
                  <input
                    type="text" value={editandoGrupo.codigo} maxLength={10} style={{ ...est.input, width: 90 }}
                    onChange={(ev) => setEditandoGrupo({ ...editandoGrupo, codigo: ev.target.value })}
                    aria-label={`Código do grupo ${g.nome}`} inputMode="numeric"
                  />
                  <input
                    type="text" value={editandoGrupo.nome} maxLength={60} style={{ ...est.input, flex: 1 }}
                    onChange={(ev) => setEditandoGrupo({ ...editandoGrupo, nome: ev.target.value })}
                    aria-label={`Nome do grupo ${g.nome}`} autoFocus
                  />
                  <button type="button" style={est.botaoTexto} onClick={() => setEditandoGrupo(null)}>Cancelar</button>
                  <button type="submit" style={est.botaoPrimario} disabled={ocupado || !editandoGrupo.nome.trim()}>
                    Salvar
                  </button>
                </form>
              ) : (
                <div key={g.id} style={est.linhaGrupo}>
                  <span style={est.codigoGrupo}>{g.codigo}</span>
                  <span style={{ ...est.linhaRotulo, flex: 1 }}>{g.nome}</span>
                  <button
                    type="button" style={est.botaoTexto}
                    onClick={() => setEditandoGrupo({ id: g.id, codigo: g.codigo, nome: g.nome })}
                    aria-label={`Editar grupo ${g.nome}`}
                  >
                    Editar
                  </button>
                  <button
                    type="button" style={est.botaoTexto} disabled={ocupado}
                    onClick={() => aplicar(() => removerGrupoMaquina(g.id))}
                    aria-label={`Excluir grupo ${g.nome}`}
                    title="As máquinas do grupo não são apagadas: ficam sem grupo"
                  >
                    Excluir
                  </button>
                </div>
              )
            ))}

            {novoGrupo ? (
              <form
                style={est.formGrupo}
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  if (await aplicar(() => criarGrupoMaquina({
                    codigo: novoGrupo.codigo.trim(), nome: novoGrupo.nome.trim(),
                  }))) setNovoGrupo(null);
                }}
              >
                <input
                  type="text" value={novoGrupo.codigo} maxLength={10} style={{ ...est.input, width: 90 }}
                  onChange={(ev) => setNovoGrupo({ ...novoGrupo, codigo: ev.target.value })}
                  aria-label="Código do novo grupo" inputMode="numeric"
                />
                <input
                  type="text" value={novoGrupo.nome} maxLength={60} style={{ ...est.input, flex: 1 }}
                  onChange={(ev) => setNovoGrupo({ ...novoGrupo, nome: ev.target.value })}
                  placeholder="Ex: FURADEIRA" aria-label="Nome do novo grupo" autoFocus
                />
                <button type="button" style={est.botaoTexto} onClick={() => setNovoGrupo(null)}>Cancelar</button>
                <button type="submit" style={est.botaoPrimario} disabled={ocupado || !novoGrupo.nome.trim()}>
                  Criar
                </button>
              </form>
            ) : (
              <button
                type="button" style={{ ...est.botaoTexto, alignSelf: 'flex-start' }}
                onClick={() => setNovoGrupo({ codigo: proximoCodigo(), nome: '' })}
              >
                + Novo grupo
              </button>
            )}
          </section>
        )}

        {vazio && !naoCarregou && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhuma máquina cadastrada</div>
            <p style={est.vazioTexto}>
              Enquanto o cadastro estiver vazio, o celular segue com o campo de
              texto livre. Traga de uma vez as máquinas que as conferências já
              usaram — uma grafia por máquina — ou cadastre abaixo.
            </p>
            <div style={est.vazioAcoes}>
              <button type="button" style={est.botaoPrimario} onClick={() => aplicar(semearMaquinasDasConferencias)} disabled={ocupado}>
                {ocupado ? 'Trazendo...' : 'Trazer das conferências'}
              </button>
            </div>
          </div>
        )}

        {maquinas?.length > 0 && (
          <div style={est.lista}>
            {maquinas.map((m, i) => (
              editando?.id === m.id ? (
                <form
                  key={m.id}
                  style={est.form}
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    if (await aplicar(() => atualizarMaquina(m.id, {
                      nome: editando.nome.trim(), grupoId: editando.grupoId || null,
                    }))) setEditando(null);
                  }}
                >
                  <input
                    type="text" value={editando.nome} maxLength={120} autoFocus
                    onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })}
                    style={est.input} aria-label={`Novo nome de ${m.nome}`}
                  />
                  <select
                    value={editando.grupoId}
                    onChange={(ev) => setEditando({ ...editando, grupoId: ev.target.value })}
                    style={est.input} aria-label={`Grupo de ${m.nome}`}
                  >
                    <option value="">Sem grupo</option>
                    {grupos.map((g) => <option key={g.id} value={g.id}>{rotuloGrupo(g)}</option>)}
                  </select>
                  <span style={est.dica}>
                    Renomear vale para as próximas medições; as antigas continuam com o
                    nome gravado.
                  </span>
                  <div style={est.formAcoes}>
                    <button type="button" style={est.botaoTexto} onClick={() => setEditando(null)}>Cancelar</button>
                    <button type="submit" style={est.botaoPrimario} disabled={ocupado || !editando.nome.trim()}>
                      {ocupado ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              ) : (
                <div key={m.id}>
                  {/* Cabecalho quando o grupo muda: a API entrega ordenado
                      por codigo de grupo, entao o titulo sai uma vez por bloco. */}
                  {(m.grupo_id || null) !== (maquinas[i - 1]?.grupo_id || null) && (
                    <div style={est.grupoTitulo}>
                      {m.grupo_codigo ? `${m.grupo_codigo} · ${m.grupo_nome}` : 'Sem grupo'}
                    </div>
                  )}
                  <div style={{ ...est.linha, ...(m.ativa ? {} : est.linhaInativa) }}>
                    <div style={est.linhaCorpo}>
                      <span style={est.linhaRotulo}>{m.nome}</span>
                      {!m.ativa && <span style={est.seloInativo}>Desativada</span>}
                    </div>
                    <div style={est.linhaBotoes}>
                      <button
                        type="button" style={est.botaoTexto}
                        onClick={() => setEditando({ id: m.id, nome: m.nome, grupoId: m.grupo_id || '' })}
                        aria-label={`Editar ${m.nome}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button" style={est.botaoTexto} disabled={ocupado}
                        onClick={() => aplicar(() => atualizarMaquina(m.id, { ativa: !m.ativa }))}
                        aria-label={`${m.ativa ? 'Desativar' : 'Reativar'} ${m.nome}`}
                      >
                        {m.ativa ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        type="button" style={est.botaoTexto} disabled={ocupado}
                        onClick={() => aplicar(() => removerMaquina(m.id))}
                        aria-label={`Excluir ${m.nome}`}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        {!naoCarregou && maquinas != null && (
          <form style={est.novaLinha} onSubmit={criar}>
            <input
              type="text" value={novoNome} maxLength={120}
              onChange={(ev) => setNovoNome(ev.target.value)}
              placeholder="Ex: Furadeira 21"
              style={{ ...est.input, flex: 1.4 }}
              aria-label="Nome da nova máquina"
            />
            <select
              value={novoGrupoId}
              onChange={(ev) => setNovoGrupoId(ev.target.value)}
              style={{ ...est.input, flex: 1 }}
              aria-label="Grupo da nova máquina"
            >
              <option value="">Sem grupo</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{rotuloGrupo(g)}</option>)}
            </select>
            <button type="submit" style={est.botaoSecundario} disabled={ocupado || !novoNome.trim()}>
              + Cadastrar
            </button>
          </form>
        )}

        {erro && <div style={est.erro} role="alert">{erro}</div>}

        {naoCarregou && (
          <button type="button" style={est.botaoSecundario} onClick={recarregar} disabled={ocupado}>
            Tentar de novo
          </button>
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

const t = claro;

const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  caixa: {
    width: '100%', maxWidth: 620, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },

  bloco: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  blocoRotulo: rotulo(t.textoFraco),
  linhaGrupo: { display: 'flex', alignItems: 'center', gap: espaco.md },
  codigoGrupo: {
    padding: '1px 8px', borderRadius: raio.sm, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoMedio, ...tipo('micro'), letterSpacing: 1,
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  formGrupo: { display: 'flex', gap: espaco.sm, alignItems: 'center' },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },
  vazioAcoes: { display: 'flex', gap: espaco.md, flexWrap: 'wrap', marginTop: espaco.sm },

  lista: { display: 'flex', flexDirection: 'column', gap: espaco.sm },
  grupoTitulo: { ...rotulo(t.textoFraco), margin: `${espaco.sm}px 0 ${espaco.xs}px` },
  linha: {
    display: 'flex', alignItems: 'center', gap: espaco.md,
    padding: `${espaco.sm}px ${espaco.md}px`, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // Desativada continua legivel: ela ainda nomeia conferencia antiga.
  linhaInativa: { opacity: 0.62 },
  linhaCorpo: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: espaco.sm, flexWrap: 'wrap' },
  linhaRotulo: { ...tipo('corpoF'), color: t.texto },
  seloInativo: {
    padding: '1px 6px', borderRadius: raio.pill, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'),
  },
  linhaBotoes: { display: 'flex', gap: espaco.md, flexShrink: 0, alignItems: 'center' },

  form: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  novaLinha: { display: 'flex', gap: espaco.md, alignItems: 'center' },
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic', margin: 0 },
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
