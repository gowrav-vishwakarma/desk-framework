import type { DeskOpDef } from '../automation/types';
import { parsePivotFormula, pivotCalcId, type PivotCalcField } from './pivotCalc';
import type { PivotCube, PivotNode } from './pivotCube';
import { cleanPivotCondition, cleanPivotLabel, cleanPivotTop, cleanPivotValueFilters, pivotFilterSummary } from './pivotFilters';
import { clonePivotLayout, pivotAddField, pivotMoveItem, pivotRemoveField, pivotRemoveItem, pivotSwapAxes, pivotValueKey, pivotValueLabel } from './pivotLayout';
import type { PivotView } from './pivotView';
import { PIVOT_AGGREGATES, PIVOT_AREAS, PIVOT_DATE_GROUPS, PIVOT_SHOW_AS, PIVOT_SORTS, type PivotArea, type PivotAxisItem, type PivotChartType, type PivotCondition, type PivotField, type PivotLayout } from './pivotTypes';

const ids = (list: readonly { id: string }[]): string[] => list.map((item) => item.id);

export type StrictPivot = { ok: true; layout: PivotLayout } | { ok: false; error: string; reason?: string };

const bad = (error: string, reason?: string): StrictPivot => ({ ok: false, error, ...(reason ? { reason } : {}) });

/**
 * A layout checked against the fields the page has. Unlike `normalizePivotLayout`, which drops what it
 * does not know, this refuses it and says what to use instead.
 */
export function strictPivotLayout(raw: unknown, fields: readonly PivotField[], base: PivotLayout): StrictPivot {
  if (!raw || typeof raw !== 'object') return bad('layout must be an object');
  const source = raw as Partial<PivotLayout>;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const calcs = new Map((source.calculated ?? base.calculated ?? []).map((calc) => [calc.id, calc]));
  const known = `fields: ${[...byId.keys()].join(', ')}`;
  const next = clonePivotLayout(base);
  const seen = new Set<string>();
  for (const area of ['rows', 'columns', 'filters'] as const) {
    if (source[area] === undefined) continue;
    if (!Array.isArray(source[area])) return bad(`${area} must be a list`);
    next[area] = [];
    for (const entry of source[area] ?? []) {
      const field = byId.get(entry?.field);
      if (!field || field.calc) return bad(`${area}: ${String(entry?.field)} is not a field of this pivot`, known);
      if (seen.has(field.id)) return bad(`${field.id} is on more than one axis`);
      seen.add(field.id);
      if (entry.dateGroup && (field.kind !== 'date' || !ids(PIVOT_DATE_GROUPS).includes(entry.dateGroup))) return bad(`${field.id}: dateGroup ${entry.dateGroup} is not allowed`, `date groups: ${ids(PIVOT_DATE_GROUPS).join(', ')} (date fields only)`);
      if (entry.sort && !ids(PIVOT_SORTS).includes(entry.sort)) return bad(`${field.id}: sort ${entry.sort} is not allowed`, ids(PIVOT_SORTS).join(', '));
      const filter: Partial<PivotAxisItem> = {};
      if (entry.label !== undefined) {
        const label = cleanPivotLabel(entry.label);
        if (!label) return bad(`${field.id}: label must be { op, text }`, 'ops: contains, notContains, begins, ends, equals, notEquals');
        filter.label = label;
      }
      if (entry.valueFilters !== undefined) {
        if (area === 'filters') return bad(`${field.id}: value filters work on rows and columns only`);
        const list = Array.isArray(entry.valueFilters) ? entry.valueFilters : [];
        const clean = cleanPivotValueFilters(list);
        if (clean.length !== list.length) return bad(`${field.id}: a value filter is not valid`, '{ value: "field:aggregate", of: "total"|"cells", match?: any|all|none|atLeast, n?, among?, op, a, b?, abs? }; ops: gt, gte, lt, lte, eq, ne, between, notBetween, blank, notBlank');
        if (clean.length) filter.valueFilters = clean;
      }
      if (entry.top !== undefined) {
        if (area === 'filters') return bad(`${field.id}: top works on rows and columns only`);
        const top = cleanPivotTop(entry.top);
        if (!top) return bad(`${field.id}: top must be { value, dir: top|bottom, by: items|percent|share, n }`);
        filter.top = top;
      }
      next[area].push({ field: field.id, ...(entry.dateGroup ? { dateGroup: entry.dateGroup } : {}), ...(entry.sort ? { sort: entry.sort } : {}), ...(entry.exclude?.length ? { exclude: [...entry.exclude] } : {}), ...filter });
    }
  }
  if (source.values !== undefined) {
    if (!Array.isArray(source.values)) return bad('values must be a list');
    next.values = [];
    for (const entry of source.values) {
      if (!byId.has(entry?.field) && !calcs.has(entry?.field)) return bad(`values: ${String(entry?.field)} is not a field of this pivot`, known);
      if (!ids(PIVOT_AGGREGATES).includes(entry.aggregate)) return bad(`values: aggregate ${String(entry.aggregate)} is not allowed`, ids(PIVOT_AGGREGATES).join(', '));
      if (entry.showAs && !ids(PIVOT_SHOW_AS).includes(entry.showAs)) return bad(`values: showAs ${entry.showAs} is not allowed`, ids(PIVOT_SHOW_AS).join(', '));
      let highlight: PivotCondition | null = null;
      if (entry.highlight !== undefined) {
        highlight = cleanPivotCondition(entry.highlight);
        if (!highlight) return bad(`values: highlight for ${String(entry.field)} must be { op, a, b?, abs? }`, 'ops: gt, gte, lt, lte, eq, ne, between, notBetween, blank, notBlank');
      }
      next.values.push({ field: entry.field, aggregate: entry.aggregate, ...(entry.showAs && entry.showAs !== 'value' ? { showAs: entry.showAs } : {}), ...(entry.heat ? { heat: true } : {}), ...(highlight ? { highlight } : {}) });
    }
  }
  if (source.form !== undefined) {
    if (source.form !== 'compact' && source.form !== 'tabular') return bad(`form ${String(source.form)} is not allowed`, 'compact, tabular');
    next.form = source.form;
  }
  for (const flag of ['subtotals', 'rowTotals', 'columnTotals'] as const) {
    if (source[flag] === undefined) continue;
    if (typeof source[flag] !== 'boolean') return bad(`${flag} must be true or false`);
    next[flag] = source[flag];
  }
  return { ok: true, layout: next };
}

function nodeText(node: PivotNode): string {
  return node.label;
}

export interface PivotAutomationApi {
  fields: () => PivotField[];
  layout: () => PivotLayout;
  change: (next: PivotLayout) => void;
  undo: () => void;
  reset: () => void;
  view: () => PivotView;
  cube: () => PivotCube;
  valueLabels: () => string[];
  status: () => string;
  expandAll: () => void;
  collapseAll: () => void;
  showLevel: (level: number) => void;
  toggleRow: (id: string) => void;
  toggleCol: (id: string) => void;
  setChart: (type: PivotChartType | 'off') => void;
  chart: () => string;
  drill: (row: PivotNode, col: PivotNode) => void;
  exportXlsx: () => void;
  historyLength: () => number;
}

/** Each filtered axis item's rules as text, and how many items each value rule keeps. */
function filterReadout(api: PivotAutomationApi): Record<string, unknown>[] {
  const layout = api.layout();
  const fields = new Map(api.fields().map((field) => [field.id, field]));
  const labels = new Map(layout.values.map((item) => [pivotValueKey(item), pivotValueLabel(item, fields.get(item.field))]));
  const stats = api.cube().filterStats;
  const out: Record<string, unknown>[] = [];
  for (const area of ['rows', 'columns', 'filters'] as const) {
    layout[area].forEach((item) => {
      const rules = pivotFilterSummary(item, (key) => labels.get(key) ?? key, area === 'rows' ? 'column' : 'row');
      if (!rules.length && !item.exclude?.length) return;
      const stat = stats.find((entry) => entry.area === area && entry.field === item.field);
      out.push({ area, field: item.field, ...(item.exclude?.length ? { excluded: item.exclude.length } : {}), rules, ...(stat ? { kept: stat.kept, of: stat.total } : {}) });
    });
  }
  return out;
}

export function pivotReadout(api: PivotAutomationApi, rows: { offset?: number; limit?: number } | undefined): Record<string, unknown> {
  const view = api.view();
  const cube = api.cube();
  const start = Math.max(0, rows?.offset ?? 0);
  const limit = Math.min(100, rows?.limit ?? 20);
  const columns = view.columns.slice(0, 40);
  const header = columns.map((column) => `${column.path.join(' / ') || 'All'}${api.valueLabels().length > 1 ? ` · ${api.valueLabels()[column.valueIndex]}` : ''}`);
  return {
    layout: api.layout(),
    fields: api.fields().map((field) => ({ id: field.id, label: field.label, kind: field.kind, calc: field.calc === true })),
    areas: ids(PIVOT_AREAS),
    status: api.status(),
    filters: filterReadout(api),
    chart: api.chart(),
    canUndo: api.historyLength() > 0,
    columns: header,
    hiddenColumns: view.hiddenColumns,
    lineCount: view.rows.length,
    rowOffset: start,
    lines: view.rows.slice(start, start + limit).map((line) => ({
      id: line.id,
      label: line.labels.length > 0 ? line.labels.filter(Boolean).join(' / ') || line.label : line.label,
      kind: line.kind,
      expanded: line.canToggle ? line.expanded : null,
      cells: columns.map((column) => {
        const shown = cube.shown(line.node, column.node, column.valueIndex);
        return shown === null ? null : Math.round(shown * 100) / 100;
      }),
    })),
  };
}

export function pivotOps(api: PivotAutomationApi): Record<string, DeskOpDef> {
  const field = (id: unknown): PivotField | undefined => api.fields().find((item) => item.id === id);
  const unknown = (id: unknown) => ({ ok: false, error: `${String(id)} is not a field of this pivot`, reason: `fields: ${api.fields().map((item) => item.id).join(', ')}` });
  const area = (value: unknown): PivotArea | null => (ids(PIVOT_AREAS).includes(String(value)) ? (value as PivotArea) : null);
  const badArea = (value: unknown) => ({ ok: false, error: `${String(value)} is not an area`, reason: ids(PIVOT_AREAS).join(', ') });
  const byId = () => new Map(api.fields().map((item) => [item.id, item]));
  const find = (nodes: readonly { node: PivotNode; id: string }[], text: unknown) => nodes.find((item) => item.id === text || nodeText(item.node) === text);

  return {
    addField: {
      description: 'Put a field in an area (filters, columns, rows, values), optionally at an index',
      args: { field: { type: 'string' }, area: { type: 'string', enum: ids(PIVOT_AREAS) }, index: { type: 'number', optional: true } },
      run: (args) => {
        const target = field(args.field);
        if (!target) return unknown(args.field);
        const where = area(args.area);
        if (!where) return badArea(args.area);
        if (target.calc && where !== 'values') return { ok: false, error: `${target.id} is a calculated field and goes to values only` };
        api.change(pivotAddField(api.layout(), target, where, args.index === undefined ? undefined : Number(args.index)));
        return { ok: true };
      },
    },
    removeField: {
      description: 'Take a field out of every area',
      args: { field: { type: 'string' } },
      run: (args) => (field(args.field) ? (api.change(pivotRemoveField(api.layout(), String(args.field))), { ok: true }) : unknown(args.field)),
    },
    moveItem: {
      description: 'Move an item between or inside areas',
      args: { from: { type: 'object', description: '{area, index}' }, to: { type: 'object', description: '{area, index?}' } },
      run: (args) => {
        const from = args.from as { area?: string; index?: number };
        const to = args.to as { area?: string; index?: number };
        if (!area(from?.area)) return badArea(from?.area);
        if (!area(to?.area)) return badArea(to?.area);
        const before = api.layout();
        const next = pivotMoveItem(before, { area: from.area as PivotArea, index: Number(from.index) }, { area: to.area as PivotArea, ...(to.index === undefined ? {} : { index: Number(to.index) }) }, byId());
        if (next === before) return { ok: false, error: 'nothing at that place to move' };
        api.change(next);
        return { ok: true };
      },
    },
    removeItem: {
      description: 'Remove the item at an index of an area',
      args: { area: { type: 'string', enum: ids(PIVOT_AREAS) }, index: { type: 'number' } },
      run: (args) => (area(args.area) ? (api.change(pivotRemoveItem(api.layout(), args.area as PivotArea, Number(args.index))), { ok: true }) : badArea(args.area)),
    },
    swapAxes: { description: 'Swap rows and columns', run: () => (api.change(pivotSwapAxes(api.layout())), { ok: true }) },
    applyLayout: {
      description: 'Set the whole layout in one call. Strict: unknown fields, aggregates or groupings are refused with what is allowed.',
      args: { layout: { type: 'object' } },
      run: (args) => {
        const result = strictPivotLayout(args.layout, api.fields(), api.layout());
        if (!result.ok) return result;
        api.change(result.layout);
        return { ok: true };
      },
    },
    setValue: {
      description: 'Change the aggregate, show-as, heat or highlight condition of a value item (highlight: null clears it)',
      args: { index: { type: 'number' }, aggregate: { type: 'string', optional: true }, showAs: { type: 'string', optional: true }, heat: { type: 'boolean', optional: true }, highlight: { type: 'object', optional: true } },
      run: (args) => {
        const next = clonePivotLayout(api.layout());
        const item = next.values[Number(args.index)];
        if (!item) return { ok: false, error: `no value at index ${String(args.index)}` };
        const patch = strictPivotLayout({ values: [{ ...item, ...(args.aggregate ? { aggregate: args.aggregate } : {}), ...(args.showAs ? { showAs: args.showAs } : {}), ...(args.heat !== undefined ? { heat: args.heat } : {}), ...(args.highlight ? { highlight: args.highlight } : {}) }] }, api.fields(), next);
        if (!patch.ok) return patch;
        Object.assign(item, patch.layout.values[0]);
        if (args.showAs === 'value') delete item.showAs;
        if (args.highlight === null) delete item.highlight;
        api.change(next);
        return { ok: true };
      },
    },
    setAxis: {
      description: 'Change the date grouping, sort, excluded keys, label rule, value filters or top rule of an axis item (label, valueFilters, top: null clears them)',
      args: { area: { type: 'string', enum: ['rows', 'columns', 'filters'] }, index: { type: 'number' }, dateGroup: { type: 'string', optional: true }, sort: { type: 'string', optional: true }, exclude: { type: 'array', optional: true }, label: { type: 'object', optional: true }, valueFilters: { type: 'array', optional: true }, top: { type: 'object', optional: true } },
      run: (args) => {
        const where = area(args.area);
        if (!where || where === 'values') return badArea(args.area);
        const next = clonePivotLayout(api.layout());
        const item = next[where][Number(args.index)];
        if (!item) return { ok: false, error: `no item at ${where}[${String(args.index)}]` };
        const merged: Record<string, unknown> = { ...item, ...(args.dateGroup ? { dateGroup: args.dateGroup } : {}), ...(args.sort ? { sort: args.sort } : {}), ...(args.exclude ? { exclude: args.exclude } : {}) };
        for (const key of ['label', 'valueFilters', 'top'] as const) {
          if (args[key] === null) delete merged[key];
          else if (args[key] !== undefined) merged[key] = args[key];
        }
        const patch = strictPivotLayout({ [where]: [merged] }, api.fields(), { ...next, [where]: [] });
        if (!patch.ok) return patch;
        next[where][Number(args.index)] = patch.layout[where][0]!;
        api.change(next);
        return { ok: true };
      },
    },
    setOptions: {
      description: 'form (compact|tabular), subtotals, rowTotals, columnTotals',
      args: { form: { type: 'string', optional: true }, subtotals: { type: 'boolean', optional: true }, rowTotals: { type: 'boolean', optional: true }, columnTotals: { type: 'boolean', optional: true } },
      run: (args) => {
        const result = strictPivotLayout(args, api.fields(), api.layout());
        if (!result.ok) return result;
        api.change(result.layout);
        return { ok: true };
      },
    },
    addCalc: {
      description: 'Add a calculated field from a formula over other fields\' sums, and put it in values',
      args: { label: { type: 'string' }, formula: { type: 'string' }, format: { type: 'string', optional: true, enum: ['number', 'percent'] } },
      run: (args) => {
        const parsed = parsePivotFormula(String(args.formula), api.fields());
        if (!parsed.ok) return { ok: false, error: parsed.error, reason: `at character ${parsed.at}` };
        const next = clonePivotLayout(api.layout());
        const calc: PivotCalcField = {
          id: pivotCalcId(String(args.label), (next.calculated ?? []).map((item) => item.id)),
          label: String(args.label),
          formula: String(args.formula),
          refs: parsed.formula.refs,
          ...(args.format === 'percent' ? { format: 'percent' as const } : {}),
        };
        next.calculated = [...(next.calculated ?? []), calc];
        next.values.push({ field: calc.id, aggregate: 'sum' });
        api.change(next);
        return { ok: true, id: calc.id };
      },
    },
    undo: { description: 'Undo the last layout change', run: () => (api.historyLength() > 0 ? (api.undo(), { ok: true }) : { ok: false, error: 'nothing to undo' }) },
    reset: { description: 'Back to the starting layout', run: () => (api.reset(), { ok: true }) },
    expandAll: { description: 'Expand every group', run: () => api.expandAll() },
    collapseAll: { description: 'Collapse every group', run: () => api.collapseAll() },
    showLevel: { description: 'Show rows down to a field level (1-based)', args: { level: { type: 'number' } }, run: (args) => api.showLevel(Number(args.level)) },
    toggleRow: {
      description: 'Expand or collapse a row group by id or label',
      args: { row: { type: 'string' } },
      run: (args) => {
        const line = find(api.view().rows, args.row);
        return line ? (api.toggleRow(line.id), { ok: true }) : { ok: false, error: `no row ${String(args.row)} on screen` };
      },
    },
    toggleColumn: {
      description: 'Expand or collapse a column group by id or label',
      args: { column: { type: 'string' } },
      run: (args) => {
        const column = api.view().columns.find((item) => item.id === args.column || item.path.join(' / ') === args.column);
        return column ? (api.toggleCol(column.node.id), { ok: true }) : { ok: false, error: `no column ${String(args.column)} on screen` };
      },
    },
    chart: { description: 'Show a chart: bar, stacked, line, pie or off', args: { type: { type: 'string', enum: ['off', 'bar', 'stacked', 'line', 'pie'] } }, run: (args) => api.setChart(String(args.type) as PivotChartType | 'off') },
    drill: {
      description: 'Open the rows behind one figure, by row and column label or id',
      args: { row: { type: 'string' }, column: { type: 'string', optional: true } },
      run: (args) => {
        const view = api.view();
        const line = find(view.rows, args.row);
        if (!line) return { ok: false, error: `no row ${String(args.row)} on screen`, reason: `rows: ${view.rows.slice(0, 20).map((item) => item.label || item.labels.join('/')).join(', ')}` };
        const column = args.column === undefined ? view.columns[0] : view.columns.find((item) => item.id === args.column || item.path.join(' / ') === args.column);
        if (!column) return { ok: false, error: `no column ${String(args.column)} on screen` };
        api.drill(line.node, column.node);
        return { ok: true };
      },
    },
    exportXlsx: { description: 'Download the pivot as a spreadsheet', run: () => api.exportXlsx() },
  };
}
