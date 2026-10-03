// Wrapper minimal d'IndexedDB (pas de lib lourde). Nommage proche des stores
// SQLite du mobile pour garder une logique partagée simple à lire.

import { getSession } from './session';

// Une base IndexedDB par entreprise : deux comptes créés dans le même navigateur
// ne doivent jamais voir (ni pousser) les données l'un de l'autre. Les données
// non synchronisées d'un compte restent dans sa base jusqu'à sa reconnexion.
const DB_PREFIX = 'korah-web';
const DB_VERSION = 3;
// Ancienne base unique, partagée par tous les comptes du navigateur.
const LEGACY_DB_NAME = 'korah-web';

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

const dbPromises = new Map<string, Promise<IDBDatabase>>();
let legacyChecked = false;

// Hors session, on pointe sur une base vide : rien d'un autre compte n'est lisible.
function currentDbName(): string {
  const businessId = getSession()?.business_id;
  return `${DB_PREFIX}-${businessId ?? 'anonymous'}`;
}

function openNamedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
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
}

function openDb(): Promise<IDBDatabase> {
  if (!legacyChecked) {
    legacyChecked = true;
    void dropLegacyDb();
  }
  const name = currentDbName();
  let promise = dbPromises.get(name);
  if (!promise) {
    promise = openNamedDb(name);
    promise.catch(() => dbPromises.delete(name));
    dbPromises.set(name, promise);
  }
  return promise;
}

// L'ancienne base mélange les comptes : impossible de savoir à qui elle appartient.
// On la supprime si elle n'a plus rien à envoyer ; sinon on la laisse intacte (jamais
// lue ni poussée) plutôt que de perdre des opérations.
async function dropLegacyDb(): Promise<void> {
  try {
    const db = await openNamedDb(LEGACY_DB_NAME);
    const outbox = await new Promise<{ status?: string }[]>((resolve, reject) => {
      const req = db.transaction('outbox', 'readonly').objectStore('outbox').getAll();
      req.onsuccess = () => resolve(req.result as { status?: string }[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (outbox.some((row) => row.status === 'pending')) return;
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    /* best-effort */
  }
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