/** A list shorter than this is drawn in full. A longer list is a window plus spacers. */
export const DESK_GRID_VIRTUAL_AT = 80;

/** Row height used before the virtualizer has measured. Matches the grid's estimate. */
export const DESK_ROW_ESTIMATE = 28;

const UNMEASURED_SPAN = 40;
const UNMEASURED_LEAD = 12;

export interface DeskVirtualSlice {
  index: number;
  start: number;
  end: number;
}

export interface DeskGridWindow {
  indexes: number[];
  padTop: number;
  padBottom: number;
}

function span(start: number, end: number): number[] {
  const indexes: number[] = [];
  for (let index = start; index < end; index += 1) indexes.push(index);
  return indexes;
}

/**
 * Which rows to paint, and the spacer above and below them.
 * Under 80 rows the list is whole. A longer list that the virtualizer has not
 * measured yet is a window around the cursor, not only the first 40 rows.
 */
export function deskGridWindow(input: {
  count: number;
  cursor: number;
  virtual: readonly DeskVirtualSlice[];
  totalSize: number;
  estimate?: number;
}): DeskGridWindow {
  const count = Math.max(0, input.count);
  if (count < DESK_GRID_VIRTUAL_AT) return { indexes: span(0, count), padTop: 0, padBottom: 0 };

  const virtual = input.virtual;
  if (virtual.length === 0) {
    const width = Math.min(UNMEASURED_SPAN, count);
    const cursor = Math.min(Math.max(0, input.cursor), count - 1);
    let start = Math.max(0, cursor - UNMEASURED_LEAD);
    if (start + width > count) start = Math.max(0, count - width);
    const end = Math.min(count, start + width);
    const estimate = input.estimate ?? DESK_ROW_ESTIMATE;
    return { indexes: span(start, end), padTop: start * estimate, padBottom: (count - end) * estimate };
  }

  const first = virtual[0];
  const last = virtual[virtual.length - 1];
  if (!first || !last) return { indexes: span(0, count), padTop: 0, padBottom: 0 };
  return {
    indexes: virtual.map((item) => item.index),
    padTop: first.start,
    padBottom: Math.max(0, input.totalSize - last.end),
  };
}
