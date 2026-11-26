import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeReportsHost } from './reportsHost';
import DeskGrid from '../src/grid/DeskGrid.vue';
import type { Rdl2Report } from '../src/reports/language';
import { formatStudioValue, studioBands, studioColumns, studioTotalColumns } from '../src/reports/studioColumns';
import { checkReport } from '../src/reports/designer/checks';
import { checkExpr, parseExpr, printExpr } from '../src/reports/designer/expr';
import { stageSchemas } from '../src/reports/designer/schema';

fakeReportsHost();

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const mis: Rdl2Report = {
  lang: 'rdl2',
  name: 'mis.test',
  title: 'MIS',
  params: [
    { id: 'from', label: 'From', type: 'date' },
    { id: 'to', label: 'To', type: 'date' },
  ],
  stages: [
    { kind: 'source', id: 'lines', model: 'SalesInvoice', fields: [{ as: 'day', path: 'invoiceDate' }, { as: 'amount', path: 'amount' }], where: 'invoiceDate between @p_from and @p_to' },
    { kind: 'periods', id: 'p', from: 'lines', date: 'day', periodFrom: '@from', periodTo: '@to', periods: [{ name: 'cur' }, { name: 'ly', shiftYears: -1 }] },
  ],
  output: {
    stage: 'p',
    columns: [
      { column: 'period', label: 'Period' },
      { column: 'amount', label: 'Sales', format: 'money', band: 'cur', toneBy: 'period' },
      { column: 'gpPct', label: 'GP %', format: 'percent', total: 'amount / amount * 100', band: 'Change' },
    ],
    totals: ['amount'],
    negatives: 'brackets',
    footers: [{ label: 'Only now', where: "period = 'cur'" }],
  },
};

describe('MIS report display', () => {
  it('draws negatives in brackets and keeps positives as they are', () => {
    expect(formatStudioValue('-1234.5', 'money', 'brackets')).toMatch(/^\(1,234\.50\)$/);
    expect(formatStudioValue('1234.5', 'money', 'brackets')).toBe('1,234.50');
    expect(formatStudioValue('-12.5', 'percent', 'brackets')).toBe('(12.50%)');
    expect(formatStudioValue('-1234.5', 'money')).toMatch(/^-1,234\.50$/);
    expect(formatStudioValue('-3', 'text' as never, 'brackets')).toBe('-3');
  });

  it('heads bands with the period headings the run worked out, and other bands as written', () => {
    const bands = studioBands(mis, [{ name: 'cur', label: 'FY-2026-27 Upto Aug-26' }]);
    expect([...bands]).toEqual([
      ['amount', 'FY-2026-27 Upto Aug-26'],
      ['gpPct', 'Change'],
    ]);
    expect(studioTotalColumns(mis)).toEqual(['amount', 'gpPct']);
  });

  it('colours a cell from another column and draws the lines under the totals', () => {
    vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
    const columns = studioColumns({ ...mis, output: { ...mis.output, columns: mis.output.columns.map((col) => (col.column === 'amount' ? { ...col, toneBy: 'tone' } : col)) } });
    const wrapper = mount(DeskGrid, {
      props: {
        mode: 'list',
        rows: [
          { id: 1, period: 'cur', amount: '-50', tone: 'danger' },
          { id: 2, period: 'ly', amount: '80', tone: null },
        ],
        columns,
        totals: { amount: '30', gpPct: '100' },
        footLines: [{ __label: 'Only now', amount: '-50' }],
      },
    });
    const cells = wrapper.findAll('tbody tr').map((row) => row.findAll('td')[2]!);
    expect(cells[0]!.classes()).toContain('is-cell-tone-danger');
    expect(cells[1]!.classes()).not.toContain('is-cell-tone-danger');
    expect(cells[0]!.text()).toMatch(/^\(50\.00\)$/);
    const foot = wrapper.find('tfoot tr.row-foot-line');
    expect(foot.text()).toContain('Only now');
    expect(foot.text()).toContain('(50.00)');
    wrapper.unmount();
  });
});

describe('MIS designer pieces', () => {
  it('lets earlier steps read a periods span, and checks the periods', () => {
    const catalog = new Map([
      ['SalesInvoice', { name: 'SalesInvoice', label: 'Sales invoice', fields: [{ name: 'invoiceDate', label: 'Date', type: 'date', column: 'invoiceDate' }, { name: 'amount', label: 'Amount', type: 'number', column: 'amount' }], relations: [], scope: { company: true, row: 'own' as const, softDelete: false } }],
    ]) as never;
    const schemas = stageSchemas(mis, catalog);
    expect(schemas.get('p')?.map((col) => col.name)).toEqual(['day', 'amount', 'period']);
    expect(checkReport(mis, catalog, schemas).filter((issue) => issue.at === 'lines' || issue.at === 'p')).toEqual([]);
    const twice = { ...mis, stages: [mis.stages[0]!, { ...(mis.stages[1] as object), periods: [{ name: 'cur' }, { name: 'cur', shiftYears: -1 }], periodTo: 'today' } as Rdl2Report['stages'][number]] };
    expect(checkReport(twice, catalog, stageSchemas(twice, catalog)).filter((issue) => issue.at === 'p').map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['periodTo', 'periods.1.name']),
    );
  });

  it('reads and prints `in under(@groups)` and picked(@x)', () => {
    const src = 'groupId in under(@groups) and picked(@groups)';
    expect(printExpr(parseExpr(src))).toBe(src);
    const scope = { hasName: (n: string) => n === 'groupId', params: ['groups'] };
    expect(checkExpr(src, scope).ok).toBe(true);
    expect(checkExpr('groupId in under(groupId)', scope).ok).toBe(false);
    expect(checkExpr('tryNumber(groupId) > 0', scope).ok).toBe(true);
  });
});
