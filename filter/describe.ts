import { datePrefs } from '../date/datePrefs';
import { formatDeskDate } from '../date/deskDate';
import type { DeskFilterSpec, DeskFilterValues, DeskPhraseContext } from './types';

/** Marks around a value inside a phrase. Private-use characters, so typed text never holds them. */
const OPEN = '\uE000';
const CLOSE = '\uE001';

/**
 * Mark a chosen value in a phrase, such as a branch name or "this FY till date". The closed filter
 * panel draws values bold and the words around them quieter; plain text drops the marks.
 * `deskListPhrase`, `deskPeriodPhrase` and `{key}` placeholders mark their values already.
 */
export function deskValue(text: string): string {
  return text ? `${OPEN}${text}${CLOSE}` : '';
}

/** One piece of a filter sentence: a chosen value, or the words around it. */
export interface DeskPhrasePart {
  text: string;
  value: boolean;
}

/** A sentence with value marks as parts, for drawing. */
export function deskPhraseParts(sentence: string): DeskPhrasePart[] {
  const parts: DeskPhrasePart[] = [];
  const pattern = new RegExp(`${OPEN}([^${CLOSE}]*)${CLOSE}`, 'g');
  let last = 0;
  for (const match of sentence.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: sentence.slice(last, at), value: false });
    if (match[1]) parts.push({ text: match[1], value: true });
    last = at + match[0].length;
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), value: false });
  return parts;
}

/** The sentence without value marks. */
export function plainDeskPhrase(sentence: string): string {
  return sentence.replaceAll(OPEN, '').replaceAll(CLOSE, '');
}

function fill(template: string, values: DeskFilterValues): string {
  return template.replace(/\{(\w+)\}/g, (_all, key: string) => {
    const value = values[key];
    return typeof value === 'string' || typeof value === 'number' ? deskValue(String(value)) : '';
  });
}

/** The sentence for the values as plain text: every rule whose `when` passes, joined with spaces. */
export function describeDeskFilter<V extends DeskFilterValues>(spec: DeskFilterSpec<V>, values: V): string {
  return plainDeskPhrase(markedDeskFilter(spec, values));
}

/** The same sentence with values marked (see `deskValue`), for `deskPhraseParts`. */
export function markedDeskFilter<V extends DeskFilterValues>(spec: DeskFilterSpec<V>, values: V): string {
  const labels = new Map(spec.fields.map((field) => [field.key, field.label]));
  const ctx: DeskPhraseContext = { label: (key) => labels.get(key) ?? key };
  const parts: string[] = [];
  for (const rule of spec.phrases) {
    if (rule.when && !rule.when(values)) continue;
    const text = typeof rule.text === 'function' ? rule.text(values, ctx) : fill(rule.text, values);
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join(' ');
}

export interface DeskListPhraseWords {
  /** Nothing chosen, such as "all branches". */
  none: string;
  /** Singular noun after one name, such as "branch": "HO branch". */
  one: string;
  /** Plural noun for several, such as "branches": "3 branches (HO, Delhi, +1)". */
  many: string;
  /** Names to show before "+n". Defaults to 2. */
  max?: number;
}

/** "HO branch", "3 branches (HO, Delhi, +1)" or the `none` words. */
export function deskListPhrase(labels: readonly string[], words: DeskListPhraseWords): string {
  const names = labels.filter(Boolean);
  if (names.length === 0) return deskValue(words.none);
  if (names.length === 1) return `${deskValue(names[0] ?? '')} ${words.one}`.trim();
  const max = words.max ?? 2;
  const shown = names.slice(0, max).map(deskValue);
  const rest = names.length - shown.length;
  return `${deskValue(String(names.length))} ${words.many} (${shown.join(', ')}${rest > 0 ? `, +${rest}` : ''})`;
}

export interface DeskPeriodContext {
  /** Start of the current year, `YYYY-MM-DD`. */
  yearStart: string;
  /** End of the current year, `YYYY-MM-DD`. Defaults to the day before the next year start. */
  yearEnd?: string;
  /** Today, `YYYY-MM-DD`. */
  today: string;
  /** Short word for the year, such as "FY". */
  yearWord?: string;
  /** Format a date for display. Defaults to the date preference. */
  show?: (iso: string) => string;
}

function addYear(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${(y ?? 0) + delta}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** "for this FY till date", "for last FY", "for today" or "from 01/04/2026 to 15/09/2026". */
export function deskPeriodPhrase(from: string, to: string, ctx: DeskPeriodContext): string {
  const word = ctx.yearWord ?? 'year';
  const show = ctx.show ?? ((iso: string) => formatDeskDate(iso, datePrefs.value.show));
  if (!from && !to) return '';
  if (!from || !to) return from ? `from ${deskValue(show(from))}` : `till ${deskValue(show(to))}`;
  const yearEnd = ctx.yearEnd ?? dayBefore(addYear(ctx.yearStart, 1));
  if (from === ctx.today && to === ctx.today) return `for ${deskValue('today')}`;
  if (from === ctx.yearStart) {
    if (to === ctx.today) return `for ${deskValue(`this ${word} till date`)}`;
    if (to === yearEnd) return `for ${deskValue(`this ${word}`)}`;
  }
  const lastStart = addYear(ctx.yearStart, -1);
  if (from === lastStart && to === dayBefore(ctx.yearStart)) return `for ${deskValue(`last ${word}`)}`;
  return `from ${deskValue(show(from))} to ${deskValue(show(to))}`;
}
