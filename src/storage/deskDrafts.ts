import { deskHost } from '../host';
import { idbResult, openDeskDb } from './idb';

/**
 * Unsent forms kept on this computer, so an accidental reload does not lose them (`form/draft.ts`). One record per
 * draft key (the host's scope, the page's path, the URL's draft key) with when it was saved and the pending idempotency key of its
 * last submit. Drafts are company data: the host clears them at logout (`clearDeskDrafts`). A draft older than
 * `DESK_DRAFT_MAX_AGE_MS` is dropped when drafts are read: by then the server has forgotten its idempotency key too.
 */

/** A day, the server's idempotency window. */
export const DESK_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface DeskDraftEntry<T = unknown> {
  key: string;
  /** When it was saved, as `Date.now()`. */
  savedAt: number;
  value: T;
  /** The idempotency key of a submit whose answer never came, else null. */
  submissionKey: string | null;
}

/** Where drafts live. The IndexedDB store is the default; tests and other hosts pass their own to `configureDesk`. */
export interface DeskDraftStore {
  read: (key: string) => Promise<DeskDraftEntry | null>;
  write: (entry: DeskDraftEntry) => Promise<void>;
  remove: (key: string) => Promise<void>;
  /** Removes every draft whose key starts with `prefix` (a page's old drafts). */
  removePrefix: (prefix: string) => Promise<void>;
  /** Removes every draft saved before `time`. */
  removeOlder: (time: number) => Promise<void>;
  clear: () => Promise<void>;
}

const DB_NAME = 'desk-drafts';
const STORE = 'drafts';

/** Drafts in IndexedDB. Without it (a private window, a refused database) nothing is kept. */
export function createIndexedDbDraftStore(): DeskDraftStore {
  async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>, fallback: T): Promise<T> {
    try {
      const db = await openDeskDb(DB_NAME, STORE);
      if (!db) return fallback;
      try {
        return await work(db.transaction(STORE, mode).objectStore(STORE));
      } finally {
        db.close();
      }
    } catch {
      return fallback;
    }
  }
  function removeWhere(drop: (entry: DeskDraftEntry) => boolean): Promise<void> {
    return withStore(
      'readwrite',
      async (store) => {
        const all = (await idbResult(store.getAll() as IDBRequest<DeskDraftEntry[]>)) ?? [];
        await Promise.all(all.filter(drop).map((entry) => idbResult(store.delete(entry.key))));
      },
      undefined,
    );
  }
  return {
    read: (key) => withStore('readonly', async (store) => (await idbResult(store.get(key) as IDBRequest<DeskDraftEntry | undefined>)) ?? null, null),
    write: (entry) => withStore('readwrite', async (store) => void (await idbResult(store.put(entry))), undefined),
    remove: (key) => withStore('readwrite', async (store) => void (await idbResult(store.delete(key))), undefined),
    removePrefix: (prefix) => removeWhere((entry) => entry.key.startsWith(prefix)),
    removeOlder: (time) => removeWhere((entry) => entry.savedAt < time),
    clear: () => withStore('readwrite', async (store) => void (await idbResult(store.clear())), undefined),
  };
}

/** Drafts in memory, gone on reload: for tests (one store kept across a remount stands for a reload). */
export function createMemoryDraftStore(): DeskDraftStore {
  const entries = new Map<string, DeskDraftEntry>();
  return {
    read: (key) => Promise.resolve(entries.get(key) ?? null),
    write: (entry) => {
      entries.set(entry.key, entry);
      return Promise.resolve();
    },
    remove: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
    removePrefix: (prefix) => {
      for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
      return Promise.resolve();
    },
    removeOlder: (time) => {
      for (const [key, entry] of entries) if (entry.savedAt < time) entries.delete(key);
      return Promise.resolve();
    },
    clear: () => {
      entries.clear();
      return Promise.resolve();
    },
  };
}

let fallbackStore: DeskDraftStore | null = null;

/** The host's draft store, or the IndexedDB default. */
export function deskDraftStore(): DeskDraftStore {
  const host = deskHost().drafts;
  if (host) return host;
  fallbackStore ??= createIndexedDbDraftStore();
  return fallbackStore;
}

/** A draft that is still fresh, or null. Expired drafts (this one and any other) are removed first. */
export async function readDeskDraft<T>(key: string, now = Date.now()): Promise<DeskDraftEntry<T> | null> {
  const store = deskDraftStore();
  await store.removeOlder(now - DESK_DRAFT_MAX_AGE_MS);
  return (await store.read(key)) as DeskDraftEntry<T> | null;
}

/** Every draft gone, at logout. */
export function clearDeskDrafts(): Promise<void> {
  return deskDraftStore().clear();
}
