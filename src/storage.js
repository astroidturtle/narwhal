// Document persistence: IndexedDB, one record per document (strokes, text,
// shapes and embedded images all live inside the record).

const DB_NAME = "narwhal";
const STORE = "docs";
const DB_VERSION = 1;
export const FORMAT_VERSION = 1;

let dbPromise;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        Promise.resolve(fn(store)).then((r) => (result = r));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const req2p = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function blankDoc(name = "Untitled") {
  const now = Date.now();
  return {
    id: newId(),
    name,
    formatVersion: FORMAT_VERSION,
    createdAt: now,
    updatedAt: now,
    elements: [],
    appState: {},
    files: {},
  };
}

export async function listDocs() {
  const all = await tx("readonly", (s) => req2p(s.getAll()));
  return all
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getDoc = (id) => tx("readonly", (s) => req2p(s.get(id)));
export const putDoc = (doc) => tx("readwrite", (s) => req2p(s.put(doc)));
export const deleteDoc = (id) => tx("readwrite", (s) => req2p(s.delete(id)));

// Small per-browser conveniences; storage may be blocked, so never throw.
export const prefs = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`narwhal:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`narwhal:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};
