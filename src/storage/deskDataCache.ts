/**
 * Data kept on this computer for pages that load a lot of it, such as a pivot's rows: one
 * IndexedDB record per key, with when it was saved. Unlike the UI settings (`deskPrefs.ts`) it
 * is company data, so the host clears it at logout (`clearDeskDataCache`). Without IndexedDB
 * nothing is kept and every read misses. The oldest entries go when there are more than `MAX_ENTRIES`.
 */

const DB_NAME = 'desk-data-cache';
const DB_VERSION = 1;
const STORE = 'entries';
const MAX_ENTRIES = 40;

export interface DeskDataEntry<T> {
  key: string;
  /** When it was saved, as `Date.now()`. */
  savedAt: number;
  value: T;
}

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function')
    return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
  });
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

/** The kept entry, or null when there is none or the store cannot be read. */
export async function readDeskData<T>(key: string): Promise<DeskDataEntry<T> | null> {
  try {
    const db = await open();
    if (!db) return null;
    const found = await done(
      db.transaction(STORE, 'readonly').objectStore(STORE).get(key) as IDBRequest<
        DeskDataEntry<T> | undefined
      >,
    );
    db.close();
    return found ?? null;
  } catch {
    return null;
  }
}

/** Keep `value` under `key`, replacing what was there. A failed write keeps nothing. */
export async function writeDeskData<T>(key: string, value: T): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
    await done(store.put({ key, savedAt: Date.now(), value }));
    const all =
      (await done(
        db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<
          DeskDataEntry<unknown>[]
        >,
      )) ?? [];
    if (all.length > MAX_ENTRIES) {
      const old = all.sort((a, b) => a.savedAt - b.savedAt).slice(0, all.length - MAX_ENTRIES);
      const trim = db.transaction(STORE, 'readwrite').objectStore(STORE);
      await Promise.all(old.map((entry) => done(trim.delete(entry.key))));
    }
    db.close();
  } catch {
    // A full disk or a private window: the page still has the rows it loaded.
  }
}

export async function removeDeskData(key: string): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
    db.close();
  } catch {
    // Nothing kept, nothing to remove.
  }
}

/** Every kept entry gone, at logout. */
export async function clearDeskDataCache(): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
    db.close();
  } catch {
    // The next login reads nothing it cannot see anyway: keys carry the company and user.
  }
}
