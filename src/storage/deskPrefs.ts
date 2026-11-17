/**
 * UI settings that should survive a reload and a logout: form layouts, the item-grid corner
 * menu, saved checklists, grid columns, and the same kind of choice on later pages.
 * They go through one `DeskPrefStore`. The host picks it with `configureDesk({ prefs })`.
 * Without one, they share a single IndexedDB record, so a download is that one object.
 * This is not the autocomplete cache, which is cleared with the session.
 * Shortcuts and the theme stay in `localStorage`, because the first paint needs them at once.
 */
import { deskHost } from '../host';
import { createIndexedDbPrefStore } from './indexedDbPrefStore';
import type { DeskPrefStore } from './prefStore';

/** Database used when the host passes no store. */
export const DEFAULT_PREF_DB = 'desk-prefs';

let fallback: DeskPrefStore | null = null;

/** The store in use: the host's, or the IndexedDB default. */
export function deskPrefStore(): DeskPrefStore {
  const host = deskHost().prefs;
  if (host) return host;
  fallback = fallback ?? createIndexedDbPrefStore({ dbName: DEFAULT_PREF_DB });
  return fallback;
}

/** The stored value, or null when nothing is saved or the store cannot be read. */
export async function readDeskPref<T>(key: string): Promise<T | null> {
  try {
    return await deskPrefStore().read<T>(key);
  } catch {
    return null;
  }
}

/** Save one setting. A failure is swallowed; the choice still applies until reload. */
export async function writeDeskPref<T>(key: string, value: T): Promise<void> {
  try {
    await deskPrefStore().write(key, value);
  } catch {
    // The store is unreachable. The caller keeps its in-memory value.
  }
}

/**
 * Read a setting that older builds kept in `localStorage`. If the store has nothing and the old
 * key holds JSON, that value is copied into the store once and returned.
 */
export async function readDeskPrefOrLocal<T>(key: string, localKey: string): Promise<T | null> {
  const saved = await readDeskPref<T>(key);
  if (saved !== null) return saved;
  try {
    const old = localStorage.getItem(localKey);
    if (old === null) return null;
    const value = JSON.parse(old) as T;
    await writeDeskPref(key, value);
    return value;
  } catch {
    return null;
  }
}

/** Every UI setting, for a download or a copy onto another browser. */
export async function readDeskUi(): Promise<Record<string, unknown>> {
  return deskPrefStore().readAll();
}

/** Replace every UI setting. Pages pick up the new values on the next visit. */
export async function replaceDeskUi(next: Record<string, unknown>): Promise<void> {
  try {
    await deskPrefStore().replaceAll(next);
  } catch {
    // Same as a failed write.
  }
}
