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
  const confirm = page.locator(deskLocators.field(answer === 'yes' ? 'confirm-yes' : 'confirm-no')).first();
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) {
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
  if ((await client.describe('top')).path.startsWith('dialog:')) {
    expectOk(await client.act('top', 'answer', { choice: answer }), `answer ${answer} to ${action}`);
    await client.waitIdle();
  }
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
): Promise<void> {
  const cell = page.locator(deskLocators.node(grid)).first().locator(deskLocators.gridCell(row, column)).first();
  await cell.click();
  // Typing on the cell opens its editor with the first key, as for a person; the rest follows the focus.
  await cell.pressSequentially(text, { delay: 20 });
  const wanted = text.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  for (let moves = 0; Date.now() < deadline; ) {
    const active = page.locator(deskLocators.lookupActive).first();
    if (await active.count()) {
      const shown = (await active.innerText()).replace(/\s+/g, ' ').trim().toLowerCase();
      if (shown.includes(wanted) && !shown.includes('searching')) {
        await page.keyboard.press('Enter');
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
