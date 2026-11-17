import type { DeskColumnTextLayout } from './types';

/** Rough middle ellipsis from column width; full text stays in the cell `title`. */
export function middleEllipsisText(text: string, columnWidthPx: number): string {
  if (!text) return '';
  const maxChars = Math.max(8, Math.floor(columnWidthPx / 7));
  if (text.length <= maxChars) return text;
  const budget = maxChars - 1;
  const head = Math.ceil(budget / 2);
  const tail = Math.floor(budget / 2);
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function formatCellTextForLayout(text: string, layout: DeskColumnTextLayout, columnWidthPx: number): string {
  if (layout === 'ellipsis-middle') return middleEllipsisText(text, columnWidthPx);
  return text;
}

export function textLayoutClass(layout: DeskColumnTextLayout): string {
  return `desk-text-${layout}`;
}
