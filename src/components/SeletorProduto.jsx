import { useState } from 'react';

/**
 * Campo do PRODUTO — escolha quando o posto tem produtos cadastrados, texto
 * quando nao tem.
 *
 * Irmao do SeletorMaquina, com as mesmas regras e pelo mesmo motivo: nome
 * digitado divide o mesmo produto em linhas que nao somam ("Rack Sirius
 * 1.6", "rack sirius", "Sirius 1,6"). A lista vem do cadastro de produtos
 * do PC, ja' filtrada pelo GRUPO da maquina (quem filtra e' a tela, que
 * sabe a maquina): a embalagem ve' os racks, a furadeira as laterais.
 *
 * Nunca tranca: "Outro produto..." abre o texto livre, e sem cadastro para
 * o posto (ou sem rede e sem cache) o campo e' o de sempre. Valor que o
 * cadastro nao conhece aparece como texto, nao some num select sem a opcao.
 *
 * A conferencia continua gravando o NOME — o cadastro padroniza a entrada.
 *
 * `sugestoes` (opcional) liga um datalist ao texto livre — os nomes ja'
 * usados nos estudos, quando o grupo nao tem lista. E' o MESMO campo nos
 * dois casos de proposito: trocar de componente quando o cadastro chega
 * apagava o que o analista estava digitando e tirava o foco.
 * `contexto` (opcional, o grupo do posto): quando muda, a escolha "Outro
 * produto…" feita no posto anterior deixa de valer.
 *
 * `aoCadastrar` (opcional, a coleta): o nome digitado pode ir para o
 * CADASTRO do grupo antes de medir (v2.97.0) — um botao abaixo do texto.
 * Sem cadastrar, o nome vai so' na medicao, como sempre; o botao e' a
 * saida para o produto que nao estava na lista deixar de ser texto livre.
 * Recebe o nome e devolve o resultado de lib/maquinas.cadastrarProduto.
 * `grupoNome` diz no botao para qual lista o produto vai.
 */
export default function SeletorProduto({
  valor, aoTrocar, opcoes, estilos,
  aria = 'Produto',
  placeholder = 'Ex: Rack Sirius 1.6',
  vazio = 'Escolha o produto…',
  aoEscolher,
  sugestoes = null, listaId,
  contexto,
  aoCadastrar, grupoNome,
}) {
  const lista = opcoes || [];
  /* null = automatico (decide pelo valor e pela lista); true/false = o
     usuario escolheu de que jeito quer preencher, e a escolha manda —
     dentro do mesmo contexto. Ajustado durante o render (o padrao do
     React para estado que depende de prop), sem remontar o campo. */
  const [modo, setModo] = useState(null);
  const [contextoVisto, setContextoVisto] = useState(contexto);
  /* O que o cadastro respondeu, e PARA QUAL nome: { de, estado, texto }.
     Mudou o nome no campo, a resposta deixa de valer e some — "sem rede"
     dito para o nome anterior nao vale para o que se digita agora. */
  const [cadastro, setCadastro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  if (contexto !== contextoVisto) {
    setContextoVisto(contexto);
    setModo(null);
    setCadastro(null);
  }
  const naLista = lista.some((p) => p.nome === valor);
  const automatico = lista.length === 0 || (Boolean(valor) && !naLista);
  const livre = lista.length === 0 || (modo === null ? automatico : modo);
  const resposta = cadastro && cadastro.de === valor ? cadastro : null;
  const nomeDigitado = String(valor || '').trim();
  const podeCadastrar = Boolean(aoCadastrar) && Boolean(nomeDigitado) && !naLista;

  const cadastrar = async () => {
    if (enviando || !podeCadastrar) return;
    setEnviando(true);
    const r = await aoCadastrar(nomeDigitado);
    setEnviando(false);
    if (r.estado === 'ok') {
      // Escolhido da lista, com a grafia do cadastro: e' o que junta as
      // medicoes deste produto numa linha so'.
      setModo(null);
      aoTrocar(r.produto.nome);
      aoEscolher?.(r.produto.nome);
      setCadastro({
        de: r.produto.nome,
        estado: 'ok',
        texto: r.novo
          ? `✓ «${r.produto.nome}» cadastrado${grupoNome ? ` na lista do grupo ${grupoNome}` : ''}.`
          : `«${r.produto.nome}» já estava no cadastro — escolhido da lista.`,
      });
      return;
    }
    if (r.estado === 'desativado') {
      // Fica como texto, com a grafia do cadastro: a medicao vale, e o PCP
      // decide se o produto volta para a lista.
      aoTrocar(r.produto.nome);
      setCadastro({
        de: r.produto.nome,
        estado: 'aviso',
        texto: `«${r.produto.nome}» está no cadastro, mas desativado pelo PCP. A medição pode seguir com `
          + 'este nome; para ele voltar à lista, peça ao PCP para reativar no PC, em Produtos.',
      });
      return;
    }
    setCadastro({ de: valor, estado: 'aviso', texto: r.mensagem });
  };

  const respostaNaTela = resposta && (
    <span role={resposta.estado === 'ok' ? 'status' : 'alert'} style={resposta.estado === 'ok' ? estilos.cadastroOk : estilos.cadastroAviso}>
      {resposta.texto}
    </span>
  );

  if (livre) {
    return (
      <>
        <input
          type="text"
          placeholder={placeholder}
          value={valor}
          onChange={(ev) => aoTrocar(ev.target.value)}
          style={estilos.input}
          aria-label={aria}
          list={sugestoes && listaId ? listaId : undefined}
        />
        {sugestoes && listaId && (
          <datalist id={listaId}>
            {sugestoes.map((nome) => <option key={nome} value={nome} />)}
          </datalist>
        )}
        {podeCadastrar && (
          <button
            type="button"
            style={estilos.cadastrar}
            onClick={cadastrar}
            disabled={enviando}
          >
            {enviando ? 'Cadastrando…' : `+ Cadastrar «${nomeDigitado}»${grupoNome ? ` no grupo ${grupoNome}` : ''}`}
          </button>
        )}
        {podeCadastrar && !resposta && (
          <span style={estilos.cadastroDica}>
            Cadastrado, ele entra na lista para as próximas medições. Sem cadastrar, o nome vai só nesta.
          </span>
        )}
        {respostaNaTela}
        {lista.length > 0 && (
          <button
            type="button"
            style={estilos.link}
            onClick={() => { setModo(false); aoTrocar(''); }}
          >
            ▾ escolher do cadastro
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <select
        value={valor}
        onChange={(ev) => {
          if (ev.target.value === '__outro') { setModo(true); aoTrocar(''); return; }
          aoTrocar(ev.target.value);
          if (ev.target.value) aoEscolher?.(ev.target.value);
        }}
        style={estilos.select}
        aria-label={aria}
      >
        <option value="">{vazio}</option>
        {/* O codigo do ERP ao lado: e' como o resto da fabrica chama o produto. */}
        {lista.map((p) => (
          <option key={p.id} value={p.nome}>{p.codigo ? `${p.nome} · ${p.codigo}` : p.nome}</option>
        ))}
        {/* Com o cadastro ligado, a saida do produto que nao esta' na lista
            diz que da' para cadastrar — e' o que se procura nesse momento. */}
        <option value="__outro">{aoCadastrar ? 'Outro produto (digitar ou cadastrar)…' : 'Outro produto…'}</option>
      </select>
      {respostaNaTela}
    </>
  );
}
