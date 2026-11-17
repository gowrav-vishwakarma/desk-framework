import { describe, expect, it } from 'vitest';
import { buildPivotCube } from '../src/pivot/pivotCube';
import { pivotJudge, pivotLabelPasses, pivotTest } from '../src/pivot/pivotFilters';
import { emptyPivotLayout, normalizePivotLayout } from '../src/pivot/pivotLayout';
import { strictPivotLayout } from '../src/pivot/pivotAutomation';
import type { PivotAxisItem, PivotField, PivotLayout, PivotValueFilter } from '../src/pivot/pivotTypes';

const fields: PivotField[] = [
  { id: 'account', label: 'Account', kind: 'text' },
  { id: 'voucher', label: 'Voucher No', kind: 'text' },
  { id: 'amt', label: 'Amount', kind: 'number' },
];
const byId = new Map(fields.map((field) => [field.id, field]));

// Count of account: A has V1=2, V2=1; B has V1=1, V3=3; C has V2=1, V3=1.
const lines = [
  { voucher: 'V1', account: 'A', amt: 10 },
  { voucher: 'V1', account: 'A', amt: 20 },
  { voucher: 'V1', account: 'B', amt: 5 },
  { voucher: 'V2', account: 'A', amt: 5 },
  { voucher: 'V2', account: 'C', amt: 7 },
  { voucher: 'V3', account: 'B', amt: 1 },
  { voucher: 'V3', account: 'B', amt: 2 },
  { voucher: 'V3', account: 'B', amt: 3 },
  { voucher: 'V3', account: 'C', amt: 4 },
];

const COUNT = 'account:count';
const cells = (filter: Partial<PivotValueFilter>): PivotValueFilter => ({ value: COUNT, of: 'cells', op: 'gte', a: 2, ...filter });
const total = (filter: Partial<PivotValueFilter>): PivotValueFilter => ({ value: COUNT, of: 'total', op: 'gte', a: 2, ...filter });

function build(rows: PivotAxisItem[], columns: PivotAxisItem[], values: PivotLayout['values'] = [{ field: 'account', aggregate: 'count' }], data = lines) {
  const cube = buildPivotCube(data, { ...emptyPivotLayout(), rows, columns, values }, byId);
  return { cube, keys: (area: 'rowRoot' | 'colRoot') => cube[area].children.map((node) => node.key) };
}

describe('pivot value filters', () => {
  it('finds accounts added twice in a voucher, with filters on both axes', () => {
    const { cube, keys } = build([{ field: 'account', valueFilters: [cells({})] }], [{ field: 'voucher', valueFilters: [cells({})] }]);
    expect(keys('rowRoot')).toEqual(['A', 'B']);
    expect(keys('colRoot')).toEqual(['V1', 'V3']);
    // Totals cover only what stays: V1 (A, A, B) and V3 (B, B, B).
    expect(cube.raw('', '', 0)).toBe(6);
    expect(cube.filterStats).toEqual([
      { area: 'rows', field: 'account', kept: 2, total: 3 },
      { area: 'columns', field: 'voucher', kept: 2, total: 3 },
    ]);
    expect(cube.otherLeaves('rows').map((leaf) => leaf.id)).toEqual(['V1', 'V2', 'V3']);
  });

  it('runs once, as before, without value rules', () => {
    const { cube } = build([{ field: 'account' }], [{ field: 'voucher' }]);
    expect(cube.raw('', '', 0)).toBe(9);
    expect(cube.filterStats).toEqual([]);
  });

  it('filters on an item total', () => {
    expect(build([{ field: 'account', valueFilters: [total({ a: 3 })] }], []).keys('rowRoot')).toEqual(['A', 'B']);
  });

  it('matches any, all, none and at least N cells', () => {
    const rows = (filter: PivotValueFilter) => build([{ field: 'account', valueFilters: [filter] }], [{ field: 'voucher' }]).keys('rowRoot');
    expect(rows(cells({ op: 'gt', a: 0, match: 'all' }))).toEqual([]);
    expect(rows(cells({ op: 'gt', a: 1, match: 'none' }))).toEqual(['C']);
    expect(rows(cells({ op: 'gte', a: 1, match: 'atLeast', n: 2 }))).toEqual(['A', 'B', 'C']);
    expect(rows(cells({ op: 'gte', a: 1, match: 'atLeast', n: 3 }))).toEqual([]);
  });

  it('looks only at chosen items of the other axis', () => {
    const rows = (filter: PivotValueFilter) => build([{ field: 'account', valueFilters: [filter] }], [{ field: 'voucher' }]).keys('rowRoot');
    expect(rows(cells({ among: ['V3'] }))).toEqual(['B']);
    expect(rows(cells({ among: ['V2'] }))).toEqual([]);
    // Every chosen cell filled: only C has both V2 and V3.
    expect(rows(cells({ op: 'notBlank', match: 'all', among: ['V2', 'V3'] }))).toEqual(['C']);
  });

  it('tests blank and not blank cells', () => {
    const rows = (op: 'blank' | 'notBlank', match: 'any' | 'all') => build([{ field: 'account', valueFilters: [cells({ op, match })] }], [{ field: 'voucher' }]).keys('rowRoot');
    expect(rows('blank', 'any')).toEqual(['A', 'B', 'C']);
    expect(rows('notBlank', 'all')).toEqual([]);
  });

  it('uses not between and absolute value for unbalanced vouchers', () => {
    const balance = [
      { voucher: 'V1', amt: 100 },
      { voucher: 'V1', amt: -100 },
      { voucher: 'V2', amt: 50 },
      { voucher: 'V2', amt: -40 },
      { voucher: 'V3', amt: -30 },
    ];
    const sum = [{ field: 'amt', aggregate: 'sum' as const }];
    const keep = (filter: Partial<PivotValueFilter>) => build([{ field: 'voucher', valueFilters: [total({ value: 'amt:sum', ...filter })] }], [], sum, balance as typeof lines).keys('rowRoot');
    expect(keep({ op: 'notBetween', a: -0.01, b: 0.01 })).toEqual(['V2', 'V3']);
    expect(keep({ op: 'gt', a: 20, abs: true })).toEqual(['V3']);
  });

  it('needs every condition to pass (AND)', () => {
    const values: PivotLayout['values'] = [{ field: 'account', aggregate: 'count' }, { field: 'amt', aggregate: 'sum' }];
    const filters = [total({ a: 3 }), total({ value: 'amt:sum', op: 'gt', a: 20 })];
    expect(build([{ field: 'account', valueFilters: filters }], [], values).keys('rowRoot')).toEqual(['A']);
  });

  it('keeps the top or bottom items, as items, percent and share of the total', () => {
    const top = (rule: Partial<NonNullable<PivotAxisItem['top']>>) => build([{ field: 'account', top: { value: COUNT, dir: 'top', by: 'items', n: 1, ...rule } }], []).keys('rowRoot');
    expect(top({})).toEqual(['B']);
    expect(top({ dir: 'bottom' })).toEqual(['C']);
    expect(top({ by: 'percent', n: 50 })).toEqual(['A', 'B']);
    // Totals B 4, A 3, C 2 of 9: 60% is reached with B and A.
    expect(top({ by: 'share', n: 60 })).toEqual(['A', 'B']);
  });

  it('ranks top items among their siblings at a nested level', () => {
    const { cube } = build([{ field: 'voucher' }, { field: 'account', top: { value: COUNT, dir: 'top', by: 'items', n: 1 } }], []);
    expect(cube.rowRoot.children.map((voucher) => voucher.children.map((node) => node.key))).toEqual([['A'], ['A'], ['B']]);
    expect(cube.raw('', '', 0)).toBe(2 + 1 + 3);
  });

  it('filters labels by rule, case-insensitively', () => {
    const rows = (op: 'contains' | 'notContains' | 'begins', text: string) => build([{ field: 'account', label: { op, text } }], []).keys('rowRoot');
    expect(rows('contains', 'b')).toEqual(['B']);
    expect(rows('notContains', 'B')).toEqual(['A', 'C']);
    expect(rows('begins', 'c')).toEqual(['C']);
    expect(pivotLabelPasses({ op: 'ends', text: 'se' }, 'Suspense')).toBe(true);
  });

  it('ignores a filter on a value that is no longer in Values', () => {
    expect(build([{ field: 'account', valueFilters: [total({ value: 'amt:sum', a: 9999 })] }], []).keys('rowRoot')).toEqual(['A', 'B', 'C']);
  });

  it('filters the figure as shown, so a share is judged by its percentage', () => {
    const values: PivotLayout['values'] = [{ field: 'account', aggregate: 'count', showAs: 'pctGrand' }];
    expect(build([{ field: 'account', valueFilters: [total({ op: 'gt', a: 40 })] }], [], values).keys('rowRoot')).toEqual(['B']);
  });

  it('tests figures', () => {
    expect(pivotTest({ op: 'between', a: 5, b: 1 }, 3)).toBe(true);
    expect(pivotTest({ op: 'lt', a: 5 }, null)).toBe(false);
    expect(pivotTest({ op: 'blank' }, null)).toBe(true);
    expect(pivotTest({ op: 'lt', a: -5, abs: true }, -3)).toBe(false);
  });

  it('judges a plain tree', () => {
    const leaf = (id: string) => ({ id, label: id, children: [] });
    const root = { id: '', label: '', children: [leaf('x'), leaf('y')] };
    const failed = pivotJudge({
      items: [{ field: 'f', valueFilters: [total({ a: 2 })] }],
      root,
      leafCount: 1,
      leafIds: new Set(['']),
      filled: () => [],
      otherRoot: root,
      figure: (node) => (node.id === 'x' ? 1 : 5),
      hasValue: () => true,
    });
    expect([...failed]).toEqual(['x']);
  });
});

describe('pivot filters saved and read back', () => {
  const rule = cells({ among: ['V3'] });
  const saved = {
    rows: [{ field: 'account', label: { op: 'contains', text: 'a' }, valueFilters: [rule, { op: 'gt' }, 'junk'], top: { value: COUNT, dir: 'bottom', by: 'percent', n: 20 } }],
    columns: [{ field: 'voucher' }],
    filters: [{ field: 'amt', valueFilters: [rule], top: { value: COUNT, dir: 'top', by: 'items', n: 3 }, label: { op: 'equals', text: '5' } }],
    values: [{ field: 'account', aggregate: 'count', highlight: { op: 'gte', a: 2 } }, { field: 'amt', aggregate: 'sum', highlight: { op: 'between', a: 1 } }],
  };

  it('keeps valid rules and drops the rest', () => {
    const layout = normalizePivotLayout({ v: 2, layout: saved }, fields)!;
    expect(layout.rows[0]).toEqual({
      field: 'account',
      label: { op: 'contains', text: 'a' },
      valueFilters: [rule],
      top: { value: COUNT, dir: 'bottom', by: 'percent', n: 20 },
    });
    // A Filters field keeps a label rule only.
    expect(layout.filters[0]).toEqual({ field: 'amt', label: { op: 'equals', text: '5' } });
    expect(layout.values[0]?.highlight).toEqual({ op: 'gte', a: 2 });
    expect(layout.values[1]?.highlight).toBeUndefined();
    expect(normalizePivotLayout({ v: 2, layout: layout }, fields)).toEqual(layout);
  });

  it('is checked strictly for automation', () => {
    const base = emptyPivotLayout();
    const ok = strictPivotLayout({ rows: [{ field: 'account', valueFilters: [rule], top: saved.rows[0]!.top }], values: saved.values.slice(0, 1) }, fields, base);
    expect(ok.ok).toBe(true);
    expect(strictPivotLayout({ rows: [{ field: 'account', valueFilters: [{ op: 'gt' }] }] }, fields, base)).toMatchObject({ ok: false });
    expect(strictPivotLayout({ rows: [{ field: 'account', top: { n: 0 } }] }, fields, base)).toMatchObject({ ok: false });
    expect(strictPivotLayout({ filters: [{ field: 'account', valueFilters: [rule] }] }, fields, base)).toMatchObject({ ok: false });
    expect(strictPivotLayout({ values: [{ field: 'amt', aggregate: 'sum', highlight: { op: 'nope' } }] }, fields, base)).toMatchObject({ ok: false });
  });
});

describe('pivot highlighting', () => {
  it('marks matching cells and jumps between them with F3', async () => {
    const { mount } = await import('@vue/test-utils');
    const { default: PivotDesigner } = await import('../src/pivot/PivotDesigner.vue');
    const start: PivotLayout = {
      ...emptyPivotLayout(),
      rows: [{ field: 'account', valueFilters: [cells({})] }],
      columns: [{ field: 'voucher', valueFilters: [cells({})] }],
      values: [{ field: 'account', aggregate: 'count', highlight: { op: 'gte', a: 2 } }],
    };
    const wrapper = mount(PivotDesigner, { props: { fields, facts: lines, storageKey: 'test-highlight', start, remember: false }, attachTo: document.body });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const marked = () => wrapper.findAll('td.is-match').map((td) => td.text());
    expect(marked()).toEqual(['2', '3']);
    expect(wrapper.find('[data-desk-field="pivot-matches"]').exists()).toBe(true);
    expect(wrapper.find('.desk-pivot-status').text()).toContain('Account: 2 of 3 · Voucher No: 2 of 3');
    expect(wrapper.find('[data-desk-field="pivot-rules"]').text()).toContain('Count of Account >= 2 in any column');
    const table = wrapper.find('[data-desk-field="pivot-table"]');
    await table.trigger('keydown', { key: 'F3' });
    expect(wrapper.find('[data-desk-field="pivot-matches"]').text()).toContain('Match 1 of 2');
    await table.trigger('keydown', { key: 'F3' });
    expect(wrapper.find('[data-desk-field="pivot-matches"]').text()).toContain('Match 2 of 2');
    await table.trigger('keydown', { key: 'F3', shiftKey: true });
    expect(wrapper.find('[data-desk-field="pivot-matches"]').text()).toContain('Match 1 of 2');
    wrapper.unmount();
  });
});
