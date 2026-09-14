import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { claro } from '../../theme/tokensAnalise.js';
import { elevacao, espaco, raio, rotulo, tipo } from '../../theme/escala.js';
import { LOGO_PATRIMAR } from '../../theme/logo.js';
import { VERSAO } from '../../versao.js';
import {
  atualizarGrupoMaquina, atualizarMaquina, criarGrupoMaquina, criarMaquina,
  listarCadastroMaquinas, removerGrupoMaquina, removerMaquina, semearMaquinasDasConferencias,
} from '../../lib/api.js';
import { nomeChave } from '../../domain/cronoanalise.js';
import { adotarMaquinas } from '../../lib/maquinas.js';

/** Itens da coluna da esquerda que nao sao grupo do cadastro. */
const TODAS = '__todas';
const SEM_GRUPO = '__sem_grupo';
/** O escolhido carrega contexto de grupo? ("Todas" nao carrega.) */
const temContexto = (id) => id !== TODAS;
/**
 * O grupo que a nova maquina recebe.
 *
 * "Sem grupo" e "Todas" NAO sao grupos do cadastro — sao filtros. Mandar o
 * id falso deles para a API daria erro de validacao no lugar de cadastrar
 * a maquina sem grupo, que e' o que a pessoa pediu.
 */
function grupoParaCadastrar(escolhido, doSeletor) {
  if (escolhido === TODAS) return doSeletor || null;
  if (escolhido === SEM_GRUPO) return null;
  return escolhido;
}

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

  /**
   * O GRUPO ESCOLHIDO na coluna da esquerda manda em tudo: filtra a lista
   * e ja' entra como grupo da proxima maquina cadastrada. E' o que tira a
   * lista suspensa do caminho — cadastrar oito furadeiras deixa de ser oito
   * idas ao seletor.
   */
  const [escolhido, setEscolhido] = useState(TODAS);
  const [busca, setBusca] = useState('');

  const [editando, setEditando] = useState(null);           // {id, nome, grupoId}
  const [editandoGrupo, setEditandoGrupo] = useState(null); // {id, codigo, nome}
  const [excluindo, setExcluindo] = useState(null);         // id da maquina a confirmar
  const [novoNome, setNovoNome] = useState('');
  const [novoGrupoId, setNovoGrupoId] = useState('');       // so' vale em "Todas"
  const [novoGrupo, setNovoGrupo] = useState(null);         // {codigo, nome} | null

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

  const grupoDoCadastro = grupoParaCadastrar(escolhido, novoGrupoId);

  async function criar(ev) {
    ev.preventDefault();
    if (!novoNome.trim()) return;
    if (await aplicar(() => criarMaquina({ nome: novoNome.trim(), grupoId: grupoDoCadastro }))) {
      setNovoNome('');
    }
  }

  // Sugestao do proximo codigo livre: maior codigo numerico + 1, com zeros.
  const proximoCodigo = () => {
    const maior = grupos.reduce((acc, g) => Math.max(acc, parseInt(g.codigo, 10) || 0), 0);
    return String(maior + 1).padStart(4, '0');
  };

  const rotuloGrupo = (g) => `${g.codigo} · ${g.nome}`;
  const naoCarregou = maquinas == null && erro;
  const vazio = maquinas?.length === 0;

  const lista = maquinas || [];
  const contar = (id) => (id === TODAS
    ? lista.length
    : lista.filter((m) => (id === SEM_GRUPO ? !m.grupo_id : m.grupo_id === id)).length);

  /**
   * A busca ignora caixa, acento e espaco repetido — a mesma chave que
   * agrupa medicao por nome. Quem procura "furadeira 4" tem de achar
   * "FURADEIRA 04"? Nao: o numero e' outro. Mas "furadeira" acha todas.
   */
  const alvo = nomeChave(busca);
  const visiveis = lista.filter((m) => {
    const doGrupo = escolhido === TODAS
      || (escolhido === SEM_GRUPO ? !m.grupo_id : m.grupo_id === escolhido);
    return doGrupo && (!alvo || nomeChave(m.nome).includes(alvo));
  });

  const grupoAtual = grupos.find((g) => g.id === escolhido) || null;

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de máquinas">
      {/* Estado de mouse por classe: estilo inline nao faz :hover. O grupo
          aberto fica de fora — ele ja' esta' marcado, e escurecer por cima
          confundiria "aqui" com "por cima". */}
      <style>{`
        .item-grupo:not([aria-current]):hover { background: ${t.papel}; color: ${t.texto}; }
      `}</style>
      <div style={est.caixa}>
        <header style={est.topo}>
          <div>
            <h2 style={est.titulo}>Máquinas</h2>
            <p style={est.texto}>
              A lista que o celular oferece na medição. Com ela preenchida, o nome sai
              igual em toda medição — e os <strong>grupos</strong> (código da fábrica:
              0002 FURADEIRA) organizam a escolha e a leitura dos relatórios.
            </p>
          </div>
          {maquinas?.length > 0 && (
            <button type="button" style={est.botaoSecundario} onClick={() => window.print()}>
              Imprimir
            </button>
          )}
        </header>

        {maquinas == null && !erro && <p style={est.texto}>Carregando cadastro...</p>}

        {vazio && !naoCarregou && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhuma máquina cadastrada</div>
            <p style={est.vazioTexto}>
              Enquanto o cadastro estiver vazio, o celular segue com o campo de texto
              livre. Traga de uma vez as máquinas que as conferências já usaram — uma
              grafia por máquina — ou cadastre ao lado.
            </p>
            <div style={est.vazioAcoes}>
              <button
                type="button" style={est.botaoPrimario} disabled={ocupado}
                onClick={() => aplicar(semearMaquinasDasConferencias)}
              >
                {ocupado ? 'Trazendo...' : 'Trazer das conferências'}
              </button>
            </div>
          </div>
        )}

        {maquinas != null && (
          <div style={est.colunas}>
            {/* ---------------------------------------- grupos, à esquerda */}
            <nav style={est.lateral} aria-label="Grupos de máquina">
              <span style={est.blocoRotulo}>Grupos</span>

              {[{ id: TODAS, rotulo: 'Todas' }].map((it) => (
                <ItemGrupo
                  key={it.id} rotulo={it.rotulo} contador={contar(it.id)}
                  ativo={escolhido === it.id} aoEscolher={() => setEscolhido(it.id)}
                />
              ))}

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
                      type="text" value={editandoGrupo.codigo} maxLength={10} style={est.inputCodigo}
                      onChange={(ev) => setEditandoGrupo({ ...editandoGrupo, codigo: ev.target.value })}
                      aria-label={`Código do grupo ${g.nome}`} inputMode="numeric"
                    />
                    <input
                      type="text" value={editandoGrupo.nome} maxLength={60} style={est.input}
                      onChange={(ev) => setEditandoGrupo({ ...editandoGrupo, nome: ev.target.value })}
                      aria-label={`Nome do grupo ${g.nome}`} autoFocus
                    />
                    <div style={est.formGrupoAcoes}>
                      <button type="button" style={est.botaoTexto} onClick={() => setEditandoGrupo(null)}>
                        Cancelar
                      </button>
                      <button type="submit" style={est.botaoPrimario} disabled={ocupado || !editandoGrupo.nome.trim()}>
                        Salvar
                      </button>
                    </div>
                  </form>
                ) : (
                  <ItemGrupo
                    key={g.id} codigo={g.codigo} rotulo={g.nome} contador={contar(g.id)}
                    ativo={escolhido === g.id} aoEscolher={() => setEscolhido(g.id)}
                  />
                )
              ))}

              <ItemGrupo
                rotulo="Sem grupo" contador={contar(SEM_GRUPO)}
                ativo={escolhido === SEM_GRUPO} aoEscolher={() => setEscolhido(SEM_GRUPO)}
              />

              {/* As ações do grupo ficam com o grupo ABERTO, não em cada
                  linha: seis grupos × dois botões viravam doze links
                  disputando com os nomes. */}
              {grupoAtual && !editandoGrupo && (
                <div style={est.acoesGrupo}>
                  <button
                    type="button" style={est.botaoTexto}
                    onClick={() => setEditandoGrupo({ id: grupoAtual.id, codigo: grupoAtual.codigo, nome: grupoAtual.nome })}
                  >
                    Editar grupo
                  </button>
                  <button
                    type="button" style={est.botaoTexto} disabled={ocupado}
                    title="As máquinas do grupo não são apagadas: ficam sem grupo"
                    onClick={async () => {
                      if (await aplicar(() => removerGrupoMaquina(grupoAtual.id))) setEscolhido(TODAS);
                    }}
                  >
                    Excluir grupo
                  </button>
                </div>
              )}

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
                    type="text" value={novoGrupo.codigo} maxLength={10} style={est.inputCodigo}
                    onChange={(ev) => setNovoGrupo({ ...novoGrupo, codigo: ev.target.value })}
                    aria-label="Código do novo grupo" inputMode="numeric"
                  />
                  <input
                    type="text" value={novoGrupo.nome} maxLength={60} style={est.input}
                    onChange={(ev) => setNovoGrupo({ ...novoGrupo, nome: ev.target.value })}
                    placeholder="Ex: FURADEIRA" aria-label="Nome do novo grupo" autoFocus
                  />
                  <div style={est.formGrupoAcoes}>
                    <button type="button" style={est.botaoTexto} onClick={() => setNovoGrupo(null)}>Cancelar</button>
                    <button type="submit" style={est.botaoPrimario} disabled={ocupado || !novoGrupo.nome.trim()}>
                      Criar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button" style={est.botaoNovoGrupo}
                  onClick={() => setNovoGrupo({ codigo: proximoCodigo(), nome: '' })}
                >
                  + Novo grupo
                </button>
              )}
            </nav>

            {/* -------------------------------- máquinas do grupo, à direita */}
            <section style={est.painel} aria-label="Máquinas do grupo">
              {/* O CADASTRO FICA NO TOPO, não no fim da lista: cadastrar era
                  rolar quarenta linhas até achar o campo. E o grupo vem da
                  coluna da esquerda — o seletor só aparece em "Todas". */}
              <form style={est.novaLinha} onSubmit={criar}>
                <input
                  type="text" value={novoNome} maxLength={120}
                  onChange={(ev) => setNovoNome(ev.target.value)}
                  placeholder="Ex: FURADEIRA 21"
                  style={{ ...est.input, flex: 1 }}
                  aria-label="Nome da nova máquina"
                />
                {temContexto(escolhido) ? (
                  <span style={est.destinoCadastro}>
                    em <strong>{grupoAtual ? rotuloGrupo(grupoAtual) : 'Sem grupo'}</strong>
                  </span>
                ) : (
                  <select
                    value={novoGrupoId}
                    onChange={(ev) => setNovoGrupoId(ev.target.value)}
                    style={{ ...est.input, width: 190 }}
                    aria-label="Grupo da nova máquina"
                  >
                    <option value="">Sem grupo</option>
                    {grupos.map((g) => <option key={g.id} value={g.id}>{rotuloGrupo(g)}</option>)}
                  </select>
                )}
                <button type="submit" style={est.botaoPrimario} disabled={ocupado || !novoNome.trim()}>
                  + Cadastrar
                </button>
              </form>

              {lista.length > 8 && (
                <input
                  type="search" value={busca} onChange={(ev) => setBusca(ev.target.value)}
                  placeholder="Buscar máquina pelo nome" style={est.input} aria-label="Buscar máquina"
                />
              )}

              <div style={est.listaMaquinas}>
                {visiveis.length === 0 && lista.length > 0 && (
                  <p style={est.dica}>
                    {alvo
                      ? `Nenhuma máquina com "${busca.trim()}" ${escolhido === TODAS ? 'no cadastro' : 'neste grupo'}.`
                      : 'Nenhuma máquina neste grupo ainda — cadastre acima.'}
                  </p>
                )}

                {visiveis.map((m, i) => (
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
                      {/* Em "Todas", o grupo volta como cabeçalho: sem ele a
                          lista corrida não diz de quem é cada máquina. */}
                      {escolhido === TODAS
                        && (m.grupo_id || null) !== (visiveis[i - 1]?.grupo_id || null) && (
                        <div style={est.grupoTitulo}>
                          {m.grupo_codigo ? `${m.grupo_codigo} · ${m.grupo_nome}` : 'Sem grupo'}
                        </div>
                      )}
                      <div style={{ ...est.linha, ...(m.ativa ? {} : est.linhaInativa) }}>
                        <span style={est.linhaRotulo}>{m.nome}</span>
                        {!m.ativa && <span style={est.seloInativo}>Desativada</span>}
                        <div style={est.linhaBotoes}>
                          {excluindo === m.id ? (
                            <>
                              <span style={est.dica}>Excluir do cadastro?</span>
                              <button
                                type="button" style={est.botaoPerigo} disabled={ocupado}
                                onClick={async () => {
                                  if (await aplicar(() => removerMaquina(m.id))) setExcluindo(null);
                                }}
                              >
                                Excluir
                              </button>
                              <button type="button" style={est.botaoTexto} onClick={() => setExcluindo(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
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
                              {/* Excluir pede confirmação: a lista ficou mais
                                  densa, e o clique errado aqui apaga cadastro. */}
                              <button
                                type="button" style={est.botaoExcluir} disabled={ocupado}
                                onClick={() => setExcluindo(m.id)}
                                aria-label={`Excluir ${m.nome}`}
                              >
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </section>
          </div>
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

      {maquinas?.length > 0 && <ImpressaoCadastro grupos={grupos} maquinas={maquinas} />}
    </div>
  );
}

/** Um grupo na coluna da esquerda: código, nome e quantas máquinas tem. */
function ItemGrupo({ codigo, rotulo: nome, contador, ativo, aoEscolher }) {
  return (
    <button
      type="button"
      className="item-grupo"
      style={{ ...est.itemGrupo, ...(ativo ? est.itemGrupoAtivo : {}) }}
      aria-current={ativo ? 'true' : undefined}
      onClick={aoEscolher}
    >
      {codigo && <span style={est.codigoGrupo}>{codigo}</span>}
      <span style={est.itemGrupoNome}>{nome}</span>
      <span style={est.itemGrupoContador}>{contador}</span>
    </button>
  );
}

/**
 * CADASTRO DE MAQUINAS IMPRESSO — documento proprio, A4.
 *
 * Sai pelo botao Imprimir da propria tela: cada grupo com seu codigo e
 * suas maquinas, com a situacao — para conferir com o ERP ou fixar no
 * quadro. Vai num PORTAL para o body porque esta tela e' um modal sobre a
 * lista de estudos, que nao tem versao de impressao: enquanto o cadastro
 * esta' aberto, um estilo esconde o resto do app no papel — fechou, tudo
 * volta ao normal.
 */
function ImpressaoCadastro({ grupos, maquinas }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const ativas = maquinas.filter((m) => m.ativa).length;

  return createPortal(
    <div className="somente-impressao" style={impc.folha}>
      <style>{'@media print { #raiz { display: none !important } }'}</style>

      <header style={impc.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={impc.logo} />
          <h1 style={impc.titulo}>Cadastro de Máquinas — Grupos e Máquinas</h1>
        </div>
        <div style={impc.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={impc.identificacao}>
        {[
          ['Grupos', String(grupos.length)],
          ['Máquinas', String(maquinas.length)],
          ['Ativas', String(ativas)],
          ['Desativadas', String(maquinas.length - ativas)],
        ].map(([k, v]) => (
          <div key={k} style={impc.campo}>
            <span style={impc.campoRotulo}>{k}</span>
            <span style={impc.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      <table style={impc.tabela}>
        <thead>
          <tr>
            <th style={impc.th}>Código</th>
            <th style={impc.th}>Grupo</th>
            <th style={impc.th}>Máquina</th>
            <th style={impc.th}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {maquinas.map((m) => (
            <tr key={m.id}>
              <td style={impc.tdCodigo}>{m.grupo_codigo || '—'}</td>
              <td style={impc.td}>{m.grupo_nome || 'Sem grupo'}</td>
              <td style={{ ...impc.td, fontWeight: 600 }}>{m.nome}</td>
              <td style={impc.td}>{m.ativa ? 'Ativa' : 'Desativada'}</td>
            </tr>
          ))}
          {/* Grupo ainda sem maquina tambem e' informacao: ele existe no
              cadastro e espera as maquinas dele. */}
          {grupos.filter((g) => !maquinas.some((m) => m.grupo_id === g.id)).map((g) => (
            <tr key={g.id}>
              <td style={impc.tdCodigo}>{g.codigo}</td>
              <td style={impc.td}>{g.nome}</td>
              <td style={{ ...impc.td, color: '#777', fontStyle: 'italic' }}>sem máquinas cadastradas</td>
              <td style={impc.td}>—</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={impc.nota}>
        Desativada: fora da escolha do celular, mas segue nomeando as conferências já
        registradas. Máquina usada só por texto livre (fora do cadastro) não aparece
        nesta folha — traga-a pelo botão "Trazer das conferências".
      </p>
    </div>,
    document.body,
  );
}

/* Estilos do papel — o mesmo padrao A4 das folhas do relatorio. */
const impc = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45,
           fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif" },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555', textAlign: 'right' },
  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5 },
  th: { textAlign: 'left', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  td: { padding: '3px 5px', borderBottom: '1px solid #DDD', verticalAlign: 'top' },
  tdCodigo: { padding: '3px 5px', borderBottom: '1px solid #DDD', fontFamily: "'Roboto Mono', 'Consolas', monospace", whiteSpace: 'nowrap' },
  nota: { margin: '10px 0 0', fontSize: 9, color: '#555', lineHeight: 1.5 },
};

const t = claro;

const est = {
  modal: {
    position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(15, 18, 22, 0.55)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: espaco.xl, overflowY: 'auto',
  },
  /**
   * A caixa nao cresce sem fim: ela para na altura da janela e quem rola e'
   * a LISTA, la' dentro. Antes, com 30 maquinas, o cadastro e a busca
   * subiam junto com o scroll e sumiam da tela — cadastrar exigia rolar de
   * volta ao fim da pagina toda vez.
   */
  caixa: {
    width: '100%', maxWidth: 940, maxHeight: 'calc(100dvh - 48px)',
    background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.lg,
    padding: espaco.xxl, boxShadow: elevacao.alta,
    display: 'flex', flexDirection: 'column', gap: espaco.lg,
  },
  topo: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: espaco.lg },
  titulo: { ...tipo('titulo'), margin: 0, color: t.texto },
  texto: { ...tipo('corpo'), margin: `${espaco.xs}px 0 0`, color: t.textoMedio, maxWidth: 620 },

  /* Duas colunas: grupos a esquerda, maquinas do grupo a direita. Em tela
     estreita elas empilham — a lateral vira uma faixa de grupos em cima. */
  colunas: {
    display: 'flex', gap: espaco.lg, alignItems: 'stretch',
    flexWrap: 'wrap', minHeight: 0, flex: 1,
  },
  lateral: {
    flex: '1 1 232px', maxWidth: 280, minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: espaco.md, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    alignSelf: 'flex-start',
  },
  blocoRotulo: { ...rotulo(t.textoFraco), padding: `${espaco.xs}px ${espaco.sm}px` },

  itemGrupo: {
    display: 'flex', alignItems: 'center', gap: espaco.sm, width: '100%',
    minHeight: 34, padding: `0 ${espaco.sm}px`, textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('corpo'), cursor: 'pointer', fontFamily: 'inherit',
  },
  // O grupo aberto e' o contexto de tudo o que aparece a' direita — e de
  // onde a proxima maquina vai nascer. Precisa ficar claro qual e'.
  itemGrupoAtivo: { background: t.papel, color: t.texto, fontWeight: 600, boxShadow: elevacao.baixa },
  itemGrupoNome: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemGrupoContador: { ...tipo('legenda'), color: t.textoFraco, flexShrink: 0 },
  codigoGrupo: {
    padding: '1px 6px', borderRadius: raio.sm, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), letterSpacing: 1, flexShrink: 0,
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },
  acoesGrupo: {
    display: 'flex', gap: espaco.md, flexWrap: 'wrap',
    padding: `${espaco.xs}px ${espaco.sm}px ${espaco.sm}px`,
  },
  botaoNovoGrupo: {
    marginTop: espaco.xs, minHeight: 34, padding: `0 ${espaco.sm}px`, textAlign: 'left',
    background: 'transparent', border: 'none', borderRadius: raio.sm,
    color: t.textoMedio, ...tipo('legenda'), fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  formGrupo: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.sm, background: t.papel, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  formGrupoAcoes: { display: 'flex', gap: espaco.md, alignItems: 'center', justifyContent: 'flex-end' },
  inputCodigo: {
    width: 90, minHeight: 36, padding: `0 ${espaco.sm}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), outline: 'none',
    fontFamily: "'Roboto Mono', 'Consolas', monospace",
  },

  painel: {
    flex: '3 1 420px', minWidth: 0,
    display: 'flex', flexDirection: 'column', gap: espaco.md,
  },
  /* O cadastro no TOPO e a lista rolando embaixo: e' o que faz cadastrar
     oito furadeiras seguidas ser oito digitacoes, e nada mais. */
  novaLinha: { display: 'flex', gap: espaco.sm, alignItems: 'center', flexWrap: 'wrap' },
  destinoCadastro: { ...tipo('legenda'), color: t.textoMedio, whiteSpace: 'nowrap' },
  listaMaquinas: {
    display: 'flex', flexDirection: 'column', gap: espaco.xs,
    overflowY: 'auto', minHeight: 0, maxHeight: '52dvh',
    paddingRight: espaco.xs,
  },
  grupoTitulo: { ...rotulo(t.textoFraco), margin: `${espaco.md}px 0 ${espaco.xs}px` },
  linha: {
    display: 'flex', alignItems: 'center', gap: espaco.sm,
    minHeight: 40, padding: `0 ${espaco.md}px`, background: t.fundo, borderRadius: raio.sm,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  // Desativada continua legivel: ela ainda nomeia conferencia antiga.
  linhaInativa: { opacity: 0.62 },
  linhaRotulo: {
    flex: 1, minWidth: 0, ...tipo('corpo'), color: t.texto,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  seloInativo: {
    padding: '1px 6px', borderRadius: raio.pill, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
    color: t.textoFraco, ...tipo('micro'), flexShrink: 0,
  },
  linhaBotoes: { display: 'flex', gap: espaco.md, flexShrink: 0, alignItems: 'center' },

  form: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.vermelho,
  },
  formAcoes: { display: 'flex', gap: espaco.md, justifyContent: 'flex-end', alignItems: 'center' },
  dica: { ...tipo('legenda'), color: t.textoFraco, fontStyle: 'italic', margin: 0 },
  input: {
    width: '100%', minHeight: 40, padding: `0 ${espaco.md}px`, background: t.papel,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda, borderRadius: raio.sm,
    color: t.texto, ...tipo('corpo'), fontFamily: 'inherit', outline: 'none',
  },

  vazio: {
    display: 'flex', flexDirection: 'column', gap: espaco.sm,
    padding: espaco.lg, background: t.fundo, borderRadius: raio.md,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.borda,
  },
  vazioTitulo: { ...tipo('corpoF'), color: t.texto },
  vazioTexto: { ...tipo('legenda'), color: t.textoMedio, margin: 0 },
  vazioAcoes: { display: 'flex', gap: espaco.md, flexWrap: 'wrap', marginTop: espaco.sm },

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
  // Excluir nao tem o mesmo peso de Editar: ele apaga cadastro, e so' pede
  // confirmacao depois do clique. Fica em cinza fraco, sem sublinhado.
  botaoExcluir: {
    minHeight: 32, padding: 0, background: 'transparent', border: 'none',
    color: t.textoFraco, ...tipo('legenda'), cursor: 'pointer', fontFamily: 'inherit',
  },
  botaoPerigo: {
    minHeight: 32, padding: `0 ${espaco.md}px`, background: t.critico,
    border: 'none', borderRadius: raio.sm, color: '#fff',
    ...tipo('legenda'), fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },

  erro: {
    padding: espaco.md, background: t.criticoFundo,
    borderWidth: 1, borderStyle: 'solid', borderColor: t.critico,
    borderRadius: raio.sm, ...tipo('legenda'), color: t.texto,
  },
  acoes: { display: 'flex', gap: espaco.md },
};
