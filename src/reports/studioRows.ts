import type { DeskGridRow } from '../grid/types';
import { txt } from './text';
import type { Rdl2Output } from './language';

/** Marks a group's head line among the rows. */
export const GROUP_HEAD = '__group';

/** The group column pages are cut on (`output.pageBy`), while it is one of the groups. */
export function pagedByOf(output: Rdl2Output): string | null {
  const by = output.pageBy;
  return by && output.groups?.some((group) => group.column === by) ? by : null;
}

/** A column as the report heads it: `Party`. */
export function headingOf(output: Rdl2Output, column: string): string {
  return output.columns.find((item) => item.column === column)?.label || column;
}

export interface GroupedRows {
  rows: DeskGridRow[];
  /** Row number by row id; `''` leaves the number cell blank. */
  numbers: Map<unknown, number | ''>;
}

/**
 * The first group level as head lines: each group's value and its subtotals over the whole result
 * (from the server), then its rows. Deeper levels keep their sort order without head lines.
 *
 * Row numbers count what the pages count, so they carry on from page to page. Paged by group
 * (`byGroup`, the server cut the page on `pageBy`), each group is numbered, on its head line or,
 * for a deeper level, on its first row, and its rows are not. Paged by row, the rows are numbered
 * and the head lines are not. `pageStart` is how many came before this page.
 */
export function groupedRows(
  output: Rdl2Output,
  rows: readonly DeskGridRow[],
  options: { subtotals?: readonly Record<string, unknown>[] | undefined; pageStart: number; byGroup: boolean },
): GroupedRows {
  const group = output.groups?.[0];
  const numbers = new Map<unknown, number | ''>();
  if (!group) return { rows: [...rows], numbers };
  const byKey = new Map((options.subtotals ?? []).map((row) => [txt(row[group.column]), row]));
  const columns = (output.groups ?? []).map((item) => item.column);
  const by = options.byGroup ? pagedByOf(output) : null;
  const pageKeys = by ? columns.slice(0, columns.indexOf(by) + 1) : null;
  const out: DeskGridRow[] = [];
  let counted = options.pageStart;
  let last: string | null = null;
  let lastPageKey: string | null = null;
  for (const row of rows) {
    const key = txt(row[group.column]);
    if (key !== last) {
      const sums = byKey.get(key) ?? {};
      const head: DeskGridRow = { ...sums, [group.column]: row[group.column] ?? '(none)', id: `group-${key}-${String(row.id)}`, [GROUP_HEAD]: true };
      numbers.set(head.id, pageKeys?.length === 1 ? ++counted : '');
      out.push(head);
      last = key;
    }
    if (!pageKeys) numbers.set(row.id, ++counted);
    else if (pageKeys.length > 1) {
      const pageKey = JSON.stringify(pageKeys.map((column) => row[column] ?? null));
      numbers.set(row.id, pageKey === lastPageKey ? '' : ++counted);
      lastPageKey = pageKey;
    } else numbers.set(row.id, '');
    out.push(row);
  }
  return { rows: out, numbers };
}

/**
 * The end of the filter sentence when rows are grouped, so it is clear what a page holds: whole
 * groups, or so many rows where a group can carry on to the next page. `mark` bolds a value.
 */
export function pagingPhrase(output: Rdl2Output, limit: number, mark: (text: string) => string): string {
  const group = output.groups?.[0]?.column;
  if (!group || !limit) return '';
  const by = pagedByOf(output);
  if (by) return `· ${mark(`${limit} ${headingOf(output, by).toLowerCase()} groups`)} a page, each with all its rows`;
  return `· ${mark(`${limit} rows`)} a page, a ${headingOf(output, group).toLowerCase()} can carry on to the next page`;
}
