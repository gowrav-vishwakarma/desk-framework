import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeskGrid from '../src/grid/DeskGrid.vue';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('desk grid filter row focus', () => {
  it('a click on a cell after typing in a filter box moves typing to the cells (the link picker: Use qty after a Document filter)', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'entry',
        showFilter: true,
        rows: [
          { id: 1, name: 'Pen', useQty: 0 },
          { id: 2, name: 'Ink', useQty: 0 },
        ],
        columns: [
          { id: 'name', header: 'Name', width: 120, readonly: true },
          { id: 'useQty', header: 'Use qty', width: 80, editor: 'number' },
        ],
      },
      attachTo: document.body,
    });
    await flushPromises();
    const box = wrapper.get('td.column-filter[data-filter="name"] input').element as HTMLInputElement;
    box.focus();
    expect(document.activeElement).toBe(box);
    const cell = wrapper.get('td[data-cell="1-1"]').element;
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(document.activeElement).not.toBe(box);
    expect(wrapper.get('.table-content').element.contains(document.activeElement)).toBe(true);
  });
});
