import { describe, expect, it } from 'vitest';
import { resolveGridKey, type GridKeyInput, type GridKeyState } from '../src/grid/keyboard';

const key = (name: string, extra: Partial<GridKeyInput> = {}): GridKeyInput => ({
  key: name,
  ctrl: false,
  meta: false,
  shift: false,
  alt: false,
  ...extra,
});

const list: GridKeyState = {
  mode: 'list',
  rowCount: 20,
  colCount: 3,
  cursor: { row: 19, col: 1 },
  editing: false,
  pageSize: 12,
  pagination: { page: 2, pageCount: 4, loading: false },
};

describe('desk grid list pagination keys', () => {
  it('loads the next page from ArrowDown on the last row', () => {
    expect(resolveGridKey(key('ArrowDown'), list)).toEqual({
      type: 'paginate',
      page: 3,
      row: 0,
      col: 1,
    });
  });

  it('stays on the last row when ArrowDown has no next page', () => {
    const action = resolveGridKey(key('ArrowDown'), {
      ...list,
      pagination: { page: 4, pageCount: 4, loading: false },
    });
    expect(action).toEqual({ type: 'move', row: 19, col: 1, extend: false });
  });

  it('loads the previous page from ArrowUp on the first row', () => {
    expect(resolveGridKey(key('ArrowUp'), { ...list, cursor: { row: 0, col: 1 } })).toEqual({
      type: 'paginate',
      page: 1,
      row: 'last',
      col: 1,
    });
  });

  it('stays on the first row when ArrowUp has no previous page', () => {
    const action = resolveGridKey(key('ArrowUp'), {
      ...list,
      cursor: { row: 0, col: 1 },
      pagination: { page: 1, pageCount: 4, loading: false },
    });
    expect(action).toEqual({ type: 'move', row: 0, col: 1, extend: false });
  });

  it('moves within the page when the arrow is not on an edge', () => {
    expect(resolveGridKey(key('ArrowDown'), { ...list, cursor: { row: 4, col: 1 } })).toEqual({
      type: 'move',
      row: 5,
      col: 1,
      extend: false,
    });
  });

  it('loads the next page on PageDown and keeps the row', () => {
    expect(resolveGridKey(key('PageDown'), { ...list, cursor: { row: 4, col: 1 } })).toEqual({
      type: 'paginate',
      page: 3,
      row: 4,
      col: 1,
    });
  });

  it('moves to the last row on PageDown when already on the last page', () => {
    expect(
      resolveGridKey(key('PageDown'), {
        ...list,
        cursor: { row: 4, col: 1 },
        pagination: { page: 4, pageCount: 4, loading: false },
      }),
    ).toEqual({ type: 'move', row: 19, col: 1, extend: false });
  });

  it('loads the previous page on PageUp and keeps the row', () => {
    expect(resolveGridKey(key('PageUp'), { ...list, cursor: { row: 4, col: 1 } })).toEqual({
      type: 'paginate',
      page: 1,
      row: 4,
      col: 1,
    });
  });

  it('moves to the first row on PageUp when already on the first page', () => {
    expect(
      resolveGridKey(key('PageUp'), {
        ...list,
        cursor: { row: 4, col: 1 },
        pagination: { page: 1, pageCount: 4, loading: false },
      }),
    ).toEqual({ type: 'move', row: 0, col: 1, extend: false });
  });

  it('ignores page keys while a page is loading', () => {
    const loading = { ...list, pagination: { page: 2, pageCount: 4, loading: true } };
    expect(resolveGridKey(key('ArrowDown'), loading)).toEqual({ type: 'none' });
    expect(resolveGridKey(key('ArrowUp'), { ...loading, cursor: { row: 0, col: 1 } })).toEqual({ type: 'none' });
    expect(resolveGridKey(key('PageDown'), loading)).toEqual({ type: 'none' });
    expect(resolveGridKey(key('PageUp'), loading)).toEqual({ type: 'none' });
  });

  it('still extends the selection on Shift+Arrow', () => {
    expect(resolveGridKey(key('ArrowDown', { shift: true }), list)).toEqual({
      type: 'move',
      row: 19,
      col: 1,
      extend: true,
    });
  });

  it('commits the cell on ArrowDown while editing', () => {
    expect(resolveGridKey(key('ArrowDown'), { ...list, editing: true })).toEqual({
      type: 'commitMove',
      row: 19,
      col: 1,
      addRow: false,
    });
  });

  it('keeps PageDown as an in-grid move in entry mode', () => {
    const entry: GridKeyState = { ...list };
    delete entry.pagination;
    expect(
      resolveGridKey(key('PageDown'), {
        ...entry,
        mode: 'entry',
        cursor: { row: 4, col: 1 },
      }),
    ).toEqual({ type: 'move', row: 16, col: 1, extend: false });
  });
});
