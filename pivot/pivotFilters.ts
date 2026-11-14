import type { PivotAxisItem, PivotCompare, PivotCondition, PivotLabelRule, PivotTopFilter, PivotValueFilter } from './pivotTypes';

export const PIVOT_COMPARES: readonly { id: PivotCompare; label: string }[] = [
  { id: 'gt', label: 'is greater than' },
  { id: 'gte', label: 'is at least' },
  { id: 'lt', label: 'is less than' },
  { id: 'lte', label: 'is at most' },
  { id: 'eq', label: 'equals' },
  { id: 'ne', label: 'does not equal' },
  { id: 'between', label: 'is between' },
  { id: 'notBetween', label: 'is not between' },
  { id: 'blank', label: 'is blank' },
  { id: 'notBlank', label: 'is not blank' },
];

export const PIVOT_LABEL_OPS: readonly { id: PivotLabelRule['op']; label: string }[] = [
  { id: 'contains', label: 'contains' },
  { id: 'notContains', label: 'does not contain' },
  { id: 'begins', label: 'begins with' },
  { id: 'ends', label: 'ends with' },
  { id: 'equals', label: 'equals' },
  { id: 'notEquals', label: 'does not equal' },
];

export const PIVOT_MATCHES: readonly { id: NonNullable<PivotValueFilter['match']>; label: string }[] = [
  { id: 'any', label: 'any cell' },
  { id: 'all', label: 'every cell' },
  { id: 'none', label: 'no cell' },
  { id: 'atLeast', label: 'at least N cells' },
];

const COMPARE_IDS = new Set<string>(PIVOT_COMPARES.map((entry) => entry.id));
const LABEL_IDS = new Set<string>(PIVOT_LABEL_OPS.map((entry) => entry.id));
const MATCH_IDS = new Set<string>(PIVOT_MATCHES.map((entry) => entry.id));

/** True when a figure meets the condition. An empty figure (null) fails every test except `blank`. */
export function pivotTest(condition: PivotCondition, figure: number | null): boolean {
  if (condition.op === 'blank') return figure === null;
  if (condition.op === 'notBlank') return figure !== null;
  if (figure === null) return false;
  const x = condition.abs ? Math.abs(figure) : figure;
  const a = condition.a ?? 0;
  const b = condition.b ?? a;
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  switch (condition.op) {
    case 'gt':
      return x > a;
    case 'gte':
      return x >= a;
    case 'lt':
      return x < a;
    case 'lte':
      return x <= a;
    case 'eq':
      return x === a;
    case 'ne':
      return x !== a;
    case 'between':
      return x >= low && x <= high;
    default:
      return x < low || x > high;
  }
}

/** True when an item's label passes the rule (case-insensitive). */
export function pivotLabelPasses(rule: PivotLabelRule, label: string): boolean {
  const text = label.toLowerCase();
  const want = rule.text.trim().toLowerCase();
  switch (rule.op) {
    case 'contains':
      return text.includes(want);
    case 'notContains':
      return !text.includes(want);
    case 'begins':
      return text.startsWith(want);
    case 'ends':
      return text.endsWith(want);
    case 'equals':
      return text === want;
    default:
      return text !== want;
  }
}

/** Has a rule that needs the figures (so the cube builds twice). */
export function pivotHasValueRules(item: PivotAxisItem): boolean {
  return Boolean(item.valueFilters?.length || item.top);
}

/** Has any filter: ticked items, a label rule, a value condition or a top rule. */
export function pivotItemFiltered(item: PivotAxisItem): boolean {
  return Boolean(item.exclude?.length || item.label?.text.trim() || pivotHasValueRules(item));
}

/** A copy without any filter, keeping the field, grouping and sort. */
export function pivotClearFilters(item: PivotAxisItem): void {
  delete item.exclude;
  delete item.label;
  delete item.valueFilters;
  delete item.top;
}

// Text for chips, the hint line and automation readouts.

const SYMBOL: Partial<Record<PivotCompare, string>> = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', ne: '<>' };

export function pivotConditionText(condition: PivotCondition): string {
  const bare = condition.abs ? '|x|' : '';
  switch (condition.op) {
    case 'blank':
      return 'is blank';
    case 'notBlank':
      return 'is not blank';
    case 'between':
      return `${bare ? `${bare} ` : ''}between ${condition.a ?? 0} and ${condition.b ?? condition.a ?? 0}`;
    case 'notBetween':
      return `${bare ? `${bare} ` : ''}not between ${condition.a ?? 0} and ${condition.b ?? condition.a ?? 0}`;
    default:
      return `${bare ? `${bare} ` : ''}${SYMBOL[condition.op] ?? condition.op} ${condition.a ?? 0}`;
  }
}

/** "Count of account >= 2 in any column". */
export function pivotValueFilterText(filter: PivotValueFilter, valueLabel: string, otherName: string): string {
  const base = `${valueLabel} ${pivotConditionText(filter)}`;
  if (filter.of === 'total') return `${base} in total`;
  const among = filter.among?.length ? ` of ${filter.among.length} chosen` : '';
  switch (filter.match ?? 'any') {
    case 'all':
      return `${base} in every ${otherName}${among}`;
    case 'none':
      return `${base} in no ${otherName}${among}`;
    case 'atLeast':
      return `${base} in at least ${filter.n ?? 1} ${otherName}s${among}`;
    default:
      return `${base} in any ${otherName}${among}`;
  }
}

export function pivotTopText(top: PivotTopFilter, valueLabel: string): string {
  const side = top.dir === 'top' ? 'Top' : 'Bottom';
  if (top.by === 'share') return `${side} ${top.n}% of the total by ${valueLabel}`;
  return `${side} ${top.n}${top.by === 'percent' ? '%' : ''} by ${valueLabel}`;
}

export function pivotLabelText(rule: PivotLabelRule): string {
  return `${PIVOT_LABEL_OPS.find((entry) => entry.id === rule.op)?.label ?? rule.op} "${rule.text}"`;
}

/** Each active rule of an item as text. `valueLabel` turns a value key into its name. */
export function pivotFilterSummary(item: PivotAxisItem, valueLabel: (key: string) => string, otherName: string): string[] {
  const out: string[] = [];
  if (item.label?.text.trim()) out.push(pivotLabelText(item.label));
  for (const filter of item.valueFilters ?? []) out.push(pivotValueFilterText(filter, valueLabel(filter.value), otherName));
  if (item.top) out.push(pivotTopText(item.top, valueLabel(item.top.value)));
  return out;
}

// Judging items.

/** What the judge needs of a tree node. */
export interface JudgeNode {
  id: string;
  label: string;
  children: JudgeNode[];
}

export interface JudgeInput<T extends JudgeNode> {
  items: readonly PivotAxisItem[];
  root: T;
  /** How many leaf items the other axis has (one when it has no fields: its root). */
  leafCount: number;
  /** The ids of those leaf items. */
  leafIds: ReadonlySet<string>;
  /** The leaf items of the other axis where this item has a cell. Empty cells are not listed, so a big grid stays cheap. */
  filled: (node: T) => readonly T[];
  /** The other axis' root: an item's total sits where it meets this. */
  otherRoot: T;
  /** The figure where an item of this axis meets an item of the other. Null: nothing there. */
  figure: (node: T, other: T, valueKey: string) => number | null;
  /** Whether the value is still in Values. */
  hasValue: (valueKey: string) => boolean;
}

function passesValueFilter<T extends JudgeNode>(filter: PivotValueFilter, node: T, input: JudgeInput<T>): boolean {
  if (filter.of === 'total') return pivotTest(filter, input.figure(node, input.otherRoot, filter.value));
  const chosen = filter.among?.length ? new Set(filter.among) : null;
  // Only the cells that exist are read; the empty ones are counted, since only `blank` passes on them.
  const considered = chosen ? [...chosen].filter((id) => input.leafIds.has(id)).length : input.leafCount;
  let seen = 0;
  let passed = 0;
  for (const leaf of input.filled(node)) {
    if (chosen && !chosen.has(leaf.id)) continue;
    seen += 1;
    if (pivotTest(filter, input.figure(node, leaf, filter.value))) passed += 1;
  }
  if (filter.op === 'blank') passed += Math.max(0, considered - seen);
  switch (filter.match ?? 'any') {
    case 'all':
      return considered > 0 && passed === considered;
    case 'none':
      return passed === 0;
    case 'atLeast':
      return passed >= Math.max(1, filter.n ?? 1);
    default:
      return passed > 0;
  }
}

/** The siblings a top or bottom rule keeps, ranked by the value's total. */
function topKept<T extends JudgeNode>(top: PivotTopFilter, siblings: T[], input: JudgeInput<T>): Set<string> {
  const worst = top.dir === 'top' ? -Infinity : Infinity;
  const sign = top.dir === 'top' ? -1 : 1;
  const totals = new Map(siblings.map((node) => [node.id, input.figure(node, input.otherRoot, top.value) ?? worst]));
  const ranked = [...siblings].sort((a, b) => sign * (totals.get(a.id)! - totals.get(b.id)!) || 0);
  let take: number;
  if (top.by === 'items') take = top.n;
  else if (top.by === 'percent') take = Math.ceil((ranked.length * top.n) / 100);
  else {
    // Pareto: items are taken in rank order until their running total reaches n% of the whole.
    const whole = ranked.reduce((sum, node) => sum + Math.abs(totals.get(node.id)!), 0);
    let run = 0;
    take = 0;
    for (const node of ranked) {
      take += 1;
      run += Math.abs(totals.get(node.id)!);
      if (whole > 0 && run >= (whole * top.n) / 100) break;
    }
  }
  return new Set(ranked.slice(0, Math.max(1, Math.floor(take))).map((node) => node.id));
}

/** The ids of the items that fail their level's value conditions or top rule. Their facts are dropped. */
export function pivotJudge<T extends JudgeNode>(input: JudgeInput<T>): Set<string> {
  const failed = new Set<string>();
  const walk = (node: T, depth: number): void => {
    const item = input.items[depth];
    if (!item) return;
    const filters = (item.valueFilters ?? []).filter((filter) => input.hasValue(filter.value));
    let siblings = node.children as T[];
    if (filters.length) {
      const kept: T[] = [];
      for (const child of siblings) {
        if (filters.every((filter) => passesValueFilter(filter, child, input))) kept.push(child);
        else failed.add(child.id);
      }
      siblings = kept;
    }
    if (item.top && input.hasValue(item.top.value) && siblings.length) {
      const keep = topKept(item.top, siblings, input);
      for (const child of siblings) if (!keep.has(child.id)) failed.add(child.id);
      siblings = siblings.filter((child) => keep.has(child.id));
    }
    for (const child of siblings) walk(child, depth + 1);
  };
  walk(input.root, 0);
  return failed;
}

// Reading rules as stored: anything not understood is dropped.

const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

export function cleanPivotCondition(raw: unknown): PivotCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as Partial<PivotCondition>;
  if (typeof given.op !== 'string' || !COMPARE_IDS.has(given.op)) return null;
  const out: PivotCondition = { op: given.op };
  if (given.op !== 'blank' && given.op !== 'notBlank') {
    const a = num(given.a);
    if (a === undefined) return null;
    out.a = a;
    if (given.op === 'between' || given.op === 'notBetween') {
      const b = num(given.b);
      if (b === undefined) return null;
      out.b = b;
    }
    if (given.abs) out.abs = true;
  }
  return out;
}

function cleanValueFilter(raw: unknown): PivotValueFilter | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as Partial<PivotValueFilter>;
  const condition = cleanPivotCondition(given);
  if (!condition || typeof given.value !== 'string' || !given.value) return null;
  const out: PivotValueFilter = { ...condition, value: given.value, of: given.of === 'cells' ? 'cells' : 'total' };
  if (out.of === 'cells') {
    const match = typeof given.match === 'string' && MATCH_IDS.has(given.match) ? given.match : 'any';
    if (match !== 'any') out.match = match;
    if (match === 'atLeast') out.n = Math.max(1, Math.floor(num(given.n) ?? 1));
    const among = Array.isArray(given.among) ? given.among.filter((id): id is string => typeof id === 'string') : [];
    if (among.length) out.among = among;
  }
  return out;
}

export function cleanPivotValueFilters(raw: unknown): PivotValueFilter[] {
  return (Array.isArray(raw) ? raw : []).map(cleanValueFilter).filter((filter): filter is PivotValueFilter => filter !== null);
}

export function cleanPivotTop(raw: unknown): PivotTopFilter | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as Partial<PivotTopFilter>;
  const n = num(given.n);
  if (typeof given.value !== 'string' || !given.value || n === undefined || n <= 0) return null;
  const by = given.by === 'percent' || given.by === 'share' ? given.by : 'items';
  return { value: given.value, dir: given.dir === 'bottom' ? 'bottom' : 'top', by, n: by === 'items' ? Math.floor(n) || 1 : Math.min(100, n) };
}

export function cleanPivotLabel(raw: unknown): PivotLabelRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw as Partial<PivotLabelRule>;
  if (typeof given.op !== 'string' || !LABEL_IDS.has(given.op) || typeof given.text !== 'string' || !given.text.trim()) return null;
  return { op: given.op, text: given.text };
}
