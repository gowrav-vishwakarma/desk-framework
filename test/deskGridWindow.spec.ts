import { describe, expect, it } from 'vitest';
import type { DeskRowAction } from '../src/grid/types';
import { deskGridWindow } from '../src/grid/window';

describe('deskGridWindow', () => {
  it('draws a short list in full', () => {
    expect(deskGridWindow({ count: 12, cursor: 4, virtual: [], totalSize: 0 })).toEqual({
      indexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      padTop: 0,
      padBottom: 0,
    });
  });

  it('keeps the cursor in an unmeasured long list instead of only the first rows', () => {
    const window = deskGridWindow({ count: 121, cursor: 90, virtual: [], totalSize: 0 });
    expect(window.indexes).toContain(90);
    expect(window.indexes).not.toContain(0);
    expect(window.indexes).toHaveLength(40);
    expect(window.padTop).toBe(window.indexes[0]! * 28);
    expect(window.padBottom).toBe((121 - window.indexes[window.indexes.length - 1]! - 1) * 28);
  });

  it('uses the measured window and its spacers', () => {
    const window = deskGridWindow({
      count: 121,
      cursor: 40,
      virtual: [
        { index: 30, start: 840, end: 868 },
        { index: 31, start: 868, end: 896 },
      ],
      totalSize: 3388,
    });
    expect(window.indexes).toEqual([30, 31]);
    expect(window.padTop).toBe(840);
    expect(window.padBottom).toBe(3388 - 896);
  });
});

describe('DeskRowAction title', () => {
  it('keeps a disabled reason on the action, separate from the label', () => {
    const action: DeskRowAction = {
      name: 'activate',
      label: 'Activate',
      disabled: true,
      title: 'Activate is not possible while status is active',
    };
    expect(action.label).toBe('Activate');
    expect(action.title).toBe('Activate is not possible while status is active');
  });
});
