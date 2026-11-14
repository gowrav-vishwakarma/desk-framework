import type { DeskGridRow } from './types';

/**
 * Numbers for grouped rows: each head gets the next number, other rows none. `start` is how many
 * heads came before this page, so page 2 of 20 starts at 21. Pass the result to `DeskGrid`'s
 * `rowNumber` as `(row) => numbers.get(String(row.id)) ?? ''`.
 */
export function deskGroupNumbers(rows: readonly DeskGridRow[], isHead: (row: DeskGridRow) => boolean, start = 0): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) if (isHead(row)) map.set(String(row.id), start + map.size + 1);
  return map;
}
