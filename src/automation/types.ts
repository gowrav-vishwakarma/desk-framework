import type { MaybeRefOrGetter } from 'vue';

/** The kinds of node the driver knows. `custom` is the extension point for product meaning. */
export type DeskNodeKind =
  | 'page'
  | 'report'
  | 'reportDraft'
  | 'dialog'
  | 'tabs'
  | 'pane'
  | 'form'
  | 'zone'
  | 'field'
  | 'settings'
  | 'grid'
  | 'drawer'
  | 'foot'
  | 'filter'
  | 'menu'
  | 'toolbar'
  | 'contextmenu'
  | 'lookuplist'
  | 'layout'
  | 'pivot'
  | 'steps'
  | 'custom';

export interface DeskOpArg {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
  optional?: boolean;
  description?: string;
  enum?: string[];
}

/** One thing a node can do. Its `run` calls the component's own user path. */
export interface DeskOpDef {
  description: string;
  args?: Record<string, DeskOpArg>;
  run: (args: Record<string, unknown>) => unknown;
  /**
   * The element a person clicks for this op (a button), or a refusal when there is none to click. When given,
   * the testkit clicks it as a person does (a real pointer click, which fails when something covers it) instead
   * of calling `run`.
   */
  target?: (args: Record<string, unknown>) => HTMLElement | { ok: false; error: string; reason?: string } | null;
}

export interface DeskReadOptions {
  /** Row reads require a limit. The driver caps it at 100. */
  rows?: { offset?: number; limit?: number };
}

export interface DeskNodeSpec {
  kind: DeskNodeKind;
  name: MaybeRefOrGetter<string>;
  /** Full state, for `snapshot` and `read`. Keep it plain JSON. */
  read?: (options: DeskReadOptions) => Record<string, unknown>;
  /** Small state compared before and after an op. Defaults to `read` with no rows. */
  brief?: () => unknown;
  ops?: Record<string, DeskOpDef> | (() => Record<string, DeskOpDef>);
  /** The element that draws this node. It gets `data-desk-node` and `data-desk-path`. */
  el?: () => HTMLElement | null | undefined;
  /** For a surface that mounts closed (a dialog). Closed nodes and their children are left out. */
  open?: () => boolean;
  /** A modal layer. `top` resolves to the last open one. */
  modal?: boolean;
  /** Extra audit findings for this node. */
  audit?: () => string[];
}

export interface DeskNode {
  readonly uid: number;
  readonly kind: DeskNodeKind;
  readonly spec: DeskNodeSpec;
  readonly parent: DeskNode | null;
  name: () => string;
  segment: () => string;
  path: () => string;
  isOpen: () => boolean;
  ops: () => Record<string, DeskOpDef>;
}

export interface DeskIssueView {
  path: string;
  text: string;
}

export interface DeskChange {
  path: string;
  from: unknown;
  to: unknown;
}

/** What an op did, found by comparing node state before and after, once the page is idle. */
export interface DeskOutcome {
  ok: boolean;
  error?: string;
  reason?: string;
  result?: unknown;
  changed: DeskChange[];
  opened: string[];
  closed: string[];
  focus: string | null;
  issues: DeskIssueView[];
  toasts: string[];
  navigated?: string;
}

export interface DeskEvent {
  id: number;
  at: number;
  type: string;
  detail?: unknown;
}

export interface DeskAuditFinding {
  rule: string;
  path?: string;
  detail: string;
}

/** A part of a set: how to read, write and compare one slice of state. */
export interface DeskSetAdapter {
  id: string;
  /** Lower runs first. Apply order matters (settings before rows before prefs). */
  order: number;
  capture: (spec: unknown, ctx: DeskSetContext) => Promise<unknown>;
  apply: (part: unknown, ctx: DeskSetContext) => Promise<void>;
  /** What differs from the live state, or null when nothing does. */
  diff: (part: unknown, ctx: DeskSetContext) => Promise<unknown>;
  /** Combine two parts when sets extend each other. Default is a deep merge. */
  merge?: (base: unknown, over: unknown) => unknown;
}

export interface DeskSetContext {
  /** Placeholders such as `{userId}` replaced in keys and strings. */
  vars: Record<string, string | number>;
}

export interface DeskSet {
  name: string;
  extends?: string[];
  parts: Record<string, unknown>;
}

/** What a host passes through `configureDesk({ automation })`. Everything is optional but `enabled`. */
export interface DeskAutomationHost {
  enabled: () => boolean;
  /** `desk` for the standalone shell, `embed` for a desk page inside another shell. */
  hostKind?: () => 'desk' | 'embed';
  /** Go to a route. Returns the route reached. */
  navigate?: (target: string) => Promise<string>;
  /** Who is signed in and where, for agents. Plain JSON. */
  session?: () => Record<string, unknown>;
  /** Places an agent can go: id, label and path. */
  targets?: () => { id: string; label: string; path: string }[];
  /** Count of requests still in flight. The framework waits for zero. */
  pendingRequests?: () => number;
  /** More set parts the product knows how to read and write. */
  setAdapters?: () => DeskSetAdapter[];
  /** `localStorage` keys the set engine may capture. */
  localStorageKeys?: string[];
  /** Values for `{placeholders}` in sets. */
  setVars?: () => Record<string, string | number>;
}
