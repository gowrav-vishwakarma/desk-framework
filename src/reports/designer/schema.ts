import type { Rdl2Report, Rdl2Stage, Rdl2StageBase } from '../language';
import { studioStep } from './studioSteps';
import type { CatalogField, CatalogFieldType, CatalogModel } from '../studioApi';
import { exprTextType, type ValueType } from './expr';

/**
 * The columns each step hands on, with their types, worked out as the backend compiler does. The
 * designer offers these in pickers, picks operators and formats by type, and checks names with them.
 */

export interface ColumnInfo {
  name: string;
  type: ValueType;
  /** Where it comes from, in words: "Party › Name", "sum of amount". */
  origin: string;
  /** Fixed values of an enum field. */
  values?: string[];
}

export type Catalog = ReadonlyMap<string, CatalogModel>;

export function valueTypeOf(type: CatalogFieldType): ValueType {
  switch (type) {
    case 'number':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

export interface ResolvedPath {
  field: CatalogField;
  /** The model the field is on. */
  model: CatalogModel;
  /** Labels on the way: ["Party", "City", "Name"]. */
  labels: string[];
}

/** A dotted path from a model (`party.city.name`) to its field, through belongs-to relations only. */
export function resolvePath(
  catalog: Catalog,
  modelName: string,
  path: string,
): ResolvedPath | { error: string } {
  let model = catalog.get(modelName);
  if (!model) return { error: `"${modelName}" is not a model reports can read` };
  const parts = path.split('.');
  const fieldName = parts.pop()!;
  const labels: string[] = [];
  for (const part of parts) {
    const relation = model.relations.find((item) => item.name === part);
    if (!relation) return { error: `${model.label} has no link "${part}"` };
    if (relation.type === 'many')
      return {
        error: `"${part}" has many rows per ${model.label}; read it in its own step and total it`,
      };
    const target = catalog.get(relation.target);
    if (!target) return { error: `"${relation.target}" cannot be read` };
    labels.push(relation.label);
    model = target;
  }
  const field = model.fields.find((item) => item.name === fieldName);
  if (!field) return { error: `${model.label} has no field "${fieldName}"` };
  return { field, model, labels: [...labels, field.label] };
}

/** A friendly column name from a path: `party.city.name` → `partyCityName`. */
export function columnNameFromPath(path: string): string {
  return path
    .split('.')
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** A name not taken yet: `amount`, `amount2`. */
export function freeName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const clean = base.replace(/[^A-Za-z0-9_]/g, '') || 'column';
  const start = /^[A-Za-z_]/.test(clean) ? clean : `c${clean}`;
  if (!used.has(start)) return start;
  let n = 2;
  while (used.has(`${start}${n}`)) n += 1;
  return `${start}${n}`;
}

/** "invoiceDate" → "Invoice date": a heading from a column name. */
export function headingFromName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function lookup(cols: ColumnInfo[]): (name: string) => ColumnInfo | undefined {
  const byName = new Map(cols.map((col) => [col.name, col]));
  return (name) => byName.get(name);
}

function typed(cols: ColumnInfo[]): (name: string) => ValueType {
  const find = lookup(cols);
  return (name) => find(name)?.type ?? 'unknown';
}

function stageOut(
  stage: Rdl2Stage,
  catalog: Catalog,
  of: (id: string | undefined) => ColumnInfo[],
): ColumnInfo[] {
  switch (stage.kind) {
    case 'source':
      return stage.fields
        .filter((field) => field.as)
        .map((field) => {
          const found = resolvePath(catalog, stage.model, field.path);
          if ('error' in found)
            return { name: field.as, type: 'unknown' as const, origin: field.path };
          return {
            name: field.as,
            type: valueTypeOf(found.field.type),
            origin: found.labels.join(' › '),
            ...(found.field.values ? { values: found.field.values } : {}),
          };
        });
    case 'filter':
    case 'exists':
    case 'top':
    case 'native':
      return of(stage.from);
    case 'derive': {
      const input = of(stage.from);
      const type = typed(input);
      const added = stage.columns
        .filter((col) => col.as)
        .map(
          (col): ColumnInfo => ({
            name: col.as,
            type: exprTextType(col.expr, type),
            origin: col.expr || 'formula',
          }),
        );
      const names = new Set(added.map((col) => col.name));
      const all = [...input.filter((col) => !names.has(col.name)), ...added];
      return stage.keep?.length ? all.filter((col) => stage.keep!.includes(col.name)) : all;
    }
    case 'aggregate': {
      const input = of(stage.from);
      const find = lookup(input);
      const type = typed(input);
      const groups = stage.groupBy.map(
        (name): ColumnInfo => find(name) ?? { name, type: 'unknown', origin: name },
      );
      const measures = stage.measures
        .filter((m) => m.as)
        .map((m): ColumnInfo => {
          const value = m.expr ?? '';
          const kind: ValueType =
            m.fn === 'list'
              ? 'text'
              : m.fn === 'min' || m.fn === 'max' || m.fn === 'first' || m.fn === 'last'
                ? exprTextType(value, type)
                : 'number';
          return { name: m.as, type: kind, origin: `${m.fn}${value ? ` of ${value}` : ''}` };
        });
      return [...groups, ...measures];
    }
    case 'window': {
      const input = of(stage.from);
      const type = typed(input);
      const added = stage.columns
        .filter((c) => c.as)
        .map(
          (c): ColumnInfo => ({
            name: c.as,
            type:
              c.fn === 'list'
                ? 'text'
                : c.fn === 'previous' || c.fn === 'next'
                  ? exprTextType(c.expr ?? '', type)
                  : 'number',
            origin: `${c.fn}${c.expr ? ` of ${c.expr}` : ''}`,
          }),
        );
      const names = new Set(added.map((col) => col.name));
      return [...input.filter((col) => !names.has(col.name)), ...added];
    }
    case 'join': {
      const other = lookup(of(stage.with));
      const added = stage.columns
        .filter((c) => c.as)
        .map(
          (c): ColumnInfo => ({
            ...(other(c.column) ?? { type: 'unknown' as const, origin: '' }),
            name: c.as,
            origin: `${stage.with}.${c.column}`,
          }),
        );
      return [...of(stage.from), ...added];
    }
    case 'pivot': {
      const input = of(stage.from);
      const find = lookup(input);
      const value: ValueType =
        stage.measure.fn === 'min' || stage.measure.fn === 'max'
          ? exprTextType(stage.measure.expr ?? '', typed(input))
          : stage.measure.fn === 'list'
            ? 'text'
            : 'number';
      return [
        ...stage.rows.map(
          (name): ColumnInfo => find(name) ?? { name, type: 'unknown', origin: name },
        ),
        ...stage.keys
          .filter((k) => k.as)
          .map(
            (k): ColumnInfo => ({
              name: k.as,
              type: value,
              origin: `${stage.column} = ${String(k.value)}`,
            }),
          ),
        ...(stage.total
          ? [{ name: stage.total, type: value, origin: 'total of the columns' }]
          : []),
      ];
    }
    case 'balance': {
      const find = lookup(of(stage.from));
      return [
        ...stage.keys.map(
          (name): ColumnInfo => find(name) ?? { name, type: 'unknown', origin: name },
        ),
        ...['opening', 'inward', 'outward', 'closing'].map(
          (name): ColumnInfo => ({ name, type: 'number', origin: `${name} of the period` }),
        ),
      ];
    }
    case 'classify': {
      const input = of(stage.from).filter((col) => col.name !== stage.as);
      return stage.as ? [...input, { name: stage.as, type: 'text', origin: 'bucket' }] : input;
    }
    case 'fifo': {
      const as = stage.as || 'remaining';
      return [
        ...of(stage.from).filter((col) => col.name !== as),
        { name: as, type: 'number', origin: 'still open, first in first out' },
      ];
    }
    case 'periods': {
      const as = stage.as || 'period';
      return [...of(stage.from).filter((col) => col.name !== as), { name: as, type: 'text', origin: 'the period the row falls in' }];
    }
    case 'union': {
      const first = stage.parts[0];
      if (!first) return [];
      const input = of(first.from);
      const type = typed(input);
      const set = Object.entries(first.set ?? {});
      const replaced = new Map(
        set.map(([name, expr]) => [name, { name, type: exprTextType(expr, type), origin: expr }]),
      );
      const all = [
        ...input.map((col) => replaced.get(col.name) ?? col),
        ...[...replaced.values()].filter((col) => !input.some((item) => item.name === col.name)),
      ];
      return stage.keep ? all.filter((col) => stage.keep!.includes(col.name)) : all;
    }
    case 'engine':
      // An engine's columns are known on the server only: its input's go on.
      return of(stage.from);
    default: {
      // A project's step (`defineStudioStep`) says what it hands on.
      const own = stage as Rdl2StageBase;
      return studioStep(own.kind)?.columns(own, of(own.from)) ?? of(own.from);
    }
  }
}

/** Each step's columns, in step order. A step reading a later or missing step gets no input columns. */
export function stageSchemas(report: Rdl2Report, catalog: Catalog): Map<string, ColumnInfo[]> {
  const out = new Map<string, ColumnInfo[]>();
  const of = (id: string | undefined) => (id ? (out.get(id) ?? []) : []);
  for (const stage of report.stages) out.set(stage.id, stageOut(stage, catalog, of));
  return out;
}

/** The steps a step reads (from, with, in, union parts). */
export function stageInputs(stage: Rdl2Stage): string[] {
  switch (stage.kind) {
    case 'source':
      return [];
    case 'union':
      return stage.parts.map((part) => part.from);
    case 'join':
      return [stage.from, stage.with];
    case 'exists':
      return [stage.from, stage.in];
    case 'native':
      return stage.from ? [stage.from] : [];
    default:
      return [stage.from];
  }
}
