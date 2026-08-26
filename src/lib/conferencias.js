/**
 * Conferencias salvas NESTE aparelho.
 *
 * Salvar uma conferencia e' memoria de bolso do analista — comparar a
 * furadeira de ontem com a de hoje, mostrar o numero ao gestor no corredor.
 * Por isso vive no localStorage, local e sem cadastro, igual ao resto da
 * tela: a promessa da conferencia rapida e' funcionar sem rede e sem
 * servidor. Registro oficial, com FR, tolerancia e tempo padrao, continua
 * sendo papel do estudo.
 *
 * A lista e' aparada no MAXIMO para o storage nao crescer para sempre:
 * conferencia velha demais ja' nao descreve o posto de hoje.
 */
const CHAVE = 'ritmopatrimar.conferencias';
const MAXIMO = 50;

export function listarConferencias() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}

/** Salva no topo da lista. Devolve o registro, ou null se o aparelho negar. */
export function salvarConferencia(dados) {
  const registro = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    salvoEm: new Date().toISOString(),
    ...dados,
  };
  try {
    const lista = [registro, ...listarConferencias()].slice(0, MAXIMO);
    localStorage.setItem(CHAVE, JSON.stringify(lista));
    return registro;
  } catch { return null; }
}

/** Remove pelo id e devolve a lista restante. */
export function removerConferencia(id) {
  const lista = listarConferencias().filter((c) => c.id !== id);
  try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch { /* fica so' em memoria */ }
  return lista;
}
