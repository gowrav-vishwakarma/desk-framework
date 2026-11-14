import { computed, reactive, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { cellText } from './display';
import { readCompareFilter, readTextFilter, type CompareOp } from './headerFilter';
import type { DeskColumn, DeskGridRow } from './types';

/** First number in a cell's text: `2,111.00 Dr` is 2111. NaN when there is none. */
function numberIn(text: string): number {
  const match = /-?\d[\d,]*(\.\d+)?/.exec(text);
  return match ? Number(match[0].replace(/,/g, '')) : Number.NaN;
}

function compare(value: number, op: CompareOp, raw: string): boolean {
  const bound = Number(raw.replace(/,/g, ''));
  if (!raw.trim() || !Number.isFinite(bound)) return true;
  if (!Number.isFinite(value)) return false;
  if (op === '>') return value > bound;
  if (op === '>=') return value >= bound;
  if (op === '<') return value < bound;
  if (op === '<=') return value <= bound;
  if (op === '!=') return value !== bound;
  return value === bound;
}

/** A number column, or right-aligned text that holds amounts. */
function numeric(column: DeskColumn): boolean {
  return column.type === 'number' || column.type === 'currency' || column.align === 'right';
}

/**
 * Whether a row's cell matches filter-row text, in the filter box syntax: plain text contains,
 * `= x`, `^= x`, `$= x`, `!= x`, `!~ x`, `in: a, b`, `!in: a, b`; on number columns also
 * `> 200`, `>= 100 <= 500` and `100..500`. Case is ignored. Date words are matched as text.
 */
export function deskCellMatches(column: DeskColumn, row: DeskGridRow, raw: string): boolean {
  const filter = raw.trim();
  if (!filter) return true;
  const text = cellText(column, row);
  if (numeric(column) && (/^(>=|<=|=<|!=|<>|>|<)/.test(filter) || filter.includes('..') || /^=\s*-?\d/.test(filter))) {
    const draft = readCompareFilter(filter);
    const value = numberIn(text);
    return compare(value, draft.leftOp, draft.left) && (!draft.right || compare(value, draft.rightOp, draft.right));
  }
  const { mode, value } = readTextFilter(filter);
  const cell = text.toLowerCase();
  const wanted = value.toLowerCase();
  const list = wanted.split(',').map((item) => item.trim()).filter(Boolean);
  if (mode === 'equals') return cell === wanted;
  if (mode === 'notEqual') return cell !== wanted;
  if (mode === 'starts') return cell.startsWith(wanted);
  if (mode === 'ends') return cell.endsWith(wanted);
  if (mode === 'not') return !cell.includes(wanted);
  if (mode === 'in') return list.length === 0 || list.includes(cell);
  if (mode === 'notIn') return !list.includes(cell);
  return cell.includes(wanted);
}

export interface DeskLocalFilterOptions {
  /**
   * For grouped rows (a head and its lines): the group a row belongs to. A group is kept whole
   * when any of its rows matches, so a head never shows without its lines or the other way round.
   */
  groupOf?: (row: DeskGridRow) => string;
  /** Off: every row shows and typed filters are ignored. */
  enabled?: MaybeRefOrGetter<boolean>;
}

export interface DeskLocalFilter {
  /** The rows to draw. */
  rows: ComputedRef<DeskGridRow[]>;
  /** Text per column id, as the grid's filter row holds it. */
  readonly filters: Record<string, string>;
  /** Bind to `DeskGrid @filter`. */
  onFilter: (next: Record<string, string>) => void;
  clear: () => void;
  /** Some filter text is set and applies. */
  active: ComputedRef<boolean>;
}

/**
 * Filter-row filtering over rows the page already has, for a report whose server does not take
 * column filters. It narrows what is loaded (one page), on top of the page's own filter.
 * Use with `DeskGrid mode="list" show-filter`: typing on a cell starts that column's filter.
 */
export function useDeskLocalFilter(
  source: MaybeRefOrGetter<readonly DeskGridRow[]>,
  columns: MaybeRefOrGetter<readonly DeskColumn[]>,
  options: DeskLocalFilterOptions = {},
): DeskLocalFilter {
  const filters = reactive<Record<string, string>>({});
  const enabled = (): boolean => (options.enabled === undefined ? true : toValue(options.enabled));
  const set = computed(() =>
    toValue(columns)
      .map((column) => ({ column, text: filters[column.id] ?? '' }))
      .filter((item) => item.text.trim() !== ''),
  );
  const active = computed(() => enabled() && set.value.length > 0);

  const rows = computed((): DeskGridRow[] => {
    const all = [...toValue(source)];
    if (!active.value) return all;
    const hit = (row: DeskGridRow): boolean => set.value.every(({ column, text }) => deskCellMatches(column, row, text));
    if (!options.groupOf) return all.filter(hit);
    const group = options.groupOf;
    // A group is kept when each filter is met by some row of it: a voucher of 'Cash' with a line over 500.
    const byGroup = new Map<string, DeskGridRow[]>();
    for (const row of all) {
      const key = group(row);
      const list = byGroup.get(key);
      if (list) list.push(row);
      else byGroup.set(key, [row]);
    }
    const kept = new Set<string>();
    for (const [key, list] of byGroup) {
      if (set.value.every(({ column, text }) => list.some((row) => deskCellMatches(column, row, text)))) kept.add(key);
    }
    return all.filter((row) => kept.has(group(row)));
  });

  function onFilter(next: Record<string, string>): void {
    for (const id of Object.keys(filters)) if (!(id in next)) delete filters[id];
    Object.assign(filters, next);
  }

  function clear(): void {
    for (const id of Object.keys(filters)) delete filters[id];
  }

  return { rows, filters, onFilter, clear, active };
}
