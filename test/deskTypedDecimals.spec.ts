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
