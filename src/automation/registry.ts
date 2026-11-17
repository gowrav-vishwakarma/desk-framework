import { inject, onMounted, onUnmounted, onUpdated, provide, toValue, type InjectionKey } from 'vue';
import { deskHost } from '../host';
import type { DeskNode, DeskNodeKind, DeskNodeSpec, DeskOpDef } from './types';

export const DESK_AUTOMATION_PARENT: InjectionKey<DeskNode | null> = Symbol('desk-automation-parent');

const nodes = new Map<number, DeskNode>();
let nextUid = 1;

export function deskAutomationEnabled(): boolean {
  try {
    return deskHost().automation?.enabled() === true;
  } catch {
    return false;
  }
}

function clean(text: string): string {
  return text.trim().replace(/[\s/]+/g, '-');
}

/** Siblings that share a kind and name get `~2`, `~3` in registration order. */
function siblingSuffix(node: DeskNode): string {
  const same = [...nodes.values()].filter(
    (other) => other.parent === node.parent && other.kind === node.kind && other.name() === node.name(),
  );
  const index = same.indexOf(node);
  return index > 0 ? `~${index + 1}` : '';
}

export function registerDeskNode(spec: DeskNodeSpec, parent: DeskNode | null): DeskNode {
  const uid = nextUid;
  nextUid += 1;
  const node: DeskNode = {
    uid,
    kind: spec.kind,
    spec,
    parent,
    name: () => clean(toValue(spec.name) || 'unnamed'),
    segment: () => `${spec.kind}:${node.name()}${siblingSuffix(node)}`,
    path: () => (parent ? `${parent.path()}/${node.segment()}` : node.segment()),
    isOpen: () => (spec.open ? spec.open() && (parent ? parent.isOpen() : true) : parent ? parent.isOpen() : true),
    ops: () => (typeof spec.ops === 'function' ? spec.ops() : (spec.ops ?? {})),
  };
  nodes.set(uid, node);
  return node;
}

export function unregisterDeskNode(node: DeskNode): void {
  nodes.delete(node.uid);
}

export function allDeskNodes(): DeskNode[] {
  return [...nodes.values()];
}

/** Live nodes only: a closed dialog and everything under it is left out. */
export function liveDeskNodes(): DeskNode[] {
  return allDeskNodes().filter((node) => node.isOpen());
}

export function childrenOf(node: DeskNode | null): DeskNode[] {
  return liveDeskNodes().filter((item) => item.parent === node);
}

function stamp(node: DeskNode): void {
  const el = node.spec.el?.();
  if (!el) return;
  el.setAttribute('data-desk-node', `${node.kind}:${node.name()}`);
  el.setAttribute('data-desk-path', node.path());
}

/** Re-stamp every element, for example after a name or an ancestor changes. */
export function restampDeskNodes(): void {
  for (const node of liveDeskNodes()) stamp(node);
}

export interface DeskNodeHandle {
  node: DeskNode | null;
  /** Put the attributes on the element again. */
  stamp: () => void;
  path: () => string;
}

/**
 * Register this component as a node of the automation tree. The parent is the nearest
 * ancestor node, so nesting follows the component tree to any depth. Does nothing, and
 * costs nothing, while automation is off.
 */
export function useDeskAutomationNode(spec: DeskNodeSpec): DeskNodeHandle {
  if (!deskAutomationEnabled()) return { node: null, stamp: () => undefined, path: () => '' };
  const parent = inject(DESK_AUTOMATION_PARENT, null);
  const node = registerDeskNode(spec, parent);
  provide(DESK_AUTOMATION_PARENT, node);
  const doStamp = (): void => stamp(node);
  onMounted(doStamp);
  onUpdated(doStamp);
  onUnmounted(() => unregisterDeskNode(node));
  return { node, stamp: doStamp, path: () => node.path() };
}

/** Parse `kind:name/kind:name`. A bare `kind` matches any name. */
function tokens(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function tokenMatches(segment: string, token: string): boolean {
  if (segment === token) return true;
  const [kind, ...rest] = token.split(':');
  const name = rest.join(':');
  if (!name) return segment.startsWith(`${kind}:`);
  // `grid:items` also matches `grid:items~2`? No: the suffix is part of the identity.
  return false;
}

export interface DeskResolved {
  node: DeskNode | null;
  /** Row and column tokens at the end of the path, handed to the op as arguments. */
  row?: string;
  col?: string;
  error?: string;
  candidates?: string[];
}

/** The last open modal node, or the page node when nothing modal is open. */
export function topDeskNode(): DeskNode | null {
  const live = liveDeskNodes();
  for (let index = live.length - 1; index >= 0; index -= 1) {
    const node = live[index];
    if (node && node.kind === 'dialog' && node.spec.modal !== false && node.isOpen()) return node;
  }
  for (let index = live.length - 1; index >= 0; index -= 1) {
    const node = live[index];
    if (node && node.kind === 'page') return node;
  }
  return null;
}

/** Surfaces a person reaches over an open dialog: they open on top of it (context menus, lookup lists). */
const OVER_DIALOGS = new Set<string>(['contextmenu', 'lookuplist']);

/**
 * Why a person cannot reach a node now, or null: an open modal dialog covers everything that is not in it (or on
 * top of it). An act on a covered node is refused, as a person cannot click or type there.
 */
export function unreachableReason(node: DeskNode): string | null {
  const top = topDeskNode();
  if (!top || top.kind !== 'dialog' || node === top || isDescendant(node, top)) return null;
  for (let at: DeskNode | null = node; at; at = at.parent) if (OVER_DIALOGS.has(at.kind)) return null;
  // A dialog opened over this one is the cover only when it was opened later (it is the top one).
  return `${node.path()} is covered by the dialog ${top.path()}: close it first, as a person would`;
}

function isDescendant(node: DeskNode, ancestor: DeskNode): boolean {
  let at: DeskNode | null = node.parent;
  while (at) {
    if (at === ancestor) return true;
    at = at.parent;
  }
  return false;
}

/**
 * What the caller most likely meant when a path matched nothing: nodes with the same name under another kind
 * (`form:from` for `field:from`), then the fields of the nearest container that does resolve. Paths are exact.
 */
function suggestDeskPaths(parts: string[]): string[] {
  const live = liveDeskNodes();
  const last = parts[parts.length - 1] ?? '';
  const name = last.includes(':') ? last.slice(last.indexOf(':') + 1) : last;
  const sameName = live.filter((node) => node.name() === name).map((node) => node.path());
  if (sameName.length > 0) return sameName.slice(0, 8);
  const top = topDeskNode();
  let container: DeskNode | null = top;
  if (parts.length > 1) {
    const inner = resolveDeskPath(parts.slice(0, -1).join('/'));
    if (inner.node) container = inner.node;
  }
  if (!container) return [];
  const from = container;
  return live.filter((node) => node.kind === 'field' && isDescendant(node, from)).map((node) => node.path()).slice(0, 30);
}

/**
 * Find one node. Accepts a full path, any trailing part of it (`grid:items`), or `top/...`.
 * A trailing `row:<key>` and `col:<id>` are returned beside the node. More than one match
 * is an error that lists the candidates.
 */
export function resolveDeskPath(path: string): DeskResolved {
  const parts = tokens(path);
  let row: string | undefined;
  let col: string | undefined;
  while (parts.length > 0) {
    const last = parts[parts.length - 1] ?? '';
    if (last.startsWith('col:')) col = last.slice(4);
    else if (last.startsWith('row:')) row = last.slice(4);
    else break;
    parts.pop();
  }
  const withCell = (node: DeskNode | null, error?: string, candidates?: string[]): DeskResolved => ({
    node,
    ...(row !== undefined ? { row } : {}),
    ...(col !== undefined ? { col } : {}),
    ...(error ? { error } : {}),
    ...(candidates ? { candidates } : {}),
  });
  if (parts.length === 0) return withCell(null, 'empty path');
  let scope = liveDeskNodes();
  if (parts[0] === 'top') {
    const top = topDeskNode();
    if (!top) return withCell(null, 'nothing is open');
    parts.shift();
    if (parts.length === 0) return withCell(top);
    scope = scope.filter((node) => isDescendant(node, top));
  }
  const found = scope.filter((node) => {
    let at: DeskNode | null = node;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const token = parts[index] ?? '';
      if (!at) return false;
      if (!tokenMatches(at.segment(), token)) {
        if (index === parts.length - 1) return false;
        // Allow skipping levels between tokens.
        at = at.parent;
        index += 1;
        continue;
      }
      at = at.parent;
    }
    return true;
  });
  if (found.length === 0) return withCell(null, `no node matches ${path}`, suggestDeskPaths(parts));
  if (found.length > 1) {
    // Prefer the deepest-open modal when the short form is ambiguous across layers.
    const top = topDeskNode();
    const inTop = top ? found.filter((node) => node === top || isDescendant(node, top)) : [];
    if (inTop.length === 1) return withCell(inTop[0] ?? null);
    return withCell(null, `${path} matches ${found.length} nodes; use a longer path`, found.map((node) => node.path()));
  }
  return withCell(found[0] ?? null);
}

export function opsOf(node: DeskNode): Record<string, DeskOpDef> {
  return node.ops();
}

export function nodeKindsPresent(): DeskNodeKind[] {
  return [...new Set(liveDeskNodes().map((node) => node.kind))];
}
