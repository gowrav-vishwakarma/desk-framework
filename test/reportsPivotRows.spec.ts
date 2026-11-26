import { describe, expect, it, vi } from 'vitest';
import { fakeReportsHost } from './reportsHost';
import { buildPivotCube } from '../src/pivot/pivotCube';
import { emptyPivotLayout } from '../src/pivot/pivotLayout';
import type { PivotField, PivotLayout } from '../src/pivot/pivotTypes';

const post = vi.fn();
// The host's call (the app's server) records what the studio asks.
fakeReportsHost({ call: (action, body) => post(action, body), companyKey: () => 34 });

const layout = (patch: Partial<PivotLayout>): PivotLayout => ({ ...emptyPivotLayout(), ...patch });

describe('pivot rows from the server', () => {
  it('loads every grouped row in batches, in order, and says when it had to stop', async () => {
    const { runPivotRows, PIVOT_BATCH } = await import(
      '../src/reports/studioApi'
    );
    const total = PIVOT_BATCH * 2 + 5;
    post.mockImplementation((_url: string, body: { offset: number; limit: number }) => {
      const rows = Array.from(
        { length: Math.max(0, Math.min(body.limit, total - body.offset)) },
        (_, index) => ({ n: body.offset + index }),
      );
      return Promise.resolve({
        data: { rows, count: total, columns: [], totals: null, meta: { ms: 1, report: 'x' } },
      });
    });
    const seen: number[] = [];
    const result = await runPivotRows(
      {
        name: 'flat.ledger.lines',
        summary: { keys: [{ column: 'voucherType' }], values: ['amount'] },
      },
      (done) => seen.push(done),
    );
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls.map((call) => (call[1] as { offset: number }).offset)).toEqual([
      0,
      PIVOT_BATCH,
      PIVOT_BATCH * 2,
    ]);
    expect(result.rows).toHaveLength(total);
    expect(result.rows[total - 1]).toEqual({ n: total - 1 });
    expect(result.truncated).toBe(false);
    expect(seen).toEqual([PIVOT_BATCH, PIVOT_BATCH * 2, total]);
  });

  it('gives from grouped rows the figures the lines themselves give', () => {
    const fields: PivotField[] = [
      { id: 'type', label: 'Type', kind: 'text' },
      { id: 'party', label: 'Party', kind: 'text' },
      { id: 'amount', label: 'Amount', kind: 'number' },
    ];
    const byId = new Map(fields.map((field) => [field.id, field]));
    const lines = [
      { type: 'PAYMENT', party: 'A', amount: 10 },
      { type: 'PAYMENT', party: 'A', amount: 30 },
      { type: 'PAYMENT', party: 'B', amount: 5 },
      { type: 'RECEIPT', party: 'A', amount: 7 },
    ];
    // As the server groups them by type and party.
    const groups = [
      {
        type: 'PAYMENT',
        party: 'A',
        __rows: 2,
        amount: 40,
        amount__n: 2,
        amount__min: 10,
        amount__max: 30,
      },
      {
        type: 'PAYMENT',
        party: 'B',
        __rows: 1,
        amount: 5,
        amount__n: 1,
        amount__min: 5,
        amount__max: 5,
      },
      {
        type: 'RECEIPT',
        party: 'A',
        __rows: 1,
        amount: 7,
        amount__n: 1,
        amount__min: 7,
        amount__max: 7,
      },
    ];
    const l = layout({
      rows: [{ field: 'type' }],
      values: (['sum', 'count', 'avg', 'min', 'max'] as const)
        .map((aggregate) => ({ field: 'amount', aggregate }))
        .concat([{ field: 'party', aggregate: 'distinct' }] as never),
    });
    const raw = buildPivotCube(lines, l, byId);
    const grouped = buildPivotCube(groups, l, byId, { grouped: new Set(['type', 'party']) });
    for (const row of ['PAYMENT', 'RECEIPT', '']) {
      for (let value = 0; value < l.values.length; value += 1)
        expect(grouped.raw(row, '', value)).toBe(raw.raw(row, '', value));
    }
    expect(grouped.raw('PAYMENT', '', 2)).toBe(15);
    expect(grouped.rowCount).toBe(4);
  });
});
