import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { configureDesk } from '../src/host';
import { loadDeskKeymap } from '../src/keys/deskKeymap';
import DeskField from '../src/form/DeskField.vue';
import DeskLookupBox from '../src/form/DeskLookupBox.vue';
import type { DeskLookupConfig } from '../src/grid/types';

const openDeskPage = vi.fn();
vi.mock('../src/page/openDeskPage', () => ({
  openDeskPage: (...args: unknown[]) => openDeskPage(...args),
}));

beforeEach(() => {
  configureDesk({
    presets: { test: { 'action-new': ['alt', 'c'] } },
    presetLabels: [],
    defaultPreset: 'test',
    label: (id) => id,
  });
  loadDeskKeymap(null);
  openDeskPage.mockReset();
  openDeskPage.mockResolvedValue({ id: 7, name: 'Acme' });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const PartyPage = defineComponent({ template: '<div />' });
const editor = {
  page: async () => PartyPage,
  create: (typed: string) => ({ name: typed }),
  toRow: (saved: unknown) => saved as Record<string, unknown>,
};
const base: DeskLookupConfig = {
  labelKey: 'name',
  valueKey: 'id',
  columns: [],
  minChars: 1,
  fetch: async () => [],
};

function box(props: { lookup: DeskLookupConfig } & Record<string, unknown>) {
  return mount(DeskLookupBox, {
    props: { modelValue: '', fieldId: 'party', ...props },
    attachTo: document.body,
  });
}

function plus(wrapper: ReturnType<typeof box>) {
  return wrapper.find('.desk-field-add-btn');
}

async function typeText(wrapper: ReturnType<typeof box>, text: string) {
  const input = wrapper.get('input');
  (input.element as HTMLInputElement).value = text;
  await input.trigger('input');
}

describe('"+" on a lookup that has an editor', () => {
  it('is off by default even with an editor, shows with addButton, and never without an editor', () => {
    const plain = box({ lookup: { ...base, editor } });
    expect(plus(plain).exists()).toBe(false);
    plain.unmount();
    const none = box({ lookup: base, addButton: true });
    expect(plus(none).exists()).toBe(false);
    none.unmount();
    const on = box({ lookup: { ...base, editor }, addButton: true });
    expect(plus(on).exists()).toBe(true);
    expect(plus(on).attributes('data-desk-action')).toBe('party-add-new');
    on.unmount();
  });

  it('is out of the tab order and keeps focus in the box', async () => {
    const wrapper = box({ lookup: { ...base, editor }, addButton: true });
    expect(plus(wrapper).attributes('tabindex')).toBe('-1');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    plus(wrapper).element.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('in a form runs the same editor as the New key and picks the saved row', async () => {
    const wrapper = box({ lookup: { ...base, editor }, addButton: true });
    await typeText(wrapper, 'Acm');
    await plus(wrapper).trigger('click');
    await flushPromises();
    expect(openDeskPage).toHaveBeenCalledTimes(1);
    expect(openDeskPage.mock.calls[0]![0]).toMatchObject({ params: { name: 'Acm' } });
    expect(wrapper.emitted('pick')?.at(-1)).toEqual([{ id: 7, name: 'Acme' }]);

    await typeText(wrapper, 'Acm');
    await wrapper.get('input').trigger('keydown', { key: 'c', altKey: true });
    await flushPromises();
    expect(openDeskPage).toHaveBeenCalledTimes(2);
    expect(openDeskPage.mock.calls[1]![0]).toEqual(openDeskPage.mock.calls[0]![0]);
    wrapper.unmount();
  });

  it('in a grid cell asks the grid, as the key does', async () => {
    const wrapper = box({ lookup: { ...base, editor }, variant: 'grid', addButton: true });
    await flushPromises();
    await typeText(wrapper, 'Acm');
    await plus(wrapper).trigger('click');
    expect(wrapper.emitted('editor')?.at(-1)).toEqual(['new', 'Acm']);
    expect(openDeskPage).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('DeskField passes addButton to its lookup only when it is on', () => {
    const field = (extra: Record<string, unknown>) =>
      mount(DeskField, {
        props: {
          modelValue: '',
          fieldId: 'party',
          label: 'Party',
          kind: 'lookup',
          lookup: { ...base, editor },
          ...extra,
        },
        attachTo: document.body,
      });
    const plain = field({});
    expect(plain.find('.desk-field-add-btn').exists()).toBe(false);
    plain.unmount();
    const on = field({ addButton: true });
    expect(on.find('.desk-field-add-btn').exists()).toBe(true);
    on.unmount();
  });
});
