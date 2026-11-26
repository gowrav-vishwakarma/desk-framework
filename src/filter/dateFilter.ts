import { deskMonthNumber } from '../date/deskDate';

/** A Sequelize comparison for one date column. Bounds are `YYYY-MM-DD HH:mm:ss`. */
export type DateFilterClause = Record<string, string | [string, string]>;

interface Period {
  start: string;
  end: string;
}

const OPS = />=|<=|=<|!=|<>|>|<|=/g;

/**
 * Turn a date-column filter into a where clause.
 * `null` is an empty box. `'wait'` is typed but not a finished period, so the list must not query yet.
 * `now` supplies the year for `15 oct` and `15/10`, and the clock for `today`, `this month`, and `-15 days`.
 * A financial year runs 1 Apr–31 Mar and is the year that contains `now`. A week is Monday through Sunday.
 */
export function parseDateFilter(raw: string, now: Date = new Date()): DateFilterClause | 'wait' | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes('..')) {
    const parts = text.split('..');
    if (parts.length !== 2) return 'wait';
    const left = parsePeriod(parts[0] ?? '', now);
    const right = parsePeriod(parts[1] ?? '', now);
    if (left === 'wait' || right === 'wait') return 'wait';
    const [from, to] = left.start <= right.start ? [left, right] : [right, left];
    return { $gte: from.start, $lte: to.end };
  }

  const found: { op: string; index: number }[] = [];
  OPS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPS.exec(text))) found.push({ op: match[0], index: match.index });
  if (found.length === 0) {
    const period = parsePeriod(text, now);
    if (period === 'wait') return 'wait';
    return { $gte: period.start, $lte: period.end };
  }
  if (found.length > 2) return 'wait';
  const first = found[0];
  if (!first || text.slice(0, first.index).trim() !== '') return 'wait';

  const clause: DateFilterClause = {};
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    const next = found[index + 1];
    if (!current) return 'wait';
    const phrase = text.slice(current.index + current.op.length, next ? next.index : text.length);
    const period = parsePeriod(phrase, now);
    if (period === 'wait') return 'wait';
    applyOp(current.op, period, clause);
  }
  return clause;
}

function applyOp(op: string, period: Period, clause: DateFilterClause): void {
  if (op === '>=') clause.$gte = period.start;
  else if (op === '>') clause.$gt = period.end;
  else if (op === '<=' || op === '=<') clause.$lte = period.end;
  else if (op === '<') clause.$lt = period.start;
  else if (op === '=') {
    clause.$gte = period.start;
    clause.$lte = period.end;
  } else if (op === '!=' || op === '<>') clause.$notBetween = [period.start, period.end];
}

type Unit = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'fy';

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parsePeriod(raw: string, now: Date, loneMonth = false): Period | 'wait' {
  const text = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return 'wait';
  const shifted = peelShift(text);
  if (shifted) {
    const base = parsePeriod(shifted.base, now, true);
    if (base === 'wait') return 'wait';
    return movePeriod(base, shifted.amount, shifted.unit);
  }
  const relative = relativePeriod(text, now);
  if (relative) return relative;

  const yearNow = now.getFullYear();

  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoDay?.[1] && isoDay[2] && isoDay[3]) return dayPeriod(Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]));
  const isoMonth = /^(\d{4})-(\d{2})$/.exec(text);
  if (isoMonth?.[1] && isoMonth[2]) return monthPeriod(Number(isoMonth[1]), Number(isoMonth[2]));
  if (/^\d{3}$/.test(text)) return 'wait';
  if (/^\d{4}$/.test(text)) return yearPeriod(Number(text));

  const dayMonthYear = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dayMonthYear?.[1] && dayMonthYear[2] && dayMonthYear[3]) {
    return dayPeriod(Number(dayMonthYear[3]), Number(dayMonthYear[2]), Number(dayMonthYear[1]));
  }
  const dayMonthShortYear = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(text);
  if (dayMonthShortYear?.[1] && dayMonthShortYear[2] && dayMonthShortYear[3]) {
    return dayPeriod(2000 + Number(dayMonthShortYear[3]), Number(dayMonthShortYear[2]), Number(dayMonthShortYear[1]));
  }
  const monthYear = /^(\d{1,2})[/-](\d{4})$/.exec(text);
  if (monthYear?.[1] && monthYear[2]) return monthPeriod(Number(monthYear[2]), Number(monthYear[1]));
  const dayMonth = /^(\d{1,2})[/-](\d{1,2})$/.exec(text);
  if (dayMonth?.[1] && dayMonth[2]) return dayPeriod(yearNow, Number(dayMonth[2]), Number(dayMonth[1]));

  return namedPeriod(text.split(' '), yearNow, loneMonth);
}

/** `today last year` keeps the first period and moves it by one unit. */
function peelShift(text: string): { base: string; amount: number; unit: Unit } | null {
  const match = /^(.+)\s+(last|next)\s+(financial year|day|week|month|quarter|year|fy)$/.exec(text);
  const base = match?.[1]?.trim();
  const direction = match?.[2];
  const unit = match?.[3] ? unitOf(match[3]) : null;
  if (!base || !direction || !unit) return null;
  return { base, amount: direction === 'last' ? -1 : 1, unit };
}

function relativePeriod(text: string, now: Date): Period | 'wait' | null {
  const namedDay = namedDayPeriod(text, now);
  if (namedDay) return namedDay;
  const offset = offsetPeriod(text, now);
  if (offset) return offset;
  const named = namedRelative(text, now);
  if (named) return named;
  return null;
}

function namedDayPeriod(text: string, now: Date): Period | null {
  if (text === 't' || text === 'today') return datePeriod(now);
  if (text === 'y' || text === 'yesterday') return datePeriod(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (text === 'tomorrow') return datePeriod(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return null;
}

/**
 * `-15days` is that day. `-3 month` is that whole month. `-1 year` and `-1 fy` are those years.
 * No sign, or `+`, is the same distance ahead. `3 months ago` is the past.
 */
function offsetPeriod(text: string, now: Date): Period | 'wait' | null {
  const ago = /^(\d+)\s+(.+)\s+ago$/.exec(text);
  if (ago?.[1] && ago[2]) {
    const unit = unitOf(ago[2]);
    if (!unit) return 'wait';
    return movePeriod(currentPeriod(unit, now), -Number(ago[1]), unit);
  }
  const match = /^([+-]?)\s*(\d+)\s*([a-z ]+)$/.exec(text);
  if (match?.[2] && match[3]) {
    const unit = unitOf(match[3].trim());
    if (!unit) return match[1] ? 'wait' : null;
    const sign = match[1] === '-' ? -1 : 1;
    return movePeriod(currentPeriod(unit, now), sign * Number(match[2]), unit);
  }
  if (/^[+-](?:\s*\d+)?(?:\s*[a-z ]*)?$/.test(text)) return 'wait';
  return null;
}

/** `month` and `fy` mean the current one. `last month` is the previous one. */
function namedRelative(text: string, now: Date): Period | null {
  const match = /^(?:(this|last|next)\s*)?(financial year|week|month|quarter|year|fy)$/.exec(text);
  const unitName = match?.[2];
  const unit = unitName ? unitOf(unitName) : null;
  if (!unit) return null;
  const direction = match?.[1];
  let amount = 0;
  if (direction === 'last') amount = -1;
  else if (direction === 'next') amount = 1;
  return movePeriod(currentPeriod(unit, now), amount, unit);
}

function currentPeriod(unit: Unit, now: Date): Period {
  if (unit === 'day') return datePeriod(now);
  if (unit === 'week') return weekPeriod(now);
  if (unit === 'month') return monthSpan(now.getFullYear(), now.getMonth() + 1);
  if (unit === 'quarter') return quarterPeriod(now);
  if (unit === 'year') return yearPeriod(now.getFullYear());
  return fyPeriod(now);
}

function datePeriod(date: Date): Period {
  return {
    start: clock(date.getFullYear(), date.getMonth() + 1, date.getDate(), false),
    end: clock(date.getFullYear(), date.getMonth() + 1, date.getDate(), true),
  };
}

/** Monday 00:00:00 through Sunday 23:59:59. */
function weekPeriod(date: Date): Period {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { start: datePeriod(monday).start, end: datePeriod(sunday).end };
}

/** April–June, July–September, October–December, January–March. */
function quarterPeriod(date: Date): Period {
  const month = date.getMonth() + 1;
  let startMonth = 10;
  if (month <= 3) startMonth = 1;
  else if (month <= 6) startMonth = 4;
  else if (month <= 9) startMonth = 7;
  return {
    start: clock(date.getFullYear(), startMonth, 1, false),
    end: monthSpan(date.getFullYear(), startMonth + 2).end,
  };
}

/** 1 Apr through 31 Mar, using the year that contains `date`. */
function fyPeriod(date: Date): Period {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return { start: clock(startYear, 4, 1, false), end: clock(startYear + 1, 3, 31, true) };
}

function monthSpan(year: number, month: number): Period {
  const last = new Date(year, month, 0).getDate();
  return { start: clock(year, month, 1, false), end: clock(year, month, last, true) };
}

function unitOf(word: string): Unit | null {
  const name = word.trim();
  if (name === 'd' || name === 'day' || name === 'days') return 'day';
  if (name === 'w' || name === 'week' || name === 'weeks') return 'week';
  if (name === 'm' || name === 'month' || name === 'months') return 'month';
  if (name === 'q' || name === 'quarter' || name === 'quarters') return 'quarter';
  if (name === 'y' || name === 'year' || name === 'years') return 'year';
  if (name === 'fy' || name === 'financial year' || name === 'financial years') return 'fy';
  return null;
}

function movePeriod(period: Period, amount: number, unit: Unit): Period {
  if (amount === 0) return period;
  const start = shiftDate(readClock(period.start), amount, unit);
  const end = shiftDate(readClock(period.end), amount, unit);
  return { start: clock(start.y, start.m, start.d, false), end: clock(end.y, end.m, end.d, true) };
}

function shiftDate(date: Ymd, amount: number, unit: Unit): Ymd {
  if (unit === 'day') return addDays(date, amount);
  if (unit === 'week') return addDays(date, amount * 7);
  if (unit === 'quarter') return addMonths(date, amount * 3);
  if (unit === 'month') return addMonths(date, amount);
  return addMonths(date, amount * 12);
}

function addDays(date: Ymd, amount: number): Ymd {
  const next = new Date(date.y, date.m - 1, date.d + amount);
  return { y: next.getFullYear(), m: next.getMonth() + 1, d: next.getDate() };
}

function addMonths(date: Ymd, amount: number): Ymd {
  const index = date.y * 12 + (date.m - 1) + amount;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  const last = new Date(y, m, 0).getDate();
  return { y, m, d: Math.min(date.d, last) };
}

function readClock(stamp: string): Ymd {
  const [date] = stamp.split(' ');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function namedPeriod(tokens: string[], yearNow: number, loneMonth: boolean): Period | 'wait' {
  const monthAt = tokens.findIndex((token) => deskMonthNumber(token) !== null);
  if (monthAt < 0) return 'wait';
  if (tokens.some((token, index) => index !== monthAt && deskMonthNumber(token) !== null)) return 'wait';
  const month = deskMonthNumber(tokens[monthAt] ?? '');
  if (month === null) return 'wait';
  const numbers = tokens.filter((_, index) => index !== monthAt);
  if (numbers.length === 0) return loneMonth ? monthPeriod(yearNow, month) : 'wait';
  if (numbers.length > 2) return 'wait';
  if (numbers.some((token) => !/^\d{1,4}$/.test(token))) return 'wait';
  if (numbers.some((token) => token.length === 3)) return 'wait';
  const yearToken = numbers.find((token) => token.length === 4);
  const small = numbers.filter((token) => token.length !== 4);
  if (yearToken && small.length === 0) return monthPeriod(Number(yearToken), month);
  const dayToken = small[0];
  if (small.length === 1 && dayToken) return dayPeriod(yearToken ? Number(yearToken) : yearNow, month, Number(dayToken));
  return 'wait';
}

function dayPeriod(year: number, month: number, day: number): Period | 'wait' {
  if (month < 1 || month > 12 || day < 1) return 'wait';
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 'wait';
  return { start: clock(year, month, day, false), end: clock(year, month, day, true) };
}

function monthPeriod(year: number, month: number): Period | 'wait' {
  if (month < 1 || month > 12) return 'wait';
  return monthSpan(year, month);
}

function yearPeriod(year: number): Period {
  return { start: clock(year, 1, 1, false), end: clock(year, 12, 31, true) };
}

function clock(year: number, month: number, day: number, end: boolean): string {
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return `${year}-${monthText}-${dayText} ${end ? '23:59:59' : '00:00:00'}`;
}
