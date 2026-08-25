/**
 * Fila de sincronizacao offline (IndexedDB).
 *
 * O tablet na furadeira perde wifi com frequencia. O ciclo cronometrado e'
 * um dado que NAO pode ser perdido: nao da' para pedir ao analista que
 * cronometre a peca de novo, ela ja' foi produzida.
 *
 * Por isso a gravacao local e' a fonte da verdade durante a coleta, e a rede
 * e' um detalhe de sincronizacao. Todo item carrega um clientId (UUID) que
 * torna o reenvio idempotente do lado do servidor.
 */

const BANCO = 'ritmoprod';
const VERSAO = 1;
const FILA = 'fila';
const RASCUNHO = 'rascunho';

let promessaDb = null;

function abrir() {
  if (promessaDb) return promessaDb;
  promessaDb = new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(FILA)) {
        const store = db.createObjectStore(FILA, { keyPath: 'clientId' });
        store.createIndex('porTipo', 'tipo');
      }
      if (!db.objectStoreNames.contains(RASCUNHO)) {
        db.createObjectStore(RASCUNHO);
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
  return promessaDb;
}

function transacao(store, modo, fn) {
  return abrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const resultado = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(resultado?.result ?? resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** UUID v4. Usa crypto nativo quando disponivel. */
export function novoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: (a) => a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }) })
    .getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** Enfileira um item. Resolve so' depois de gravado em disco. */
export async function enfileirar(item) {
  const registro = { ...item, clientId: item.clientId || novoId(), enfileiradoEm: Date.now() };
  await transacao(FILA, 'readwrite', (store) => store.put(registro));
  return registro;
}

export function listarFila() {
  return transacao(FILA, 'readonly', (store) => store.getAll());
}

export function contarFila() {
  return transacao(FILA, 'readonly', (store) => store.count());
}

/** Remove os itens que o servidor confirmou. */
export async function removerDaFila(clientIds) {
  if (!clientIds?.length) return;
  await transacao(FILA, 'readwrite', (store) => { clientIds.forEach((id) => store.delete(id)); });
}

/**
 * Rascunho da sessao de coleta em andamento.
 * Se o navegador for morto pelo sistema (tablet sem memoria, bateria), a
 * coleta e' retomada de onde parou em vez de comecar do zero.
 */
export function salvarRascunho(chave, valor) {
  return transacao(RASCUNHO, 'readwrite', (store) => store.put(valor, chave));
}

export function lerRascunho(chave) {
  return transacao(RASCUNHO, 'readonly', (store) => store.get(chave));
}

export function limparRascunho(chave) {
  return transacao(RASCUNHO, 'readwrite', (store) => store.delete(chave));
}
