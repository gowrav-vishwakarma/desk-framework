import { expectOk } from './user';
import type { DeskClient } from './client';
import { deskLocators } from './locators';
import type { DeskUserPage } from './types';

/**
 * A row as the grid draws it. `cells` is keyed by the column id the page gave that column.
 * `index` is the row's place in the loaded list. `key` is whatever the page uses as the row id.
 */
export interface DeskShownRow {
  index?: number;
  key?: string;
  cells?: Record<string, { shown?: string; value?: unknown }>;
}

export interface DeskGridView {
  rowCount?: number;
  itemCount?: number | null;
  loading?: boolean;
  pageSize?: number;
  pageSizeChoice?: number | string | null;
  rows?: DeskShownRow[];
}

/** One action on a row, as the grid reports it. */
export interface DeskActionState {
  name: string;
  label?: string;
  enabled: boolean;
  reason?: string;
}

function gridPaths(children: string[]): string[] {
  return children.filter((child) => /(^|\/)grid:/.test(child));
}

/**
 * The grid under a node. With one grid, that grid. With several, pass `name` (`items` or `grid:items`).
 * Throws when there is no grid, or more than one and `name` is missing, so a spec does not bind the wrong list.
 */
export async function deskGrid(client: DeskClient, pick?: { within?: string; name?: string }): Promise<string> {
  const within = pick?.within ?? 'top';
  const described = await client.describe(within);
  const grids = gridPaths(described.children ?? []);
  const wanted = pick?.name;
  const named = wanted
    ? grids.filter((child) => child === wanted || child.endsWith(`/${wanted}`) || child.endsWith(`grid:${wanted}`))
    : grids;
  if (named.length === 1) return named[0]!;
  if (named.length === 0) {
    throw new Error(`no grid under ${within}. children: ${described.children.join(', ') || '(none)'}`);
  }
  throw new Error(`more than one grid under ${within}: ${named.join(', ')}. Pass { name }.`);
}

/** Shown text of one cell. The column id is the page's, not a fixed name. */
export function deskCellShown(row: DeskShownRow, column: string): string {
  return row.cells?.[column]?.shown ?? '';
}

/**
 * Set the footer page size. `size` must be one the grid offers (`20`, `50`, `'dynamic'`, `'all'`…).
 * A grid refuses a size it does not offer and names the ones it does.
 */
export async function deskPageSize(client: DeskClient, grid: string, size: number | 'dynamic' | 'infinite' | 'all'): Promise<void> {
  expectOk(await client.act(grid, 'pageSize', { size }), `page size ${String(size)} on ${grid}`);
  await client.waitIdle();
}

/** Wait until the grid has finished loading and is showing `expected` rows. */
export async function deskUntilRowCount(client: DeskClient, grid: string, expected: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let reported: number | null = null;
  while (Date.now() < deadline) {
    await client.waitIdle();
    const read = await client.read<DeskGridView>(grid);
    last = Number(read.rowCount);
    reported = typeof read.itemCount === 'number' ? read.itemCount : null;
    if (read.loading !== true && last === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const footer = reported === null ? '' : ` The list reports ${reported}.`;
  throw new Error(`the grid is showing ${last} rows; expected ${expected}.${footer}`);
}

/**
 * A list's rows against `total`: the paginator reports `total` (the server count) and a page of `pageSize` shows
 * `min(total, pageSize)` rows. Server lists page (the ops list bridge never reads them all), so the count is the check.
 */
export async function deskCountRows(
  client: DeskClient,
  grid: string,
  total: number,
  pageSize: number = 50,
): Promise<void> {
  await deskPageSize(client, grid, pageSize);
  await deskUntilRowCount(client, grid, Math.min(total, pageSize));
  const read = await client.read<DeskGridView>(grid);
  if (read.itemCount !== total) throw new Error(`the list reports ${String(read.itemCount)} rows; expected ${total}`);
}

/**
 * Filter one column, then return the loaded row whose shown text equals `text`.
 * `column` is that grid's column id. This replaces the rows on screen with the filter.
 */
export async function deskFindRow(client: DeskClient, grid: string, column: string, text: string, timeoutMs = 15_000): Promise<DeskShownRow> {
  expectOk(await client.act(grid, 'filter', { col: column, text }), `filter ${column} on ${grid}`);
  const deadline = Date.now() + timeoutMs;
  let last: DeskShownRow[] = [];
  while (Date.now() < deadline) {
    await client.waitIdle();
    const read = await client.read<DeskGridView>(grid, { offset: 0, limit: 20 });
    last = read.rows ?? [];
    const hit = last.find((row) => deskCellShown(row, column) === text);
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`no row with ${column} ${JSON.stringify(text)}. rows: ${JSON.stringify(last)}`);
}

/**
 * The grid no longer shows a row whose `column` equals `text` (after a delete): filters the column, as a user would to
 * look for it, until the list answers without it. Throws with the rows still shown.
 */
export async function deskExpectNoRow(client: DeskClient, grid: string, column: string, text: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: DeskShownRow[] = [];
  while (Date.now() < deadline) {
    expectOk(await client.act(grid, 'filter', { col: column, text }), `filter ${column} on ${grid}`);
    await client.waitIdle();
    last = (await client.read<DeskGridView>(grid, { offset: 0, limit: 20 })).rows ?? [];
    if (!last.some((row) => deskCellShown(row, column) === text)) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`the grid still shows ${column} ${JSON.stringify(text)}. rows: ${JSON.stringify(last)}`);
}

/**
 * Actions of a loaded row. Pass the row from `deskFindRow`: its `index` is the loaded place.
 * A numeric string is read as an index, so the row key is not used here.
 */
export async function deskActions(client: DeskClient, grid: string, row: { index?: number }): Promise<DeskActionState[]> {
  if (typeof row.index !== 'number') throw new Error('deskActions needs the row index from the grid read');
  const outcome = expectOk(await client.act(grid, 'rowActions', { row: row.index }), `row actions on ${grid}`);
  return (outcome.result ?? []) as DeskActionState[];
}

/** The actions of the row whose `column` shows `text`, as `{ name: enabled }` (find, then read its actions). */
export async function deskRowActionStates(client: DeskClient, grid: string, column: string, text: string): Promise<Record<string, boolean>> {
  const row = await deskFindRow(client, grid, column, text);
  return Object.fromEntries((await deskActions(client, grid, row)).map((action) => [action.name, action.enabled]));
}

/**
 * Filter a list column as a person does: click its filter box, type, Enter.
 */
export async function deskFilterColumn(page: DeskUserPage, client: DeskClient, grid: string, column: string, text: string): Promise<void> {
  const box = page.locator(deskLocators.node(grid)).first().locator(`${deskLocators.filterCell(column)} input`).first();
  await box.click();
  await box.press('ControlOrMeta+a');
  await box.pressSequentially(text, { delay: 20 });
  await box.press('Enter');
  await client.waitIdle();
}

/**
 * Run a row action as a person does: in the row whose cells show `text`, click the action's button (or ⋮, then the
 * menu item), then answer the confirm it opens by clicking `confirm-yes` (or `confirm-no` with `answer: 'no'`). An
 * action without a confirm runs at once. The row is waited for; when it is not on screen and `column` is given, the
 * column is filtered for it first (`deskFilterColumn`).
 */
export async function deskRunRowAction(
  page: DeskUserPage,
  client: DeskClient,
  grid: string,
  text: string,
  action: string,
  options: { answer?: 'yes' | 'no'; column?: string } = {},
): Promise<void> {
  const answer = options.answer ?? 'yes';
  const find = () =>
    page
      .locator(deskLocators.node(grid))
      .first()
      .locator(deskLocators.cellValue)
      .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .first()
      .locator('xpath=ancestor::tr[1]');
  await client.waitIdle();
  let row = find();
  if ((await row.count()) === 0 && options.column) {
    await deskFilterColumn(page, client, grid, options.column, text);
    row = find();
  }
  for (let tries = 0; (await row.count()) === 0 && tries < 30; tries += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  if ((await row.count()) === 0) throw new Error(`no row showing ${JSON.stringify(text)} on screen in ${grid}`);
  const button = row.locator(deskLocators.rowAction(action)).first();
  if (await button.count()) await button.click();
  else {
    await row.locator(deskLocators.rowMore).first().click();
    await page.locator(deskLocators.menuItem(action)).first().click();
  }
  await client.waitIdle();
  // An action that confirms opens its dialog a moment after the click: wait for it (`isVisible` does not wait), or a
  // late dialog is left for someone else to answer and the action runs after the caller has moved on.
  const confirm = page.locator(deskLocators.field(answer === 'yes' ? 'confirm-yes' : 'confirm-no')).first();
  const asked = await confirm
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);
  if (asked) {
    await confirm.click();
    await client.waitIdle();
  }
}

/**
 * The fast form of `deskRunRowAction`, for a step a person-like test has already covered: the grid's `runRowAction`
 * op on the row, then the confirm answered through the dialog's `answer` op.
 */
export async function deskRunRowActionDirect(
  client: DeskClient,
  grid: string,
  column: string,
  text: string,
  action: string,
  answer: 'yes' | 'no' = 'yes',
): Promise<void> {
  const row = await deskFindRow(client, grid, column, text);
  if (typeof row.index !== 'number') throw new Error(`no row index for ${text}`);
  expectOk(await client.act(grid, 'runRowAction', { row: row.index, name: action }), `row action ${action} on ${text}`);
  await client.waitIdle();
  if ((await client.describe('top')).kind === 'dialog') {
    expectOk(await client.act('top', 'answer', { choice: answer }), `answer ${answer} to ${action}`);
    await client.waitIdle();
  }
}

/**
 * Click a grid cell where a person sees it. A grid scrolls under a sticky header and pinned totals; a person scrolls
 * the grid just enough to see the cell between them and clicks its middle. (A plain locator click scrolls the cell to
 * the grid's edge, under the header or the totals, and then cannot click it.) A list a field left open over the grid
 * (a lookup's suggestions, the currency list) is closed with Escape first. Throws when the cell stays covered.
 */
export async function deskClickCell(page: DeskUserPage, grid: string, row: number, column: string): Promise<void> {
  const cell = page.locator(deskLocators.node(grid)).first().locator(deskLocators.gridCell(row, column)).first();
  await cell.waitFor({ state: 'visible', timeout: 5000 });
  const aim = () =>
    cell.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      let host: HTMLElement | null = el.parentElement;
      while (host && !(/(auto|scroll)/.test(getComputedStyle(host).overflowY) && host.scrollHeight > host.clientHeight)) host = host.parentElement;
      if (host) {
        const box = host.getBoundingClientRect();
        const head = host.querySelector('thead')?.getBoundingClientRect().height ?? 0;
        const footCell = host.querySelector('tfoot td');
        const pinned = !el.closest('tfoot') && footCell instanceof HTMLElement && getComputedStyle(footCell).position === 'sticky';
        const foot = pinned ? host.querySelector('tfoot')!.getBoundingClientRect().height : 0;
        const shown = el.getBoundingClientRect();
        const top = box.top + head;
        const bottom = box.bottom - foot;
        if (shown.top < top) host.scrollTop -= top - shown.top;
        else if (shown.bottom > bottom) host.scrollTop += Math.min(shown.bottom - bottom, shown.top - top);
      }
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        clear: hit !== null && (hit === el || el.contains(hit)),
        // A list a field opened on focus (a lookup's suggestions, the currency list) is drawn in the body, outside every
        // desk node, and may lie over the grid; a dialog or the page itself is a node.
        popup: hit !== null && hit.closest('[data-desk-path]') === null,
        covering: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className)}` : 'nothing on screen',
      };
    });
  let point = await aim();
  if (!point.clear && point.popup) {
    // A person closes the list first.
    await page.keyboard.press('Escape');
    point = await aim();
  }
  if (!point.clear) throw new Error(`${grid} row ${row} ${column}: the cell is covered (by ${point.covering})`);
  await page.mouse.click(point.x, point.y);
}

/**
 * Type into a grid cell's lookup as a person does and pick the row showing `text`: click the cell (row index, column
 * id), type (the first key opens the editor), wait for the list, move down to the row that shows `text`, Enter. Throws when the list has no such row.
 */
export async function deskPickInCell(
  page: DeskUserPage,
  client: DeskClient,
  grid: string,
  row: number,
  column: string,
  text: string,
  timeoutMs = 8000,
  pickKey = 'Enter',
): Promise<void> {
  const cell = page.locator(deskLocators.node(grid)).first().locator(deskLocators.gridCell(row, column)).first();
  await deskClickCell(page, grid, row, column);
  // Typing on the cell opens its editor with the first key, as for a person; the rest follows the focus.
  await cell.pressSequentially(text, { delay: 20 });
  const wanted = text.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  for (let moves = 0; Date.now() < deadline; ) {
    const active = page.locator(deskLocators.lookupActive).first();
    if (await active.count()) {
      const shown = (await active.innerText()).replace(/\s+/g, ' ').trim().toLowerCase();
      if (shown.includes(wanted) && !shown.includes('searching')) {
        await page.keyboard.press(pickKey);
        await client.waitIdle();
        return;
      }
      if (moves < 20 && !shown.includes('searching')) {
        await page.keyboard.press('ArrowDown');
        moves += 1;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no lookup row showing ${JSON.stringify(text)} in ${grid} row ${row} ${column}`);
}

/**
 * The keys of a multi-select lookup (several rows picked, the list stays open): which picks a row and which leaves the
 * cell. Today Enter picks and Tab (or ← →) moves on; a desk setting is planned to offer Space to pick and Enter to move
 * on: then only this changes, every spec picks through `deskPickManyInCell`.
 */
export const DESK_MULTI_PICK_KEYS = { pick: 'Enter', moveOn: 'Tab' };

/**
 * Pick several rows in a grid cell's multi-select lookup as a person does: for each text, type it and pick the row
 * showing it; then leave the cell to the next one.
 */
export async function deskPickManyInCell(page: DeskUserPage, client: DeskClient, grid: string, row: number, column: string, texts: readonly string[], timeoutMs = 8000): Promise<void> {
  for (const text of texts) await deskPickInCell(page, client, grid, row, column, text, timeoutMs, DESK_MULTI_PICK_KEYS.pick);
  await page.keyboard.press(DESK_MULTI_PICK_KEYS.moveOn);
  await client.waitIdle();
}

/** A grid column as the automation state shows it: its editor kind and whether its lookup picks several rows. */
interface DeskGridColumnView {
  id: string;
  editor: string;
  multiple?: boolean;
  /** The dialog the cell opens, and when (`change`: after an edit; `never`: only on its key). */
  dialog?: string;
  when?: string;
}

async function gridColumn(client: DeskClient, grid: string, column: string): Promise<DeskGridColumnView> {
  const snap = (await client.snapshot({ path: grid, depth: 1 })) as Array<{ state?: { columns?: DeskGridColumnView[] } }>;
  const found = snap[0]?.state?.columns?.find((c) => c.id === column);
  if (!found) throw new Error(`${grid} has no column ${column}`);
  return found;
}

/**
 * Choose a grid cell's option (a select or a Yes/No check) as a person does: click the cell, type the option's label
 * (the first key opens the editor and filters the options), Enter picks it and moves on.
 */
export async function deskChooseInCell(page: DeskUserPage, client: DeskClient, grid: string, row: number, column: string, label: string): Promise<void> {
  const cell = page.locator(deskLocators.node(grid)).first().locator(deskLocators.gridCell(row, column)).first();
  await deskClickCell(page, grid, row, column);
  await cell.pressSequentially(label, { delay: 20 });
  await page.keyboard.press('Enter');
  await client.waitIdle();
}

/**
 * Edit a grid cell as a person does, whatever its editor (read from the grid): a text, number or date is typed and
 * committed; a select or check is chosen by its label; a lookup is picked by the row showing the text; a lookup that
 * picks several takes each text, then moves on. Specs name the value, not the editor: a column that changes editor
 * keeps its specs.
 */
export async function deskEditCell(page: DeskUserPage, client: DeskClient, grid: string, row: number, column: string, value: string | readonly string[]): Promise<void> {
  const view = await gridColumn(client, grid, column);
  const values = typeof value === 'string' ? [value] : value;
  if (view.editor === 'lookup' && view.multiple) return deskPickManyInCell(page, client, grid, row, column, values);
  const one = values[0] ?? '';
  if (view.editor === 'lookup') return deskPickInCell(page, client, grid, row, column, one);
  if (view.editor === 'select' || view.editor === 'check') return deskChooseInCell(page, client, grid, row, column, one);
  return deskTypeInCell(page, client, grid, row, column, one);
}

/**
 * Type into a grid cell's text editor as a person does: click the cell (row index, column id) and type (the first key
 * opens the editor and replaces what the cell held); Tab commits and moves on.
 */
export async function deskTypeInCell(page: DeskUserPage, client: DeskClient, grid: string, row: number, column: string, text: string): Promise<void> {
  const cell = page.locator(deskLocators.node(grid)).first().locator(deskLocators.gridCell(row, column)).first();
  await deskClickCell(page, grid, row, column);
  await cell.pressSequentially(text, { delay: 20 });
  await page.keyboard.press('Tab');
  await client.waitIdle();
}

/**
 * Whether the user is offered an action, from a row's or a toolbar's action states (`deskRowActionStates`): the one
 * rule every check uses. Today an action the user may not run is either disabled or not drawn, and an action may sit
 * in the button group or in the ⋮ menu: all of that is "withheld" / "offered" here, so when the desk's display choice
 * changes (a setting to hide or disable, buttons or menu) only this function does.
 */
export function deskOffers(states: Record<string, boolean | undefined>, action: string): boolean {
  return states[action] === true;
}

/** The opposite of `deskOffers`: the action is disabled or not drawn at all. */
export function deskWithholds(states: Record<string, boolean | undefined>, action: string): boolean {
  return !deskOffers(states, action);
}

/**
 * Whether the page offers a toolbar button (Add New is `add-new`): the page's `actions` lists only buttons drawn and
 * enabled, so "offered" is "listed" (the same rule as `deskOffers`).
 */
export async function deskToolbarOffers(client: DeskClient, id: string): Promise<boolean> {
  const listed = (await client.act('top', 'actions')) as { result?: { buttons?: Array<{ id?: string; label?: string }> } };
  return (listed.result?.buttons ?? []).some((button) => button.id === id || button.label === id);
}

async function untilDialog(client: DeskClient, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await client.describe('top')).kind === 'dialog') return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Enter one line in an entry grid as a person does: take the blank row (the one whose `blankColumn` is empty, where
 * the grid keeps its new row), then edit each column in the order given with `deskEditCell` (typed, chosen or picked
 * by the column's editor). The row is followed by its key, so a grid that puts the next blank row first still edits
 * the same line. A dialog a cell opens goes to `onDialog` (the caller knows what to answer); without it the step fails
 * naming the dialog. Returns the line's row index once entered.
 */
export async function deskEnterRow(
  page: DeskUserPage,
  client: DeskClient,
  grid: string,
  values: Readonly<Record<string, string | readonly string[]>>,
  options: {
    blankColumn: string;
    /** A cell may open a dialog (a variants box after the quantity): called with its path to answer it as a person would. */
    onDialog?: (dialog: string, column: string) => Promise<void>;
  },
): Promise<number> {
  const rowsNow = async () => (await client.read<DeskGridView>(grid, { offset: 0, limit: 500 })).rows ?? [];
  const blank = (await rowsNow()).find((row) => String(row.cells?.[options.blankColumn]?.value ?? '') === '');
  if (!blank || typeof blank.index !== 'number') throw new Error(`${grid} has no blank row (empty ${options.blankColumn}) to enter a line in`);
  let index = blank.index;
  for (const [column, value] of Object.entries(values)) {
    const found = blank.key ? (await rowsNow()).find((row) => row.key === blank.key) : undefined;
    if (typeof found?.index === 'number') index = found.index;
    await deskEditCell(page, client, grid, index, column, value);
    // A column that opens a dialog after an edit (the grid says so) gets a moment for it to appear, as a person waits.
    const view = await gridColumn(client, grid, column);
    if (view.dialog && view.when !== 'never') await untilDialog(client, 1500);
    for (let answered = 0; answered < 4; answered += 1) {
      const top = await client.describe('top');
      if (top.kind !== 'dialog') break;
      if (!options.onDialog) throw new Error(`${grid} ${column} opened ${top.path}; pass onDialog to answer it`);
      await options.onDialog(top.path, column);
      await client.waitIdle();
    }
  }
  return index;
}
