/**
 * Selectors for the DOM the framework stamps on every registered node (`data-desk-node`, `data-desk-path`).
 * They are plain CSS strings, so they work with Playwright's `page.locator`, Testing Library and `querySelector`.
 */
export const deskLocators = {
  /** The element a node draws, by full or short path: `deskLocators.node('form:account/field:name')`. */
  node: (path: string): string => `[data-desk-path="${path}"], [data-desk-path$="/${path}"]`,
  /** Every node of one kind: `deskLocators.kind('dialog')`. */
  kind: (kind: string): string => `[data-desk-node^="${kind}:"]`,
  /** The control inside a field node: the input, select or button the user types into. */
  control: (path: string): string => `${deskLocators.node(path)} [data-desk-field], ${deskLocators.node(path)} input, ${deskLocators.node(path)} textarea`,
  /** A layer such as a dialog drawn on top. */
  topLayer: '[data-desk-layer]:last-of-type',
  /** A tab button and its pane. */
  tab: (id: string): string => `[data-desk-tab="${id}"]`,
  pane: (id: string): string => `[data-desk-pane="${id}"]`,
  /** A pivot well (`filters`, `columns`, `rows`, `values`). */
  pivotWell: (area: string): string => `[data-desk-pivot-well="${area}"]`,
  /** A control by its stable id, as the page names it (`data-desk-field`). */
  field: (id: string): string => `[data-desk-field="${id}"]`,
  /** A row's action button by action name (`edit`, `delete`, `deactivateCharge`), inside that row. */
  rowAction: (name: string): string => `[data-desk-action="${name}"]`,
  /** A row's "More actions" (⋮) button, inside that row. */
  rowMore: '.desk-row-actions-more',
  /** An item of the open context menu by its id. */
  menuItem: (id: string): string => `.desk-context-menu [data-desk-menu-item="${id}"]`,
  /** A `DeskMenuBar`'s top buttons (inside the bar's container). */
  menuBarTop: '.desk-menu-item > button',
  /** A grid row (body) and the text of its cells. */
  gridRow: 'tbody tr',
  /** A grid cell by row index and column id (`data-cell` starts with the row, `data-col` is the column). */
  gridCell: (row: number, column: string): string => `td[data-col="${column}"][data-cell^="${row}-"]`,
  /** A column's filter box in the grid's filter row. */
  filterCell: (column: string): string => `td[data-filter="${column}"]`,
  /** The highlighted row of an open lookup list. */
  lookupActive: '.desk-suggest tr.hit.active',
  cellValue: '.desk-cell-value',
  /** A page toolbar button by its id (`form-layout`). */
  toolbar: (id: string): string => `[data-desk-toolbar="${id}"]`,
  /** A choice in the open list of a form layout option (the designer's select). */
  layoutChoice: '.desk-designer-menu button',
} as const;
