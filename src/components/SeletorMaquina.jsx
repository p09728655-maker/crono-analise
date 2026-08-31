import { useEffect, useState } from 'react';
import { carregarMaquinas, useMaquinas } from '../lib/maquinas.js';

/**
 * Campo da MAQUINA — escolha quando ha cadastro, texto quando nao ha.
 *
 * Nasceu no celular (Ritmo da maquina) e virou componente porque a mesma
 * pergunta e' feita em tres lugares: la', no NOVO ESTUDO e na edicao do
 * estudo, todos gravando o nome do posto. Enquanto cada tela tinha o seu
 * campo, so' o celular oferecia o cadastro — e o estudo criado no PC
 * entrava com "Furadeira 03" digitado a mao, do lado de "FURADEIRA 03" da
 * lista. Nome digitado foi o que dividiu a mesma peca em linhas que nao
 * somam (28/08); dividir o mesmo POSTO custa a mesma coisa.
 *
 * Nunca tranca: "Outra maquina..." abre o texto livre, e sem cadastro (ou
 * sem rede e sem cache) o campo e' o de sempre. Valor que o cadastro nao
 * conhece — estudo antigo, posto ainda nao cadastrado — aparece como texto,
 * nao some num select sem a opcao.
 *
 * A tela dona passa os ESTILOS: a coleta e' escura e de dedo, o PC e' claro
 * e de mouse. O que se compartilha e' a regra, nao a aparencia.
 */
export default function SeletorMaquina({
  valor, aoTrocar, estilos,
  aria = 'Máquina',
  /* O texto livre tem rotulo PROPRIO: no celular ele e' "Nome da máquina"
     desde a primeira versao, e mudar quebraria o leitor de tela de quem ja'
     conhece a tela (e os testes que guardam esse contrato). */
  ariaTexto,
  placeholder = 'Ex: Furadeira 03',
  vazio = 'Escolha a máquina…',
  aoEscolher,
}) {
  const maquinas = useMaquinas();
  // O cadastro se busca sozinho: fosse tarefa de quem usa o campo, a tela
  // que esquecesse mostraria texto livre sem nunca dizer por que.
  useEffect(() => { carregarMaquinas(); }, []);

  /* null = automatico (decide pelo valor e pelo cadastro); true/false = o
     usuario escolheu de que jeito quer preencher, e a escolha manda. */
  const [modo, setModo] = useState(null);
  const noCadastro = maquinas.some((m) => m.nome === valor);
  const automatico = maquinas.length === 0 || (Boolean(valor) && !noCadastro);
  const livre = modo === null ? automatico : modo;

  if (livre) {
    return (
      <>
        <input
          type="text"
          placeholder={placeholder}
          value={valor}
          onChange={(ev) => aoTrocar(ev.target.value)}
          style={estilos.input}
          aria-label={ariaTexto || aria}
        />
        {maquinas.length > 0 && (
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

  /* Agrupadas pelo GRUPO do cadastro (furadeiras juntas, fresadoras
     juntas). A lista ja vem ordenada do servidor; aqui so' se fatia. Sem
     grupo, ficam soltas no fim — o cadastro organiza, nao trava. */
  const grupos = [];
  for (const m of maquinas) {
    const rotuloGrupo = m.grupo_codigo ? `${m.grupo_codigo} · ${m.grupo_nome}` : null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === rotuloGrupo) ultimo.itens.push(m);
    else grupos.push({ grupo: rotuloGrupo, itens: [m] });
  }

  return (
    <select
      value={valor}
      onChange={(ev) => {
        if (ev.target.value === '__outra') { setModo(true); aoTrocar(''); return; }
        aoTrocar(ev.target.value);
        if (ev.target.value) aoEscolher?.(ev.target.value);
      }}
      style={estilos.select}
      aria-label={aria}
    >
      <option value="">{vazio}</option>
      {grupos.map((g) => (g.grupo ? (
        <optgroup key={g.grupo} label={g.grupo}>
          {g.itens.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
        </optgroup>
      ) : (
        g.itens.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)
      )))}
      <option value="__outra">Outra máquina…</option>
    </select>
  );
}
