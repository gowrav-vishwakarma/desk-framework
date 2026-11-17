import { plainText } from './text';
import { deskHost } from '../host';
import { readDeskUi, replaceDeskUi, writeDeskPref, readDeskPref } from '../storage/deskPrefs';
import { auditDesk } from './audit';
import { pendingDeskWork, waitDeskIdle } from './busy';
import { deskTestSetsOpen } from './testSets';
import { deskEvent, deskEventsSince, lastDeskEventId } from './events';
import { pressDeskKey, typeDeskText } from './keys';
import { actOnPath, finishDeskClick, prepareDeskClick, runDeskOp } from './outcome';
import { recordDeskAct, startDeskRecording, stopDeskRecording } from './record';
import { childrenOf, deskAutomationEnabled, liveDeskNodes, opsOf, resolveDeskPath, topDeskNode, nodeKindsPresent } from './registry';
import { applyDeskSet, captureDeskSet, deskSetAdapters, diffDeskSet, invalidateDeskPref } from './sets';
import { nodeList, outline, readNode, snapshotNode, snapshotRoots } from './snapshot';
import type { DeskNode, DeskOutcome, DeskReadOptions, DeskSet } from './types';
import { focusInfo, focusPath } from './visible';

export const DESK_DRIVER_VERSION = 1;

export interface SnapshotArgs {
  path?: string;
  depth?: number;
  format?: 'json' | 'outline';
  rows?: { offset?: number; limit?: number };
}

function describeNode(node: DeskNode): Record<string, unknown> {
  return {
    path: node.path(),
    kind: node.kind,
    name: node.name(),
    ops: Object.entries(opsOf(node)).map(([name, def]) => ({ name, description: def.description, args: def.args ?? {} })),
    children: childrenOf(node).map((child) => child.path()),
  };
}

function fieldsUnder(form: DeskNode): DeskNode[] {
  const out: DeskNode[] = [];
  const walk = (node: DeskNode): void => {
    for (const child of childrenOf(node)) {
      if (child.kind === 'field') out.push(child);
      else walk(child);
    }
  };
  walk(form);
  return out;
}

export function createDeskDriver() {
  const library: Record<string, DeskSet> = {};
  const hooks = { onStep: (step: { path: string; op: string; args: Record<string, unknown>; outcome: DeskOutcome }) => recordDeskAct(step.path, step.op, step.args, step.outcome) };

  async function act(path: string, op: string, args: Record<string, unknown> = {}): Promise<DeskOutcome> {
    return actOnPath(path, op, args, hooks);
  }

  const driver = {
    version: DESK_DRIVER_VERSION,
    enabled: () => deskAutomationEnabled(),
    host: () => ({ kind: deskHost().automation?.hostKind?.() ?? 'desk', session: deskHost().automation?.session?.() ?? null }),
    help: () => ({
      version: DESK_DRIVER_VERSION,
      kinds: nodeKindsPresent(),
      paths: 'kind:name segments joined by /. A trailing part works when unique (grid:items). `top` is the topmost dialog or page. Trailing row:<key>/col:<id> become args.',
      calls: ['snapshot', 'describe', 'act', 'click.prepare', 'click.finish', 'fill', 'fillForm', 'waitIdle', 'keys.press', 'keys.type', 'focus', 'audit', 'events.since', 'record.start', 'record.stop', 'sets.capture', 'sets.apply', 'sets.diff', 'navigate', 'targets', 'fields', 'rows', 'prefs.readAll', 'prefs.write', 'prefs.replaceAll'],
    }),
    nodes: () => nodeList(),
    /** A person's click, made by the testkit: `prepare` marks the element (or refuses, or says there is none), `finish` reports what the click changed. */
    click: {
      prepare: (path: string, op: string, args: Record<string, unknown> = {}) => prepareDeskClick(path, op, args),
      finish: (token: number, path: string, op: string, args: Record<string, unknown> = {}, clickError: string | null = null) => finishDeskClick(token, path, op, args, clickError, hooks),
    },
    top: () => topDeskNode()?.path() ?? null,
    describe(path?: string) {
      if (!path) return childrenOf(null).map(describeNode);
      const resolved = resolveDeskPath(path);
      if (!resolved.node) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] };
      return describeNode(resolved.node);
    },
    snapshot(args: SnapshotArgs = {}) {
      const options: DeskReadOptions = { rows: args.rows ?? { limit: 20 } };
      const depth = args.depth ?? -1;
      if (args.path) {
        const resolved = resolveDeskPath(args.path);
        if (!resolved.node) return { ok: false, error: resolved.error ?? `no node matches ${args.path}`, candidates: resolved.candidates ?? [], reason: 'call snapshot with no path to see the open page' };
        const tree = [snapshotNode(resolved.node, depth, options)];
        return args.format === 'outline' ? outline(tree) : tree;
      }
      const tree = snapshotRoots(depth, options);
      if (tree.length === 0) {
        return {
          ok: false,
          error: 'no Desk nodes are registered on this page',
          reason: deskAutomationEnabled() ? `the page at ${window.location.hash} registered nothing yet; wait_idle, then try again` : 'automation is off on this page',
          pending: pendingDeskWork(),
        };
      }
      return args.format === 'outline' ? outline(tree) : tree;
    },
    read(path: string, rows?: { offset?: number; limit?: number }) {
      const resolved = resolveDeskPath(path);
      if (!resolved.node) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] };
      return readNode(resolved.node, rows ? { rows } : undefined);
    },
    act,
    fill: (path: string, value: unknown) => act(path, 'set', { value }),
    async fillForm(path: string, values: Record<string, unknown>): Promise<DeskOutcome[]> {
      const resolved = resolveDeskPath(path);
      if (!resolved.node) return [{ ok: false, error: resolved.error ?? 'form not found', changed: [], opened: [], closed: [], focus: focusPath(), issues: [], toasts: [] }];
      const fields = fieldsUnder(resolved.node);
      const out: DeskOutcome[] = [];
      for (const [name, value] of Object.entries(values)) {
        const field = fields.find((item) => item.name() === name);
        if (!field) {
          out.push({ ok: false, error: `no field ${name} under ${resolved.node.path()}`, reason: `fields: ${fields.map((item) => item.name()).join(', ')}`, changed: [], opened: [], closed: [], focus: focusPath(), issues: [], toasts: [] });
          continue;
        }
        out.push(await runDeskOp({ node: field }, 'set', { value }, hooks));
      }
      return out;
    },
    /**
     * Rows of a grid as shown, without going through an op outcome. `path` may be the grid or anything holding
     * exactly one grid (the page, a report). See the grid's `rows` op for the arguments.
     */
    rows(path = 'top', args: Record<string, unknown> = {}) {
      const resolved = resolveDeskPath(path || 'top');
      if (!resolved.node) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] };
      const walk = (node: DeskNode): DeskNode[] => childrenOf(node).flatMap((child) => (child.kind === 'grid' ? [child] : walk(child)));
      const grids = resolved.node.kind === 'grid' ? [resolved.node] : walk(resolved.node);
      if (grids.length !== 1) {
        return { ok: false, error: grids.length === 0 ? `no grid under ${resolved.node.path()}` : `${grids.length} grids under ${resolved.node.path()}; name one`, candidates: grids.map((grid) => grid.path()) };
      }
      const grid = grids[0]!;
      const op = opsOf(grid).rows;
      if (!op) return { ok: false, error: `${grid.path()} cannot list rows` };
      return { grid: grid.path(), ...(op.run(args) as Record<string, unknown>) };
    },
    /** Every field under a node (default: the topmost page or dialog), flat, with the path to use and what it accepts. */
    fields(path = 'top') {
      const resolved = resolveDeskPath(path || 'top');
      if (!resolved.node) return { ok: false, error: resolved.error, candidates: resolved.candidates ?? [] };
      return fieldsUnder(resolved.node).map((field) => {
        const read = readNode(field);
        return {
          path: field.path(),
          name: field.name(),
          label: read.label ?? null,
          editor: read.editor ?? null,
          value: read.value ?? null,
          shown: read.shown ?? null,
          required: read.required === true,
          readonly: read.readonly === true,
          invalid: read.invalid === true,
          issue: read.issue ?? null,
          ...(read.options ? { options: read.options } : {}),
        };
      });
    },
    async waitIdle() {
      return waitDeskIdle();
    },
    pending: () => pendingDeskWork(),
    keys: {
      press: (combo: string) => pressDeskKey(combo),
      type: (text: string) => typeDeskText(text),
    },
    focus: () => focusInfo(),
    audit: () => auditDesk(),
    events: { since: (id = 0, limit = 100) => deskEventsSince(id, limit), last: () => lastDeskEventId() },
    record: { start: () => startDeskRecording(), stop: () => stopDeskRecording() },
    targets: () => deskHost().automation?.targets?.() ?? [],
    async navigate(target: string) {
      const go = deskHost().automation?.navigate;
      if (!go) return { ok: false, error: 'this host has no navigate' };
      // A person cannot go elsewhere while a modal dialog is open (it covers the menu): neither can a test. Going
      // anyway changed the route under the dialog, and later steps drove the dialog left on top.
      const top = topDeskNode();
      if (top?.kind === 'dialog') return { ok: false, error: `a dialog is open (${top.path()}): close it first, as a person would` };
      const reached = await go(target);
      deskEvent('navigate', reached);
      await waitDeskIdle();
      return { ok: true, reached };
    },
    sets: {
      register(set: DeskSet) {
        library[set.name] = set;
      },
      library: () => Object.keys(library),
      capture: (name: string, spec: Record<string, unknown>) => captureDeskSet(name, spec),
      async apply(set: DeskSet | string) {
        const target = typeof set === 'string' ? library[set] : set;
        if (!target) return { ok: false, error: `unknown set ${plainText(set)}` };
        const parts = await applyDeskSet(target, library);
        await waitDeskIdle();
        return { ok: true, parts };
      },
      async diff(set: DeskSet | string) {
        const target = typeof set === 'string' ? library[set] : set;
        if (!target) return { ok: false, error: `unknown set ${plainText(set)}` };
        return { ok: true, diff: await diffDeskSet(target, library) };
      },
      adapters: () => deskSetAdapters().map((adapter) => adapter.id),
      dialog: (open = true) => {
        deskTestSetsOpen.value = open;
      },
    },
    prefs: {
      readAll: () => readDeskUi(),
      read: (key: string) => readDeskPref(key),
      async write(key: string, value: unknown) {
        await writeDeskPref(key, value);
        invalidateDeskPref(key);
        return { ok: true };
      },
      async replaceAll(next: Record<string, unknown>) {
        await replaceDeskUi(next);
        for (const key of Object.keys(next)) invalidateDeskPref(key);
        return { ok: true };
      },
    },
    count: () => liveDeskNodes().length,
  };
  return driver;
}

export type DeskDriver = ReturnType<typeof createDeskDriver>;

declare global {
  interface Window {
    __desk?: DeskDriver;
  }
}

/** Put the driver on `window.__desk`. Call it once at start-up; it does nothing while automation is off. */
export function installDeskDriver(): DeskDriver | null {
  if (typeof window === 'undefined' || !deskAutomationEnabled()) return null;
  if (!window.__desk) window.__desk = createDeskDriver();
  return window.__desk;
}
