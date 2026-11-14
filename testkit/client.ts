import type { DeskAuditFinding, DeskOutcome, DeskPage, DeskRows, DeskSetSpec } from './types';

/** `window.__desk` called from Node. Every call is one `page.evaluate`, so the page does the work and Node reads JSON. */
export interface DeskClient {
  /** The open nodes as a tree. `path` limits it, `depth` bounds it. */
  snapshot(args?: { path?: string; depth?: number; rows?: DeskRows }): Promise<unknown>;
  describe(path?: string): Promise<{ path: string; kind: string; name: string; ops: { name: string; description: string; args: Record<string, unknown> }[]; children: string[] }>;
  read<T = Record<string, unknown>>(path: string, rows?: DeskRows): Promise<T>;
  act(path: string, op: string, args?: Record<string, unknown>): Promise<DeskOutcome>;
  /** `act(path, 'set', { value })`: the field's own user path. */
  fill(path: string, value: unknown): Promise<DeskOutcome>;
  fillForm(path: string, values: Record<string, unknown>): Promise<DeskOutcome[]>;
  press(combo: string): Promise<{ combo: string; defaultPrevented: boolean }>;
  type(text: string): Promise<unknown>;
  navigate(target: string): Promise<{ ok: boolean; reached?: string; error?: string }>;
  waitIdle(): Promise<unknown>;
  audit(): Promise<DeskAuditFinding[]>;
  events(since?: number): Promise<{ id: number; type: string; detail?: unknown }[]>;
  /** Every field under a node (default the topmost page or dialog): path, label, editor, value, issue, options. */
  /** Grid rows as shown: sample, page, text match or keys; JSON or CSV. `path` may hold exactly one grid. */
  rows(path?: string, args?: { offset?: number; limit?: number; columns?: string[]; match?: string | Record<string, string>; keys?: string[]; format?: 'json' | 'csv' }): Promise<Record<string, unknown>>;
  fields(path?: string): Promise<Record<string, unknown>[]>;
  targets(): Promise<{ id: string; label: string; path: string }[]>;
  session(): Promise<Record<string, unknown>>;
  help(): Promise<unknown>;
  sets: {
    register(set: DeskSetSpec): Promise<void>;
    apply(set: string | DeskSetSpec): Promise<unknown>;
    diff(set: string | DeskSetSpec): Promise<unknown>;
    capture(name: string, spec: Record<string, unknown>): Promise<DeskSetSpec>;
  };
  prefs: {
    readAll(): Promise<Record<string, unknown>>;
    write(key: string, value: unknown): Promise<unknown>;
    replaceAll(next: Record<string, unknown>): Promise<unknown>;
  };
  /** Any driver call by dotted name, for calls the typed surface does not list. */
  call<R = unknown>(method: string, ...args: unknown[]): Promise<R>;
}

interface DriverWindow {
  __desk?: Record<string, unknown>;
}

export function createDeskClient(page: DeskPage): DeskClient {
  async function call<R>(method: string, ...args: unknown[]): Promise<R> {
    return page.evaluate(
      async (input: { method: string; args: unknown[] }) => {
        const driver = (window as unknown as DriverWindow).__desk;
        if (!driver) throw new Error('window.__desk is missing: open the page with ?deskAutomation=1, or set window.__DESK_AUTOMATION__ before it loads');
        const fn = input.method.split('.').reduce<unknown>((target, part) => (target as Record<string, unknown> | undefined)?.[part], driver);
        if (typeof fn !== 'function') throw new Error(`the desk driver has no ${input.method}`);
        return (await (fn as (...a: unknown[]) => unknown)(...input.args)) as R;
      },
      { method, args },
    );
  }
  return {
    call,
    snapshot: (args = {}) => call('snapshot', args),
    describe: (path = '') => call('describe', path),
    read: (path, rows) => call('read', path, rows),
    act: (path, op, args = {}) => call('act', path, op, args),
    fill: (path, value) => call('fill', path, value),
    fillForm: (path, values) => call('fillForm', path, values),
    press: (combo) => call('keys.press', combo),
    type: (text) => call('keys.type', text),
    navigate: (target) => call('navigate', target),
    waitIdle: () => call('waitIdle'),
    audit: () => call('audit'),
    events: (since = 0) => call('events.since', since),
    rows: (path = 'top', args = {}) => call('rows', path, args),
    fields: (path = 'top') => call('fields', path),
    targets: () => call('targets'),
    session: async () => {
      const host = await call<{ session: Record<string, unknown> | null }>('host');
      return host.session ?? {};
    },
    help: () => call('help'),
    sets: {
      register: (set) => call('sets.register', set),
      apply: (set) => call('sets.apply', set),
      diff: (set) => call('sets.diff', set),
      capture: (name, spec) => call('sets.capture', name, spec),
    },
    prefs: {
      readAll: () => call('prefs.readAll'),
      write: (key, value) => call('prefs.write', key, value),
      replaceAll: (next) => call('prefs.replaceAll', next),
    },
  };
}
