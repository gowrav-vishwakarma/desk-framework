import { formatDeskDecimal } from '../currency/money';
import type { PivotField, PivotValueItem } from './pivotTypes';

/** True when a value cell holds a share, not the field's own unit. */
export function pivotIsShare(item: PivotValueItem | undefined): boolean {
  return Boolean(item?.showAs && item.showAs !== 'value');
}

/** A value cell's text: counts as whole numbers, shares as percent, the rest in the field's format. */
export function pivotCellText(value: number | null, item: PivotValueItem | undefined, field: PivotField | undefined): string {
  if (value === null || !Number.isFinite(value)) return '';
  if (pivotIsShare(item)) return `${formatDeskDecimal(value, 2)}%`;
  if (item?.aggregate === 'count' || item?.aggregate === 'distinct') return formatDeskDecimal(value, 0);
  if (field?.kind === 'number' && field.format) return field.format(value) || formatDeskDecimal(value, 2);
  return formatDeskDecimal(value, 2);
}
