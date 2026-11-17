import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DeskGrid from '../src/grid/DeskGrid.vue';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const foot = [
  { id: 'subtotal' },
  { id: 'overall', edit: 'overall' },
  { id: 'charges', edit: 'charges' },
  { id: 'grand' },
];

function entryGrid(footEntry: boolean) {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  return mount(DeskGrid, {
    props: {
      mode: 'entry',
      rows: [{ id: 1, productName: '', qty: null }],
      columns: [
        { id: 'productName', header: 'Item', width: 120 },
        { id: 'qty', header: 'Qty', width: 60 },
      ],
      exitWhenBlank: 'productName',
      foot,
      footEntry,
    },
    attachTo: document.body,
  });
}

async function press(wrapper: ReturnType<typeof entryGrid>, key: string, extra: KeyboardEventInit = {}): Promise<void> {
  await wrapper.get('.table-content').trigger('keydown', { key, ...extra });
  await flushPromises();
}

describe('desk grid foot entry', () => {
  it('lands Enter from the blank item row on the totals, walks them on Enter, and opens on Ctrl+Enter', async () => {
    const wrapper = entryGrid(true);
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('exit')).toBeUndefined();
    expect(wrapper.emitted('foot')).toBeUndefined();

    await press(wrapper, 'Enter', { ctrlKey: true });
    expect(wrapper.emitted('foot')?.[0]).toEqual(['overall']);

    await press(wrapper, 'Enter');
    expect(wrapper.emitted('foot')).toHaveLength(1);
    await press(wrapper, 'Enter', { ctrlKey: true });
    expect(wrapper.emitted('foot')?.[1]).toEqual(['charges']);

    await press(wrapper, 'Enter', { shiftKey: true });
    await press(wrapper, 'Enter', { ctrlKey: true });
    expect(wrapper.emitted('foot')?.[2]).toEqual(['overall']);

    await press(wrapper, 'Enter');
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('exit')).toHaveLength(1);
    expect(wrapper.emitted('foot')).toHaveLength(3);
    wrapper.unmount();
  });

  it('lands on the totals from an empty item lookup, the way the voucher item cell leaves', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'entry',
        rows: [{ id: 1, productName: '', qty: null }],
        columns: [
          {
            id: 'productName',
            header: 'Item',
            width: 120,
            editor: 'lookup',
            opensOnEnter: true,
            blank: true,
            afterBlank: 'exit',
            lookup: { labelKey: 'name', valueKey: 'id', columns: [{ id: 'name', header: 'Name', field: 'name' }], fetch: () => Promise.resolve([]) },
            commit: (row: Record<string, unknown>, text: string) => {
              row.productName = text;
            },
          },
          { id: 'qty', header: 'Qty', width: 60 },
        ],
        exitWhenBlank: 'productName',
        foot,
        footEntry: true,
      },
      slots: {
        foot: '<tr><td data-foot-line="overall">Overall discount</td></tr><tr><td data-foot-line="charges">Other charges</td></tr>',
      },
      attachTo: document.body,
    });
    await press(wrapper, 'Enter');
    const input = wrapper.find('.desk-lookup input');
    expect(input.exists()).toBe(true);
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(wrapper.find('.desk-lookup input').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('.table-content').element);
    expect(wrapper.emitted('exit')).toBeUndefined();

    await press(wrapper, 'Enter', { ctrlKey: true });
    expect(wrapper.emitted('foot')?.[0]).toEqual(['overall']);
    wrapper.unmount();
  });

  it('keeps the old flow without foot entry: Enter leaves, and Enter on a total opens it', async () => {
    const wrapper = entryGrid(false);
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('exit')).toHaveLength(1);

    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'Enter');
    expect(wrapper.emitted('foot')?.[0]).toEqual(['overall']);
    wrapper.unmount();
  });
});
