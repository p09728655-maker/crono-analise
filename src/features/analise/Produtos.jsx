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
 * O grupo CONTA VOLUMES (a embalagem), e so' nele o numero tem uso: e' o
 * posto que conta caixa enquanto o estudo conta produto. Na furadeira o
 * toque ja' e' a peca — o campo ali so' seria ruido e altura na tela. A
 * mesma regra de unidadeDoPosto, pelo nome do grupo, que o tablet usa.
 */
export const grupoContaVolumes = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';

/**
 * Produto da EMBALAGEM sem os volumes: o takt do programa nao entra sozinho
 * no estudo dele e a medicao da linha fica em volumes, sem converter para
 * produto. Ausente (cache velho, servidor sem a coluna) e' o mesmo que
 * nulo. Desativado nao conta: ele nao vai mais para o tablet nem para
 * estudo novo.
 */
export const faltamVolumes = (produto, grupo) =>
  grupoContaVolumes(grupo) && produto?.ativo !== false && produto?.volumes == null;

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
 *  - VOLUMES (quantas caixas o produto leva) so' existe na tela nos grupos
 *    de EMBALAGEM: campo, selo e destaque. Vazio quer dizer "nao
 *    informado", nunca 1. O produto ativo sem o numero ganha um destaque:
 *    sem ele, o takt do programa e a medicao da linha nao viram produto.
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
  const contaVolumes = grupoContaVolumes(grupo);
  const doGrupo = (produtos || []).filter((p) => p.grupo_id === grupo?.id);
  const contar = (id) => (produtos || []).filter((p) => p.grupo_id === id && p.ativo !== false).length;

  const cadastrar = async (ev) => {
    ev.preventDefault();
    if (!grupo || !nome.trim()) return;
    // Os volumes sao lidos DENTRO do aplicar: a digitacao errada aparece no
    // mesmo lugar que o erro do servidor, e nada e' enviado. Fora da
    // embalagem eles nem vao: o que ficou digitado num grupo de embalagem
    // antes de trocar de grupo nao pode ir junto com um produto da furadeira.
    if (await aplicar(() => criarProduto({
      nome: nome.trim(), codigo: codigo.trim(), grupoId: grupo.id,
      ...(contaVolumes ? { volumes: lerVolumesDoFormulario(volumes) } : {}),
    }))) {
      setNome('');
      setCodigo('');
      setVolumes('');
    }
  };

  return (
    <div style={est.modal} role="dialog" aria-label="Cadastro de produtos">
      {/* A LISTA E' QUEM ROLA, no espaco que sobra. A moldura e' a do
          cadastro de maquinas, mas aqui o painel e' mais alto (volumes, a
          dica): com a lista de altura fixa (52dvh), num notebook 1366x768
          a barra do Fechar e o alerta caiam POR CIMA das ultimas linhas, e
          clicar Desativar no ultimo produto fechava o cadastro. Agora
          grupos e painel ficam na altura da caixa e a lista estica e encolhe
          entre o formulario e o rodape.
          Na tela estreita (celular) as colunas empilham e a altura de cada
          uma depende do conteudo: ali a CAIXA rola inteira, com o Fechar no
          fim. !important porque o inline ja' define as mesmas propriedades
          (mesma tecnica de EntrarNoPc). */}
      <style>{`
        .item-grupo:not([aria-current]):hover { background: #EDF0F3; color: ${t.texto}; }
        @media (max-width: 720px) {
          .produtos-caixa { overflow-y: auto !important; }
          .produtos-colunas { flex-wrap: wrap !important; flex: none !important; }
          .produtos-lateral, .produtos-painel { max-height: none !important; overflow: visible !important; }
          .produtos-lista { flex: none !important; overflow: visible !important; }
        }
      `}</style>
      <div className="produtos-caixa" style={est.caixa}>
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
          <div className="produtos-colunas" style={loc.colunas}>
            {/* A coluna de grupos tem uma moldura de fora que estica ate' o
                rodape e rola; a caixa cinza de dentro continua do tamanho dos
                grupos, como na tela de maquinas. */}
            <div className="produtos-lateral" style={loc.lateral}>
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
            </div>

            <section className="produtos-painel" style={loc.painel} aria-label={`Produtos do grupo ${grupo.nome}`}>
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
                {/* Na embalagem, Volumes e o botao quebram JUNTOS: no painel
                    do PC os quatro nao cabem numa linha, e o Cadastrar
                    sozinho embaixo parecia esquecido. Cortar os textos de
                    exemplo dos campos para caber tirava a instrucao deles. */}
                <div style={loc.fimDaLinha}>
                  {contaVolumes && <CampoVolumes valor={volumes} aoMudar={setVolumes} />}
                  <button type="submit" style={est.botaoPrimario} disabled={ocupado || !nome.trim()}>
                    Cadastrar
                  </button>
                </div>
              </form>
              <span style={est.destinoCadastro}>
                Vai para {grupo.codigo} · {grupo.nome}
              </span>
              {contaVolumes && <p style={est.dica}>{DICA_VOLUMES}</p>}

              {doGrupo.length === 0 ? (
                <p style={est.dica}>
                  Nenhum produto neste grupo. Sem produto cadastrado, o tablet segue com o
                  campo de texto livre.
                </p>
              ) : (
                <div className="produtos-lista" style={loc.lista}>
                  {doGrupo.map((p) => (editando?.id === p.id ? (
                    <FormularioEdicao
                      key={p.id} produto={p} edicao={editando} setEdicao={setEditando}
                      grupos={grupos} ocupado={ocupado}
                      aoSalvar={async () => {
                        // Volumes so' vai quando o produto fica (ou passa a
                        // ficar) num grupo de embalagem — o grupo escolhido
                        // no proprio formulario. Fora dela o campo nem aparece.
                        const destino = grupos.find((g) => g.id === editando.grupoId);
                        if (await aplicar(() => atualizarProduto(p.id, {
                          nome: editando.nome.trim(), codigo: editando.codigo.trim(), grupoId: editando.grupoId,
                          ...(grupoContaVolumes(destino) ? { volumes: lerVolumesDoFormulario(editando.volumes) } : {}),
                        }))) setEditando(null);
                      }}
                    />
                  ) : (
                    <div key={p.id} style={{ ...loc.linha, ...(p.ativo ? {} : est.linhaInativa) }}>
                      <span style={loc.linhaRotulo}>{p.nome}</span>
                      {p.codigo && <span style={est.seloNominal} title="Código no ERP">{p.codigo}</span>}
                      {contaVolumes && p.volumes != null && (
                        <span style={est.seloNominal} title="Caixas do produto na embalagem">
                          {rotuloVolumes(p.volumes)}
                        </span>
                      )}
                      {faltamVolumes(p, grupo) && (
                        <span style={loc.seloSemVolumes} title={TITULO_SEM_VOLUMES}>
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
 * O que os volumes fazem, dito como vai acontecer: com o numero, o takt do
 * programa e a medicao da linha (os dois em caixas) viram produto no
 * estudo; em branco, nada e' convertido. Prometer menos do que o sistema
 * faz e' melhor que prometer mais — quem le' isto vai conferir no estudo.
 */
const DICA_VOLUMES = 'Volumes = em quantas caixas o produto sai embalado (rack em 2 caixas = 2). '
  + 'Com o número, o takt do programa e a medição da linha entram no estudo por produto. '
  + 'Em branco, o takt não entra sozinho e a medição fica em volumes.';
const TITULO_SEM_VOLUMES = 'Sem os volumes, o takt do programa não entra sozinho no estudo deste produto '
  + 'e a medição da linha fica em volumes.';

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

/**
 * Editar um produto: nome, codigo, o grupo (produto cadastrado no posto
 * errado muda de grupo) e, se o grupo escolhido aqui for de embalagem, os
 * volumes.
 */
function FormularioEdicao({
  produto, edicao, setEdicao, grupos, ocupado, aoSalvar,
}) {
  const contaVolumes = grupoContaVolumes(grupos.find((g) => g.id === edicao.grupoId));
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
        {contaVolumes && (
          <CampoVolumes valor={edicao.volumes} aoMudar={(v) => setEdicao({ ...edicao, volumes: v })} />
        )}
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
 * e' a casa das duas telas; o que so' o produto tem fica aqui, e a tela de
 * maquinas nao muda).
 */
const loc = {
  /* A ALTURA, de cima para baixo: a caixa para na altura da janela; as
     colunas ficam com o que sobra entre o topo e o rodape (Fechar, alerta)
     e NAO quebram linha — so' assim grupos e painel tem a altura delas, e
     nao a do conteudo. Com quebra de linha (o est.colunas), o painel
     crescia ate' o fim da lista e saia da caixa por cima do rodape. */
  colunas: { ...est.colunas, flexWrap: 'nowrap' },
  // Muitos grupos num notebook baixo: a coluna rola, nao invade o rodape.
  // A moldura de fora e' quem estica (stretch) e rola: maxHeight 100% na
  // propria caixa cinza nao resolve contra a altura das colunas.
  lateral: {
    flex: est.lateral.flex, maxWidth: est.lateral.maxWidth, minWidth: 0, minHeight: 0,
    alignSelf: 'stretch', overflowY: 'auto',
  },
  // Rede de seguranca: janela baixa demais ate' para o formulario e duas
  // linhas da lista — o painel rola inteiro, nada passa por cima de nada.
  painel: { ...est.painel, minHeight: 0, overflowY: 'auto' },
  // A lista ocupa o resto do painel e rola por dentro; nunca menos que duas
  // linhas, para continuar sendo uma lista.
  lista: { ...est.listaMaquinas, flex: '1 1 auto', maxHeight: 'none', minHeight: 88 },
  /* O nome QUEBRA LINHA em vez de cortar com reticencias: com o codigo e
     o selo de volumes na mesma linha, "Rack Sirius 1.6 com Painel Encanto
     Off White 5" ficava cortado e sem como ler inteiro. A folga em cima e
     embaixo fica no NOME (a linha de uma linha so' continua com os 40 px de
     sempre), e a linha nao encolhe (flexShrink 0): a lista e' uma coluna
     flex que rola, e sem isso a de nome longo era espremida aos 40 px. */
  linha: { ...est.linha, flexShrink: 0 },
  linhaRotulo: {
    ...est.linhaRotulo, whiteSpace: 'normal', overflowWrap: 'anywhere', textOverflow: 'clip',
    padding: `${espaco.xs}px 0`,
  },
  fimDaLinha: { display: 'flex', alignItems: 'center', gap: espaco.sm, flex: '0 0 auto' },
  campoVolumes: { display: 'flex', alignItems: 'center', gap: espaco.xs, flex: '0 0 auto' },
  inputVolumes: { ...est.input, width: 64, textAlign: 'center' },
  // Discreto, na cor de atencao e nao na de erro: falta um dado, nada quebrou.
  seloSemVolumes: { ...est.seloNominal, color: t.atencao, borderColor: t.atencao, background: t.atencaoFundo },
};
