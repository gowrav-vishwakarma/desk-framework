import type { PivotAxisItem, PivotDateGroup, PivotField } from './pivotTypes';

/** Key of an empty value. Sorts last. */
export const PIVOT_BLANK = '\u0000';

export interface PivotKey {
  /** Sorts in the axis order: dates as `2026-04`, numbers by value. */
  key: string;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function blank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Year, month and day of a date value: `2026-04-01`, an ISO time, or a Date. */
export function pivotDateParts(value: unknown): { y: number; m: number; d: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-27` for a year starting in April; just `2026` for a January start. */
function fyLabel(start: number, fyStartMonth: number): string {
  return fyStartMonth === 1 ? String(start) : `${start}-${pad((start + 1) % 100)}`;
}

function dateKey(value: unknown, group: PivotDateGroup | undefined, field: PivotField, fyStartMonth: number): PivotKey | null {
  const parts = pivotDateParts(value);
  if (!parts) return null;
  const { y, m, d } = parts;
  const fy = m >= fyStartMonth ? y : y - 1;
  switch (group) {
    case 'year':
      return { key: String(y), label: String(y) };
    case 'fy':
      return { key: String(fy), label: `FY ${fyLabel(fy, fyStartMonth)}` };
    case 'quarter': {
      const q = Math.floor(((m - fyStartMonth + 12) % 12) / 3) + 1;
      return { key: `${fy}-Q${q}`, label: `Q${q} ${fyLabel(fy, fyStartMonth)}` };
    }
    case 'month':
      return { key: `${y}-${pad(m)}`, label: `${MONTHS[m - 1] ?? ''} ${y}` };
    default: {
      const key = `${y}-${pad(m)}-${pad(d)}`;
      return { key, label: field.format?.(key) || key };
    }
  }
}

/** The bucket a raw value falls in on an axis item. */
export function pivotKey(value: unknown, field: PivotField | undefined, item: Pick<PivotAxisItem, 'dateGroup'>, fyStartMonth: number): PivotKey {
  if (blank(value)) return { key: PIVOT_BLANK, label: '(blank)' };
  if (field?.kind === 'date') {
    const key = dateKey(value, item.dateGroup, field, fyStartMonth);
    if (key) return key;
  }
  if (typeof value === 'boolean') return { key: value ? 'true' : 'false', label: field?.format?.(value) || (value ? 'Yes' : 'No') };
  const key = typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value);
  return { key, label: field?.format?.(value) || key };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Label order of two keys of one field: numbers by value, blanks last, text naturally (`2` before `10`). */
export function comparePivotKeys(a: string, b: string, numeric: boolean): number {
  if (a === b) return 0;
  if (a === PIVOT_BLANK) return 1;
  if (b === PIVOT_BLANK) return -1;
  if (numeric) {
    const x = Number(a);
    const y = Number(b);
    if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
  }
  return collator.compare(a, b);
}
