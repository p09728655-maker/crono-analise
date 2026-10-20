import { useState } from 'react';
import { unidadeDoPosto } from '../../domain/cronoanalise.js';
import { atualizarProduto, criarProduto, removerProduto } from '../../lib/api.js';
import { espaco } from '../../theme/escala.js';
import { est, t } from './maquinas/estilos.js';
import { useCadastroMaquinas } from './maquinas/useCadastroMaquinas.js';

/**
 * O que o formulario manda de VOLUMES — validado ANTES de sair do navegador.
 *
 * O mesmo caminho que maquinas/nominal.js fecha: "2 caixas" digitado viraria
 * Number("2 caixas") = NaN, o JSON manda NaN como null, e null no servidor
 * e' "nao informado" — o numero sumiria com a tela dizendo que salvou.
 * Vazio continua sendo "nao informado" (e' como se diz "nao sei"); texto que
 * nao e' um numero inteiro e' ERRO, e nunca vira null nem 1 calado.
 */
export function lerVolumesDoFormulario(valor) {
  const texto = String(valor ?? '').trim();
  if (texto === '') return null;
  if (!/^\d+$/.test(texto)) {
    throw new Error(`"${texto}" não é um número inteiro: volumes é quantas caixas o produto leva na embalagem (ex: 1, 2 ou 3)`);
  }
  const n = Number(texto);
  if (n < 1 || n > 50) throw new Error('Volumes deve ficar entre 1 e 50 caixas — ou em branco, se não souber');
  return n;
}

/** "1 volume", "2 volumes". */
export const rotuloVolumes = (n) => `${n} ${Number(n) === 1 ? 'volume' : 'volumes'}`;

/**
 * Produto da EMBALAGEM sem os volumes: e' o que faz o takt do programa (em
 * volumes) nao entrar sozinho no estudo dele. Ausente (cache velho, servidor
 * sem a coluna) e' o mesmo que nulo. Desativado nao conta: ele nao vai mais
 * para o tablet nem para estudo novo.
 */
export const faltamVolumes = (produto, grupo) =>
  unidadeDoPosto(grupo?.nome).singular === 'volume'
  && produto?.ativo !== false && produto?.volumes == null;

/**
 * CADASTRO DE PRODUTOS — os que vao para cronoanalise, trabalho de PC.
 *
 * O produto era digitado no tablet a cada medicao, e o mesmo rack saia de
 * tres jeitos — linhas que nao somam no relatorio. Com o cadastro, o tablet
 * OFERECE a lista do grupo da maquina escolhida e digitar vira excecao
 * ("Outro produto...").
 *
 * Por GRUPO de maquina, como o programa da semana: o rack que a embalagem
 * fecha nao e' a lateral que a furadeira fura. A tela e' a do cadastro de
 * maquinas (mesmas cores, mesma moldura): grupos a esquerda, produtos do
 * grupo a direita, o cadastro no topo da lista.
 *
 * Decisoes que a tela expoe:
 *  - Produto com medicao registrada nao se exclui, se DESATIVA (o servidor
 *    recusa e explica): some do tablet, o historico fica com o nome certo.
 *  - Renomear vale para as PROXIMAS medicoes — as antigas guardam o nome
 *    com que foram gravadas. A dica diz isso no formulario.
 *  - O codigo e' o do ERP, opcional: e' como o resto da fabrica chama o
 *    produto, e e' a ponte para o ERP no BI.
 *  - VOLUMES (quantas caixas o produto leva na embalagem) e' opcional e
 *    vazio quer dizer "nao informado", nunca 1. Na embalagem, o produto
 *    ativo sem o numero ganha um destaque: e' ele que converte o programa
 *    (em volumes) para a unidade do estudo (produto).
 */
export default function Produtos({ aoFechar, grupoInicial = null }) {
  const { maquinas, grupos, produtos, erro, ocupado, aplicar, recarregar } = useCadastroMaquinas();
  const [escolhido, setEscolhido] = useState(grupoInicial);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [volumes, setVolumes] = useState('');
  const [editando, setEditando] = useState(null);   // { id, nome, codigo, volumes, grupoId }
  const [excluindo, setExcluindo] = useState(null); // id com a exclusao armada

  const carregando = maquinas == null && !erro;
  const naoCarregou = maquinas == null && Boolean(erro);
  const grupo = grupos.find((g) => g.id === escolhido) || grupos[0] || null;
  const doGrupo = (produtos || []).filter((p) => p.grupo_id === grupo?.id);
  const contar = (id) => (produtos || []).filter((p) => p.grupo_id === id && p.ativo !== false).length;

  const cadastrar = async (ev) => {
    ev.preventDefault();
    if (!grupo || !nome.trim()) return;
    // Os volumes sao lidos DENTRO do aplicar: a digitacao errada aparece no
    // mesmo lugar que o erro do servidor, e nada e' enviado.
    if (await aplicar(() => criarProduto({
      nome: nome.trim(), codigo: codigo.trim(), grupoId: grupo.id,
      volumes: lerVolumesDoFormulario(volumes),
    }))) {
      setNome('');
      setCodigo('');
      setVolumes('');
    }
  };

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de produtos">
      <style>{`
        .item-grupo:not([aria-current]):hover { background: #EDF0F3; color: ${t.texto}; }
      `}</style>
      <div style={est.caixa}>
        <header style={est.topo}>
          <div>
            <h2 style={est.titulo}>Produtos</h2>
            <p style={est.texto}>
              Os produtos que vão para cronoanálise, por grupo de máquina. O tablet oferece
              a lista do grupo da máquina escolhida: sem digitar, e com o mesmo nome em toda
              medição.
            </p>
          </div>
        </header>

        {carregando && <p style={est.texto}>Carregando cadastro...</p>}

        {!carregando && !naoCarregou && grupos.length === 0 && (
          <div style={est.vazio}>
            <div style={est.vazioTitulo}>Nenhum grupo de máquina cadastrado</div>
            <p style={est.vazioTexto}>
              Produto é sempre de um grupo (EMBALAGEM, FURADEIRA...). Cadastre os grupos em
              Ferramentas → Máquinas e volte aqui.
            </p>
          </div>
        )}

        {grupo && (
          <div style={est.colunas}>
            <nav style={est.lateral} aria-label="Grupos de máquina">
              <span style={est.blocoRotulo}>Grupos</span>
              {grupos.map((g) => {
                const ativo = g.id === grupo.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    className="item-grupo"
                    style={{ ...est.itemGrupo, ...(ativo ? est.itemGrupoAtivo : {}) }}
                    aria-current={ativo ? 'true' : undefined}
                    onClick={() => { setEscolhido(g.id); setEditando(null); setExcluindo(null); }}
                  >
                    <span style={est.codigoGrupo}>{g.codigo}</span>
                    <span style={est.itemGrupoNome}>{g.nome}</span>
                    <span style={est.itemGrupoContador}>{contar(g.id)}</span>
                  </button>
                );
              })}
            </nav>

            <section style={est.painel} aria-label={`Produtos do grupo ${grupo.nome}`}>
              {/* O cadastro no TOPO e a lista embaixo: cadastrar vinte
                  produtos seguidos e' digitar e dar Enter vinte vezes. */}
              <form style={est.novaLinha} onSubmit={cadastrar}>
                <input
                  type="text" value={nome} maxLength={120}
                  onChange={(ev) => setNome(ev.target.value)}
                  placeholder="Nome do produto (ex: Rack Sirius 1.6)"
                  aria-label="Nome do produto"
                  style={{ ...est.input, width: 'auto', flex: '2 1 220px' }}
                />
                <input
                  type="text" value={codigo} maxLength={30}
                  onChange={(ev) => setCodigo(ev.target.value)}
                  placeholder="Código no ERP (opcional)"
                  aria-label="Código do produto no ERP"
                  style={{ ...est.input, width: 'auto', flex: '1 1 140px' }}
                />
                {/* Volumes e o botao quebram JUNTOS: no painel do PC os
                    quatro nao cabem numa linha, e o Cadastrar sozinho
                    embaixo parecia esquecido. Cortar os textos de exemplo
                    dos campos para caber tirava a instrucao deles. */}
                <div style={loc.fimDaLinha}>
                  <CampoVolumes valor={volumes} aoMudar={setVolumes} />
                  <button type="submit" style={est.botaoPrimario} disabled={ocupado || !nome.trim()}>
                    Cadastrar
                  </button>
                </div>
              </form>
              <span style={est.destinoCadastro}>
                Vai para {grupo.codigo} · {grupo.nome}
              </span>
              <p style={est.dica}>
                Volumes = em quantas caixas o produto sai embalado (rack em 2 caixas = 2 volumes).
                A embalagem conta caixas e o estudo de tempos conta produtos: é este número que
                converte um no outro. Em branco = não informado.
              </p>

              {doGrupo.length === 0 ? (
                <p style={est.dica}>
                  Nenhum produto neste grupo. Sem produto cadastrado, o tablet segue com o
                  campo de texto livre.
                </p>
              ) : (
                <div style={est.listaMaquinas}>
                  {doGrupo.map((p) => (editando?.id === p.id ? (
                    <FormularioEdicao
                      key={p.id} produto={p} edicao={editando} setEdicao={setEditando}
                      grupos={grupos} ocupado={ocupado}
                      aoSalvar={async () => {
                        if (await aplicar(() => atualizarProduto(p.id, {
                          nome: editando.nome.trim(), codigo: editando.codigo.trim(), grupoId: editando.grupoId,
                          volumes: lerVolumesDoFormulario(editando.volumes),
                        }))) setEditando(null);
                      }}
                    />
                  ) : (
                    <div key={p.id} style={{ ...est.linha, ...(p.ativo ? {} : est.linhaInativa) }}>
                      <span style={est.linhaRotulo}>{p.nome}</span>
                      {p.codigo && <span style={est.seloNominal} title="Código no ERP">{p.codigo}</span>}
                      {p.volumes != null && (
                        <span style={est.seloNominal} title="Caixas do produto na embalagem">
                          {rotuloVolumes(p.volumes)}
                        </span>
                      )}
                      {faltamVolumes(p, grupo) && (
                        <span
                          style={loc.seloSemVolumes}
                          title="Sem os volumes, o takt do programa da embalagem (em volumes) não entra sozinho no estudo deste produto"
                        >
                          volumes não informados
                        </span>
                      )}
                      {!p.ativo && <span style={est.seloInativo}>Desativado</span>}
                      <div style={est.linhaBotoes}>
                        {excluindo === p.id ? (
                          <>
                            <button
                              type="button" style={est.botaoPerigo} disabled={ocupado}
                              onClick={async () => { if (await aplicar(() => removerProduto(p.id))) setExcluindo(null); }}
                            >
                              Confirmar exclusão
                            </button>
                            <button type="button" style={est.botaoTexto} onClick={() => setExcluindo(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button" style={est.botaoTexto} aria-label={`Editar ${p.nome}`}
                              onClick={() => setEditando({
                                id: p.id, nome: p.nome, codigo: p.codigo || '',
                                volumes: p.volumes == null ? '' : String(p.volumes), grupoId: p.grupo_id,
                              })}
                            >
                              Editar
                            </button>
                            <button
                              type="button" style={est.botaoTexto} disabled={ocupado}
                              aria-label={`${p.ativo ? 'Desativar' : 'Reativar'} ${p.nome}`}
                              onClick={() => aplicar(() => atualizarProduto(p.id, { ativo: !p.ativo }))}
                            >
                              {p.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                            <button
                              type="button" style={est.botaoExcluir} aria-label={`Excluir ${p.nome}`}
                              onClick={() => setExcluindo(p.id)}
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )))}
                </div>
              )}
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
    </div>
  );
}

/**
 * O campo de VOLUMES: numero inteiro pequeno, com o rotulo VISIVEL ao lado —
 * so' com placeholder, um "2" no campo nao diz de que e' o 2. inputMode
 * numeric abre o teclado de numeros no tablet; type=text (e nao number)
 * para o navegador nao engolir calado o que nao for numero: quem decide e'
 * lerVolumesDoFormulario, que avisa.
 */
function CampoVolumes({ valor, aoMudar }) {
  return (
    <label style={loc.campoVolumes}>
      <span style={est.destinoCadastro}>Volumes</span>
      <input
        type="text" inputMode="numeric" value={valor}
        onChange={(ev) => aoMudar(ev.target.value)}
        placeholder="—"
        aria-label="Volumes do produto"
        style={loc.inputVolumes}
      />
    </label>
  );
}

/** Editar um produto: nome, codigo, volumes e o grupo (produto cadastrado no posto errado muda de grupo). */
function FormularioEdicao({
  produto, edicao, setEdicao, grupos, ocupado, aoSalvar,
}) {
  return (
    <form
      style={est.form}
      onSubmit={(ev) => { ev.preventDefault(); aoSalvar(); }}
      aria-label={`Editar ${produto.nome}`}
    >
      <div style={est.formLinha}>
        <input
          type="text" value={edicao.nome} maxLength={120} autoFocus
          onChange={(ev) => setEdicao({ ...edicao, nome: ev.target.value })}
          aria-label="Nome do produto"
          style={{ ...est.input, width: 'auto', flex: '2 1 200px' }}
        />
        <input
          type="text" value={edicao.codigo} maxLength={30}
          onChange={(ev) => setEdicao({ ...edicao, codigo: ev.target.value })}
          placeholder="Código no ERP (opcional)"
          aria-label="Código do produto no ERP"
          style={{ ...est.input, width: 'auto', flex: '1 1 120px' }}
        />
        <CampoVolumes valor={edicao.volumes} aoMudar={(v) => setEdicao({ ...edicao, volumes: v })} />
        <select
          value={edicao.grupoId}
          onChange={(ev) => setEdicao({ ...edicao, grupoId: ev.target.value })}
          aria-label="Grupo do produto"
          style={{ ...est.input, width: 'auto', flex: '1 1 160px' }}
        >
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.codigo} · {g.nome}</option>)}
        </select>
      </div>
      <p style={est.dica}>
        Renomear vale para as próximas medições. As já registradas continuam com o nome com
        que foram gravadas.
      </p>
      <div style={est.formAcoes}>
        <button type="button" style={est.botaoTexto} onClick={() => setEdicao(null)}>Cancelar</button>
        <button type="submit" style={est.botaoPrimario} disabled={ocupado || !edicao.nome.trim()}>
          Salvar
        </button>
      </div>
    </form>
  );
}

/**
 * Estilos so' desta tela, por cima dos do cadastro de maquinas (estilos.js
 * e' a casa das duas telas; o que so' o produto tem fica aqui).
 */
const loc = {
  fimDaLinha: { display: 'flex', alignItems: 'center', gap: espaco.sm, flex: '0 0 auto' },
  campoVolumes: { display: 'flex', alignItems: 'center', gap: espaco.xs, flex: '0 0 auto' },
  inputVolumes: { ...est.input, width: 64, textAlign: 'center' },
  // Discreto, na cor de atencao e nao na de erro: falta um dado, nada quebrou.
  seloSemVolumes: { ...est.seloNominal, color: t.atencao, borderColor: t.atencao, background: t.atencaoFundo },
};
