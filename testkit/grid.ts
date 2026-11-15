import { expectOk } from './user';
import type { DeskClient } from './client';

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
