import { describe, expect, it } from 'vitest';
import { resolveRowActionDisplayMode, splitRowActions } from '../src/grid/rowActions';
import type { DeskRowAction } from '../src/grid/types';

function action(name: string, displayMode?: DeskRowAction['displayMode']): DeskRowAction {
  return { name, label: name, disabled: false, ...(displayMode ? { displayMode } : {}) };
}

describe('splitRowActions', () => {
  it('keeps relative order within buttons and menu', () => {
    const list = [action('edit'), action('print', 'menu'), action('view'), action('delete', 'menu')];
    const { buttons, menu } = splitRowActions(list);
    expect(buttons.map((item) => item.name)).toEqual(['edit', 'view']);
    expect(menu.map((item) => item.name)).toEqual(['print', 'delete']);
  });

  it('treats missing displayMode as btngroup', () => {
    const { buttons, menu } = splitRowActions([action('a'), action('b')]);
    expect(buttons).toHaveLength(2);
    expect(menu).toHaveLength(0);
  });
});

describe('resolveRowActionDisplayMode', () => {
  it('uses rowDisplay override over action metadata', () => {
    expect(resolveRowActionDisplayMode('delete', 'btngroup', { delete: 'menu' })).toBe('menu');
  });

  it('reads menu from action displayMode', () => {
    expect(resolveRowActionDisplayMode('copy', 'menu')).toBe('menu');
    expect(resolveRowActionDisplayMode('copy', 'btngroup')).toBe('btngroup');
    expect(resolveRowActionDisplayMode('copy', 'inline')).toBe('btngroup');
  });

  it('defaults to btngroup', () => {
    expect(resolveRowActionDisplayMode('edit', undefined)).toBe('btngroup');
  });
});
