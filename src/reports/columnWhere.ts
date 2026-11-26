import { parseDateFilter } from '../filter/dateFilter';
import { parseNumberFilter } from '../filter/numberFilter';

type Rec = Record<string, unknown>;

/** How one grid column filters on the report server: the server's field name and its kind. */
export interface ReportFilterField {
  field: string;
  kind: 'text' | 'number' | 'date';
}

/** Ops a report server takes (`buildColumnFilterClause`). `$ne` and `$notILike` are not among them. */
const REPORT_OPS = new Set(['$eq', '$gt', '$gte', '$lt', '$lte', '$between', '$iLike', '$in']);

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Text filter in the filter box syntax, as report conditions. Plain text contains, `= x` equals
 * (ignoring case), `^= x` starts with, `$= x` ends with, `in: a, b` is one of. Negations are not
 * something a report server takes, so they filter nothing.
 */
function textConditions(field: string, raw: string): Rec[] {
  const text = raw.trim();
  const lower = text.toLowerCase();
  if (lower.startsWith('!in:') || text.startsWith('!~') || text.startsWith('!=') || text.startsWith('<>')) return [];
  if (lower.startsWith('in:')) {
    const values = text.slice(3).split(',').map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? [{ [field]: { $in: values } }] : [];
  }
  const prefixed = (prefix: string, pattern: (value: string) => string): Rec[] | null => {
    if (!text.startsWith(prefix)) return null;
    const value = text.slice(prefix.length).trim();
    return value ? [{ [field]: { $iLike: pattern(escapeLike(value)) } }] : [];
  };
  return (
    prefixed('^=', (v) => `${v}%`) ??
    prefixed('$=', (v) => `%${v}`) ??
    prefixed('=', (v) => v) ?? [{ [field]: { $iLike: `%${escapeLike(text)}%` } }]
  );
}

/** One condition per op, since a report server reads a single op per condition. */
function splitOps(field: string, clause: Rec): Rec[] {
  return Object.entries(clause)
    .filter(([op]) => REPORT_OPS.has(op))
    .map(([op, value]) => ({ [field]: { [op]: value } }));
}

/**
 * Grid filter-row text as a report `where`: `{ $and: [{ field: { $op: value } }, ...] }`.
 * Columns without a field, empty boxes and half-typed comparisons are left out. Null when nothing applies.
 */
export function reportColumnWhere(filters: Readonly<Record<string, string>>, fields: Readonly<Record<string, ReportFilterField>>): Rec | null {
  const parts: Rec[] = [];
  for (const [columnId, raw] of Object.entries(filters)) {
    const spec = fields[columnId];
    if (!spec || !raw.trim()) continue;
    if (spec.kind === 'number') {
      const clause = parseNumberFilter(raw);
      if (clause && clause !== 'wait') parts.push(...splitOps(spec.field, clause));
    } else if (spec.kind === 'date') {
      const clause = parseDateFilter(raw);
      if (clause && clause !== 'wait') parts.push(...splitOps(spec.field, clause));
    } else {
      parts.push(...textConditions(spec.field, raw));
    }
  }
  return parts.length > 0 ? { $and: parts } : null;
}
