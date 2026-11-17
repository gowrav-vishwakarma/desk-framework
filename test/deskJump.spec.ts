import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  JUMP_HOLD_IDLE,
  jumpHoldKeyDown,
  jumpHoldKeyUp,
  jumpHoldShow,
  nextSection,
  pickToward,
  type DeskBox,
} from '../src/focus/jump';
import { focusDeskToward, focusFormSaveForField, resolveDeskJump } from '../src/focus/useDeskFocus';
import { addDeskFields, createDeskLayer, deskLayers, popDeskLayer, pushDeskLayer, type DeskLayer } from '../src/keys/layers';
import type { DeskKeyInput } from '../src/keys/combo';

function box(col: number, row: number): DeskBox {
  return { left: col * 100, top: row * 40, right: col * 100 + 80, bottom: row * 40 + 24 };
}

function key(input: Partial<DeskKeyInput> & { key: string }): DeskKeyInput {
  return { ctrl: false, shift: false, alt: false, meta: false, ...input };
}

const ctrl = key({ key: 'Control', ctrl: true });

describe('desk spatial move', () => {
  const fields = [0, 1, 2, 3].flatMap((col) =>
    [0, 1].map((row) => ({ id: `${col}-${row}`, box: box(col, row) })),
  );

  it('keeps the same column when moving down a header row', () => {
    expect(pickToward(box(1, 0), fields, 'down')).toBe('1-1');
  });

  it('stops at the end of the row', () => {
    expect(pickToward(box(3, 0), fields, 'right')).toBeNull();
    expect(pickToward(box(0, 0), fields, 'right')).toBe('1-0');
    expect(pickToward(box(0, 0), fields, 'left')).toBeNull();
  });

  it('moves up to the field in the same column', () => {
    expect(pickToward(box(2, 1), fields, 'up')).toBe('2-0');
  });

  describe('short last row above a wide box', () => {
    const wide: DeskBox = { left: 0, top: 90, right: 380, bottom: 200 };
    const header = [
      ...[0, 1, 2, 3].map((col) => ({ id: `${col}-0`, box: box(col, 0) })),
      ...[0, 1].map((col) => ({ id: `${col}-1`, box: box(col, 1) })),
    ];

    it('goes down to the box that lines up, not the close diagonal field', () => {
      const all = [...header, { id: 'grid', box: wide }];
      expect(pickToward(box(2, 0), all, 'down')).toBe('grid');
      expect(pickToward(box(3, 0), all, 'down')).toBe('grid');
      expect(pickToward(box(1, 0), all, 'down')).toBe('1-1');
    });

    it('goes up to the field directly above, not the close diagonal field', () => {
      const cell: DeskBox = { left: 200, top: 100, right: 280, bottom: 124 };
      expect(pickToward(cell, header, 'up')).toBe('2-0');
    });

    it('falls back to the nearest diagonal field when nothing lines up', () => {
      expect(pickToward(box(3, 0), header, 'down')).toBe('1-1');
    });
  });
});

describe('desk sections', () => {
  const sections = ['header', 'items', 'notes'];

  it('walks to the next section and stops after the last', () => {
    expect(nextSection(sections, -1)).toBe('header');
    expect(nextSection(sections, 0)).toBe('items');
    expect(nextSection(sections, 2)).toBeNull();
  });
});

describe('desk jump hold', () => {
  it('does not preview when another key lands before the hold', () => {
    let state = jumpHoldKeyDown(JUMP_HOLD_IDLE, ctrl, 'ctrl').state;
    const typed = jumpHoldKeyDown(state, key({ key: 's', code: 'KeyS', ctrl: true }), 'ctrl');
    expect(typed.cancel).toBe(true);
    expect(typed.hide).toBe(false);
    state = typed.state;
    expect(jumpHoldShow(state).showing).toBe(false);
  });

  it('hides the outline when the modifier is released', () => {
    let state = jumpHoldKeyDown(JUMP_HOLD_IDLE, ctrl, 'ctrl').state;
    state = jumpHoldShow(state);
    expect(state.showing).toBe(true);
    const up = jumpHoldKeyUp(state, key({ key: 'Control', ctrl: false }), 'ctrl');
    expect(up.hide).toBe(true);
    expect(up.state.showing).toBe(false);
  });
});

describe('desk section jump in the DOM', () => {
  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const col = Number(this.getAttribute('data-col') ?? 0);
      const row = Number(this.getAttribute('data-row') ?? 0);
      const width = Number(this.getAttribute('data-w') ?? 100);
      const height = Number(this.getAttribute('data-h') ?? 22);
      return new DOMRect(col * 120, row * 30, width, height);
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const layer of [...deskLayers()]) popDeskLayer(layer);
    document.body.innerHTML = '';
  });

  function mount(html: string): DeskLayer {
    const root = document.createElement('div');
    root.setAttribute('data-desk-layer', '');
    root.innerHTML = html;
    document.body.appendChild(root);
    const layer = createDeskLayer();
    layer.root = root;
    pushDeskLayer(layer);
    return layer;
  }

  it('jumps from the header to the section entry, then to the labelled notes field', () => {
    const page = mount(`
      <div data-desk-section="header"><input data-desk-field="party" data-col="0" data-row="0" /></div>
      <div data-desk-section="items"><div data-desk-field="lines" data-desk-entry tabindex="0" data-col="0" data-row="1"></div></div>
      <div data-desk-section="notes"><label>Terms <input data-desk-field="terms" data-col="0" data-row="2" /></label></div>
    `);
    const party = page.root?.querySelector<HTMLElement>('[data-desk-field="party"]');
    party?.focus();
    const toItems = resolveDeskJump();
    expect(toItems?.label).toBe('Items');
    toItems?.go();
    expect(document.activeElement).toBe(page.root?.querySelector('[data-desk-field="lines"]'));

    addDeskFields(page, [
      {
        id: 'lines',
        jumpTo: () => ({ rect: { left: 0, top: 0, right: 10, bottom: 10 }, label: 'Item', go: () => true }),
      },
    ]);
    party?.focus();
    expect(resolveDeskJump()?.label).toBe('Item');

    page.root?.querySelector<HTMLElement>('[data-desk-field="lines"]')?.focus();
    const toTerms = resolveDeskJump();
    expect(toTerms?.label).toBe('Terms');
    toTerms?.go();
    expect(document.activeElement?.getAttribute('data-desk-field')).toBe('terms');
  });

  it('Ctrl+Down from a header field reaches the grid, measured as a whole, not Terms', () => {
    const page = mount(`
      <div data-desk-section="header">
        <input data-desk-field="left" data-col="0" data-row="0" />
        <input data-desk-field="right" data-col="2" data-row="0" />
      </div>
      <div data-desk-field="lines" tabindex="0" data-col="0" data-row="1" data-w="480" data-h="90">
        <button data-col="3" data-row="3">Discount</button>
      </div>
      <input data-desk-field="terms" data-col="0" data-row="4" />
    `);
    const focusNear = vi.fn(() => true);
    addDeskFields(page, [{ id: 'lines', focusNear }]);
    for (const id of ['left', 'right']) {
      page.root?.querySelector<HTMLElement>(`[data-desk-field="${id}"]`)?.focus();
      expect(focusDeskToward('down')).toBe(true);
    }
    expect(focusNear).toHaveBeenCalledTimes(2);
    expect(document.activeElement?.getAttribute('data-desk-field')).not.toBe('terms');
  });

  it('focuses the layer save button from a field in the same layer', () => {
    const page = mount(`
      <input data-desk-field="sheet" />
      <button type="button" data-desk-field="save" data-form-save-btn>Save</button>
    `);
    expect(focusFormSaveForField('sheet')).toBe(true);
    expect(document.activeElement).toBe(page.root?.querySelector('[data-form-save-btn]'));
  });
});
