import { describe, expect, it } from 'vitest';
import { buildPivotCube, pivotItemKeys } from '../src/pivot/pivotCube';
import { pivotKey } from '../src/pivot/pivotKeys';
import { defaultPivotLayout, emptyPivotLayout, normalizePivotLayout, pivotAddField, pivotMoveItem } from '../src/pivot/pivotLayout';
import type { PivotField, PivotLayout } from '../src/pivot/pivotTypes';
import { buildPivotView } from '../src/pivot/pivotView';

const fields: PivotField[] = [
  { id: 'party', label: 'Party', kind: 'text' },
  { id: 'branch', label: 'Branch', kind: 'text' },
  { id: 'date', label: 'Date', kind: 'date' },
  { id: 'net', label: 'Net', kind: 'number' },
];
const byId = new Map(fields.map((field) => [field.id, field]));
const facts = [
  { party: 'A', branch: 'X', date: '2026-04-03', net: 10 },
  { party: 'A', branch: 'Y', date: '2026-05-01', net: 5 },
  { party: 'B', branch: 'X', date: '2026-04-20', net: 7 },
  { party: 'B', branch: 'X', date: '2027-01-02', net: 3 },
  { party: null, branch: 'Y', date: '2026-04-09', net: 1 },
];

function layout(patch: Partial<PivotLayout>): PivotLayout {
  return { ...emptyPivotLayout(), ...patch };
}

describe('pivot', () => {
  it('sums every row and column level, subtotals included', () => {
    const l = layout({ rows: [{ field: 'party' }, { field: 'branch' }], columns: [{ field: 'date', dateGroup: 'month' }], values: [{ field: 'net', aggregate: 'sum' }] });
    const cube = buildPivotCube(facts, l, byId);
    expect(cube.raw('', '', 0)).toBe(26);
    expect(cube.raw('A', '', 0)).toBe(15);
    expect(cube.raw('B\u0001X', '2026-04', 0)).toBe(7);
    expect(cube.raw('A', '2027-01', 0)).toBeNull();
    // Blank party sorts last and reads "(blank)".
    expect(cube.rowRoot.children.map((node) => node.label)).toEqual(['A', 'B', '(blank)']);
    expect(cube.colRoot.children.map((node) => node.label)).toEqual(['Apr 2026', 'May 2026', 'Jan 2027']);
  });

  it('shows shares and sorts by value', () => {
    const l = layout({ rows: [{ field: 'party', sort: 'valueAsc' }], values: [{ field: 'net', aggregate: 'sum', showAs: 'pctGrand' }, { field: 'party', aggregate: 'distinct' }] });
    const cube = buildPivotCube(facts, l, byId);
    expect(cube.rowRoot.children.map((node) => node.key)).toEqual(['\u0000', 'B', 'A']);
    const a = cube.rowRoot.children.find((node) => node.key === 'A')!;
    expect(cube.shown(a, cube.colRoot, 0)).toBeCloseTo((15 / 26) * 100);
    expect(cube.raw('', '', 1)).toBe(2);
  });

  it('leaves out excluded items and drills to the facts behind a cell', () => {
    const l = layout({ rows: [{ field: 'party' }], filters: [{ field: 'branch', exclude: ['Y'] }], values: [{ field: 'net', aggregate: 'count' }] });
    const cube = buildPivotCube(facts, l, byId);
    expect(cube.factCount).toBe(3);
    const b = cube.rowRoot.children.find((node) => node.key === 'B')!;
    expect(cube.factsAt(b, cube.colRoot)).toHaveLength(2);
    expect(pivotItemKeys(facts, { field: 'branch' }, byId.get('branch'))).toEqual([
      { key: 'X', label: 'X', count: 3 },
      { key: 'Y', label: 'Y', count: 2 },
    ]);
  });

  it('groups dates by financial year and quarter', () => {
    const date = byId.get('date');
    expect(pivotKey('2027-01-02', date, { dateGroup: 'fy' }, 4)).toEqual({ key: '2026', label: 'FY 2026-27' });
    expect(pivotKey('2027-01-02', date, { dateGroup: 'quarter' }, 4)).toEqual({ key: '2026-Q4', label: 'Q4 2026-27' });
    expect(pivotKey('2026-04-30T00:00:00.000Z', date, { dateGroup: 'month' }, 4).key).toBe('2026-04');
  });

  it('draws merged column headers with subtotals and collapse', () => {
    const l = layout({
      rows: [{ field: 'party' }],
      columns: [{ field: 'branch' }, { field: 'date', dateGroup: 'fy' }],
      values: [{ field: 'net', aggregate: 'sum' }, { field: 'net', aggregate: 'count' }],
    });
    const cube = buildPivotCube(facts, l, byId);
    const view = buildPivotView(cube, l, new Set(), new Set(), { valueLabels: ['Sum of Net', 'Count of Net'] });
    // X has FY 2026 only; Y has FY 2026 only: each item + its total, then the grand total, two values each.
    expect(view.header).toHaveLength(3);
    expect(view.header[0]!.map((cell) => [cell.label, cell.colspan, cell.rowspan])).toEqual([
      ['X', 2, 1],
      ['X Total', 2, 2],
      ['Y', 2, 1],
      ['Y Total', 2, 2],
      ['Grand Total', 2, 2],
    ]);
    expect(view.columns).toHaveLength(10);
    expect(view.rows.map((row) => row.label)).toEqual(['A', 'B', '(blank)', 'Grand Total']);
    const collapsed = buildPivotView(cube, l, new Set(), new Set(['X']), { valueLabels: ['s', 'c'] });
    expect(collapsed.header[0]![0]).toMatchObject({ label: 'X', rowspan: 2, colspan: 2, canToggle: true, expanded: false });
  });

  it('lays out tabular rows with group totals', () => {
    const l = layout({ form: 'tabular', rows: [{ field: 'party' }, { field: 'branch' }], values: [{ field: 'net', aggregate: 'sum' }] });
    const view = buildPivotView(buildPivotCube(facts, l, byId), l, new Set(), new Set(), { valueLabels: ['Sum of Net'] });
    expect(view.labelColumns).toBe(2);
    expect(view.rows.map((row) => `${row.kind}:${row.labels.join('/')}:${row.firstNew}`)).toEqual([
      'item:A/X:0',
      'item:A/Y:1',
      'subtotal:A Total:0',
      'item:B/X:0',
      'subtotal:B Total:0',
      'item:(blank)/Y:0',
      'subtotal:(blank) Total:0',
      'grand:Grand Total:0',
    ]);
  });

  it('moves fields between areas and reads the old saved panel', () => {
    let l = defaultPivotLayout(fields);
    expect(l.rows.map((item) => item.field)).toEqual(['party']);
    expect(l.values).toEqual([{ field: 'net', aggregate: 'sum' }]);
    l = pivotAddField(l, byId.get('date')!, 'columns');
    expect(l.columns).toEqual([{ field: 'date', dateGroup: 'month' }]);
    // Rows → Columns keeps the item; Values → Rows makes a plain axis field.
    l = pivotMoveItem(l, { area: 'rows', index: 0 }, { area: 'columns', index: 0 }, byId);
    expect(l.rows).toEqual([]);
    expect(l.columns.map((item) => item.field)).toEqual(['party', 'date']);
    l = pivotMoveItem(l, { area: 'columns', index: 1 }, { area: 'columns', index: 0 }, byId);
    expect(l.columns.map((item) => item.field)).toEqual(['date', 'party']);
    expect(normalizePivotLayout({ groupBy: 'party, nope', splitBy: 'branch', valueField: 'net', aggregate: 'avg' }, fields)).toMatchObject({
      rows: [{ field: 'party' }],
      columns: [{ field: 'branch' }],
      values: [{ field: 'net', aggregate: 'avg' }],
    });
  });
});

describe('pivot designer', () => {
  it('draws the table and moves a field through the pane', async () => {
    const { mount } = await import('@vue/test-utils');
    const { default: PivotDesigner } = await import('../src/pivot/PivotDesigner.vue');
    const wrapper = mount(PivotDesigner, {
      props: { fields, facts, storageKey: 'test-pivot', defaults: { rows: ['party'], columns: ['branch'], values: ['net'] } },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cells = () => wrapper.findAll('tbody tr.desk-pivot-row').map((row) => row.findAll('td').map((td) => td.text()));
    expect(cells()[0]).toEqual(['A', '10.00', '5.00', '15.00']);
    expect(wrapper.find('tfoot').text()).toContain('26.00');
    expect(wrapper.findAll('thead th.desk-pivot-col-head').map((th) => th.text())).toEqual(['X', 'Y', 'Grand Total']);
    // Tick Date: a date goes to Rows, grouped by month, under Party.
    await wrapper.find('[data-desk-field="pivot-field:date"]').setValue(true);
    expect(wrapper.findAll('.desk-pivot-zone.is-rows .desk-pivot-chip').map((chip) => chip.text())).toEqual(['Party▾', 'Date (Month)▾']);
    expect(cells()[1]?.[0]).toBe('Apr 2026');
    // Collapse A with its toggle; undo the field.
    await wrapper.find('tbody .desk-pivot-toggle').trigger('click');
    expect(cells().map((row) => row[0])).toEqual(['+A', '−B', 'Apr 2026', 'Jan 2027', '−(blank)', 'Apr 2026']);
    await wrapper.findAll('.desk-pivot-toolbar button')[0]!.trigger('click');
    expect(wrapper.findAll('.desk-pivot-zone.is-rows .desk-pivot-chip')).toHaveLength(1);
    // Drill from the first figure.
    await wrapper.find('tbody td.desk-pivot-num').trigger('dblclick');
    expect(wrapper.emitted('drill')?.[0]?.[0]).toMatchObject({ title: 'Party: A · Branch: X' });
    wrapper.unmount();
  }, 15000);
});

describe('pivot calculated fields', () => {
  const sales: PivotField[] = [
    { id: 'brand', label: 'Brand', kind: 'text' },
    { id: 'taxable', label: 'Taxable value', kind: 'number' },
    { id: 'gp', label: 'Gross profit', kind: 'number' },
  ];
  const lines = [
    { brand: 'A', taxable: 100, gp: 10 },
    { brand: 'A', taxable: 300, gp: 90 },
    { brand: 'B', taxable: 0, gp: 0 },
  ];
  const calc = { id: 'calc:gp-pct', label: 'GP %', formula: '[Gross profit] / [Taxable value] * 100', refs: ['gp', 'taxable'], format: 'percent' as const };

  it('parses fields by label or id, and says what is wrong and where', async () => {
    const { parsePivotFormula, evaluatePivotFormula } = await import('../src/pivot/pivotCalc');
    const ok = parsePivotFormula('-(gp - [taxable value]) / 2', sales);
    expect(ok.ok && ok.formula.refs).toEqual(['gp', 'taxable']);
    expect(ok.ok && evaluatePivotFormula(ok.formula, [10, 30])).toBe(10);
    expect(parsePivotFormula('[Brand] * 2', sales)).toMatchObject({ ok: false, error: '"Brand" is not a number, so it has no sum', at: 0 });
    expect(parsePivotFormula('[gp] + ', sales)).toMatchObject({ ok: false, error: 'The formula ends too early' });
    expect(parsePivotFormula('[gp] % 2', sales)).toMatchObject({ ok: false, at: 5 });
    expect(parsePivotFormula('(gp', sales)).toMatchObject({ ok: false, error: 'A bracket is not closed' });
    expect(parsePivotFormula('100', sales)).toMatchObject({ ok: false, error: 'Name at least one field' });
  });

  it('works out each cell from its own sums: a ratio of sums, never a sum of ratios', () => {
    const l = layout({ rows: [{ field: 'brand' }], values: [{ field: calc.id, aggregate: 'sum' }], calculated: [calc] });
    const cube = buildPivotCube(lines, l, new Map(sales.map((field) => [field.id, field])));
    // A: 100 / 400. The lines' own percentages (10% and 30%) would add to 40.
    expect(cube.raw('A', '', 0)).toBe(25);
    // B divides by zero: an empty cell, not Infinity.
    expect(cube.raw('B', '', 0)).toBeNull();
    expect(cube.raw('', '', 0)).toBe(25);
  });

  it('is written in its editor from the field pane and lands in Values', async () => {
    const { mount } = await import('@vue/test-utils');
    const { default: PivotDesigner } = await import('../src/pivot/PivotDesigner.vue');
    const wrapper = mount(PivotDesigner, {
      props: { fields: sales, facts: lines, storageKey: 'test-calc', defaults: { rows: ['brand'], values: [] }, remember: false },
      attachTo: document.body,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.find('[data-desk-field="pivot-calc-add"]').trigger('click');
    const body = document.body;
    const input = (id: string) => body.querySelector<HTMLInputElement>(`[data-desk-field="${id}"]`)!;
    input('pivot-calc-label').value = 'GP %';
    input('pivot-calc-label').dispatchEvent(new Event('input'));
    input('pivot-calc-formula').value = '[Gross profit] / [Brand]';
    input('pivot-calc-formula').dispatchEvent(new Event('input'));
    await wrapper.vm.$nextTick();
    // A wrong field is pointed at and the field cannot be added.
    expect(body.textContent).toContain('"Brand" is not a number');
    expect(input('pivot-calc-save').disabled).toBe(true);
    input('pivot-calc-formula').value = '[Gross profit] / [Taxable value] * 100';
    input('pivot-calc-formula').dispatchEvent(new Event('input'));
    await wrapper.vm.$nextTick();
    expect(body.textContent).toContain('Grand total over the loaded rows: 25.00');
    body.querySelector<HTMLInputElement>('.desk-pivot-calc input[value="percent"]')!.click();
    await wrapper.vm.$nextTick();
    expect(body.textContent).toContain('Grand total over the loaded rows: 25.00%');
    input('pivot-calc-save').click();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.desk-pivot-zone.is-values .desk-pivot-chip').map((chip) => chip.text())).toEqual(['GP %▾']);
    const cells = wrapper.findAll('tbody tr.desk-pivot-row').map((row) => row.findAll('td').map((td) => td.text()));
    expect(cells[0]).toEqual(['A', '25.00%']);
    expect(cells[1]).toEqual(['B', '']);
    wrapper.unmount();
  });

  it('loads the fields a formula reads, keeps it out of the axes, and survives saving', async () => {
    const { pivotLayoutFields } = await import('../src/pivot/pivotLayout');
    const l = layout({ rows: [{ field: 'brand' }], values: [{ field: calc.id, aggregate: 'sum' }], calculated: [calc] });
    expect(pivotLayoutFields(l)).toEqual(['brand', 'gp', 'taxable']);
    const asField = { id: calc.id, label: calc.label, kind: 'number' as const, calc: true };
    expect(pivotAddField(l, asField, 'rows')).toBe(l);
    const restored = normalizePivotLayout({ v: 2, layout: { ...l, rows: [{ field: 'brand' }, { field: calc.id }] } }, sales);
    expect(restored?.calculated).toEqual([calc]);
    expect(restored?.rows.map((item) => item.field)).toEqual(['brand']);
    expect(restored?.values).toEqual([{ field: calc.id, aggregate: 'sum' }]);
  });
});
