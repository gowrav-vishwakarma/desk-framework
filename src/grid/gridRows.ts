import { plainText } from '../automation/text';

/** Most rows one call returns. A grid on a server page only has that page loaded anyway. */
export const DESK_GRID_ROWS_MAX = 100;

export interface DeskGridRowsArgs {
  offset?: unknown;
  limit?: unknown;
  /** Column ids or headers to return. Default: every visible column. */
  columns?: unknown;
  /** Keep rows whose cell text contains this (case-insensitive). `{ column: text }` checks one column; a string checks all. */
  match?: unknown;
  /** Row keys to return, such as the key a selection or an error names. */
  keys?: unknown;
  format?: unknown;
}

export interface DeskGridRowsSource<Row> {
  rows: readonly Row[];
  columns: readonly { id: string; header: string }[];
  /** Shown text of one cell, the way a person reads it. */
  text: (row: Row, columnId: string) => string;
  key: (row: Row, index: number) => string;
  /** Rows the server has in total, when the grid pages on the server. */
  totalRowCount?: number | null | undefined;
}

type Result = { ok: false; error: string; reason?: string } | Record<string, unknown>;

function csvCell(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows of a grid as a person sees them, filtered and trimmed for an agent. Only rows the grid has loaded are
 * searched: `searched` and `totalRowCount` say when the server has more.
 */
export function deskGridRows<Row>(source: DeskGridRowsSource<Row>, args: DeskGridRowsArgs): Result {
  const offset = args.offset === undefined ? 0 : Number(args.offset);
  const limit = args.limit === undefined ? 20 : Number(args.limit);
  if (!Number.isInteger(offset) || offset < 0) return { ok: false, error: `offset ${plainText(args.offset)} is not a whole number from 0` };
  if (!Number.isInteger(limit) || limit < 1) return { ok: false, error: `limit ${plainText(args.limit)} is not a whole number from 1` };
  if (limit > DESK_GRID_ROWS_MAX) return { ok: false, error: `limit ${limit} is above ${DESK_GRID_ROWS_MAX}`, reason: 'page with offset instead' };

  const byName = (name: string) => source.columns.find((column) => column.id === name || column.header.trim().toLowerCase() === name.trim().toLowerCase());
  let columns = source.columns;
  if (args.columns !== undefined) {
    const names = Array.isArray(args.columns) ? args.columns.map(plainText) : plainText(args.columns).split(',');
    const picked = names.map((name) => ({ name, column: byName(name) }));
    const missing = picked.filter((item) => !item.column).map((item) => item.name);
    if (missing.length > 0) return { ok: false, error: `no column ${missing.join(', ')}`, reason: `columns: ${source.columns.map((column) => `${column.id} (${column.header})`).join(' | ')}` };
    columns = picked.map((item) => item.column!);
  }

  let matchColumn: { id: string } | undefined;
  let matchText = '';
  if (args.match !== undefined && args.match !== null && args.match !== '') {
    if (typeof args.match === 'object' && !Array.isArray(args.match)) {
      const [name, value] = Object.entries(args.match as Record<string, unknown>)[0] ?? [];
      matchColumn = name ? byName(name) : undefined;
      if (!matchColumn) return { ok: false, error: `no column ${name ?? ''} to match`, reason: `columns: ${source.columns.map((column) => column.id).join(', ')}` };
      matchText = plainText(value).toLowerCase();
    } else {
      matchText = plainText(args.match).toLowerCase();
    }
  }
  const keys = args.keys === undefined ? null : new Set((Array.isArray(args.keys) ? args.keys : [args.keys]).map(plainText));

  const hits: { index: number; key: string; row: Row }[] = [];
  source.rows.forEach((row, index) => {
    const key = source.key(row, index);
    if (keys && !keys.has(key)) return;
    if (matchText) {
      const pool = matchColumn ? [matchColumn] : source.columns;
      if (!pool.some((column) => source.text(row, column.id).toLowerCase().includes(matchText))) return;
    }
    hits.push({ index, key, row });
  });
  const page = hits.slice(offset, offset + limit);
  const meta = {
    searched: source.rows.length,
    matched: hits.length,
    returned: page.length,
    offset,
    ...(typeof source.totalRowCount === 'number' && source.totalRowCount > source.rows.length
      ? { totalRowCount: source.totalRowCount, note: 'only the loaded page was searched; change the grid page or its filter to reach other rows' }
      : {}),
  };

  if (args.format === 'csv') {
    const lines = [['#', 'key', ...columns.map((column) => column.header || column.id)].map(csvCell).join(',')];
    for (const hit of page) lines.push([String(hit.index), hit.key, ...columns.map((column) => source.text(hit.row, column.id))].map(csvCell).join(','));
    return { ...meta, csv: lines.join('\n') };
  }
  return {
    ...meta,
    columns: columns.map((column) => ({ id: column.id, header: column.header })),
    rows: page.map((hit) => ({ index: hit.index, key: hit.key, ...Object.fromEntries(columns.map((column) => [column.id, source.text(hit.row, column.id)])) })),
  };
}
