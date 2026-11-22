import { describe, expect, it } from 'vitest';
import { middleEllipsisText } from '../src/grid/cellTextLayout';
import {
  mergeColumnWidths,
  mergeMiddleOrder,
  mergeTextLayouts,
  moveMiddleColumnOrder,
  partitionColumnLayout,
} from '../src/grid/deskColumnLayout';
import { applyDeskGridSort } from '../src/grid/listSort';
import type { DeskColumn } from '../src/grid/types';

const cols: DeskColumn[] = [
  { id: 'a', header: 'A', pin: 'start' },
  { id: 'b', header: 'B' },
  { id: 'c', header: 'C' },
  { id: 'd', header: 'D', pin: 'end' },
];

describe('deskColumnLayout', () => {
  it('partitions start, middle, and end pins', () => {
    const layout = partitionColumnLayout(cols, ['c', 'b']);
    expect(layout.map((column) => column.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('merges middle order when columns change', () => {
    expect(mergeMiddleOrder(cols, ['c', 'b'])).toEqual(['c', 'b']);
    const extended = [...cols, { id: 'e', header: 'E' }];
    expect(mergeMiddleOrder(extended, ['c', 'b'])).toEqual(['c', 'b', 'e']);
    expect(mergeMiddleOrder(cols, ['c', 'x', 'b'])).toEqual(['c', 'b']);
    // A column that appeared since the order was saved goes before the column defined after it, not at the end.
    const inserted = [cols[0]!, { id: 'n', header: 'N' }, ...cols.slice(1)];
    expect(mergeMiddleOrder(inserted, ['c', 'b'])).toEqual(['c', 'n', 'b']);
    expect(mergeMiddleOrder([cols[0]!, { id: 'n', header: 'N' }, { id: 'm', header: 'M' }, ...cols.slice(1)], ['b', 'c'])).toEqual(['n', 'm', 'b', 'c']);
  });

  it('drops widths for removed columns', () => {
    expect(mergeColumnWidths(cols, { a: 80, b: 100, z: 50 })).toEqual({ a: 80, b: 100 });
  });

  it('moves middle columns only', () => {
    expect(moveMiddleColumnOrder(cols, ['b', 'c'], 'c', 'b')).toEqual(['c', 'b']);
    expect(moveMiddleColumnOrder(cols, ['b', 'c'], 'a', 'b')).toBeNull();
    expect(moveMiddleColumnOrder(cols, ['b', 'c'], 'b', null)).toEqual(['c', 'b']);
  });

  it('merges saved text layouts for menu columns only', () => {
    const withMenu: DeskColumn[] = [
      { id: 'a', header: 'A', textLayoutMenu: true, defaultTextLayout: 'wrap' },
      { id: 'b', header: 'B' },
    ];
    expect(mergeTextLayouts(withMenu, { a: 'clip', b: 'wrap' })).toEqual({ a: 'clip' });
  });

  it('applies explicit sort from the header menu', () => {
    expect(applyDeskGridSort('b', 'desc', cols, { sortColumn: 'a', sortDescending: false })).toEqual({
      sortColumn: 'b',
      sortDescending: true,
    });
    expect(applyDeskGridSort('a', undefined, cols, { sortColumn: 'a', sortDescending: false })).toEqual({
      sortColumn: 'a',
      sortDescending: true,
    });
  });

  it('shortens long values for middle ellipsis', () => {
    const out = middleEllipsisText('abcdefghijklmnop', 80);
    expect(out).toContain('…');
    expect(out.length).toBeLessThan('abcdefghijklmnop'.length);
  });
});
