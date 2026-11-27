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

  /*
   * A button in a total line (round off's Yes / No, a dialog mark) must take ONE click. Moving the cursor to the line on
   * mousedown closes the cursor row's drawer, the table shrinks, the button slides from under the pointer and the
   * browser fires no click (Ankpal: round off needed two clicks). So the cursor moves only after the button's click.
   */
  it('a mousedown on a button in a total line leaves the cursor row (and its drawer) in place until the click has run', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.useFakeTimers();
    const clicked = vi.fn();
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'entry',
        rows: [{ id: 1, productName: 'Bolt', qty: 2 }],
        columns: [
          { id: 'productName', header: 'Item', width: 120 },
          { id: 'qty', header: 'Qty', width: 60 },
        ],
        foot: [{ id: 'roundOff', edit: 'roundOff' }],
        drawerFor: () => true,
      },
      slots: {
        drawer: '<div class="probe-drawer">batch rows</div>',
        foot: '<tr><td data-foot-line="roundOff">Round off <button type="button" class="probe-flag" tabindex="-1">Yes</button></td></tr>',
      },
      attachTo: document.body,
    });
    wrapper.get('.probe-flag').element.addEventListener('click', clicked);
    (wrapper.get('.table-content').element as HTMLElement).focus();
    await flushPromises();
    expect(wrapper.find('.probe-drawer').exists(), 'the cursor row shows its drawer').toBe(true);

    await wrapper.get('.probe-flag').trigger('mousedown');
    await flushPromises();
    expect(wrapper.find('.probe-drawer').exists(), 'nothing moves under the pointer before the click').toBe(true);

    await wrapper.get('.probe-flag').trigger('mouseup');
    await wrapper.get('.probe-flag').trigger('click');
    vi.runAllTimers();
    await flushPromises();
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.probe-drawer').exists(), 'then the cursor is on the total line').toBe(false);
    vi.useRealTimers();
    wrapper.unmount();
  });
});
