export interface DrawerKeyInput {
  key: string;
  shift: boolean;
}

/**
 * Where the key landed.
 * `grid-last` is Tab on the Net cell. The drawer places are the focused control.
 */
export type DrawerPlace = 'grid-last' | 'drawer-first' | 'drawer-mid' | 'drawer-last';

export type DrawerKeyResult =
  | { type: 'enter-drawer' }
  | { type: 'edit' }
  | { type: 'next-field' }
  | { type: 'next-row' }
  | { type: 'leave-drawer' }
  | { type: 'move-field'; dir: 1 | -1 }
  /** Up returns to this item row. Down goes to the next item row. The grid picks the column by X. */
  | { type: 'to-grid'; dir: 1 | -1 }
  | { type: 'ignore' };

/**
 * Enter and Tab on Net open the drawer. Tab walks its cells.
 * Enter on a closed select, check, lookup, or action opens that cell.
 * Enter on a closed text or number cell, and on HSN, moves to the next cell.
 * Typing in those cells opens the editor with that character.
 * Enter inside an open editor commits and walks.
 * Enter or Tab on the last control goes to the next item row. Shift+Enter moves to the previous control.
 * Shift+Enter on the first control returns to the row. Esc on a closed cell returns to the row.
 * Left and Right move between drawer cells.
 * Down from the drawer goes to the next item row. Up returns to this item row.
 * The row above is reached only from that row, because its drawer is not on screen.
 */
export function resolveDrawerKey(input: DrawerKeyInput, place: DrawerPlace, closed = false): DrawerKeyResult {
  if (place === 'grid-last') {
    if ((input.key === 'Tab' || input.key === 'Enter') && !input.shift) return { type: 'enter-drawer' };
    return { type: 'ignore' };
  }
  if (input.key === 'Escape') return { type: 'leave-drawer' };
  if (input.key === 'ArrowUp') return { type: 'to-grid', dir: -1 };
  if (input.key === 'ArrowDown') return { type: 'to-grid', dir: 1 };
  if (closed && input.key === 'ArrowLeft') return { type: 'move-field', dir: -1 };
  if (closed && input.key === 'ArrowRight') return { type: 'move-field', dir: 1 };
  if (input.key === 'Enter' && input.shift) {
    if (place === 'drawer-first') return { type: 'leave-drawer' };
    if (place === 'drawer-mid' || place === 'drawer-last') return { type: 'move-field', dir: -1 };
  }
  if (input.key === 'Enter' && !input.shift && closed) return { type: 'edit' };
  if ((input.key === 'Tab' || input.key === 'Enter') && !input.shift) {
    return place === 'drawer-last' ? { type: 'next-row' } : { type: 'next-field' };
  }
  if (input.key === 'Tab' && input.shift && place === 'drawer-first') return { type: 'leave-drawer' };
  return { type: 'ignore' };
}

/** Closed selects, checks, lookups, and actions open on Enter. Text, number, and HSN move on. */
export function drawerEnterOpens(kind: string, fieldKey = ''): boolean {
  if (fieldKey === 'hsn') return false;
  return kind === 'select' || kind === 'check' || kind === 'lookup' || kind === 'action';
}

/** The character that should open a closed plain cell or HSN, or null when this key should not. */
export function drawerTypingSeed(
  input: { key: string; ctrl: boolean; meta: boolean; alt: boolean },
  kind: string,
  fieldKey = '',
): string | null {
  if (input.ctrl || input.meta || input.alt) return null;
  if (input.key.length !== 1) return null;
  if (kind === 'text' || kind === 'number' || fieldKey === 'hsn') return input.key;
  return null;
}
