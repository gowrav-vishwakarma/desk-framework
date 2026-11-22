import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import DeskSplitDialog from '../src/split/DeskSplitDialog.vue';
import { splitNewRow, type DeskSplitPolicy, type DeskSplitRow } from '../src/split/math';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

interface Row extends DeskSplitRow {
  key: string;
  uom: string;
  batchNumber?: string | null;
  note?: string | null;
  attributes?: { name: string; value: string }[];
}

let made = 0;
/** A page's fresh row: its defaults only (the unit), never anything from another row. */
function fresh(remaining: number): Row {
  made += 1;
  return { key: `row-${made}`, quantity: remaining, uom: 'PCS' };
}

/**
 * Like a page whose builder also serves its fillers: given a row, it copies it. The split grid must never hand it
 * one for a new row (that was the regression: the parameter box's new row came pre-filled from the row above).
 */
function carrying(remaining: number, previous?: Row): Row {
  return previous ? { ...previous, key: `copy-${remaining}`, quantity: remaining } : fresh(remaining);
}

const filled: Row = {
  key: 'first',
  quantity: 4,
  uom: 'PCS',
  batchNumber: 'B-1',
  note: 'first lot',
  attributes: [{ name: 'Colour', value: 'Red' }],
};

describe('split grid new row', () => {
  it('asks the page for a fresh row with the remaining quantity only, never handing it the row above', () => {
    const blank = vi.fn(carrying);
    const row = splitNewRow([filled], 10, 'match', blank);
    expect(blank).toHaveBeenCalledTimes(1);
    expect(blank.mock.calls[0]).toEqual([6]);
    expect(row).not.toBe(filled);
    expect(row).toEqual({ key: expect.any(String), quantity: 6, uom: 'PCS' });
  });

  it.each<DeskSplitPolicy>(['follow', 'confirm'])('leaves the quantity empty under %s, so the leave cell can end the grid', (policy) => {
    const row = splitNewRow([filled], 10, policy, carrying);
    expect(row.quantity).toBeNull();
    expect(row.batchNumber).toBeUndefined();
    expect(row.note).toBeUndefined();
    expect(row.attributes).toBeUndefined();
  });

  it('refuses a new row that is a row the grid already holds', () => {
    expect(() => splitNewRow([filled], 10, 'follow', () => filled)).toThrow(/new object/);
  });

  it('Enter on the last cell adds an empty row; Enter on its empty quantity moves to OK', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const rows = ref<Row[]>([{ ...filled, attributes: filled.attributes?.map((attr) => ({ ...attr })) }]);
    const Harness = defineComponent({
      components: { DeskSplitDialog },
      setup() {
        const open = ref(true);
        return {
          open,
          rows,
          columns: [
            { id: 'quantity', header: 'Qty', width: 60, editor: 'number' },
            { id: 'batchNumber', header: 'Batch', width: 100 },
            { id: 'note', header: 'Note', width: 100 },
          ],
          blank: carrying,
          rowKey: (row: Record<string, unknown>) => String(row.key),
        };
      },
      template: `<DeskSplitDialog v-model:open="open" v-model:rows="rows" title="Parameters" :target="4" policy="follow"
        :columns="columns" :blank="blank" :row-key="rowKey" />`,
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    await flushPromises();
    const grid = document.body.querySelector('.desk-split-grid .table-content');
    if (!(grid instanceof HTMLElement)) throw new Error('grid missing');
    const press = async (): Promise<void> => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushPromises();
      await nextTick();
    };

    await press();
    await press();
    await press();
    expect(rows.value).toHaveLength(2);
    const added = rows.value[1];
    expect(added).not.toBe(rows.value[0]);
    expect(added).toEqual({ key: expect.any(String), quantity: null, uom: 'PCS' });
    expect(rows.value[0]).toMatchObject({ quantity: 4, batchNumber: 'B-1', note: 'first lot' });

    await press();
    expect(document.activeElement).toBe(document.body.querySelector('[data-desk-field="split-ok"]'));
    expect(rows.value).toHaveLength(2);
    wrapper.unmount();
  });

  it('fixedRows: Enter never adds a row; it moves on to OK', async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const rows = ref<Row[]>([{ key: 'only', quantity: 2, uom: 'PCS', batchNumber: 'B-1' }]);
    const Harness = defineComponent({
      components: { DeskSplitDialog },
      setup() {
        const open = ref(true);
        return { open, rows, columns: [{ id: 'quantity', header: 'Qty', width: 60, editor: 'number' }, { id: 'batchNumber', header: 'Batch', width: 100 }], blank: carrying, rowKey: (row: Record<string, unknown>) => String(row.key) };
      },
      template: `<DeskSplitDialog v-model:open="open" v-model:rows="rows" title="Parameters" :target="4" policy="follow" fixed-rows
        :columns="columns" :blank="blank" :row-key="rowKey" />`,
    });
    const wrapper = mount(Harness, { attachTo: document.body });
    await flushPromises();
    const grid = document.body.querySelector('.desk-split-grid .table-content');
    if (!(grid instanceof HTMLElement)) throw new Error('grid missing');
    for (let i = 0; i < 3; i += 1) {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushPromises();
      await nextTick();
    }
    expect(rows.value).toHaveLength(1);
    wrapper.unmount();
  });
});
