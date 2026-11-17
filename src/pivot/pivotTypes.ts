import type { PivotCalcField } from './pivotCalc';

/** A pivot works on plain rows (facts): every field is a key of the row. */
export type PivotFieldKind = 'text' | 'number' | 'date';

export type PivotAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct';

/** How a date field is bucketed on an axis. `fy` and `quarter` follow the financial year. */
export type PivotDateGroup = 'year' | 'fy' | 'quarter' | 'month' | 'day';

/** What a value cell shows: the figure, or its share of a total. */
export type PivotShowAs = 'value' | 'pctGrand' | 'pctColumn' | 'pctRow' | 'pctParent';

/** Item order on an axis: by label, or by the first value's total. */
export type PivotSort = 'asc' | 'desc' | 'valueDesc' | 'valueAsc';

export type PivotArea = 'filters' | 'columns' | 'rows' | 'values';

export type PivotChartType = 'bar' | 'stacked' | 'line' | 'pie';

export interface PivotField {
  id: string;
  label: string;
  kind: PivotFieldKind;
  /** Text for one raw value: a label on an axis, or an aggregated figure in a value cell. */
  format?: ((value: unknown) => string) | undefined;
  /** A calculated field (`pivotCalc.ts`): Values only, worked out from other fields' sums. */
  calc?: boolean | undefined;
}

export type PivotCompare = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'between' | 'notBetween' | 'blank' | 'notBlank';

/** One test on a figure. Shared by value filters and highlighting. */
export interface PivotCondition {
  op: PivotCompare;
  a?: number | undefined;
  /** `between` and `notBetween` only. */
  b?: number | undefined;
  /** Compare the figure's absolute value. */
  abs?: boolean | undefined;
}

/** Keep an axis item only when its figure meets the condition. */
export interface PivotValueFilter extends PivotCondition {
  /** The value it reads, by `pivotValueKey` ("account:count"), so it survives reordering Values. */
  value: string;
  /** total: the item's total. cells: its cells across the other axis' leaf items. */
  of: 'total' | 'cells';
  /** With cells: how many cells must pass. */
  match?: 'any' | 'all' | 'none' | 'atLeast' | undefined;
  /** `atLeast` only. */
  n?: number | undefined;
  /** With cells: only these leaf items of the other axis (node ids). Empty means all of them. */
  among?: string[] | undefined;
}

/** Top or bottom items among their siblings, ranked by a value's total. */
export interface PivotTopFilter {
  value: string;
  dir: 'top' | 'bottom';
  /** items: N items. percent: N% of the items. share: items whose running total reaches N% of the total. */
  by: 'items' | 'percent' | 'share';
  n: number;
}

export interface PivotLabelRule {
  op: 'contains' | 'notContains' | 'begins' | 'ends' | 'equals' | 'notEquals';
  text: string;
}

/** A field on Rows, Columns or Filters. */
export interface PivotAxisItem {
  field: string;
  dateGroup?: PivotDateGroup | undefined;
  sort?: PivotSort | undefined;
  /** Item keys left out, as in Excel's unticked filter values. */
  exclude?: string[] | undefined;
  /** Keep only items whose label passes. */
  label?: PivotLabelRule | undefined;
  /** Rows and Columns only. All must pass. */
  valueFilters?: PivotValueFilter[] | undefined;
  /** Rows and Columns only. */
  top?: PivotTopFilter | undefined;
}

/** A field on Values. The same field may be there twice with different functions. */
export interface PivotValueItem {
  field: string;
  aggregate: PivotAggregate;
  showAs?: PivotShowAs | undefined;
  /** Shade cells by size, as a colour scale. */
  heat?: boolean | undefined;
  /** Mark the cells of this value that meet the condition. */
  highlight?: PivotCondition | undefined;
}

export interface PivotLayout {
  rows: PivotAxisItem[];
  columns: PivotAxisItem[];
  filters: PivotAxisItem[];
  values: PivotValueItem[];
  /** Compact: one indented label column. Tabular: one column per row field. */
  form: 'compact' | 'tabular';
  subtotals: boolean;
  /** Grand total row at the bottom. */
  rowTotals: boolean;
  /** Grand total column on the right. */
  columnTotals: boolean;
  /** Formulas over other fields' sums, usable in Values. */
  calculated?: PivotCalcField[] | undefined;
  /** Widths the user dragged, in px; the rest fit their figures. */
  widths?: PivotWidths | undefined;
}

/**
 * Column widths: each label level (one in compact form, one per row field in tabular form), and
 * each value's columns by `pivotValueKey`, all of one value's columns alike.
 */
export interface PivotWidths {
  labels?: (number | null)[] | undefined;
  values?: Record<string, number> | undefined;
}

export const PIVOT_AGGREGATES: readonly { id: PivotAggregate; label: string }[] = [
  { id: 'sum', label: 'Sum' },
  { id: 'count', label: 'Count' },
  { id: 'avg', label: 'Average' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
  { id: 'distinct', label: 'Distinct count' },
];

export const PIVOT_SHOW_AS: readonly { id: PivotShowAs; label: string }[] = [
  { id: 'value', label: 'The value' },
  { id: 'pctGrand', label: '% of grand total' },
  { id: 'pctColumn', label: '% of column total' },
  { id: 'pctRow', label: '% of row total' },
  { id: 'pctParent', label: '% of parent row' },
];

export const PIVOT_DATE_GROUPS: readonly { id: PivotDateGroup; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'fy', label: 'Financial year' },
  { id: 'year', label: 'Calendar year' },
];

export const PIVOT_SORTS: readonly { id: PivotSort; label: string }[] = [
  { id: 'asc', label: 'A to Z' },
  { id: 'desc', label: 'Z to A' },
  { id: 'valueDesc', label: 'Largest value first' },
  { id: 'valueAsc', label: 'Smallest value first' },
];

export const PIVOT_AREAS: readonly { id: PivotArea; label: string }[] = [
  { id: 'filters', label: 'Filters' },
  { id: 'columns', label: 'Columns' },
  { id: 'rows', label: 'Rows' },
  { id: 'values', label: 'Values' },
];
