import type { DeskCurrencyValue, DeskLookupConfig } from '../grid/types';
import { deskHost } from '../host';
import { deskCompanyCurrency } from './money';

interface CurrencyRow {
  id: number | null;
  code: string;
  name: string;
  symbol: string | null;
}

const lists = new WeakMap<DeskLookupConfig, Promise<CurrencyRow[]>>();

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toRow(record: Record<string, unknown>): CurrencyRow | null {
  const code = textOf(record.code).toUpperCase();
  if (!code) return null;
  const id = Number(record.id);
  return {
    id: Number.isFinite(id) && id > 0 ? id : null,
    code,
    name: textOf(record.name) || code,
    symbol: textOf(record.symbol) || textOf(record.symbolNative) || null,
  };
}

/** The currency list for a lookup, fetched once per lookup object. */
export function currencyList(lookup: DeskLookupConfig): Promise<CurrencyRow[]> {
  const cached = lists.get(lookup);
  if (cached) return cached;
  const search = deskHost().searchLookup;
  if (!search) return Promise.resolve([]);
  const pending = search(lookup, '')
    .then((found) => found.map(toRow).filter((row): row is CurrencyRow => row !== null))
    .catch(() => {
      lists.delete(lookup);
      return [] as CurrencyRow[];
    });
  lists.set(lookup, pending);
  return pending;
}

/** An empty currency becomes the company currency, with factor 1. */
export async function companyCurrencyValue(lookup?: DeskLookupConfig): Promise<DeskCurrencyValue> {
  const base = deskCompanyCurrency();
  if (lookup) {
    const rows = await currencyList(lookup);
    const row = rows.find((item) => item.code === base);
    if (row) return { id: row.id, code: row.code, name: row.name, symbol: row.symbol, currencyRate: 1 };
  }
  return { code: base, currencyRate: 1 };
}
