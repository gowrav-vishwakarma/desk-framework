import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureDesk } from '../src/host';
import { formatDeskDecimal, formatDeskNumber, moneyFromRow, moneyLines } from '../src/currency/money';
import { cellBlocks, cleanLayout, layoutColumnInfo, selectionOf } from '../src/grid/layout/compile';
import type { DeskFieldCatalog, DeskGridLayout } from '../src/grid/layout/types';

function host(decimals = { qty: 3, money: 2 }, symbol = ''): void {
  configureDesk({
    presets: {},
    presetLabels: [],
    defaultPreset: '',
    label: (id) => id,
    locale: () => 'en-IN',
    companyCurrency: () => 'INR',
    companyCurrencySymbol: () => symbol,
    decimals: () => decimals,
  });
}

beforeEach(() => host());
afterEach(() => host());

describe('desk decimals', () => {
  it('pads to the company places and keeps extra saved digits', () => {
    expect(formatDeskDecimal(10.5, 2)).toBe('10.50');
    expect(formatDeskDecimal(10.1256, 2)).toBe('10.1256');
    expect(formatDeskDecimal(1234567.5, 2)).toBe('12,34,567.50');
    host({ qty: 3, money: 4 });
    expect(formatDeskNumber('7', 'money')).toBe('7.0000');
    expect(formatDeskNumber(2.5, 'qty')).toBe('2.500');
    expect(formatDeskNumber('', 'money')).toBe('');
  });
});

describe('two currencies in one cell', () => {
  it('shows one plain amount for company rows, and a symbol only when asked', () => {
    host();
    expect(moneyLines(10, { code: 'INR' })).toEqual({ primary: '10.00', caption: '' });
    expect(moneyLines(10, {}, { symbol: 'always' })).toEqual({ primary: '₹10.00', caption: '' });
  });

  it('puts the company amount first by default, rounded, and the document amount under it', () => {
    host();
    expect(moneyLines(1.2345, { code: 'USD', rate: 83.4567 })).toEqual({ primary: '₹103.03', caption: '$1.2345' });
  });

  it('follows the column choices: document first, no symbols, no second line', () => {
    host();
    expect(moneyLines(2, { code: 'USD', rate: 83.5 }, { face: 'document' })).toEqual({ primary: '$2.00', caption: '₹167.00' });
    expect(moneyLines(2, { code: 'USD', rate: 83.5 }, { symbol: 'never' })).toEqual({ primary: '167.00', caption: '2.00' });
    expect(moneyLines(2, { code: 'USD', rate: 83.5 }, { second: false })).toEqual({ primary: '₹167.00', caption: '' });
  });

  it('uses the host symbol, a missing rate counts as 1, and the same id is the same currency', () => {
    host({ qty: 2, money: 2 }, 'Rs');
    expect(moneyLines(5, { code: 'EUR', rate: 0 }).primary).toBe('Rs 5.00');
    configureDesk({ presets: {}, presetLabels: [], defaultPreset: '', label: (id) => id, companyCurrency: () => 'INR', companyCurrencyId: () => 7 });
    expect(moneyLines(5, { code: 'XYZ', id: 7 })).toEqual({ primary: '5.00', caption: '' });
  });

  it('reads the currency from row keys', () => {
    expect(moneyFromRow({ code: 'currency', rate: 'conversionRate' }, { currency: 'USD', conversionRate: '83.5' })).toEqual({ code: 'USD', rate: '83.5' });
  });
});

describe('currency fields in designed layouts', () => {
  const catalog: DeskFieldCatalog = {
    relations: [],
    fields: [
      { key: 'id', label: 'Id', type: 'number' },
      { key: 'totalAmount', label: 'Total', type: 'currency', moneyFrom: { code: 'currency', rate: 'conversionRate' } },
      { key: 'qty', label: 'Qty', type: 'number', decimals: 'qty' },
    ],
    always: ['id'],
  };
  const layout: DeskGridLayout = {
    id: 'l',
    name: 'L',
    kind: 'menu',
    columns: [
      { id: 'total', header: 'Total', lines: [['totalAmount']], money: { face: 'document', symbol: 'never', second: true } },
      { id: 'qty', header: 'Qty', lines: [['qty']] },
    ],
  };

  it('draws the face amount, then the other currency as a small muted line', () => {
    host();
    const blocks = cellBlocks(layout.columns[0]!, { totalAmount: 2, currency: 'USD', conversionRate: 83.5 }, catalog);
    expect(blocks).toEqual([
      { kind: 'text', text: '2.00' },
      { kind: 'line', spans: [{ text: '167.00', size: 'small', tone: 'muted' }] },
    ]);
    expect(cellBlocks(layout.columns[1]!, { qty: 4 }, catalog)).toEqual([{ kind: 'text', text: '4.000' }]);
  });

  it('fetches the currency and rate with the amount, and keeps a clean money view', () => {
    const info = layoutColumnInfo(layout.columns[0]!, catalog);
    expect(info.uses.map((use) => use.key)).toEqual(['totalAmount', 'currency', 'conversionRate']);
    expect(selectionOf(info.uses, catalog).fields).toEqual(['id', 'totalAmount', 'currency', 'conversionRate']);
    const clean = cleanLayout({ ...layout, columns: [{ ...layout.columns[0]!, money: { face: 'document', symbol: 'auto', second: true } }] }, catalog);
    expect(clean.columns[0]?.money).toEqual({ face: 'document' });
  });
});
