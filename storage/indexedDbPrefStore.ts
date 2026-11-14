import type { DeskPrefStore } from './prefStore';

const DB_VERSION = 1;
const STORE_NAME = 'prefs';
/** The only settings record. Its value is `{ version, settings }`. */
const BAG_KEY = 'ui';

interface SettingsBag {
  version: 1;
  settings: Record<string, unknown>;
}

interface PrefRecord<T> {
  key: string;
  value: T;
}

export interface IndexedDbPrefOptions {
  /** IndexedDB database name. Keep it stable, or saved settings are not found. */
  dbName: string;
}

function openPrefs(dbName: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.open !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    const giveUp = window.setTimeout(() => resolve(null), 500);
    request.onerror = () => {
      window.clearTimeout(giveUp);
      resolve(null);
    };
    request.onsuccess = () => {
      window.clearTimeout(giveUp);
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

function isBag(value: unknown): value is SettingsBag {
  if (!value || typeof value !== 'object') return false;
  const bag = value as SettingsBag;
  return bag.version === 1 && typeof bag.settings === 'object' && bag.settings !== null && !Array.isArray(bag.settings);
}

function readRows(db: IDBDatabase): Promise<PrefRecord<unknown>[]> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onerror = () => resolve([]);
    request.onsuccess = () => resolve((request.result as PrefRecord<unknown>[]) ?? []);
  });
}

function putBag(db: IDBDatabase, bag: SettingsBag): Promise<void> {
  const stored = JSON.parse(JSON.stringify({ key: BAG_KEY, value: bag })) as PrefRecord<SettingsBag>;
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(stored);
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
  });
}

/**
 * Settings in one IndexedDB record. They are read once and then served from memory.
 * Older per-key records in the same database are copied into the record the first time.
 * Without IndexedDB, settings stay in memory until reload.
 */
export function createIndexedDbPrefStore(options: IndexedDbPrefOptions): DeskPrefStore {
  const { dbName } = options;
  let settings: Record<string, unknown> | null = null;
  let loading: Promise<Record<string, unknown>> | null = null;
  let writing: Promise<void> = Promise.resolve();

  function load(): Promise<Record<string, unknown>> {
    if (settings) return Promise.resolve(settings);
    if (loading) return loading;
    loading = (async () => {
      try {
        const db = await openPrefs(dbName);
        if (!db) {
          settings = {};
          return settings;
        }
        const rows = await readRows(db);
        const found = rows.find((row) => row.key === BAG_KEY);
        if (found && isBag(found.value)) {
          settings = found.value.settings;
          return settings;
        }
        const folded: Record<string, unknown> = {};
        for (const row of rows) {
          if (row.key !== BAG_KEY) folded[row.key] = row.value;
        }
        settings = folded;
        if (Object.keys(folded).length > 0) await putBag(db, { version: 1, settings: folded });
        return settings;
      } catch {
        settings = settings ?? {};
        return settings;
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  function queue(job: () => Promise<void>): Promise<void> {
    const run = writing.then(job);
    writing = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    async read<T>(key: string): Promise<T | null> {
      try {
        const bag = await load();
        if (!(key in bag)) return null;
        return bag[key] as T;
      } catch {
        return null;
      }
    },
    async write<T>(key: string, value: T): Promise<void> {
      try {
        await queue(async () => {
          const bag = await load();
          bag[key] = JSON.parse(JSON.stringify(value)) as T;
          const db = await openPrefs(dbName);
          if (!db) return;
          await putBag(db, { version: 1, settings: bag });
        });
      } catch {
        // A private window or a closed tab. The choice still applies until reload.
      }
    },
    async readAll(): Promise<Record<string, unknown>> {
      const bag = await load();
      return JSON.parse(JSON.stringify(bag)) as Record<string, unknown>;
    },
    async replaceAll(next: Record<string, unknown>): Promise<void> {
      try {
        await queue(async () => {
          await load();
          settings = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
          const db = await openPrefs(dbName);
          if (!db) return;
          await putBag(db, { version: 1, settings });
        });
      } catch {
        // Same as a failed write: the in-memory copy is kept when IndexedDB is missing.
      }
    },
  };
}
