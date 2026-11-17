import { describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { useDeskFormDirty } from '../src/form/formDirty';

function record() {
  return reactive({ name: '', units: { base: 'PC' }, lines: [] as string[], ready: { units: false } });
}

describe('desk form dirty tracker', () => {
  it('takes changes before the first input as the baseline', async () => {
    const form = record();
    const changes = useDeskFormDirty(() => form, { ignore: ['ready'] });
    form.units.base = 'KG';
    await nextTick();
    changes.arm();
    expect(changes.dirty.value).toBe(false);
    form.name = 'Typed';
    expect(changes.dirty.value).toBe(true);
    expect(changes.changed.value).toEqual(['name']);
  });

  it('rebases one key and resets all', () => {
    const form = record();
    const changes = useDeskFormDirty(() => form, { ignore: ['ready'] });
    changes.arm();
    form.name = 'Typed';
    form.lines.push('late load');
    changes.rebase('lines');
    expect(changes.isDirty('lines')).toBe(false);
    expect(changes.isDirty('name')).toBe(true);
    changes.reset();
    expect(changes.dirty.value).toBe(false);
  });

  it('settles a pane without hiding edits made before', async () => {
    const form = record();
    const changes = useDeskFormDirty(() => form, { ignore: ['ready'] });
    changes.arm();
    form.name = 'Typed';
    await changes.settle(['units', 'name'], () => {
      form.units.base = 'BOX';
      form.name = 'Typed by pane';
    });
    expect(changes.isDirty('units')).toBe(false);
    expect(changes.isDirty('name')).toBe(true);
  });

  it('counts parts and offers their save when only parts are dirty', async () => {
    const form = record();
    const changes = useDeskFormDirty(() => form);
    let lines = 0;
    const save = vi.fn(() => {
      lines = 0;
      return Promise.resolve(true);
    });
    const remove = changes.addPart({ dirty: () => lines > 0, save, guard: 'page', node: () => null });
    lines = 2;
    expect(changes.pendingSave()).not.toBeNull();
    expect(await changes.pendingSave()?.()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(changes.beforeSwap(null)).toBe(true);
    remove();
  });
});
