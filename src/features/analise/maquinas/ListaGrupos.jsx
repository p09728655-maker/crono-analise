/**
 * A COLUNA DOS GRUPOS, a' esquerda: escolher, criar, renomear, excluir.
 *
 * Escolher um grupo aqui filtra a lista da direita E ja' entra como grupo
 * da proxima maquina cadastrada — e' o que tira a lista suspensa do
 * caminho quando se cadastram oito furadeiras seguidas.
 *
 * As acoes de um grupo ficam ENCOSTADAS nele, e nao soltas no fim da
 * coluna: ali embaixo liam-se como acao do ultimo item da lista — que e'
 * outro grupo.
 */
import { Fragment, useState } from 'react';
import { atualizarGrupoMaquina, criarGrupoMaquina, removerGrupoMaquina } from '../../../lib/api.js';
import { SEM_GRUPO, TODAS, contarMaquinas, proximoCodigo } from './grupos.js';
import { est } from './estilos.js';

export default function ListaGrupos({
  grupos, lista, escolhido, aoEscolher, ocupado, aplicar, excluindoGrupo, setExcluindoGrupo,
}) {
  const [editandoGrupo, setEditandoGrupo] = useState(null); // {id, codigo, nome}
  const [novoGrupo, setNovoGrupo] = useState(null);         // {codigo, nome} | null

  const contar = (id) => contarMaquinas(lista, id);

  return (
    <nav style={est.lateral} aria-label="Grupos de máquina">
      <span style={est.blocoRotulo}>Grupos</span>

      {[{ id: TODAS, rotulo: 'Todas' }].map((it) => (
        <ItemGrupo
          key={it.id} rotulo={it.rotulo} contador={contar(it.id)}
          ativo={escolhido === it.id} aoEscolher={() => aoEscolher(it.id)}
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
          <Fragment key={g.id}>
            <ItemGrupo
              codigo={g.codigo} rotulo={g.nome} contador={contar(g.id)}
              ativo={escolhido === g.id} aoEscolher={() => aoEscolher(g.id)}
            />
            {escolhido === g.id && (
              <div style={est.acoesGrupo}>
                <button
                  type="button" style={est.botaoTexto}
                  aria-label={`Editar grupo ${g.nome}`}
                  onClick={() => setEditandoGrupo({ id: g.id, codigo: g.codigo, nome: g.nome })}
                >
                  Editar grupo
                </button>
                {excluindoGrupo ? (
                  <>
                    <button
                      type="button" style={est.botaoPerigo} disabled={ocupado}
                      aria-label={`Confirmar exclusão do grupo ${g.nome}`}
                      onClick={async () => {
                        if (await aplicar(() => removerGrupoMaquina(g.id))) {
                          setExcluindoGrupo(false);
                          aoEscolher(TODAS);
                        }
                      }}
                    >
                      Excluir grupo
                    </button>
                    <button type="button" style={est.botaoTexto} onClick={() => setExcluindoGrupo(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  /* Excluir grupo solta TODAS as máquinas dele de uma
                     vez: pergunta antes, como a exclusão de máquina. */
                  <button
                    type="button" style={est.botaoExcluir} disabled={ocupado}
                    aria-label={`Excluir grupo ${g.nome}`}
                    title="As máquinas do grupo não são apagadas: ficam sem grupo"
                    onClick={() => setExcluindoGrupo(true)}
                  >
                    Excluir grupo
                  </button>
                )}
              </div>
            )}
            {excluindoGrupo && escolhido === g.id && (
              <p style={est.avisoGrupo}>
                As {contar(g.id)} máquinas de {g.nome} não são apagadas — ficam sem grupo.
              </p>
            )}
          </Fragment>
        )
      ))}

      <ItemGrupo
        rotulo="Sem grupo" contador={contar(SEM_GRUPO)}
        ativo={escolhido === SEM_GRUPO} aoEscolher={() => aoEscolher(SEM_GRUPO)}
      />

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
          onClick={() => setNovoGrupo({ codigo: proximoCodigo(grupos), nome: '' })}
        >
          + Novo grupo
        </button>
      )}
    </nav>
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
