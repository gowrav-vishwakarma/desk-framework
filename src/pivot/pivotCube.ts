import { evaluatePivotFormula, parsePivotFormula, type PivotFormula } from './pivotCalc';
import { pivotHasValueRules, pivotJudge, pivotLabelPasses } from './pivotFilters';
import { comparePivotKeys, pivotKey } from './pivotKeys';
import { pivotValueKey } from './pivotLayout';
import type { PivotAggregate, PivotAxisItem, PivotField, PivotLayout, PivotValueItem } from './pivotTypes';

/** One item on the row or column axis. The root (depth 0, id '') stands for the grand total. */
export interface PivotNode {
  id: string;
  key: string;
  label: string;
  depth: number;
  parent: PivotNode | null;
  children: PivotNode[];
  /** Keys from the top level down to this node. */
  keys: string[];
}

export interface PivotCube {
  rowRoot: PivotNode;
  colRoot: PivotNode;
  /** Facts left after the filters. */
  factCount: number;
  /** Rows those facts stand for: the facts themselves, or the grouped rows' `__rows`. */
  rowCount: number;
  /** The aggregate where a row and a column meet, or null when no fact falls there. */
  raw: (rowId: string, colId: string, valueIndex: number) => number | null;
  /** The figure the value's "show as" asks for: the aggregate or a percentage. */
  shown: (row: PivotNode, col: PivotNode, valueIndex: number) => number | null;
  /** The facts behind a cell, for a drill. */
  factsAt: (row: PivotNode, col: PivotNode) => Record<string, unknown>[];
  /** Leaf items of the axis opposite to `area`, before value filters: what a "chosen items" list offers. */
  otherLeaves: (area: 'rows' | 'columns') => { id: string; path: string[] }[];
  /** For each item of `area`, the leaf items of the other axis where it has a cell. Built from the cells that exist, never the full grid. */
  filled: (area: 'rows' | 'columns') => Map<string, PivotNode[]>;
  /** Per filtered level: items kept of those there were before the value filters. */
  filterStats: { area: 'rows' | 'columns'; field: string; kept: number; total: number }[];
  /** Items at each level of the axes (index 0 is the top level). */
  levels: { rows: number[]; columns: number[] };
}

interface Acc {
  sum: number;
  /** Numeric values seen. */
  nums: number;
  /** Non-blank values seen. */
  count: number;
  min: number;
  max: number;
  set: Set<string> | null;
  /** A calculated value: one sum per field its formula reads. */
  parts: Acc[] | null;
}

const SEP = '\u0001';
const CELL = '\u0002';

function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function add(acc: Acc, value: unknown): void {
  if (value === null || value === undefined || value === '') return;
  acc.count += 1;
  if (acc.set) acc.set.add(typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean));
  const n = numberOf(value);
  if (n === null) return;
  acc.nums += 1;
  acc.sum += n;
  if (n < acc.min) acc.min = n;
  if (n > acc.max) acc.max = n;
}

/**
 * A grouped row (from a summary run) stands for `__rows` rows. A key's value counts once per row;
 * a value column brings its sum, count, min and max (`<field>`, `__n`, `__min`, `__max`).
 */
function addGrouped(acc: Acc, fact: Record<string, unknown>, field: string, isKey: boolean): void {
  if (isKey) {
    const value = fact[field];
    const rows = Number(fact.__rows) || 0;
    if (value === null || value === undefined || value === '' || !rows) return;
    acc.count += rows;
    if (acc.set) acc.set.add(typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean));
    const n = numberOf(value);
    if (n === null) return;
    acc.nums += rows;
    acc.sum += n * rows;
    if (n < acc.min) acc.min = n;
    if (n > acc.max) acc.max = n;
    return;
  }
  const count = Number(fact[`${field}__n`]) || 0;
  if (!count) return;
  acc.count += count;
  const sum = numberOf(fact[field]);
  if (sum === null) return;
  acc.nums += count;
  acc.sum += sum;
  const min = numberOf(fact[`${field}__min`]) ?? sum;
  const max = numberOf(fact[`${field}__max`]) ?? sum;
  if (min < acc.min) acc.min = min;
  if (max > acc.max) acc.max = max;
}

/** The sum of a field over facts, raw or grouped (`keys`: the grouped rows' key columns). */
export function pivotFieldSum(facts: readonly Record<string, unknown>[], field: string, keys?: ReadonlySet<string>): number {
  let total = 0;
  for (const fact of facts) {
    const value = Number(fact[field]) || 0;
    total += keys?.has(field) ? value * (Number(fact.__rows) || 0) : value;
  }
  return total;
}

function result(acc: Acc, kind: PivotAggregate): number | null {
  switch (kind) {
    case 'count':
      return acc.count;
    case 'distinct':
      return acc.set?.size ?? 0;
    case 'avg':
      return acc.nums ? acc.sum / acc.nums : null;
    case 'min':
      return acc.nums ? acc.min : null;
    case 'max':
      return acc.nums ? acc.max : null;
    default:
      return acc.nums ? acc.sum : acc.count ? 0 : null;
  }
}

function root(): PivotNode {
  return { id: '', key: '', label: 'Grand Total', depth: 0, parent: null, children: [], keys: [] };
}

export interface PivotCubeOptions {
  /** First month of the financial year, 1 to 12. Default 4 (April). */
  fyStartMonth?: number;
  /**
   * The facts are grouped rows from a summary run, with these key columns: each stands for
   * `__rows` rows and carries its value columns' sums and counts. Every figure comes out as from
   * the rows themselves, so long as a distinct count's field is a key.
   */
  grouped?: ReadonlySet<string> | undefined;
}

/**
 * Aggregates every row-and-column combination, subtotals included, in one pass over the facts:
 * each fact adds to its cell at every depth of both axes. Then each axis is sorted.
 */
function buildPass(
  facts: readonly Record<string, unknown>[],
  layout: PivotLayout,
  fields: ReadonlyMap<string, PivotField>,
  options: PivotCubeOptions,
  drop: { rows: Set<string>; columns: Set<string> } | null,
): PivotCube {
  const fyStart = options.fyStartMonth ?? 4;
  const grouped = options.grouped;
  const take = (into: Acc, fact: Record<string, unknown>, field: string) => (grouped ? addGrouped(into, fact, field, grouped.has(field)) : add(into, fact[field]));
  const keyOf = (fact: Record<string, unknown>, item: PivotAxisItem) => pivotKey(fact[item.field], fields.get(item.field), item, fyStart);
  const filtering = [...layout.filters, ...layout.rows, ...layout.columns]
    .filter((item) => item.exclude?.length || item.label?.text.trim())
    .map((item) => ({ item, out: new Set(item.exclude ?? []), rule: item.label?.text.trim() ? item.label : null }));
  /** True when a fact sits under an item the value filters dropped. */
  const dropped = (fact: Record<string, unknown>, items: PivotAxisItem[], bad: Set<string>): boolean => {
    let id = '';
    for (let depth = 0; depth < items.length && bad.size; depth += 1) {
      const { key } = keyOf(fact, items[depth]!);
      id = depth === 0 ? key : `${id}${SEP}${key}`;
      if (bad.has(id)) return true;
    }
    return false;
  };
  const values: PivotValueItem[] = layout.values;
  // A calculated value's formula, parsed once; a formula that no longer parses shows empty cells.
  const known = [...fields.values()];
  const formulas: (PivotFormula | 'broken' | null)[] = values.map((value) => {
    const calc = layout.calculated?.find((item) => item.id === value.field);
    if (!calc) return null;
    const parsed = parsePivotFormula(calc.formula, known);
    return parsed.ok ? parsed.formula : 'broken';
  });
  const cells = new Map<string, Acc[]>();
  const rowRoot = root();
  const colRoot = root();
  const rowNodes = new Map<string, PivotNode>([['', rowRoot]]);
  const colNodes = new Map<string, PivotNode>([['', colRoot]]);
  const kept: Record<string, unknown>[] = [];
  let rowCount = 0;
  const rowPaths: string[][] = [];
  const colPaths: string[][] = [];

  /** Node ids from the root down a fact's keys, adding nodes it is the first to reach. */
  function path(fact: Record<string, unknown>, items: PivotAxisItem[], nodes: Map<string, PivotNode>, top: PivotNode, keys: string[]): string[] {
    const ids = [''];
    let parent = top;
    let id = '';
    items.forEach((item, depth) => {
      const { key, label } = keyOf(fact, item);
      keys.push(key);
      id = depth === 0 ? key : `${id}${SEP}${key}`;
      let node = nodes.get(id);
      if (!node) {
        node = { id, key, label, depth: depth + 1, parent, children: [], keys: [...keys] };
        nodes.set(id, node);
        parent.children.push(node);
      }
      ids.push(id);
      parent = node;
    });
    return ids;
  }

  const acc = (distinct: boolean, parts: number): Acc => ({
    sum: 0,
    nums: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
    set: distinct ? new Set() : null,
    parts: parts ? Array.from({ length: parts }, () => acc(false, 0)) : null,
  });
  const blank = (): Acc[] =>
    values.map((value, index) => {
      const formula = formulas[index];
      return acc(!formula && value.aggregate === 'distinct', formula && formula !== 'broken' ? formula.refs.length : 0);
    });

  for (const fact of facts) {
    const hidden = filtering.some(({ item, out, rule }) => {
      const { key, label } = keyOf(fact, item);
      return out.has(key) || (rule !== null && !pivotLabelPasses(rule, label));
    });
    if (hidden) continue;
    if (drop && (dropped(fact, layout.rows, drop.rows) || dropped(fact, layout.columns, drop.columns))) continue;
    kept.push(fact);
    rowCount += grouped ? Number(fact.__rows) || 0 : 1;
    const rowKeys: string[] = [];
    const colKeys: string[] = [];
    const rows = path(fact, layout.rows, rowNodes, rowRoot, rowKeys);
    const cols = path(fact, layout.columns, colNodes, colRoot, colKeys);
    rowPaths.push(rowKeys);
    colPaths.push(colKeys);
    if (!values.length) continue;
    for (const r of rows) {
      for (const c of cols) {
        const id = `${r}${CELL}${c}`;
        let accs = cells.get(id);
        if (!accs) {
          accs = blank();
          cells.set(id, accs);
        }
        values.forEach((value, index) => {
          const into = accs[index]!;
          const formula = formulas[index];
          if (!formula) take(into, fact, value.field);
          else if (formula !== 'broken') formula.refs.forEach((ref, part) => take(into.parts![part]!, fact, ref));
        });
      }
    }
  }

  const raw = (rowId: string, colId: string, valueIndex: number): number | null => {
    const cell = cells.get(`${rowId}${CELL}${colId}`)?.[valueIndex];
    const value = values[valueIndex];
    if (!cell || !value) return null;
    const formula = formulas[valueIndex];
    if (formula === 'broken') return null;
    if (formula) return evaluatePivotFormula(formula, cell.parts!.map((part) => part.sum));
    return result(cell, value.aggregate);
  };

  /** Each level by its item's sort: label order, or the first value's total (on the other axis' root). */
  function sortTree(node: PivotNode, items: PivotAxisItem[], total: (id: string) => number | null): void {
    const item = items[node.depth];
    if (!item || !node.children.length) return;
    const numeric = fields.get(item.field)?.kind === 'number' && !item.dateGroup;
    const sort = item.sort ?? 'asc';
    if (sort === 'valueDesc' || sort === 'valueAsc') {
      const sign = sort === 'valueDesc' ? -1 : 1;
      const of = (child: PivotNode) => total(child.id) ?? (sign < 0 ? -Infinity : Infinity);
      node.children.sort((a, b) => sign * (of(a) - of(b)) || comparePivotKeys(a.key, b.key, numeric));
    } else {
      const sign = sort === 'desc' ? -1 : 1;
      node.children.sort((a, b) => sign * comparePivotKeys(a.key, b.key, numeric));
    }
    node.children.forEach((child) => sortTree(child, items, total));
  }
  sortTree(rowRoot, layout.rows, (id) => raw(id, '', 0));
  sortTree(colRoot, layout.columns, (id) => raw('', id, 0));

  const shown = (row: PivotNode, col: PivotNode, valueIndex: number): number | null => {
    const value = raw(row.id, col.id, valueIndex);
    const showAs = values[valueIndex]?.showAs ?? 'value';
    if (value === null || showAs === 'value') return value;
    const base =
      showAs === 'pctGrand'
        ? raw('', '', valueIndex)
        : showAs === 'pctColumn'
          ? raw('', col.id, valueIndex)
          : showAs === 'pctRow'
            ? raw(row.id, '', valueIndex)
            : raw(row.parent?.id ?? row.id, col.id, valueIndex);
    return base ? (value / base) * 100 : null;
  };

  const startsWith = (keys: string[], prefix: string[]) => prefix.every((key, index) => keys[index] === key);
  const factsAt = (row: PivotNode, col: PivotNode): Record<string, unknown>[] =>
    kept.filter((_fact, index) => startsWith(rowPaths[index]!, row.keys) && startsWith(colPaths[index]!, col.keys));

  const count = (nodes: Map<string, PivotNode>, length: number): number[] => {
    const out = Array.from({ length }, () => 0);
    for (const node of nodes.values()) if (node.depth > 0) out[node.depth - 1]! += 1;
    return out;
  };
  const leafInfo = (root: PivotNode, depth: number) => leafNodes(root, depth).map((node) => ({ id: node.id, path: pathLabels(node) }));
  const otherLeaves = (area: 'rows' | 'columns') => (area === 'rows' ? leafInfo(colRoot, layout.columns.length) : leafInfo(rowRoot, layout.rows.length));
  const levels = { rows: count(rowNodes, layout.rows.length), columns: count(colNodes, layout.columns.length) };

  let filledRows: Map<string, PivotNode[]> | null = null;
  let filledCols: Map<string, PivotNode[]> | null = null;
  const filled = (area: 'rows' | 'columns'): Map<string, PivotNode[]> => {
    const cached = area === 'rows' ? filledRows : filledCols;
    if (cached) return cached;
    const out = new Map<string, PivotNode[]>();
    const leafDepth = area === 'rows' ? layout.columns.length : layout.rows.length;
    const others = area === 'rows' ? colNodes : rowNodes;
    for (const key of cells.keys()) {
      const at = key.indexOf(CELL);
      const mine = area === 'rows' ? key.slice(0, at) : key.slice(at + 1);
      const other = others.get(area === 'rows' ? key.slice(at + 1) : key.slice(0, at));
      if (!other || other.depth !== leafDepth) continue;
      const list = out.get(mine);
      if (list) list.push(other);
      else out.set(mine, [other]);
    }
    if (area === 'rows') filledRows = out;
    else filledCols = out;
    return out;
  };

  return { rowRoot, colRoot, factCount: kept.length, rowCount, raw, shown, factsAt, otherLeaves, filled, filterStats: [], levels };
}

/** The items at a given depth, in tree order; with no depth (no fields on the axis), the root. */
function leafNodes(root: PivotNode, depth: number): PivotNode[] {
  if (depth === 0) return [root];
  const out: PivotNode[] = [];
  const walk = (node: PivotNode) => {
    if (node.depth === depth) out.push(node);
    else node.children.forEach(walk);
  };
  root.children.forEach(walk);
  return out;
}

/** What the judge needs of the other axis' leaves, for the axis `area` being judged. */
function leafInput(cube: PivotCube, area: 'rows' | 'columns', depth: number) {
  const leaves = leafNodes(area === 'rows' ? cube.colRoot : cube.rowRoot, depth);
  const filled = cube.filled(area);
  return { leafCount: leaves.length, leafIds: new Set(leaves.map((leaf) => leaf.id)), filled: (node: PivotNode) => filled.get(node.id) ?? [] };
}

function pathLabels(node: PivotNode): string[] {
  const out: string[] = [];
  for (let at: PivotNode | null = node; at && at.depth > 0; at = at.parent) out.unshift(at.label);
  return out;
}

/**
 * The pivot's cube. With value filters or top rules on Rows or Columns, it is built twice: the
 * first time to read every figure and judge the items, the second over only the facts that stay,
 * so subtotals and grand totals cover what is visible. Every axis is judged against the first
 * build, so a filter on rows and one on columns do not depend on each other.
 */
export function buildPivotCube(
  facts: readonly Record<string, unknown>[],
  layout: PivotLayout,
  fields: ReadonlyMap<string, PivotField>,
  options: PivotCubeOptions = {},
): PivotCube {
  const first = buildPass(facts, layout, fields, options, null);
  const judgeRows = layout.rows.some(pivotHasValueRules);
  const judgeCols = layout.columns.some(pivotHasValueRules);
  if (!judgeRows && !judgeCols) return first;

  const keys = layout.values.map(pivotValueKey);
  const indexOf = (key: string) => keys.indexOf(key);
  const hasValue = (key: string) => indexOf(key) >= 0;
  const rowFail = judgeRows
    ? pivotJudge<PivotNode>({
        items: layout.rows,
        root: first.rowRoot,
        ...leafInput(first, 'rows', layout.columns.length),
        otherRoot: first.colRoot,
        figure: (node, other, key) => first.shown(node, other, indexOf(key)),
        hasValue,
      })
    : new Set<string>();
  const colFail = judgeCols
    ? pivotJudge<PivotNode>({
        items: layout.columns,
        root: first.colRoot,
        ...leafInput(first, 'columns', layout.rows.length),
        otherRoot: first.rowRoot,
        figure: (node, other, key) => first.shown(other, node, indexOf(key)),
        hasValue,
      })
    : new Set<string>();

  const second = rowFail.size || colFail.size ? buildPass(facts, layout, fields, options, { rows: rowFail, columns: colFail }) : first;
  const filterStats: PivotCube['filterStats'] = [];
  (['rows', 'columns'] as const).forEach((area) => {
    layout[area].forEach((item, depth) => {
      if (pivotHasValueRules(item)) filterStats.push({ area, field: item.field, kept: second.levels[area][depth] ?? 0, total: first.levels[area][depth] ?? 0 });
    });
  });
  return { ...second, otherLeaves: first.otherLeaves, filterStats };
}

/** The distinct keys an axis item takes over all facts, in label order, with how many facts each has. */
export function pivotItemKeys(
  facts: readonly Record<string, unknown>[],
  item: PivotAxisItem,
  field: PivotField | undefined,
  fyStartMonth = 4,
  /** Grouped facts: each counts its `__rows`. */
  grouped = false,
): { key: string; label: string; count: number }[] {
  const seen = new Map<string, { key: string; label: string; count: number }>();
  for (const fact of facts) {
    const { key, label } = pivotKey(fact[item.field], field, item, fyStartMonth);
    const rows = grouped ? Number(fact.__rows) || 0 : 1;
    const entry = seen.get(key);
    if (entry) entry.count += rows;
    else seen.set(key, { key, label, count: rows });
  }
  const numeric = field?.kind === 'number' && !item.dateGroup;
  return [...seen.values()].sort((a, b) => comparePivotKeys(a.key, b.key, numeric));
}
