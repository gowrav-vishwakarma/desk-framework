/** A Sequelize comparison for one numeric column. `$between` is `[low, high]`. */
export type NumberFilterClause = Record<string, number | [number, number]>;

const OPS: Record<string, string> = {
  '>': '$gt',
  '>=': '$gte',
  '<': '$lt',
  '<=': '$lte',
  '=<': '$lte',
  '=': '$eq',
  '!=': '$ne',
  '<>': '$ne',
};

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const COMPARE = new RegExp(`(>=|<=|=<|!=|<>|>|<|=)\\s*(${NUMBER})?`, 'y');
const BARE = new RegExp(`^${NUMBER}$`);
const BETWEEN = new RegExp(`^(${NUMBER})\\s*\\.\\.\\s*(${NUMBER})$`);

/**
 * Turn a number-column filter into a where clause.
 * `null` is an empty box. `'wait'` is typed but not a finished comparison, so the list must not query yet.
 */
export function parseNumberFilter(raw: string): NumberFilterClause | 'wait' | null {
  const text = raw.replace(/₹/g, '').replace(/,/g, '').trim();
  if (!text) return null;
  if (text.includes('..')) {
    const match = BETWEEN.exec(text);
    if (!match?.[1] || !match[2]) return 'wait';
    const left = Number(match[1]);
    const right = Number(match[2]);
    return { $between: [Math.min(left, right), Math.max(left, right)] };
  }
  if (BARE.test(text)) return { $eq: Number(text) };

  const clause: Record<string, number> = {};
  let count = 0;
  let cursor = 0;
  COMPARE.lastIndex = cursor;
  while (cursor < text.length) {
    const gap = text.slice(cursor).match(/^\s*/)?.[0].length ?? 0;
    cursor += gap;
    if (cursor >= text.length) break;
    COMPARE.lastIndex = cursor;
    const match = COMPARE.exec(text);
    if (!match || match.index !== cursor) return 'wait';
    if (match[2] === undefined) return 'wait';
    const op = OPS[match[1] ?? ''];
    if (!op) return 'wait';
    count += 1;
    if (count > 2) return 'wait';
    clause[op] = Number(match[2]);
    cursor = COMPARE.lastIndex;
  }
  if (count === 0) return 'wait';
  return clause;
}
