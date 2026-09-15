/**
 * As regras de GRUPO que a coluna da esquerda e o painel da direita
 * dividem — inclusive os dois itens que parecem grupo e nao sao.
 */

/** Itens da coluna da esquerda que nao sao grupo do cadastro. */
export const TODAS = '__todas';
export const SEM_GRUPO = '__sem_grupo';

/** O escolhido carrega contexto de grupo? ("Todas" nao carrega.) */
export const temContexto = (id) => id !== TODAS;

/**
 * O grupo que a nova maquina recebe.
 *
 * "Sem grupo" e "Todas" NAO sao grupos do cadastro — sao filtros. Mandar o
 * id falso deles para a API daria erro de validacao no lugar de cadastrar
 * a maquina sem grupo, que e' o que a pessoa pediu.
 */
export function grupoParaCadastrar(escolhido, doSeletor) {
  if (escolhido === TODAS) return doSeletor || null;
  if (escolhido === SEM_GRUPO) return null;
  return escolhido;
}

export const rotuloGrupo = (g) => `${g.codigo} · ${g.nome}`;

/** Quantas maquinas caem em cada item da coluna, filtros inclusive. */
export const contarMaquinas = (lista, id) => (id === TODAS
  ? lista.length
  : lista.filter((m) => (id === SEM_GRUPO ? !m.grupo_id : m.grupo_id === id)).length);

/** Sugestao do proximo codigo livre: maior codigo numerico + 1, com zeros. */
export const proximoCodigo = (grupos) => {
  const maior = grupos.reduce((acc, g) => Math.max(acc, parseInt(g.codigo, 10) || 0), 0);
  return String(maior + 1).padStart(4, '0');
};
