/** What the user sees, read from the DOM, so a test can compare it with the model. */

/** The text drawn in an element: an input's value, else its text, else its title. */
export function shownText(el: Element | null | undefined): string {
  if (!el) return '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent?.trim() ?? '';
  const input = el.querySelector('input, textarea');
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) return input.value;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text || el.getAttribute('title') || '';
}

export function isShown(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Node path of `document.activeElement`: the nearest ancestor with a path. */
export function focusPath(): string | null {
  const active = document.activeElement;
  if (!(active instanceof Element) || active === document.body) return null;
  const host = active.closest('[data-desk-path]');
  return host?.getAttribute('data-desk-path') ?? null;
}

export function focusInfo(): { path: string | null; tag: string; field: string | null; text: string } {
  const active = document.activeElement;
  if (!(active instanceof Element) || active === document.body) return { path: null, tag: 'body', field: null, text: '' };
  const field = active.closest('[data-desk-field]')?.getAttribute('data-desk-field') ?? null;
  return { path: focusPath(), tag: active.tagName.toLowerCase(), field, text: shownText(active) };
}

/** Paint of one field element: invalid state and the message drawn near it. */
export function invalidPaint(el: Element | null | undefined): { invalid: boolean; text: string } {
  if (!el) return { invalid: false, text: '' };
  const flagged = el.matches('[aria-invalid="true"], .is-invalid, .is-error') || el.querySelector('[aria-invalid="true"], .is-invalid, .is-error') !== null;
  const message = el.querySelector('.desk-field-error, .desk-error, [data-desk-issue]');
  return { invalid: flagged || message !== null, text: message ? shownText(message) : '' };
}

/** Rows of an open list (lookup, combo, context menu) with highlight and check state. */
export function listState(root: Element | null | undefined): { open: boolean; rows: { text: string; highlighted: boolean; checked: boolean }[] } {
  if (!root) return { open: false, rows: [] };
  const items = [...root.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemcheckbox"], li, .desk-lookup-row')];
  return {
    open: items.length > 0,
    rows: items.slice(0, 100).map((item) => ({
      text: shownText(item),
      highlighted: item.matches('.is-active, .is-highlight, .is-hot, [aria-selected="true"]'),
      checked: item.matches('.is-checked, [aria-checked="true"]') || item.querySelector('[aria-checked="true"], .is-checked') !== null,
    })),
  };
}
