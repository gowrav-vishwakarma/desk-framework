import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pruneLayoutView } from '../src/grid/layout/edit';
import { layoutViewState, useDeskGridLayouts, type DeskGridLayoutsApi } from '../src/grid/layout/useDeskGridLayouts';
import { describeFilter } from '../src/grid/headerFilter';
import type { DeskColumn } from '../src/grid/types';
import type { DeskFieldCatalog, DeskGridLayout } from '../src/grid/layout/types';

const stored = new Map<string, unknown>();

vi.mock('../src/storage/deskPrefs', () => ({
  readDeskPref: vi.fn((key: string) => Promise.resolve(stored.get(key) ?? null)),
  writeDeskPref: vi.fn((key: string, value: unknown) => {
    stored.set(key, value);
    return Promise.resolve();
  }),
}));

const catalog: DeskFieldCatalog = {
  relations: [],
  fields: [
    { key: 'id', label: 'Id', type: 'number' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number' },
  ],
  always: ['id'],
};

const columns: DeskColumn[] = [
  { id: 'name', header: 'Name' },
  { id: 'status', header: 'Status' },
  { id: 'amount', header: 'Amount', type: 'number' },
];

const open: DeskGridLayout = {
  id: 'open',
  name: 'Open',
  kind: 'tab',
  columns: [
    { id: 'name', header: 'Name', lines: [['name']], sortField: 'name', filterField: 'name' },
    { id: 'status', header: 'Status', lines: [['status']], sortField: null, filterField: 'status' },
    { id: 'amount', header: 'Amount', lines: [['amount']], sortField: 'amount', filterField: 'amount' },
  ],
  view: { sort: { column: 'amount', direction: 'asc' }, filters: { status: '= active', amount: '> 200' } },
  hideActions: true,
};

let seq = 0;

function mountLayouts(saved: unknown): Promise<DeskGridLayoutsApi> {
  seq += 1;
  const storageKey = `view-test-${seq}`;
  stored.set(`grid-layouts:${storageKey}`, saved);
  let api: DeskGridLayoutsApi | null = null;
  mount(
    defineComponent({
      setup() {
        api = useDeskGridLayouts({ storageKey, catalog, columns });
        return () => h('div');
      },
    }),
  );
  return flushPromises().then(() => {
    if (!api) throw new Error('no api');
    return api;
  });
}

beforeEach(() => stored.clear());

describe('layout view state', () => {
  it('falls back to newest first without a saved sort', () => {
    expect(layoutViewState(null)).toEqual({ filters: {}, sortColumn: 'id', sortDescending: true });
    expect(layoutViewState(open)).toEqual({ filters: { status: '= active', amount: '> 200' }, sortColumn: 'amount', sortDescending: false });
  });

  it('fills query filters and sort from the active layout when prefs load', async () => {
    const layouts = await mountLayouts({ version: 1, active: 'open', layouts: [open] });
    expect(layouts.query.value.sort).toEqual({ field: 'amount', direction: 'asc' });
    expect(layouts.query.value.filters).toEqual([
      { field: 'status', type: 'text', text: '= active' },
      { field: 'amount', type: 'number', text: '> 200' },
    ]);
    expect(layouts.filterValues.value).toEqual({ status: '= active', amount: '> 200' });
    expect(layouts.hideActions.value).toBe(true);
  });

  it('applies the view on select, and a user edit does not change the saved layout', async () => {
    const layouts = await mountLayouts({ version: 1, active: 'default', layouts: [open] });
    expect(layouts.query.value.filters).toEqual([]);
    expect(layouts.hideActions.value).toBe(false);
    await layouts.select('open');
    expect(layouts.query.value.sort).toEqual({ field: 'amount', direction: 'asc' });
    layouts.onFilter({ status: '' });
    layouts.onSort('name');
    expect(layouts.query.value.filters).toEqual([]);
    expect(layouts.activeLayout.value?.view).toEqual(open.view);
    await layouts.select('default');
    await layouts.select('open');
    expect(layouts.query.value.filters).toHaveLength(2);
    expect(layouts.sortColumn.value).toBe('amount');
  });

  it('applies a newly saved view to the active layout at once', async () => {
    const layouts = await mountLayouts({ version: 1, active: 'open', layouts: [open] });
    await layouts.save({ ...open, view: { filters: { name: 'tea' } } });
    expect(layouts.query.value.filters).toEqual([{ field: 'name', type: 'text', text: 'tea' }]);
    expect(layouts.sortColumn.value).toBe('id');
    expect(layouts.filterValues.value).toEqual({ name: 'tea' });
  });

  it('never hides actions on Default', async () => {
    const layouts = await mountLayouts({ version: 1, active: 'default', layouts: [{ ...open, id: 'default', name: 'Default' }] });
    expect(layouts.hideActions.value).toBe(false);
    expect(layouts.query.value.filters).toHaveLength(2);
  });
});

describe('designer view pruning', () => {
  it('drops entries whose column is gone or can no longer sort or filter', () => {
    const next = pruneLayoutView(
      { ...open, columns: [open.columns[0]!, { ...open.columns[2]!, sortField: null }], view: { ...open.view, filters: { ...open.view?.filters, name: '' } } },
      catalog,
    );
    expect(next.view).toEqual({ filters: { amount: '> 200', name: '' } });
  });
});

describe('filter summary', () => {
  it('reads like a sentence', () => {
    expect(describeFilter('Status', 'text', '= active')).toBe('Status equals active');
    expect(describeFilter('Name', 'text', 'tea')).toBe('Name contains tea');
    expect(describeFilter('Amount', 'number', '> 200 <= 500')).toBe('Amount greater than 200 and less or equal 500');
    expect(describeFilter('Date', 'date', 'this month')).toBe('Date is this month');
    expect(describeFilter('Amount', 'number', '')).toBe('Amount: any');
  });
});

describe('default hidden column in the grid', () => {
  it('starts hidden, can be shown, and still reports hidden ids', async () => {
    const { default: DeskGrid } = await import('../src/grid/DeskGrid.vue');
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'list',
        rows: [{ id: 1, name: 'Tea', status: 'open' }],
        columns: [
          { id: 'name', header: 'Name' },
          { id: 'status', header: 'Status', defaultHidden: true },
        ],
      },
    });
    await flushPromises();
    expect(wrapper.emitted('update:hidden')?.at(-1)?.[0]).toEqual(['status']);
    expect(wrapper.findAll('thead th').some((th) => th.text().includes('Status'))).toBe(false);
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});

describe('grid status line', () => {
  it('counts what the page counts: items, or the groups a report pages by', async () => {
    const { default: DeskGrid } = await import('../src/grid/DeskGrid.vue');
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    const props = {
      mode: 'list' as const,
      rows: [{ id: 1, name: 'Tea' }],
      columns: [{ id: 'name', header: 'Name' }],
      page: 2,
      pageCount: 4,
      pageSize: 10,
      itemCount: 37,
    };
    const plain = mount(DeskGrid, { props });
    expect(plain.text()).toContain('11–20 of 37 items');
    plain.unmount();
    const byParty = mount(DeskGrid, { props: { ...props, itemNoun: ['Party group', 'Party groups'] as const } });
    expect(byParty.text()).toContain('11–20 of 37 Party groups');
    byParty.unmount();
    vi.unstubAllGlobals();
  });
});
