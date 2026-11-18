import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeskLookupBox from '../src/form/DeskLookupBox.vue';
import { configureDesk } from '../src/host';

/**
 * A search typed before a pick must not run after it: a person who types, picks a row already shown and moves on to
 * the next cell had the list open again behind them (its debounced search still due), and the next cell lost its
 * typing. The pick, and closing the box, drop it.
 */
const groups = [
  { id: 1, name: 'Sundry Debtors' },
  { id: 2, name: 'Sundry Creditors' },
];
const asked: string[] = [];

function box() {
  configureDesk({
    presets: {},
    presetLabels: [],
    defaultPreset: '',
    label: (id) => id,
    searchLookup: async (_lookup, query) => {
      asked.push(query);
      return groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));
    },
  });
  return mount(DeskLookupBox, {
    props: { modelValue: '', variant: 'grid', lookup: { labelKey: 'name', valueKey: 'id', columns: [{ id: 'name', header: 'Group', field: 'name' }], minChars: 1 } },
    attachTo: document.body,
  });
}

async function type(wrapper: ReturnType<typeof box>, text: string): Promise<void> {
  const input = wrapper.get('input');
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
}

afterEach(() => {
  vi.useRealTimers();
  asked.length = 0;
  configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id });
});

describe('a pick drops the search typed before it', () => {
  it('no search runs after the pick, and the list stays closed', async () => {
    vi.useFakeTimers();
    const wrapper = box();
    await type(wrapper, 'Sundry');
    await vi.advanceTimersByTimeAsync(250);
    expect(asked).toEqual(['Sundry']);
    // More typed (a search due in 200 ms), then a row already shown is picked at once.
    await type(wrapper, 'Sundry Debtors');
    (wrapper.vm as unknown as { automationPick: (hit: Record<string, unknown>) => void }).automationPick(groups[0]!);
    await vi.advanceTimersByTimeAsync(500);
    await flushPromises();
    expect(asked).toEqual(['Sundry']);
    expect((wrapper.vm as unknown as { automationList: () => { open: boolean } }).automationList().open).toBe(false);
    expect(wrapper.emitted('pick')?.[0]).toEqual([groups[0]]);
    wrapper.unmount();
  });

  it('closing the box drops a search still due', async () => {
    vi.useFakeTimers();
    const wrapper = box();
    await type(wrapper, 'Sun');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(500);
    expect(asked).toEqual([]);
  });
});

describe('clearAfterPick on a multiple pick (aliases, tags)', () => {
  function tags(clearAfterPick: boolean) {
    configureDesk({
      presets: {},
      presetLabels: [],
      defaultPreset: '',
      label: (id) => id,
      // Each row is what was typed.
      searchLookup: async (_lookup, query) => (query.trim() ? [{ id: query.trim(), alias: query.trim() }] : []),
    });
    return mount(DeskLookupBox, {
      props: { modelValue: '', variant: 'form', multiple: true, lookup: { labelKey: 'alias', valueKey: 'alias', columns: [{ id: 'alias', header: 'Alias', field: 'alias' }], minChars: 0, clearAfterPick } },
      attachTo: document.body,
    });
  }

  it('empties the box after each pick, so a second value is typed fresh; without it the search stays', async () => {
    vi.useFakeTimers();
    const cleared = tags(true);
    await type(cleared, 'ALONE');
    await vi.advanceTimersByTimeAsync(250);
    await cleared.get('input').trigger('keydown', { key: 'Enter' });
    expect(cleared.emitted('toggle')?.[0]).toEqual([{ id: 'ALONE', alias: 'ALONE' }]);
    expect((cleared.get('input').element as HTMLInputElement).value).toBe('');
    await type(cleared, 'ALTWO');
    await vi.advanceTimersByTimeAsync(250);
    await cleared.get('input').trigger('keydown', { key: 'Enter' });
    expect(cleared.emitted('toggle')?.[1]).toEqual([{ id: 'ALTWO', alias: 'ALTWO' }]);
    cleared.unmount();

    const kept = tags(false);
    await type(kept, 'ALONE');
    await vi.advanceTimersByTimeAsync(250);
    await kept.get('input').trigger('keydown', { key: 'Enter' });
    expect((kept.get('input').element as HTMLInputElement).value).toBe('ALONE');
    kept.unmount();
  });
});
