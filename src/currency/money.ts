import type { DeskColumn, DeskGridRow, DeskMoney } from '../grid/types';
import { deskHost } from '../host';

/** Most fractional digits a saved number keeps on screen. Matches the database cap. */
export const DESK_MAX_DECIMALS = 8;

/** Company currency code from the host. Empty when the host has not set one. */
export function deskCompanyCurrency(): string {
  return deskHost().companyCurrency?.().trim().toUpperCase() ?? '';
}

/** The host's number locale, or undefined for the browser's. */
function deskLocale(): string | undefined {
  return deskHost().locale?.().trim() || undefined;
}

function clampPlaces(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(DESK_MAX_DECIMALS, Math.max(0, Math.round(value)));
}

/** Company decimal places: `qty` for quantities, `money` for rates and amounts. Default 2 each. */
export function deskDecimals(): { qty: number; money: number } {
  const raw = deskHost().decimals?.();
  return { qty: clampPlaces(raw?.qty, 2), money: clampPlaces(raw?.money, 2) };
}

/** Places for a named kind, or a fixed count. */
export type DeskDecimalKind = 'qty' | 'money' | number;

export function placesFor(kind: DeskDecimalKind): number {
  if (typeof kind === 'number') return clampPlaces(kind, 2);
  return deskDecimals()[kind];
}

/**
 * A typed number at `places`, half away from zero, float-safe (2.005 → 2.01; a plain `Math.round(n * 100)` gives 2.00 on
 * the float 200.49999…).
 */
export function roundDeskDecimal(value: number, places: number): number {
  const f = 10 ** clampPlaces(places, 2);
  return (Math.sign(value) * Math.round(Number((Math.abs(value) * f).toPrecision(15)))) / f;
}

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * A number in the host's locale (`en-IN` gives 1,00,000.00). Pads to `places`, and keeps up to 8 saved digits instead of
 * rounding them away: `10.5` → `10.50`, `10.1256` → `10.1256` with 2 places.
 */
export function formatDeskDecimal(value: number, places: number): string {
  if (!Number.isFinite(value)) return '';
  const min = clampPlaces(places, 2);
  const locale = deskLocale();
  const cacheKey = `${locale ?? ''}|${min}`;
  let format = formatters.get(cacheKey);
  if (!format) {
    format = new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: Math.max(min, DESK_MAX_DECIMALS) });
    formatters.set(cacheKey, format);
  }
  return format.format(value);
}

/** A number in a kind's places, or empty for a blank or non-number. */
export function formatDeskNumber(value: unknown, kind: DeskDecimalKind): string {
  const amount = amountOf(value);
  return amount === null ? '' : formatDeskDecimal(amount, placesFor(kind));
}

function amountOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function rateOf(value: unknown): number {
  const rate = amountOf(value);
  return rate !== null && rate > 0 ? rate : 1;
}

function codeOf(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toUpperCase();
  return code || fallback;
}

const symbols = new Map<string, string>();

/**
 * The symbol for a currency code: the host's company symbol, else the browser's narrow symbol,
 * else the code itself.
 */
export function deskCurrencySymbol(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!upper) return '';
  if (upper === deskCompanyCurrency()) {
    const own = deskHost().companyCurrencySymbol?.().trim();
    if (own) return own;
  }
  const cached = symbols.get(upper);
  if (cached !== undefined) return cached;
  let symbol = upper;
  try {
    const part = new Intl.NumberFormat(deskLocale(), { style: 'currency', currency: upper, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((item) => item.type === 'currency');
    if (part?.value) symbol = part.value;
  } catch {
    // Not an ISO code the browser knows. The code stands in.
  }
  symbols.set(upper, symbol);
  return symbol;
}

/** `₹1,234.00`, `$10.00`, or `AED 10.00` when the symbol is letters. */
function withSymbol(text: string, symbol: string): string {
  if (!symbol) return text;
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const gap = /^[A-Za-z]+$/.test(symbol) ? ' ' : '';
  return `${negative ? '-' : ''}${symbol}${gap}${digits}`;
}

/** Which currency a two-currency cell puts first. */
export type DeskMoneyFace = 'company' | 'document';

/**
 * How one currency column reads. Every field is optional.
 * `face`: which amount is on top for a foreign row. Missing means the company amount.
 * `symbol`: `auto` shows symbols only on a foreign row, `always` on every row, `never` on none.
 * `second`: show the other currency as a second line on a foreign row. Default true.
 */
export interface DeskMoneyView {
  face?: DeskMoneyFace;
  symbol?: 'auto' | 'always' | 'never';
  second?: boolean;
}

/** True when the row's currency is the company's: same code, or the same id when both have one. */
function sameAsCompany(money: DeskMoney, base: string): boolean {
  // No company currency configured: one currency everywhere.
  if (!base) return true;
  const companyId = deskHost().companyCurrencyId?.();
  if (money.id !== undefined && money.id !== null && companyId !== undefined && companyId !== null) return String(money.id) === String(companyId);
  return codeOf(money.code, base) === base;
}

/**
 * The lines of one amount. Same currency: one line. Another currency: the face's amount on top
 * and, unless turned off, the other one under it. The company amount is `amount × rate`, rounded
 * to the company's money places; the saved amount keeps its own digits.
 */
export function moneyLines(value: unknown, money: DeskMoney = {}, view: DeskMoneyView = {}): { primary: string; caption: string } {
  const amount = amountOf(value);
  if (amount === null) return { primary: '', caption: '' };
  const places = deskDecimals().money;
  const base = deskCompanyCurrency();
  const symbolMode = view.symbol ?? 'auto';
  const documentText = formatDeskDecimal(amount, places);
  if (sameAsCompany(money, base)) {
    const symbol = symbolMode === 'always' ? (money.symbol?.trim() || deskCurrencySymbol(base)) : '';
    return { primary: withSymbol(documentText, symbol), caption: '' };
  }
  const code = codeOf(money.code, base);
  const showSymbols = symbolMode !== 'never';
  const documentLine = withSymbol(documentText, showSymbols ? (money.symbol?.trim() || deskCurrencySymbol(code)) : '');
  const company = Math.round(amount * rateOf(money.rate) * 10 ** places) / 10 ** places;
  const companyLine = withSymbol(formatDeskDecimal(company, places), showSymbols ? deskCurrencySymbol(base) : '');
  const face = view.face ?? 'company';
  const [primary, caption] = face === 'document' ? [documentLine, companyLine] : [companyLine, documentLine];
  return { primary, caption: view.second === false ? '' : caption };
}

/** Row keys that hold an amount's currency: `code` such as `currency`, `rate` such as `conversionRate`. */
export interface DeskMoneyFrom {
  code?: string;
  rate?: string;
  id?: string;
  symbol?: string;
}

function readKey(row: Record<string, unknown>, path: string | undefined): unknown {
  if (!path) return undefined;
  let current: unknown = row;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** The currency of a row, read from the keys a column or catalog field names. */
export function moneyFromRow(from: DeskMoneyFrom | undefined, row: Record<string, unknown>): DeskMoney {
  if (!from) return {};
  const money: DeskMoney = {};
  const code = readKey(row, from.code);
  if (typeof code === 'string') money.code = code;
  const rate = readKey(row, from.rate);
  if (typeof rate === 'number' || typeof rate === 'string') money.rate = rate;
  const id = readKey(row, from.id);
  if (typeof id === 'number' || typeof id === 'string') money.id = id;
  const symbol = readKey(row, from.symbol);
  if (typeof symbol === 'string') money.symbol = symbol;
  return money;
}

/** Keys `moneyFrom` reads, so a list can fetch them with the amount. */
export function moneyFromKeys(from: DeskMoneyFrom | undefined): string[] {
  if (!from) return [];
  return [from.code, from.rate, from.id, from.symbol].filter((key): key is string => typeof key === 'string' && key !== '');
}

function moneyOf(column: DeskColumn, row: DeskGridRow): DeskMoney {
  const money = column.money;
  if (!money) return moneyFromRow(column.moneyFrom, row);
  return typeof money === 'function' ? money(row) : money;
}

/** How a currency amount cell reads. Null for a column that is not a currency column. */
export function currencyLines(column: DeskColumn, row: DeskGridRow): { primary: string; caption: string } | null {
  if (column.type !== 'currency' && column.editor !== 'currency') return null;
  return moneyLines(row[column.id], moneyOf(column, row), column.moneyView ?? {});
}

/** Second line of a currency cell. Empty when the amount is already in the company currency. */
export function currencyCaption(column: DeskColumn, row: DeskGridRow): string {
  return currencyLines(column, row)?.caption ?? '';
}
