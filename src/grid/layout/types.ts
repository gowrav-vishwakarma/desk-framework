import type { DeskDecimalKind, DeskMoneyFrom, DeskMoneyView } from '../../currency/money';

/**
 * Grid layouts a user designs from a field catalog. Everything here is plain JSON and knows
 * nothing about the backend. The page's adapter turns `DeskGridQueryState` into its own request.
 */

export type DeskFieldType = 'text' | 'number' | 'currency' | 'date' | 'boolean';

export interface DeskCatalogRelation {
  /** Dot path of the relation in a response row: `brand`, `branchLinks`, `branchLinks.branch`. */
  path: string;
  label: string;
  /** A child collection. The designer shows it as a list part. */
  many?: boolean;
  /** For `many`: the default and the upper bound of items shown per row. */
  maxItems?: number;
  /** Adapter data. The framework hands it back untouched. */
  meta?: Record<string, unknown>;
}

/** One allowed value of a field with a fixed set, such as a database enum. */
export interface DeskFieldOption {
  value: string;
  label: string;
}

export interface DeskCatalogField {
  /** Dot path of the value in a response row: `sku`, `brand.brandName`, `aliases.alias`. */
  key: string;
  label: string;
  type: DeskFieldType;
  /**
   * The only values the field takes (a database enum). A filter on it picks from these, and the
   * adapter compares exactly; a contains search would fail on an enum column.
   */
  options?: readonly DeskFieldOption[];
  /** How to filter when the stored type differs from how the cell shows it (a number shown as text). */
  filterAs?: DeskFieldType;
  /** Name looked up in the page's formatters. */
  format?: string;
  /** Defaults to true. Always false under a `many` relation. */
  sortable?: boolean;
  /** Defaults to true, and to false under a `many` relation. */
  filterable?: boolean;
  /**
   * Drawn by a formatter from other values on the row. The adapter does not select this key.
   */
  virtual?: boolean;
  /**
   * For a `currency` field: row keys that hold its currency and rate, such as
   * `{ code: 'currency', rate: 'conversionRate' }`. Keys are relative to the row. Without it the
   * amount is in the company currency.
   */
  moneyFrom?: DeskMoneyFrom;
  /** For a `number` field: `qty`, `money`, or a place count. Pads and keeps extra saved digits. */
  decimals?: DeskDecimalKind;
  meta?: Record<string, unknown>;
}

export interface DeskFieldCatalog {
  relations: DeskCatalogRelation[];
  fields: DeskCatalogField[];
  /** Keys every request needs whatever is on screen: the row id, and fields actions read. */
  always: string[];
  /**
   * Columns every designed layout keeps as written: the user cannot move, edit, hide, or remove
   * them. `pin` puts them before or after the user's columns (default `start`).
   */
  locked?: DeskLockedColumn[];
}

export interface DeskLockedColumn extends DeskLayoutColumn {
  pin?: 'start' | 'end';
}

export type DeskFieldFormatter = (value: unknown, row: Record<string, unknown>) => string;
export type DeskFieldFormatters = Record<string, DeskFieldFormatter>;

export type DeskListShow = 'comma' | 'space' | 'lines' | 'table';

export interface DeskListPart {
  /** Path of a `many` relation. */
  list: string;
  /** Field keys under that relation, full paths. */
  fields: string[];
  show: DeskListShow;
  max: number;
  /** Shown before the list. Empty means the values only. */
  label?: string;
}

export type DeskPartLook = 'text' | 'chip' | 'box';
export type DeskPartTone = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
export type DeskPartSize = 'small' | 'normal' | 'large';
export type DeskPartPlace = 'left' | 'right';
export type DeskStyleOp = 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'empty';

/** Padding around one field, in pixels. A missing side uses `DESK_FIELD_PAD`. */
export interface DeskPartPad {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Applied when a field does not set its own padding. */
export const DESK_FIELD_PAD: Required<DeskPartPad> = { top: 1, right: 4, bottom: 1, left: 4 };

/** How one field is drawn. Omitted fields keep the cell's normal text. */
export interface DeskPartStyle {
  look?: DeskPartLook;
  tone?: DeskPartTone;
  size?: DeskPartSize;
  bold?: boolean;
  /** Where the field sits on its line. `right` pushes it to the end, so another field can stay on the left. */
  place?: DeskPartPlace;
  pad?: DeskPartPad;
}

/** One side of a saved comparison. A missing left side is this field. A missing right side uses `value`. */
export type DeskRuleTerm = { field: string } | { number: number } | { text: string };

/**
 * First matching rule replaces that row's look, color, and bold.
 * `when` is a condition such as `mrp > sellingPrice * 2`. A rule with only `op` and `value` still means this field.
 */
export interface DeskStyleRule {
  /** Condition. Names are catalog fields. Parsed, never evaluated as code. */
  when?: string;
  /** Legacy comparison, used when `when` is omitted. */
  op?: DeskStyleOp;
  /** Compared value. Omitted means this field. */
  left?: DeskRuleTerm;
  /** Compared against. Omitted means `value`. */
  right?: DeskRuleTerm;
  /** What the user compares against when `right` is omitted. Empty for `empty`. */
  value?: string;
  look?: DeskPartLook;
  tone?: DeskPartTone;
  bold?: boolean;
}

/** A catalog field with an optional label and look. A bare string is the same field with neither. */
export interface DeskFieldPart {
  field: string;
  /** Shown before the value. Empty means the value only. */
  label?: string;
  style?: DeskPartStyle;
  rules?: DeskStyleRule[];
}

/** A field key, a labeled field, or a child list. */
export type DeskCellPart = string | DeskFieldPart | DeskListPart;

export function isListPart(part: DeskCellPart): part is DeskListPart {
  return typeof part === 'object' && 'list' in part;
}

export function isFieldPart(part: DeskCellPart): part is DeskFieldPart {
  return typeof part === 'object' && 'field' in part;
}

/** The catalog key a single-value part reads. Null for a child list. */
export function partFieldKey(part: DeskCellPart): string | null {
  if (typeof part === 'string') return part;
  if (isFieldPart(part)) return part.field;
  return null;
}

export interface DeskLayoutColumn {
  id: string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  /** Outer array is stacked lines; inner array is the parts on one line. */
  lines: DeskCellPart[][];
  /** Between parts on one line. Defaults to a space. */
  separator?: string;
  sortField?: string | null;
  filterField?: string | null;
  /**
   * How currency fields in this column read: which amount is on top, symbols, and the second
   * line for another currency. Missing parts follow the browser preference.
   */
  money?: DeskMoneyView;
  /** Off the grid until the user shows it. It can still be filtered and sorted on. */
  hidden?: boolean;
  /**
   * Extra lines may run into the empty cells below, where the page allows it (`DeskGrid spillRows`,
   * such as a group head's detail lines), instead of making the row taller.
   */
  spill?: boolean;
  /** A value equal to the row above: hidden or dimmed. See `DeskColumn.repeats`. */
  repeats?: 'hide' | 'dim';
}

export type DeskGridLayoutKind = 'menu' | 'tab';

/** Sort and filters a layout starts with when it opens. The user can change them afterwards. */
export interface DeskGridLayoutView {
  /** Column id from this layout, plus the direction. One sort only. */
  sort?: { column: string; direction: 'asc' | 'desc' };
  /** Column id to filter text, in the syntax the filter box uses. */
  filters?: Record<string, string>;
  /**
   * Filter-panel values the page opens with, for a page that filters through `DeskFilterPanel`
   * instead of (or as well as) column boxes. Stored as `freezeDeskFilter` wrote them.
   */
  panel?: Record<string, unknown>;
  /** Page toggles, such as showing zero amounts. The page decides the keys. */
  options?: Record<string, boolean>;
}

export interface DeskGridLayout {
  id: string;
  name: string;
  kind: DeskGridLayoutKind;
  columns: DeskLayoutColumn[];
  view?: DeskGridLayoutView;
  /** Hides the row actions column. Ignored on Default. */
  hideActions?: boolean;
  /** Plain text shown above the grid, such as what a color rule means. */
  note?: string;
}

export const DESK_LAYOUT_NOTE_MAX = 500;

/** What the list needs, in catalog terms. */
export interface DeskFieldSelection {
  /** Field names at this level. */
  fields: string[];
  /** Keyed by the next path segment. */
  relations: Record<string, DeskFieldSelection>;
  /** A child collection. Load it apart from the page query, for the page's ids. */
  many?: boolean;
  /** For `many`: items per parent. */
  limit?: number;
}

export interface DeskGridQuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface DeskGridQueryFilter {
  field: string;
  type: DeskFieldType;
  /** What the user typed in the filter box. The adapter parses it. */
  text: string;
}

export interface DeskGridQueryState {
  /** Active layout id; `default` is the developer's columns. */
  layoutId: string;
  selection: DeskFieldSelection;
  /** Null is the adapter's default order. */
  sort: DeskGridQuerySort | null;
  filters: DeskGridQueryFilter[];
}

/** What one grid column means in catalog terms. */
export interface DeskColumnQueryInfo {
  /** Every field the cell reads, with a per-parent limit for list fields. */
  uses: DeskFieldUse[];
  sortField: string | null;
  filterField: string | null;
  filterType: DeskFieldType;
  /** The filter field's fixed values, when it has them. */
  filterOptions?: readonly DeskFieldOption[];
}

export interface DeskFieldUse {
  key: string;
  limit?: number;
}

/** What the grid footer's layout menu lists. */
export interface DeskGridLayoutMenuState {
  active: string;
  /** The user has saved an edit of the shipped Default layout. */
  defaultOverridden: boolean;
  items: { id: string; name: string; kind: DeskGridLayoutKind | 'default' }[];
  /**
   * Set when the page can save its current filters into a layout. `modified`: what is on screen
   * differs from what the active layout saved.
   */
  view?: { modified: boolean };
}

export type DeskGridLayoutCommand =
  | { action: 'select'; id: string }
  | { action: 'new' }
  | { action: 'edit' }
  | { action: 'duplicate' }
  | { action: 'delete' }
  | { action: 'reset' }
  /** Save what the page shows now (filters, toggles) into the active layout. */
  | { action: 'save-view' }
  /** Go back to what the active layout saved. */
  | { action: 'reset-view' }
  /** Open the designer on a new tab that starts with what the page shows now. */
  | { action: 'new-from-view' };

export const DESK_DEFAULT_LAYOUT_ID = 'default';
export const DESK_LIST_MAX_ITEMS = 5;
