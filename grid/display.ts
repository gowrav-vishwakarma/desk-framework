import type { DeskColumn, DeskGridRow, DeskLookupConfig, DeskSelectOption, DeskSummary } from './types';
import { currencyLines, formatDeskNumber } from '../currency/money';
import { formatDeskDate, parseDeskDate } from '../date/deskDate';
import { dateParseOptions, datePrefs, ensureDatePrefs } from '../date/datePrefs';
import { blocksText } from './layout/compile';

function formatRawValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && 'name' in raw) {
    const name = (raw as { name?: unknown }).name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

export function cellText(column: DeskColumn, row: DeskGridRow): string {
  if (column.blocks) return blocksText(column.blocks(row));
  const raw = column.relation
    ? (row[column.relation.as] as Record<string, unknown> | undefined)?.[column.relation.field]
    : row[column.id];
  if (column.format) return column.format(raw, row);
  const money = currencyLines(column, row);
  if (money) return money.primary;
  if (column.decimals !== undefined) return formatDeskNumber(raw, column.decimals);
  if ((column.type === 'date' || column.editor === 'date') && typeof raw === 'string') {
    ensureDatePrefs();
    return formatDeskDate(raw, datePrefs.value.show);
  }
  return formatRawValue(raw);
}

/** Value an editor should open with. A formatted face, such as an applied rate, stays on screen only. */
export function editorText(column: DeskColumn, row: DeskGridRow): string {
  if (!column.editor) return cellText(column, row);
  const raw = row[column.id];
  if ((column.editor === 'date' || column.type === 'date') && typeof raw === 'string') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  if (typeof raw === 'string') return raw;
  // A lookup whose stored face is empty still opens on the formatted value (batch on `batch`).
  if (column.editor === 'lookup' && column.format) return column.format(raw, row);
  if (raw === null || raw === undefined) return '';
  return cellText(column, row);
}

/** The list for the row being edited. A function lookup is how a column searches per line. */
export function resolveColumnLookup(column: DeskColumn, row: DeskGridRow | undefined): DeskLookupConfig | undefined {
  const lookup = column.lookup;
  if (!lookup) return undefined;
  if (typeof lookup === 'function') return row ? lookup(row) : undefined;
  return lookup;
}

const BLANK_OPTION: DeskSelectOption = { label: '---', value: '' };

/** "---" stores null. `next` moves on. `exit` leaves the grid. */
export function afterBlankMove(column: DeskColumn, row: DeskGridRow): 'next' | 'exit' {
  const choice = column.afterBlank;
  if (typeof choice === 'function') return choice(row);
  return choice === 'exit' ? 'exit' : 'next';
}

export function columnOptions(column: DeskColumn, row: DeskGridRow | undefined): DeskSelectOption[] {
  const options = !column.options ? [] : typeof column.options === 'function' ? (row ? column.options(row) : []) : column.options;
  if (!column.blank || (column.editor ?? column.type) === 'check') return options;
  if (options.some((option) => option.value === '')) return options;
  return [BLANK_OPTION, ...options];
}

/** Label shown in a resting dropdown cell. The stored value stays what the editor commits. */
export function optionLabel(column: DeskColumn, row: DeskGridRow): string {
  // Lookup / format / layout cells keep their value off `column.id` (rack, bin, nested names).
  if (column.blocks || column.format || column.lookup) return cellText(column, row);
  const raw = row[column.id];
  const text = raw === null || raw === undefined ? '' : cellText(column, row);
  const option = columnOptions(column, row).find((item) => item.value === text);
  if (option) return option.label;
  return text;
}

/**
 * Enter on a resting lookup, select, or check.
 * The column decides first. A lookup config is the fallback. A select or check opens unless told not to.
 */
export function cellOpensOnEnter(column: DeskColumn, row: DeskGridRow): boolean {
  if (isReadonly(column, row)) return false;
  const kind = column.editor || column.type;
  const isLookup = kind === 'lookup' || Boolean(column.lookup);
  if (kind !== 'check' && kind !== 'select' && !isLookup) return false;
  if (kind === 'select' && columnOptions(column, row).length <= 1) return false;
  const choice = column.opensOnEnter;
  if (typeof choice === 'function') return choice(row);
  if (typeof choice === 'boolean') return choice;
  if (isLookup) return resolveColumnLookup(column, row)?.opensOnEnter === true;
  return true;
}

export function isReadonly(column: DeskColumn, row: DeskGridRow): boolean {
  if (typeof column.readonly === 'function') return column.readonly(row);
  return column.readonly === true;
}

export function summaryValue(kind: DeskSummary, values: number[]): number {
  if (values.length === 0) return 0;
  if (kind === 'count') return values.length;
  if (kind === 'min') return Math.min(...values);
  if (kind === 'max') return Math.max(...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (kind === 'avg') return total / values.length;
  return total;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

export function parseEditorValue(kind: string | undefined, text: string): unknown {
  if (kind === 'number' || kind === 'currency') {
    if (text.trim() === '') return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : text;
  }
  if (kind === 'check') return text === 'Yes' || text === 'Y' || text === '1' || text.toLowerCase() === 'true';
  if (kind === 'date') {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    return parseDeskDate(trimmed, dateParseOptions()) ?? trimmed;
  }
  return text;
}

export { currencyCaption } from '../currency/money';
