import { describe, expect, it } from 'vitest';
import { resolveGridKey, type GridKeyInput, type GridKeyState } from '../src/grid/keyboard';

const enter: GridKeyInput = { key: 'Enter', ctrl: false, meta: false, shift: false, alt: false };

const entry: GridKeyState = {
  mode: 'entry',
  rowCount: 4,
  colCount: 3,
  cursor: { row: 0, col: 2 },
  editing: false,
  pageSize: 12,
  blankOnNewRow: false,
  onGate: false,
};

describe('desk grid new row at start', () => {
  const start: GridKeyState = { ...entry, newRowAt: 'start' };

  it('inserts a new row at the top when the entry row is finished', () => {
    expect(resolveGridKey(enter, start)).toEqual({ type: 'commitMove', row: 0, col: 0, addRow: true });
  });

  it('moves to the first cell of the next row when roaming', () => {
    expect(resolveGridKey(enter, { ...start, cursor: { row: 2, col: 2 } })).toEqual({
      type: 'move',
      row: 3,
      col: 0,
      extend: false,
    });
  });

  it('goes back to the entry row from the bottom without adding a row', () => {
    expect(resolveGridKey(enter, { ...start, cursor: { row: 3, col: 2 } })).toEqual({
      type: 'move',
      row: 0,
      col: 0,
      extend: false,
    });
  });

  it('moves one cell right before the last cell', () => {
    expect(resolveGridKey(enter, { ...start, cursor: { row: 0, col: 0 } })).toEqual({
      type: 'move',
      row: 0,
      col: 1,
      extend: false,
    });
  });

  it('leaves the grid on the last cell when the gate cell is empty', () => {
    expect(resolveGridKey(enter, { ...start, blankOnNewRow: true })).toEqual({ type: 'exitGrid' });
  });

  it('treats Tab like Enter in entry mode', () => {
    expect(resolveGridKey({ ...enter, key: 'Tab' }, start)).toEqual({ type: 'commitMove', row: 0, col: 0, addRow: true });
  });

  it('keeps adding at the bottom in end mode', () => {
    expect(resolveGridKey(enter, { ...entry, newRowAt: 'end', cursor: { row: 3, col: 2 } })).toEqual({
      type: 'commitMove',
      row: 4,
      col: 0,
      addRow: true,
    });
  });
});

describe('desk grid empty gate cell', () => {
  const onGate: GridKeyState = { ...entry, cursor: { row: 0, col: 0 }, onGate: true, blankOnNewRow: true };

  it('leaves the grid on Enter in an empty gate cell, in end mode', () => {
    expect(resolveGridKey(enter, onGate)).toEqual({ type: 'exitGrid' });
  });

  it('leaves the grid on Enter in an empty gate cell, in start mode', () => {
    expect(resolveGridKey(enter, { ...onGate, newRowAt: 'start' })).toEqual({ type: 'exitGrid' });
  });

  it('moves right when the gate cell is filled', () => {
    expect(resolveGridKey(enter, { ...onGate, blankOnNewRow: false })).toEqual({
      type: 'move',
      row: 0,
      col: 1,
      extend: false,
    });
  });

  it('does not leave from a column that is not the gate', () => {
    expect(resolveGridKey(enter, { ...onGate, onGate: false, cursor: { row: 0, col: 1 } })).toEqual({
      type: 'move',
      row: 0,
      col: 2,
      extend: false,
    });
  });

  it('does not leave while a cell is being edited', () => {
    expect(resolveGridKey(enter, { ...onGate, editing: true }).type).toBe('commitMove');
  });
});
