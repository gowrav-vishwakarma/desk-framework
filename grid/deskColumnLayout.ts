import type { DeskColumn, DeskColumnTextLayout } from './types';

const TEXT_LAYOUTS: DeskColumnTextLayout[] = ['wrap', 'clip', 'ellipsis-end', 'ellipsis-middle'];

export function isDeskColumnTextLayout(value: unknown): value is DeskColumnTextLayout {
  return typeof value === 'string' && TEXT_LAYOUTS.includes(value as DeskColumnTextLayout);
}

export function defaultTextLayoutForColumn(column: DeskColumn): DeskColumnTextLayout {
  if (column.defaultTextLayout && isDeskColumnTextLayout(column.defaultTextLayout)) {
    return column.defaultTextLayout;
  }
  return 'ellipsis-end';
}

/** Keep saved layouts for columns that still expose the menu; drop others. */
export function mergeTextLayouts(
  columns: readonly DeskColumn[],
  saved: Record<string, DeskColumnTextLayout> | null | undefined,
): Record<string, DeskColumnTextLayout> {
  const next: Record<string, DeskColumnTextLayout> = {};
  for (const column of columns) {
    if (!column.textLayoutMenu) continue;
    const fromSaved = saved?.[column.id];
    next[column.id] = isDeskColumnTextLayout(fromSaved) ? fromSaved : defaultTextLayoutForColumn(column);
  }
  return next;
}

export const DESK_COLUMN_MIN_WIDTH = 48;
export const DESK_COLUMN_DEFAULT_WIDTH = 120;

export type DeskColumnPin = 'start' | 'end';

export function columnPin(column: DeskColumn): DeskColumnPin | undefined {
  if (column.pin === 'start' || column.pin === 'end') return column.pin;
  return undefined;
}

/** Middle columns are everything that is not pinned. */
export function middleColumnIds(columns: readonly DeskColumn[]): string[] {
  return columns.filter((column) => !columnPin(column)).map((column) => column.id);
}

export function canReorderColumn(column: DeskColumn | undefined): boolean {
  if (!column) return false;
  return !columnPin(column);
}

/** Keep saved middle order, drop removed ids, append new middle ids in definition order. */
export function mergeMiddleOrder(columns: readonly DeskColumn[], saved: readonly string[] | null | undefined): string[] {
  const middle = middleColumnIds(columns);
  if (!middle.length) return [];
  const middleSet = new Set(middle);
  const ordered: string[] = [];
  for (const id of saved ?? []) {
    if (middleSet.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  for (const id of middle) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function mergeColumnWidths(
  columns: readonly DeskColumn[],
  saved: Record<string, number> | null | undefined,
): Record<string, number> {
  const ids = new Set(columns.map((column) => column.id));
  const next: Record<string, number> = {};
  for (const [id, width] of Object.entries(saved ?? {})) {
    if (!ids.has(id)) continue;
    if (typeof width === 'number' && Number.isFinite(width) && width >= DESK_COLUMN_MIN_WIDTH) {
      next[id] = Math.round(width);
    }
  }
  return next;
}

export function partitionColumnLayout(columns: readonly DeskColumn[], middleOrder: readonly string[]): DeskColumn[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const start = columns.filter((column) => columnPin(column) === 'start');
  const end = columns.filter((column) => columnPin(column) === 'end');
  const middleSet = new Set(middleColumnIds(columns));
  const middle: DeskColumn[] = [];
  for (const id of middleOrder) {
    if (!middleSet.has(id)) continue;
    const column = byId.get(id);
    if (column) middle.push(column);
  }
  for (const column of columns) {
    if (!middleSet.has(column.id)) continue;
    if (middle.some((item) => item.id === column.id)) continue;
    middle.push(column);
  }
  return [...start, ...middle, ...end];
}

/** Move `dragId` before `beforeId`, or to the end when `beforeId` is null. Middle zone only. */
export function moveMiddleColumnOrder(
  columns: readonly DeskColumn[],
  order: readonly string[],
  dragId: string,
  beforeId: string | null,
): string[] | null {
  const drag = columns.find((column) => column.id === dragId);
  if (!canReorderColumn(drag)) return null;
  const middle = middleColumnIds(columns);
  if (!middle.includes(dragId)) return null;
  if (beforeId !== null) {
    const before = columns.find((column) => column.id === beforeId);
    if (!canReorderColumn(before) || !middle.includes(beforeId)) return null;
  }
  const next = order.filter((id) => id !== dragId);
  if (beforeId === null) {
    next.push(dragId);
    return next;
  }
  const index = next.indexOf(beforeId);
  if (index < 0) return null;
  next.splice(index, 0, dragId);
  return next;
}

export function effectiveColumnWidth(column: DeskColumn | undefined, widths: Record<string, number>): number {
  if (!column) return DESK_COLUMN_DEFAULT_WIDTH;
  const override = widths[column.id];
  if (override !== undefined) return override;
  return column.width ?? DESK_COLUMN_DEFAULT_WIDTH;
}

export function gridHasColumnGroups(columns: readonly DeskColumn[]): boolean {
  return columns.some((column) => Boolean(column.group));
}
