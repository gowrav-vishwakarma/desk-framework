import type { DeskRuleTerm, DeskStyleOp, DeskStyleRule } from './types';

/**
 * A condition over catalog fields. Parsed and walked here. Never passed to `eval` or `Function`.
 * Names are catalog fields or the words below. Anything else is rejected.
 */

const MAX_LENGTH = 240;
const MAX_NODES = 80;
const MAX_DEPTH = 64;
const MAX_LIST = 12;
const MAX_TEXT = 80;

const WORDS = new Set(['and', 'or', 'not', 'contains', 'starts', 'is', 'empty', 'this', 'between', 'in']);

export interface RuleScalar {
  num: number;
  text: string;
}

export type RuleAst =
  | { kind: 'num'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'this' }
  | { kind: 'field'; key: string }
  | { kind: 'neg'; value: RuleAst }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: RuleAst; right: RuleAst }
  | { kind: 'cmp'; op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'starts'; left: RuleAst; right: RuleAst }
  | { kind: 'empty'; value: RuleAst; not: boolean }
  | { kind: 'between'; value: RuleAst; low: RuleAst; high: RuleAst }
  | { kind: 'in'; value: RuleAst; items: RuleAst[] }
  | { kind: 'not'; value: RuleAst }
  | { kind: 'and'; left: RuleAst; right: RuleAst }
  | { kind: 'or'; left: RuleAst; right: RuleAst };

export interface RuleParse {
  ok: boolean;
  error: string;
  ast?: RuleAst;
  fields: string[];
}

type Word = 'and' | 'or' | 'not' | 'contains' | 'starts' | 'is' | 'empty' | 'this' | 'between' | 'in';
type CmpOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'starts';
type BinOp = '+' | '-' | '*' | '/';

type Tok =
  | { kind: 'num'; num: number }
  | { kind: 'str'; str: string }
  | { kind: 'field'; key: string }
  | { kind: 'word'; word: Word }
  | { kind: 'op'; op: CmpOp | BinOp }
  | { kind: 'lp' }
  | { kind: 'rp' }
  | { kind: 'comma' }
  | { kind: 'end' };

/** Catalog keys an expression can name: a single value, written as an identifier. */
export function expressionKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(key);
}

/** What the designer shows. A saved `value` rule reads as `this > 500`. */
export function ruleSource(rule: DeskStyleRule): string {
  if (typeof rule.when === 'string') return rule.when;
  if (!rule.op) return '';
  const left = termSource(rule.left) ?? 'this';
  if (rule.op === 'empty') return `${left} is empty`;
  const right = termSource(rule.right) ?? literalSource(rule.value ?? '', rule.op);
  const word = rule.op === 'eq' ? '=' : rule.op === 'ne' ? '!=' : rule.op === 'gt' ? '>' : rule.op === 'lt' ? '<' : 'contains';
  return `${left} ${word} ${right}`;
}

function termSource(term: DeskRuleTerm | undefined): string | undefined {
  if (!term) return undefined;
  if ('number' in term) return String(term.number);
  if ('text' in term) return quote(term.text);
  return term.field;
}

function literalSource(value: string, op: DeskStyleOp): string {
  const trimmed = value.trim();
  if ((op === 'gt' || op === 'lt') && trimmed !== '' && Number.isFinite(Number(trimmed))) return trimmed;
  return quote(value);
}

function quote(value: string): string {
  return `"${value.slice(0, MAX_TEXT).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function parseRule(source: string, fields: readonly string[]): RuleParse {
  if (source.length > MAX_LENGTH) return { ok: false, error: `A condition can be ${MAX_LENGTH} characters.`, fields: [] };
  const allowed = fields.filter(expressionKey).sort((a, b) => b.length - a.length);
  const seen: string[] = [];
  const tokens = tokenize(source, allowed, seen);
  if (!tokens.ok) return { ok: false, error: tokens.error, fields: seen };
  if (tokens.tokens.length === 1) return { ok: false, error: 'Write a condition, for example sellingPrice > mrp.', fields: seen };
  const parsed = walk(tokens.tokens);
  if (!parsed.ok) return { ok: false, error: parsed.error, fields: seen };
  return { ok: true, error: '', ast: parsed.ast, fields: seen };
}

export interface RuleEnv {
  self: RuleScalar;
  field: (key: string) => RuleScalar;
}

/** True when the condition holds. A bad value makes the comparison fail. */
export function evalRule(ast: RuleAst, env: RuleEnv): boolean {
  return evalBool(ast, env) === true;
}

function tokenize(source: string, fields: readonly string[], seen: string[]): { ok: true; tokens: Tok[] } | { ok: false; error: string } {
  const tokens: Tok[] = [];
  let i = 0;
  const push = (token: Tok): boolean => {
    tokens.push(token);
    return tokens.length <= MAX_NODES;
  };
  while (i < source.length) {
    const ch = source[i] ?? '';
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      if (!push({ kind: 'lp' })) return { ok: false, error: 'This condition is too complex.' };
      i += 1;
      continue;
    }
    if (ch === ')') {
      if (!push({ kind: 'rp' })) return { ok: false, error: 'This condition is too complex.' };
      i += 1;
      continue;
    }
    if (ch === ',') {
      if (!push({ kind: 'comma' })) return { ok: false, error: 'This condition is too complex.' };
      i += 1;
      continue;
    }
    const op = operatorAt(source, i);
    if (op) {
      if (!push({ kind: 'op', op: op.op })) return { ok: false, error: 'This condition is too complex.' };
      i += op.size;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const str = readString(source, i);
      if (!str.ok) return str;
      if (!push({ kind: 'str', str: str.value })) return { ok: false, error: 'This condition is too complex.' };
      i = str.next;
      continue;
    }
    if (ch >= '0' && ch <= '9' || (ch === '.' && (source[i + 1] ?? '') >= '0' && (source[i + 1] ?? '') <= '9')) {
      const num = readNumber(source, i);
      if (!num.ok) return num;
      if (!push({ kind: 'num', num: num.value })) return { ok: false, error: 'This condition is too complex.' };
      i = num.next;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const field = matchField(source, i, fields);
      const reserved = field !== null && WORDS.has(field.toLowerCase()) && !field.includes('.');
      if (field && !reserved) {
        if (!seen.includes(field)) seen.push(field);
        if (!push({ kind: 'field', key: field })) return { ok: false, error: 'This condition is too complex.' };
        i += field.length;
        continue;
      }
      const word = readWord(source, i);
      if (!word.ok) return word;
      const lower = word.value.toLowerCase();
      if (!WORDS.has(lower)) return { ok: false, error: `Unknown name "${word.value.slice(0, 24)}". Use a field, this, or a number.` };
      if (!push({ kind: 'word', word: lower as Word })) return { ok: false, error: 'This condition is too complex.' };
      i = word.next;
      continue;
    }
    return { ok: false, error: `Unexpected "${ch}"` };
  }
  tokens.push({ kind: 'end' });
  return { ok: true, tokens };
}

function operatorAt(source: string, i: number): { op: CmpOp | BinOp; size: number } | null {
  const two = source.slice(i, i + 2);
  if (two === '>=' || two === '<=' || two === '!=' || two === '==' || two === '<>') {
    const op = two === '==' ? '=' : two === '<>' ? '!=' : two;
    return { op: op as CmpOp, size: 2 };
  }
  const ch = source[i] ?? '';
  if (ch === '>' || ch === '<' || ch === '=' || ch === '+' || ch === '-' || ch === '*' || ch === '/') return { op: ch, size: 1 };
  return null;
}

function matchField(source: string, i: number, fields: readonly string[]): string | null {
  for (const key of fields) {
    if (!source.startsWith(key, i)) continue;
    const next = source[i + key.length] ?? '';
    if (next && /[A-Za-z0-9_]/.test(next)) continue;
    if (next === '.') continue;
    return key;
  }
  return null;
}

function readWord(source: string, i: number): { ok: true; value: string; next: number } | { ok: false; error: string } {
  let j = i + 1;
  while (j < source.length && /[A-Za-z0-9_]/.test(source[j] ?? '')) j += 1;
  if ((source[j] ?? '') === '.') return { ok: false, error: `Unknown field "${source.slice(i, Math.min(j + 24, source.length))}".` };
  return { ok: true, value: source.slice(i, j), next: j };
}

function readNumber(source: string, i: number): { ok: true; value: number; next: number } | { ok: false; error: string } {
  let j = i;
  while (j < source.length && (source[j] ?? '') >= '0' && (source[j] ?? '') <= '9') j += 1;
  if ((source[j] ?? '') === '.') {
    j += 1;
    const mark = j;
    while (j < source.length && (source[j] ?? '') >= '0' && (source[j] ?? '') <= '9') j += 1;
    if (j === mark) return { ok: false, error: 'That number is incomplete.' };
  }
  if (/[A-Za-z_]/.test(source[j] ?? '')) return { ok: false, error: 'A number cannot be followed by a name.' };
  const value = Number(source.slice(i, j));
  if (!Number.isFinite(value)) return { ok: false, error: 'That number is not usable.' };
  return { ok: true, value, next: j };
}

function readString(source: string, i: number): { ok: true; value: string; next: number } | { ok: false; error: string } {
  const quoteChar = source[i] ?? '"';
  let j = i + 1;
  let value = '';
  while (j < source.length) {
    const ch = source[j] ?? '';
    if (ch === quoteChar) return value.length > MAX_TEXT ? { ok: false, error: `Text can be ${MAX_TEXT} characters.` } : { ok: true, value, next: j + 1 };
    if (ch === '\\') {
      const esc = source[j + 1] ?? '';
      if (esc !== '\\' && esc !== '"' && esc !== "'" && esc !== 'n') return { ok: false, error: 'Unknown escape in text.' };
      value += esc === 'n' ? '\n' : esc;
      j += 2;
    } else {
      if (ch === '\n' || ch === '\r') return { ok: false, error: 'A quote is not closed.' };
      value += ch;
      j += 1;
    }
    if (value.length > MAX_TEXT) return { ok: false, error: `Text can be ${MAX_TEXT} characters.` };
  }
  return { ok: false, error: 'A quote is not closed.' };
}

function walk(tokens: Tok[]): { ok: true; ast: RuleAst } | { ok: false; error: string } {
  let at = 0;
  let nodes = 0;
  const peek = (): Tok => tokens[at] ?? { kind: 'end' };
  const take = (): Tok => {
    const token = peek();
    at += 1;
    return token;
  };
  const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
  const isError = (value: RuleAst | { error: string }): value is { error: string } => 'error' in value;
  const node = (value: RuleAst): RuleAst | null => {
    nodes += 1;
    return nodes > MAX_NODES ? null : value;
  };

  const or = (depth: number): RuleAst | { error: string } => {
    if (depth > MAX_DEPTH) return { error: 'This condition is too nested.' };
    const leftStep = and(depth + 1);
    if (isError(leftStep)) return leftStep;
    let left: RuleAst = leftStep;
    while (peek().kind === 'word' && (peek() as { word: Word }).word === 'or') {
      take();
      const right = and(depth + 1);
      if (isError(right)) return right;
      if (!isCondition(left) || !isCondition(right)) return { error: 'or needs a comparison on both sides.' };
      const next = node({ kind: 'or', left, right });
      if (!next) return { error: 'This condition is too complex.' };
      left = next;
    }
    return left;
  };

  const and = (depth: number): RuleAst | { error: string } => {
    const leftStep = not(depth + 1);
    if (isError(leftStep)) return leftStep;
    let left: RuleAst = leftStep;
    while (isWord('and')) {
      take();
      const right = not(depth + 1);
      if (isError(right)) return right;
      if (!isCondition(left) || !isCondition(right)) return { error: 'and needs a comparison on both sides.' };
      const next = node({ kind: 'and', left, right });
      if (!next) return { error: 'This condition is too complex.' };
      left = next;
    }
    return left;
  };

  const not = (depth: number): RuleAst | { error: string } => {
    if (depth > MAX_DEPTH) return { error: 'This condition is too nested.' };
    if (!isWord('not')) return cmp(depth + 1);
    take();
    const value = not(depth + 1);
    if (isError(value)) return value;
    if (!isCondition(value)) return { error: 'not needs a comparison.' };
    const next = node({ kind: 'not', value });
    return next ?? { error: 'This condition is too complex.' };
  };

  const cmp = (depth: number): RuleAst | { error: string } => {
    const left = sum(depth + 1);
    if (isError(left)) return left;
    if (isWord('is')) {
      take();
      const neg = isWord('not');
      if (neg) take();
      if (!isWord('empty')) return { error: 'Expected "empty".' };
      take();
      if (isCondition(left)) return { error: 'is empty needs a value.' };
      const next = node({ kind: 'empty', value: left, not: neg });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (isWord('between')) {
      if (isCondition(left)) return { error: 'between needs a value.' };
      take();
      const low = sum(depth + 1);
      if (isError(low)) return low;
      if (!isWord('and')) return { error: 'between needs and, for example mrp between 10 and 20.' };
      take();
      const high = sum(depth + 1);
      if (isError(high)) return high;
      if (isCondition(low) || isCondition(high)) return { error: 'between needs numbers or fields.' };
      const next = node({ kind: 'between', value: left, low, high });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (isWord('in')) {
      if (isCondition(left)) return { error: 'in needs a value.' };
      take();
      if (peek().kind !== 'lp') return { error: 'in needs a list in parentheses.' };
      take();
      const items: RuleAst[] = [];
      if (peek().kind === 'rp') return { error: 'The list is empty.' };
      while (peek().kind !== 'rp' && peek().kind !== 'end') {
        if (items.length >= MAX_LIST) return { error: `A list can have ${MAX_LIST} values.` };
        const item = sum(depth + 1);
        if (isError(item)) return item;
        if (isCondition(item)) return { error: 'A list holds values, not comparisons.' };
        items.push(item);
        if (peek().kind === 'comma') take();
        else break;
      }
      if (peek().kind !== 'rp') return { error: 'The list is not closed.' };
      take();
      const next = node({ kind: 'in', value: left, items });
      return next ?? { error: 'This condition is too complex.' };
    }
    const op = cmpOp();
    if (!op) return left;
    take();
    const right = sum(depth + 1);
    if (isError(right)) return right;
    if (isCondition(left) || isCondition(right)) return { error: 'That comparison needs values on both sides.' };
    const next = node({ kind: 'cmp', op, left, right });
    return next ?? { error: 'This condition is too complex.' };
  };

  const sum = (depth: number): RuleAst | { error: string } => bin(depth, product, (op) => op === '+' || op === '-');
  const product = (depth: number): RuleAst | { error: string } => bin(depth, unary, (op) => op === '*' || op === '/');

  const bin = (
    depth: number,
    nextFn: (depth: number) => RuleAst | { error: string },
    takeOp: (op: BinOp) => boolean,
  ): RuleAst | { error: string } => {
    const leftStep = nextFn(depth + 1);
    if (isError(leftStep)) return leftStep;
    let left: RuleAst = leftStep;
    while (peek().kind === 'op' && takeOp((peek() as { op: BinOp }).op)) {
      const op = (take() as { op: BinOp }).op;
      const right = nextFn(depth + 1);
      if (isError(right)) return right;
      if (isCondition(left) || isCondition(right)) return { error: 'A comparison cannot be added or multiplied.' };
      const next = node({ kind: 'bin', op, left, right });
      if (!next) return { error: 'This condition is too complex.' };
      left = next;
    }
    return left;
  };

  const unary = (depth: number): RuleAst | { error: string } => {
    if (depth > MAX_DEPTH) return { error: 'This condition is too nested.' };
    if (peek().kind === 'op' && (peek() as { op: string }).op === '-') {
      take();
      const value = unary(depth + 1);
      if (isError(value)) return value;
      if (isCondition(value)) return { error: 'A comparison cannot be negated as a number.' };
      const next = node({ kind: 'neg', value });
      return next ?? { error: 'This condition is too complex.' };
    }
    return primary(depth + 1);
  };

  const primary = (depth: number): RuleAst | { error: string } => {
    if (depth > MAX_DEPTH) return { error: 'This condition is too nested.' };
    const token = peek();
    if (token.kind === 'num') {
      take();
      const next = node({ kind: 'num', value: token.num });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (token.kind === 'str') {
      take();
      const next = node({ kind: 'text', value: token.str });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (token.kind === 'field') {
      take();
      const next = node({ kind: 'field', key: token.key });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (token.kind === 'word' && token.word === 'this') {
      take();
      const next = node({ kind: 'this' });
      return next ?? { error: 'This condition is too complex.' };
    }
    if (token.kind === 'lp') {
      take();
      const inner = or(depth + 1);
      if (isError(inner)) return inner;
      if (peek().kind !== 'rp') return { error: 'A parenthesis is not closed.' };
      take();
      return inner;
    }
    if (token.kind === 'end') return { error: 'The condition ends early.' };
    return { error: 'The condition is not finished.' };
  };

  const isWord = (word: Word): boolean => peek().kind === 'word' && (peek() as { word: Word }).word === word;
  const cmpOp = (): CmpOp | null => {
    const token = peek();
    if (token.kind === 'word' && (token.word === 'contains' || token.word === 'starts')) return token.word;
    if (token.kind === 'op' && (token.op === '=' || token.op === '!=' || token.op === '>' || token.op === '>=' || token.op === '<' || token.op === '<=')) return token.op;
    return null;
  };

  const ast = or(0);
  if (isError(ast)) return fail(ast.error);
  if (peek().kind !== 'end') return fail('The condition has an extra part.');
  if (!isCondition(ast)) return fail('Add a comparison, for example sellingPrice > mrp.');
  return { ok: true, ast };
}

function isCondition(ast: RuleAst): boolean {
  return ast.kind === 'cmp' || ast.kind === 'empty' || ast.kind === 'between' || ast.kind === 'in' || ast.kind === 'not' || ast.kind === 'and' || ast.kind === 'or';
}

function evalBool(ast: RuleAst, env: RuleEnv): boolean | null {
  if (ast.kind === 'not') {
    const value = evalBool(ast.value, env);
    return value === null ? null : !value;
  }
  if (ast.kind === 'and') {
    const left = evalBool(ast.left, env);
    if (left !== true) return left;
    return evalBool(ast.right, env);
  }
  if (ast.kind === 'or') {
    const left = evalBool(ast.left, env);
    if (left === true) return true;
    if (left === null) return null;
    return evalBool(ast.right, env);
  }
  if (ast.kind === 'empty') {
    const value = evalScalar(ast.value, env);
    if (!value) return null;
    const blank = value.text === '';
    return ast.not ? !blank : blank;
  }
  if (ast.kind === 'between') {
    const value = evalScalar(ast.value, env);
    const low = evalScalar(ast.low, env);
    const high = evalScalar(ast.high, env);
    if (!value || !low || !high) return false;
    if (!Number.isFinite(value.num) || !Number.isFinite(low.num) || !Number.isFinite(high.num)) return false;
    return value.num >= low.num && value.num <= high.num;
  }
  if (ast.kind === 'in') {
    const value = evalScalar(ast.value, env);
    if (!value) return false;
    const items = ast.items.map((item) => evalScalar(item, env));
    if (items.some((item) => !item)) return false;
    const nums = items as RuleScalar[];
    if (Number.isFinite(value.num) && nums.every((item) => Number.isFinite(item.num))) return nums.some((item) => item.num === value.num);
    return nums.some((item) => item.text === value.text);
  }
  if (ast.kind === 'cmp') {
    const left = evalScalar(ast.left, env);
    const right = evalScalar(ast.right, env);
    if (!left || !right) return false;
    if (ast.op === 'contains') return left.text.toLowerCase().includes(right.text.toLowerCase());
    if (ast.op === 'starts') return left.text.toLowerCase().startsWith(right.text.toLowerCase());
    const numbers = Number.isFinite(left.num) && Number.isFinite(right.num);
    if (ast.op === '=' || ast.op === '!=') {
      const same = numbers ? left.num === right.num : left.text === right.text;
      return ast.op === '=' ? same : !same;
    }
    if (!numbers) return false;
    if (ast.op === '>') return left.num > right.num;
    if (ast.op === '>=') return left.num >= right.num;
    if (ast.op === '<') return left.num < right.num;
    return left.num <= right.num;
  }
  return null;
}

function evalScalar(ast: RuleAst, env: RuleEnv): RuleScalar | null {
  if (ast.kind === 'num') return { num: ast.value, text: String(ast.value) };
  if (ast.kind === 'text') return { num: numericText(ast.value), text: ast.value };
  if (ast.kind === 'this') return env.self;
  if (ast.kind === 'field') return env.field(ast.key);
  if (ast.kind === 'neg') {
    const value = evalScalar(ast.value, env);
    if (!value || !Number.isFinite(value.num)) return null;
    return { num: -value.num, text: String(-value.num) };
  }
  if (ast.kind === 'bin') {
    const left = evalScalar(ast.left, env);
    const right = evalScalar(ast.right, env);
    if (!left || !right || !Number.isFinite(left.num) || !Number.isFinite(right.num)) return null;
    if (ast.op === '/' && right.num === 0) return null;
    const num = ast.op === '+' ? left.num + right.num : ast.op === '-' ? left.num - right.num : ast.op === '*' ? left.num * right.num : left.num / right.num;
    if (!Number.isFinite(num)) return null;
    return { num, text: String(num) };
  }
  return null;
}

function numericText(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
