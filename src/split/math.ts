/** A row in a quantity split. Callers add their own fields. */
export interface DeskSplitRow extends Record<string, unknown> {
  quantity: number;
}

export type DeskSplitMode = 'exact' | 'atMost';

/**
 * How a split treats the target quantity.
 * `match` requires the rows to add up to it. `follow` lets the rows set it.
 * `confirm` does the same, then asks before the quantity changes.
 */
export type DeskSplitPolicy = 'match' | 'follow' | 'confirm';

/** A line without a quantity has nothing to match or confirm against, so the rows set it. */
export function splitPolicyFor(target: number, policy: DeskSplitPolicy): DeskSplitPolicy {
  return target > 0 ? policy : 'follow';
}

/** Replaces the rows. The page decides what a filler means (remaining, equal chunks, FIFO later). */
export interface DeskSplitFiller<T extends DeskSplitRow> {
  id: string;
  label: string;
  /** Optional shortcut action id, registered while the dialog is open. */
  actionId?: string;
  fill: (target: number, rows: T[]) => T[];
}

export interface DeskSplitCheck {
  entered: number;
  remaining: number;
  ok: boolean;
  message: string;
}

export function splitEntered(rows: readonly DeskSplitRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

/** Target against what the rows already hold. `exact` must match. `atMost` must not go over. A policy other than `match` accepts any total. */
export function splitCheck(
  target: number,
  rows: readonly DeskSplitRow[],
  mode: DeskSplitMode,
  policy: DeskSplitPolicy = 'match',
): DeskSplitCheck {
  const entered = splitEntered(rows);
  if (policy !== 'match') {
    const changed = !near(entered, target);
    return {
      entered,
      remaining: 0,
      ok: true,
      message: changed ? `Item quantity becomes ${trimCount(entered)} (was ${trimCount(target)}).` : '',
    };
  }
  if (!(target > 0)) return { entered, remaining: 0, ok: mode !== 'exact', message: '' };
  const remaining = target - entered;
  const over = remaining < -1e-6;
  const short = remaining > 1e-6;
  const ok = mode === 'exact' ? near(entered, target) : !over;
  let message = '';
  if (over) message = `Entered ${trimCount(entered)}, which is more than ${trimCount(target)}.`;
  else if (short) message = `${trimCount(remaining)} still to assign.`;
  return { entered, remaining: over ? 0 : remaining, ok, message };
}

function trimCount(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/**
 * Puts the unassigned quantity on the last empty row, or adds one row.
 * `blank` should copy the previous row's editable values and drop saved ids.
 */
export function fillRemaining<T extends DeskSplitRow>(
  target: number,
  rows: readonly T[],
  blank: (remaining: number, previous: T | undefined) => T,
): T[] {
  const check = splitCheck(target, rows, 'atMost');
  if (!check.ok || check.remaining <= 1e-6) return rows.map((row) => ({ ...row }));
  const next = rows.map((row) => ({ ...row }));
  const last = next[next.length - 1];
  if (last && !(Number(last.quantity) > 0)) {
    last.quantity = check.remaining;
    return next;
  }
  next.push(blank(check.remaining, last));
  return next;
}

/**
 * Repeats `chunk` until the target is filled. The last row keeps the remainder.
 * A chunk of 3 against 10 becomes 3, 3, 3, 1.
 */
export function distributeEqually<T extends DeskSplitRow>(
  target: number,
  chunk: number,
  seed: T,
  blank: (quantity: number, previous: T) => T,
): T[] {
  const size = chunk > 0 ? chunk : target > 0 ? target : 0;
  if (!(target > 0) || !(size > 0)) return [];
  const rows: T[] = [];
  let left = target;
  let previous = seed;
  while (left > 1e-6 && rows.length < 500) {
    const quantity = Math.min(size, left);
    const row = rows.length === 0 ? { ...seed, quantity } : blank(quantity, previous);
    row.quantity = quantity;
    rows.push(row);
    previous = row;
    left -= quantity;
  }
  return rows;
}
