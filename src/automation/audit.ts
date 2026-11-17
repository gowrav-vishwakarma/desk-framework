import { liveDeskNodes, topDeskNode } from './registry';
import { isShown } from './visible';
import type { DeskAuditFinding } from './types';

const MUST_BE_NAMED = new Set(['grid', 'dialog', 'tabs', 'pivot', 'settings', 'form']);
const INTERACTIVE = 'button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
/**
 * Popups a field opens in `<body>` and drives from itself (a lookup's suggestion list: arrows, Enter, its ☆ by mouse):
 * their controls belong to the focused field's node, not to a node of their own.
 */
const FIELD_POPUPS = '.desk-suggest';

/**
 * Words that name no thing. A button id made only of them (`new`, `add-new`, `save`, `close`) says what it does but not
 * to what, so two of them meet on one page (a list's Add New under a dialog's own): ids name the thing too
 * (`charge-add-new`, `user-invite-save`). User, 2026-11-17: ids specific, unique on the page.
 */
const GENERIC_WORDS = new Set([
  'new', 'add', 'save', 'close', 'cancel', 'edit', 'delete', 'remove', 'ok', 'yes', 'no', 'back', 'next', 'previous', 'prev',
  'apply', 'clear', 'accept', 'refresh', 'submit', 'open', 'view', 'button', 'done', 'update', 'reset', 'more', 'all', 'and', 'and-close',
]);
const BUTTONS = 'button, [role="button"], a[href]';
/** Repeated per row by design (a row's own actions): ids repeat across rows, the row tells them apart. */
const PER_ROW = '[role="row"], tr, .desk-grid-row';

const slug = (text: string): string => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A button's id as the driver finds it: `data-desk-action`, then `data-desk-field`, then its label. */
function buttonId(el: Element): string {
  const own = el.getAttribute('data-desk-action') ?? el.getAttribute('data-desk-field');
  return own ?? slug(el.getAttribute('aria-label') ?? el.textContent ?? '');
}

/**
 * A button id has at least two words, `thing-action` (`charge-add-new`, `pivot-calc-save`): one word cannot say both
 * what it acts on and what it does (user, 2026-11-17: so ids are specific by rule, for people and AI models alike).
 */
export const deskButtonIdProblem = (id: string): string | null => {
  const words = id.split(/[-:]/).filter(Boolean);
  if (words.length < 2) return `button id "${id}" is one word: use thing-action (e.g. charge-${id || 'add-new'})`;
  if (words.every((word) => GENERIC_WORDS.has(word))) return `button id "${id}" names no thing: name what it acts on (e.g. charge-${id})`;
  return null;
};

/** Buttons a person can reach now: in the top dialog when one is open, else on the page; shown, not per row. */
function reachableButtons(): Element[] {
  const top = topDeskNode();
  const layer = top?.kind === 'dialog' ? top.spec.el?.() ?? null : document.body;
  if (!layer) return [];
  return [...layer.querySelectorAll(BUTTONS)].filter((el) => isShown(el) && el.closest(PER_ROW) === null && el.closest('[data-desk-audit-ignore]') === null);
}

/** Generic button ids, and ids two reachable buttons share (a test or a person's tool could press the wrong one). */
function idFindings(): DeskAuditFinding[] {
  const findings: DeskAuditFinding[] = [];
  const byId = new Map<string, Element[]>();
  for (const el of reachableButtons()) {
    const id = buttonId(el);
    if (!id) continue;
    byId.set(id, [...(byId.get(id) ?? []), el]);
  }
  for (const [id, els] of byId) {
    const where = els[0]?.closest('[data-desk-path]')?.getAttribute('data-desk-path') ?? undefined;
    const problem = deskButtonIdProblem(id);
    if (problem) findings.push({ rule: 'button-id', ...(where ? { path: where } : {}), detail: problem });
    if (els.length > 1) findings.push({ rule: 'duplicate-id', ...(where ? { path: where } : {}), detail: `${els.length} buttons reachable at once share the id "${id}"` });
  }
  return findings;
}

/**
 * Coverage check. A control with no node, a repeated surface with no name, or a duplicate
 * path is a finding. The auto-tester fails on any finding, so new UI must register first.
 */
export function auditDesk(limit = 50): DeskAuditFinding[] {
  const findings: DeskAuditFinding[] = [];
  const seen = new Map<string, number>();
  for (const node of liveDeskNodes()) {
    const path = node.path();
    seen.set(path, (seen.get(path) ?? 0) + 1);
    if (MUST_BE_NAMED.has(node.kind) && (node.name() === 'unnamed' || node.name() === '')) {
      findings.push({ rule: 'unnamed', path, detail: `${node.kind} has no name` });
    }
    for (const detail of node.spec.audit?.() ?? []) findings.push({ rule: 'node', path, detail });
  }
  for (const [path, count] of seen) {
    if (count > 1) findings.push({ rule: 'duplicate-path', path, detail: `${count} nodes share this path` });
  }
  for (const dialog of document.querySelectorAll('.desk-dialog')) {
    if (!isShown(dialog)) continue;
    if (!dialog.hasAttribute('data-desk-path') && dialog.querySelector('[data-desk-path]') === null) {
      findings.push({ rule: 'dialog-without-node', detail: dialog.getAttribute('aria-label') ?? dialog.className });
    }
  }
  findings.push(...idFindings());
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (findings.length >= limit) break;
    if (!isShown(el)) continue;
    if (el.closest('[data-desk-path]')) continue;
    if (el.closest('[data-desk-audit-ignore]')) continue;
    if (el.closest(FIELD_POPUPS)) continue;
    const label = el.getAttribute('aria-label') ?? el.getAttribute('data-desk-field') ?? el.textContent?.trim().slice(0, 30) ?? '';
    findings.push({ rule: 'outside-node', detail: `${el.tagName.toLowerCase()} ${label}`.trim() });
  }
  return findings.slice(0, limit);
}
