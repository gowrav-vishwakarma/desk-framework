import type { DeskFilterPeriod, DeskFilterSpec, DeskFilterValues } from './types';

/** Key a saved panel uses for a named date range. */
export const DESK_PERIOD_KEY = '$period';
/** The period choice that keeps the dates as typed. */
export const DESK_PERIOD_FIXED = 'fixed';

function savedKeys<V extends DeskFilterValues>(spec: DeskFilterSpec<V>): string[] {
  const skip = new Set<string>(spec.saved?.skip ?? []);
  return spec.fields.map((field) => field.key).filter((key) => !skip.has(key));
}

/** The named range these dates match, or null for dates that only fit themselves. */
export function matchDeskPeriod<V extends DeskFilterValues>(spec: DeskFilterSpec<V>, values: V): DeskFilterPeriod | null {
  const period = spec.saved?.period;
  if (!period) return null;
  const from = values[period.from];
  const to = values[period.to];
  return period.choices().find((choice) => {
    const range = choice.range();
    return range.from === from && range.to === to;
  }) ?? null;
}

/**
 * Filter values as a layout stores them: plain JSON, field keys only. Dates that match a named
 * range are stored as `{ $period: id }` in place of the two dates.
 */
export function freezeDeskFilter<V extends DeskFilterValues>(
  spec: DeskFilterSpec<V>,
  values: V,
  /** A period id to store, or `fixed` to keep the dates. Omitted: match the dates to a period. */
  periodId?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of savedKeys(spec)) {
    if (values[key] !== undefined) out[key] = values[key];
  }
  const period = spec.saved?.period;
  const named =
    periodId === undefined ? matchDeskPeriod(spec, values) : (period?.choices().find((choice) => choice.id === periodId) ?? null);
  if (period && named) {
    delete out[period.from];
    delete out[period.to];
    out[DESK_PERIOD_KEY] = named.id;
  }
  return JSON.parse(JSON.stringify(out)) as Record<string, unknown>;
}

/**
 * A stored panel back as values: `defaults()` first, then the stored keys, then the named range's
 * dates for today, then the spec's `restore`. Unknown keys are ignored. Null gives the defaults.
 */
export function thawDeskFilter<V extends DeskFilterValues>(spec: DeskFilterSpec<V>, stored: Record<string, unknown> | null | undefined): V {
  const values = spec.defaults();
  if (!stored) return values;
  const known = new Set(savedKeys(spec));
  const next: DeskFilterValues = { ...values };
  for (const [key, value] of Object.entries(stored)) {
    if (known.has(key)) next[key] = value;
  }
  const period = spec.saved?.period;
  const id = stored[DESK_PERIOD_KEY];
  if (period && typeof id === 'string') {
    const choice = period.choices().find((item) => item.id === id);
    if (choice) {
      const range = choice.range();
      next[period.from] = range.from;
      next[period.to] = range.to;
    }
  }
  const restored = next as V;
  return spec.saved?.restore ? spec.saved.restore(restored) : restored;
}

/** True when two value sets would save the same. */
export function sameDeskFilter<V extends DeskFilterValues>(spec: DeskFilterSpec<V>, a: V, b: V): boolean {
  return JSON.stringify(freezeDeskFilter(spec, a)) === JSON.stringify(freezeDeskFilter(spec, b));
}

/**
 * One filter spec with its value type erased, so a framework part such as the layout designer can
 * edit saved values for any page. Build it with `deskSavedFilter(spec)`.
 */
export interface DeskSavedFilter {
  fields: DeskFilterSpec['fields'];
  /** The date pair a period stands for, when the spec has one. */
  period: { from: string; to: string; choices: () => DeskFilterPeriod[] } | null;
  thaw: (stored: Record<string, unknown> | null | undefined) => DeskFilterValues;
  freeze: (values: DeskFilterValues, periodId?: string) => Record<string, unknown>;
  /** Run the spec's `onChange` on a draft. */
  changed: (values: DeskFilterValues, key: string) => void;
}

export function deskSavedFilter<V extends DeskFilterValues>(spec: DeskFilterSpec<V>): DeskSavedFilter {
  const period = spec.saved?.period;
  return {
    fields: spec.fields,
    period: period ? { from: period.from, to: period.to, choices: period.choices } : null,
    thaw: (stored) => thawDeskFilter(spec, stored),
    freeze: (values, periodId) => freezeDeskFilter(spec, values as V, periodId),
    changed: (values, key) => spec.onChange?.(values as V, key),
  };
}
