/**
 * The small IndexedDB plumbing the desk's own stores share (`deskDataCache`, `deskDrafts`): one database with one
 * object store keyed by `key`. Every failure resolves to null instead of throwing, so a private window or a full
 * disk only means nothing is kept.
 */

/** The database, its store made on first open; null when IndexedDB is missing or refuses. */
export function openDeskDb(name: string, store: string, version = 1): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch {
      resolve(null);
      return;
    }
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' });
    };
  });
}

/** A request's result, or null when it failed. */
export function idbResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}
