import type { PivotDateGroup, PivotLayout } from '../pivot/pivotTypes';
import type { Rdl2ColumnFormat, Rdl2DateBucket, Rdl2OutputColumn, Rdl2RunSummary } from './language';

/**
 * A free report name for a new saved pivot, from its title: `pivot.sales-by-brand`, then
 * `pivot.sales-by-brand-2`. Reports and pivots share one set of names.
 */
export function pivotName(title: string, taken: ReadonlySet<string>): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'view';
  const base = `pivot.${slug}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

type Grain = Rdl2DateBucket | 'day';

/** Which groupings rows grouped by one grain can still give: a month adds up to its quarter, FY and year. */
const GIVES: Record<Grain, ReadonlySet<Grain>> = {
  day: new Set<Grain>(['day', 'month', 'quarter', 'fy', 'year']),
  month: new Set<Grain>(['month', 'quarter', 'fy', 'year']),
  // Quarters from April fall inside both a financial and a calendar year.
  quarter: new Set<Grain>(['quarter', 'fy', 'year']),
  fy: new Set<Grain>(['fy']),
  year: new Set<Grain>(['year']),
};
const FINEST: Grain[] = ['day', 'month', 'quarter', 'fy', 'year'];

function grainOf(group: PivotDateGroup | undefined): Grain {
  return group && group !== 'day' ? group : 'day';
}

/** The coarsest grain that gives both: month and FY need months, FY and year need quarters. */
function commonGrain(a: Grain, b: Grain): Grain {
  return [...FINEST].reverse().find((grain) => GIVES[grain].has(a) && GIVES[grain].has(b)) ?? 'day';
}

/**
 * What a layout needs from the server, as a grouped run: its Rows, Columns and Filters fields as
 * keys (a date by the layout's grouping), the fields it totals as values, and a distinct count's
 * field as a key (a count of distinct values cannot be added up from groups). A calculated field
 * stands for the fields its formula reads. Only the report's columns, in the report's order.
 */
export function pivotSummary(
  layout: PivotLayout,
  reportColumns: readonly string[],
): Rdl2RunSummary {
  const keys = new Map<string, Grain>();
  const key = (column: string, grain: Grain) => {
    const before = keys.get(column);
    keys.set(column, before ? commonGrain(before, grain) : grain);
  };
  for (const item of [...layout.filters, ...layout.columns, ...layout.rows])
    key(item.field, grainOf(item.dateGroup));
  const calcs = new Map((layout.calculated ?? []).map((calc) => [calc.id, calc.refs]));
  const values = new Set<string>();
  for (const item of layout.values) {
    const refs = calcs.get(item.field);
    if (refs) refs.forEach((ref) => values.add(ref));
    else if (item.aggregate === 'distinct') key(item.field, 'day');
    else values.add(item.field);
  }
  return {
    keys: reportColumns
      .filter((column) => keys.has(column))
      .map((column) => {
        const grain = keys.get(column)!;
        return grain === 'day' ? { column } : { column, bucket: grain };
      }),
    values: reportColumns.filter((column) => values.has(column) && !keys.has(column)),
  };
}

const NUMERIC = new Set<Rdl2ColumnFormat>(['money', 'qty', 'number', 'percent']);

/**
 * Every column of the report at once, for a report without `columnsOnDemand`: text and dates as
 * keys by day, numbers as totals. That is the report's rows (identical ones added together), so
 * any later layout is given by them and the pivot never loads again. What `wanted` needs as a key
 * (a number on an axis or counted distinct) is a key too.
 */
export function pivotSummaryAll(
  columns: readonly Rdl2OutputColumn[],
  wanted: Rdl2RunSummary,
): Rdl2RunSummary {
  const keys = new Set([
    ...columns
      .filter((column) => !column.format || !NUMERIC.has(column.format))
      .map((column) => column.column),
    ...wanted.keys.map((key) => key.column),
  ]);
  return {
    keys: columns
      .filter((column) => keys.has(column.column))
      .map((column) => ({ column: column.column })),
    values: columns.filter((column) => !keys.has(column.column)).map((column) => column.column),
  };
}

/**
 * Rows grouped by `loaded` can give `wanted` when it has every wanted key at a grain that adds up
 * to it, and every wanted value as a value or a key. Extra keys are fine: the pivot adds them up.
 */
export function summaryCovers(loaded: Rdl2RunSummary | null, wanted: Rdl2RunSummary): boolean {
  if (!loaded) return false;
  const grains = new Map(loaded.keys.map((key) => [key.column, (key.bucket ?? 'day') as Grain]));
  const keysOk = wanted.keys.every((key) => {
    const grain = grains.get(key.column);
    return grain !== undefined && GIVES[grain].has(key.bucket ?? 'day');
  });
  return (
    keysOk && wanted.values.every((column) => loaded.values.includes(column) || grains.has(column))
  );
}

/** Every column a grouped run carries: what the drill grid can show. */
export function summaryColumns(summary: Rdl2RunSummary): string[] {
  return [...summary.keys.map((key) => key.column), ...summary.values];
}
