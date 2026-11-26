import { parseExpr, printExpr, printExprIn, quoteText, type Ast, type ValueType } from './expr';

/**
 * A condition as blocks: groups that match all or any of their rules, each rule a column, an
 * operator and its values. It is a view of the expression text, which stays what is saved: the
 * editor turns text into blocks when it can (`conditionFromText`) and blocks into text on every
 * change (`conditionText`). A part the blocks cannot hold (a formula, a comparison of two
 * formulas) becomes a formula block, so the all / any structure around it stays visual.
 */

export type ConditionOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'notBetween'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'notContains'
  | 'starts'
  | 'ends'
  | 'empty'
  | 'notEmpty'
  | 'isTrue'
  | 'isFalse';

/** One side of a comparison: a typed-in value, an input of the report, another column, or a formula. */
export type ConditionValue =
  | { kind: 'value'; value: string | number | boolean }
  | { kind: 'param'; id: string }
  | { kind: 'column'; name: string }
  | { kind: 'formula'; text: string };

export interface ConditionRule {
  type: 'rule';
  key: number;
  /** What is tested: a column (`status`), or a formula over columns (`coalesce(status, '')`). */
  field: string;
  op: ConditionOp;
  /** Comparisons, contains, between (low). */
  value?: ConditionValue;
  /** Between: the high end. */
  value2?: ConditionValue;
  /** In / not in: typed values, or one input (`@branches`) in `value`. */
  list?: (string | number)[];
}

export interface ConditionGroup {
  type: 'group';
  key: number;
  match: 'all' | 'any';
  /** None of these: `not (…)`. */
  negate?: boolean;
  items: ConditionNode[];
}

/** A part written as a formula, inside the blocks. */
export interface ConditionFormula {
  type: 'formula';
  key: number;
  text: string;
}

export type ConditionNode = ConditionRule | ConditionGroup | ConditionFormula;

let nextKey = 1;
/** Keys for Vue lists; unique within the page. */
export function conditionKey(): number {
  nextKey += 1;
  return nextKey;
}

export function emptyGroup(match: 'all' | 'any' = 'all'): ConditionGroup {
  return { type: 'group', key: conditionKey(), match, items: [] };
}

/** A rule waiting for its column. */
export function blankRule(): ConditionRule {
  return { type: 'rule', key: conditionKey(), field: '', op: 'eq' };
}

/** Settings to change on a rule; `undefined` clears one. */
export type RulePatch = { [K in keyof ConditionRule]?: ConditionRule[K] | undefined };

/** The rule with `change` applied; a key set to undefined is dropped. */
export function patchRule(rule: ConditionRule, change: RulePatch): ConditionRule {
  const next = { ...rule, ...change } as Record<string, unknown>;
  for (const [key, value] of Object.entries(change)) if (value === undefined) delete next[key];
  return next as unknown as ConditionRule;
}

// ---------------------------------------------------------------------------- operators

export interface OperatorInfo {
  op: ConditionOp;
  label: string;
  /** How many values it takes: none, one, two (between) or a list. */
  takes: 'none' | 'one' | 'two' | 'list';
}

const OP: Record<ConditionOp, Omit<OperatorInfo, 'op' | 'label'>> = {
  eq: { takes: 'one' },
  ne: { takes: 'one' },
  gt: { takes: 'one' },
  gte: { takes: 'one' },
  lt: { takes: 'one' },
  lte: { takes: 'one' },
  between: { takes: 'two' },
  notBetween: { takes: 'two' },
  in: { takes: 'list' },
  notIn: { takes: 'list' },
  contains: { takes: 'one' },
  notContains: { takes: 'one' },
  starts: { takes: 'one' },
  ends: { takes: 'one' },
  empty: { takes: 'none' },
  notEmpty: { takes: 'none' },
  isTrue: { takes: 'none' },
  isFalse: { takes: 'none' },
};

const LABELS: Record<ValueType, [ConditionOp, string][]> = {
  text: [
    ['eq', 'is'],
    ['ne', 'is not'],
    ['contains', 'contains'],
    ['notContains', 'does not contain'],
    ['starts', 'starts with'],
    ['ends', 'ends with'],
    ['in', 'is one of'],
    ['notIn', 'is none of'],
    ['empty', 'is empty'],
    ['notEmpty', 'is not empty'],
  ],
  number: [
    ['eq', '='],
    ['ne', '≠'],
    ['gt', '>'],
    ['gte', '≥'],
    ['lt', '<'],
    ['lte', '≤'],
    ['between', 'is between'],
    ['notBetween', 'is not between'],
    ['in', 'is one of'],
    ['notIn', 'is none of'],
    ['empty', 'is empty'],
    ['notEmpty', 'is not empty'],
  ],
  date: [
    ['between', 'is between'],
    ['eq', 'is on'],
    ['ne', 'is not on'],
    ['lt', 'is before'],
    ['lte', 'is on or before'],
    ['gt', 'is after'],
    ['gte', 'is on or after'],
    ['notBetween', 'is not between'],
    ['empty', 'is empty'],
    ['notEmpty', 'is not empty'],
  ],
  boolean: [
    ['isTrue', 'is yes'],
    ['isFalse', 'is no'],
    ['empty', 'is not set'],
  ],
  unknown: [
    ['eq', '='],
    ['ne', '≠'],
    ['gt', '>'],
    ['gte', '≥'],
    ['lt', '<'],
    ['lte', '≤'],
    ['between', 'is between'],
    ['notBetween', 'is not between'],
    ['in', 'is one of'],
    ['notIn', 'is none of'],
    ['contains', 'contains'],
    ['notContains', 'does not contain'],
    ['starts', 'starts with'],
    ['ends', 'ends with'],
    ['empty', 'is empty'],
    ['notEmpty', 'is not empty'],
    ['isTrue', 'is yes'],
    ['isFalse', 'is no'],
  ],
};

/** The operators that make sense for a column of this type, in the order offered. */
export function operatorsFor(type: ValueType): OperatorInfo[] {
  return LABELS[type].map(([op, label]) => ({ op, label, ...OP[op] }));
}

export function operatorInfo(op: ConditionOp, type: ValueType = 'unknown'): OperatorInfo {
  const label =
    LABELS[type].find(([item]) => item === op)?.[1] ??
    LABELS.unknown.find(([item]) => item === op)?.[1] ??
    op;
  return { op, label, ...OP[op] };
}

/**
 * A new rule for a column, set up the way it is most often wanted: a date between the report's
 * period inputs, a yes/no column that is yes.
 */
export function newRule(
  field: string,
  type: ValueType,
  params: readonly { id: string; type: string }[],
): ConditionRule {
  const rule: ConditionRule = {
    type: 'rule',
    key: conditionKey(),
    field,
    op: operatorsFor(type)[0]!.op,
  };
  if (type === 'date') {
    const dates = params.filter((param) => param.type === 'date');
    const from = dates.find((param) => param.id === 'from') ?? dates[0];
    const to = dates.find((param) => param.id === 'to') ?? dates[1];
    if (from) rule.value = { kind: 'param', id: from.id };
    if (to) rule.value2 = { kind: 'param', id: to.id };
  }
  return rule;
}

/** Keep what still fits when the operator changes: one value moves to the low end and back. */
export function withOperator(rule: ConditionRule, op: ConditionOp): ConditionRule {
  const next: ConditionRule = { type: 'rule', key: rule.key, field: rule.field, op };
  const takes = OP[op].takes;
  if ((takes === 'one' || takes === 'two') && rule.value) next.value = rule.value;
  if (takes === 'two' && rule.value2) next.value2 = rule.value2;
  if (takes === 'list') {
    if (rule.list) next.list = rule.list;
    else if (rule.value?.kind === 'param') next.value = rule.value;
    else if (rule.value?.kind === 'value' && typeof rule.value.value !== 'boolean')
      next.list = [rule.value.value];
  }
  return next;
}

// ---------------------------------------------------------------------------- blocks → text

/**
 * A formula part as a tree. One that does not parse is kept as written, in brackets (a name node
 * prints its text as is), so the report's checks point at it rather than the blocks dropping it.
 */
function formulaAst(text: string): Ast {
  try {
    return parseExpr(text);
  } catch {
    return { k: 'name', v: `(${text.trim()})` };
  }
}

function valueAst(value: ConditionValue): Ast {
  if (value.kind === 'param') return { k: 'param', v: value.id };
  if (value.kind === 'column') return { k: 'name', v: value.name };
  if (value.kind === 'formula') return formulaAst(value.text);
  if (typeof value.value === 'boolean') return { k: 'bool', v: value.value };
  if (typeof value.value === 'number')
    return value.value < 0
      ? { k: 'neg', v: { k: 'num', v: -value.value } }
      : { k: 'num', v: value.value };
  return { k: 'str', v: value.value };
}

/**
 * A value counts once it is set. A typed value may be empty text (`code != ''`); the value box
 * clears a value it empties to `undefined`, so a box left blank is unfinished, not empty text.
 */
function filled(value: ConditionValue | undefined): value is ConditionValue {
  if (!value) return false;
  if (value.kind === 'param') return value.id !== '';
  if (value.kind === 'column') return value.name !== '';
  if (value.kind === 'formula') return value.text.trim() !== '';
  return true;
}

/** Whether a rule says enough to be written; unfinished rules are left out of the text. */
export function ruleComplete(rule: ConditionRule): boolean {
  if (!rule.field.trim()) return false;
  switch (OP[rule.op].takes) {
    case 'none':
      return true;
    case 'one':
      return filled(rule.value);
    case 'two':
      return filled(rule.value) && filled(rule.value2);
    case 'list':
      return (rule.value?.kind === 'param' && rule.value.id !== '') || (rule.list?.length ?? 0) > 0;
  }
}

const CMP: Partial<Record<ConditionOp, string>> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

function ruleAst(rule: ConditionRule): Ast {
  const v: Ast = formulaAst(rule.field);
  const cmp = CMP[rule.op];
  if (cmp) return { k: 'bin', op: cmp, l: v, r: valueAst(rule.value!) };
  switch (rule.op) {
    case 'between':
    case 'notBetween':
      return {
        k: 'between',
        v,
        lo: valueAst(rule.value!),
        hi: valueAst(rule.value2!),
        not: rule.op === 'notBetween',
      };
    case 'in':
    case 'notIn': {
      const items: Ast[] | Ast =
        rule.value?.kind === 'param' && rule.value.id
          ? { k: 'param', v: rule.value.id }
          : (rule.list ?? []).map((item) => valueAst({ kind: 'value', value: item }));
      return { k: 'in', v, items, not: rule.op === 'notIn' };
    }
    case 'contains':
    case 'notContains':
    case 'starts':
    case 'ends': {
      const op = rule.op === 'notContains' ? 'contains' : rule.op;
      const value = rule.value!;
      // contains / starts / ends take text or an input; a typed number is searched as text.
      const arg: Ast =
        value.kind === 'value' ? { k: 'str', v: String(value.value) } : valueAst(value);
      return { k: 'text', op, v, arg, not: rule.op === 'notContains' };
    }
    case 'empty':
      return { k: 'isnull', v, not: false, empty: true };
    case 'notEmpty':
      return { k: 'isnull', v, not: true, empty: true };
    case 'isTrue':
      return { k: 'bin', op: '=', l: v, r: { k: 'bool', v: true } };
    case 'isFalse':
      return { k: 'bin', op: '=', l: v, r: { k: 'bool', v: false } };
    default:
      return v;
  }
}

/**
 * A node as text inside an operator of precedence `outer` (or 1, and 2, not 3); null when it says
 * nothing yet. A formula block that does not parse is kept as written, in brackets, so the
 * report's checks point at it instead of the blocks dropping it.
 */
function textIn(node: ConditionNode, outer: number): string | null {
  if (node.type === 'rule') return ruleComplete(node) ? printExprIn(ruleAst(node), outer) : null;
  if (node.type === 'formula') {
    const text = node.text.trim();
    if (!text) return null;
    try {
      return printExprIn(parseExpr(text), outer);
    } catch {
      return `(${text})`;
    }
  }
  const inner = node.negate ? 3 : outer;
  const live = node.items.filter((item) => textIn(item, 0) !== null);
  if (!live.length) return null;
  if (live.length === 1) {
    const only = textIn(live[0]!, inner)!;
    return node.negate ? (outer > 3 ? `(not ${only})` : `not ${only}`) : only;
  }
  const prec = node.match === 'all' ? 2 : 1;
  const body = live
    .map((item) => textIn(item, prec + 1)!)
    .join(node.match === 'all' ? ' and ' : ' or ');
  if (node.negate) return outer > 3 ? `(not (${body}))` : `not (${body})`;
  return prec < outer ? `(${body})` : body;
}

/** The blocks as expression text; empty when no rule is complete. */
export function conditionText(group: ConditionGroup): string {
  return textIn(group, 0) ?? '';
}

/** One node (rule, group or formula) as expression text. */
export function nodeText(node: ConditionNode): string {
  return textIn(node, 0) ?? '';
}

// ---------------------------------------------------------------------------- text → blocks

/** A literal, an input or a column as a rule value; null for anything else. */
function plainValueOf(ast: Ast): ConditionValue | null {
  switch (ast.k) {
    case 'num':
      return { kind: 'value', value: ast.v };
    case 'str':
      return { kind: 'value', value: ast.v };
    case 'bool':
      return { kind: 'value', value: ast.v };
    case 'param':
      return { kind: 'param', id: ast.v };
    case 'name':
      return { kind: 'column', name: ast.v };
    case 'neg':
      return ast.v.k === 'num' ? { kind: 'value', value: -ast.v.v } : null;
    default:
      return null;
  }
}

/** A rule value: a plain one, else the part as a formula (comparison operands bind tighter than 4). */
function valueOf(ast: Ast): ConditionValue {
  return plainValueOf(ast) ?? { kind: 'formula', text: printExprIn(ast, 5) };
}

/** What a rule tests, as text: a column, or a formula of comparison precedence. */
function fieldOf(ast: Ast): string {
  return printExprIn(ast, 5);
}

/** Whether a part is yes/no on its own, so it cannot be the tested side of a comparison block. */
function isCondition(ast: Ast): boolean {
  return (
    ast.k === 'not' ||
    ast.k === 'between' ||
    ast.k === 'in' ||
    ast.k === 'isnull' ||
    ast.k === 'text' ||
    (ast.k === 'bin' && ['and', 'or', '=', '!=', '>', '>=', '<', '<='].includes(ast.op))
  );
}

const FROM_CMP: Record<string, ConditionOp> = {
  '=': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

function ruleFrom(ast: Ast): ConditionRule | null {
  const rule = (
    field: string,
    op: ConditionOp,
    extra: Partial<ConditionRule> = {},
  ): ConditionRule => ({ type: 'rule', key: conditionKey(), field, op, ...extra });
  switch (ast.k) {
    case 'name':
      return rule(ast.v, 'isTrue');
    case 'not':
      return ast.v.k === 'name' ? rule(ast.v.v, 'isFalse') : null;
    case 'bin': {
      const op = FROM_CMP[ast.op];
      if (!op || isCondition(ast.l)) return null;
      if (ast.r.k === 'bool' && (op === 'eq' || op === 'ne'))
        return rule(fieldOf(ast.l), ast.r.v === (op === 'eq') ? 'isTrue' : 'isFalse');
      return rule(fieldOf(ast.l), op, { value: valueOf(ast.r) });
    }
    case 'between':
      if (isCondition(ast.v)) return null;
      return rule(fieldOf(ast.v), ast.not ? 'notBetween' : 'between', {
        value: valueOf(ast.lo),
        value2: valueOf(ast.hi),
      });
    case 'in': {
      if (isCondition(ast.v)) return null;
      const op = ast.not ? 'notIn' : 'in';
      if (!Array.isArray(ast.items))
        return ast.items.k === 'param'
          ? rule(fieldOf(ast.v), op, { value: { kind: 'param', id: ast.items.v } })
          : null;
      const list: (string | number)[] = [];
      for (const item of ast.items) {
        const value = plainValueOf(item);
        if (value?.kind !== 'value' || typeof value.value === 'boolean') return null;
        list.push(value.value);
      }
      return rule(fieldOf(ast.v), op, { list });
    }
    case 'text': {
      if (isCondition(ast.v) || (ast.not && ast.op !== 'contains')) return null;
      // The server takes text or an input here, nothing else.
      const value = plainValueOf(ast.arg);
      if (!value || value.kind === 'column') return null;
      return rule(fieldOf(ast.v), ast.not ? 'notContains' : ast.op, { value });
    }
    case 'isnull':
      // `is null` and `is empty` both read as "is empty": empty also covers blank text.
      return isCondition(ast.v) ? null : rule(fieldOf(ast.v), ast.not ? 'notEmpty' : 'empty');
    default:
      return null;
  }
}

/** `a and b and c` as [a, b, c]. */
function flatten(ast: Ast, op: 'and' | 'or'): Ast[] {
  if (ast.k === 'bin' && ast.op === op) return [...flatten(ast.l, op), ...flatten(ast.r, op)];
  return [ast];
}

function nodeFrom(ast: Ast): ConditionNode {
  if (ast.k === 'bin' && (ast.op === 'and' || ast.op === 'or')) return groupFrom(ast);
  if (ast.k === 'not' && ast.v.k !== 'name') {
    const inner = nodeFrom(ast.v);
    if (inner.type === 'formula')
      return { type: 'formula', key: conditionKey(), text: printExpr(ast) };
    const group: ConditionGroup =
      inner.type === 'group' && !inner.negate
        ? inner
        : { type: 'group', key: conditionKey(), match: 'all', items: [inner] };
    return { ...group, negate: true };
  }
  return ruleFrom(ast) ?? { type: 'formula', key: conditionKey(), text: printExpr(ast) };
}

function groupFrom(ast: Ast): ConditionGroup {
  const match = ast.k === 'bin' && ast.op === 'or' ? 'any' : 'all';
  const items = flatten(ast, match === 'all' ? 'and' : 'or').map(nodeFrom);
  return { type: 'group', key: conditionKey(), match, items };
}

/**
 * The blocks for an expression; null when the text does not parse. Empty text is an empty "all"
 * group. Parts the blocks cannot hold become formula blocks.
 */
export function conditionFromText(text: string): ConditionGroup | null {
  if (!text.trim()) return emptyGroup();
  let ast: Ast;
  try {
    ast = parseExpr(text);
  } catch {
    return null;
  }
  const node = nodeFrom(ast);
  return node.type === 'group'
    ? node
    : { type: 'group', key: conditionKey(), match: 'all', items: [node] };
}

/** Whether the blocks are only formulas: then the formula view says it better. */
export function onlyFormulas(group: ConditionGroup): boolean {
  return (
    group.items.length > 0 &&
    group.items.every(
      (item) => item.type === 'formula' || (item.type === 'group' && onlyFormulas(item)),
    )
  );
}

/** A typed value as it is written in a formula, for summaries. */
export function valueText(value: ConditionValue | undefined): string {
  if (!value) return '…';
  if (value.kind === 'param') return `@${value.id}`;
  if (value.kind === 'column') return value.name;
  if (value.kind === 'formula') return value.text;
  if (typeof value.value === 'string') return quoteText(value.value);
  return String(value.value);
}
