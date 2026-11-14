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
} as const;
