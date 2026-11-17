import { describe, expect, it } from 'vitest';
import { formatDeskDate, maskDateDigits, parseDeskDate } from '../src/date/deskDate';

const today = '2026-10-12';
const dmy = { order: 'dmy' as const, today };
const ymd = { order: 'ymd' as const, today };

describe('parseDeskDate', () => {
  it('reads a day, a day and month, and a full date in day-month order', () => {
    expect(parseDeskDate('12', dmy)).toBe('2026-10-12');
    expect(parseDeskDate('12/9', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12/09/26', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12/09/2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12-09-2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12.09.2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12 09 2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('03/04', dmy)).toBe('2026-04-03');
  });

  it('reads compact digits and a stored ISO date', () => {
    expect(parseDeskDate('120926', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12092026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('20260912', ymd)).toBe('2026-09-12');
    expect(parseDeskDate('2026-09-12', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('2026-09-12T10:00:00.000Z', dmy)).toBe('2026-09-12');
  });

  it('reads month names in either order', () => {
    expect(parseDeskDate('12 sep 2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12 SEP 2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12 sept 26', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12sep', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('12sep2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('sep 12 2026', dmy)).toBe('2026-09-12');
    expect(parseDeskDate('sep12', dmy)).toBe('2026-09-12');
  });

  it('reads today, yesterday, and a day offset', () => {
    expect(parseDeskDate('t', dmy)).toBe(today);
    expect(parseDeskDate('today', dmy)).toBe(today);
    expect(parseDeskDate('y', dmy)).toBe('2026-10-11');
    expect(parseDeskDate('yesterday', dmy)).toBe('2026-10-11');
    expect(parseDeskDate('+3', dmy)).toBe('2026-10-15');
    expect(parseDeskDate('-1', dmy)).toBe('2026-10-11');
  });

  it('reads a two-digit year as 20yy and follows year-month order', () => {
    expect(parseDeskDate('12/09/99', dmy)).toBe('2099-09-12');
    expect(parseDeskDate('03/04', ymd)).toBe('2003-04-12');
    expect(parseDeskDate('2026-09-12', ymd)).toBe('2026-09-12');
  });

  it('fills a missing year from the calendar or the financial year', () => {
    const fy = { order: 'dmy' as const, today, year: 'fy' as const, fyStart: 2026 };
    expect(parseDeskDate('2 feb', dmy)).toBe('2026-02-02');
    expect(parseDeskDate('2 feb', fy)).toBe('2027-02-02');
    expect(parseDeskDate('2 oct', fy)).toBe('2026-10-02');
    expect(parseDeskDate('2 feb 2026', fy)).toBe('2026-02-02');
    expect(parseDeskDate('2/2', fy)).toBe('2027-02-02');
    expect(parseDeskDate('2feb', fy)).toBe('2027-02-02');
    expect(parseDeskDate('2 feb', { order: 'dmy', today, year: 'fy' })).toBe('2027-02-02');
  });

  it('rejects an empty value and an impossible day', () => {
    expect(parseDeskDate('', dmy)).toBeNull();
    expect(parseDeskDate('   ', dmy)).toBeNull();
    expect(parseDeskDate('31/02/2026', dmy)).toBeNull();
    expect(parseDeskDate('29/02/2023', dmy)).toBeNull();
    expect(parseDeskDate('29/02/2024', dmy)).toBe('2024-02-29');
    expect(parseDeskDate('nope', dmy)).toBeNull();
  });
});

describe('formatDeskDate', () => {
  it('shows a stored date in the chosen face', () => {
    expect(formatDeskDate('2026-09-12', 'dd/mm/yyyy')).toBe('12/09/2026');
    expect(formatDeskDate('2026-09-12', 'dd-mm-yyyy')).toBe('12-09-2026');
    expect(formatDeskDate('2026-09-12', 'dd MMM yyyy')).toBe('12 Sep 2026');
    expect(formatDeskDate('2026-09-12', 'yyyy-mm-dd')).toBe('2026-09-12');
    expect(formatDeskDate('2026-09-12T00:00:00.000Z', 'dd/mm/yyyy')).toBe('12/09/2026');
    expect(formatDeskDate('not a date', 'dd/mm/yyyy')).toBe('not a date');
  });
});

describe('maskDateDigits', () => {
  it('groups digits with the show separator', () => {
    expect(maskDateDigits('12092026', 'dd/mm/yyyy')).toBe('12/09/2026');
    expect(maskDateDigits('1209', 'dd/mm/yyyy')).toBe('12/09');
    expect(maskDateDigits('20260912', 'yyyy-mm-dd')).toBe('2026-09-12');
    expect(maskDateDigits('12092026', 'dd MMM yyyy')).toBe('12 09 2026');
  });
});
