import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatCombo, mayDispatch, presetToCombo, toCombo, type DeskKeyInput } from '../src/keys/combo';
import { comboConflicts, indexBindings, mergeBindings } from '../src/keys/keymap';
import {
  addDeskFields,
  addDeskHandlers,
  createDeskLayer,
  deskLayers,
  popDeskLayer,
  pushDeskLayer,
  resolveLayerHandler,
  type DeskLayer,
} from '../src/keys/layers';
import { ALT_IDLE, altTapKeyDown, altTapKeyUp } from '../src/keys/altTap';
import {
  focusLayerInitial,
  focusNextDeskField,
  focusPrevDeskField,
  resolveDeskEnter,
  resolveDeskPrev,
} from '../src/focus/useDeskFocus';
import { resolveGridKey, type GridKeyInput, type GridKeyState } from '../src/grid/keyboard';

function key(input: Partial<DeskKeyInput> & { key: string }): DeskKeyInput {
  return { ctrl: false, shift: false, alt: false, meta: false, ...input };
}

describe('desk combos', () => {
  it('normalises modifier order and uses the physical key for letters and digits', () => {
    expect(toCombo(key({ key: 'S', code: 'KeyS', shift: true, ctrl: true }))).toBe('ctrl+shift+s');
    expect(toCombo(key({ key: '¡', code: 'Digit1', alt: true }))).toBe('alt+1');
    expect(toCombo(key({ key: 'F8', code: 'F8' }))).toBe('f8');
    expect(toCombo(key({ key: 'Control', ctrl: true }))).toBeNull();
  });

  it('reads preset arrays in any order and treats an empty array as unbound', () => {
    expect(presetToCombo(['s', 'ctrl'])).toBe('ctrl+s');
    expect(presetToCombo(['alt', 'shift', 'f10'])).toBe('shift+alt+f10');
    expect(presetToCombo([])).toBeNull();
    expect(formatCombo('ctrl+shift+f8', false)).toBe('Ctrl+Shift+F8');
    expect(formatCombo('ctrl+arrowleft', true)).toBe('Cmd+Left');
    expect(toCombo(key({ key: 'ArrowLeft', meta: true }), true)).toBe('ctrl+arrowleft');
    expect(toCombo(key({ key: 'ArrowLeft', meta: true }), false)).toBe('meta+arrowleft');
  });

  it('skips bare keys and clipboard keys while typing, but not function keys or Ctrl+S', () => {
    expect(mayDispatch('delete', true)).toBe(false);
    expect(mayDispatch('delete', false)).toBe(true);
    expect(mayDispatch('f8', true)).toBe(true);
    expect(mayDispatch('ctrl+s', true)).toBe(true);
    expect(mayDispatch('ctrl+x', true)).toBe(false);
    expect(mayDispatch('ctrl+r', false)).toBe(false);
  });
});

describe('desk keymap', () => {
  const preset = { 'action-save': ['f12'], 'action-print': ['alt', 'p'], 'nav-purchase-invoice-register-list': ['alt', 'p'] };

  it('lets a custom binding win and an empty custom binding unbind', () => {
    const bindings = mergeBindings(preset, { 'action-save': ['ctrl', 'a'], 'action-print': [] });
    const index = indexBindings(bindings);
    expect(index.get('ctrl+a')).toEqual(['action-save']);
    expect(index.get('f12')).toBeUndefined();
    expect(index.get('alt+p')).toEqual(['nav-purchase-invoice-register-list']);
    expect(index.get('ctrl+alt+k')).toEqual(['desk-keys']);
    const deskOnly = indexBindings(mergeBindings({}, {}));
    expect(deskOnly.get('ctrl+enter')).toEqual(['grid-cell-dialog', 'desk-jump']);
    expect(deskOnly.get('ctrl+arrowdown')).toEqual(['desk-move-down']);
  });

  it('keeps every action that shares a preset combo', () => {
    expect(indexBindings(mergeBindings(preset, {})).get('alt+p')).toEqual(['action-print', 'nav-purchase-invoice-register-list']);
  });

  it('reports a conflict only inside the same scope class', () => {
    const bindings = mergeBindings(preset, {});
    expect(comboConflicts(bindings, 'action-print', 'alt+p')).toEqual([]);
    expect(comboConflicts({ ...bindings, 'action-export': ['alt', 'p'] }, 'action-print', 'alt+p')).toEqual(['action-export']);
  });
});

describe('desk layers', () => {
  function layer(modal: boolean, handlers: Record<string, () => void>): DeskLayer {
    const created = createDeskLayer(modal);
    addDeskHandlers(created, handlers);
    return created;
  }

  it('runs the innermost handler for any of the combo ids', () => {
    const shell = layer(false, { 'nav-purchase-invoice-register-list': vi.fn() });
    const page = layer(false, { 'action-print': vi.fn() });
    expect(resolveLayerHandler([shell, page], ['action-print', 'nav-purchase-invoice-register-list'])).toBe(page.handlers.get('action-print'));
    expect(resolveLayerHandler([shell], ['action-print', 'nav-purchase-invoice-register-list'])).toBe(shell.handlers.get('nav-purchase-invoice-register-list'));
  });

  it('lets a page edit action win over the shell jump on the same keys', () => {
    const shell = layer(false, { 'desk-jump': vi.fn() });
    const page = layer(false, { 'action-edit': vi.fn() });
    expect(resolveLayerHandler([shell, page], ['grid-cell-dialog', 'desk-jump', 'action-edit'])).toBe(page.handlers.get('action-edit'));
  });

  it('blocks page and shell handlers below a dialog unless marked always', () => {
    const shell = createDeskLayer();
    const keys = { run: vi.fn(), always: true };
    addDeskHandlers(shell, { 'nav-sales-invoice-add': vi.fn(), 'desk-keys': keys });
    const page = layer(false, { 'action-save': vi.fn() });
    const dialog = layer(true, {});
    expect(resolveLayerHandler([shell, page, dialog], ['action-save'])).toBeNull();
    expect(resolveLayerHandler([shell, page, dialog], ['nav-sales-invoice-add'])).toBeNull();
    expect(resolveLayerHandler([shell, page, dialog], ['desk-keys'])).toBe(keys);
  });

  it('passes a key on to the layers below when the top handler says it does not apply now', () => {
    const page = layer(false, { 'action-filter': vi.fn() });
    const off = { run: vi.fn(), when: () => false };
    const on = { run: vi.fn(), when: () => true };
    const grid = createDeskLayer();
    addDeskHandlers(grid, { 'action-filter': off });
    // A grid with no filter row: Ctrl+F opens the page's filter panel.
    expect(resolveLayerHandler([page, grid], ['action-filter'])).toBe(page.handlers.get('action-filter'));
    addDeskHandlers(grid, { 'action-filter': on });
    expect(resolveLayerHandler([page, grid], ['action-filter'])).toBe(on);
  });

  it('removes only the handlers a registration added', () => {
    const page = createDeskLayer();
    const first = vi.fn();
    const second = vi.fn();
    const dispose = addDeskHandlers(page, { 'action-save': first });
    addDeskHandlers(page, { 'action-save': second });
    dispose();
    expect(page.handlers.get('action-save')?.run).toBe(second);
  });
});

describe('desk alt tap', () => {
  const alt = key({ key: 'Alt', alt: true });

  it('arms on a clean tap and hands the next letter to the menu', () => {
    let state = altTapKeyDown(ALT_IDLE, alt, true).state;
    const up = altTapKeyUp(state, key({ key: 'Alt' }), true);
    expect(up.consume).toBe(true);
    state = up.state;
    expect(state.armed).toBe(true);
    const letter = altTapKeyDown(state, key({ key: 's', code: 'KeyS' }), true);
    expect(letter.letter).toBe('s');
    expect(letter.state.armed).toBe(false);
  });

  it('does not arm after an Alt combo, and never arms while a dialog is open', () => {
    let state = altTapKeyDown(ALT_IDLE, alt, true).state;
    state = altTapKeyDown(state, key({ key: 's', code: 'KeyS', alt: true }), true).state;
    expect(altTapKeyUp(state, key({ key: 'Alt' }), true).state.armed).toBe(false);
    const held = altTapKeyDown(ALT_IDLE, alt, false).state;
    expect(altTapKeyUp(held, key({ key: 'Alt' }), false).state.armed).toBe(false);
  });

  it('disarms on Escape and swallows it', () => {
    const armed = { holding: false, clean: false, armed: true };
    const step = altTapKeyDown(armed, key({ key: 'Escape' }), true);
    expect(step.consume).toBe(true);
    expect(step.state.armed).toBe(false);
  });
});

describe('desk focus order', () => {
  const ids = ['name', 'gstin', 'pan', 'contacts', 'bank'];
  const can = (id: string) => id !== 'gstin';

  it('follows onTab when given, else the Enter path', () => {
    expect(resolveDeskEnter(ids, 'name', undefined, can)).toBe('pan');
    expect(resolveDeskEnter(ids, 'name', 'bank', can)).toBe('bank');
  });

  it('goes back to the previous focusable field', () => {
    expect(resolveDeskPrev(ids, 'pan', can)).toBe('name');
    expect(resolveDeskPrev(ids, 'name', can)).toBeNull();
  });
});

describe('desk layer focus in the DOM', () => {
  beforeAll(() => {
    // happy-dom has no layout; treat every attached node as shown.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
    });
  });

  afterEach(() => {
    for (const layer of [...deskLayers()]) popDeskLayer(layer);
    document.body.innerHTML = '';
  });

  function mount(html: string, modal = false): DeskLayer {
    const root = document.createElement('div');
    root.setAttribute('data-desk-layer', '');
    root.innerHTML = html;
    const parent = deskLayers().at(-1)?.root ?? document.body;
    parent.appendChild(root);
    const layer = createDeskLayer(modal);
    layer.root = root;
    pushDeskLayer(layer);
    return layer;
  }

  const focused = () => document.activeElement?.getAttribute('data-desk-field');

  it('skips a read-only or disabled field', () => {
    mount('<input data-desk-field="branch" /><input data-desk-field="warehouse" readonly /><button type="button" data-desk-field="gst" disabled></button><input data-desk-field="party" />');
    focusNextDeskField('branch');
    expect(focused()).toBe('party');
    focusPrevDeskField('party');
    expect(focused()).toBe('branch');
  });

  it('stops on a read-only field that opens a dialog', () => {
    mount('<input data-desk-field="delivery" /><input data-desk-field="shipTo" readonly data-desk-opens /><input data-desk-field="route" />');
    focusNextDeskField('delivery');
    expect(focused()).toBe('shipTo');
    focusNextDeskField('shipTo');
    expect(focused()).toBe('route');
    focusPrevDeskField('route');
    expect(focused()).toBe('shipTo');
  });

  it('moves Enter inside the dialog and accepts on the last field', () => {
    mount('<input data-desk-field="branch" /><input data-desk-field="party" />');
    const dialog = mount('<input data-desk-field="param-uom" /><input data-desk-field="param-bcn" />', true);
    const accept = vi.fn();
    dialog.onAccept = accept;
    focusNextDeskField('param-uom');
    expect(focused()).toBe('param-bcn');
    focusNextDeskField('param-bcn');
    expect(accept).toHaveBeenCalledOnce();
    expect(focused()).toBe('param-bcn');
  });

  it('wraps Tab and Shift+Tab inside a dialog', () => {
    mount('<input data-desk-field="branch" />');
    mount('<input data-desk-field="a" /><input data-desk-field="b" />', true);
    focusNextDeskField('b', 'tab');
    expect(focused()).toBe('a');
    focusPrevDeskField('a');
    expect(focused()).toBe('b');
  });

  it('uses onTab for Tab and onEnter for Enter', () => {
    const page = mount('<input data-desk-field="country" /><input data-desk-field="gstin" /><input data-desk-field="bank" />');
    addDeskFields(page, [{ id: 'country', onTab: 'bank' }]);
    focusNextDeskField('country', 'tab');
    expect(focused()).toBe('bank');
    focusNextDeskField('country');
    expect(focused()).toBe('gstin');
  });

  it('focuses a grid-only page on its first cell', () => {
    const page = mount('<div data-desk-field="grid-1" tabindex="0"></div>');
    const focusGrid = vi.fn(() => true);
    addDeskFields(page, [{ id: 'grid-1', focus: focusGrid }]);
    expect(focusLayerInitial(page)).toBe(true);
    expect(focusGrid).toHaveBeenCalledOnce();
  });

  it('lets fields before a grid win, unless the grid is marked initial', () => {
    const page = mount('<input data-desk-field="name" /><div data-desk-field="grid-2" tabindex="0"></div>');
    focusLayerInitial(page);
    expect(focused()).toBe('name');
    page.root?.querySelector('[data-desk-field="grid-2"]')?.setAttribute('data-desk-initial', '');
    focusLayerInitial(page);
    expect(focused()).toBe('grid-2');
  });

  it('skips a grid with auto focus disabled and honours disableInitialFocus', () => {
    const page = mount('<div data-desk-field="grid-3" tabindex="0" data-desk-noauto></div><input data-desk-field="note" />');
    focusLayerInitial(page);
    expect(focused()).toBe('note');
    (document.activeElement as HTMLElement).blur();
    page.disableInitialFocus = true;
    expect(focusLayerInitial(page)).toBe(false);
  });
});

describe('desk grid tab flow', () => {
  const state: GridKeyState = { mode: 'entry', rowCount: 2, colCount: 3, cursor: { row: 0, col: 1 }, editing: false, pageSize: 10 };
  const tab = (shift = false): GridKeyInput => ({ key: 'Tab', ctrl: false, meta: false, shift, alt: false });
  const enter: GridKeyInput = { key: 'Enter', ctrl: false, meta: false, shift: false, alt: false };

  it('treats Tab like Enter by default', () => {
    expect(resolveGridKey(tab(), state)).toEqual(resolveGridKey(enter, state));
    const last = { ...state, cursor: { row: 1, col: 2 } };
    expect(resolveGridKey(tab(), last)).toEqual(resolveGridKey(enter, last));
  });

  it('moves left on Shift+Tab and wraps to the previous row', () => {
    expect(resolveGridKey(tab(true), { ...state, cursor: { row: 1, col: 0 } })).toEqual({ type: 'move', row: 0, col: 2, extend: false });
  });

  it('leaves the grid on Tab when tabFlow is field', () => {
    expect(resolveGridKey(tab(), { ...state, tabFlow: 'field' })).toEqual({ type: 'exitGrid', via: 'tab', back: false });
    expect(resolveGridKey(tab(true), { ...state, tabFlow: 'field' })).toEqual({ type: 'exitGrid', via: 'tab', back: true });
  });

  it('moves to the next cell on a list instead of opening the row', () => {
    expect(resolveGridKey(tab(), { ...state, mode: 'list' })).toEqual({ type: 'move', row: 0, col: 2, extend: false });
  });
});
