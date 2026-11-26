/**
 * The RDL2 expression language in the browser: the same grammar as the backend's
 * `report-designer/v2/expression.ts`, so the designer can check a formula while it is typed, show
 * where it goes wrong, and turn a condition into blocks and back. The backend still compiles and
 * checks every expression; this copy only gives earlier, friendlier answers. Change both together.
 */

export type ValueType = 'number' | 'text' | 'date' | 'boolean' | 'unknown';

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'null' }
  | { k: 'name'; v: string }
  | { k: 'param'; v: string }
  | { k: 'neg'; v: Ast }
  | { k: 'not'; v: Ast }
  | { k: 'bin'; op: string; l: Ast; r: Ast }
  | { k: 'between'; v: Ast; lo: Ast; hi: Ast; not: boolean }
  | { k: 'in'; v: Ast; items: Ast[] | Ast; not: boolean }
  | { k: 'isnull'; v: Ast; not: boolean; empty: boolean }
  | { k: 'text'; op: 'contains' | 'starts' | 'ends'; v: Ast; arg: Ast; not: boolean }
  | { k: 'call'; fn: string; args: Ast[] };

/** A problem in an expression, with where it is in the text when that is known. */
export class ExprError extends Error {
  constructor(
    message: string,
    readonly at: number,
    readonly length = 1,
  ) {
    super(message);
  }
}

type TokKind = 'num' | 'str' | 'name' | 'param' | 'op' | 'word' | '(' | ')' | ',' | 'end';
interface Tok {
  t: TokKind;
  v: string;
  n?: number;
  at: number;
  len: number;
}

const WORDS = new Set([
  'and',
  'or',
  'not',
  'between',
  'in',
  'is',
  'null',
  'empty',
  'true',
  'false',
  'contains',
  'starts',
  'ends',
  'like',
]);
const MAX_LENGTH = 2000;
const MAX_DEPTH = 40;
export const COMPARISONS = ['=', '!=', '>', '>=', '<', '<='] as const;

function tokenize(src: string): Tok[] {
  if (src.length > MAX_LENGTH)
    throw new ExprError(`A formula is at most ${MAX_LENGTH} characters`, MAX_LENGTH);
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      out.push({ t: c, v: c, at: i, len: 1 });
      i += 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let v = '';
      while (j < src.length) {
        if (src[j] === c && src[j + 1] === c) {
          v += c;
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        v += src[j];
        j += 1;
      }
      if (j >= src.length)
        throw new ExprError('This text is not closed with a quote', i, src.length - i);
      out.push({ t: 'str', v, at: i, len: j + 1 - i });
      i = j + 1;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ t: 'num', v: m[0], n: Number(m[0]), at: i, len: m[0].length });
      i += m[0].length;
      continue;
    }
    if (c === '@') {
      const m = /^@([A-Za-z_]\w*)/.exec(src.slice(i));
      if (!m) throw new ExprError('An input is written @name', i);
      out.push({ t: 'param', v: m[1]!, at: i, len: m[0].length });
      i += m[0].length;
      continue;
    }
    const op = /^(>=|<=|!=|<>|=|>|<|\+|-|\*|\/|%)/.exec(src.slice(i));
    if (op) {
      out.push({ t: 'op', v: op[0] === '<>' ? '!=' : op[0], at: i, len: op[0].length });
      i += op[0].length;
      continue;
    }
    const name = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*/.exec(src.slice(i));
    if (name) {
      const lower = name[0].toLowerCase();
      out.push({
        t: WORDS.has(lower) ? 'word' : 'name',
        v: WORDS.has(lower) ? lower : name[0],
        at: i,
        len: name[0].length,
      });
      i += name[0].length;
      continue;
    }
    throw new ExprError(`"${c}" cannot be used here`, i);
  }
  out.push({ t: 'end', v: '', at: src.length, len: 0 });
  return out;
}

class Parser {
  private at = 0;
  private depth = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.at]!;
  }
  private next(): Tok {
    return this.toks[this.at++]!;
  }
  private isWord(w: string): boolean {
    const t = this.peek();
    return t.t === 'word' && t.v === w;
  }
  private eatWord(w: string): boolean {
    if (!this.isWord(w)) return false;
    this.at += 1;
    return true;
  }
  private fail(message: string, tok = this.peek()): never {
    throw new ExprError(
      tok.t === 'end' ? `${message}, but the formula ends here` : message,
      tok.at,
      Math.max(1, tok.len),
    );
  }
  private expect(t: TokKind, what: string): void {
    if (this.peek().t !== t) this.fail(`Expected ${what}`);
    this.at += 1;
  }

  parse(): Ast {
    if (this.peek().t === 'end') this.fail('The formula is empty');
    const ast = this.or();
    if (this.peek().t !== 'end')
      this.fail('Unexpected text after the formula; is an "and", "or" or operator missing?');
    return ast;
  }

  private guard<T>(fn: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) this.fail('The formula is nested too deeply');
    try {
      return fn();
    } finally {
      this.depth -= 1;
    }
  }

  private or(): Ast {
    let l = this.and();
    while (this.eatWord('or')) l = { k: 'bin', op: 'or', l, r: this.and() };
    return l;
  }
  private and(): Ast {
    let l = this.not();
    while (this.eatWord('and')) l = { k: 'bin', op: 'and', l, r: this.not() };
    return l;
  }
  private not(): Ast {
    if (this.eatWord('not')) return this.guard(() => ({ k: 'not', v: this.not() }));
    return this.cmp();
  }
  private cmp(): Ast {
    const l = this.add();
    const t = this.peek();
    if (t.t === 'op' && (COMPARISONS as readonly string[]).includes(t.v)) {
      this.next();
      return { k: 'bin', op: t.v, l, r: this.add() };
    }
    const negated = this.isWord('not') && this.toks[this.at + 1]?.t === 'word';
    if (negated) this.next();
    if (this.eatWord('between')) {
      const lo = this.add();
      if (!this.eatWord('and')) this.fail('"between" needs "and" between its two values');
      return { k: 'between', v: l, lo, hi: this.add(), not: negated };
    }
    if (this.eatWord('in')) {
      if (this.peek().t === 'param') return { k: 'in', v: l, items: this.primary(), not: negated };
      // `x in under(@groups)`: the picked tree rows and every row under them.
      const next = this.peek();
      if (next.t === 'name' && next.v.toLowerCase() === 'under') {
        const call = this.primary();
        if (call.k !== 'call' || call.args.length !== 1 || call.args[0]?.k !== 'param')
          this.fail('under() takes one input, such as under(@groups)', next);
        return { k: 'in', v: l, items: call, not: negated };
      }
      this.expect('(', '"(" with the values after "in"');
      const items: Ast[] = [this.add()];
      while (this.peek().t === ',') {
        this.next();
        items.push(this.add());
      }
      this.expect(')', '")" after the values of "in"');
      return { k: 'in', v: l, items, not: negated };
    }
    for (const op of ['contains', 'starts', 'ends'] as const) {
      if (this.eatWord(op)) return { k: 'text', op, v: l, arg: this.add(), not: negated };
    }
    if (negated) this.fail('"not" here must come before between, in, contains, starts or ends');
    if (this.eatWord('is')) {
      const not = this.eatWord('not');
      if (this.eatWord('null')) return { k: 'isnull', v: l, not, empty: false };
      if (this.eatWord('empty')) return { k: 'isnull', v: l, not, empty: true };
      this.fail('"is" is followed by null or empty');
    }
    return l;
  }
  private add(): Ast {
    let l = this.mul();
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op' || (t.v !== '+' && t.v !== '-')) return l;
      this.next();
      l = { k: 'bin', op: t.v, l, r: this.mul() };
    }
  }
  private mul(): Ast {
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      if (t.t !== 'op' || (t.v !== '*' && t.v !== '/' && t.v !== '%')) return l;
      this.next();
      l = { k: 'bin', op: t.v, l, r: this.unary() };
    }
  }
  private unary(): Ast {
    const t = this.peek();
    if (t.t === 'op' && t.v === '-') {
      this.next();
      return this.guard(() => ({ k: 'neg', v: this.unary() }));
    }
    return this.primary();
  }
  private primary(): Ast {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.n! };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'param') return { k: 'param', v: t.v };
    if (t.t === 'word' && (t.v === 'true' || t.v === 'false'))
      return { k: 'bool', v: t.v === 'true' };
    if (t.t === 'word' && t.v === 'null') return { k: 'null' };
    if (t.t === '(') {
      const inner = this.guard(() => this.or());
      this.expect(')', 'a closing ")"');
      return inner;
    }
    if (t.t === 'name') {
      if (this.peek().t !== '(') return { k: 'name', v: t.v };
      this.next();
      const args: Ast[] = [];
      if (this.peek().t !== ')') {
        args.push(this.guard(() => this.or()));
        while (this.peek().t === ',') {
          this.next();
          args.push(this.guard(() => this.or()));
        }
      }
      this.expect(')', `")" to close ${t.v}(`);
      return { k: 'call', fn: t.v.toLowerCase(), args };
    }
    return this.fail('Expected a value, a column, an input or "("', t);
  }
}

/** Parse an expression; throws `ExprError` with the position of the problem. */
export function parseExpr(src: string): Ast {
  return new Parser(tokenize(src)).parse();
}

// ---------------------------------------------------------------------------- functions

export type FunctionGroup = 'Logic' | 'Numbers' | 'Text' | 'Dates';

export interface FunctionDoc {
  /** As written in formulas; matched without case. */
  name: string;
  args: string[];
  min: number;
  max: number;
  /** What it gives; `arg` takes the type of its first value argument (if: its second). */
  returns: ValueType | 'arg';
  group: FunctionGroup;
  help: string;
}

/** The backend's fixed function list, with what the designer tells about each one. */
export const FUNCTIONS: readonly FunctionDoc[] = [
  {
    name: 'if',
    args: ['condition', 'then', 'else'],
    min: 2,
    max: 3,
    returns: 'arg',
    group: 'Logic',
    help: 'One value when the condition holds, another when not.',
  },
  {
    name: 'coalesce',
    args: ['value', 'fallback'],
    min: 1,
    max: 8,
    returns: 'arg',
    group: 'Logic',
    help: 'The first value that is not empty.',
  },
  {
    name: 'nullif',
    args: ['value', 'emptyWhen'],
    min: 2,
    max: 2,
    returns: 'arg',
    group: 'Logic',
    help: 'Empty when the value equals the second one.',
  },
  {
    name: 'abs',
    args: ['number'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Numbers',
    help: 'The number without its sign.',
  },
  {
    name: 'round',
    args: ['number', 'places'],
    min: 1,
    max: 2,
    returns: 'number',
    group: 'Numbers',
    help: 'Rounded to the places (default 0).',
  },
  {
    name: 'floor',
    args: ['number'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Numbers',
    help: 'Rounded down.',
  },
  {
    name: 'ceil',
    args: ['number'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Numbers',
    help: 'Rounded up.',
  },
  {
    name: 'greatest',
    args: ['a', 'b'],
    min: 2,
    max: 8,
    returns: 'arg',
    group: 'Numbers',
    help: 'The largest of the values.',
  },
  {
    name: 'least',
    args: ['a', 'b'],
    min: 2,
    max: 8,
    returns: 'arg',
    group: 'Numbers',
    help: 'The smallest of the values.',
  },
  {
    name: 'number',
    args: ['value'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Numbers',
    help: 'Text read as a number.',
  },
  {
    name: 'concat',
    args: ['a', 'b'],
    min: 1,
    max: 12,
    returns: 'text',
    group: 'Text',
    help: 'Values joined into one text.',
  },
  {
    name: 'lower',
    args: ['text'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Text',
    help: 'In small letters.',
  },
  {
    name: 'upper',
    args: ['text'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Text',
    help: 'In capital letters.',
  },
  {
    name: 'trim',
    args: ['text'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Text',
    help: 'Without spaces at either end.',
  },
  {
    name: 'length',
    args: ['text'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Text',
    help: 'How many characters.',
  },
  {
    name: 'left',
    args: ['text', 'count'],
    min: 2,
    max: 2,
    returns: 'text',
    group: 'Text',
    help: 'The first characters.',
  },
  {
    name: 'right',
    args: ['text', 'count'],
    min: 2,
    max: 2,
    returns: 'text',
    group: 'Text',
    help: 'The last characters.',
  },
  {
    name: 'text',
    args: ['value'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Text',
    help: 'Any value as text.',
  },
  {
    name: 'picked',
    args: ['input'],
    min: 1,
    max: 1,
    returns: 'boolean',
    group: 'Logic',
    help: 'Whether an input has a value: picked(@accounts). An empty pick otherwise means "all".',
  },
  {
    name: 'under',
    args: ['input'],
    min: 1,
    max: 1,
    returns: 'boolean',
    group: 'Logic',
    help: 'After "in" only: groupId in under(@groups) keeps the picked tree rows (account groups, categories) and every row under them.',
  },
  {
    name: 'tryNumber',
    args: ['text'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Numbers',
    help: 'A number from text that may not be one, such as a free-text target; empty when it is not.',
  },
  {
    name: 'daysBetween',
    args: ['from', 'to'],
    min: 2,
    max: 2,
    returns: 'number',
    group: 'Dates',
    help: 'Days from the first date to the second.',
  },
  {
    name: 'addDays',
    args: ['date', 'days'],
    min: 2,
    max: 2,
    returns: 'date',
    group: 'Dates',
    help: 'The date some days later (or earlier with a minus).',
  },
  {
    name: 'today',
    args: [],
    min: 0,
    max: 0,
    returns: 'date',
    group: 'Dates',
    help: "Today's date.",
  },
  {
    name: 'date',
    args: ['value'],
    min: 1,
    max: 1,
    returns: 'date',
    group: 'Dates',
    help: 'The date part of a value.',
  },
  {
    name: 'year',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Dates',
    help: 'The year: 2026.',
  },
  {
    name: 'month',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Dates',
    help: 'The month: 1 to 12.',
  },
  {
    name: 'day',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Dates',
    help: 'The day of the month.',
  },
  {
    name: 'weekday',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'number',
    group: 'Dates',
    help: '1 for Monday to 7 for Sunday.',
  },
  {
    name: 'monthStart',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'date',
    group: 'Dates',
    help: 'The first day of its month.',
  },
  {
    name: 'monthName',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Dates',
    help: 'Month and year: Apr 2026.',
  },
  {
    name: 'fyStart',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'date',
    group: 'Dates',
    help: 'First day (1 April) of its financial year.',
  },
  {
    name: 'fy',
    args: ['date'],
    min: 1,
    max: 1,
    returns: 'text',
    group: 'Dates',
    help: 'Its financial year: 2026-27.',
  },
];

const FUNCTION_BY_KEY = new Map(FUNCTIONS.map((fn) => [fn.name.toLowerCase(), fn]));

export function functionDoc(name: string): FunctionDoc | undefined {
  return FUNCTION_BY_KEY.get(name.toLowerCase());
}

/** `daysBetween(from, to)`: how a function is written, for menus and help. */
export function functionSignature(fn: FunctionDoc): string {
  return `${fn.name}(${fn.args.map((arg, index) => (index >= fn.min ? `${arg}?` : arg)).join(', ')}${fn.max > fn.args.length ? ', …' : ''})`;
}

// ---------------------------------------------------------------------------- printing

const PREC: Record<string, number> = {
  or: 1,
  and: 2,
  '=': 4,
  '!=': 4,
  '>': 4,
  '>=': 4,
  '<': 4,
  '<=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

export function quoteText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function printAt(ast: Ast, outer: number): string {
  const wrap = (prec: number, text: string) => (prec < outer ? `(${text})` : text);
  switch (ast.k) {
    case 'num':
      return String(ast.v);
    case 'str':
      return quoteText(ast.v);
    case 'bool':
      return ast.v ? 'true' : 'false';
    case 'null':
      return 'null';
    case 'name':
      return ast.v;
    case 'param':
      return `@${ast.v}`;
    case 'neg':
      return wrap(7, `-${printAt(ast.v, 7)}`);
    case 'not':
      return wrap(3, `not ${printAt(ast.v, 3)}`);
    case 'bin': {
      const prec = PREC[ast.op] ?? 4;
      // Comparisons do not chain, and the right side of - / % is not associative: wrap one level tighter.
      const left = printAt(ast.l, prec === 4 ? 5 : prec);
      const right = printAt(ast.r, prec + 1);
      return wrap(prec, `${left} ${ast.op} ${right}`);
    }
    case 'between':
      return wrap(
        4,
        `${printAt(ast.v, 5)} ${ast.not ? 'not ' : ''}between ${printAt(ast.lo, 5)} and ${printAt(ast.hi, 5)}`,
      );
    case 'in': {
      const items = Array.isArray(ast.items)
        ? `(${ast.items.map((item) => printAt(item, 5)).join(', ')})`
        : printAt(ast.items, 8);
      return wrap(4, `${printAt(ast.v, 5)} ${ast.not ? 'not ' : ''}in ${items}`);
    }
    case 'isnull':
      return wrap(
        4,
        `${printAt(ast.v, 5)} is ${ast.not ? 'not ' : ''}${ast.empty ? 'empty' : 'null'}`,
      );
    case 'text':
      return wrap(
        4,
        `${printAt(ast.v, 5)} ${ast.not ? 'not ' : ''}${ast.op} ${printAt(ast.arg, 5)}`,
      );
    case 'call':
      return `${functionDoc(ast.fn)?.name ?? ast.fn}(${ast.args.map((arg) => printAt(arg, 0)).join(', ')})`;
  }
}

/** An expression as text, with only the brackets it needs. */
export function printExpr(ast: Ast): string {
  return printAt(ast, 0);
}

/**
 * An expression as text inside an operator of the given precedence (or 1, and 2, not 3,
 * comparison 4), bracketed when it binds more loosely.
 */
export function printExprIn(ast: Ast, outer: number): string {
  return printAt(ast, outer);
}

// ---------------------------------------------------------------------------- checking

/** What a formula may name where it is used. */
export interface ExprScope {
  /** Whether a column (or catalog path) can be read here. */
  hasName: (name: string) => boolean;
  /** Input ids (without @). */
  params: readonly string[];
  /** Function names the server offers; missing means every documented one. */
  functions?: readonly string[];
  /** Column names to suggest when a name is unknown. */
  suggest?: readonly string[];
}

export type ExprCheck =
  | { ok: true; ast: Ast }
  | { ok: false; message: string; at: number; length: number };

function names(ast: Ast, out: Ast[] = []): Ast[] {
  switch (ast.k) {
    case 'name':
    case 'param':
    case 'call':
      out.push(ast);
      if (ast.k === 'call') ast.args.forEach((arg) => names(arg, out));
      break;
    case 'neg':
    case 'not':
      names(ast.v, out);
      break;
    case 'bin':
      names(ast.l, out);
      names(ast.r, out);
      break;
    case 'between':
      [ast.v, ast.lo, ast.hi].forEach((item) => names(item, out));
      break;
    case 'in':
      names(ast.v, out);
      (Array.isArray(ast.items) ? ast.items : [ast.items]).forEach((item) => names(item, out));
      break;
    case 'isnull':
      names(ast.v, out);
      break;
    case 'text':
      names(ast.v, out);
      names(ast.arg, out);
      break;
    default:
      break;
  }
  return out;
}

/** Edits (insert, delete, change a letter) from one word to another. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** The known name a mistyped one most likely meant, for "did you mean"; null when none is close. */
function closest(name: string, choices: readonly string[]): string | null {
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const choice of choices) {
    const other = choice.toLowerCase();
    // Same word in other case, or one inside the other (amount / totalAmount), counts as near.
    const score =
      other === lower
        ? 0
        : other.includes(lower) || lower.includes(other)
          ? 1
          : editDistance(lower, other);
    if (score < bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return best !== null && bestScore <= Math.max(1, Math.floor(name.length / 3)) ? best : null;
}

/** Locate a name in the text, for pointing at it. */
function locate(src: string, token: string): { at: number; length: number } {
  const match = new RegExp(
    `(^|[^\\w.@])(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w.])`,
  ).exec(src);
  if (!match) return { at: 0, length: src.length };
  return { at: match.index + match[1]!.length, length: token.length };
}

/** Parse and check an expression against what it may name. */
export function checkExpr(src: string, scope: ExprScope): ExprCheck {
  let ast: Ast;
  try {
    ast = parseExpr(src);
  } catch (error) {
    if (error instanceof ExprError)
      return { ok: false, message: error.message, at: error.at, length: error.length };
    throw error;
  }
  const offered = scope.functions?.length
    ? new Set(scope.functions.map((name) => name.toLowerCase()))
    : null;
  for (const node of names(ast)) {
    if (node.k === 'name' && !scope.hasName(node.v)) {
      const hint = scope.suggest ? closest(node.v, scope.suggest) : null;
      return {
        ok: false,
        message: `There is no column "${node.v}" here${hint ? `; did you mean ${hint}?` : ''}`,
        ...locate(src, node.v),
      };
    }
    if (node.k === 'param' && !scope.params.includes(node.v)) {
      return {
        ok: false,
        message: `There is no input @${node.v}${scope.params.length ? ` (inputs: ${scope.params.map((id) => `@${id}`).join(', ')})` : ''}`,
        ...locate(src, `@${node.v}`),
      };
    }
    if (node.k === 'call') {
      const doc = functionDoc(node.fn);
      if (!doc || (offered && !offered.has(node.fn)))
        return { ok: false, message: `There is no function ${node.fn}()`, ...locate(src, node.fn) };
      if (node.args.length < doc.min || node.args.length > doc.max) {
        const count =
          doc.min === doc.max
            ? `${doc.min}`
            : doc.max - doc.min > 4
              ? `at least ${doc.min}`
              : `${doc.min} to ${doc.max}`;
        return {
          ok: false,
          message: `${functionSignature(doc)} takes ${count} value${doc.max === 1 ? '' : 's'}`,
          ...locate(src, doc.name),
        };
      }
    }
  }
  const textArg = findTextArg(ast);
  if (textArg)
    return {
      ok: false,
      message: `"${textArg}" takes a text in quotes or an input`,
      ...locate(src, textArg),
    };
  return { ok: true, ast };
}

function findTextArg(ast: Ast): string | null {
  if (ast.k === 'text' && ast.arg.k !== 'str' && ast.arg.k !== 'param') return ast.op;
  const kids: Ast[] =
    ast.k === 'bin'
      ? [ast.l, ast.r]
      : ast.k === 'not' || ast.k === 'neg' || ast.k === 'isnull'
        ? [ast.v]
        : ast.k === 'call'
          ? ast.args
          : ast.k === 'between'
            ? [ast.v, ast.lo, ast.hi]
            : ast.k === 'text'
              ? [ast.v]
              : [];
  for (const kid of kids) {
    const found = findTextArg(kid);
    if (found) return found;
  }
  return null;
}

/** Every column name an expression reads. */
export function exprNames(src: string): string[] {
  try {
    return [
      ...new Set(names(parseExpr(src)).flatMap((node) => (node.k === 'name' ? [node.v] : []))),
    ];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------- types

/** The type an expression gives, from the types of the columns it reads. Unknown when unsure. */
export function exprType(ast: Ast, typeOf: (name: string) => ValueType): ValueType {
  switch (ast.k) {
    case 'num':
      return 'number';
    case 'str':
      return 'text';
    case 'bool':
      return 'boolean';
    case 'null':
    case 'param':
      return 'unknown';
    case 'name':
      return typeOf(ast.v);
    case 'neg':
      return 'number';
    case 'not':
    case 'between':
    case 'in':
    case 'isnull':
    case 'text':
      return 'boolean';
    case 'bin': {
      if (
        ast.op === 'and' ||
        ast.op === 'or' ||
        (COMPARISONS as readonly string[]).includes(ast.op)
      )
        return 'boolean';
      // A date plus or minus days stays a date.
      const left = exprType(ast.l, typeOf);
      if (
        (ast.op === '+' || ast.op === '-') &&
        left === 'date' &&
        exprType(ast.r, typeOf) !== 'date'
      )
        return 'date';
      return 'number';
    }
    case 'call': {
      const doc = functionDoc(ast.fn);
      if (!doc) return 'unknown';
      if (doc.returns !== 'arg') return doc.returns;
      const values = ast.fn === 'if' ? ast.args.slice(1) : ast.args;
      for (const value of values) {
        const type = exprType(value, typeOf);
        if (type !== 'unknown') return type;
      }
      return 'unknown';
    }
  }
}

/** The type of an expression's text; unknown when it does not parse. */
export function exprTextType(src: string, typeOf: (name: string) => ValueType): ValueType {
  try {
    return exprType(parseExpr(src), typeOf);
  } catch {
    return 'unknown';
  }
}

/** A plain column name: the expression is just `amount`. */
export function isPlainName(src: string): boolean {
  return /^\s*[A-Za-z_]\w*(\.[A-Za-z_]\w*)*\s*$/.test(src) && !WORDS.has(src.trim().toLowerCase());
}

export const NAME = /^[A-Za-z_]\w*$/;

// ---------------------------------------------------------------------------- inputs in text

/** Where `@id` inputs sit in an expression; empty when it does not tokenize. */
function paramTokens(src: string): Tok[] {
  try {
    return tokenize(src).filter((tok) => tok.t === 'param');
  } catch {
    return [];
  }
}

/** Whether an expression reads the input `@id` (text in quotes does not count). */
export function readsParam(src: string, id: string): boolean {
  return paramTokens(src).some((tok) => tok.v === id);
}

/** The expression with input `@from` renamed `@to`; text in quotes is left alone. */
export function renameParamIn(src: string, from: string, to: string): string {
  let out = '';
  let at = 0;
  for (const tok of paramTokens(src)) {
    if (tok.v !== from) continue;
    out += `${src.slice(at, tok.at)}@${to}`;
    at = tok.at + tok.len;
  }
  return out + src.slice(at);
}
