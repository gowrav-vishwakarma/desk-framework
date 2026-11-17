import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DeskGrid from '../src/grid/DeskGrid.vue';
import { footCellBottoms, footPinFits, scrollDeltaToClear } from '../src/grid/footPin';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('desk grid footer pin', () => {
  it('stacks every totals row and keeps a rowspan description beside them', () => {
    const bottoms = footCellBottoms([
      { height: 22, spans: [8, 8, 1, 1] },
      { height: 22, spans: [1, 1] },
      { height: 22, spans: [1, 1] },
      { height: 24, spans: [1, 1] },
    ]);
    expect(bottoms[3]).toEqual([0, 0]);
    expect(bottoms[2]).toEqual([24, 24]);
    expect(bottoms[1]).toEqual([46, 46]);
    expect(bottoms[0]).toEqual([0, 0, 68, 68]);
  });

  it('sticks the totals only while a body row fits above them, so they never cover the row being typed in', () => {
    // A 248px grid with a 29px header: 232px of totals leave no row; 180px leave room for one 24px row.
    expect(footPinFits(248, 29, 232, 24)).toBe(false);
    expect(footPinFits(248, 29, 180, 24)).toBe(true);
    expect(footPinFits(248, 29, 195, 24)).toBe(true);
    expect(footPinFits(248, 29, 196, 24)).toBe(false);
  });

  it('scrolls a cell up when the pinned totals cover it, and leaves a clear cell alone', () => {
    expect(scrollDeltaToClear(400, 428, 40, 360)).toBe(68);
    expect(scrollDeltaToClear(10, 38, 40, 360)).toBe(-30);
    expect(scrollDeltaToClear(80, 108, 40, 360)).toBe(0);
    expect(scrollDeltaToClear(200, 420, 40, 360)).toBe(60);
  });

  it('starts pinned and lets the corner menu unpin the totals or report a page option', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        rows: [{ id: 1, productName: 'Pen' }],
        columns: [{ id: 'productName', header: 'Item', width: 120 }],
        pinFoot: true,
        options: [{ id: 'splitDiscount', label: 'Separate Discount and Gross columns', checked: false }],
        'onUpdate:pinFoot': (value: boolean) => {
          void wrapper.setProps({ pinFoot: value });
        },
      },
      slots: {
        foot: '<tr class="voucher-foot"><td>Total</td></tr>',
      },
    });

    expect(wrapper.classes()).toContain('pin-foot');
    await wrapper.get('th.first-col').trigger('click');
    const items = wrapper.findAll('.desk-grid-menu-item');
    expect(items[0]?.text()).toContain('Pin totals');
    expect(items[0]?.attributes('aria-checked')).toBe('true');

    await items[0]?.trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:pinFoot')?.[0]).toEqual([false]);
    expect(wrapper.classes()).not.toContain('pin-foot');

    await wrapper.get('.desk-grid-menu').trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('.desk-grid-menu').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('option')?.[0]).toEqual(['splitDiscount']);

    await wrapper.get('.desk-grid-menu').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.desk-grid-menu').exists()).toBe(false);
  });

  it('keeps menu keys away from the grid but lets shortcuts such as Ctrl+S reach the page', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const wrapper = mount(DeskGrid, {
      props: {
        rows: [{ id: 1, productName: 'Pen' }],
        columns: [{ id: 'productName', header: 'Item', width: 120 }],
        options: [{ id: 'splitDiscount', label: 'Split', checked: false }],
      },
      attachTo: document.body,
    });
    await wrapper.get('th.first-col').trigger('click');
    const seen: KeyboardEvent[] = [];
    const onWindow = (event: KeyboardEvent): void => {
      seen.push(event);
    };
    window.addEventListener('keydown', onWindow);

    const menu = wrapper.get('.desk-grid-menu').element;
    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    menu.dispatchEvent(save);
    expect(seen).toContain(save);
    expect(save.defaultPrevented).toBe(false);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    menu.dispatchEvent(enter);
    window.removeEventListener('keydown', onWindow);
    expect(Object.keys(wrapper.emitted()).filter((name) => name.startsWith('open') || name.startsWith('edit'))).toEqual([]);
    wrapper.unmount();
  });
});
