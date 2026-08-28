import { useEffect, useState } from 'react';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import {
  atualizarMaquina, criarMaquina, listarMaquinas, removerMaquina, semearMaquinasDasConferencias,
} from '../../lib/api.js';
import { adotarMaquinas } from '../../lib/maquinas.js';

/**
 * CADASTRO DE MAQUINAS — trabalho de PC.
 *
 * Maquina era texto livre no celular, e o mesmo posto saia escrito de tres
 * jeitos ("Furadeira 16", "furadeira 16", "Furadeira  16"). O agrupamento
 * normalizado juntou o historico; este cadastro ataca a CAUSA: com a lista
 * preenchida, o celular passa a OFERECER as maquinas e digitar vira excecao.
 *
 * Decisoes que a tela expoe de proposito:
 *  - Maquina com conferencia registrada nao se exclui, se DESATIVA: some
 *    da escolha do celular e continua nomeando o historico. O servidor
 *    recusa a exclusao e explica.
 *  - Renomear vale para as PROXIMAS medicoes; as antigas ficam com o nome
 *    gravado — a dica diz isso antes de a pessoa descobrir sozinha.
 *  - "Trazer das conferencias" preenche o cadastro com o que o banco ja'
 *    sabe, uma grafia por maquina — ninguem redigita o proprio historico.
 */
export default function Maquinas({ aoFechar }) {
  const [maquinas, setMaquinas] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState(null);   // {id, nome, grupo} em edicao
  const [novoNome, setNovoNome] = useState('');
  const [novoGrupo, setNovoGrupo] = useState('');

  // Falha de carga deixa null: "nenhuma cadastrada" e "nao deu para saber"
  // sao afirmacoes diferentes (mesma decisao do cadastro de motivos).
  useEffect(() => {
    listarMaquinas()
      .then((lista) => setMaquinas(lista))
      .catch((e) => setErro(e.message));
  }, []);

  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try {
      await fn();
      const lista = await listarMaquinas();
      setMaquinas(lista);
      adotarMaquinas(lista);
    } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const recarregar = () => aplicar(() => Promise.resolve());

  async function criar(ev) {
    ev.preventDefault();
    if (!novoNome.trim()) return;
    // O grupo fica preenchido de proposito: cadastrar as furadeiras em
    // sequencia nao deve exigir redigitar "Furadeiras" a cada uma.
    if (await aplicar(() => criarMaquina({ nome: novoNome.trim(), grupo: novoGrupo.trim() }))) setNovoNome('');
  }

  // Grupos ja usados — viram sugestao nos campos de grupo (datalist).
  const grupos = [...new Set((maquinas || []).map((m) => m.grupo).filter(Boolean))];

  const naoCarregou = maquinas == null && erro;
  const vazio = maquinas?.length === 0;

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de máquinas">
      <div style={est.caixa}>
        <h2 style={est.titulo}>Máquinas</h2>
        <p style={est.texto}>
          A lista que o celular oferece no Ritmo da furadeira. Com ela preenchida,
          o nome sai igual em toda medição — e as referências por peça somam sem
          depender de digitação. O <strong>grupo</strong> ("Furadeiras",
          "Seccionadoras") organiza a escolha no celular e prepara a leitura por
          grupo nos relatórios.
        </p>

        {maquinas == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

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
                      nome: editando.nome.trim(), grupo: editando.grupo.trim(),
                    }))) setEditando(null);
                  }}
                >
                  <input
                    type="text" value={editando.nome} maxLength={120} autoFocus
                    onChange={(ev) => setEditando({ ...editando, nome: ev.target.value })}
                    style={est.input} aria-label={`Novo nome de ${m.nome}`}
                  />
                  <input
                    type="text" value={editando.grupo} maxLength={60} list="grupos-maquina"
                    placeholder="Grupo (ex: Furadeiras) — vazio tira do grupo"
                    onChange={(ev) => setEditando({ ...editando, grupo: ev.target.value })}
                    style={est.input} aria-label={`Grupo de ${m.nome}`}
                  />
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
                  {/* Cabecalho quando o grupo muda: a API ja entrega ordenado
                      por grupo, entao o titulo aparece uma vez por bloco. */}
                  {(m.grupo || null) !== (maquinas[i - 1]?.grupo || null) && (
                    <div style={est.grupoTitulo}>{m.grupo || 'Sem grupo'}</div>
                  )}
                  <div style={{ ...est.linha, ...(m.ativa ? {} : est.linhaInativa) }}>
                  <div style={est.linhaCorpo}>
                    <span style={est.linhaRotulo}>{m.nome}</span>
                    {!m.ativa && <span style={est.seloInativo}>Desativada</span>}
                  </div>
                  <div style={est.linhaBotoes}>
                    <button
                      type="button" style={est.botaoTexto}
                      onClick={() => setEditando({ id: m.id, nome: m.nome, grupo: m.grupo || '' })}
                      aria-label={`Renomear ${m.nome}`}
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
            <input
              type="text" value={novoGrupo} maxLength={60} list="grupos-maquina"
              onChange={(ev) => setNovoGrupo(ev.target.value)}
              placeholder="Grupo (ex: Furadeiras)"
              style={{ ...est.input, flex: 1 }}
              aria-label="Grupo da nova máquina"
            />
            <datalist id="grupos-maquina">
              {grupos.map((g) => <option key={g} value={g} />)}
            </datalist>
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
    width: '100%', maxWidth: 560, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: 0, color: t.textoMedio },

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
