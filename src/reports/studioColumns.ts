import { formatDeskNumber } from '../currency/money';
import { datePrefs } from '../date/datePrefs';
import { formatDeskDate } from '../date/deskDate';
import type { DeskColumn } from '../grid/types';
import type { DeskStatCard } from '../layout/statCards';
import type { ReportFilterField } from './columnWhere';
import type { DeskTone } from '../grid/types';
import type { Rdl2ColumnFormat, Rdl2OutputColumn, Rdl2Report } from './language';

const NUMERIC = new Set<Rdl2ColumnFormat>(['money', 'qty', 'number', 'percent']);
const TONES = new Set<string>(['success', 'info', 'warning', 'alert', 'danger']);

/**
 * A value in an output column's format. Numbers arrive as text from the database. With
 * `negatives: 'brackets'` a negative number is drawn as `(1,234)`.
 */
export function formatStudioValue(value: unknown, format: Rdl2ColumnFormat | undefined, negatives?: 'brackets'): string {
  if (value === null || value === undefined || value === '') return '';
  if (negatives === 'brackets' && format && NUMERIC.has(format) && Number(value) < 0) {
    const shown = formatStudioValue(Math.abs(Number(value)), format);
    return shown ? `(${shown})` : '';
  }
  switch (format) {
    case 'money':
      return formatDeskNumber(value, 'money');
    case 'qty':
      return formatDeskNumber(value, 'qty');
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : formatDeskNumber(n, 2)) : '';
    }
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${formatDeskNumber(n, 2)}%` : '';
    }
    case 'date':
    case 'datetime':
      return typeof value === 'string' ? formatDeskDate(value.slice(0, 10), datePrefs.value.show) : '';
    case 'boolean':
      return value === true || value === 'true' ? 'Yes' : 'No';
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}

/** Display choices the viewer can flip. Read each time a cell draws, so a change shows at once. */
export interface StudioColumnOptions {
  /** A zero in a number column draws as an empty cell. */
  hideZero?: () => boolean;
}

function columnOf(column: Rdl2OutputColumn, report: Rdl2Report, options: StudioColumnOptions): DeskColumn {
  const numeric = column.format !== undefined && NUMERIC.has(column.format);
  const caption = column.caption;
  const zeros = numeric ? report.output.zeros : undefined;
  return {
    id: column.column,
    header: column.label,
    width: column.width ?? (numeric ? 120 : 160),
    sortable: false,
    align: column.align ?? (numeric ? 'right' : 'left'),
    ...(column.quiet ? { quiet: true } : {}),
    ...(column.hidden ? { defaultHidden: true } : {}),
    ...(column.repeats ? { repeats: column.repeats } : {}),
    ...(column.tone ? { tone: column.tone } : {}),
    ...(zeros ? { zeros } : {}),
    ...(caption ? { captionField: caption } : {}),
    ...(column.toneBy ? { cellTone: (row: Record<string, unknown>) => toneOf(row[column.toneBy!]) } : {}),
    format: (value) => {
      if (numeric && options.hideZero?.() && value !== null && value !== '' && Number(value) === 0) return '';
      return formatStudioValue(value, column.format, report.output.negatives);
    },
  };
}

/** A tone a row gives a cell, when it names one. */
function toneOf(value: unknown): DeskTone | null {
  return typeof value === 'string' && TONES.has(value) ? (value as DeskTone) : null;
}

/** The report's output as grid columns. */
export function studioColumns(report: Rdl2Report, options: StudioColumnOptions = {}): DeskColumn[] {
  return report.output.columns.map((column) => columnOf(column, report, options));
}

/** The report's cards, each its column's sum over the whole result. Empty before the first run. */
export function studioCards(report: Rdl2Report, totals: Record<string, unknown> | null | undefined): DeskStatCard[] {
  if (!totals) return [];
  return (report.output.cards ?? []).map((card, index) => {
    const format = report.output.columns.find((column) => column.column === card.column)?.format;
    return {
      id: `${card.column}-${index}`,
      label: card.label,
      value: formatStudioValue(totals[card.column] ?? 0, format, report.output.negatives) || '0',
      ...(card.tone ? { tone: card.tone } : {}),
      ...(card.line ? { line: card.line } : {}),
    };
  });
}

/** Output columns as grid-filter fields: the runner filters on the output column itself. */
export function studioFilterFields(report: Rdl2Report): Record<string, ReportFilterField> {
  const out: Record<string, ReportFilterField> = {};
  for (const column of report.output.columns) {
    if (column.filterable === false) continue;
    const kind = column.format === 'date' || column.format === 'datetime' ? 'date' : column.format && NUMERIC.has(column.format) ? 'number' : 'text';
    out[column.column] = { field: column.column, kind };
  }
  return out;
}

/**
 * Column bands: each output column's band heading, by column id. A band that names a period of a
 * periods step shows that period's heading from the result ("FY-2026-27 Upto Aug-26").
 */
export function studioBands(report: Rdl2Report, periods: readonly { name: string; label: string }[] | undefined): Map<string, string> {
  const labels = new Map((periods ?? []).map((period) => [period.name, period.label]));
  const out = new Map<string, string>();
  for (const column of report.output.columns) if (column.band) out.set(column.column, labels.get(column.band) ?? column.band);
  return out;
}

/** Columns the totals line shows: the summed ones and those whose total is a formula. */
export function studioTotalColumns(report: Rdl2Report): string[] {
  return [...new Set([...(report.output.totals ?? []), ...report.output.columns.filter((column) => column.total?.trim()).map((column) => column.column)])];
}
