import type { PivotField } from './pivotTypes';

/**
 * Calculated fields: a formula over other fields' sums, worked out in every cell of the pivot
 * (as Excel's calculated fields), so GP % of a category is its GP over its sales, never a sum of
 * percentages. `[Gross profit] / [Taxable value] * 100`: fields by label or id in brackets (a
 * one-word id may go bare), numbers, + − × ÷ and brackets. A division by zero leaves the cell empty.
 */
export interface PivotCalcField {
  /** `calc:` and a name, so it never meets a report column. */
  id: string;
  label: string;
  formula: string;
  /** The fields it reads, by id: what the pivot's rows must carry. */
  refs: string[];
  format?: 'number' | 'percent' | undefined;
}

export const PIVOT_CALC_PREFIX = 'calc:';

type Node =
  | { k: 'num'; v: number }
  | { k: 'ref'; i: number }
  | { k: 'neg'; v: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Node; r: Node };

export interface PivotFormula {
  /** Field ids, in the order the formula first names them. */
  refs: string[];
  node: Node;
}

export type PivotFormulaResult =
  | { ok: true; formula: PivotFormula }
  | { ok: false; error: string; at: number };

/** A field a formula names: by id, else by label (any case). Only plain number fields can be summed. */
function resolve(name: string, fields: readonly PivotField[]): PivotField | { error: string } {
  const wanted = name.trim();
  const field =
    fields.find((item) => item.id === wanted) ??
    fields.find((item) => item.label.toLowerCase() === wanted.toLowerCase());
  if (!field) return { error: `There is no field "${wanted}"` };
  if (field.calc)
    return { error: `"${field.label}" is a calculated field; use the fields it reads` };
  if (field.kind !== 'number')
    return { error: `"${field.label}" is not a number, so it has no sum` };
  return field;
}

/** Parse a formula against the pivot's fields, or say what is wrong and where. */
export function parsePivotFormula(text: string, fields: readonly PivotField[]): PivotFormulaResult {
  const refs: string[] = [];
  let pos = 0;
  const fail = (error: string, at = pos): PivotFormulaResult => ({ ok: false, error, at });
  const space = () => {
    while (pos < text.length && /\s/.test(text[pos]!)) pos += 1;
  };
  const ref = (name: string, at: number): Node | PivotFormulaResult => {
    const found = resolve(name, fields);
    if ('error' in found) return fail(found.error, at);
    let index = refs.indexOf(found.id);
    if (index < 0) index = refs.push(found.id) - 1;
    return { k: 'ref', i: index };
  };

  // Precedence climbing: sum := product (± product)*, product := unary (×÷ unary)*.
  function atom(): Node | PivotFormulaResult {
    space();
    const at = pos;
    const ch = text[pos];
    if (ch === undefined) return fail('The formula ends too early');
    if (ch === '(') {
      pos += 1;
      const inner = sum();
      if ('ok' in inner) return inner;
      space();
      if (text[pos] !== ')') return fail('A bracket is not closed');
      pos += 1;
      return inner;
    }
    if (ch === '[') {
      const end = text.indexOf(']', pos);
      if (end < 0) return fail('A field name has no closing ]');
      pos = end + 1;
      return ref(text.slice(at + 1, end), at);
    }
    const number = /^\d+(\.\d+)?|^\.\d+/.exec(text.slice(pos));
    if (number) {
      pos += number[0].length;
      return { k: 'num', v: Number(number[0]) };
    }
    const word = /^[A-Za-z_][\w.]*/.exec(text.slice(pos));
    if (word) {
      pos += word[0].length;
      return ref(word[0], at);
    }
    return fail(`"${ch}" cannot be here`);
  }
  function unary(): Node | PivotFormulaResult {
    space();
    if (text[pos] === '-' || text[pos] === '+') {
      const negate = text[pos] === '-';
      pos += 1;
      const inner = unary();
      if ('ok' in inner) return inner;
      return negate ? { k: 'neg', v: inner } : inner;
    }
    return atom();
  }
  function chain(next: () => Node | PivotFormulaResult, ops: string): Node | PivotFormulaResult {
    let left = next();
    if ('ok' in left) return left;
    for (;;) {
      space();
      const op = text[pos];
      if (op === undefined || !ops.includes(op)) return left;
      pos += 1;
      const right = next();
      if ('ok' in right) return right;
      left = { k: 'bin', op: op as '+' | '-' | '*' | '/', l: left, r: right };
    }
  }
  function product(): Node | PivotFormulaResult {
    return chain(unary, '*/');
  }
  function sum(): Node | PivotFormulaResult {
    return chain(product, '+-');
  }

  if (!text.trim())
    return fail('Write a formula, such as [Gross profit] / [Taxable value] * 100', 0);
  const node = sum();
  if ('ok' in node) return node;
  space();
  if (pos < text.length) return fail(`"${text[pos]}" cannot be here`);
  if (!refs.length) return fail('Name at least one field', 0);
  return { ok: true, formula: { refs, node } };
}

function evaluate(node: Node, sums: readonly number[]): number | null {
  switch (node.k) {
    case 'num':
      return node.v;
    case 'ref':
      return sums[node.i] ?? 0;
    case 'neg': {
      const v = evaluate(node.v, sums);
      return v === null ? null : -v;
    }
    case 'bin': {
      const l = evaluate(node.l, sums);
      const r = evaluate(node.r, sums);
      if (l === null || r === null) return null;
      if (node.op === '+') return l + r;
      if (node.op === '-') return l - r;
      if (node.op === '*') return l * r;
      return r === 0 ? null : l / r;
    }
  }
}

/** The formula's value from its fields' sums, in `refs` order; a blank field counts as 0. */
export function evaluatePivotFormula(
  formula: PivotFormula,
  sums: readonly number[],
): number | null {
  const value = evaluate(formula.node, sums);
  return value === null || !Number.isFinite(value) ? null : value;
}

/** The pivot field a calculated field shows as: a number, never on an axis. */
export function pivotCalcAsField(
  calc: PivotCalcField,
  format: (value: number, kind: PivotCalcField['format']) => string,
): PivotField {
  return {
    id: calc.id,
    label: calc.label,
    kind: 'number',
    calc: true,
    format: (value) => (typeof value === 'number' ? format(value, calc.format) : ''),
  };
}

/** A free id for a new calculated field, from its label. */
export function pivotCalcId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = `${PIVOT_CALC_PREFIX}${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'field'
  }`;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Calculated fields as stored in a layout: well-formed ones only. */
export function cleanPivotCalcs(raw: unknown): PivotCalcField[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PivotCalcField[] = [];
  for (const item of raw as Partial<PivotCalcField>[]) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id.startsWith(PIVOT_CALC_PREFIX) ||
      seen.has(item.id)
    )
      continue;
    if (typeof item.label !== 'string' || typeof item.formula !== 'string') continue;
    seen.add(item.id);
    out.push({
      id: item.id,
      label: item.label,
      formula: item.formula,
      refs: Array.isArray(item.refs)
        ? item.refs.filter((ref): ref is string => typeof ref === 'string')
        : [],
      ...(item.format === 'percent' || item.format === 'number' ? { format: item.format } : {}),
    });
  }
  return out;
}
