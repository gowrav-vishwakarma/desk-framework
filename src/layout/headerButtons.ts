export interface DeskHeaderButton {
  id: string;
  label: string;
  disabled: boolean;
  /** Not permitted for this user (`data-desk-denied`), apart from a button that is only unavailable now. */
  denied?: true;
  /** Why it is disabled, as its tooltip says. */
  reason?: string;
}

const slug = (text: string): string => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buttonId(el: HTMLElement, label: string): string {
  return el.dataset.deskAction ?? el.dataset.deskField ?? (slug(label) || 'button');
}

function visibleButtons(root: HTMLElement | null): { el: HTMLElement; button: DeskHeaderButton }[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
      const reason = disabled ? el.getAttribute('title') ?? undefined : undefined;
      const denied = el.dataset.deskDenied === 'true' ? ({ denied: true } as const) : {};
      return { el, button: { id: buttonId(el, label), label, disabled, ...denied, ...(reason ? { reason } : {}) } };
    });
}

/** Buttons a page put in its header, as a person sees them. Ids come from `data-desk-action`, then `data-desk-field`, then the label. */
export function headerButtons(root: HTMLElement | null): DeskHeaderButton[] {
  return visibleButtons(root).map((item) => item.button);
}

function findHeaderButton(root: HTMLElement | null, target: string): { el: HTMLElement; button: DeskHeaderButton } | { ok: false; error: string; reason: string } {
  const wanted = target.trim().toLowerCase();
  const all = visibleButtons(root);
  const hit = all.find((item) => item.button.id.toLowerCase() === wanted) ?? all.find((item) => item.button.label.toLowerCase() === wanted);
  return hit ?? { ok: false, error: `no header button ${target}`, reason: `buttons: ${all.map((item) => `${item.button.id} (${item.button.label})`).join(' | ') || 'none'}` };
}

/** The header button a person clicks for `target` (id or label), or why there is none. */
export function headerButtonTarget(root: HTMLElement | null, target: string): HTMLElement | { ok: false; error: string; reason?: string } {
  const hit = findHeaderButton(root, target);
  return 'el' in hit ? hit.el : hit;
}

export function pressHeaderButton(root: HTMLElement | null, target: string): { ok: boolean; error?: string; reason?: string; pressed?: string } {
  const hit = findHeaderButton(root, target);
  if (!('el' in hit)) return hit;
  if (hit.button.disabled) return { ok: false, error: `${hit.button.label} is disabled right now`, ...(hit.button.reason ? { reason: hit.button.reason } : {}) };
  hit.el.click();
  return { ok: true, pressed: hit.button.id };
}
