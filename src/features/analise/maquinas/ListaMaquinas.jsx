/**
 * AS MAQUINAS DO GRUPO, a' direita: cadastrar, buscar, editar, desativar.
 *
 * O CADASTRO FICA NO TOPO, nao no fim da lista: cadastrar era rolar
 * quarenta linhas ate' achar o campo. E o grupo vem da coluna da esquerda
 * — o seletor so' aparece em "Todas".
 *
 * Maquina com conferencia registrada nao se exclui, se DESATIVA: o
 * servidor recusa a exclusao e explica. Renomear vale para as PROXIMAS
 * medicoes; as antigas ficam com o nome gravado — a dica diz isso antes de
 * a pessoa descobrir sozinha.
 */
import { useEffect, useRef, useState } from 'react';
import { atualizarMaquina, criarMaquina, removerMaquina } from '../../../lib/api.js';
import { nomeChave } from '../../../domain/cronoanalise.js';
import { SEM_GRUPO, TODAS, grupoParaCadastrar, rotuloGrupo, temContexto } from './grupos.js';
import { est } from './estilos.js';

export default function ListaMaquinas({
  lista, grupos, escolhido, busca, setBusca, ocupado, aplicar, excluindo, setExcluindo,
}) {
  const [editando, setEditando] = useState(null);      // {id, nome, grupoId}
  const [novoNome, setNovoNome] = useState('');
  const [novoGrupoId, setNovoGrupoId] = useState('');  // so' vale em "Todas"
  // Nome da maquina recem-cadastrada: e' por ele que a linha nova e'
  // trazida para a parte visivel da lista.
  const [recemCriada, setRecemCriada] = useState(null);
  const listaRef = useRef(null);

  const grupoDoCadastro = grupoParaCadastrar(escolhido, novoGrupoId);
  const grupoAtual = grupos.find((g) => g.id === escolhido) || null;

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

  async function criar(ev) {
    ev.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    if (await aplicar(() => criarMaquina({ nome, grupoId: grupoDoCadastro }))) {
      setNovoNome('');
      /**
       * A BUSCA SAI DO CAMINHO depois de cadastrar.
       *
       * Com o filtro ligado, a maquina recem-criada podia nao casar com ele
       * e simplesmente nao aparecer: o campo limpava (sinal de que deu
       * certo) e a linha nao existia em lugar nenhum da tela. Quem cadastra
       * conclui que falhou, cadastra de novo e leva "Ja existe esta maquina
       * no cadastro".
       */
      setBusca('');
      setRecemCriada(nome);
    }
  }

  /**
   * Leva a linha recem-criada para a parte visivel da lista.
   *
   * A lista rola dentro da caixa: num grupo com trinta maquinas, a nova
   * nascia abaixo do fim visivel e o usuario tinha de rolar para conferir
   * se entrou — metade do problema que este redesenho veio resolver.
   */
  useEffect(() => {
    if (!recemCriada) return;
    const alvoLinha = listaRef.current?.querySelector(`[data-maquina="${CSS.escape(recemCriada)}"]`);
    alvoLinha?.scrollIntoView({ block: 'nearest' });
    setRecemCriada(null);
  }, [recemCriada, lista]);

  return (
    <section style={est.painel} aria-label="Máquinas do grupo">
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

      {(lista.length > 8 || busca !== '') && (
        <input
          type="search" value={busca} onChange={(ev) => setBusca(ev.target.value)}
          placeholder="Buscar máquina pelo nome" style={est.input} aria-label="Buscar máquina"
        />
      )}

      <div style={est.listaMaquinas} ref={listaRef}>
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
              <div
                style={{ ...est.linha, ...(m.ativa ? {} : est.linhaInativa) }}
                data-maquina={m.nome}
              >
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
  );
}
