import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeskGrid from '../src/grid/DeskGrid.vue';
import type { DeskGridRow, DeskRowAction } from '../src/grid/types';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
}

function actionsFor(row: DeskGridRow): DeskRowAction[] {
  const locked = row.locked === true;
  return [
    { name: 'view', label: 'View', disabled: locked },
    { name: 'post', label: 'Post', disabled: true },
    { name: 'print', label: 'Print', disabled: locked },
  ];
}

function mountGrid() {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  return mount(DeskGrid, {
    props: {
      mode: 'list',
      rows: [
        { id: 1, name: 'Pen' },
        { id: 2, name: 'Ink', locked: true },
        { id: 3, name: 'Pad' },
      ],
      columns: [
        { id: 'id', header: 'No', width: 60 },
        { id: 'name', header: 'Name', width: 120 },
      ],
      rowActions: actionsFor,
    },
    attachTo: document.body,
  });
}

async function press(target: Element, name: string): Promise<KeyboardEvent> {
  const event = key(name);
  target.dispatchEvent(event);
  await flushPromises();
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('desk grid row actions', () => {
  it('enters the Actions cell with Right and steps over disabled buttons', async () => {
    const wrapper = mountGrid();
    const scroller = wrapper.get('.table-content').element;
    await wrapper.get('.table-content').trigger('focus');
    await press(scroller, 'ArrowRight');
    await press(scroller, 'ArrowRight');
    expect(document.activeElement?.textContent?.trim()).toBe('View');

    await press(document.activeElement as Element, 'ArrowRight');
    expect(document.activeElement?.textContent?.trim()).toBe('Print');
    await press(document.activeElement as Element, 'ArrowRight');
    expect(document.activeElement?.textContent?.trim()).toBe('Print');
    wrapper.unmount();
  });

  it('goes back through the buttons and leaves to the last data cell with Left', async () => {
    const wrapper = mountGrid();
    const scroller = wrapper.get('.table-content').element;
    await wrapper.get('.table-content').trigger('focus');
    await press(scroller, 'ArrowRight');
    await press(scroller, 'ArrowRight');
    await press(document.activeElement as Element, 'ArrowRight');
    await press(document.activeElement as Element, 'ArrowLeft');
    expect(document.activeElement?.textContent?.trim()).toBe('View');
    await press(document.activeElement as Element, 'ArrowLeft');
    expect(document.activeElement).toBe(scroller);
    wrapper.unmount();
  });

  it('keeps Enter for the button so its click runs', async () => {
    const wrapper = mountGrid();
    const scroller = wrapper.get('.table-content').element;
    await wrapper.get('.table-content').trigger('focus');
    await press(scroller, 'ArrowRight');
    await press(scroller, 'ArrowRight');
    const enter = await press(document.activeElement as Element, 'Enter');
    expect(enter.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('does not enter a row whose actions are all disabled, and Down skips back to the data cell', async () => {
    const wrapper = mountGrid();
    const scroller = wrapper.get('.table-content').element;
    await wrapper.get('.table-content').trigger('focus');
    await press(scroller, 'ArrowRight');
    await press(scroller, 'ArrowRight');
    await press(document.activeElement as Element, 'ArrowDown');
    expect(document.activeElement).toBe(scroller);
    await press(scroller, 'ArrowRight');
    expect(document.activeElement).toBe(scroller);
    wrapper.unmount();
  });

  it('puts the tone class and the host class on an action button', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'list',
        rows: [{ id: 1, name: 'Pen' }],
        columns: [{ id: 'name', header: 'Name', width: 120 }],
        rowActions: () => [{ name: 'delete', label: 'Delete', disabled: false, tone: 'danger', class: 'extra' }],
      },
      attachTo: document.body,
    });
    const button = wrapper.get('td.actions-col button');
    expect(button.classes()).toContain('desk-tone-danger');
    expect(button.classes()).toContain('extra');
    wrapper.unmount();
  });

  it('returns to the data cells on Escape', async () => {
    const wrapper = mountGrid();
    const scroller = wrapper.get('.table-content').element;
    await wrapper.get('.table-content').trigger('focus');
    await press(scroller, 'ArrowRight');
    await press(scroller, 'ArrowRight');
    await press(document.activeElement as Element, 'ArrowRight');
    expect(document.activeElement?.textContent?.trim()).toBe('Print');
    await press(document.activeElement as Element, 'Escape');
    expect(document.activeElement).toBe(scroller);
    wrapper.unmount();
  });
});

describe('desk grid Delete on an entry row', () => {
  function entryGrid(rows: DeskGridRow[], minRows = 0) {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'entry',
        rows,
        minRows,
        columns: [
          { id: 'name', header: 'Item', width: 120 },
          { id: 'qty', header: 'Qty', width: 60 },
        ],
        rowDeletable: (row: DeskGridRow) => (row.kept ? `${String(row.name)} stays` : true),
        'onUpdate:rows': (next: DeskGridRow[]) => void wrapper.setProps({ rows: next }),
      },
      attachTo: document.body,
    });
    return wrapper;
  }

  async function keyOn(wrapper: ReturnType<typeof entryGrid>, name: string) {
    await wrapper.get('.table-content').trigger('keydown', { key: name });
    await flushPromises();
  }

  const names = (wrapper: ReturnType<typeof entryGrid>) => (wrapper.props('rows') as DeskGridRow[]).map((row) => row.name);

  it('keeps a row rowDeletable refuses, says why in the status line, and still deletes the others', async () => {
    const wrapper = entryGrid([
      { id: 1, name: 'Pen', qty: 5 },
      { id: 2, name: 'Free pen', qty: 1, kept: true },
      { id: 3, name: 'Pad', qty: 2 },
    ]);
    await keyOn(wrapper, 'ArrowDown');
    await keyOn(wrapper, 'Delete');
    expect(names(wrapper)).toEqual(['Pen', 'Free pen', 'Pad']);
    expect(wrapper.get('[data-desk-grid-refusal]').text()).toBe('Free pen stays');

    await keyOn(wrapper, 'ArrowDown');
    expect(wrapper.find('[data-desk-grid-refusal]').exists()).toBe(false);
    await keyOn(wrapper, 'Delete');
    expect(names(wrapper)).toEqual(['Pen', 'Free pen']);
    wrapper.unmount();
  });

  it('does not clear a refused row that minRows would otherwise blank', async () => {
    const wrapper = entryGrid([{ id: 1, name: 'Free pen', qty: 1, kept: true }], 1);
    await keyOn(wrapper, 'Delete');
    expect(wrapper.props('rows')).toEqual([{ id: 1, name: 'Free pen', qty: 1, kept: true }]);
    expect(wrapper.get('[data-desk-grid-refusal]').text()).toBe('Free pen stays');
    wrapper.unmount();
  });
});

describe('desk grid open-on-focus cell while the user works elsewhere', () => {
  it('a grid mounting with its cursor on an openOnFocus cell leaves the focus where it is (a form loading its rows)', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'entry',
        rows: [{ id: 1, unit: { id: 2, name: 'BALE' } }],
        columns: [
          {
            id: 'unit',
            header: 'Unit',
            width: 120,
            editor: 'lookup',
            openOnFocus: true,
            lookup: { labelKey: 'name', valueKey: 'id', columns: [{ id: 'name', header: 'Unit', field: 'name' }], minChars: 0 },
          },
        ],
      },
      attachTo: document.body,
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await flushPromises();
    expect(document.activeElement).toBe(outside);
    expect(wrapper.element.contains(document.activeElement)).toBe(false);
    wrapper.unmount();
  });
});
