import { liveDeskNodes } from './registry';
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
