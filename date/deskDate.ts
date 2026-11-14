/** A date the user sees. The stored value stays `YYYY-MM-DD`. */
export type DeskDateShow = 'dd/mm/yyyy' | 'dd-mm-yyyy' | 'dd MMM yyyy' | 'yyyy-mm-dd';

/** Digit order when the text has no month name. `ymd` is the `yyyy-mm-dd` preference. */
export type DeskDateOrder = 'dmy' | 'ymd';

/** Year used when the typed date leaves it out. `fy` is April–March. */
export type DeskDateYear = 'calendar' | 'fy';

export interface DeskDateParseOptions {
  order: DeskDateOrder;
  today: string;
  /** Missing year. Omitted means the calendar year of `today`. */
  year?: DeskDateYear;
  /** Start year of the selected financial year, such as 2026 for 2026-27. */
  fyStart?: number;
}

export interface DeskDateParts {
  y: number;
  m: number;
  d: number;
}

const MONTHS: { name: string; month: number }[] = [
  { name: 'january', month: 1 },
  { name: 'february', month: 2 },
  { name: 'march', month: 3 },
  { name: 'april', month: 4 },
  { name: 'august', month: 8 },
  { name: 'september', month: 9 },
  { name: 'october', month: 10 },
  { name: 'november', month: 11 },
  { name: 'december', month: 12 },
  { name: 'sept', month: 9 },
  { name: 'jan', month: 1 },
  { name: 'feb', month: 2 },
  { name: 'mar', month: 3 },
  { name: 'apr', month: 4 },
  { name: 'may', month: 5 },
  { name: 'jun', month: 6 },
  { name: 'jul', month: 7 },
  { name: 'aug', month: 8 },
  { name: 'sep', month: 9 },
  { name: 'oct', month: 10 },
  { name: 'nov', month: 11 },
  { name: 'dec', month: 12 },
  { name: 'june', month: 6 },
  { name: 'july', month: 7 },
];

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function orderOf(show: DeskDateShow): DeskDateOrder {
  return show === 'yyyy-mm-dd' ? 'ymd' : 'dmy';
}

export function todayIso(now = new Date()): string {
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM-DD`, or the date part of an ISO datetime. Other text is not a stored date. */
export function splitIso(value: string): DeskDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!realDate(y, m, d)) return null;
  return { y, m, d };
}

function realDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function fromParts(year: number, month: number, day: number): string | null {
  if (!realDate(year, month, day)) return null;
  return ymd(year, month, day);
}

/** A two-digit year is 20yy. */
function fullYear(year: number): number {
  if (year >= 100) return year;
  return 2000 + year;
}

export function shiftIso(iso: string, days: number): string | null {
  const parts = splitIso(iso);
  if (!parts) return null;
  const date = new Date(parts.y, parts.m - 1, parts.d);
  date.setDate(date.getDate() + days);
  return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function shiftMonth(iso: string, months: number): string | null {
  const parts = splitIso(iso);
  if (!parts) return null;
  const cursor = new Date(parts.y, parts.m - 1 + months, 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  return ymd(cursor.getFullYear(), cursor.getMonth() + 1, Math.min(parts.d, last));
}

/** Month number 1–12 for `oct` or `october`. Unknown words are null. */
export function deskMonthNumber(word: string): number | null {
  const name = word.toLowerCase();
  return MONTHS.find((item) => item.name === name)?.month ?? null;
}

function monthOf(word: string): number | null {
  return deskMonthNumber(word);
}

function tokensOf(text: string): string[] {
  return text.toLowerCase().split(/[\s/.,-]+/).filter((part) => part !== '');
}

interface YearContext {
  today: DeskDateParts;
  year: DeskDateYear;
  fyStart?: number;
}

/**
 * Year for a month the user did not type a year for.
 * Financial year runs April–March: January–March belong to the year after `fyStart`.
 */
function impliedYear(month: number, ctx: YearContext): number {
  if (ctx.year !== 'fy') return ctx.today.y;
  const start = ctx.fyStart ?? (ctx.today.m >= 4 ? ctx.today.y : ctx.today.y - 1);
  return month >= 4 ? start : start + 1;
}

function namedDate(tokens: string[], ctx: YearContext): string | null {
  let month: number | null = null;
  const numbers: number[] = [];
  for (const token of tokens) {
    const named = monthOf(token);
    if (named !== null) {
      if (month !== null) return null;
      month = named;
      continue;
    }
    if (!/^\d{1,4}$/.test(token)) return null;
    numbers.push(Number(token));
  }
  if (month === null || numbers.length === 0 || numbers.length > 2) return null;
  const day = numbers[0];
  const year = numbers[1] === undefined ? impliedYear(month, ctx) : fullYear(numbers[1]);
  if (day === undefined || day > 31) return null;
  return fromParts(year, month, day);
}

/**
 * Month name first (`sep 12`) or day first (`12 sep`).
 * A lone month word is not a date.
 */
function namedEitherWay(tokens: string[], ctx: YearContext): string | null {
  if (tokens.length === 0 || tokens.every((token) => monthOf(token) === null)) return null;
  const monthFirst = monthOf(tokens[0] ?? '');
  if (monthFirst !== null && tokens.length >= 2) {
    const day = Number(tokens[1]);
    if (!Number.isInteger(day)) return null;
    const year = tokens[2] === undefined ? impliedYear(monthFirst, ctx) : fullYear(Number(tokens[2]));
    return fromParts(year, monthFirst, day);
  }
  return namedDate(tokens, ctx);
}

function numericDate(numbers: number[], order: DeskDateOrder, ctx: YearContext): string | null {
  if (numbers.length === 0 || numbers.length > 3) return null;
  if (order === 'ymd') {
    const year = fullYear(numbers[0] ?? ctx.today.y);
    const month = numbers[1] ?? ctx.today.m;
    const day = numbers[2] ?? ctx.today.d;
    return fromParts(year, month, day);
  }
  const day = numbers[0] ?? ctx.today.d;
  const month = numbers[1] ?? ctx.today.m;
  const year = numbers[2] === undefined ? impliedYear(month, ctx) : fullYear(numbers[2]);
  return fromParts(year, month, day);
}

function compactDate(digits: string, order: DeskDateOrder): string | null {
  if (order === 'ymd') {
    if (/^\d{8}$/.test(digits)) {
      return fromParts(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)));
    }
    if (/^\d{6}$/.test(digits)) {
      return fromParts(fullYear(Number(digits.slice(0, 2))), Number(digits.slice(2, 4)), Number(digits.slice(4, 6)));
    }
    return null;
  }
  if (/^\d{8}$/.test(digits)) {
    return fromParts(fullYear(Number(digits.slice(4, 8))), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
  }
  if (/^\d{6}$/.test(digits)) {
    return fromParts(fullYear(Number(digits.slice(4, 6))), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
  }
  return null;
}

function gluedDate(text: string, ctx: YearContext): string | null {
  const dayFirst = /^(\d{1,2})([a-z]+)(\d{2,4})?$/.exec(text);
  if (dayFirst?.[1] && dayFirst[2]) {
    const month = monthOf(dayFirst[2]);
    if (month === null) return null;
    const year = dayFirst[3] === undefined ? impliedYear(month, ctx) : fullYear(Number(dayFirst[3]));
    return fromParts(year, month, Number(dayFirst[1]));
  }
  const monthFirst = /^([a-z]+)(\d{1,2})(\d{2,4})?$/.exec(text);
  if (monthFirst?.[1] && monthFirst[2]) {
    const month = monthOf(monthFirst[1]);
    if (month === null) return null;
    const year = monthFirst[3] === undefined ? impliedYear(month, ctx) : fullYear(Number(monthFirst[3]));
    return fromParts(year, month, Number(monthFirst[2]));
  }
  return null;
}

/**
 * Read what the user typed. Empty text is null. An impossible day is null.
 * A missing month comes from `today`. A missing year follows `year`: the calendar year,
 * or the financial year (April–March) when `year` is `fy`. A two-digit year is 20yy.
 */
export function parseDeskDate(text: string, options: DeskDateParseOptions): string | null {
  const raw = text.trim();
  if (raw === '') return null;
  const today = splitIso(options.today) ?? splitIso(todayIso());
  if (!today) return null;
  const ctx: YearContext = {
    today,
    year: options.year === 'fy' ? 'fy' : 'calendar',
    ...(typeof options.fyStart === 'number' && Number.isFinite(options.fyStart) ? { fyStart: options.fyStart } : {}),
  };
  const word = raw.toLowerCase();
  if (word === 't' || word === 'today') return ymd(today.y, today.m, today.d);
  if (word === 'y' || word === 'yesterday') return shiftIso(ymd(today.y, today.m, today.d), -1);
  const relative = /^[+-]\d+$/.exec(word);
  if (relative) return shiftIso(ymd(today.y, today.m, today.d), Number(word));
  const iso = splitIso(raw);
  if (iso && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(raw)) return ymd(iso.y, iso.m, iso.d);
  if (/^\d{6}$/.test(word) || /^\d{8}$/.test(word)) return compactDate(word, options.order);
  if (!/[\s/.,-]/.test(word)) {
    const glued = gluedDate(word, ctx);
    if (glued) return glued;
  }
  const tokens = tokensOf(word);
  if (tokens.some((token) => monthOf(token) !== null)) return namedEitherWay(tokens, ctx);
  if (tokens.some((token) => !/^\d{1,4}$/.test(token))) return null;
  return numericDate(tokens.map(Number), options.order, ctx);
}

/** Face for a stored date. Text that is not a stored date is returned unchanged. */
export function formatDeskDate(iso: string, show: DeskDateShow): string {
  const parts = splitIso(iso);
  if (!parts) return iso;
  const day = pad(parts.d);
  const month = pad(parts.m);
  if (show === 'yyyy-mm-dd') return ymd(parts.y, parts.m, parts.d);
  if (show === 'dd-mm-yyyy') return `${day}-${month}-${parts.y}`;
  if (show === 'dd MMM yyyy') return `${parts.d} ${MONTH_LABEL[parts.m - 1]} ${parts.y}`;
  return `${day}/${month}/${parts.y}`;
}

/** `Sat, 12 Sep 2026`, or null when `iso` is not a stored date. */
export function describeDeskDate(iso: string): string | null {
  const parts = splitIso(iso);
  if (!parts) return null;
  const date = new Date(parts.y, parts.m - 1, parts.d);
  return `${DAY_LABEL[date.getDay()]}, ${parts.d} ${MONTH_LABEL[parts.m - 1]} ${parts.y}`;
}

/** Digits grouped for the mask. `12092026` with `dd/mm/yyyy` is `12/09/2026`. */
export function maskDateDigits(digits: string, show: DeskDateShow): string {
  const groups = show === 'yyyy-mm-dd' ? [4, 2, 2] : [2, 2, 4];
  const sep = show === 'dd/mm/yyyy' ? '/' : show === 'dd MMM yyyy' ? ' ' : '-';
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(sep);
}
