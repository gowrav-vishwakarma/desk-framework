import type { PivotCube, PivotNode } from './pivotCube';
import type { PivotLayout } from './pivotTypes';

export type PivotLineKind = 'item' | 'subtotal' | 'grand';

/** One table row on screen. */
export interface PivotViewRow {
  id: string;
  node: PivotNode;
  kind: PivotLineKind;
  /** Indent level in compact form, 0 for the top field. */
  depth: number;
  /** Compact form: the one label. */
  label: string;
  /** Tabular form: one label per row field; levels below `firstNew` repeat the row above. */
  labels: string[];
  firstNew: number;
  /** Has children to expand or collapse. */
  canToggle: boolean;
  expanded: boolean;
  /** False on an expanded group row when subtotals are off: its figures show on its children only. */
  showValues: boolean;
}

/** One value column on screen: an item (or subtotal, or grand total) of the column axis, for one value. */
export interface PivotViewColumn {
  id: string;
  node: PivotNode;
  valueIndex: number;
  kind: PivotLineKind;
  /** Header labels from the top level down, for a chart series or an export. */
  path: string[];
}

export interface PivotHeaderCell {
  id: string;
  label: string;
  colspan: number;
  rowspan: number;
  kind: PivotLineKind | 'value';
  node: PivotNode | null;
  canToggle: boolean;
  expanded: boolean;
}

export interface PivotView {
  rows: PivotViewRow[];
  columns: PivotViewColumn[];
  /** Column header rows above the values, merged as Excel draws them. Empty without values. */
  header: PivotHeaderCell[][];
  /** Label columns at the left: 1 in compact form, one per row field in tabular form. */
  labelColumns: number;
  /** Column items left out past `maxColumns`. */
  hiddenColumns: number;
}

export interface PivotViewOptions {
  /** "Sum of Net", one per value. */
  valueLabels: string[];
  /** Most value columns drawn. Default 400. */
  maxColumns?: number;
}

/** Rows and columns as they show, given which items are collapsed. */
export function buildPivotView(
  cube: PivotCube,
  layout: PivotLayout,
  collapsedRows: ReadonlySet<string>,
  collapsedCols: ReadonlySet<string>,
  options: PivotViewOptions,
): PivotView {
  const R = layout.rows.length;
  const C = layout.columns.length;
  const V = layout.values.length;
  const tabular = layout.form === 'tabular' && R > 1;
  const rows: PivotViewRow[] = [];
  const pathOf = (node: PivotNode): string[] => {
    const out: string[] = [];
    for (let at: PivotNode | null = node; at && at.depth > 0; at = at.parent) out.unshift(at.label);
    return out;
  };
  const isOpen = (node: PivotNode, collapsed: ReadonlySet<string>) => node.children.length > 0 && !collapsed.has(node.id);

  if (R === 0) {
    rows.push({ id: 'grand', node: cube.rowRoot, kind: 'grand', depth: 0, label: 'Total', labels: ['Total'], firstNew: 0, canToggle: false, expanded: false, showValues: true });
  } else {
    let previous: string[] = [];
    const line = (node: PivotNode, kind: PivotLineKind, expanded: boolean): PivotViewRow => {
      const labels = pathOf(node);
      if (kind === 'subtotal') labels[labels.length - 1] = `${labels[labels.length - 1] ?? ''} Total`;
      let firstNew = 0;
      if (tabular && kind === 'item') {
        while (firstNew < labels.length - 1 && previous[firstNew] === node.keys[firstNew]) firstNew += 1;
        previous = node.keys;
      } else previous = [];
      return {
        id: `${kind}:${node.id}`,
        node,
        kind,
        depth: node.depth - 1,
        label: labels[labels.length - 1] ?? '',
        labels,
        firstNew,
        canToggle: node.children.length > 0,
        expanded,
        showValues: kind !== 'item' || !expanded || layout.subtotals,
      };
    };
    const walk = (node: PivotNode): void => {
      const open = isOpen(node, collapsedRows);
      if (!tabular) {
        rows.push(line(node, 'item', open));
        if (open) node.children.forEach(walk);
        return;
      }
      if (!open) {
        rows.push(line(node, 'item', false));
        return;
      }
      node.children.forEach(walk);
      if (layout.subtotals) rows.push(line(node, 'subtotal', true));
    };
    cube.rowRoot.children.forEach(walk);
    if (layout.rowTotals) {
      rows.push({ id: 'grand', node: cube.rowRoot, kind: 'grand', depth: 0, label: 'Grand Total', labels: ['Grand Total'], firstNew: 0, canToggle: false, expanded: false, showValues: true });
    }
  }

  const columns: PivotViewColumn[] = [];
  const header: PivotHeaderCell[][] = [];
  let hiddenColumns = 0;
  const max = options.maxColumns ?? 400;
  const valueCells: PivotHeaderCell[] = [];
  const emit = (node: PivotNode, kind: PivotLineKind): void => {
    for (let index = 0; index < V; index += 1) {
      const id = `${kind}:${node.id}:${index}`;
      columns.push({ id, node, valueIndex: index, kind, path: kind === 'grand' ? ['Grand Total'] : pathOf(node) });
      valueCells.push({ id: `v:${id}`, label: options.valueLabels[index] ?? '', colspan: 1, rowspan: 1, kind: 'value', node, canToggle: false, expanded: false });
    }
  };

  if (V > 0) {
    if (C === 0) {
      emit(cube.colRoot, 'item');
      header.push(valueCells);
    } else {
      for (let level = 0; level < C; level += 1) header.push([]);
      /** Places a node's header and its value columns; returns how many columns it took. */
      const place = (node: PivotNode): number => {
        const level = node.depth - 1;
        const cells = header[level]!;
        if (columns.length + V > max) {
          hiddenColumns += 1;
          return 0;
        }
        const open = isOpen(node, collapsedCols);
        if (!open) {
          emit(node, 'item');
          cells.push({ id: `h:${node.id}`, label: node.label, colspan: V, rowspan: C - level, kind: 'item', node, canToggle: node.children.length > 0, expanded: false });
          return V;
        }
        const at = cells.length;
        cells.push({ id: `h:${node.id}`, label: node.label, colspan: 0, rowspan: 1, kind: 'item', node, canToggle: true, expanded: true });
        let span = 0;
        node.children.forEach((child) => (span += place(child)));
        if (span === 0) {
          cells.splice(at, 1);
          return 0;
        }
        cells[at]!.colspan = span;
        // The group's total is a column beside the group, not under its header.
        if (layout.subtotals && columns.length + V <= max) {
          emit(node, 'subtotal');
          cells.push({ id: `s:${node.id}`, label: `${node.label} Total`, colspan: V, rowspan: C - level, kind: 'subtotal', node, canToggle: false, expanded: false });
          span += V;
        }
        return span;
      };
      cube.colRoot.children.forEach(place);
      if (layout.columnTotals) {
        emit(cube.colRoot, 'grand');
        header[0]!.push({ id: 'h:grand', label: 'Grand Total', colspan: V, rowspan: C, kind: 'grand', node: cube.colRoot, canToggle: false, expanded: false });
      }
      // Value names get their own header row only when there is more than one value.
      if (V > 1) header.push(valueCells);
    }
  }

  return { rows, columns, header, labelColumns: tabular ? R : 1, hiddenColumns };
}
