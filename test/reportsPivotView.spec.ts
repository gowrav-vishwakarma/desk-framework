import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeReportsHost } from './reportsHost';
import { emptyPivotLayout } from '../src/pivot/pivotLayout';
import type { PivotField, PivotLayout } from '../src/pivot/pivotTypes';
import {
  pivotName,
  pivotSummary,
  pivotSummaryAll,
  summaryCovers,
} from '../src/reports/studioPivot';

fakeReportsHost();

vi.mock('../src/reports/studioApi', () => ({
  listReports: () =>
    Promise.resolve([
      {
        name: 'flat.sales.lines',
        title: 'Sales Lines',
        origin: 'system',
        definition: { menu: { show: true, group: 'Flat data', order: 1 } },
      },
      {
        name: 'flat.purchase.lines',
        title: 'Purchase Lines',
        origin: 'saved',
        definition: { menu: { show: true, group: 'Flat data', order: 2, label: 'Purchase lines' } },
      },
      {
        name: 'mis.sales.margin.lines',
        title: 'MIS Sales Margin Lines',
        origin: 'system',
        definition: { menu: { show: true, group: 'MIS / Flat data', order: 1, label: 'Sales margin lines' } },
      },
      {
        name: 'sales.register',
        title: 'Sales Register',
        origin: 'system',
        definition: { menu: { show: true, group: 'Sales', order: 1, label: 'Register' } },
      },
    ]),
  listPivots: () =>
    Promise.resolve([
      {
        name: 'pivot.sales-by-brand',
        title: 'Sales by Brand',
        definition: {
          kind: 'pivot',
          source: 'flat.sales.lines',
          menu: { show: true, group: 'Flat data' },
        },
      },
    ]),
}));

afterEach(() => {
  document.body.innerHTML = '';
});

const layout = (patch: Partial<PivotLayout>): PivotLayout => ({ ...emptyPivotLayout(), ...patch });

describe('saved pivots', () => {
  it('asks the server to group by the layout, and loads again only for what the rows cannot give', () => {
    const columns = ['date', 'branch', 'brand', 'party', 'qty', 'net'];
    const used = layout({
      rows: [{ field: 'brand' }],
      columns: [{ field: 'date', dateGroup: 'month' }],
      filters: [{ field: 'branch' }],
      values: [
        { field: 'qty', aggregate: 'sum' },
        { field: 'qty', aggregate: 'avg' },
        { field: 'party', aggregate: 'distinct' },
      ],
    });
    // Report order; a distinct count's field is a key, as groups cannot add distinct values up.
    const summary = pivotSummary(used, columns);
    expect(summary).toEqual({
      keys: [
        { column: 'date', bucket: 'month' },
        { column: 'branch' },
        { column: 'brand' },
        { column: 'party' },
      ],
      values: ['qty'],
    });
    expect(summaryCovers(null, summary)).toBe(false);
    // Fewer fields, or months to FY: the pivot adds the loaded groups up.
    expect(
      summaryCovers(
        summary,
        pivotSummary(
          layout({
            columns: [{ field: 'date', dateGroup: 'fy' }],
            values: [{ field: 'qty', aggregate: 'sum' }],
          }),
          columns,
        ),
      ),
    ).toBe(true);
    // Days, or a field not loaded: load again.
    expect(
      summaryCovers(summary, pivotSummary(layout({ columns: [{ field: 'date' }] }), columns)),
    ).toBe(false);
    expect(
      summaryCovers(
        summary,
        pivotSummary(layout({ values: [{ field: 'net', aggregate: 'sum' }] }), columns),
      ),
    ).toBe(false);
    // The same date by FY and by calendar year on two axes loads quarters, which give both.
    expect(
      pivotSummary(
        layout({
          rows: [{ field: 'date', dateGroup: 'fy' }],
          filters: [{ field: 'date', dateGroup: 'year' }],
        }),
        columns,
      ).keys,
    ).toEqual([{ column: 'date', bucket: 'quarter' }]);
  });

  it('loads every column once for a report without columnsOnDemand, so no layout loads again', () => {
    const output = [
      { column: 'date', label: 'Date', format: 'date' as const },
      { column: 'brand', label: 'Brand' },
      { column: 'qty', label: 'Qty', format: 'qty' as const },
      { column: 'net', label: 'Net', format: 'money' as const },
    ];
    const columns = output.map((column) => column.column);
    const all = pivotSummaryAll(
      output,
      pivotSummary(layout({ rows: [{ field: 'brand' }] }), columns),
    );
    expect(all).toEqual({
      keys: [{ column: 'date' }, { column: 'brand' }],
      values: ['qty', 'net'],
    });
    // Any later layout: days, another number, FY.
    for (const next of [
      layout({ columns: [{ field: 'date' }], values: [{ field: 'net', aggregate: 'sum' }] }),
      layout({
        rows: [{ field: 'date', dateGroup: 'fy' }],
        values: [{ field: 'qty', aggregate: 'avg' }],
      }),
    ]) {
      expect(summaryCovers(all, pivotSummary(next, columns))).toBe(true);
    }
    // A number counted distinct is a key, so its distinct count is right.
    expect(
      pivotSummaryAll(
        output,
        pivotSummary(layout({ values: [{ field: 'qty', aggregate: 'distinct' }] }), columns),
      ).keys.map((key) => key.column),
    ).toEqual(['date', 'brand', 'qty']);
  });

  it('names a new pivot from its title, free of the names taken', () => {
    expect(pivotName('Sales by Brand — FY', new Set())).toBe('pivot.sales-by-brand-fy');
    expect(
      pivotName('Sales by Brand', new Set(['pivot.sales-by-brand', 'pivot.sales-by-brand-2'])),
    ).toBe('pivot.sales-by-brand-3');
    expect(pivotName('!!!', new Set())).toBe('pivot.view');
  });

  it('puts saved pivots in the Studio Reports menu with the pivot mark, opening the pivot', async () => {
    const { loadStudioMenu, studioReportsMenu } = await import(
      '../src/reports/studioMenu'
    );
    loadStudioMenu(34);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const children = studioReportsMenu(new Set())?.children ?? [];
    expect(children.map((node) => (node.separator ? '—' : node.label))).toEqual([
      'Sales',
      '—',
      'Flat data',
      '—',
      'Saved pivots',
    ]);
    const flat = children.find((node) => node.label === 'Flat data');
    expect(flat?.children?.map((node) => [node.label, node.route, node.icon ?? null, node.hint ?? null])).toEqual([
      ['Sales Lines', 'reports/studio/run/flat.sales.lines', 'system', 'A system report'],
      ['Purchase lines', 'reports/studio/run/flat.purchase.lines', 'company', 'A company report'],
      ['Sales margin lines', 'reports/studio/run/mis.sales.margin.lines', 'system', 'A system report'],
    ]);
    expect(children.find((node) => node.label === 'Sales')?.children?.[0]).toMatchObject({
      icon: 'system',
      hint: 'A system report',
    });
    const pivots = children.find((node) => node.label === 'Saved pivots');
    expect(pivots?.children?.map((node) => [node.label, node.route, node.icon ?? null])).toEqual([
      ['Sales by Brand', 'reports/studio/pivot/pivot.sales-by-brand', 'pivot'],
    ]);
  });

  it('lists built-in reports first, then a divider and the designer reports; built-ins alone without studio rights', async () => {
    const { loadStudioMenu, studioReportsMenu } = await import('../src/reports/studioMenu');
    loadStudioMenu(34);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const builtIn = [
      { label: 'Ledger', route: 'ledger', icon: 'code' as const },
      { label: 'DayBook', route: 'daybook', icon: 'code' as const },
    ];
    const merged = studioReportsMenu(new Set(), { builtIn });
    expect(merged?.letter).toBe('r');
    expect(merged?.children?.map((node) => (node.separator ? '—' : node.label))).toEqual(['Ledger', 'DayBook', '—', 'Sales', '—', 'Flat data', '—', 'Saved pivots']);
    // No Report Studio right: the built-in reports still show; R taken elsewhere, the next free letter.
    const alone = studioReportsMenu(new Set(['r']), { builtIn, studio: false });
    expect(alone?.letter).toBe('o');
    expect(alone?.children?.map((node) => node.label)).toEqual(['Ledger', 'DayBook']);
    expect(studioReportsMenu(new Set(), { builtIn: [], studio: false })).toBeNull();
  });

  it('opens with a saved layout and tells the page which fields it uses', async () => {
    const { mount } = await import('@vue/test-utils');
    const { default: PivotDesigner } = await import('../src/pivot/PivotDesigner.vue');
    const fields: PivotField[] = [
      { id: 'brand', label: 'Brand', kind: 'text' },
      { id: 'qty', label: 'Qty', kind: 'number' },
    ];
    const start = layout({
      rows: [{ field: 'brand' }],
      values: [{ field: 'qty', aggregate: 'sum' }],
    });
    const wrapper = mount(PivotDesigner, {
      props: {
        fields,
        facts: [
          { brand: 'A', qty: 2 },
          { brand: 'A', qty: 3 },
        ],
        storageKey: 'test-view',
        start,
        remember: false,
      },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const emitted = wrapper.emitted('layout')?.[0]?.[0] as PivotLayout | undefined;
    expect(emitted?.rows.map((item) => item.field)).toEqual(['brand']);
    expect(wrapper.find('tbody tr.desk-pivot-row').text()).toContain('5');
    wrapper.unmount();
  });
});
