/**
 * Where desk UI settings live. The framework ships an IndexedDB store and uses it unless the
 * host passes its own `prefs` to `configureDesk`. A host can keep settings on a server:
 * `readAll` loads once, and `write` or `replaceAll` send changes back.
 *
 * A store may be slow, so every call returns a promise. A failed read resolves to null or `{}`
 * and a failed write resolves; a setting that cannot be saved still applies until reload.
 */
export interface DeskPrefStore {
  /** The saved value for one key, or null when nothing is saved. */
  read: <T>(key: string) => Promise<T | null>;
  /** Save one key. The value is plain JSON. */
  write: <T>(key: string, value: T) => Promise<void>;
  /** Every saved key, for a download or a copy onto another browser. */
  readAll: () => Promise<Record<string, unknown>>;
  /** Replace every saved key. */
  replaceAll: (next: Record<string, unknown>) => Promise<void>;
}
