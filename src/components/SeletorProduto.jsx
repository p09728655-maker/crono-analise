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
 */
export default function SeletorProduto({
  valor, aoTrocar, opcoes, estilos,
  aria = 'Produto',
  placeholder = 'Ex: Rack Sirius 1.6',
  vazio = 'Escolha o produto…',
  aoEscolher,
  sugestoes = null, listaId,
  contexto,
}) {
  const lista = opcoes || [];
  /* null = automatico (decide pelo valor e pela lista); true/false = o
     usuario escolheu de que jeito quer preencher, e a escolha manda —
     dentro do mesmo contexto. Ajustado durante o render (o padrao do
     React para estado que depende de prop), sem remontar o campo. */
  const [modo, setModo] = useState(null);
  const [contextoVisto, setContextoVisto] = useState(contexto);
  if (contexto !== contextoVisto) {
    setContextoVisto(contexto);
    setModo(null);
  }
  const naLista = lista.some((p) => p.nome === valor);
  const automatico = lista.length === 0 || (Boolean(valor) && !naLista);
  const livre = lista.length === 0 || (modo === null ? automatico : modo);

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
      <option value="__outro">Outro produto…</option>
    </select>
  );
}
