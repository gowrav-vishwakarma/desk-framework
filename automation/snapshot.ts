import { plainText } from './text';
import { childrenOf, liveDeskNodes } from './registry';
import type { DeskNode, DeskReadOptions } from './types';

export const ROW_LIMIT_CAP = 100;

export interface DeskSnapshotNode {
  path: string;
  kind: string;
  name: string;
  state?: Record<string, unknown>;
  children?: DeskSnapshotNode[];
}

export function capRows(options: DeskReadOptions | undefined): DeskReadOptions {
  const limit = Math.min(ROW_LIMIT_CAP, Math.max(1, Math.floor(options?.rows?.limit ?? 20)));
  const offset = Math.max(0, Math.floor(options?.rows?.offset ?? 0));
  return { rows: { limit, offset } };
}

export function readNode(node: DeskNode, options?: DeskReadOptions): Record<string, unknown> {
  try {
    return node.spec.read ? node.spec.read(capRows(options)) : {};
  } catch (error) {
    return { readError: error instanceof Error ? error.message : String(error) };
  }
}

export function snapshotNode(node: DeskNode, depth: number, options?: DeskReadOptions): DeskSnapshotNode {
  const out: DeskSnapshotNode = { path: node.path(), kind: node.kind, name: node.name() };
  const state = readNode(node, options);
  if (Object.keys(state).length > 0) out.state = state;
  if (depth !== 0) {
    const kids = childrenOf(node).map((child) => snapshotNode(child, depth - 1, options));
    if (kids.length > 0) out.children = kids;
  }
  return out;
}

export function snapshotRoots(depth: number, options?: DeskReadOptions): DeskSnapshotNode[] {
  return childrenOf(null).map((node) => snapshotNode(node, depth, options));
}

function oneLine(state: Record<string, unknown> | undefined): string {
  if (!state) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      const short = value.slice(0, 6).map((item) => (typeof item === 'object' ? (item && 'id' in item ? String((item as { id: unknown }).id) : '{}') : String(item)));
      parts.push(`${key}=[${short.join(',')}${value.length > 6 ? `,+${value.length - 6}` : ''}]`);
    } else if (typeof value === 'object') {
      parts.push(`${key}={${Object.keys(value).slice(0, 5).join(',')}}`);
    } else {
      parts.push(`${key}=${plainText(value)}`);
    }
  }
  return parts.join(' ');
}

/** A compact text tree an AI can read cheaply. */
export function outline(nodes: DeskSnapshotNode[], indent = 0): string {
  const lines: string[] = [];
  for (const item of nodes) {
    const state = oneLine(item.state);
    lines.push(`${'  '.repeat(indent)}${item.kind}:${item.name}${state ? ` ${state}` : ''}`);
    if (item.children) lines.push(outline(item.children, indent + 1));
  }
  return lines.join('\n');
}

export function nodeList(): { path: string; kind: string }[] {
  return liveDeskNodes().map((node) => ({ path: node.path(), kind: node.kind }));
}
