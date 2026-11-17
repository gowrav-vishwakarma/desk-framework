import * as XLSX from 'xlsx-js-style';
import type { PivotCube } from './pivotCube';
import { pivotIsShare } from './pivotFormat';
import type { PivotLayout } from './pivotTypes';
import type { PivotView } from './pivotView';

const BOLD = { font: { bold: true } };
const HEAD = { font: { bold: true }, fill: { fgColor: { rgb: 'E9ECEF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
const TOTAL = { font: { bold: true }, fill: { fgColor: { rgb: 'F4F6F8' } } };

/**
 * The pivot as it shows, to a spreadsheet: merged column headers, labels indented (compact) or one
 * column per row field (tabular), figures as numbers with a number format, totals in bold.
 */
export function exportPivotXlsx(
  view: PivotView,
  cube: PivotCube,
  layout: PivotLayout,
  labels: { rowFields: string[]; corner: string },
  fileName: string,
): void {
  const sheet: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const put = (r: number, c: number, cell: XLSX.CellObject) => (sheet[XLSX.utils.encode_cell({ r, c })] = cell);
  const L = view.labelColumns;
  const H = Math.max(1, view.header.length);

  // Corner: the value name over the row field names.
  if (H > 1) {
    put(0, 0, { t: 's', v: labels.corner, s: HEAD });
    merges.push({ s: { r: 0, c: 0 }, e: { r: H - 2, c: L - 1 } });
  }
  const names = L > 1 ? labels.rowFields : [labels.rowFields.join(' / ') || labels.corner];
  names.forEach((name, c) => put(H - 1, c, { t: 's', v: name, s: HEAD }));

  // Header rows, placing each cell in the first free slot of its row.
  const taken = new Set<string>();
  view.header.forEach((row, r) => {
    let c = L;
    for (const cell of row) {
      while (taken.has(`${r}:${c}`)) c += 1;
      put(r, c, { t: 's', v: cell.label, s: HEAD });
      for (let dr = 0; dr < cell.rowspan; dr += 1) for (let dc = 0; dc < cell.colspan; dc += 1) taken.add(`${r + dr}:${c + dc}`);
      if (cell.rowspan > 1 || cell.colspan > 1) merges.push({ s: { r, c }, e: { r: r + cell.rowspan - 1, c: c + cell.colspan - 1 } });
      c += cell.colspan;
    }
  });

  const formats = layout.values.map((item) => (pivotIsShare(item) ? '0.00"%"' : item.aggregate === 'count' || item.aggregate === 'distinct' ? '#,##0' : '#,##0.00'));
  view.rows.forEach((row, index) => {
    const r = H + index;
    const style = row.kind === 'item' && !(row.canToggle && row.expanded) ? undefined : row.kind === 'item' ? BOLD : TOTAL;
    if (L > 1) row.labels.forEach((text, c) => put(r, c, { t: 's', v: c < row.firstNew ? '' : text, ...(style ? { s: style } : {}) }));
    else put(r, 0, { t: 's', v: `${'    '.repeat(row.depth)}${row.label}`, ...(style ? { s: style } : {}) });
    if (!row.showValues) return;
    view.columns.forEach((column, c) => {
      const value = cube.shown(row.node, column.node, column.valueIndex);
      if (value === null) return;
      const bold = style ?? (column.kind === 'item' ? undefined : BOLD);
      put(r, L + c, { t: 'n', v: value, z: formats[column.valueIndex] ?? '#,##0.00', ...(bold ? { s: bold } : {}) });
    });
  });

  sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: H + Math.max(0, view.rows.length - 1), c: L + Math.max(0, view.columns.length - 1) } });
  sheet['!merges'] = merges;
  sheet['!cols'] = [...Array.from({ length: L }, () => ({ wch: L > 1 ? 20 : 32 })), ...view.columns.map(() => ({ wch: 14 }))];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Pivot');
  XLSX.writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}
