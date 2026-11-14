import { plainText } from './text';
import { deskHost } from '../host';
import { deskPrefStore, writeDeskPref } from '../storage/deskPrefs';
import type { DeskSet, DeskSetAdapter, DeskSetContext } from './types';

/** Listeners told that a pref was written behind the page's back (a set, `prefs.write`). */
const invalidators = new Set<(key: string) => void>();

export function onDeskPrefInvalidate(listener: (key: string) => void): () => void {
  invalidators.add(listener);
  return () => invalidators.delete(listener);
}

export function invalidateDeskPref(key: string): void {
  for (const listener of invalidators) listener(key);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Objects merge key by key. Arrays and scalars in `over` replace. */
export function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (!isPlain(base) || !isPlain(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = deepMerge(base[key], value);
  return out;
}

/** Replace `{name}` in every string and every key. */
export function substituteVars<T>(value: T, vars: Record<string, string | number>): T {
  const text = (input: string): string => input.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') return text(input);
    if (Array.isArray(input)) return input.map(walk);
    if (isPlain(input)) return Object.fromEntries(Object.entries(input).map(([key, item]) => [text(key), walk(item)]));
    return input;
  };
  return walk(value) as T;
}

/** The sets this one extends, flattened. Later entries win; the set's own parts win last. */
export function mergeSets(set: DeskSet, library: Record<string, DeskSet>, adapters: DeskSetAdapter[], seen: string[] = []): DeskSet {
  if (seen.includes(set.name)) throw new Error(`set ${set.name} extends itself (${seen.join(' > ')})`);
  let parts: Record<string, unknown> = {};
  const join = (next: Record<string, unknown>): void => {
    for (const [id, part] of Object.entries(next)) {
      const merge = adapters.find((adapter) => adapter.id === id)?.merge ?? deepMerge;
      parts[id] = parts[id] === undefined ? part : merge(parts[id], part);
    }
  };
  for (const name of set.extends ?? []) {
    const base = library[name];
    if (!base) throw new Error(`set ${set.name} extends ${name}, which is not loaded`);
    join(mergeSets(base, library, adapters, [...seen, set.name]).parts);
  }
  join(set.parts);
  parts = { ...parts };
  return { name: set.name, parts };
}

/** Built-in adapter: desk prefs (form layouts, grid prefs). The spec is `{ keys: string[] }`. */
export const deskPrefsAdapter: DeskSetAdapter = {
  id: 'deskPrefs',
  order: 80,
  async capture(spec) {
    const keys = isPlain(spec) && Array.isArray(spec.keys) ? (spec.keys as string[]) : [];
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = await deskPrefStore().read(key);
    return out;
  },
  async apply(part) {
    if (!isPlain(part)) return;
    for (const [key, value] of Object.entries(part)) {
      await writeDeskPref(key, value);
      invalidateDeskPref(key);
    }
  },
  async diff(part) {
    if (!isPlain(part)) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(part)) {
      const live = await deskPrefStore().read(key);
      if (JSON.stringify(live) !== JSON.stringify(value)) out[key] = { live, set: value };
    }
    return Object.keys(out).length > 0 ? out : null;
  },
};

/** Built-in adapter: chosen `localStorage` keys (shortcut set, theme, font size, UI mode). */
export const localStorageAdapter: DeskSetAdapter = {
  id: 'localStorage',
  order: 90,
  capture(spec) {
    const keys = isPlain(spec) && Array.isArray(spec.keys) ? (spec.keys as string[]) : (deskHost().automation?.localStorageKeys ?? []);
    const out: Record<string, string | null> = {};
    for (const key of keys) out[key] = localStorage.getItem(key);
    return Promise.resolve(out);
  },
  apply(part) {
    if (!isPlain(part)) return Promise.resolve();
    for (const [key, value] of Object.entries(part)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, plainText(value));
    }
    return Promise.resolve();
  },
  diff(part) {
    if (!isPlain(part)) return Promise.resolve(null);
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(part)) {
      const live = localStorage.getItem(key);
      if (live !== (value === null ? null : plainText(value))) out[key] = { live, set: value };
    }
    return Promise.resolve(Object.keys(out).length > 0 ? out : null);
  },
};

export function deskSetAdapters(): DeskSetAdapter[] {
  return [deskPrefsAdapter, localStorageAdapter, ...(deskHost().automation?.setAdapters?.() ?? [])].sort((a, b) => a.order - b.order);
}

export function setContext(): DeskSetContext {
  return { vars: deskHost().automation?.setVars?.() ?? {} };
}

/** Apply a set. Parts run in adapter order. Returns the ids applied. */
export async function applyDeskSet(set: DeskSet, library: Record<string, DeskSet> = {}, adapters = deskSetAdapters(), ctx = setContext()): Promise<string[]> {
  const merged = mergeSets(set, library, adapters);
  const done: string[] = [];
  for (const adapter of adapters) {
    const part = merged.parts[adapter.id];
    if (part === undefined) continue;
    await adapter.apply(substituteVars(part, ctx.vars), ctx);
    done.push(adapter.id);
  }
  const unknown = Object.keys(merged.parts).filter((id) => !adapters.some((adapter) => adapter.id === id));
  if (unknown.length > 0) throw new Error(`set ${set.name} has parts with no adapter: ${unknown.join(', ')}`);
  return done;
}

export async function diffDeskSet(set: DeskSet, library: Record<string, DeskSet> = {}, adapters = deskSetAdapters(), ctx = setContext()): Promise<Record<string, unknown>> {
  const merged = mergeSets(set, library, adapters);
  const out: Record<string, unknown> = {};
  for (const adapter of adapters) {
    const part = merged.parts[adapter.id];
    if (part === undefined) continue;
    const delta = await adapter.diff(substituteVars(part, ctx.vars), ctx);
    if (delta !== null) out[adapter.id] = delta;
  }
  return out;
}

/** Capture the live state. `spec` is `{ [adapterId]: adapterSpec }`; only listed adapters run. */
export async function captureDeskSet(name: string, spec: Record<string, unknown>, adapters = deskSetAdapters(), ctx = setContext()): Promise<DeskSet> {
  const parts: Record<string, unknown> = {};
  for (const adapter of adapters) {
    if (spec[adapter.id] === undefined) continue;
    parts[adapter.id] = await adapter.capture(spec[adapter.id], ctx);
  }
  return { name, parts };
}
