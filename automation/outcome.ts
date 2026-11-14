import { plainText } from './text';
import { waitDeskIdle } from './busy';
import { deskEventsSince, lastDeskEventId } from './events';
import { liveDeskNodes, opsOf, resolveDeskPath, type DeskResolved } from './registry';
import { focusPath } from './visible';
import type { DeskChange, DeskIssueView, DeskOutcome } from './types';

interface Marks {
  paths: Set<string>;
  briefs: Map<string, string>;
  issues: DeskIssueView[];
}

function marks(): Marks {
  const paths = new Set<string>();
  const briefs = new Map<string, string>();
  const issues: DeskIssueView[] = [];
  for (const node of liveDeskNodes()) {
    const path = node.path();
    if (node.kind === 'dialog' || node.kind === 'page' || node.kind === 'contextmenu' || node.kind === 'lookuplist') paths.add(path);
    if (!node.spec.brief) continue;
    let brief: unknown;
    try {
      brief = node.spec.brief();
    } catch {
      continue;
    }
    briefs.set(path, JSON.stringify(brief ?? null));
    const issue = brief && typeof brief === 'object' ? (brief as { issue?: unknown }).issue : undefined;
    if (typeof issue === 'string' && issue) issues.push({ path, text: issue });
  }
  return { paths, briefs, issues };
}

function parse(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function failure(error: string, reason?: string): DeskOutcome {
  return { ok: false, error, ...(reason ? { reason } : {}), changed: [], opened: [], closed: [], focus: focusPath(), issues: [], toasts: [] };
}

/** Result shapes ops may return: `{ ok: false, error }` is a refusal. */
function refusal(result: unknown): { error: string; reason?: string } | null {
  if (!result || typeof result !== 'object') return null;
  const record = result as { ok?: unknown; error?: unknown; reason?: unknown };
  if (record.ok !== false) return null;
  return { error: typeof record.error === 'string' ? record.error : 'refused', ...(typeof record.reason === 'string' ? { reason: record.reason } : {}) };
}

export interface DeskRunHooks {
  onStep?: (step: { path: string; op: string; args: Record<string, unknown>; outcome: DeskOutcome }) => void;
}

/**
 * Run one op and report what it changed. The page is idle before and after; the
 * outcome is the difference between the node state at those two moments.
 */
export async function runDeskOp(
  resolved: DeskResolved,
  op: string,
  args: Record<string, unknown>,
  hooks: DeskRunHooks = {},
): Promise<DeskOutcome> {
  if (!resolved.node) return failure(resolved.error ?? 'node not found', resolved.candidates?.length ? `use one of these exact paths: ${resolved.candidates.join(' | ')}` : 'call desk_fields to list the fields on the open page');
  const node = resolved.node;
  const def = opsOf(node)[op];
  if (!def) return failure(`${node.path()} has no op ${op}`, `ops: ${Object.keys(opsOf(node)).join(', ')}`);
  const merged: Record<string, unknown> = { ...args };
  if (resolved.row !== undefined && merged.row === undefined) merged.row = resolved.row;
  if (resolved.col !== undefined && merged.col === undefined) merged.col = resolved.col;
  for (const [name, spec] of Object.entries(def.args ?? {})) {
    if (!spec.optional && merged[name] === undefined) return failure(`op ${op} needs argument ${name}`);
  }
  await waitDeskIdle();
  const before = marks();
  const eventMark = lastDeskEventId();
  let result: unknown;
  let thrown: string | null = null;
  try {
    result = await def.run(merged);
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  await waitDeskIdle();
  const after = marks();
  const changed: DeskChange[] = [];
  for (const [path, text] of after.briefs) {
    if (before.briefs.get(path) !== text) changed.push({ path, from: parse(before.briefs.get(path)), to: parse(text) });
  }
  const events = deskEventsSince(eventMark, 200);
  const navigated = events.filter((event) => event.type === 'navigate').pop();
  const refused = refusal(result);
  const outcome: DeskOutcome = {
    ok: thrown === null && refused === null,
    ...(thrown ? { error: thrown } : {}),
    ...(refused ? { error: refused.error, ...(refused.reason ? { reason: refused.reason } : {}) } : {}),
    ...(result !== undefined && !refused ? { result } : {}),
    changed,
    opened: [...after.paths].filter((path) => !before.paths.has(path)),
    closed: [...before.paths].filter((path) => !after.paths.has(path)),
    focus: focusPath(),
    issues: after.issues,
    toasts: events.filter((event) => event.type === 'toast').map((event) => plainText(event.detail)),
    ...(navigated ? { navigated: plainText(navigated.detail) } : {}),
  };
  hooks.onStep?.({ path: node.path(), op, args, outcome });
  return outcome;
}

export async function actOnPath(path: string, op: string, args: Record<string, unknown>, hooks?: DeskRunHooks): Promise<DeskOutcome> {
  return runDeskOp(resolveDeskPath(path), op, args, hooks);
}
