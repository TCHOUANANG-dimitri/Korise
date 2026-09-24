// Wrapper minimal d'IndexedDB (pas de lib lourde). Nommage proche des stores
// SQLite du mobile pour garder une logique partagée simple à lire.

const DB_NAME = 'korah-web';
const DB_VERSION = 3;

export const STORES = [
  'products',
  'users',
  'sales',
  'money_movements',
  'stock_movements',
  'daily_closings',
  'customers',
  'shifts',
  'outbox',
  'kv',
] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store: StoreName, mode: 'readonly' | 'readwrite' = 'readonly') {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getOne<T>(store: StoreName, key: string): Promise<T | null> {
  const s = await tx(store);
  return new Promise((resolve, reject) => {
    const req = s.get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function put<T>(store: StoreName, value: T): Promise<void> {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = s.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItem(store: StoreName, key: string): Promise<void> {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = s.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clear(store: StoreName): Promise<void> {
  const s = await tx(store, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = s.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// KV générique (curseurs de sync, etc.)
export async function kvGet(key: string): Promise<string | null> {
  const row = await getOne<{ id: string; value: string }>('kv', key);
  return row?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await put('kv', { id: key, value });
}