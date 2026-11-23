import { describe, expect, it } from 'vitest';
import { roundDeskDecimal } from '../src/currency/money';
import { typedCellValue } from '../src/grid/display';

describe('a typed number is kept at its column places (Ankpal decision 16)', () => {
  it('rounds half away from zero, float-safe', () => {
    expect(roundDeskDecimal(1.23456, 3)).toBe(1.235);
    expect(roundDeskDecimal(10.55555, 3)).toBe(10.556);
    expect(roundDeskDecimal(2.005, 2)).toBe(2.01);
    expect(roundDeskDecimal(1.005, 2)).toBe(1.01);
    expect(roundDeskDecimal(-2.005, 2)).toBe(-2.01);
  });

  it('a column with fixed places keeps the typed value at them; without `decimals`, or not a number, it stays as typed', () => {
    expect(typedCellValue({ decimals: 3 }, 1.23456)).toBe(1.235);
    expect(typedCellValue({ decimals: 2 }, 10.555)).toBe(10.56);
    expect(typedCellValue({}, 1.23456)).toBe(1.23456);
    expect(typedCellValue({ decimals: 2 }, 'abc')).toBe('abc');
    expect(typedCellValue({ decimals: 2 }, null)).toBe(null);
  });
});

describe("a totals or foot line's value is shown as a body cell of its column shows it", () => {
  it("a report's server totals (raw decimals) take the column's places; a column's own format wins; blocks / no value stay plain", async () => {
    const { footText, cellText } = await import('../src/grid/display');
    const money = { id: 'net', header: 'Net', decimals: 2 } as const;
    const qty = { id: 'inward', header: 'Inward', decimals: 3 } as const;
    const totals = { net: '42500.000000000000', inward: '5.00000000', opening: 0 };
    // Before: `42500.000000000000` and `5.00000000`; now as the rows above show them.
    expect(footText(money, totals)).toBe(cellText(money, { net: 42500 }));
    expect(footText(qty, totals)).toBe(cellText(qty, { inward: 5 }));
    expect(footText({ id: 'opening', header: 'Opening', decimals: 3 }, totals)).toBe(cellText({ id: 'opening', header: 'Opening', decimals: 3 }, { opening: 0 }));
    expect(footText({ id: 'net', header: 'Net', decimals: 2, format: (v) => `Rs ${String(v)}` }, totals)).toBe('Rs 42500.000000000000');
    expect(footText({ id: 'party', header: 'Party', blocks: () => [] }, { party: 'All' })).toBe('All');
    // A report on a saved layout: its columns are blocks over catalog fields, formatted by the report's named formatter.
    const { layoutColumns } = await import('../src/grid/layout/compile');
    const [net, inward] = layoutColumns(
      { id: 'l', name: 'Report', kind: 'menu', columns: [{ id: 'net', header: 'Net', lines: [['net']] }, { id: 'inward', header: 'Inward', lines: [['inward']] }] },
      { relations: [], always: [], fields: [{ key: 'net', label: 'Net', type: 'number', format: 'money' }, { key: 'inward', label: 'Inward', type: 'number', format: 'qty' }] },
      { money: (v) => Number(v).toFixed(2), qty: (v) => Number(v).toFixed(3) },
    );
    expect(footText(net!, totals)).toBe('42500.00');
    expect(footText(inward!, totals)).toBe('5.000');
    expect(footText(net!, totals)).toBe(cellText(net!, { net: 42500 }));
    expect(footText(money, { net: null })).toBe('');
    expect(footText(money, {})).toBe('');
  });
});
