import { plainText } from './text';
import { waitDeskIdle } from './busy';
import { deskEventsSince, lastDeskEventId } from './events';
import { liveDeskNodes, opsOf, resolveDeskPath, unreachableReason, type DeskResolved } from './registry';
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

/** An op checked and ready to run: its node, definition and arguments. */
interface Ready {
  node: NonNullable<DeskResolved['node']>;
  def: NonNullable<ReturnType<typeof opsOf>[string]>;
  args: Record<string, unknown>;
}

/** Resolves an op the way a person could do it now: the node exists, has the op, takes these arguments, and is not covered. */
function ready(resolved: DeskResolved, op: string, args: Record<string, unknown>): Ready | DeskOutcome {
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
  const covered = unreachableReason(node);
  if (covered) return failure(covered);
  return { node, def, args: merged };
}

const isReady = (value: Ready | DeskOutcome): value is Ready => 'def' in value;

/** The state an outcome is measured from (taken when the page is idle). */
interface DeskOpStart {
  before: Marks;
  eventMark: number;
}

async function start(): Promise<DeskOpStart> {
  await waitDeskIdle();
  return { before: marks(), eventMark: lastDeskEventId() };
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
  const checked = ready(resolved, op, args);
  if (!isReady(checked)) return checked;
  const begun = await start();
  let result: unknown;
  let thrown: string | null = null;
  try {
    result = await checked.def.run(checked.args);
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  return finish(begun, checked.node.path(), op, args, result, thrown, hooks);
}

const CLICK_MARK = 'data-desk-click';
let clickSeq = 0;

/**
 * For a person's click: the element to click for this op, marked so the testkit can find it (`selector`), and the
 * state the outcome is measured from (`start`). `{ click: false }` when the op has no element (the testkit runs it);
 * a refusal (`ok: false`) when it cannot be done now (covered, missing, disabled).
 */
export async function prepareDeskClick(path: string, op: string, args: Record<string, unknown>): Promise<{ click: true; selector: string; token: number } | { click: false } | DeskOutcome> {
  const checked = ready(resolveDeskPath(path), op, args);
  if (!isReady(checked)) return checked;
  if (!checked.def.target) return { click: false };
  const target = checked.def.target(checked.args);
  if (!target) return { click: false };
  if (!(target instanceof HTMLElement)) return failure(target.error, target.reason);
  if ((target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') {
    return failure(`${shownLabel(target)} is disabled right now`, target.getAttribute('title') ?? undefined);
  }
  for (const old of document.querySelectorAll(`[${CLICK_MARK}]`)) old.removeAttribute(CLICK_MARK);
  clickSeq += 1;
  target.setAttribute(CLICK_MARK, String(clickSeq));
  // Kept here (it holds sets and maps): the testkit passes the token back to `finishDeskClick`.
  started.clear();
  started.set(clickSeq, await start());
  return { click: true, selector: `[${CLICK_MARK}="${clickSeq}"]`, token: clickSeq };
}

const started = new Map<number, DeskOpStart>();

/** The outcome of a click the testkit made after `prepareDeskClick` (or its failure, when the click could not be made). */
export async function finishDeskClick(token: number, path: string, op: string, args: Record<string, unknown>, clickError: string | null, hooks: DeskRunHooks = {}): Promise<DeskOutcome> {
  for (const old of document.querySelectorAll(`[${CLICK_MARK}]`)) old.removeAttribute(CLICK_MARK);
  const begun = started.get(token);
  started.delete(token);
  if (!begun) return failure('this click was not prepared (prepareDeskClick first)');
  return finish(begun, path, op, args, undefined, clickError, hooks);
}

function shownLabel(el: HTMLElement): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim() || el.getAttribute('data-desk-field') || 'the button';
}

async function finish(begun: DeskOpStart, path: string, op: string, args: Record<string, unknown>, result: unknown, thrown: string | null, hooks: DeskRunHooks): Promise<DeskOutcome> {
  const { before, eventMark } = begun;
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
  hooks.onStep?.({ path, op, args, outcome });
  return outcome;
}

export async function actOnPath(path: string, op: string, args: Record<string, unknown>, hooks?: DeskRunHooks): Promise<DeskOutcome> {
  return runDeskOp(resolveDeskPath(path), op, args, hooks);
}
