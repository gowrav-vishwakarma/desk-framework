import { waitDeskIdle } from './busy';

const NAMES: Record<string, string> = {
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: ' ',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
};

export interface ParsedKey {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** `ctrl+shift+enter` becomes the init of a `KeyboardEvent`. */
export function parseKeyCombo(combo: string): ParsedKey {
  const parts = combo.split('+').map((part) => part.trim()).filter(Boolean);
  const out: ParsedKey = { key: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') out.ctrlKey = true;
    else if (lower === 'shift') out.shiftKey = true;
    else if (lower === 'alt') out.altKey = true;
    else if (lower === 'meta' || lower === 'cmd') out.metaKey = true;
    else if (/^f\d{1,2}$/.test(lower)) out.key = lower.toUpperCase();
    else out.key = NAMES[lower] ?? (part.length === 1 ? part : part);
  }
  return out;
}

function target(): EventTarget {
  const active = document.activeElement;
  return active && active !== document.body ? active : document.body;
}

/** A real `KeyboardEvent` on the focused element. The page handles it as it handles a press. */
export async function pressDeskKey(combo: string): Promise<{ combo: string; defaultPrevented: boolean }> {
  const parsed = parseKeyCombo(combo);
  const init = { ...parsed, bubbles: true, cancelable: true, composed: true };
  const el = target();
  const down = new KeyboardEvent('keydown', init);
  el.dispatchEvent(down);
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  await waitDeskIdle();
  return { combo, defaultPrevented: down.defaultPrevented };
}

/** Type text one character at a time into the focused input, firing input events. */
export async function typeDeskText(text: string): Promise<{ value: string }> {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) throw new Error('focused element is not a text input');
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  const setter = descriptor ? (descriptor.set as ((this: HTMLElement, value: string) => void) | undefined) : undefined; // eslint-disable-line @typescript-eslint/unbound-method -- called with `.call(el, …)` below
  for (const char of text) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
    setter?.call(el, el.value + char);
    el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
  }
  await waitDeskIdle();
  return { value: el.value };
}
