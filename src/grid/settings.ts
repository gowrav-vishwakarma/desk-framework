import type { DeskLookupConfig, DeskSelectOption } from './types';

/** One setting: a label cell and a value cell. `key` is how the page finds the value. */
export interface DeskSetting {
  key: string;
  label: string;
  editor: 'check' | 'select' | 'number' | 'text' | 'date' | 'lookup' | 'file' | 'chips' | 'currency';
  /** Paints a required mark on the label. The page still decides what “required” means. */
  required?: boolean;
  /** Choices for `select`. Option values are strings, so set `numeric` when the stored value is a number. */
  options?: DeskSelectOption[];
  /** Search list for `lookup` and `chips`. A chip stores the picked record on a list. */
  lookup?: DeskLookupConfig;
  numeric?: boolean;
  /** A readonly value is shown but the cursor never lands on it. */
  readonly?: boolean;
  hint?: string;
  /** Colour of a resting value. `ok` is green, `bad` is red, `muted` is grey. */
  tone?: 'ok' | 'bad' | 'muted';
}

/** A section title is one bold row. A pair row holds up to two settings side by side. */
export type DeskSettingsRow =
  | { kind: 'title'; id: string; label: string }
  | { kind: 'pair'; id: string; cells: [DeskSetting, DeskSetting | null] };

/** A cell the cursor can visit: the value cell of a setting that can be changed. */
export interface DeskSettingsCell {
  row: number;
  side: 0 | 1;
  key: string;
}

/** A title row, then the settings two to a row. */
export function sectionRows(id: string, title: string, settings: readonly DeskSetting[]): DeskSettingsRow[] {
  const rows: DeskSettingsRow[] = [{ kind: 'title', id: `${id}:title`, label: title }];
  for (let index = 0; index < settings.length; index += 2) {
    const left = settings[index];
    if (!left) continue;
    rows.push({ kind: 'pair', id: `${id}:${index / 2}`, cells: [left, settings[index + 1] ?? null] });
  }
  return rows;
}

/** One setting on its own row (full table width in the settings grid). */
export function singleSettingRow(id: string, setting: DeskSetting): DeskSettingsRow {
  return { kind: 'pair', id, cells: [setting, null] };
}

/**
 * Every cell the cursor can visit, in reading order. Titles, labels, empty halves and
 * readonly values are left out, so no key can ever land on them.
 */
export function editableCells(rows: readonly DeskSettingsRow[]): DeskSettingsCell[] {
  const cells: DeskSettingsCell[] = [];
  rows.forEach((row, index) => {
    if (row.kind !== 'pair') return;
    row.cells.forEach((setting, side) => {
      if (setting && !setting.readonly) cells.push({ row: index, side: side === 0 ? 0 : 1, key: setting.key });
    });
  });
  return cells;
}

function indexOfKey(cells: readonly DeskSettingsCell[], key: string | null): number {
  return key === null ? -1 : cells.findIndex((cell) => cell.key === key);
}

/**
 * The next (`1`) or previous (`-1`) editable cell in reading order. It runs onto the next or
 * previous row and stops at the ends. With no current cell it gives the first or last one.
 */
export function stepCell(cells: readonly DeskSettingsCell[], from: string | null, delta: 1 | -1): DeskSettingsCell | null {
  if (cells.length === 0) return null;
  const at = indexOfKey(cells, from);
  if (at < 0) return (delta === 1 ? cells[0] : cells[cells.length - 1]) ?? null;
  return cells[at + delta] ?? null;
}

/**
 * The nearest editable cell in a later (`1`) or earlier (`-1`) row. It keeps the side when that
 * row has an editable cell there, and takes the other side otherwise. Null when no row is left.
 */
export function verticalCell(cells: readonly DeskSettingsCell[], from: string | null, delta: 1 | -1): DeskSettingsCell | null {
  const at = indexOfKey(cells, from);
  const current = cells[at];
  if (!current) return stepCell(cells, null, delta);
  let target: number | null = null;
  for (const cell of delta === 1 ? cells : [...cells].reverse()) {
    if (delta === 1 ? cell.row > current.row : cell.row < current.row) {
      target = cell.row;
      break;
    }
  }
  if (target === null) return null;
  const inRow = cells.filter((cell) => cell.row === target);
  return inRow.find((cell) => cell.side === current.side) ?? inRow[0] ?? null;
}

/**
 * The cell to keep the cursor on after the rows change. The same setting when it can still be
 * visited, otherwise the closest editable cell before it, otherwise the first one.
 */
export function settleCell(
  before: readonly DeskSettingsRow[],
  after: readonly DeskSettingsRow[],
  key: string | null,
): DeskSettingsCell | null {
  const cells = editableCells(after);
  const kept = cells.find((cell) => cell.key === key);
  if (kept) return kept;
  const old = editableCells(before);
  const at = indexOfKey(old, key);
  for (let index = at - 1; index >= 0; index -= 1) {
    const found = cells.find((cell) => cell.key === old[index]?.key);
    if (found) return found;
  }
  return cells[0] ?? null;
}
