import { cleanPivotCalcs } from './pivotCalc';
import { cleanPivotCondition, cleanPivotLabel, cleanPivotTop, cleanPivotValueFilters } from './pivotFilters';
import { PIVOT_AGGREGATES, type PivotWidths, type PivotAggregate, type PivotArea, type PivotAxisItem, type PivotField, type PivotLayout, type PivotValueItem } from './pivotTypes';

export type PivotAxisArea = Exclude<PivotArea, 'values'>;

export function emptyPivotLayout(): PivotLayout {
  return { rows: [], columns: [], filters: [], values: [], form: 'compact', subtotals: true, rowTotals: true, columnTotals: true };
}

/** "Sum of Net", "Count of Party", with "%" when it shows a share. */
export function pivotValueLabel(item: PivotValueItem, field: PivotField | undefined): string {
  const fn = PIVOT_AGGREGATES.find((entry) => entry.id === item.aggregate)?.label ?? item.aggregate;
  // A calculated field is its own figure: "GP %", not "Sum of GP %".
  const name = field?.calc ? field.label : `${fn} of ${field?.label ?? item.field}`;
  return item.showAs && item.showAs !== 'value' ? `${name} %` : name;
}

/** The key a value's column width is kept under: its field and function, so it follows the value when moved. */
export function pivotValueKey(item: PivotValueItem): string {
  return `${item.field}:${item.aggregate}`;
}

/** Widths as stored: plain numbers in a sane range only. */
function cleanWidths(raw: unknown): PivotWidths | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as PivotWidths;
  const ok = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 40 && value <= 1200;
  const labels = Array.isArray(given.labels) ? given.labels.map((value) => (ok(value) ? Math.round(value) : null)) : [];
  const values = Object.fromEntries(Object.entries(given.values ?? {}).filter(([, value]) => ok(value)).map(([key, value]) => [key, Math.round(value)]));
  if (!labels.some((value) => value !== null) && !Object.keys(values).length) return null;
  return { ...(labels.some((value) => value !== null) ? { labels } : {}), ...(Object.keys(values).length ? { values } : {}) };
}

/** A field's name on an axis chip: "Invoice date (Month)". */
export function pivotAxisLabel(item: PivotAxisItem, field: PivotField | undefined): string {
  const name = field?.label ?? item.field;
  if (field?.kind !== 'date' || !item.dateGroup || item.dateGroup === 'day') return name;
  const group = { year: 'Year', fy: 'FY', quarter: 'Quarter', month: 'Month' }[item.dateGroup];
  return `${name} (${group})`;
}

/** The area a field goes to when its box is ticked: numbers to Values, others to Rows. */
export function pivotDefaultArea(field: PivotField): PivotArea {
  return field.kind === 'number' || field.calc ? 'values' : 'rows';
}

/** A date starts grouped by month, as Excel groups dates. */
function axisItem(field: PivotField): PivotAxisItem {
  return field.kind === 'date' ? { field: field.id, dateGroup: 'month' } : { field: field.id };
}

function valueItem(field: PivotField): PivotValueItem {
  return { field: field.id, aggregate: field.kind === 'number' ? 'sum' : 'count' };
}

const AXES: PivotAxisArea[] = ['rows', 'columns', 'filters'];

/** Rows, Columns and Filters hold a field once between them; Values may repeat it. */
export function pivotAreaOf(layout: PivotLayout, fieldId: string): PivotAxisArea | null {
  return AXES.find((area) => layout[area].some((item) => item.field === fieldId)) ?? null;
}

export function pivotUsesField(layout: PivotLayout, fieldId: string): boolean {
  return pivotAreaOf(layout, fieldId) !== null || layout.values.some((item) => item.field === fieldId);
}

function clampIndex(index: number | undefined, length: number): number {
  return index === undefined || index < 0 || index > length ? length : index;
}

/** A copy with a field put into an area at `index` (default: the end), taken out of the other axes. */
export function pivotAddField(layout: PivotLayout, field: PivotField, area: PivotArea, index?: number): PivotLayout {
  // A calculated field is a figure: it goes to Values only.
  if (field.calc && area !== 'values') return layout;
  const next = clonePivotLayout(layout);
  if (area === 'values') {
    next.values.splice(clampIndex(index, next.values.length), 0, valueItem(field));
    return next;
  }
  let item = axisItem(field);
  for (const axis of AXES) {
    const at = next[axis].findIndex((entry) => entry.field === field.id);
    if (at < 0) continue;
    // Moving keeps the field's grouping, sort and filter.
    item = next[axis][at]!;
    next[axis].splice(at, 1);
    if (axis === area && index !== undefined && at < index) index -= 1;
  }
  next[area].splice(clampIndex(index, next[area].length), 0, item);
  return next;
}

/** A copy with the item at `from` moved to `to`. Between axes it keeps its settings; to or from Values it starts fresh. */
export function pivotMoveItem(
  layout: PivotLayout,
  from: { area: PivotArea; index: number },
  to: { area: PivotArea; index?: number },
  fields: ReadonlyMap<string, PivotField>,
): PivotLayout {
  const source = from.area === 'values' ? layout.values[from.index] : layout[from.area][from.index];
  const field = source ? fields.get(source.field) : undefined;
  if (!source || !field) return layout;
  if (from.area === to.area) {
    const next = clonePivotLayout(layout);
    const list = (from.area === 'values' ? next.values : next[from.area]) as unknown[];
    const [moved] = list.splice(from.index, 1);
    let index = clampIndex(to.index, list.length + 1);
    if (index > from.index) index -= 1;
    list.splice(Math.min(index, list.length), 0, moved);
    return next;
  }
  if (from.area !== 'values' && to.area !== 'values') {
    const next = clonePivotLayout(layout);
    const [moved] = next[from.area].splice(from.index, 1);
    next[to.area].splice(clampIndex(to.index, next[to.area].length), 0, moved!);
    return next;
  }
  // Values ⇄ an axis: a value item becomes a plain axis field and the other way round.
  const removed = pivotRemoveItem(layout, from.area, from.index);
  return pivotAddField(removed, field, to.area, to.index);
}

export function pivotRemoveItem(layout: PivotLayout, area: PivotArea, index: number): PivotLayout {
  const next = clonePivotLayout(layout);
  if (area === 'values') next.values.splice(index, 1);
  else next[area].splice(index, 1);
  return next;
}

/** Takes the field out of every area. */
export function pivotRemoveField(layout: PivotLayout, fieldId: string): PivotLayout {
  const next = clonePivotLayout(layout);
  for (const axis of AXES) next[axis] = next[axis].filter((item) => item.field !== fieldId);
  next.values = next.values.filter((item) => item.field !== fieldId);
  return next;
}

/** Rows become columns and columns rows. */
export function pivotSwapAxes(layout: PivotLayout): PivotLayout {
  const next = clonePivotLayout(layout);
  [next.rows, next.columns] = [next.columns, next.rows];
  return next;
}

export function clonePivotLayout(layout: PivotLayout): PivotLayout {
  return JSON.parse(JSON.stringify(layout)) as PivotLayout;
}

/** A starting layout: the hinted fields, else the first text field down and the first number summed. */
export function defaultPivotLayout(
  fields: readonly PivotField[],
  hint: { rows?: string[]; columns?: string[]; values?: string[] } = {},
): PivotLayout {
  const layout = emptyPivotLayout();
  const byId = new Map(fields.map((field) => [field.id, field]));
  const pick = (ids: string[] | undefined) => (ids ?? []).map((id) => byId.get(id)).filter((field): field is PivotField => Boolean(field));
  let rows = pick(hint.rows);
  let values = pick(hint.values);
  const columns = pick(hint.columns);
  if (!rows.length && !hint.rows) rows = fields.filter((field) => field.kind === 'text').slice(0, 1);
  if (!values.length && !hint.values) values = fields.filter((field) => field.kind === 'number').slice(0, 1);
  layout.rows = rows.map(axisItem);
  layout.columns = columns.map(axisItem);
  layout.values = values.map(valueItem);
  return layout;
}

const AGGREGATES = new Set<string>(PIVOT_AGGREGATES.map((entry) => entry.id));

function cleanAxis(raw: unknown, fields: ReadonlyMap<string, PivotField>, seen: Set<string>, area: PivotAxisArea): PivotAxisItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PivotAxisItem[] = [];
  for (const entry of raw as Partial<PivotAxisItem>[]) {
    const id = typeof entry?.field === 'string' ? entry.field : '';
    const field = fields.get(id);
    if (!field || seen.has(id)) continue;
    seen.add(id);
    const item: PivotAxisItem = { field: id };
    if (field.kind === 'date' && typeof entry.dateGroup === 'string') item.dateGroup = entry.dateGroup;
    if (typeof entry.sort === 'string') item.sort = entry.sort;
    if (Array.isArray(entry.exclude) && entry.exclude.length) item.exclude = entry.exclude.filter((key): key is string => typeof key === 'string');
    const label = cleanPivotLabel(entry.label);
    if (label) item.label = label;
    // Value rules read the figures of Rows and Columns; a Filters field has none.
    if (area !== 'filters') {
      const valueFilters = cleanPivotValueFilters(entry.valueFilters);
      if (valueFilters.length) item.valueFilters = valueFilters;
      const top = cleanPivotTop(entry.top);
      if (top) item.top = top;
    }
    out.push(item);
  }
  return out;
}

/**
 * A saved layout made safe for the fields the page has now: unknown fields dropped.
 * Also reads the older `{ groupBy, splitBy, valueField, aggregate }` panel setting.
 */
/**
 * Every field a layout uses, on any area, once each: what the pivot's rows must carry. A calculated
 * field in Values stands for the fields its formula reads.
 */
export function pivotLayoutFields(layout: PivotLayout): string[] {
  const calcs = new Map((layout.calculated ?? []).map((calc) => [calc.id, calc.refs]));
  return [...new Set([...layout.filters, ...layout.columns, ...layout.rows, ...layout.values].flatMap((item) => calcs.get(item.field) ?? [item.field]))];
}

export function normalizePivotLayout(raw: unknown, fields: readonly PivotField[]): PivotLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const saved = raw as Record<string, unknown>;
  if ('groupBy' in saved || 'valueField' in saved) {
    const split = (text: unknown) => (typeof text === 'string' ? text.split(',').map((part) => part.trim()).filter(Boolean) : []);
    const layout = defaultPivotLayout(fields, { rows: split(saved.groupBy), columns: split(saved.splitBy), values: split(saved.valueField) });
    const aggregate = saved.aggregate;
    if (typeof aggregate === 'string' && AGGREGATES.has(aggregate)) layout.values.forEach((item) => (item.aggregate = aggregate as PivotAggregate));
    return layout;
  }
  const source = (saved.layout && typeof saved.layout === 'object' ? saved.layout : saved) as Partial<PivotLayout>;
  const seen = new Set<string>();
  const layout = emptyPivotLayout();
  // Calculated fields come with the layout; Values may name them, the axes may not.
  const calculated = cleanPivotCalcs(source.calculated);
  if (calculated.length) layout.calculated = calculated;
  const calcIds = new Set(calculated.map((calc) => calc.id));
  layout.rows = cleanAxis(source.rows, byId, seen, 'rows');
  layout.columns = cleanAxis(source.columns, byId, seen, 'columns');
  layout.filters = cleanAxis(source.filters, byId, seen, 'filters');
  layout.values = (Array.isArray(source.values) ? source.values : [])
    .filter((item) => (byId.has(item?.field) || calcIds.has(item?.field)) && AGGREGATES.has(item?.aggregate))
    .map((item) => {
      const value: PivotValueItem = { field: item.field, aggregate: item.aggregate };
      if (item.showAs && item.showAs !== 'value') value.showAs = item.showAs;
      if (item.heat) value.heat = true;
      const highlight = cleanPivotCondition(item.highlight);
      if (highlight) value.highlight = highlight;
      return value;
    });
  if (source.form === 'tabular') layout.form = 'tabular';
  if (source.subtotals === false) layout.subtotals = false;
  if (source.rowTotals === false) layout.rowTotals = false;
  if (source.columnTotals === false) layout.columnTotals = false;
  const widths = cleanWidths(source.widths);
  if (widths) layout.widths = widths;
  return layout;
}
