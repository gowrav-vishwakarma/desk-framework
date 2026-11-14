import type { DeskDecimalKind, DeskMoneyFrom, DeskMoneyView } from '../currency/money';
import type { DeskFieldMenu } from '../menu/fieldMenu';
import type { Component } from 'vue';
import type { DeskPageResultMode } from '../page/openDeskPage';
import type { DeskPageSaved } from '../page/pageContext';

export type DeskGridMode = 'entry' | 'list' | 'report';
export type DeskAlign = 'left' | 'right' | 'center';
export type DeskEditorKind = 'text' | 'number' | 'date' | 'select' | 'lookup' | 'check' | 'currency';
export type DeskSummary = 'sum' | 'avg' | 'count' | 'min' | 'max';
/** Colour of a total or a figure: green, blue, yellow, orange, red. */
export type DeskTone = 'success' | 'info' | 'warning' | 'alert' | 'danger';

export interface DeskSelectOption {
  label: string;
  value: string;
}

/** A currency the form control stores. The factor is 1 for the company currency. */
export interface DeskCurrencyValue {
  id?: number | null;
  code: string;
  name?: string;
  symbol?: string | null;
  currencyRate?: number | null;
}

/** Currency and conversion factor for an amount cell. Omit to use the company currency. */
export interface DeskMoney {
  code?: string | null;
  rate?: number | string | null;
  /** Currency id, when the host compares by id. */
  id?: string | number | null;
  /** Symbol for this currency. Without it the browser's symbol for the code is used. */
  symbol?: string | null;
}

export interface DeskLookupColumn {
  id: string;
  header: string;
  field: string;
}

/**
 * A page that creates or edits what a lookup lists. The lookup opens it in a dialog with the
 * preset's New and Edit keys (`action-new`, `action-edit`), and picks the row the save returns.
 */
export interface DeskLookupEditor {
  /** Loads the page. The page reads its parameters and reports its save through `useDeskPage`. */
  page: () => Promise<Component | { default: Component }>;
  title?: (mode: 'new' | 'edit') => string;
  /** Parameters for a new record. `typed` is the text in the box. Defaults to none. */
  create?: (typed: string) => Record<string, string>;
  /**
   * Parameters for the record that is picked. `picked` is the row chosen here, or null when the value
   * came from the page. Return null when there is nothing to edit. Defaults to `{ id }` from the picked row.
   */
  edit?: (picked: Record<string, unknown> | null) => Record<string, string> | null;
  /** Which part of the save `toRow` receives. Defaults to the API response. */
  result?: DeskPageResultMode;
  /** Turn the save into a lookup row. Return null to pick nothing. */
  toRow: (saved: DeskPageSaved) => Record<string, unknown> | null;
}

/**
 * What the lookup box needs to draw and run. How a query reaches data is the host's business:
 * `fetch` answers it directly, and a host adds its own fields by extending this type and
 * answering through `configureDesk({ searchLookup })`.
 */
export interface DeskLookupConfig {
  labelKey: string;
  valueKey: string;
  columns: DeskLookupColumn[];
  /** Characters before a search runs. Defaults to 1. Zero lists the filtered set immediately. */
  minChars?: number;
  /**
   * Enter on a resting cell opens this list. Omit to leave the choice to the column.
   * A column's `opensOnEnter` wins when both are set.
   */
  opensOnEnter?: boolean;
  /**
   * Right-click menu for this lookup. `groups` is read when the menu draws and when a search
   * is sent, so it must read current state. Lookups without one keep the browser menu.
   */
  menu?: DeskFieldMenu;
  /** When set, this search answers the lookup and the host's `searchLookup` is not called. */
  fetch?: (query: string) => Promise<Record<string, unknown>[]>;
  /**
   * Enter with nothing picked keeps the typed text.
   * The column `commit` receives a null record. Used for a value that does not exist yet.
   */
  acceptTyped?: boolean;
  /** Puts "---" first. Choosing it stores null. A column's `blank` does the same for a grid cell. */
  blank?: boolean;
  /**
   * Empty focus and the search mark. Omit to search when `minChars` is 0.
   * Return false to wait until the user types.
   */
  browseOnFocus?: () => boolean;
  /** Rows to show before a search, such as recent or cached picks. May read them asynchronously. */
  localRows?: () => readonly Record<string, unknown>[] | Promise<readonly Record<string, unknown>[]>;
  /** A row was chosen. A blank row is not reported. */
  onPick?: (row: Record<string, unknown>) => void;
  /** Create or edit the listed record in a dialog. Adds the New and Edit keys to this lookup. */
  editor?: DeskLookupEditor;
  /** A star column. The host stores starred rows; the box asks for keys when the list opens. */
  star?: {
    keys: () => Promise<ReadonlySet<string>>;
    toggle: (row: Record<string, unknown>, on: boolean) => Promise<void>;
  };
}

/** What a dialog column's `when` function is asked. */
export interface DeskDialogWhenContext<T extends Record<string, unknown> = Record<string, unknown>> {
  row: T;
  rowIndex: number;
  /** The committed value differs from the value when editing started. False when the cell was not being edited. */
  changed: boolean;
}

/**
 * When Enter opens a dialog cell.
 * `always` (the default) opens every time. `change` opens after the value changes.
 * A function opens when it returns true, so the column can look at this cell or any other field on the row.
 * `never` stays closed on Enter. The open-dialog shortcut still opens it.
 */
export type DeskDialogWhen<T extends Record<string, unknown> = Record<string, unknown>> =
  | 'always'
  | 'change'
  | 'never'
  | ((ctx: DeskDialogWhenContext<T>) => boolean);

/**
 * What Shift+Enter does when it lands on a dialog cell.
 * `select` (the default) only moves there. `when` asks that column's own `when`.
 */
export type DeskBackDialog = 'select' | 'when';

/** Where Enter goes after this cell. Defaults to the next cell on the right. */
export type DeskEnterTarget<T extends Record<string, unknown> = Record<string, unknown>> =
  | { type: 'cell'; columnId: string; rowDelta?: number }
  | {
      type: 'dialog';
      dialog: string;
      returnTo?: string;
      when?: DeskDialogWhen<T>;
      /** Shift+Enter landing on this cell. Omit to use the grid's `backDialog`. */
      back?: DeskBackDialog;
    };

export function isDeskDialogTarget<T extends Record<string, unknown> = Record<string, unknown>>(
  enter: DeskEnterTarget<T>,
): enter is Extract<DeskEnterTarget<T>, { type: 'dialog' }> {
  return enter.type === 'dialog';
}

/** What a page's `@next-focus` sees when Enter leaves a cell. */
export interface DeskNextFocusContext<T extends Record<string, unknown> = Record<string, unknown>> {
  row: T;
  rowIndex: number;
  column: DeskColumn<T>;
  /** The committed value differs from the value when editing started. False when the cell was not being edited. */
  changed: boolean;
  /** The open-dialog shortcut (Ctrl+Enter by default) was used. */
  force: boolean;
}

/**
 * Page decision for where Enter goes.
 * A target replaces the column's `enter`. `null` moves to the next cell. `undefined` keeps the column's `enter`.
 */
export type DeskNextFocus<T extends Record<string, unknown> = Record<string, unknown>> = (
  ctx: DeskNextFocusContext<T>,
) => DeskEnterTarget<T> | null | undefined;

/** How a list column is sent in the list-and-count `where` or `include`. */
export interface DeskColumnFilter {
  /** Root where key. Defaults to the column id. Association text uses `$alias.field$`. */
  field?: string;
  /** Put the search on this include alias instead of the root where. */
  includeAs?: string;
  /** Field inside that include. Defaults to `name`. */
  includeField?: string;
}

export type DeskSortDirection = 'ASC' | 'DESC';

/** How long cell text is shown when the column allows layout in the header menu. */
export type DeskColumnTextLayout = 'wrap' | 'clip' | 'ellipsis-end' | 'ellipsis-middle';

/** Explicit sort from the column header menu. Omitted on header click (toggle). */
export type DeskGridSortAction = 'asc' | 'desc' | 'clear';

/** A value read from an included model. Drives cell text, list filter and list sort. */
export interface DeskColumnRelation {
  model: string;
  as: string;
  field: string;
}

/** A read-only fact drawn under a cell value. `focus` is the drawer control a click opens. */
export interface DeskCellTag {
  id: string;
  text: string;
  tone: 'applied' | 'hint' | 'warn';
  focus: string;
}

export interface DeskColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  header: string;
  group?: string;
  width?: number;
  align?: DeskAlign;
  type?: DeskEditorKind;
  format?: (value: unknown, row: T) => string;
  summary?: DeskSummary;
  editor?: DeskEditorKind;
  readonly?: boolean | ((row: T) => boolean);
  visible?: () => boolean;
  /**
   * Fixed at the left or right when the grid allows column reorder.
   * Order within each pin zone follows the column definition in `columns`.
   */
  pin?: 'start' | 'end';
  /**
   * List header menu: sort ascending / descending / clear. Default allows sort in list mode.
   * Set false on columns that must not drive server order (e.g. computed display only).
   */
  sortable?: boolean;
  /**
   * List header menu: wrap, clip, or ellipsis for cell text. Saved under `grid-text-layout:` with `storageKey`.
   */
  /** Extra lines may draw into the free rows below (`DeskGrid spillRows`) instead of growing the row. */
  spill?: boolean;
  /** Secondary detail: drawn dimmer so the eye lands on the main columns first. */
  quiet?: boolean;
  /**
   * A value equal to the row above: `hide` leaves the cell blank, `dim` draws it quiet. Columns
   * chain left to right, so when an earlier such column changes, this one shows again. The row
   * where the leftmost such column changes starts a block and gets a stronger line above it.
   */
  repeats?: 'hide' | 'dim';
  /** A zero value: `dim` draws it faint, `hide` leaves the cell blank. Copy and export keep it. */
  zeros?: 'dim' | 'hide';
  /** Colour of this column's total in the summary line. */
  tone?: DeskTone;
  /** Colour of one cell from its row, such as red for a negative profit. Nothing keeps the usual colour. */
  cellTone?: (row: T) => DeskTone | null | undefined;
  textLayoutMenu?: boolean;
  /**
   * Starts hidden. The column picker can still show it, and that choice is saved under
   * `grid-shown:` with `storageKey`. Used for a column that is there to filter or sort on.
   */
  defaultHidden?: boolean;
  /** The column filters on a field with fixed values: its header filter is a pick list of these. */
  filterChoices?: readonly { value: string; label: string }[];
  /** Starting text layout before the user picks one. Defaults to end ellipsis. */
  defaultTextLayout?: DeskColumnTextLayout;
  /** A function is called for the row being edited, so each line can have its own list. */
  options?: DeskSelectOption[] | ((row: T) => DeskSelectOption[]);
  /** A function is called for the row being edited, so each line can search its own list. */
  lookup?: DeskLookupConfig | ((row: T) => DeskLookupConfig);
  /**
   * The same checkbox list as a chips setting in a filter panel. Chosen rows stay on top and
   * checked. Enter toggles one and keeps the list open. Tab finishes.
   */
  multiple?: boolean;
  /** Rows already chosen, for a `multiple` lookup. */
  selected?: (row: T) => readonly Record<string, unknown>[];
  /**
   * Currency of a `currency` amount cell. A function is asked for the row.
   * Same as the company currency shows one amount. A different code shows that amount
   * and the company amount (amount × rate) under it.
   */
  money?: DeskMoney | ((row: T) => DeskMoney);
  /** Row keys for the currency, when `money` is not given: `{ code: 'currency', rate: 'conversionRate' }`. */
  moneyFrom?: DeskMoneyFrom;
  /** Which amount is on top, symbols, and the second line for a currency column. See `DeskMoneyView`. */
  moneyView?: DeskMoneyView;
  /**
   * Decimal places for a number column: `qty`, `money`, or a count. The cell pads to it and keeps
   * extra saved digits. Without it a number shows as stored. Currency columns use `money`.
   */
  decimals?: DeskDecimalKind;
  /**
   * What Enter does on a resting lookup, select, or check.
   * `true` opens the list. `false` leaves the cell and moves to the next one.
   * A function is asked for the row under the cursor, so two rows of one column can differ.
   * When omitted, a select or check opens, and a lookup opens only when its own config says so.
   */
  opensOnEnter?: boolean | ((row: T) => boolean);
  /** Moving onto this cell opens its editor. A lookup then shows its list without another Enter. */
  openOnFocus?: boolean;
  /** Puts "---" first on a select, or on this cell's lookup. Choosing it stores null. */
  blank?: boolean;
  /**
   * Right-click menu while this cell is edited. A date or lookup cell shows its own default
   * groups first. A cell with no menu keeps the browser's.
   */
  menu?: DeskFieldMenu;
  /**
   * Where focus goes after "---". `next` is the normal Enter move. `exit` leaves the grid.
   * A function sees the row after the cell was cleared.
   */
  afterBlank?: 'next' | 'exit' | ((row: T) => 'next' | 'exit');
  /**
   * Writes the edit onto the row. When set, the grid does not store the column id
   * or a companion `${id}Id`. The column decides which real fields change.
   */
  commit?: (row: T, text: string, record?: Record<string, unknown> | null) => void;
  /**
   * Row field that holds this lookup's id when `commit` does not write `${id}Id`.
   * Edit on a resting cell reads it.
   */
  lookupId?: string;
  enter?: DeskEnterTarget<T>;
  /** Server filter for list mode. Omitted columns filter on their own id with `$iLike`. */
  filter?: DeskColumnFilter;
  /** Included model for display, filter and sort. Overrides `filter` / sort when those are omitted. */
  relation?: DeskColumnRelation;
  /** Simple sort column when it is not the column id. */
  sortField?: string;
  /** Sequelize `order` entry for an association, including direction. */
  sortOrder?: (direction: DeskSortDirection) => unknown;
  /** Row span for report body cells. 0 hides the cell (covered by a span above). */
  rowspan?: (row: T, rowIndex: number) => number;
  error?: (row: T) => string | null;
  /** Quiet line under the cell value, such as MRP under Rate. */
  caption?: (row: T) => string;
  /**
   * A row field drawn as a quiet second line under the value, such as the variant under a product.
   * Unlike `caption`, a grid layout keeps it: the Default layout gets it as a small muted second line.
   */
  captionField?: string;
  /** Tags under the cell value. The grid draws them and does not know what they mean. */
  detail?: (row: T) => DeskCellTag[];
  /** Full or partial selection mark on the right of the cell (link picker). */
  cellCheck?: (row: T) => 'full' | 'partial' | null;
  /** Stacked text lines and small tables drawn instead of value and caption. */
  blocks?: (row: T) => DeskCellBlock[];
  /** Text lines the cell takes, for the row height of a long list. Defaults to 1. */
  lineCount?: (row: T) => number;
  /** Row fields the cell reads, as dot paths. Defaults to the column id. */
  fields?: string[];
  /** Always shown: the column picker does not list it and a saved hidden choice is ignored. */
  locked?: boolean;
}

export type DeskCellBlock =
  | { kind: 'text'; text: string }
  | { kind: 'line'; spans: DeskCellSpan[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; more: number };

/** One styled piece of a layout cell line. */
export interface DeskCellSpan {
  text: string;
  look?: 'text' | 'chip' | 'box';
  tone?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'small' | 'normal' | 'large';
  bold?: boolean;
  place?: 'left' | 'right';
  /** Only the sides that differ from the default padding. */
  pad?: { top?: number; right?: number; bottom?: number; left?: number };
}

export interface DeskCursor {
  row: number;
  col: number;
}

export interface DeskRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface DeskGridRow extends Record<string, unknown> {
  id?: string | number;
}

/** A toggle in the grid corner menu. The page stores the checked state. */
export interface DeskGridOption {
  id: string;
  label: string;
  checked: boolean;
}

/** A named emphasis. `danger` and `warn` have framework colours. A host may use any other word. */
export type DeskActionTone = 'danger' | 'warn' | (string & {});

/** A row menu action. The host decides which actions exist and whether they are enabled. */
export type DeskRowActionDisplayMode = 'btngroup' | 'menu';

export interface DeskRowAction {
  name: string;
  label: string;
  disabled: boolean;
  /** Inline button or overflow menu. Defaults to `btngroup` when omitted. */
  displayMode?: DeskRowActionDisplayMode;
  /** Tooltip, such as why a disabled action cannot run. The label stays short. */
  title?: string;
  /** The active layout does not load a field this action needs. Shown disabled in light red. */
  missingData?: boolean;
  /** Adds `desk-tone-<tone>`. Themes colour it. */
  tone?: DeskActionTone;
  /** Extra classes from the host, added as given. */
  class?: string | string[];
}

/** What `<DeskGrid ref>` exposes to pages. */
export interface DeskGridApi {
  focusGrid(): void;
  focusEntry(): void;
  /** Cursor to row 0 and focus the grid, for example after a filter is applied. */
  focusFirstRow(): void;
  focusCell(rowIndex: number, columnId: string): void;
  moveTo(row: number, col: number, extend: boolean): Promise<void>;
  addRow(): void;
  /** Enter on the last cell of a row: next row, a new entry row, or out of the grid. */
  advanceRow(rowIndex: number): Promise<void>;
  currentRow(): DeskGridRow | null;
  /** Move to a row and focus one control in its drawer. */
  focusDrawer(rowIndex: number, fieldId: string): void;
  /** Focus the drawer cell to the right of this one on the current row. */
  focusDrawerAfter(fieldId: string): void;
  /** Focus a column on the current row. */
  focusColumn(columnId: string): void;
  /**
   * Leave the open drawer vertically.
   * `-1` returns to this item row. `1` moves to the next item row.
   * The column is the one under the drawer cell.
   */
  crossDrawer(dir: 1 | -1, fieldId: string): void;
}
